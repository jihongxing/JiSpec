import * as EventEmitter from "events";
import * as os from "os";
import { DistributedTask, WorkerInfo, ResourceRequirements } from "./distributed-scheduler";

/**
 * Worker 配置
 */
export interface WorkerConfig {
  id: string;
  masterHost: string;
  masterPort: number;
  capabilities?: {
    maxCpu?: number;
    maxMemory?: number;
    maxDisk?: number;
  };
  heartbeatInterval?: number;
}

/**
 * 任务执行器
 */
export type TaskExecutor = (task: DistributedTask) => Promise<any>;

/**
 * Worker 管理器 (Worker 节点)
 */
export class WorkerManager extends EventEmitter {
  private config: WorkerConfig;
  private executor: TaskExecutor;
  private runningTasks: Map<string, DistributedTask> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(config: WorkerConfig, executor: TaskExecutor) {
    super();
    this.config = config;
    this.executor = executor;

    // 设置默认能力
    if (!this.config.capabilities) {
      this.config.capabilities = {
        maxCpu: os.cpus().length,
        maxMemory: Math.floor(os.totalmem() / 1024 / 1024), // MB
        maxDisk: 10000, // 10GB
      };
    }

    if (!this.config.heartbeatInterval) {
      this.config.heartbeatInterval = 5000; // 5 秒
    }
  }

  /**
   * 启动 Worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Worker is already running");
    }

    // 注册到 Master
    await this.registerToMaster();

    // 启动心跳
    this.startHeartbeat();

    this.isRunning = true;
    this.emit("worker:started");
  }

  /**
   * 停止 Worker
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // 停止心跳
    this.stopHeartbeat();

    // 等待所有任务完成
    await this.waitForTasksCompletion();

    // 注销
    await this.unregisterFromMaster();

    this.isRunning = false;
    this.emit("worker:stopped");
  }

  /**
   * 执行任务
   */
  async executeTask(task: DistributedTask): Promise<void> {
    if (this.runningTasks.has(task.id)) {
      throw new Error(`Task ${task.id} is already running`);
    }

    // 检查资源
    if (!this.hasEnoughResources(task.resourceRequirements)) {
      throw new Error("Insufficient resources");
    }

    this.runningTasks.set(task.id, task);
    task.status = "running";
    task.startedAt = new Date();

    this.emit("task:started", task);

    try {
      // 执行任务
      const result = await this.executeWithTimeout(task);

      // 通知 Master 任务完成
      await this.notifyTaskCompleted(task.id, result);

      this.runningTasks.delete(task.id);
      this.emit("task:completed", { taskId: task.id, result });
    } catch (error) {
      // 通知 Master 任务失败
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.notifyTaskFailed(task.id, errorMessage);

      this.runningTasks.delete(task.id);
      this.emit("task:failed", { taskId: task.id, error: errorMessage });
    }
  }

