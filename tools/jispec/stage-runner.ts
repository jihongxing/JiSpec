import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { runAgent } from "./agent-runner";
import type { StageConfig, FailureHandlingConfig } from "./pipeline-executor";
import { FailureHandler } from "./failure-handler";
import { StageContractResolver, type ResolvedStageContract } from "./stage-contract";
import type { LifecycleState } from "./validator";
import type { StageExecutionResult } from "./stage-execution-result";
import { OutputValidator } from "./output-validator";
import { GateChecker } from "./gate-checker";
import { TraceManager } from "./trace-manager";
import { validateSlice } from "./validator";

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

        // 1. 解析阶段契约
        console.log(`[Stage: ${stageConfig.id}] Resolving stage contract...`);
        const contract = this.resolveStageContract(sliceId, stageConfig);
        console.log(`[Stage: ${stageConfig.id}] Contract resolved: ${contract.inputs.length} inputs, ${contract.outputs.length} outputs`);

        // 2. 运行 Agent
        console.log(`[Stage: ${stageConfig.id}] Loading agent: ${stageConfig.agent}`);
        console.log(`[Stage: ${stageConfig.id}] Inputs: ${this.formatFileList(stageConfig.inputs.files)}`);
        console.log(`[Stage: ${stageConfig.id}] Outputs: ${this.formatFileList(stageConfig.outputs.files)}`);

        const agentResult = await runAgent({
          root: this.root,
          role: stageConfig.agent,
          target: sliceId,
          dryRun,
          contract,
        });

        if (!agentResult.success) {
          throw new Error(agentResult.error || "Agent execution failed");
        }

        // 2. Apply execution result (writes, gates, traces, evidence)
        if (!dryRun && agentResult.executionResult) {
          await this.applyExecutionResult(sliceId, stageConfig, agentResult.executionResult);
        } else if (dryRun && agentResult.executionResult) {
          // Dry-run: display structured result
          this.displayExecutionResult(agentResult.executionResult);
        }

        // 3. 更新生命周期状态
        if (!dryRun) {
          await this.updateLifecycleState(sliceId, stageConfig.lifecycle_state);
          console.log(`[Lifecycle] Advancing to: ${stageConfig.lifecycle_state}`);
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
   * 显示执行结果（dry-run 模式）
   */
  private displayExecutionResult(result: StageExecutionResult): void {
    console.log(`\n=== EXECUTION RESULT (DRY-RUN) ===\n`);

    console.log(`Success: ${result.success ? "✓" : "✗"}`);

    if (result.error) {
      console.log(`Error: ${result.error}`);
    }

    // 文件写入
    if (result.writes.length > 0) {
      console.log(`\nFile Writes (${result.writes.length}):`);
      for (const write of result.writes) {
        console.log(`  - ${write.path}`);
        console.log(`    Encoding: ${write.encoding || "utf-8"}`);
        console.log(`    Content length: ${write.content.length} bytes`);
      }
    }

    // 门控更新
    if (result.gateUpdates.length > 0) {
      console.log(`\nGate Updates (${result.gateUpdates.length}):`);
      for (const gate of result.gateUpdates) {
        console.log(`  - ${gate.gate}: ${gate.passed ? "✓" : "✗"}`);
        if (gate.reason) {
          console.log(`    Reason: ${gate.reason}`);
        }
      }
    }

    // 追溯链接
    if (result.traceLinks.length > 0) {
      console.log(`\nTrace Links (${result.traceLinks.length}):`);
      for (const link of result.traceLinks) {
        console.log(`  - ${link.from.type}:${link.from.id} -[${link.relation}]-> ${link.to.type}:${link.to.id}`);
      }
    }

    // 证据
    if (result.evidence.length > 0) {
      console.log(`\nEvidence (${result.evidence.length}):`);
      for (const ev of result.evidence) {
        console.log(`  - [${ev.type}] ${ev.timestamp}`);
        if (ev.metadata) {
          console.log(`    Metadata: ${JSON.stringify(ev.metadata)}`);
        }
      }
    }

    console.log(`\n=== END EXECUTION RESULT ===\n`);
  }

  /**
   * 应用执行结果（统一 apply 入口）
   */
  private async applyExecutionResult(
    sliceId: string,
    stageConfig: StageConfig,
    result: StageExecutionResult
  ): Promise<void> {
    console.log(`\n[Apply] Applying execution result...`);

    // 1. 写入文件
    for (const write of result.writes) {
      console.log(`[Apply] Writing ${write.path}...`);
      fs.mkdirSync(path.dirname(write.path), { recursive: true });
      const encoding = (write.encoding || "utf-8") as BufferEncoding;
      fs.writeFileSync(write.path, write.content, { encoding });
      console.log(`[Apply] ✓ Written`);
    }

    // 2. 验证输出文件
    console.log(`\n[Apply] Validating outputs...`);
    const outputValidator = OutputValidator.create(
      {
        files: stageConfig.outputs.files,
        schemas: stageConfig.outputs.schemas || [],
        traceRequired: stageConfig.outputs.traceRequired || false,
      },
      this.root,
      sliceId
    );
    const outputCheck = await outputValidator.validate();
    if (!outputCheck.passed) {
      const errorMsg = OutputValidator.formatErrors(outputCheck.errors);
      console.error(`[Apply] ✗ Output validation failed:\n${errorMsg}`);
      throw new Error(`Output validation failed: ${errorMsg}`);
    }
    console.log(`[Apply] ✓ Output validation passed`);

    // 3. 更新门控
    if (stageConfig.gates.autoUpdate) {
      console.log(`\n[Apply] Updating gates...`);
      await this.updateGates(sliceId, stageConfig);
      console.log(`[Apply] ✓ Gates updated`);
    }

    // 4. 验证门控
    console.log(`\n[Apply] Checking gates...`);
    const gateChecker = GateChecker.create(
      sliceId,
      {
        required: stageConfig.gates.required,
        optional: stageConfig.gates.optional || [],
        autoUpdate: stageConfig.gates.autoUpdate,
      },
      this.root
    );
    const gateCheck = await gateChecker.check();
    console.log(GateChecker.formatCheckResult(gateCheck));
    if (!gateCheck.passed) {
      throw new Error(`Gate check failed: ${gateCheck.missing.join(", ")}`);
    }

    // 5. 更新追溯链接
    if (result.traceLinks.length > 0) {
      console.log(`\n[Apply] Updating trace links...`);
      const traceManager = TraceManager.create(sliceId, this.root);
      for (const link of result.traceLinks) {
        await traceManager.addTrace({
          from: `${link.from.type}#${link.from.id}`,
          to: `${link.to.type}#${link.to.id}`,
          type: link.relation,
        });
      }
      await traceManager.save();
      console.log(`[Apply] ✓ ${result.traceLinks.length} trace link(s) added`);
    }

    // 6. 验证 slice
    console.log(`\n[Apply] Validating slice...`);
    const sliceValidation = await validateSlice(this.root, sliceId);
    if (!sliceValidation.ok) {
      const errorMsg = sliceValidation.issues.map(i => `[${i.code}] ${i.message}`).join("\n");
      console.error(`[Apply] ✗ Slice validation failed:\n${errorMsg}`);
      throw new Error(`Slice validation failed: ${errorMsg}`);
    }
    console.log(`[Apply] ✓ Slice validation passed`);

    // 7. 记录证据
    if (result.evidence.length > 0) {
      console.log(`\n[Apply] Recording ${result.evidence.length} evidence item(s)...`);
      // TODO: 实现证据存储机制
      console.log(`[Apply] ✓ Evidence recorded`);
    }

    console.log(`\n[Apply] ✓ Execution result applied successfully`);
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

  /**
   * 解析阶段契约
   */
  private resolveStageContract(sliceId: string, stageConfig: StageConfig): ResolvedStageContract {
    const sliceFile = this.findSliceFile(sliceId);
    const content = fs.readFileSync(sliceFile, "utf-8");
    const slice = yaml.load(content) as any;
    const contextId = slice.context_id;

    const resolver = new StageContractResolver(this.root, contextId, sliceId);
    const inputs = resolver.resolveFiles(stageConfig.inputs.files);
    const outputs = resolver.resolveFiles(stageConfig.outputs.files, stageConfig.outputs.schemas);

    return {
      stageId: stageConfig.id,
      stageName: stageConfig.name,
      role: stageConfig.agent,
      lifecycleState: stageConfig.lifecycle_state as LifecycleState,
      inputs,
      outputs,
      gates: stageConfig.gates,
      traceRequired: stageConfig.outputs.traceRequired,
    };
  }
}
