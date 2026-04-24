import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

/**
 * 追溯条目（兼容旧格式）
 */
export interface TraceEntry {
  from: string;              // 源产物（例如：requirement#REQ-ORD-001）
  to: string;                // 目标产物（例如：scenario#SCN-ORDER-CHECKOUT-VALID）
  type: string;              // 关系类型（refines, verified_by, covered_by, etc.）
  metadata?: Record<string, unknown>;  // 额外元数据
}

/**
 * 追溯链接（新格式，匹配 schema）
 */
export interface TraceLink {
  from: {
    type: string;
    id: string;
  };
  to: {
    type: string;
    id: string;
  };
  relation: string;
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
 * 追溯链数据结构（新格式）
 */
interface TraceData {
  links: TraceLink[];
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
  private links: TraceLink[] = [];
  private root: string;

  private constructor(sliceId: string, root: string) {
    this.sliceId = sliceId;
    this.root = root;
    this.traceFile = this.findTraceFile(sliceId);
    this.loadTraces();
  }

  /**
   * 创建追溯管理器
   */
  static create(sliceId: string, root: string): TraceManager {
    return new TraceManager(sliceId, root);
  }

  /**
   * 添加追溯条目（新格式）
   */
  async addTrace(entry: TraceEntry): Promise<void> {
    // 解析 from/to 格式：type#id
    const fromParts = entry.from.split('#');
    const toParts = entry.to.split('#');

    if (fromParts.length !== 2 || toParts.length !== 2) {
      throw new Error(`Invalid trace entry format. Expected "type#id", got from="${entry.from}", to="${entry.to}"`);
    }

    const link: TraceLink = {
      from: { type: fromParts[0], id: fromParts[1] },
      to: { type: toParts[0], id: toParts[1] },
      relation: entry.type,
    };

    // 检查是否已存在相同的追溯
    const exists = this.links.some(
      (l) => l.from.type === link.from.type && l.from.id === link.from.id &&
             l.to.type === link.to.type && l.to.id === link.to.id &&
             l.relation === link.relation
    );

    if (!exists) {
      this.links.push(link);
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
  async removeTrace(from: string, to: string, relation: string): Promise<void> {
    const fromParts = from.split('#');
    const toParts = to.split('#');

    if (fromParts.length === 2 && toParts.length === 2) {
      this.links = this.links.filter(
        (l) => !(l.from.type === fromParts[0] && l.from.id === fromParts[1] &&
                 l.to.type === toParts[0] && l.to.id === toParts[1] &&
                 l.relation === relation)
      );
    }
  }

  /**
   * 验证追溯完整性
   */
  async verify(): Promise<TraceVerifyResult> {
    const errors: TraceError[] = [];

    // 1. 验证追溯条目格式
    for (const link of this.links) {
      if (!link.from?.type || !link.from?.id || !link.to?.type || !link.to?.id || !link.relation) {
        errors.push({
          type: "invalid",
          message: "Trace link must have valid 'from', 'to', and 'relation' fields",
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
      links: this.links,
      metadata: {
        last_updated: new Date().toISOString(),
        version: "1.0",
      },
    };

    const content = yaml.dump(data);
    fs.writeFileSync(this.traceFile, content, "utf-8");
  }

  /**
   * 获取所有追溯条目（转换为旧格式以保持兼容性）
   */
  getTraces(): TraceEntry[] {
    return this.links.map(link => ({
      from: `${link.from.type}#${link.from.id}`,
      to: `${link.to.type}#${link.to.id}`,
      type: link.relation,
    }));
  }

  /**
   * 查询追溯条目
   */
  findTraces(filter: {
    from?: string;
    to?: string;
    type?: string;
  }): TraceEntry[] {
    return this.getTraces().filter((entry) => {
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
    lines.push(`Total traces: ${this.links.length}`);
    lines.push("");

    // 按关系类型分组
    const byRelation = new Map<string, TraceLink[]>();
    for (const link of this.links) {
      const entries = byRelation.get(link.relation) || [];
      entries.push(link);
      byRelation.set(link.relation, entries);
    }

    for (const [relation, entries] of byRelation) {
      lines.push(`${relation} (${entries.length}):`);
      for (const link of entries) {
        lines.push(`  ${link.from.type}:${link.from.id} → ${link.to.type}:${link.to.id}`);
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
        this.links = [];
        return;
      }

      const content = fs.readFileSync(this.traceFile, "utf-8");
      const data = yaml.load(content) as TraceData;
      this.links = data.links || [];
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
    const contextsDir = path.join(this.root, "contexts");
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
