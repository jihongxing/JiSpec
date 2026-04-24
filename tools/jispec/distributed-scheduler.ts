import * as EventEmitter from "events";
import { v4 as uuidv4 } from "uuid";

/**
 * 任务状态
 */
export type TaskStatus = "pending" | "assigned" | "running" | "completed" | "failed" | "cancelled";

/**
 * 任务优先级
 */
export type TaskPriority = "low" | "normal" | "high" | "critical";

/**
 * 分布式任务
 */
export interface DistributedTask {
  id: string;
  sliceId: string;
  stageId: string;
  priority: TaskPriority;
  status: TaskStatus;
  workerId?: string;
  payload: any;
  resourceRequirements: ResourceRequirements;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  assignedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
}

/**
 * 资源需求
 */
export interface ResourceRequirements {
  cpu: number; // CPU 核心数
  memory: number; // 内存 MB
  disk: number; // 磁盘空间 MB
  timeout: number; // 超时时间 ms
}

/**
 * Worker 信息
 */
export interface WorkerInfo {
  id: string;
  host: string;
  port: number;
  status: "idle" | "busy" | "offline";
  capabilities: {
    maxCpu: number;
    maxMemory: number;
    maxDisk: number;
  };
  currentLoad: {
    cpu: number;
    memory: number;
    disk: number;
  };
  runningTasks: string[];
  lastHeartbeat: Date;
  totalTasksCompleted: number;
  totalTasksFailed: number;
}

/**
 * 调度策略
 */
export type SchedulingStrategy = "round_robin" | "least_loaded" | "weighted" | "affinity";

/**
 * 调度统计
 */
export interface SchedulingStats {
  totalTasks: number;
  pendingTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageWaitTime: number;
  averageExecutionTime: number;
  workerUtilization: Map<string, number>;
}

/**
 * 分布式任务调度器 (Master 节点)
 */
export class DistributedScheduler extends EventEmitter {
  private tasks: Map<string, DistributedTask> = new Map();
  private workers: Map<string, WorkerInfo> = new Map();
  private taskQueue: DistributedTask[] = [];
  private strategy: SchedulingStrategy = "least_loaded";
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private schedulingInterval: NodeJS.Timeout | null = null;

  constructor(strategy: SchedulingStrategy = "least_loaded") {
    super();
    this.strategy = strategy;
  }

  /**
   * 启动调度器
   */
  start(): void {
    // 启动心跳检测
    this.heartbeatInterval = setInterval(() => {
      this.checkWorkerHeartbeats();
    }, 5000);

    // 启动任务调度
    this.schedulingInterval = setInterval(() => {
      this.scheduleTasks();
    }, 1000);

    this.emit("scheduler:started");
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.schedulingInterval) {
      clearInterval(this.schedulingInterval);
      this.schedulingInterval = null;
    }

