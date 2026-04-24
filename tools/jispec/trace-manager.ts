import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

/**
 * 追溯条目
 */
export interface TraceEntry {
  from: string;              // 源产物（例如：behaviors.feature#scenario-1）
  to: string;                // 目标产物（例如：requirements.md#FR-001）
  type: string;              // 关系类型（implements, derives, tests, etc.）
  metadata?: Record<string, unknown>;  // 额外元数据
}

/**
 * 追溯验证结果
 */
export interface TraceVerifyResult {
  passed: boolean;
  errors: TraceError[];
}

/**
 * 追溯错误
 */
export interface TraceError {
  type: "missing" | "invalid" | "broken_link";
  message: string;
  entry?: TraceEntry;
}

/**
 * 追溯链数据结构
 */
interface TraceData {
  slice_id: string;
  traces: TraceEntry[];
  metadata?: {
    last_updated?: string;
    version?: string;
  };
}

/**
 * 追溯管理器
 *
 * 功能：
 * 1. 自动生成追溯链条目
 * 2. 验证追溯链完整性
 * 3. 更新 trace.yaml
 */
export class TraceManager {
  private sliceId: string;
  private traceFile: string;
  private traces: TraceEntry[] = [];

  private constructor(sliceId: string) {
    this.sliceId = sliceId;
    this.traceFile = this.findTraceFile(sliceId);
    this.loadTraces();
  }

  /**
   * 创建追溯管理器
   */
  static create(sliceId: string): TraceManager {
    return new TraceManager(sliceId);
  }

  /**
   * 添加追溯条目
   */
  async addTrace(entry: TraceEntry): Promise<void> {
    // 检查是否已存在相同的追溯
    const exists = this.traces.some(
      (t) => t.from === entry.from && t.to === entry.to && t.type === entry.type
    );

    if (!exists) {
      this.traces.push(entry);
    }
  }

  /**
   * 批量添加追溯条目
   */
  async addTraces(entries: TraceEntry[]): Promise<void> {
    for (const entry of entries) {
      await this.addTrace(entry);
    }
  }

  /**
   * 移除追溯条目
   */
  async removeTrace(from: string, to: string, type: string): Promise<void> {
    this.traces = this.traces.filter(
      (t) => !(t.from === from && t.to === to && t.type === type)
    );
  }

  /**
   * 验证追溯完整性
   */
  async verify(): Promise<TraceVerifyResult> {
    const errors: TraceError[] = [];

    // 1. 验证追溯条目格式
    for (const entry of this.traces) {
      if (!entry.from || !entry.to || !entry.type) {
        errors.push({
          type: "invalid",
          message: "Trace entry must have 'from', 'to', and 'type' fields",
          entry,
        });
      }
    }

    // 2. 验证追溯链接的文件是否存在
    const sliceDir = path.dirname(this.traceFile);
    for (const entry of this.traces) {
      // 提取文件路径（去掉 # 后面的锚点）
      const fromFile = entry.from.split("#")[0];
      const toFile = entry.to.split("#")[0];

      // 检查源文件
      const fromPath = path.join(sliceDir, fromFile);
      if (!fs.existsSync(fromPath)) {
        errors.push({
          type: "broken_link",
          message: `Source file not found: ${fromFile}`,
          entry,
        });
      }

      // 检查目标文件
      const toPath = path.join(sliceDir, toFile);
      if (!fs.existsSync(toPath)) {
        errors.push({
          type: "broken_link",
          message: `Target file not found: ${toFile}`,
          entry,
        });
      }
    }

    return {
      passed: errors.length === 0,
      errors,
    };
  }

  /**
   * 保存追溯链
   */
  async save(): Promise<void> {
    const data: TraceData = {
      slice_id: this.sliceId,
      traces: this.traces,
      metadata: {
        last_updated: new Date().toISOString(),
        version: "1.0",
      },
    };

    const content = yaml.dump(data);
    fs.writeFileSync(this.traceFile, content, "utf-8");
  }