  /**
   * 带超时的任务执行
   */
  private async executeWithTimeout(task: DistributedTask): Promise<any> {
    const timeout = task.resourceRequirements.timeout;

    return Promise.race([
      this.executor(task),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Task timeout")), timeout)
      ),
    ]);
  }

  /**
   * 检查资源是否足够
   */
  private hasEnoughResources(requirements: ResourceRequirements): boolean {
    const currentLoad = this.getCurrentLoad();
    const capabilities = this.config.capabilities!;

    const availableCpu = capabilities.maxCpu! - currentLoad.cpu;
    const availableMemory = capabilities.maxMemory! - currentLoad.memory;
    const availableDisk = capabilities.maxDisk! - currentLoad.disk;

    return (
      availableCpu >= requirements.cpu &&
      availableMemory >= requirements.memory &&
      availableDisk >= requirements.disk
    );
  }

  /**
   * 获取当前负载
   */
  private getCurrentLoad(): { cpu: number; memory: number; disk: number } {
    let cpu = 0;
    let memory = 0;
    let disk = 0;

    for (const task of this.runningTasks.values()) {
      cpu += task.resourceRequirements.cpu;
      memory += task.resourceRequirements.memory;
      disk += task.resourceRequirements.disk;
    }

    return { cpu, memory, disk };
  }

  /**
   * 注册到 Master
   */
  private async registerToMaster(): Promise<void> {
    const workerInfo: Omit<WorkerInfo, "status" | "runningTasks" | "lastHeartbeat" | "totalTasksCompleted" | "totalTasksFailed"> = {
      id: this.config.id,
      host: os.hostname(),
      port: 0, // TODO: 实际的端口
      capabilities: {
        maxCpu: this.config.capabilities!.maxCpu!,
        maxMemory: this.config.capabilities!.maxMemory!,
        maxDisk: this.config.capabilities!.maxDisk!,
      },
      currentLoad: { cpu: 0, memory: 0, disk: 0 },
    };

    // TODO: 实际的 HTTP/gRPC 调用
    console.log(`Registering worker ${this.config.id} to master`);
    this.emit("worker:registered", workerInfo);
  }

  /**
   * 注销
   */
  private async unregisterFromMaster(): Promise<void> {
    // TODO: 实际的 HTTP/gRPC 调用
    console.log(`Unregistering worker ${this.config.id} from master`);
    this.emit("worker:unregistered");
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatInterval!);
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * 发送心跳
   */
  private async sendHeartbeat(): Promise<void> {
    const currentLoad = this.getCurrentLoad();

    // TODO: 实际的 HTTP/gRPC 调用
    this.emit("heartbeat:sent", { workerId: this.config.id, currentLoad });
  }

  /**
   * 通知任务完成
   */
  private async notifyTaskCompleted(taskId: string, result: any): Promise<void> {
    // TODO: 实际的 HTTP/gRPC 调用
    console.log(`Task ${taskId} completed`);
    this.emit("task:notified:completed", { taskId, result });
  }

  /**
   * 通知任务失败
   */
  private async notifyTaskFailed(taskId: string, error: string): Promise<void> {
    // TODO: 实际的 HTTP/gRPC 调用
    console.log(`Task ${taskId} failed: ${error}`);
    this.emit("task:notified:failed", { taskId, error });
  }

  /**
   * 等待所有任务完成
   */
  private async waitForTasksCompletion(): Promise<void> {
    const maxWaitTime = 60000; // 60 秒
    const startTime = Date.now();

    while (this.runningTasks.size > 0) {
      if (Date.now() - startTime > maxWaitTime) {
        console.warn(`Timeout waiting for tasks completion. ${this.runningTasks.size} tasks still running.`);
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  /**
   * 获取 Worker 信息
   */
  getInfo(): WorkerInfo {
    return {
      id: this.config.id,
      host: os.hostname(),
      port: 0,
      status: this.isRunning ? (this.runningTasks.size > 0 ? "busy" : "idle") : "offline",
      capabilities: {
        maxCpu: this.config.capabilities!.maxCpu!,
        maxMemory: this.config.capabilities!.maxMemory!,
        maxDisk: this.config.capabilities!.maxDisk!,
      },
      currentLoad: this.getCurrentLoad(),
      runningTasks: Array.from(this.runningTasks.keys()),
      lastHeartbeat: new Date(),
      totalTasksCompleted: 0, // TODO: 持久化统计
      totalTasksFailed: 0,
    };
  }

  /**
   * 获取运行中的任务
   */
  getRunningTasks(): DistributedTask[] {
    return Array.from(this.runningTasks.values());
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<void> {
    const task = this.runningTasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // TODO: 实现任务取消逻辑
    this.runningTasks.delete(taskId);
    this.emit("task:cancelled", taskId);
  }
}

/**
 * Worker 池管理器
 */
export class WorkerPoolManager {
  private workers: Map<string, WorkerManager> = new Map();
  private executor: TaskExecutor;

  constructor(executor: TaskExecutor) {
    this.executor = executor;
  }

  /**
   * 添加 Worker
   */
  addWorker(config: WorkerConfig): WorkerManager {
    if (this.workers.has(config.id)) {
      throw new Error(`Worker ${config.id} already exists`);
    }

    const worker = new WorkerManager(config, this.executor);
    this.workers.set(config.id, worker);

    return worker;
  }

  /**
   * 移除 Worker
   */
  async removeWorker(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error(`Worker ${workerId} not found`);
    }

    await worker.stop();
    this.workers.delete(workerId);
  }

  /**
   * 启动所有 Worker
   */
  async startAll(): Promise<void> {
    const promises = Array.from(this.workers.values()).map((w) => w.start());
    await Promise.all(promises);
  }

  /**
   * 停止所有 Worker
   */
  async stopAll(): Promise<void> {
    const promises = Array.from(this.workers.values()).map((w) => w.stop());
    await Promise.all(promises);
  }

  /**
   * 获取 Worker
   */
  getWorker(workerId: string): WorkerManager | undefined {
    return this.workers.get(workerId);
  }

  /**
   * 获取所有 Worker
   */
  getAllWorkers(): WorkerManager[] {
    return Array.from(this.workers.values());
  }

  /**
   * 获取 Worker 统计
   */
  getStats(): {
    totalWorkers: number;
    activeWorkers: number;
    idleWorkers: number;
    totalRunningTasks: number;
  } {
    const workers = Array.from(this.workers.values());
    const activeWorkers = workers.filter((w) => w.getRunningTasks().length > 0);
    const totalRunningTasks = workers.reduce(
      (sum, w) => sum + w.getRunningTasks().length,
      0
    );

    return {
      totalWorkers: workers.length,
      activeWorkers: activeWorkers.length,
      idleWorkers: workers.length - activeWorkers.length,
      totalRunningTasks,
    };
  }
}
