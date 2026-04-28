import { DistributedScheduler, type DistributedTask, type ResourceRequirements, type SchedulingStrategy, type TaskPriority, type WorkerInfo } from "./distributed-scheduler";
import { WorkerManager, type TaskExecutor, type WorkerConfig, type WorkerTransport } from "./worker-manager";
import { FilesystemStorage } from "./filesystem-storage";
import { DistributedTaskCache } from "./distributed-task-cache";
import { ResourceManager, type ManagedResourceAllocation, type ManagedResourceStatus } from "./resource-manager";
import { FaultRecoveryManager, type FailureType } from "./fault-recovery";

export interface LocalDistributedRuntimeOptions {
  root?: string;
  strategy?: SchedulingStrategy;
  schedulingIntervalMs?: number;
  enableCache?: boolean;
  enableResourceManagement?: boolean;
  enableFaultRecovery?: boolean;
}

export interface SubmitDistributedTaskInput {
  sliceId: string;
  stageId: string;
  payload: any;
  requirements: ResourceRequirements;
  priority?: TaskPriority;
  maxRetries?: number;
}

/**
 * In-process master/worker bridge used to validate distributed scheduling
 * without introducing a network dependency in the local runtime.
 */
export class LocalDistributedRuntime {
  private readonly scheduler: DistributedScheduler;
  private readonly workers = new Map<string, WorkerManager>();
  private readonly resourceManagers = new Map<string, ResourceManager>();
  private readonly taskAllocations = new Map<string, ManagedResourceAllocation>();
  private readonly taskCompletion = new Map<string, { resolve: (task: DistributedTask) => void; reject: (error: Error) => void }>();
  private readonly schedulingIntervalMs: number;
  private readonly cache: DistributedTaskCache;
  private readonly enableCache: boolean;
  private readonly enableResourceManagement: boolean;
  private readonly enableFaultRecovery: boolean;
  private readonly faultRecovery: FaultRecoveryManager;
  private waitersBound = false;

  constructor(options: LocalDistributedRuntimeOptions = {}) {
    this.scheduler = new DistributedScheduler(options.strategy ?? "least_loaded");
    this.schedulingIntervalMs = options.schedulingIntervalMs ?? 10;
    this.cache = new DistributedTaskCache(
      new FilesystemStorage(options.root ?? process.cwd()),
      options.root ?? process.cwd()
    );
    this.enableCache = options.enableCache ?? true;
    this.enableResourceManagement = options.enableResourceManagement ?? true;
    this.enableFaultRecovery = options.enableFaultRecovery ?? true;
    this.faultRecovery = new FaultRecoveryManager(options.root ?? process.cwd());
    this.bindSchedulerHandlers();
  }

  async start(): Promise<void> {
    this.scheduler.start();
  }

  async stop(): Promise<void> {
    for (const worker of this.workers.values()) {
      await worker.stop();
    }
    this.workers.clear();
    this.resourceManagers.clear();
    this.taskAllocations.clear();
    this.scheduler.stop();
  }

  async addWorker(config: WorkerConfig, executor: TaskExecutor): Promise<WorkerManager> {
    if (this.workers.has(config.id)) {
      throw new Error(`Worker ${config.id} already exists`);
    }

    const transport = this.createTransport();
    const worker = new WorkerManager(
      {
        ...config,
        autoRegister: config.autoRegister ?? true,
        heartbeatInterval: config.heartbeatInterval ?? this.schedulingIntervalMs,
      },
      executor,
      transport
    );

    this.workers.set(config.id, worker);
    this.resourceManagers.set(
      config.id,
      new ResourceManager({
        cpu: config.capabilities?.maxCpu ?? worker.getInfo().capabilities.maxCpu,
        memory: config.capabilities?.maxMemory ?? worker.getInfo().capabilities.maxMemory,
        disk: config.capabilities?.maxDisk ?? worker.getInfo().capabilities.maxDisk,
      })
    );
    await worker.start();
    return worker;
  }