  /**
   * 获取所有追溯条目
   */
  getTraces(): TraceEntry[] {
    return [...this.traces];
  }

  /**
   * 查询追溯条目
   */
  findTraces(filter: {
    from?: string;
    to?: string;
    type?: string;
  }): TraceEntry[] {
    return this.traces.filter((entry) => {
      if (filter.from && !entry.from.includes(filter.from)) return false;
      if (filter.to && !entry.to.includes(filter.to)) return false;
      if (filter.type && entry.type !== filter.type) return false;
      return true;
    });
  }

  /**
   * 生成追溯报告
   */
  generateReport(): string {
    const lines: string[] = [];
    lines.push(`Trace Report for Slice: ${this.sliceId}`);
    lines.push(`Total traces: ${this.traces.length}`);
    lines.push("");

    // 按类型分组
    const byType = new Map<string, TraceEntry[]>();
    for (const entry of this.traces) {
      const entries = byType.get(entry.type) || [];
      entries.push(entry);
      byType.set(entry.type, entries);
    }

    for (const [type, entries] of byType) {
      lines.push(`${type} (${entries.length}):`);
      for (const entry of entries) {
        lines.push(`  ${entry.from} → ${entry.to}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * 加载追溯链
   */
  private loadTraces(): void {
    try {
      if (!fs.existsSync(this.traceFile)) {
        // 如果文件不存在，创建空的追溯链
        this.traces = [];
        return;
      }

      const content = fs.readFileSync(this.traceFile, "utf-8");
      const data = yaml.load(content) as TraceData;
      this.traces = data.traces || [];
    } catch (error) {
      throw new Error(
        `Failed to load traces from ${this.traceFile}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 查找 trace.yaml 文件
   */
  private findTraceFile(sliceId: string): string {
    // 在 contexts 目录下搜索
    const contextsDir = path.join(process.cwd(), "contexts");
    if (!fs.existsSync(contextsDir)) {
      throw new Error(`Contexts directory not found: ${contextsDir}`);
    }

    // 遍历所有上下文
    const contexts = fs.readdirSync(contextsDir);
    for (const context of contexts) {
      const contextDir = path.join(contextsDir, context);
      if (!fs.statSync(contextDir).isDirectory()) continue;

      const slicesDir = path.join(contextDir, "slices");
      if (!fs.existsSync(slicesDir)) continue;

      // 遍历所有切片
      const slices = fs.readdirSync(slicesDir);
      for (const slice of slices) {
        const sliceDir = path.join(slicesDir, slice);
        if (!fs.statSync(sliceDir).isDirectory()) continue;

        const sliceFile = path.join(sliceDir, "slice.yaml");
        if (!fs.existsSync(sliceFile)) continue;

        // 检查 ID 是否匹配
        const content = fs.readFileSync(sliceFile, "utf-8");
        const sliceData = yaml.load(content) as any;
        if (sliceData.id === sliceId) {
          return path.join(sliceDir, "trace.yaml");
        }
      }
    }

    throw new Error(`Slice not found: ${sliceId}`);
  }

  /**
   * 格式化验证结果
   */
  static formatVerifyResult(result: TraceVerifyResult): string {
    if (result.passed) {
      return "✓ Trace verification passed";
    }

    const lines = ["✗ Trace verification failed:"];
    for (const error of result.errors) {
      lines.push(`  - [${error.type}] ${error.message}`);
      if (error.entry) {
        lines.push(`    ${error.entry.from} → ${error.entry.to} (${error.entry.type})`);
      }
    }

    return lines.join("\n");
  }

  /**
   * 自动生成追溯条目（辅助方法）
   */
  static generateTrace(
    sourceFile: string,
    targetFile: string,
    type: string,
    metadata?: Record<string, unknown>
  ): TraceEntry {
    return {
      from: sourceFile,
      to: targetFile,
      type,
      metadata,
    };
  }
}
