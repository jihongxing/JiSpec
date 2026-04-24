import * as fs from "fs";
import * as path from "path";
import { DistributedTask } from "./distributed-scheduler";

/**
 * 检查点
 */
export interface Checkpoint {
  id: string;
  taskId: string;
  timestamp: Date;
  state: any;
  metadata?: Record<string, any>;
}

/**
 * 故障恢复策略
 */
export type RecoveryStrategy = "retry" | "migrate" | "checkpoint" | "skip";

/**
 * 故障类型
 */
export type FailureType = "worker_offline" | "task_timeout" | "task_error" | "resource_exhausted";

/**
 * 故障记录
 */
export interface FailureRecord {
  id: string;
  taskId: string;
  type: FailureType;
  timestamp: Date;
  error: string;
  workerId?: string;
  recoveryStrategy: RecoveryStrategy;
  recovered: boolean;
  recoveredAt?: Date;
}

/**
 * 故障恢复配置
 */
export interface FaultRecoveryConfig {
  maxRetries: number;
  retryDelay: number;
  checkpointInterval: number;
  enableMigration: boolean;
  enableCheckpoint: boolean;
}

/**
 * 故障恢复管理器
 */
export class FaultRecoveryManager {
  private checkpoints: Map<string, Checkpoint[]> = new Map();
  private failures: Map<string, FailureRecord[]> = new Map();
  private config: FaultRecoveryConfig;
  private checkpointDir: string;

