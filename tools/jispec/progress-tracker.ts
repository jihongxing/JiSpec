import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

/**
 * 进度事件类型
 */
export type ProgressEventType =
  | "pipeline_start"
  | "pipeline_end"
  | "stage_start"
  | "stage_end"
  | "stage_retry"
  | "stage_skip"
  | "snapshot_created"
  | "rollback_executed";

/**
 * 进度事件
 */
export interface ProgressEvent {
  type: ProgressEventType;
  timestamp: string;
  sliceId: string;
  stageId?: string;
  data?: any;
}

/**
 * 阶段进度
 */
export interface StageProgress {
  stageId: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startTime?: string;
  endTime?: string;
  duration?: number;
  retries: number;
  error?: string;
}

/**
 * 流水线进度
 */
export interface PipelineProgress {
  sliceId: string;
  pipelineName: string;
  status: "running" | "completed" | "failed";
  startTime: string;
  endTime?: string;
  duration?: number;
  currentStage?: string;
  stages: StageProgress[];
  events: ProgressEvent[];
}

/**
 * 进度跟踪器
 *
 * 功能：
 * 1. 记录流水线执行进度
 * 2. 持久化进度状态
 * 3. 生成进度报告
 * 4. 支持恢复中断的流水线
 */
export class ProgressTracker {
  private root: string;
  private progress: PipelineProgress;
  private logFile?: string;
  private logLevel: "debug" | "info" | "warn" | "error";

  constructor(
    root: string,
    sliceId: string,
    pipelineName: string,
    stages: string[],
    options?: {
      logFile?: string;
      logLevel?: "debug" | "info" | "warn" | "error";
    }
  ) {
    this.root = root;
    this.logFile = options?.logFile;
    this.logLevel = options?.logLevel || "info";

    this.progress = {
      sliceId,
      pipelineName,
      status: "running",
      startTime: new Date().toISOString(),
      stages: stages.map((stageId) => ({
        stageId,
        status: "pending",
        retries: 0,
      })),
      events: [],
    };

    this.recordEvent({
      type: "pipeline_start",
      timestamp: this.progress.startTime,
      sliceId,
    });
  }

  /**
   * 从持久化状态恢复
   */
  static restore(root: string, sliceId: string): ProgressTracker | null {
    const progressFile = path.join(root, ".jispec", "progress", `${sliceId}.yaml`);

    if (!fs.existsSync(progressFile)) {
      return null;
    }

    const content = fs.readFileSync(progressFile, "utf-8");
    const data = yaml.load(content) as PipelineProgress;

    const tracker = Object.create(ProgressTracker.prototype);
    tracker.root = root;
    tracker.progress = data;
    tracker.logLevel = "info";

    return tracker;
  }

  /**
   * 记录阶段开始
   */
  stageStart(stageId: string): void {
    const stage = this.findStage(stageId);
    if (!stage) return;

    stage.status = "running";
    stage.startTime = new Date().toISOString();
    this.progress.currentStage = stageId;

    this.recordEvent({
      type: "stage_start",
      timestamp: stage.startTime,
      sliceId: this.progress.sliceId,
      stageId,
    });

    this.log("info", `Stage '${stageId}' started`);
    this.persist();
  }

  /**
   * 记录阶段结束
   */
  stageEnd(stageId: string, success: boolean, error?: string): void {
    const stage = this.findStage(stageId);
    if (!stage) return;

    stage.status = success ? "completed" : "failed";
    stage.endTime = new Date().toISOString();
    stage.error = error;

    if (stage.startTime) {
      stage.duration = new Date(stage.endTime).getTime() - new Date(stage.startTime).getTime();
    }

    this.recordEvent({
      type: "stage_end",
      timestamp: stage.endTime,
      sliceId: this.progress.sliceId,
      stageId,
      data: { success, error },
    });

    this.log(success ? "info" : "error", `Stage '${stageId}' ${success ? "completed" : "failed"}`);
    this.persist();
  }

