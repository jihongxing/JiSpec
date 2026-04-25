import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { FailureHandlingConfig } from "./pipeline-executor";

/**
 * 失败上下文
 */
export interface FailureContext {
  sliceId: string;
  stageId: string;
  error: Error;
  attempt: number;
  startTime: string;
}

/**
 * 回滚快照
 */
export interface RollbackSnapshot {
  sliceId: string;
  stageId: string;
  timestamp: string;
  sliceState: any;
  filesBackup: Map<string, string>;
  existingFiles: string[]; // 快照时已存在的文件列表，用于回滚时删除新文件
}

/**
 * 人工干预选项
 */
export interface HumanInterventionOptions {
  skip: boolean;
  retry: boolean;
  manualFix: boolean;
  abort: boolean;
}

/**
 * 失败处理器
 *
 * 功能：
 * 1. 重试机制（线性、指数、固定退避）
 * 2. 回滚机制（状态回滚、完整回滚）
 * 3. 人工干预（提示、跳过、手动修复）
 */
export class FailureHandler {
  private config: FailureHandlingConfig;
  private root: string;
  private snapshots: Map<string, RollbackSnapshot> = new Map();

  constructor(root: string, config: FailureHandlingConfig) {
    this.root = root;
    this.config = config;
  }

  /**
   * 处理失败
   */
  async handleFailure(context: FailureContext): Promise<{
    shouldRetry: boolean;
    shouldRollback: boolean;
    delay?: number;
  }> {
    console.error(`\n[Failure] Stage '${context.stageId}' failed (attempt ${context.attempt})`);
    console.error(`[Failure] Error: ${context.error.message}\n`);

    // 1. 检查是否需要人工干预
    if (this.config.human_intervention.enabled && this.config.human_intervention.prompt_on_failure) {
      const intervention = await this.promptHumanIntervention(context);

      if (intervention.abort) {
        return { shouldRetry: false, shouldRollback: true };
      }

      if (intervention.skip) {
        console.log("[Failure] Skipping stage as requested by user");
        return { shouldRetry: false, shouldRollback: false };
      }

      if (intervention.manualFix) {
        console.log("[Failure] Waiting for manual fix...");
        await this.waitForManualFix();
        return { shouldRetry: true, shouldRollback: false, delay: 0 };
      }

      if (intervention.retry) {
        return this.calculateRetry(context);
      }
    }

    // 2. 自动重试逻辑
    if (this.config.retry.enabled && context.attempt < this.config.retry.max_attempts) {
      return this.calculateRetry(context);
    }

    // 3. 失败后回滚
    return {
      shouldRetry: false,
      shouldRollback: this.config.rollback.enabled,
    };
  }

  /**
   * 计算重试策略
   */
  private calculateRetry(context: FailureContext): {
    shouldRetry: boolean;
    shouldRollback: boolean;
    delay: number;
  } {
    const delay = this.calculateBackoff(context.attempt);

    console.log(`[Retry] Will retry in ${delay}ms (attempt ${context.attempt + 1}/${this.config.retry.max_attempts})`);

    return {
      shouldRetry: true,
      shouldRollback: false,
      delay,
    };
  }

  /**
   * 计算退避延迟
   */
  private calculateBackoff(attempt: number): number {
    const { backoff, initial_delay, max_delay } = this.config.retry;

    let delay: number;

    switch (backoff) {
      case "linear":
        delay = initial_delay * attempt;
        break;
      case "exponential":
        delay = initial_delay * Math.pow(2, attempt - 1);
        break;
      case "fixed":
      default:
        delay = initial_delay;
        break;
    }

    return Math.min(delay, max_delay);
  }

