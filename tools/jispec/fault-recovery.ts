import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DistributedTask, ResourceRequirements } from "./distributed-scheduler";

export type RecoveryStrategy = "retry" | "migrate" | "checkpoint" | "degrade" | "skip";

export type FailureType =
  | "worker_offline"
  | "network_error"
  | "task_timeout"
  | "task_error"
  | "resource_exhausted";

export interface CheckpointRecord {
  id: string;
  taskId: string;
  timestamp: string;
  state: unknown;
  metadata?: Record<string, unknown>;
}

export interface FailureRecord {
  id: string;
  taskId: string;
  workerId?: string;
  type: FailureType;
  error: string;
  timestamp: string;
  strategy: RecoveryStrategy;
  recovered: boolean;
  recoveredAt?: string;
  metadata?: Record<string, unknown>;
}

export interface RecoveryAction {
  strategy: RecoveryStrategy;
  nextRequirements?: ResourceRequirements;
  checkpointState?: unknown;
}

export interface RecoveryStats {
  totalFailures: number;
  recoveredFailures: number;
  recoveryRate: number;
  byType: Record<FailureType, number>;
  byStrategy: Record<RecoveryStrategy, number>;
}

export interface FaultRecoveryConfig {
  maxRetries: number;
  retryDelayMs: number;
  enableMigration: boolean;
  enableCheckpoint: boolean;
  enableDegradedRetry: boolean;
  degradedRetryFactor: number;
}

const DEFAULT_CONFIG: FaultRecoveryConfig = {
  maxRetries: 3,
  retryDelayMs: 25,
  enableMigration: true,
  enableCheckpoint: true,
  enableDegradedRetry: true,
  degradedRetryFactor: 0.5,
};