  submitTask(input: SubmitDistributedTaskInput): string {
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

  async runTask(input: SubmitDistributedTaskInput): Promise<DistributedTask> {
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

  async waitForAllTasks(taskIds: string[], timeoutMs = 30000): Promise<DistributedTask[]> {
    return Promise.all(taskIds.map((taskId) => this.waitForTask(taskId, timeoutMs)));
  }

  getScheduler(): DistributedScheduler {
    return this.scheduler;
  }

  getWorkers(): WorkerManager[] {
    return Array.from(this.workers.values());
  }

  getWorkerResourceStatus(workerId: string): ManagedResourceStatus | undefined {
    return this.resourceManagers.get(workerId)?.getStatus();
  }

  getWorkerResourceAllocations(workerId: string): ManagedResourceAllocation[] {
    return this.resourceManagers.get(workerId)?.getOwnerAllocations(workerId) ?? [];
  }

  getCacheStats() {
    return this.cache.getStats();
  }

  getFaultRecoveryManager(): FaultRecoveryManager {
    return this.faultRecovery;
  }

  async invalidateSliceCache(
    sliceId: string,
    reason: "input_changed" | "dependency_changed" | "contract_changed" | "manual" | "expired" = "manual",
    details = "Invalidated by runtime"
  ): Promise<number> {
    return this.cache.invalidateBySlice(sliceId, reason, details);
  }

  async invalidateStageCache(
    sliceId: string,
    stageId: string,
    reason: "input_changed" | "dependency_changed" | "contract_changed" | "manual" | "expired" = "manual",
    details = "Invalidated by runtime"
  ): Promise<number> {
    return this.cache.invalidateByStage(sliceId, stageId, reason, details);
  }

  async warmupSliceCache(sliceId: string) {
    return this.cache.warmupSlice(sliceId);
  }

  async warmupStageCache(sliceId: string, stageId: string) {
    return this.cache.warmupStage(sliceId, stageId);
  }

  private bindSchedulerHandlers(): void {
    this.scheduler.on("task:assigned", async ({ task, worker }: { task: DistributedTask; worker: WorkerInfo }) => {
      const manager = this.workers.get(worker.id);
      if (!manager) {
        this.scheduler.taskFailed(task.id, `Assigned worker ${worker.id} is not available`);
        return;
      }

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
            this.scheduler.taskCompleted(task.id, {
              ...cachedValue,
            });
            return;
          }
        }

        if (this.enableFaultRecovery) {
          this.faultRecovery.createCheckpoint(task.id, {
            workerId: worker.id,
            resourceRequirements: { ...task.resourceRequirements },
            payload: task.payload,
          });
        }

        this.allocateTaskResources(worker.id, task);
        await manager.executeTask(task);
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

  private createTransport(): WorkerTransport {
    return {
      registerWorker: async (worker) => {
        this.scheduler.registerWorker(worker);
        this.scheduler.scheduleNow();
      },
      unregisterWorker: async (workerId) => {
        this.releaseWorkerResources(workerId);
        this.scheduler.unregisterWorker(workerId);
      },
      sendHeartbeat: async (workerId, load) => {
        this.scheduler.workerHeartbeat(workerId, load);
      },
      reportTaskCompleted: async (taskId, result) => {
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
      },
      reportTaskFailed: async (taskId, error) => {
        this.releaseTaskAllocation(taskId);
        const task = this.scheduler.getTask(taskId);
        if (task) {
          await this.handleTaskFailure(task, task.workerId, error);
        }
      },
    };
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

    if (workerId && (action.strategy === "migrate" || type === "worker_offline")) {
      this.quarantineWorker(workerId);
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
    if (/offline|not available/i.test(message)) {
      return "worker_offline";
    }
    return "task_error";
  }

  private quarantineWorker(workerId: string): void {
    this.releaseWorkerResources(workerId);
    this.scheduler.unregisterWorker(workerId);
  }
}
