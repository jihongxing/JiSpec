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
import { SemanticValidator } from "./semantic-validator";
import { FilesystemStorage } from "./filesystem-storage";
import { fromPath, identityEquals, encodeIdentity, type ArtifactIdentity } from "./artifact-identity.js";

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
  private storage: FilesystemStorage;

  private constructor(root: string) {
    this.root = root;
    this.storage = new FilesystemStorage(root);
  }

  /**
   * 读取 slice 状态
   */
  private readSlice(sliceId: string): any {
    const sliceFile = this.findSliceFile(sliceId);
    const content = this.storage.readFileSync(sliceFile, "utf-8") as string;
    return yaml.load(content);
  }

  /**
   * 写入 slice 状态
   */
  private writeSlice(sliceId: string, sliceData: any): void {
    const sliceFile = this.findSliceFile(sliceId);
    const content = yaml.dump(sliceData);
    this.storage.writeFileSync(sliceFile, content, "utf-8");
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
          await this.applyExecutionResult(sliceId, stageConfig, agentResult.executionResult, contract);
        } else if (dryRun && agentResult.executionResult) {
          // Dry-run: display structured result
          this.displayExecutionResult(agentResult.executionResult);
        }

        let nextSliceState: any | undefined;

        if (!dryRun) {
          nextSliceState = this.buildNextLifecycleState(sliceId, stageConfig.lifecycle_state);
        }

        // 3. 成功：先创建快照（带目标 lifecycle），确保后续写状态前已有可回滚点
        if (failureHandler && !dryRun && nextSliceState) {
          await failureHandler.createSnapshot(sliceId, stageConfig.id, nextSliceState);
        }

        // 4. 更新生命周期状态
        if (!dryRun && nextSliceState) {
          this.writeSlice(sliceId, nextSliceState);
          console.log(`[Lifecycle] Advancing to: ${stageConfig.lifecycle_state}`);
        }

        // Test injection point: fail after lifecycle update
        if (process.env.JISPEC_TEST_FAIL_AFTER_LIFECYCLE === stageConfig.id) {
          throw new Error(`Injected test failure for stage: ${stageConfig.id}`);
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
          // 回滚到最近的稳定 snapshot（排除当前失败阶段）
          await failureHandler.rollbackToLatest(sliceId, stageConfig.id);
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

    // 写入操作（新格式）
    if (result.writeOperations && result.writeOperations.length > 0) {
      console.log(`\nWrite Operations (${result.writeOperations.length}):`);
      for (const op of result.writeOperations) {
        if (op.type === "directory") {
          console.log(`  - [DIR] ${op.path}`);
        } else {
          console.log(`  - [FILE] ${op.path}`);
          console.log(`    Encoding: ${op.encoding || "utf-8"}`);
          console.log(`    Content length: ${op.content?.length || 0} bytes`);
        }
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
    result: StageExecutionResult,
    contract: ResolvedStageContract
  ): Promise<void> {
    console.log(`\n[Apply] Applying execution result...`);

    // 0. Semantic validation
    const semanticValidator = new SemanticValidator(this.root);
    const slice = this.readSlice(sliceId);

    const validationContext = {
      sliceId,
      stageId: stageConfig.id,
      contextId: slice.context_id,
      serviceId: slice.service_id
    };

    const semanticResult = semanticValidator.validateExecutionResult(validationContext, result);
    if (!semanticResult.valid) {
      console.error(`[Apply] ✗ Semantic validation failed:`);
      for (const error of semanticResult.errors) {
        console.error(`  - [${error.type}] ${error.message}`);
        if (error.details) {
          console.error(`    Details: ${JSON.stringify(error.details)}`);
        }
      }
      throw new Error(`Semantic validation failed with ${semanticResult.errors.length} error(s)`);
    }
    console.log(`[Apply] ✓ Semantic validation passed`);

    // 1. 写入文件
    for (const write of result.writes) {
      let targetPath = write.path;

      // If identity is provided, validate and use identity-first resolution
      if (write.identity) {
        const resolvedPath = this.storage.resolveArtifactPath(write.identity);

        // Normalize both paths for strict comparison
        const normalizedWritePath = path.resolve(write.path);
        const normalizedResolvedPath = path.resolve(resolvedPath);

        // Strict path equality check
        if (normalizedWritePath !== normalizedResolvedPath) {
          throw new Error(
            `Identity-path mismatch for write: identity=${encodeIdentity(write.identity)}, ` +
            `path=${write.path}, resolved=${resolvedPath}`
          );
        }

        targetPath = resolvedPath;
        console.log(`[Apply] Writing ${write.path} (identity: ${encodeIdentity(write.identity)})...`);
      } else {
        console.log(`[Apply] Writing ${write.path}...`);
      }

      const encoding = (write.encoding || "utf-8") as BufferEncoding;
      this.storage.writeFileSync(targetPath, write.content, encoding);
      console.log(`[Apply] ✓ Written`);
    }

    // 1b. 应用新的写入操作（支持目录创建）
    if (result.writeOperations && result.writeOperations.length > 0) {
      for (const op of result.writeOperations) {
        // Validate identity if provided
        if (op.identity) {
          // Verify identity is well-formed
          if (!op.identity.sliceId || !op.identity.artifactId || !op.identity.artifactType) {
            throw new Error(
              `Malformed identity for write operation: ${JSON.stringify(op.identity)}`
            );
          }

          // For file operations, validate identity-path consistency
          if (op.type === "file") {
            const resolvedPath = this.storage.resolveArtifactPath(op.identity);
            const normalizedOpPath = path.normalize(op.path);
            const normalizedResolvedPath = path.normalize(resolvedPath);

            if (normalizedOpPath !== normalizedResolvedPath) {
              throw new Error(
                `Identity-path mismatch for writeOperation: identity=${encodeIdentity(op.identity)}, ` +
                `path=${op.path}, resolved=${resolvedPath}`
              );
            }
          }
        }

        if (op.type === "directory") {
          let targetPath = op.path;

          // If identity is provided, use identity-first resolution
          if (op.identity) {
            const resolvedPath = this.storage.resolveArtifactPath(op.identity);

            // For directories, we need to validate the path matches
            const normalizedOpPath = path.resolve(op.path);
            const normalizedResolvedPath = path.resolve(resolvedPath);

            // Strict path equality check
            if (normalizedOpPath !== normalizedResolvedPath) {
              throw new Error(
                `Identity-path mismatch for directory: identity=${encodeIdentity(op.identity)}, ` +
                `path=${op.path}, resolved=${resolvedPath}`
              );
            }

            targetPath = resolvedPath;
            console.log(`[Apply] Creating directory ${op.path} (identity: ${encodeIdentity(op.identity)})...`);
          } else {
            console.log(`[Apply] Creating directory ${op.path}...`);
          }

          this.storage.mkdirSync(targetPath);
          console.log(`[Apply] ✓ Directory created`);
        } else if (op.type === "file") {
          console.log(`[Apply] Writing ${op.path}...`);
          const encoding = (op.encoding || "utf-8") as BufferEncoding;
          this.storage.writeFileSync(op.path, op.content || "", encoding);
          console.log(`[Apply] ✓ Written`);
        }
      }
    }

    // 2. 更新门控（先更新，后续验证才能通过）
    if (stageConfig.gates.autoUpdate) {
      console.log(`\n[Apply] Updating gates...`);

      // 如果 result 包含 gateUpdates，使用它们；否则使用 stageConfig
      if (result.gateUpdates && result.gateUpdates.length > 0) {
        console.log(`[Apply] Using ${result.gateUpdates.length} gate update(s) from execution result`);
        await this.applyGateUpdates(sliceId, result.gateUpdates);
      } else {
        console.log(`[Apply] Using gate config from stage (fallback)`);
        await this.updateGates(sliceId, stageConfig);
      }

      console.log(`[Apply] ✓ Gates updated`);
    }

    // 3. 更新追溯链接（先更新，后续验证才能通过）
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

    // 4. 验证输出文件（使用契约解析后的真实路径）
    console.log(`\n[Apply] Validating outputs...`);
    const outputValidator = OutputValidator.create(
      {
        files: contract.outputs.map(o => o.path),
        schemas: contract.outputs.map(o => o.schema).filter(Boolean) as string[],
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

    // 5. 验证门控
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
      await this.saveEvidence(sliceId, stageConfig.id, result.evidence);
      console.log(`[Apply] ✓ Evidence recorded`);
    }

    console.log(`\n[Apply] ✓ Execution result applied successfully`);
  }

  /**
   * 更新门控（阶段完成后）
   */
  private async updateGates(sliceId: string, stageConfig: StageConfig): Promise<void> {
    const slice = this.readSlice(sliceId);

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
    this.writeSlice(sliceId, slice);
  }

  /**
   * 应用门控更新（从执行结果）
   */
  private async applyGateUpdates(sliceId: string, gateUpdates: any[]): Promise<void> {
    const slice = this.readSlice(sliceId);

    // 确保 gates 对象存在
    if (!slice.gates) {
      slice.gates = {};
    }

    // 应用每个门控更新
    for (const update of gateUpdates) {
      slice.gates[update.gate] = update.passed;
      console.log(`[Gates] Set ${update.gate} = ${update.passed}${update.reason ? ` (${update.reason})` : ''}`);
    }

    // 保存
    this.writeSlice(sliceId, slice);
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
   * 构建下一个生命周期状态
   */
  private buildNextLifecycleState(sliceId: string, newState: string): any {
    const slice = this.readSlice(sliceId);

    // 更新状态
    if (!slice.lifecycle) {
      slice.lifecycle = {};
    }
    slice.lifecycle.state = newState;
    slice.lifecycle.updated_at = new Date().toISOString();

    return slice;
  }

  /**
   * 查找 slice.yaml 文件
   */
  private findSliceFile(sliceId: string): string {
    const contextsDir = path.join(this.root, "contexts");
    const contexts = this.storage.listFilesSync(contextsDir);

    for (const context of contexts) {
      const contextDir = path.join(contextsDir, context);
      if (!this.storage.existsSync(contextDir)) continue;

      const slicesDir = path.join(contextDir, "slices");
      if (!this.storage.existsSync(slicesDir)) continue;

      const slices = this.storage.listFilesSync(slicesDir);
      for (const slice of slices) {
        const sliceDir = path.join(slicesDir, slice);
        if (!this.storage.existsSync(sliceDir)) continue;

        const sliceFile = path.join(sliceDir, "slice.yaml");
        if (!this.storage.existsSync(sliceFile)) continue;

        const content = this.storage.readFileSync(sliceFile, "utf-8") as string;
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
   * 保存证据
   */
  private async saveEvidence(sliceId: string, stageId: string, evidence: any[]): Promise<void> {
    // 创建证据目录
    const evidenceDir = path.join(this.root, ".jispec", "evidence", sliceId);
    this.storage.mkdirSync(evidenceDir);

    // 生成证据文件名（带时间戳）
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const evidenceFile = path.join(evidenceDir, `${stageId}-${timestamp}.json`);

    // 保存证据
    const evidenceData = {
      sliceId,
      stageId,
      timestamp: new Date().toISOString(),
      evidence,
    };

    this.storage.writeFileSync(evidenceFile, JSON.stringify(evidenceData, null, 2), "utf-8");
  }

  /**
   * 解析阶段契约
   */
  private resolveStageContract(sliceId: string, stageConfig: StageConfig): ResolvedStageContract {
    const slice = this.readSlice(sliceId);
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