    this.emit("scheduler:stopped");
  }

  /**
   * 提交任务
   */
  submitTask(
    sliceId: string,
    stageId: string,
    payload: any,
    requirements: ResourceRequirements,
    priority: TaskPriority = "normal"
  ): string {
    const task: DistributedTask = {
      id: uuidv4(),
      sliceId,
      stageId,
      priority,
      status: "pending",
      payload,
      resourceRequirements: requirements,
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date(),
    };

    this.tasks.set(task.id, task);
    this.taskQueue.push(task);

    // 按优先级排序
    this.sortTaskQueue();

    this.emit("task:submitted", task);

    return task.id;
  }

  /**
   * 注册 Worker
   */
  registerWorker(worker: Omit<WorkerInfo, "status" | "runningTasks" | "lastHeartbeat" | "totalTasksCompleted" | "totalTasksFailed">): void {
    const workerInfo: WorkerInfo = {
      ...worker,
      status: "idle",
      runningTasks: [],
      lastHeartbeat: new Date(),
      totalTasksCompleted: 0,
      totalTasksFailed: 0,
    };

    this.workers.set(worker.id, workerInfo);
    this.emit("worker:registered", workerInfo);
  }

  /**
   * 注销 Worker
   */
  unregisterWorker(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    // 重新调度该 Worker 上的任务
    for (const taskId of worker.runningTasks) {
      const task = this.tasks.get(taskId);
      if (task) {
        task.status = "pending";
        task.workerId = undefined;
        this.taskQueue.push(task);
      }
    }

    this.workers.delete(workerId);
    this.emit("worker:unregistered", workerId);
  }

  /**
   * Worker 心跳
   */
  workerHeartbeat(workerId: string, currentLoad: WorkerInfo["currentLoad"]): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    worker.lastHeartbeat = new Date();
    worker.currentLoad = currentLoad;

    // 更新状态
    if (worker.runningTasks.length === 0) {
      worker.status = "idle";
    } else {
      worker.status = "busy";
    }

    this.emit("worker:heartbeat", workerId);
  }

  /**
   * 任务完成
   */
  taskCompleted(taskId: string, result: any): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = "completed";
    task.completedAt = new Date();
    task.result = result;

    // 更新 Worker 信息
    if (task.workerId) {
      const worker = this.workers.get(task.workerId);
      if (worker) {
        worker.runningTasks = worker.runningTasks.filter((id) => id !== taskId);
        worker.totalTasksCompleted++;
      }
    }

    this.emit("task:completed", task);
  }

  /**
   * 任务失败
   */
  taskFailed(taskId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.error = error;
    task.retryCount++;

    // 更新 Worker 信息
    if (task.workerId) {
      const worker = this.workers.get(task.workerId);
      if (worker) {
        worker.runningTasks = worker.runningTasks.filter((id) => id !== taskId);
        worker.totalTasksFailed++;
      }
    }

    // 判断是否重试
    if (task.retryCount < task.maxRetries) {
      task.status = "pending";
      task.workerId = undefined;
      this.taskQueue.push(task);
      this.emit("task:retry", task);
    } else {
      task.status = "failed";
      this.emit("task:failed", task);
    }
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = "cancelled";

    // 从队列中移除
    this.taskQueue = this.taskQueue.filter((t) => t.id !== taskId);

    // 如果任务正在运行，通知 Worker
    if (task.workerId) {
      this.emit("task:cancel", { taskId, workerId: task.workerId });
    }

    this.emit("task:cancelled", task);
  }

  /**
   * 调度任务
   */
  private scheduleTasks(): void {
    if (this.taskQueue.length === 0) return;

    // 获取可用的 Worker
    const availableWorkers = Array.from(this.workers.values()).filter(
      (w) => w.status !== "offline"
    );

    if (availableWorkers.length === 0) return;

    // 尝试分配任务
    const tasksToSchedule = [...this.taskQueue];
    for (const task of tasksToSchedule) {
      const worker = this.selectWorker(task, availableWorkers);
      if (worker) {
        this.assignTask(task, worker);
      }
    }
  }

  /**
   * 选择 Worker
   */
  private selectWorker(
    task: DistributedTask,
    availableWorkers: WorkerInfo[]
  ): WorkerInfo | null {
    // 过滤出满足资源需求的 Worker
    const suitableWorkers = availableWorkers.filter((w) => {
      const availableCpu = w.capabilities.maxCpu - w.currentLoad.cpu;
      const availableMemory = w.capabilities.maxMemory - w.currentLoad.memory;
      const availableDisk = w.capabilities.maxDisk - w.currentLoad.disk;

      return (
        availableCpu >= task.resourceRequirements.cpu &&
        availableMemory >= task.resourceRequirements.memory &&
        availableDisk >= task.resourceRequirements.disk
      );
    });

    if (suitableWorkers.length === 0) return null;

    // 根据策略选择 Worker
    switch (this.strategy) {
      case "round_robin":
        return this.selectRoundRobin(suitableWorkers);
      case "least_loaded":
        return this.selectLeastLoaded(suitableWorkers);
      case "weighted":
        return this.selectWeighted(suitableWorkers);
      case "affinity":
        return this.selectAffinity(task, suitableWorkers);
      default:
        return suitableWorkers[0];
    }
  }

  /**
   * 轮询选择
   */
  private selectRoundRobin(workers: WorkerInfo[]): WorkerInfo {
    // 简化实现：选择任务数最少的
    return workers.reduce((min, w) =>
      w.runningTasks.length < min.runningTasks.length ? w : min
    );
  }

  /**
   * 最少负载选择
   */
  private selectLeastLoaded(workers: WorkerInfo[]): WorkerInfo {
    return workers.reduce((min, w) => {
      const minLoad =
        (min.currentLoad.cpu / min.capabilities.maxCpu +
          min.currentLoad.memory / min.capabilities.maxMemory) /
        2;
      const wLoad =
        (w.currentLoad.cpu / w.capabilities.maxCpu +
          w.currentLoad.memory / w.capabilities.maxMemory) /
        2;
      return wLoad < minLoad ? w : min;
    });
  }

  /**
   * 加权选择
   */
  private selectWeighted(workers: WorkerInfo[]): WorkerInfo {
    // 根据成功率加权
    return workers.reduce((best, w) => {
      const bestScore =
        best.totalTasksCompleted / (best.totalTasksCompleted + best.totalTasksFailed + 1);
      const wScore = w.totalTasksCompleted / (w.totalTasksCompleted + w.totalTasksFailed + 1);
      return wScore > bestScore ? w : best;
    });
  }

  /**
   * 亲和性选择
   */
  private selectAffinity(task: DistributedTask, workers: WorkerInfo[]): WorkerInfo {
    // 优先选择之前执行过相同切片任务的 Worker
    const sameSliceWorkers = workers.filter((w) =>
      Array.from(this.tasks.values()).some(
        (t) => t.sliceId === task.sliceId && t.workerId === w.id && t.status === "completed"
      )
    );

    if (sameSliceWorkers.length > 0) {
      return this.selectLeastLoaded(sameSliceWorkers);
    }

    return this.selectLeastLoaded(workers);
  }

  /**
   * 分配任务
   */
  private assignTask(task: DistributedTask, worker: WorkerInfo): void {
    task.status = "assigned";
    task.workerId = worker.id;
    task.assignedAt = new Date();

    worker.runningTasks.push(task.id);
    worker.currentLoad.cpu += task.resourceRequirements.cpu;
    worker.currentLoad.memory += task.resourceRequirements.memory;
    worker.currentLoad.disk += task.resourceRequirements.disk;

    // 从队列中移除
    this.taskQueue = this.taskQueue.filter((t) => t.id !== task.id);

    this.emit("task:assigned", { task, worker });
  }

  /**
   * 检查 Worker 心跳
   */
  private checkWorkerHeartbeats(): void {
    const now = new Date();
    const timeout = 30000; // 30 秒超时

    for (const [workerId, worker] of this.workers) {
      const timeSinceHeartbeat = now.getTime() - worker.lastHeartbeat.getTime();

      if (timeSinceHeartbeat > timeout && worker.status !== "offline") {
        worker.status = "offline";

        // 重新调度该 Worker 上的任务
        for (const taskId of worker.runningTasks) {
          const task = this.tasks.get(taskId);
          if (task) {
            this.taskFailed(taskId, "Worker offline");
          }
        }

        this.emit("worker:offline", workerId);
      }
    }
  }

  /**
   * 按优先级排序任务队列
   */
  private sortTaskQueue(): void {
    const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };

    this.taskQueue.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // 相同优先级按创建时间排序
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  /**
   * 获取任务状态
   */
  getTask(taskId: string): DistributedTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 获取 Worker 信息
   */
  getWorker(workerId: string): WorkerInfo | undefined {
    return this.workers.get(workerId);
  }

  /**
   * 获取所有 Worker
   */
  getAllWorkers(): WorkerInfo[] {
    return Array.from(this.workers.values());
  }

  /**
   * 获取调度统计
   */
  getStats(): SchedulingStats {
    const tasks = Array.from(this.tasks.values());

    const completedTasks = tasks.filter((t) => t.status === "completed");
    const totalWaitTime = completedTasks.reduce((sum, t) => {
      if (t.assignedAt) {
        return sum + (t.assignedAt.getTime() - t.createdAt.getTime());
      }
      return sum;
    }, 0);

    const totalExecutionTime = completedTasks.reduce((sum, t) => {
      if (t.startedAt && t.completedAt) {
        return sum + (t.completedAt.getTime() - t.startedAt.getTime());
      }
      return sum;
    }, 0);

    const workerUtilization = new Map<string, number>();
    for (const [workerId, worker] of this.workers) {
      const utilization =
        (worker.currentLoad.cpu / worker.capabilities.maxCpu +
          worker.currentLoad.memory / worker.capabilities.maxMemory) /
        2;
      workerUtilization.set(workerId, utilization);
    }

    return {
      totalTasks: tasks.length,
      pendingTasks: tasks.filter((t) => t.status === "pending").length,
      runningTasks: tasks.filter((t) => t.status === "running" || t.status === "assigned").length,
      completedTasks: completedTasks.length,
      failedTasks: tasks.filter((t) => t.status === "failed").length,
      averageWaitTime: completedTasks.length > 0 ? totalWaitTime / completedTasks.length : 0,
      averageExecutionTime:
        completedTasks.length > 0 ? totalExecutionTime / completedTasks.length : 0,
      workerUtilization,
    };
  }

  /**
   * 设置调度策略
   */
  setStrategy(strategy: SchedulingStrategy): void {
    this.strategy = strategy;
    this.emit("strategy:changed", strategy);
  }
}