  constructor(
    config: Partial<FaultRecoveryConfig> = {},
    checkpointDir: string = ".jispec/checkpoints"
  ) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 5000,
      checkpointInterval: config.checkpointInterval ?? 60000,
      enableMigration: config.enableMigration ?? true,
      enableCheckpoint: config.enableCheckpoint ?? true,
    };
    this.checkpointDir = checkpointDir;

    if (!fs.existsSync(this.checkpointDir)) {
      fs.mkdirSync(this.checkpointDir, { recursive: true });
    }
  }

  createCheckpoint(taskId: string, state: any, metadata?: Record<string, any>): Checkpoint {
    if (!this.config.enableCheckpoint) {
      throw new Error("Checkpoint is disabled");
    }

    const checkpoint: Checkpoint = {
      id: `checkpoint-${Date.now()}-${Math.random()}`,
      taskId,
      timestamp: new Date(),
      state,
      metadata,
    };

    if (!this.checkpoints.has(taskId)) {
      this.checkpoints.set(taskId, []);
    }

    this.checkpoints.get(taskId)!.push(checkpoint);
    this.saveCheckpoint(checkpoint);

    return checkpoint;
  }

  private saveCheckpoint(checkpoint: Checkpoint): void {
    const filePath = path.join(
      this.checkpointDir,
      `${checkpoint.taskId}-${checkpoint.id}.json`
    );

    fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2));
  }

  loadCheckpoint(taskId: string, checkpointId?: string): Checkpoint | null {
    const checkpoints = this.checkpoints.get(taskId);
    if (checkpoints && checkpoints.length > 0) {
      if (checkpointId) {
        return checkpoints.find((c) => c.id === checkpointId) || null;
      }
      return checkpoints[checkpoints.length - 1];
    }

    const files = fs.readdirSync(this.checkpointDir);
    const taskCheckpoints = files
      .filter((f) => f.startsWith(`${taskId}-`))
      .map((f) => {
        const data = fs.readFileSync(path.join(this.checkpointDir, f), "utf-8");
        return JSON.parse(data) as Checkpoint;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (taskCheckpoints.length > 0) {
      if (checkpointId) {
        return taskCheckpoints.find((c) => c.id === checkpointId) || null;
      }
      return taskCheckpoints[0];
    }

    return null;
  }

  deleteCheckpoint(taskId: string, checkpointId?: string): void {
    if (checkpointId) {
      const checkpoints = this.checkpoints.get(taskId);
      if (checkpoints) {
        const index = checkpoints.findIndex((c) => c.id === checkpointId);
        if (index !== -1) {
          checkpoints.splice(index, 1);
        }
      }

      const filePath = path.join(this.checkpointDir, `${taskId}-${checkpointId}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } else {
      this.checkpoints.delete(taskId);

      const files = fs.readdirSync(this.checkpointDir);
      files
        .filter((f) => f.startsWith(`${taskId}-`))
        .forEach((f) => {
          fs.unlinkSync(path.join(this.checkpointDir, f));
        });
    }
  }

  recordFailure(
    taskId: string,
    type: FailureType,
    error: string,
    workerId?: string
  ): FailureRecord {
    const failure: FailureRecord = {
      id: `failure-${Date.now()}-${Math.random()}`,
      taskId,
      type,
      timestamp: new Date(),
      error,
      workerId,
      recoveryStrategy: this.selectRecoveryStrategy(taskId, type),
      recovered: false,
    };

    if (!this.failures.has(taskId)) {
      this.failures.set(taskId, []);
    }

    this.failures.get(taskId)!.push(failure);

    return failure;
  }

  private selectRecoveryStrategy(taskId: string, type: FailureType): RecoveryStrategy {
    const failures = this.failures.get(taskId) || [];
    const retryCount = failures.filter((f) => f.recoveryStrategy === "retry").length;

    switch (type) {
      case "worker_offline":
        return this.config.enableMigration ? "migrate" : "retry";

      case "task_timeout":
        if (this.config.enableCheckpoint && this.hasCheckpoint(taskId)) {
          return "checkpoint";
        }
        return retryCount < this.config.maxRetries ? "retry" : "skip";

      case "task_error":
        return retryCount < this.config.maxRetries ? "retry" : "skip";

      case "resource_exhausted":
        return retryCount < this.config.maxRetries ? "retry" : "skip";

      default:
        return "retry";
    }
  }

  private hasCheckpoint(taskId: string): boolean {
    return this.loadCheckpoint(taskId) !== null;
  }

  async recoverTask(
    task: DistributedTask,
    failure: FailureRecord
  ): Promise<{ success: boolean; state?: any }> {
    switch (failure.recoveryStrategy) {
      case "retry":
        return this.retryTask(task, failure);

      case "migrate":
        return this.migrateTask(task, failure);

      case "checkpoint":
        return this.recoverFromCheckpoint(task, failure);

      case "skip":
        return { success: false };

      default:
        return { success: false };
    }
  }

  private async retryTask(
    task: DistributedTask,
    failure: FailureRecord
  ): Promise<{ success: boolean }> {
    await new Promise((resolve) => setTimeout(resolve, this.config.retryDelay));

    failure.recovered = true;
    failure.recoveredAt = new Date();

    return { success: true };
  }

  private async migrateTask(
    task: DistributedTask,
    failure: FailureRecord
  ): Promise<{ success: boolean }> {
    if (!this.config.enableMigration) {
      return { success: false };
    }

    task.workerId = undefined;
    task.status = "pending";

    failure.recovered = true;
    failure.recoveredAt = new Date();

    return { success: true };
  }

  private async recoverFromCheckpoint(
    task: DistributedTask,
    failure: FailureRecord
  ): Promise<{ success: boolean; state?: any }> {
    if (!this.config.enableCheckpoint) {
      return { success: false };
    }

    const checkpoint = this.loadCheckpoint(task.id);
    if (!checkpoint) {
      return { success: false };
    }

    failure.recovered = true;
    failure.recoveredAt = new Date();

    return { success: true, state: checkpoint.state };
  }

  getFailureHistory(taskId: string): FailureRecord[] {
    return this.failures.get(taskId) || [];
  }

  getCheckpointHistory(taskId: string): Checkpoint[] {
    return this.checkpoints.get(taskId) || [];
  }

  getRecoveryStats(): {
    totalFailures: number;
    recoveredFailures: number;
    recoveryRate: number;
    byType: Record<FailureType, number>;
    byStrategy: Record<RecoveryStrategy, number>;
  } {
    let totalFailures = 0;
    let recoveredFailures = 0;
    const byType: Record<FailureType, number> = {
      worker_offline: 0,
      task_timeout: 0,
      task_error: 0,
      resource_exhausted: 0,
    };
    const byStrategy: Record<RecoveryStrategy, number> = {
      retry: 0,
      migrate: 0,
      checkpoint: 0,
      skip: 0,
    };

    for (const failures of this.failures.values()) {
      for (const failure of failures) {
        totalFailures++;
        if (failure.recovered) {
          recoveredFailures++;
        }
        byType[failure.type]++;
        byStrategy[failure.recoveryStrategy]++;
      }
    }

    const recoveryRate = totalFailures > 0 ? recoveredFailures / totalFailures : 0;

    return {
      totalFailures,
      recoveredFailures,
      recoveryRate,
      byType,
      byStrategy,
    };
  }

  cleanupOldCheckpoints(maxAge: number = 86400000): void {
    const now = Date.now();

    for (const [taskId, checkpoints] of this.checkpoints) {
      const validCheckpoints = checkpoints.filter(
        (c) => now - new Date(c.timestamp).getTime() < maxAge
      );

      if (validCheckpoints.length === 0) {
        this.checkpoints.delete(taskId);
      } else {
        this.checkpoints.set(taskId, validCheckpoints);
      }
    }

    const files = fs.readdirSync(this.checkpointDir);
    for (const file of files) {
      const filePath = path.join(this.checkpointDir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtime.getTime() > maxAge) {
        fs.unlinkSync(filePath);
      }
    }
  }

  saveRecoveryReport(outputPath: string): void {
    const report = {
      timestamp: new Date().toISOString(),
      stats: this.getRecoveryStats(),
      failures: Array.from(this.failures.entries()).map(([taskId, failures]) => ({
        taskId,
        failures,
      })),
      checkpoints: Array.from(this.checkpoints.entries()).map(([taskId, checkpoints]) => ({
        taskId,
        checkpointCount: checkpoints.length,
        latestCheckpoint: checkpoints[checkpoints.length - 1],
      })),
    };

    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  }
}
