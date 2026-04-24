import blessed from "blessed";
import contrib from "blessed-contrib";
import type { PipelineProgress, StageProgress } from "./progress-tracker";

/**
 * TUI 可视化界面
 *
 * 功能：
 * 1. 实时显示流水线执行进度
 * 2. 阶段状态可视化
 * 3. 日志输出窗口
 * 4. 进度条和统计信息
 */
export class TUIVisualizer {
  private screen: blessed.Widgets.Screen;
  private grid: any;
  private widgets: {
    progressBar?: any;
    stageList?: blessed.Widgets.ListElement;
    logBox?: blessed.Widgets.Log;
    statsBox?: blessed.Widgets.BoxElement;
    timelineChart?: any;
  } = {};

  constructor() {
    // 创建屏幕
    this.screen = blessed.screen({
      smartCSR: true,
      title: "JiSpec Pipeline Execution",
    });

    // 创建网格布局
    this.grid = new contrib.grid({
      rows: 12,
      cols: 12,
      screen: this.screen,
    });

    this.setupUI();
    this.setupKeyBindings();
  }

  /**
   * 设置 UI 布局
   */
  private setupUI(): void {
    // 1. 顶部：统计信息
    this.widgets.statsBox = this.grid.set(0, 0, 2, 12, blessed.box, {
      label: "Pipeline Status",
      content: "Initializing...",
      tags: true,
      border: {
        type: "line",
      },
      style: {
        fg: "white",
        border: {
          fg: "cyan",
        },
      },
    });

    // 2. 左侧：阶段列表
    this.widgets.stageList = this.grid.set(2, 0, 6, 6, blessed.list, {
      label: "Stages",
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      border: {
        type: "line",
      },
      style: {
        fg: "white",
        border: {
          fg: "cyan",
        },
        selected: {
          bg: "blue",
          fg: "white",
        },
      },
      scrollbar: {
        ch: " ",
        inverse: true,
      },
    });

    // 3. 右侧：时间线图表
    this.widgets.timelineChart = this.grid.set(2, 6, 6, 6, contrib.bar, {
      label: "Stage Duration (seconds)",
      barWidth: 4,
      barSpacing: 6,
      xOffset: 0,
      maxHeight: 9,
      border: {
        type: "line",
      },
      style: {
        fg: "white",
        border: {
          fg: "cyan",
        },
      },
    });

    // 4. 底部：日志输出
    this.widgets.logBox = this.grid.set(8, 0, 4, 12, blessed.log, {
      label: "Logs",
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: " ",
        inverse: true,
      },
      border: {
        type: "line",
      },
      style: {
        fg: "white",
        border: {
          fg: "cyan",
        },
      },
    });
  }

  /**
   * 设置键盘绑定
   */
  private setupKeyBindings(): void {
    // Q 或 Ctrl+C 退出
    this.screen.key(["q", "C-c"], () => {
      return process.exit(0);
    });

    // 刷新屏幕
    this.screen.key(["r"], () => {
      this.screen.render();
    });
  }

  /**
   * 更新进度
   */
  updateProgress(progress: PipelineProgress): void {
    // 1. 更新统计信息
    this.updateStats(progress);

    // 2. 更新阶段列表
    this.updateStageList(progress.stages);

    // 3. 更新时间线图表
    this.updateTimeline(progress.stages);

    // 4. 渲染屏幕
    this.screen.render();
  }

  /**
   * 更新统计信息
   */
  private updateStats(progress: PipelineProgress): void {
    const completed = progress.stages.filter((s) => s.status === "completed").length;
    const failed = progress.stages.filter((s) => s.status === "failed").length;
    const running = progress.stages.filter((s) => s.status === "running").length;
    const total = progress.stages.length;

    const percentage = Math.floor((completed / total) * 100);

    let statusColor = "green";
    if (progress.status === "failed") {
      statusColor = "red";
    } else if (progress.status === "running") {
      statusColor = "yellow";
    }

    const content = [
      `{bold}Slice:{/bold} ${progress.sliceId}`,
      `{bold}Pipeline:{/bold} ${progress.pipelineName}`,
      `{bold}Status:{/bold} {${statusColor}-fg}${progress.status.toUpperCase()}{/${statusColor}-fg}`,
      `{bold}Progress:{/bold} ${completed}/${total} (${percentage}%)`,
      `{bold}Running:{/bold} ${running} | {green-fg}Completed:{/green-fg} ${completed} | {red-fg}Failed:{/red-fg} ${failed}`,
    ].join("  |  ");

    this.widgets.statsBox?.setContent(content);
  }

  /**
   * 更新阶段列表
   */
  private updateStageList(stages: StageProgress[]): void {
    const items = stages.map((stage) => {
      const icon = this.getStatusIcon(stage.status);
      const color = this.getStatusColor(stage.status);
      const duration = stage.duration ? `(${Math.floor(stage.duration / 1000)}s)` : "";

      return `{${color}-fg}${icon}{/${color}-fg} ${stage.stageId} ${duration}`;
    });

    this.widgets.stageList?.setItems(items);
  }

  /**
   * 更新时间线图表
   */
  private updateTimeline(stages: StageProgress[]): void {
    const completedStages = stages.filter((s) => s.duration !== undefined);

    if (completedStages.length === 0) {
      return;
    }

    const titles = completedStages.map((s) => s.stageId.substring(0, 10));
    const data = completedStages.map((s) => Math.floor(s.duration! / 1000));

    this.widgets.timelineChart?.setData({
      titles,
      data,
    });
  }

  /**
   * 添加日志
   */
  log(message: string, level: "info" | "warn" | "error" = "info"): void {
    const timestamp = new Date().toISOString().substring(11, 19);
    let color = "white";

    switch (level) {
      case "warn":
        color = "yellow";
        break;
      case "error":
        color = "red";
        break;
    }

    this.widgets.logBox?.log(`{gray-fg}[${timestamp}]{/gray-fg} {${color}-fg}${message}{/${color}-fg}`);
    this.screen.render();
  }

  /**
   * 显示完成消息
   */
  showCompletion(success: boolean, duration: number): void {
    const message = success
      ? `{green-fg}{bold}✓ Pipeline completed successfully!{/bold}{/green-fg}`
      : `{red-fg}{bold}✗ Pipeline failed!{/bold}{/red-fg}`;

    const durationStr = this.formatDuration(duration);

    this.log(`${message} Total time: ${durationStr}`, success ? "info" : "error");

    // 显示完成对话框
    const box = blessed.box({
      parent: this.screen,
      top: "center",
      left: "center",
      width: 60,
      height: 8,
      content: `${message}\n\nTotal Duration: ${durationStr}\n\nPress 'q' to exit`,
      tags: true,
      border: {
        type: "line",
      },
      style: {
        fg: "white",
        bg: success ? "green" : "red",
        border: {
          fg: success ? "green" : "red",
        },
      },
    });

    this.screen.render();
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

  /**
   * 获取状态颜色
   */
  private getStatusColor(status: string): string {
    switch (status) {
      case "completed":
        return "green";
      case "failed":
        return "red";
      case "running":
        return "yellow";
      case "skipped":
        return "gray";
      case "pending":
      default:
        return "white";
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
   * 渲染屏幕
   */
  render(): void {
    this.screen.render();
  }

  /**
   * 销毁界面
   */
  destroy(): void {
    this.screen.destroy();
  }
}
