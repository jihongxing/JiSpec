import { DistributedScheduler, type DistributedTask, type ResourceRequirements, type SchedulingStrategy, type TaskPriority, type WorkerInfo } from "./distributed-scheduler";
import { WorkerManager, type TaskExecutor, type WorkerConfig, type WorkerTransport } from "./worker-manager";
import { FilesystemStorage } from "./filesystem-storage";
import { DistributedTaskCache } from "./distributed-task-cache";
import { RemoteExecutionClient, RemoteExecutionServer, WorkerHttpServer, RemoteExecutor, type WorkerRegistrationPayload } from "./remote-executor";
import { ResourceManager, type ManagedResourceAllocation, type ManagedResourceStatus } from "./resource-manager";
import { FaultRecoveryManager, type FailureType } from "./fault-recovery";

export interface RemoteDistributedRuntimeOptions {
  root?: string;
  strategy?: SchedulingStrategy;
  schedulingIntervalMs?: number;
  enableCache?: boolean;
  masterPort?: number;
  enableResourceManagement?: boolean;
  enableFaultRecovery?: boolean;
}

export interface RemoteWorkerHandle {
  workerId: string;
  worker: WorkerManager;
  server: WorkerHttpServer;
  port: number;
  stop(): Promise<void>;
}

export interface SubmitRemoteTaskInput {
  sliceId: string;
  stageId: string;
  payload: any;
  requirements: ResourceRequirements;
  priority?: TaskPriority;
  maxRetries?: number;
}

export class RemoteDistributedRuntime {
  private readonly scheduler: DistributedScheduler;
  private readonly taskCompletion = new Map<string, { resolve: (task: DistributedTask) => void; reject: (error: Error) => void }>();
  private readonly workers = new Map<string, RemoteWorkerHandle>();
  private readonly resourceManagers = new Map<string, ResourceManager>();
  private readonly taskAllocations = new Map<string, ManagedResourceAllocation>();
  private readonly cache: DistributedTaskCache;
  private readonly enableCache: boolean;
  private readonly enableResourceManagement: boolean;
  private readonly enableFaultRecovery: boolean;
  private readonly faultRecovery: FaultRecoveryManager;
  private readonly server: RemoteExecutionServer;
  private masterPort: number | null = null;
  private readonly remoteExecutor: RemoteExecutor;
  private waitersBound = false;

  constructor(private readonly options: RemoteDistributedRuntimeOptions = {}) {
    this.scheduler = new DistributedScheduler(options.strategy ?? "least_loaded");
    this.cache = new DistributedTaskCache(
      new FilesystemStorage(options.root ?? process.cwd()),
      options.root ?? process.cwd()
    );
    this.enableCache = options.enableCache ?? true;
    this.enableResourceManagement = options.enableResourceManagement ?? true;
    this.enableFaultRecovery = options.enableFaultRecovery ?? true;
    this.faultRecovery = new FaultRecoveryManager(options.root ?? process.cwd());
    this.server = new RemoteExecutionServer();
    this.remoteExecutor = new RemoteExecutor(
      new RemoteExecutionClient(`http://127.0.0.1:${options.masterPort ?? 0}`)
    );
    this.bindSchedulerHandlers();
    this.bindServerHandlers();
  }

  async start(): Promise<number> {
    const port = await this.server.start(this.options.masterPort ?? 0);
    this.masterPort = port;
    this.scheduler.start();
    return port;
  }

  async stop(): Promise<void> {
    for (const worker of this.workers.values()) {
      await worker.stop();
    }
    this.workers.clear();
    this.resourceManagers.clear();
    this.taskAllocations.clear();
    this.scheduler.stop();
    await this.server.stop();
    this.masterPort = null;
  }

  async addRemoteWorker(config: WorkerConfig, executor: TaskExecutor): Promise<RemoteWorkerHandle> {
    if (this.masterPort === null) {
      throw new Error("Remote runtime must be started before adding workers");
    }
    if (this.workers.has(config.id)) {
      throw new Error(`Remote worker ${config.id} already exists`);
    }

    const workerServer = new WorkerHttpServer();
    const transport = this.createWorkerTransport();
    const worker = new WorkerManager(
      {
        ...config,
        masterHost: "127.0.0.1",
        masterPort: this.masterPort,
        autoRegister: false,
      },
      executor,
      transport
    );

    workerServer.on("task:assigned", async (task) => {
      await worker.executeTask(task);
    });

    workerServer.on("task:cancelled", async (taskId) => {
      await worker.cancelTask(taskId);
    });

    const port = await workerServer.start(0);
    await worker.start();

    const registrationPayload: WorkerRegistrationPayload = {
      id: config.id,
      host: "127.0.0.1",
      port,
      capabilities: {
        maxCpu: config.capabilities?.maxCpu ?? worker.getInfo().capabilities.maxCpu,
        maxMemory: config.capabilities?.maxMemory ?? worker.getInfo().capabilities.maxMemory,
        maxDisk: config.capabilities?.maxDisk ?? worker.getInfo().capabilities.maxDisk,
      },
      currentLoad: { cpu: 0, memory: 0, disk: 0 },
    };

    this.resourceManagers.set(
      config.id,
      new ResourceManager({
        cpu: registrationPayload.capabilities.maxCpu,
        memory: registrationPayload.capabilities.maxMemory,
        disk: registrationPayload.capabilities.maxDisk,
      })
    );

    await this.serverRegisterWorker(registrationPayload);

    const handle: RemoteWorkerHandle = {
      workerId: config.id,
      worker,
      server: workerServer,
      port,
      stop: async () => {
        await this.serverUnregisterWorker(config.id);
        await worker.stop();
        await workerServer.stop();
      },
    };

    this.workers.set(config.id, handle);
    return handle;
  }