  /**
   * 创建回滚快照
   */
  async createSnapshot(sliceId: string, stageId: string): Promise<void> {
    if (!this.config.rollback.enabled) {
      return;
    }

    console.log(`[Snapshot] Creating rollback snapshot for ${sliceId}:${stageId}`);

    const sliceFile = this.findSliceFile(sliceId);
    const sliceContent = fs.readFileSync(sliceFile, "utf-8");
    const sliceState = yaml.load(sliceContent);

    const filesBackup = new Map<string, string>();
    const existingFiles: string[] = [];

    // 备份 slice 目录下的关键文件
    if (this.config.rollback.strategy === "full") {
      const sliceDir = path.dirname(sliceFile);
      const files = this.getSliceFiles(sliceDir);

      for (const file of files) {
        const content = fs.readFileSync(file, "utf-8");
        filesBackup.set(file, content);
        existingFiles.push(file);
      }
    }

    const snapshot: RollbackSnapshot = {
      sliceId,
      stageId,
      timestamp: new Date().toISOString(),
      sliceState,
      filesBackup,
      existingFiles,
    };

    // 持久化快照到磁盘
    try {
      this.saveSnapshotToDisk(snapshot);
    } catch (error) {
      console.error(`[Snapshot] Failed to save snapshot to disk: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`[Snapshot] Snapshot will only be available in memory for this session`);
    }

    this.snapshots.set(`${sliceId}:${stageId}`, snapshot);
  }

  /**
   * 执行回滚
   */
  async rollback(sliceId: string, stageId: string): Promise<void> {
    const key = `${sliceId}:${stageId}`;
    const snapshot = this.snapshots.get(key);

    if (!snapshot) {
      console.warn(`[Rollback] No snapshot found for ${key}`);
      return;
    }

    console.log(`[Rollback] Rolling back ${sliceId}:${stageId} to ${snapshot.timestamp}`);

    // 1. 恢复 slice 状态
    const sliceFile = this.findSliceFile(sliceId);
    const restored = yaml.dump(snapshot.sliceState);
    fs.writeFileSync(sliceFile, restored, "utf-8");

    // 2. 恢复文件（如果是完整回滚）
    if (this.config.rollback.strategy === "full") {
      for (const [file, content] of snapshot.filesBackup) {
        fs.writeFileSync(file, content, "utf-8");
      }
    }

    console.log(`[Rollback] Rollback completed`);
  }

  /**
   * 回滚到最近的可用 snapshot
   */
  async rollbackToLatest(sliceId: string): Promise<void> {
    // 从磁盘加载该 slice 的所有 snapshots
    const snapshotDir = path.join(this.root, ".jispec", "snapshots", sliceId);

    if (!fs.existsSync(snapshotDir)) {
      console.warn(`[Rollback] No snapshots found for ${sliceId}`);
      return;
    }

    const snapshotFiles = fs.readdirSync(snapshotDir);
    if (snapshotFiles.length === 0) {
      console.warn(`[Rollback] No snapshots found for ${sliceId}`);
      return;
    }

    // 按文件名排序（包含时间戳），取最新的
    snapshotFiles.sort().reverse();
    const latestSnapshotFile = snapshotFiles[0];
    const latestSnapshotPath = path.join(snapshotDir, latestSnapshotFile);

    console.log(`[Rollback] Loading snapshot from disk: ${latestSnapshotFile}`);

    // 解析文件名: stageId-timestamp.json
    const match = latestSnapshotFile.match(/^(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z)\.json$/);
    if (!match) {
      console.error(`[Rollback] Invalid snapshot filename: ${latestSnapshotFile}`);
      return;
    }

    const stageId = match[1];
    const timestamp = match[2].replace(/-/g, ':'); // Convert back to ISO format

    // 加载 snapshot
    const latestSnapshot = this.loadSnapshotFromDisk(sliceId, stageId, timestamp);
    if (!latestSnapshot) {
      console.error(`[Rollback] Failed to load snapshot from ${latestSnapshotPath}`);
      return;
    }

    console.log(`[Rollback] Rolling back ${sliceId} to snapshot: ${latestSnapshot.stageId} (${latestSnapshot.timestamp})`);

    // 1. 恢复 slice 状态
    const sliceFile = this.findSliceFile(sliceId);
    const restored = yaml.dump(latestSnapshot.sliceState);
    fs.writeFileSync(sliceFile, restored, "utf-8");

    // 2. 恢复文件（如果是完整回滚）
    if (this.config.rollback.strategy === "full") {
      const sliceDir = path.dirname(sliceFile);
      const currentFiles = this.getSliceFiles(sliceDir);

      // 删除快照后新增的文件
      for (const file of currentFiles) {
        if (!latestSnapshot.existingFiles.includes(file)) {
          console.log(`[Rollback] Deleting new file: ${file}`);
          fs.unlinkSync(file);
        }
      }

      // 恢复快照中的文件
      for (const [file, content] of latestSnapshot.filesBackup) {
        const dir = path.dirname(file);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, content, "utf-8");
      }
    }

    console.log(`[Rollback] Rollback completed`);
  }

  /**
   * 清理快照
   */
  clearSnapshot(sliceId: string, stageId: string): void {
    const key = `${sliceId}:${stageId}`;
    this.snapshots.delete(key);
  }

  /**
   * 提示人工干预
   */
  private async promptHumanIntervention(context: FailureContext): Promise<HumanInterventionOptions> {
    // 在实际实现中，这里应该使用交互式提示
    // 这里简化为自动决策
    console.log("\n[Human Intervention] Options:");
    console.log("  1. Retry");
    console.log("  2. Skip");
    console.log("  3. Manual Fix");
    console.log("  4. Abort");

    // 默认行为：如果允许重试则重试，否则中止
    if (this.config.retry.enabled && context.attempt < this.config.retry.max_attempts) {
      return { skip: false, retry: true, manualFix: false, abort: false };
    }

    return { skip: false, retry: false, manualFix: false, abort: true };
  }

  /**
   * 等待手动修复
   */
  private async waitForManualFix(): Promise<void> {
    // 在实际实现中，这里应该等待用户确认
    // 这里简化为立即返回
    console.log("[Manual Fix] Press Enter when ready to continue...");
    // await readline prompt
  }

  /**
   * 查找 slice 文件
   */
  private findSliceFile(sliceId: string): string {
    const contextsDir = path.join(this.root, "contexts");
    const contexts = fs.readdirSync(contextsDir);

    for (const context of contexts) {
      const contextDir = path.join(contextsDir, context);
      if (!fs.statSync(contextDir).isDirectory()) continue;

      const slicesDir = path.join(contextDir, "slices");
      if (!fs.existsSync(slicesDir)) continue;

      const slices = fs.readdirSync(slicesDir);
      for (const slice of slices) {
        const sliceDir = path.join(slicesDir, slice);
        if (!fs.statSync(sliceDir).isDirectory()) continue;

        const sliceFile = path.join(sliceDir, "slice.yaml");
        if (!fs.existsSync(sliceFile)) continue;

        const content = fs.readFileSync(sliceFile, "utf-8");
        const sliceData = yaml.load(content) as any;

        if (sliceData.id === sliceId) {
          return sliceFile;
        }
      }
    }

    throw new Error(`Slice not found: ${sliceId}`);
  }

  /**
   * 获取 slice 目录下的所有文件（递归）
   */
  private getSliceFiles(sliceDir: string): string[] {
    const files: string[] = [];

    const walkDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile()) {
          files.push(fullPath);
        } else if (entry.isDirectory()) {
          walkDir(fullPath);
        }
      }
    };

    walkDir(sliceDir);
    return files;
  }

  /**
   * 保存快照到磁盘
   */
  private saveSnapshotToDisk(snapshot: RollbackSnapshot): void {
    const snapshotDir = path.join(this.root, ".jispec", "snapshots", snapshot.sliceId);
    fs.mkdirSync(snapshotDir, { recursive: true });

    // Sanitize timestamp for Windows: replace : with -
    const safeTimestamp = snapshot.timestamp.replace(/:/g, '-');
    const snapshotFile = path.join(snapshotDir, `${snapshot.stageId}-${safeTimestamp}.json`);

    // 将 Map 转换为普通对象以便序列化
    const serializable = {
      sliceId: snapshot.sliceId,
      stageId: snapshot.stageId,
      timestamp: snapshot.timestamp,
      sliceState: snapshot.sliceState,
      filesBackup: Array.from(snapshot.filesBackup.entries()),
      existingFiles: snapshot.existingFiles,
    };

    fs.writeFileSync(snapshotFile, JSON.stringify(serializable, null, 2), "utf-8");
    console.log(`[Snapshot] Saved to: ${snapshotFile}`);
  }

  /**
   * 从磁盘加载快照
   */
  private loadSnapshotFromDisk(sliceId: string, stageId: string, timestamp: string): RollbackSnapshot | null {
    // Sanitize timestamp for Windows: replace : with -
    const safeTimestamp = timestamp.replace(/:/g, '-');
    const snapshotFile = path.join(this.root, ".jispec", "snapshots", sliceId, `${stageId}-${safeTimestamp}.json`);

    if (!fs.existsSync(snapshotFile)) {
      return null;
    }

    const content = fs.readFileSync(snapshotFile, "utf-8");
    const data = JSON.parse(content);

    return {
      sliceId: data.sliceId,
      stageId: data.stageId,
      timestamp: data.timestamp,
      sliceState: data.sliceState,
      filesBackup: new Map(data.filesBackup),
      existingFiles: data.existingFiles,
    };
  }
}