function ensureDirectory(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function serializeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class FaultRecoveryManager {
  private readonly config: FaultRecoveryConfig;
  private readonly checkpointDir: string;
  private readonly failures = new Map<string, FailureRecord[]>();
  private readonly checkpoints = new Map<string, CheckpointRecord[]>();

  constructor(root: string, config: Partial<FaultRecoveryConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.checkpointDir = path.join(root, ".jispec", "checkpoints");
    ensureDirectory(this.checkpointDir);
  }

  createCheckpoint(taskId: string, state: unknown, metadata?: Record<string, unknown>): CheckpointRecord {
    if (!this.config.enableCheckpoint) {
      throw new Error("Checkpoint support is disabled");
    }

    const checkpoint: CheckpointRecord = {
      id: randomUUID(),
      taskId,
      timestamp: new Date().toISOString(),
      state,
      metadata,
    };

    const existing = this.checkpoints.get(taskId) ?? [];
    existing.push(checkpoint);
    this.checkpoints.set(taskId, existing);

    fs.writeFileSync(
      path.join(this.checkpointDir, `${taskId}-${checkpoint.id}.json`),
      JSON.stringify(checkpoint, null, 2),
      "utf8"
    );

    return checkpoint;
  }

  getLatestCheckpoint(taskId: string): CheckpointRecord | undefined {
    const inMemory = this.checkpoints.get(taskId);
    if (inMemory && inMemory.length > 0) {
      return inMemory[inMemory.length - 1];
    }

    const files = fs.readdirSync(this.checkpointDir)
      .filter((file) => file.startsWith(`${taskId}-`) && file.endsWith(".json"))
      .sort();

    if (files.length === 0) {
      return undefined;
    }

    const latestFile = files[files.length - 1];
    const checkpoint = JSON.parse(
      fs.readFileSync(path.join(this.checkpointDir, latestFile), "utf8")
    ) as CheckpointRecord;

    const existing = this.checkpoints.get(taskId) ?? [];
    existing.push(checkpoint);
    this.checkpoints.set(taskId, existing);
    return checkpoint;
  }

  recordFailure(input: {
    task: DistributedTask;
    type: FailureType;
    error: unknown;
    workerId?: string;
    metadata?: Record<string, unknown>;
  }): FailureRecord {
    const failureHistory = this.failures.get(input.task.id) ?? [];
    const failure: FailureRecord = {
      id: randomUUID(),
      taskId: input.task.id,
      workerId: input.workerId ?? input.task.workerId,
      type: input.type,
      error: serializeError(input.error),
      timestamp: new Date().toISOString(),
      strategy: this.selectRecoveryStrategy(input.task, input.type, failureHistory.length),
      recovered: false,
      metadata: input.metadata,
    };

    failureHistory.push(failure);
    this.failures.set(input.task.id, failureHistory);

    return failure;
  }

  async waitBeforeRetry(): Promise<void> {
    if (this.config.retryDelayMs <= 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, this.config.retryDelayMs));
  }

  async recoverTask(task: DistributedTask, failure: FailureRecord): Promise<RecoveryAction> {
    switch (failure.strategy) {
      case "migrate":
        this.markRecovered(failure);
        return { strategy: "migrate" };

      case "checkpoint": {
        const checkpoint = this.getLatestCheckpoint(task.id);
        if (!checkpoint) {
          return { strategy: "skip" };
        }
        this.markRecovered(failure);
        return { strategy: "checkpoint", checkpointState: checkpoint.state };
      }

      case "degrade": {
        const nextRequirements = this.buildDegradedRequirements(task.resourceRequirements);
        task.resourceRequirements = nextRequirements;
        this.markRecovered(failure);
        return { strategy: "degrade", nextRequirements };
      }

      case "retry":
        this.markRecovered(failure);
        return { strategy: "retry" };

      case "skip":
      default:
        return { strategy: "skip" };
    }
  }

  getFailureHistory(taskId: string): FailureRecord[] {
    return [...(this.failures.get(taskId) ?? [])];
  }

  getCheckpointHistory(taskId: string): CheckpointRecord[] {
    return [...(this.checkpoints.get(taskId) ?? [])];
  }

  getRecoveryStats(): RecoveryStats {
    const byType: Record<FailureType, number> = {
      worker_offline: 0,
      network_error: 0,
      task_timeout: 0,
      task_error: 0,
      resource_exhausted: 0,
    };
    const byStrategy: Record<RecoveryStrategy, number> = {
      retry: 0,
      migrate: 0,
      checkpoint: 0,
      degrade: 0,
      skip: 0,
    };

    let totalFailures = 0;
    let recoveredFailures = 0;

    for (const failureList of this.failures.values()) {
      for (const failure of failureList) {
        totalFailures += 1;
        byType[failure.type] += 1;
        byStrategy[failure.strategy] += 1;
        if (failure.recovered) {
          recoveredFailures += 1;
        }
      }
    }

    return {
      totalFailures,
      recoveredFailures,
      recoveryRate: totalFailures === 0 ? 0 : recoveredFailures / totalFailures,
      byType,
      byStrategy,
    };
  }

  cleanupTaskArtifacts(taskId: string): void {
    const files = fs.readdirSync(this.checkpointDir)
      .filter((file) => file.startsWith(`${taskId}-`) && file.endsWith(".json"));

    for (const file of files) {
      fs.rmSync(path.join(this.checkpointDir, file), { force: true });
    }

    this.checkpoints.delete(taskId);
    this.failures.delete(taskId);
  }

  private selectRecoveryStrategy(
    task: DistributedTask,
    type: FailureType,
    priorFailureCount: number
  ): RecoveryStrategy {
    if (priorFailureCount >= task.maxRetries) {
      return "skip";
    }

    switch (type) {
      case "worker_offline":
      case "network_error":
        return this.config.enableMigration ? "migrate" : "retry";

      case "task_timeout":
        if (this.config.enableCheckpoint && this.getLatestCheckpoint(task.id)) {
          return "checkpoint";
        }
        return "retry";

      case "resource_exhausted":
        return this.config.enableDegradedRetry ? "degrade" : "retry";

      case "task_error":
      default:
        return "retry";
    }
  }

  private buildDegradedRequirements(requirements: ResourceRequirements): ResourceRequirements {
    const factor = this.config.degradedRetryFactor;
    return {
      ...requirements,
      cpu: Math.max(1, Math.floor(requirements.cpu * factor)),
      memory: Math.max(32, Math.floor(requirements.memory * factor)),
      disk: Math.max(32, Math.floor(requirements.disk * factor)),
    };
  }

  private markRecovered(failure: FailureRecord): void {
    failure.recovered = true;
    failure.recoveredAt = new Date().toISOString();
  }
}