  submitTask(input: SubmitRemoteTaskInput): string {
    const payload = this.enableCache
      ? {
          ...input.payload,
          __distributedCache: {
            enabled: true,
          },
        }
      : input.payload;

    const taskId = this.scheduler.submitTask(
      input.sliceId,
      input.stageId,
      payload,
      input.requirements,
      input.priority ?? "normal",
      { maxRetries: input.maxRetries }
    );

    this.scheduler.scheduleNow();
    return taskId;
  }

  async runTask(input: SubmitRemoteTaskInput): Promise<DistributedTask> {
    const taskId = this.submitTask(input);
    return this.waitForTask(taskId);
  }

  async waitForTask(taskId: string, timeoutMs = 30000): Promise<DistributedTask> {
    const existing = this.scheduler.getTask(taskId);
    if (existing?.status === "completed") {
      return existing;
    }
    if (existing?.status === "failed" || existing?.status === "cancelled") {
      throw new Error(existing.error ?? `Task ${taskId} did not complete successfully`);
    }

    return new Promise<DistributedTask>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.taskCompletion.delete(taskId);
        reject(new Error(`Timed out waiting for task ${taskId}`));
      }, timeoutMs);

      this.taskCompletion.set(taskId, {
        resolve: (task) => {
          clearTimeout(timeout);
          resolve(task);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });
  }

  getScheduler(): DistributedScheduler {
    return this.scheduler;
  }

  getMasterPort(): number | null {
    return this.masterPort;
  }

  getCacheStats() {
    return this.cache.getStats();
  }

  getFaultRecoveryManager(): FaultRecoveryManager {
    return this.faultRecovery;
  }

  getWorkerResourceStatus(workerId: string): ManagedResourceStatus | undefined {
    return this.resourceManagers.get(workerId)?.getStatus();
  }

  getWorkerResourceAllocations(workerId: string): ManagedResourceAllocation[] {
    return this.resourceManagers.get(workerId)?.getOwnerAllocations(workerId) ?? [];
  }

  private bindSchedulerHandlers(): void {
    this.scheduler.on("task:assigned", async ({ task, worker }: { task: DistributedTask; worker: WorkerInfo }) => {
      try {
        if (this.enableCache) {
          const cached = await this.cache.get<unknown>({ task, workerId: worker.id });
          if (cached) {
            const cachedValue =
              cached.value !== null && typeof cached.value === "object"
                ? {
                    ...(cached.value as Record<string, unknown>),
                    __cache: {
                      hit: true,
                      key: cached.cacheKey,
                    },
                  }
                : {
                    value: cached.value,
                    __cache: {
                      hit: true,
                      key: cached.cacheKey,
                    },
                  };

            task.result = cachedValue;
            this.scheduler.taskCompleted(task.id, cachedValue);
            return;
          }
        }

        const workerHandle = this.workers.get(worker.id);
        if (!workerHandle) {
          await this.handleTaskFailure(task, worker.id, new Error(`Remote worker ${worker.id} not found`));
          return;
        }

        if (this.enableFaultRecovery) {
          this.faultRecovery.createCheckpoint(task.id, {
            workerId: worker.id,
            resourceRequirements: { ...task.resourceRequirements },
            payload: task.payload,
          });
        }

        this.allocateTaskResources(worker.id, task);
        const workerClient = new RemoteExecutionClient(`http://127.0.0.1:${workerHandle.port}`);
        const remoteExecutor = new RemoteExecutor(workerClient);
        await remoteExecutor.executeRemote(worker.id, task);
      } catch (error) {
        this.releaseTaskAllocation(task.id);
        await this.handleTaskFailure(task, worker.id, error);
      }
    });

    if (!this.waitersBound) {
      this.waitersBound = true;

      this.scheduler.on("task:completed", (task: DistributedTask) => {
        const deferred = this.taskCompletion.get(task.id);
        if (deferred) {
          this.taskCompletion.delete(task.id);
          deferred.resolve(task);
        }
      });

      this.scheduler.on("task:failed", (task: DistributedTask) => {
        const deferred = this.taskCompletion.get(task.id);
        if (deferred) {
          this.taskCompletion.delete(task.id);
          deferred.reject(new Error(task.error ?? `Task ${task.id} failed`));
        }
      });

      this.scheduler.on("task:retry", () => {
        this.scheduler.scheduleNow();
      });
    }
  }

  private bindServerHandlers(): void {
    this.server.on("worker:register", async (worker) => {
      this.scheduler.registerWorker(worker);
      this.scheduler.scheduleNow();
    });

    this.server.on("worker:unregister", async (workerId) => {
      this.releaseWorkerResources(workerId);
      this.scheduler.unregisterWorker(workerId);
    });

    this.server.on("heartbeat", async (workerId, load) => {
      this.scheduler.workerHeartbeat(workerId, load);
    });

    this.server.on("task:completed", async (taskId, result) => {
      if (this.enableCache) {
        const completedTask = this.scheduler.getTask(taskId);
        if (completedTask) {
          await this.cache.put(
            { task: completedTask, workerId: completedTask.workerId },
            result,
            completedTask.startedAt
              ? Date.now() - completedTask.startedAt.getTime()
              : undefined
          );
        }
      }

      this.releaseTaskAllocation(taskId);
      this.scheduler.taskCompleted(taskId, result);
      this.scheduler.scheduleNow();
    });

    this.server.on("task:failed", async (taskId, error) => {
      this.releaseTaskAllocation(taskId);
      const task = this.scheduler.getTask(taskId);
      if (task) {
        await this.handleTaskFailure(task, task.workerId, error);
        return;
      }
      this.scheduler.taskFailed(taskId, error);
      this.scheduler.scheduleNow();
    });
  }

  private createWorkerTransport(): WorkerTransport {
    return {
      registerWorker: async () => {
        // Registration is managed explicitly after the worker server has a concrete port.
      },
      unregisterWorker: async (workerId) => {
        await this.serverUnregisterWorker(workerId);
      },
      sendHeartbeat: async (workerId, load) => {
        await new RemoteExecutionClient(`http://127.0.0.1:${this.masterPort}`).sendHeartbeat(workerId, load);
      },
      reportTaskCompleted: async (taskId, result) => {
        await new RemoteExecutionClient(`http://127.0.0.1:${this.masterPort}`).reportTaskCompleted(taskId, result);
      },
      reportTaskFailed: async (taskId, error) => {
        await new RemoteExecutionClient(`http://127.0.0.1:${this.masterPort}`).reportTaskFailed(taskId, error);
      },
    };
  }

  private async serverRegisterWorker(worker: WorkerRegistrationPayload): Promise<void> {
    this.scheduler.registerWorker(worker);
    this.scheduler.scheduleNow();
  }

  private async serverUnregisterWorker(workerId: string): Promise<void> {
    this.releaseWorkerResources(workerId);
    this.scheduler.unregisterWorker(workerId);
  }

  private allocateTaskResources(workerId: string, task: DistributedTask): void {
    if (!this.enableResourceManagement) {
      return;
    }

    if (this.taskAllocations.has(task.id)) {
      return;
    }

    const manager = this.resourceManagers.get(workerId);
    if (!manager) {
      throw new Error(`Resource manager for worker ${workerId} not found`);
    }

    const allocation = manager.allocateResources(workerId, task.id, task.resourceRequirements);
    this.taskAllocations.set(task.id, allocation);
  }

  private releaseTaskAllocation(taskId: string): void {
    const allocation = this.taskAllocations.get(taskId);
    if (!allocation) {
      return;
    }

    const manager = this.resourceManagers.get(allocation.ownerId);
    manager?.releaseResources(allocation.id);
    this.taskAllocations.delete(taskId);
  }

  private releaseWorkerResources(workerId: string): void {
    const manager = this.resourceManagers.get(workerId);
    manager?.releaseOwnerResources(workerId);

    for (const [taskId, allocation] of this.taskAllocations.entries()) {
      if (allocation.ownerId === workerId) {
        this.taskAllocations.delete(taskId);
      }
    }
  }

  private async handleTaskFailure(task: DistributedTask, workerId: string | undefined, error: unknown): Promise<void> {
    const type = this.classifyFailureType(error);
    const message = error instanceof Error ? error.message : String(error);

    if (!this.enableFaultRecovery) {
      this.scheduler.taskFailed(task.id, message);
      this.scheduler.scheduleNow();
      return;
    }

    const failure = this.faultRecovery.recordFailure({
      task,
      type,
      error,
      workerId,
    });

    const action = await this.faultRecovery.recoverTask(task, failure);

    if (action.strategy === "skip") {
      this.scheduler.taskFailed(task.id, message);
      this.scheduler.scheduleNow();
      return;
    }

    await this.faultRecovery.waitBeforeRetry();
    this.scheduler.taskFailed(task.id, message);
    this.scheduler.scheduleNow();
  }

  private classifyFailureType(error: unknown): FailureType {
    const message = error instanceof Error ? error.message : String(error);

    if (/timeout/i.test(message)) {
      return "task_timeout";
    }
    if (/insufficient resources/i.test(message)) {
      return "resource_exhausted";
    }
    if (/offline|not found|fetch failed|econnrefused|socket/i.test(message)) {
      return "network_error";
    }
    return "task_error";
  }
}
