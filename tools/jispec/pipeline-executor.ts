import path from "node:path";
import yaml from "js-yaml";
import type { AgentRole } from "./agent-runner";
import type { InputConstraint } from "./constraint-checker";
import type { OutputConstraint } from "./output-validator";
import type { GateConstraint } from "./gate-checker";
import { ProgressTracker } from "./progress-tracker";
import { ParallelExecutor } from "./parallel-executor";
import { FilesystemStorage } from "./filesystem-storage";

/**
 * 阶段配置
 */
export interface StageConfig {
  id: string;
  name: string;
  agent: AgentRole;
  lifecycle_state: string;
  inputs: InputConstraint;
  outputs: OutputConstraint;
  gates: GateConstraint;
  nextStage?: string;
}

/**
 * 失败处理配置
 */
export interface FailureHandlingConfig {
  retry: {
    enabled: boolean;
    max_attempts: number;
    backoff: "linear" | "exponential" | "fixed";
    initial_delay: number;
    max_delay: number;
  };
  rollback: {
    enabled: boolean;
    strategy: "state_only" | "full" | "none";
  };
  human_intervention: {
    enabled: boolean;
    prompt_on_failure: boolean;
    allow_skip: boolean;
    allow_manual_fix: boolean;
  };
}

/**
 * 并行执行配置
 */
export interface ParallelConfig {
  enabled: boolean;
  max_concurrent: number;
}

/**
 * 进度配置
 */
export interface ProgressConfig {
  log_level: "debug" | "info" | "warn" | "error";
  log_file: string;
  report_format: "markdown" | "json" | "html";
}

/**
 * 流水线配置
 */
export interface PipelineConfig {
  name: string;
  version: string;
  stages: StageConfig[];
  failure_handling: FailureHandlingConfig;
  parallel: ParallelConfig;
  progress: ProgressConfig;
}

/**
 * 流水线运行选项
 */
export interface PipelineRunOptions {
  from?: string;        // 从哪个阶段开始
  to?: string;          // 运行到哪个阶段
  dryRun?: boolean;     // Dry-run 模式
  skipValidation?: boolean;  // 跳过验证
  useTUI?: boolean;     // 使用 TUI 可视化
}

/**
 * 阶段结果
 */
export interface StageResult {
  stageId: string;
  success: boolean;
  startTime: string;
  endTime: string;
  duration: number;
  error?: string;
  retries: number;
}

/**
 * 流水线结果
 */
export interface PipelineResult {
  sliceId: string;
  success: boolean;
  startTime: string;
  endTime: string;
  duration: number;
  stagesCompleted: number;
  stagesTotal: number;
  stageResults: StageResult[];
  error?: string;
}

/**
 * 流水线执行器
 *
 * 功能：
 * 1. 加载流水线配置
 * 2. 执行阶段序列
 * 3. 状态推进
 * 4. 失败处理
 */
export class PipelineExecutor {
  private root: string;
  private config: PipelineConfig;
  private storage: FilesystemStorage;

  private constructor(root: string, config: PipelineConfig) {
    this.root = root;
    this.config = config;
    this.storage = new FilesystemStorage(root);
  }

  /**
   * 创建流水线执行器
   */
  static create(root: string): PipelineExecutor {
    const config = PipelineExecutor.loadConfig(root);
    return new PipelineExecutor(root, config);
  }