  /**
   * 记录阶段重试
   */
  stageRetry(stageId: string, attempt: number): void {
    const stage = this.findStage(stageId);
    if (!stage) return;

    stage.retries = attempt - 1;

    this.recordEvent({
      type: "stage_retry",
      timestamp: new Date().toISOString(),
      sliceId: this.progress.sliceId,
      stageId,
      data: { attempt },
    });

    this.log("warn", `Stage '${stageId}' retry attempt ${attempt}`);
    this.persist();
  }

  /**
   * 记录阶段跳过
   */
  stageSkip(stageId: string, reason: string): void {
    const stage = this.findStage(stageId);
    if (!stage) return;

    stage.status = "skipped";

    this.recordEvent({
      type: "stage_skip",
      timestamp: new Date().toISOString(),
      sliceId: this.progress.sliceId,
      stageId,
      data: { reason },
    });

    this.log("info", `Stage '${stageId}' skipped: ${reason}`);
    this.persist();
  }

  /**
   * 记录快照创建
   */
  snapshotCreated(stageId: string): void {
    this.recordEvent({
      type: "snapshot_created",
      timestamp: new Date().toISOString(),
      sliceId: this.progress.sliceId,
      stageId,
    });

    this.log("debug", `Snapshot created for stage '${stageId}'`);
  }

  /**
   * 记录回滚执行
   */
  rollbackExecuted(stageId: string): void {
    this.recordEvent({
      type: "rollback_executed",
      timestamp: new Date().toISOString(),
      sliceId: this.progress.sliceId,
      stageId,
    });

    this.log("warn", `Rollback executed for stage '${stageId}'`);
  }

  /**
   * 完成流水线
   */
  complete(success: boolean): void {
    this.progress.status = success ? "completed" : "failed";
    this.progress.endTime = new Date().toISOString();
    this.progress.duration =
      new Date(this.progress.endTime).getTime() - new Date(this.progress.startTime).getTime();

    this.recordEvent({
      type: "pipeline_end",
      timestamp: this.progress.endTime,
      sliceId: this.progress.sliceId,
      data: { success },
    });

    this.log("info", `Pipeline ${success ? "completed" : "failed"}`);
    this.persist();
  }

  /**
   * 获取当前进度
   */
  getProgress(): PipelineProgress {
    return { ...this.progress };
  }

