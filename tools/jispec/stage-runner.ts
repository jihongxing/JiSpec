import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { runAgent } from "./agent-runner";
import type { StageConfig, FailureHandlingConfig } from "./pipeline-executor";
import { FailureHandler } from "./failure-handler";

/**
 * 阶段运行选项
 */
export interface StageRunOptions {
  sliceId: string;
  stageConfig: StageConfig;
  dryRun?: boolean;
  skipValidation?: boolean;
  failureConfig?: FailureHandlingConfig;
}

/**
 * 阶段运行结果
 */
export interface StageRunResult {
  success: boolean;
  retries: number;
  error?: string;
}

/**
 * 阶段运行器
 *
 * 功能：
 * 1. 运行单个阶段
 * 2. 调用 Agent Runner
 * 3. 应用约束检查
 * 4. 更新状态和门控
 */
export class StageRunner {
  private root: string;

  private constructor(root: string) {
    this.root = root;
  }

  /**
   * 创建阶段运行器
   */
  static create(root: string): StageRunner {
    return new StageRunner(root);
  }

  /**
   * 运行阶段
   */
  async run(options: StageRunOptions): Promise<StageRunResult> {
    const { sliceId, stageConfig, dryRun, skipValidation, failureConfig } = options;

    let attempt = 0;
    let lastError: Error | undefined;
    const failureHandler = failureConfig ? new FailureHandler(this.root, failureConfig) : null;

    while (true) {
      attempt++;

      try {
        // 创建快照（如果启用回滚）
        if (failureHandler && attempt === 1) {
          await failureHandler.createSnapshot(sliceId, stageConfig.id);
        }

        // 1. 运行 Agent
        console.log(`[Stage: ${stageConfig.id}] Loading agent: ${stageConfig.agent}`);
        console.log(`[Stage: ${stageConfig.id}] Inputs: ${this.formatFileList(stageConfig.inputs.files)}`);
        console.log(`[Stage: ${stageConfig.id}] Outputs: ${this.formatFileList(stageConfig.outputs.files)}`);

        const agentResult = await runAgent({
          root: this.root,
          role: stageConfig.agent,
          target: sliceId,
          dryRun,
        });

        if (!agentResult.success) {
          throw new Error(agentResult.error || "Agent execution failed");
        }

        // 2. 更新生命周期状态
        if (!dryRun) {
          await this.updateLifecycleState(sliceId, stageConfig.lifecycle_state);
          console.log(`[Lifecycle] Advancing to: ${stageConfig.lifecycle_state}`);
        }

        // 3. 更新门控（阶段完成后）
        if (!dryRun && !skipValidation && stageConfig.gates.autoUpdate) {
          await this.updateGates(sliceId, stageConfig);
        }

        // 成功：清理快照
        if (failureHandler) {
          failureHandler.clearSnapshot(sliceId, stageConfig.id);
        }

        return {
          success: true,
          retries: attempt - 1,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 如果没有失败处理器，直接返回失败
        if (!failureHandler) {
          return {
            success: false,
            retries: attempt - 1,
            error: lastError.message,
          };
        }

        // 使用失败处理器
        const decision = await failureHandler.handleFailure({
          sliceId,
          stageId: stageConfig.id,
          error: lastError,
          attempt,
          startTime: new Date().toISOString(),
        });

        // 如果需要回滚
        if (decision.shouldRollback) {
          await failureHandler.rollback(sliceId, stageConfig.id);
        }

        // 如果不重试，返回失败
        if (!decision.shouldRetry) {
          return {
            success: false,
            retries: attempt - 1,
            error: lastError.message,
          };
        }

        // 等待后重试
        if (decision.delay && decision.delay > 0) {
          await this.sleep(decision.delay);
        }
      }
    }
  }

  /**
   * 睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 更新门控（阶段完成后）
   */
  private async updateGates(sliceId: string, stageConfig: StageConfig): Promise<void> {
    const sliceFile = this.findSliceFile(sliceId);
    const content = fs.readFileSync(sliceFile, "utf-8");
    const slice = yaml.load(content) as any;

    // 确保 gates 对象存在
    if (!slice.gates) {
      slice.gates = {};
    }

    // 设置当前阶段的 gates 为 true
    for (const gate of stageConfig.gates.required) {
      slice.gates[gate] = true;
      console.log(`[Gates] Set ${gate} = true`);
    }

    // 保存
    const updated = yaml.dump(slice);
    fs.writeFileSync(sliceFile, updated, "utf-8");
  }

  /**
   * 检查前置条件（已废弃 - 保留用于向后兼容）
   */
  private async checkPreconditions(sliceId: string, stageConfig: StageConfig): Promise<void> {
    // 新语义：gates 是阶段完成后设置的，不是运行前检查的
    // 此方法保留为空，避免破坏现有代码
    console.log(`[Gates] Precondition check skipped (new gate semantics)`);
  }

  /**
   * 更新生命周期状态
   */
  private async updateLifecycleState(sliceId: string, newState: string): Promise<void> {
    // 查找 slice.yaml
    const sliceFile = this.findSliceFile(sliceId);
    const content = fs.readFileSync(sliceFile, "utf-8");
    const slice = yaml.load(content) as any;

    // 更新状态
    if (!slice.lifecycle) {
      slice.lifecycle = {};
    }
    slice.lifecycle.state = newState;
    slice.lifecycle.updated_at = new Date().toISOString();

    // 保存
    const updated = yaml.dump(slice);
    fs.writeFileSync(sliceFile, updated, "utf-8");
  }

  /**
   * 查找 slice.yaml 文件
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
   * 格式化文件列表
   */
  private formatFileList(files: string[]): string {
    return files.map((f) => path.basename(f)).join(", ");
  }
}