  /**
   * 运行流水线
   */
  async run(sliceId: string, options: PipelineRunOptions = {}): Promise<PipelineResult> {
    const startTime = new Date().toISOString();
    const stageResults: StageResult[] = [];

    console.log(`\n[Pipeline] Starting pipeline for slice: ${sliceId}`);
    console.log(`[Pipeline] Pipeline: ${this.config.name} v${this.config.version}\n`);

    // 初始化进度跟踪器
    const progressTracker = new ProgressTracker(
      this.root,
      sliceId,
      this.config.name,
      this.config.stages.map((s) => s.id),
      {
        logFile: this.config.progress.log_file,
        logLevel: this.config.progress.log_level,
      }
    );

    try {
      // 1. 获取当前状态
      const currentState = await this.getCurrentState(sliceId);
      console.log(`[Pipeline] Current state: ${currentState}`);

      // 2. 确定起始阶段
      const startStage = options.from || this.getNextStage(currentState);

      // 末态检查：如果已完成，直接返回成功
      if (!startStage) {
        console.log(`[Pipeline] Slice is in terminal state (${currentState}). Nothing to execute.\n`);
        const now = new Date().toISOString();
        return {
          success: true,
          sliceId,
          startTime: now,
          endTime: now,
          duration: 0,
          stagesCompleted: 0,
          stagesTotal: 0,
          stageResults: [],
        };
      }

      console.log(`[Pipeline] Starting from stage: ${startStage}\n`);

      // 3. 获取阶段序列
      const stages = this.getStageSequence(startStage, options.to);
      console.log(`[Pipeline] Stages to execute: ${stages.map((s) => s.id).join(" → ")}\n`);

      // 4. 执行阶段（串行或并行）
      if (this.config.parallel.enabled) {
        // 并行执行
        const parallelExecutor = new ParallelExecutor(this.root, this.config.parallel.max_concurrent);

        const results = await parallelExecutor.executeParallel(
          stages,
          sliceId,
          options,
          progressTracker,
          this.runStage.bind(this)
        );

        stageResults.push(...results);
      } else {
        // 串行执行
        for (const stage of stages) {
          console.log(`[Stage: ${stage.id}] ${stage.name}`);
          progressTracker.stageStart(stage.id);

          const stageResult = await this.runStage(sliceId, stage, options, progressTracker);
          stageResults.push(stageResult);

          if (!stageResult.success) {
            progressTracker.stageEnd(stage.id, false, stageResult.error);
            throw new Error(`Stage '${stage.id}' failed: ${stageResult.error}`);
          }

          progressTracker.stageEnd(stage.id, true);
          console.log(`[Stage: ${stage.id}] ✓ Stage completed\n`);
        }
      }

      // 5. 完成流水线
      progressTracker.complete(true);

      // 6. 生成报告
      const endTime = new Date().toISOString();
      const duration = new Date(endTime).getTime() - new Date(startTime).getTime();

      console.log(`[Pipeline] ✓ Pipeline completed successfully`);
      console.log(`[Pipeline] Total time: ${this.formatDuration(duration)}`);

      // 保存报告
      this.saveReport(sliceId, progressTracker);

      return {
        sliceId,
        success: true,
        startTime,
        endTime,
        duration,
        stagesCompleted: stageResults.length,
        stagesTotal: stages.length,
        stageResults,
      };
    } catch (error) {
      progressTracker.complete(false);

      const endTime = new Date().toISOString();
      const duration = new Date(endTime).getTime() - new Date(startTime).getTime();

      console.error(`[Pipeline] ✗ Pipeline failed: ${error instanceof Error ? error.message : String(error)}`);

      // 保存报告
      this.saveReport(sliceId, progressTracker);

      return {
        sliceId,
        success: false,
        startTime,
        endTime,
        duration,
        stagesCompleted: stageResults.filter((r) => r.success).length,
        stagesTotal: this.config.stages.length,
        stageResults,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 运行单个阶段
   */
  async runStage(
    sliceId: string,
    stage: StageConfig,
    options: PipelineRunOptions,
    progressTracker: ProgressTracker
  ): Promise<StageResult> {
    const startTime = new Date().toISOString();

    try {
      // 导入 StageRunner（避免循环依赖）
      const { StageRunner } = await import("./stage-runner");
      const runner = StageRunner.create(this.root);

      const result = await runner.run({
        sliceId,
        stageConfig: stage,
        dryRun: options.dryRun,
        skipValidation: options.skipValidation,
        failureConfig: this.config.failure_handling,
      });

      const endTime = new Date().toISOString();
      const duration = new Date(endTime).getTime() - new Date(startTime).getTime();

      // 记录重试次数
      if (result.retries > 0) {
        progressTracker.stageRetry(stage.id, result.retries + 1);
      }

      return {
        stageId: stage.id,
        success: result.success,
        startTime,
        endTime,
        duration,
        retries: result.retries || 0,
      };
    } catch (error) {
      const endTime = new Date().toISOString();
      const duration = new Date(endTime).getTime() - new Date(startTime).getTime();

      return {
        stageId: stage.id,
        success: false,
        startTime,
        endTime,
        duration,
        error: error instanceof Error ? error.message : String(error),
        retries: 0,
      };
    }
  }

  /**
   * 获取当前状态
   */
  private async getCurrentState(sliceId: string): Promise<string> {
    // 查找 slice.yaml
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
          return sliceData.lifecycle?.state || sliceData.status || "unknown";
        }
      }
    }

    throw new Error(`Slice not found: ${sliceId}`);
  }