  /**
   * 生成进度报告（Markdown）
   */
  generateMarkdownReport(): string {
    const lines: string[] = [];

    lines.push(`# Pipeline Progress Report`);
    lines.push("");
    lines.push(`**Slice:** ${this.progress.sliceId}`);
    lines.push(`**Pipeline:** ${this.progress.pipelineName}`);
    lines.push(`**Status:** ${this.progress.status}`);
    lines.push(`**Started:** ${this.progress.startTime}`);
    if (this.progress.endTime) {
      lines.push(`**Ended:** ${this.progress.endTime}`);
      lines.push(`**Duration:** ${this.formatDuration(this.progress.duration!)}`);
    }
    lines.push("");

    lines.push("## Stages");
    lines.push("");

    for (const stage of this.progress.stages) {
      const icon = this.getStatusIcon(stage.status);
      lines.push(`### ${icon} ${stage.stageId}`);
      lines.push("");
      lines.push(`- **Status:** ${stage.status}`);
      if (stage.startTime) {
        lines.push(`- **Started:** ${stage.startTime}`);
      }
      if (stage.endTime) {
        lines.push(`- **Ended:** ${stage.endTime}`);
        lines.push(`- **Duration:** ${this.formatDuration(stage.duration!)}`);
      }
      if (stage.retries > 0) {
        lines.push(`- **Retries:** ${stage.retries}`);
      }
      if (stage.error) {
        lines.push(`- **Error:** ${stage.error}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * 生成进度报告（JSON）
   */
  generateJsonReport(): string {
    return JSON.stringify(this.progress, null, 2);
  }

  /**
   * 生成进度报告（HTML）
   */
  generateHtmlReport(): string {
    const html: string[] = [];

    html.push("<!DOCTYPE html>");
    html.push("<html>");
    html.push("<head>");
    html.push("<title>Pipeline Progress Report</title>");
    html.push("<style>");
    html.push("body { font-family: Arial, sans-serif; margin: 20px; }");
    html.push("h1 { color: #333; }");
    html.push(".stage { margin: 20px 0; padding: 10px; border: 1px solid #ddd; }");
    html.push(".completed { background-color: #d4edda; }");
    html.push(".failed { background-color: #f8d7da; }");
    html.push(".running { background-color: #fff3cd; }");
    html.push(".pending { background-color: #f8f9fa; }");
    html.push(".skipped { background-color: #e2e3e5; }");
    html.push("</style>");
    html.push("</head>");
    html.push("<body>");
    html.push(`<h1>Pipeline Progress Report</h1>`);
    html.push(`<p><strong>Slice:</strong> ${this.progress.sliceId}</p>`);
    html.push(`<p><strong>Pipeline:</strong> ${this.progress.pipelineName}</p>`);
    html.push(`<p><strong>Status:</strong> ${this.progress.status}</p>`);
    html.push(`<p><strong>Started:</strong> ${this.progress.startTime}</p>`);
    if (this.progress.endTime) {
      html.push(`<p><strong>Ended:</strong> ${this.progress.endTime}</p>`);
      html.push(`<p><strong>Duration:</strong> ${this.formatDuration(this.progress.duration!)}</p>`);
    }

    html.push("<h2>Stages</h2>");
    for (const stage of this.progress.stages) {
      html.push(`<div class="stage ${stage.status}">`);
      html.push(`<h3>${stage.stageId}</h3>`);
      html.push(`<p><strong>Status:</strong> ${stage.status}</p>`);
      if (stage.startTime) {
        html.push(`<p><strong>Started:</strong> ${stage.startTime}</p>`);
      }
      if (stage.endTime) {
        html.push(`<p><strong>Ended:</strong> ${stage.endTime}</p>`);
        html.push(`<p><strong>Duration:</strong> ${this.formatDuration(stage.duration!)}</p>`);
      }
      if (stage.retries > 0) {
        html.push(`<p><strong>Retries:</strong> ${stage.retries}</p>`);
      }
      if (stage.error) {
        html.push(`<p><strong>Error:</strong> ${stage.error}</p>`);
      }
      html.push("</div>");
    }

    html.push("</body>");
    html.push("</html>");

    return html.join("\n");
  }

  /**
   * 记录事件
   */
  private recordEvent(event: ProgressEvent): void {
    this.progress.events.push(event);
  }

  /**
   * 查找阶段
   */
  private findStage(stageId: string): StageProgress | undefined {
    return this.progress.stages.find((s) => s.stageId === stageId);
  }

  /**
   * 持久化进度
   */
  private persist(): void {
    const progressDir = path.join(this.root, ".jispec", "progress");
    if (!fs.existsSync(progressDir)) {
      fs.mkdirSync(progressDir, { recursive: true });
    }

    const progressFile = path.join(progressDir, `${this.progress.sliceId}.yaml`);
    const content = yaml.dump(this.progress);
    fs.writeFileSync(progressFile, content, "utf-8");
  }

  /**
   * 记录日志
   */
  private log(level: "debug" | "info" | "warn" | "error", message: string): void {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    if (levels[level] < levels[this.logLevel]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    // 输出到控制台
    if (level === "error") {
      console.error(logMessage);
    } else if (level === "warn") {
      console.warn(logMessage);
    } else {
      console.log(logMessage);
    }

    // 写入日志文件
    if (this.logFile) {
      fs.appendFileSync(this.logFile, logMessage + "\n", "utf-8");
    }
  }

  /**
   * 格式化持续时间
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /**
   * 获取状态图标
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case "completed":
        return "✓";
      case "failed":
        return "✗";
      case "running":
        return "⟳";
      case "skipped":
        return "⊘";
      case "pending":
      default:
        return "○";
    }
  }
}