  /**
   * 获取下一个阶段
   */
  private getNextStage(currentState: string): string {
    // 状态到阶段的映射
    const stateToStage: Record<string, string> = {
      "requirements-defined": "design",
      "design-defined": "behavior",
      "behavior-defined": "test",
      "test-defined": "implementing",
      "implementing": "verifying",
    };

    // 末态：verifying/accepted/released 无需执行
    const terminalStates = ["verifying", "accepted", "released"];
    if (terminalStates.includes(currentState)) {
      return ""; // 返回空字符串表示无需执行
    }

    return stateToStage[currentState] || "requirements";
  }

  /**
   * 获取阶段序列
   */
  private getStageSequence(from: string, to?: string): StageConfig[] {
    const fromIndex = this.config.stages.findIndex((s) => s.id === from);
    if (fromIndex === -1) {
      throw new Error(`Stage not found: ${from}`);
    }

    let toIndex = this.config.stages.length - 1;
    if (to) {
      toIndex = this.config.stages.findIndex((s) => s.id === to);
      if (toIndex === -1) {
        throw new Error(`Stage not found: ${to}`);
      }
    }

    if (fromIndex > toIndex) {
      throw new Error(`Invalid stage range: ${from} → ${to}`);
    }

    return this.config.stages.slice(fromIndex, toIndex + 1);
  }

  /**
   * 格式化持续时间
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  }

  /**
   * 加载流水线配置
   */
  private static loadConfig(root: string): PipelineConfig {
    const configPath = path.join(root, "agents", "pipeline.yaml");
    const storage = new FilesystemStorage(root);

    if (!storage.existsSync(configPath)) {
      throw new Error(`Pipeline configuration not found: ${configPath}`);
    }

    const content = storage.readFileSync(configPath, "utf-8") as string;
    const config = yaml.load(content) as any;

    // Support both formats: { pipeline: { ... } } and flat { name, stages, ... }
    return (config.pipeline || config) as PipelineConfig;
  }

  /**
   * 格式化流水线结果
   */
  static formatResult(result: PipelineResult): string {
    const lines: string[] = [];

    lines.push("\n=== Pipeline Execution Result ===\n");
    lines.push(`Slice: ${result.sliceId}`);
    lines.push(`Success: ${result.success ? "✓" : "✗"}`);
    lines.push(`Duration: ${Math.floor(result.duration / 1000)}s`);
    lines.push(`Stages: ${result.stagesCompleted}/${result.stagesTotal} completed\n`);

    if (result.error) {
      lines.push(`Error: ${result.error}\n`);
    }

    lines.push("Stage Results:");
    for (const stage of result.stageResults) {
      const status = stage.success ? "✓" : "✗";
      const duration = Math.floor(stage.duration / 1000);
      lines.push(`  ${status} ${stage.stageId} (${duration}s)`);
      if (stage.retries > 0) {
        lines.push(`    Retries: ${stage.retries}`);
      }
      if (stage.error) {
        lines.push(`    Error: ${stage.error}`);
      }
    }

    lines.push("");

    return lines.join("\n");
  }

  /**
   * 保存报告
   */
  private saveReport(sliceId: string, progressTracker: ProgressTracker): void {
    const reportDir = path.join(this.root, ".jispec", "reports");
    this.storage.mkdirSync(reportDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const format = this.config.progress.report_format;

    let content: string;
    let extension: string;

    switch (format) {
      case "json":
        content = progressTracker.generateJsonReport();
        extension = "json";
        break;
      case "html":
        content = progressTracker.generateHtmlReport();
        extension = "html";
        break;
      case "markdown":
      default:
        content = progressTracker.generateMarkdownReport();
        extension = "md";
        break;
    }

    const reportFile = path.join(reportDir, `${sliceId}-${timestamp}.${extension}`);
    this.storage.writeFileSync(reportFile, content, "utf-8");

    console.log(`[Report] Saved to: ${reportFile}`);
  }
}
