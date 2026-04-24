import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

/**
 * 门控约束配置
 */
export interface GateConstraint {
  required: string[];        // 必须通过的门控
  optional: string[];        // 可选的门控
  autoUpdate: boolean;       // 是否自动更新门控
}

/**
 * 门控检查结果
 */
export interface GateCheckResult {
  passed: boolean;
  missing: string[];         // 缺失的必须门控
  current: Record<string, boolean>;  // 当前门控状态
}

/**
 * 门控检查器
 *
 * 功能：
 * 1. 检查当前阶段的门控状态
 * 2. 自动更新门控（如果验证通过）
 * 3. 检查是否可以推进到下一阶段
 */
export class GateChecker {
  private sliceId: string;
  private constraint: GateConstraint;
  private sliceFile: string;
  private root: string;

  private constructor(sliceId: string, constraint: GateConstraint, root: string) {
    this.sliceId = sliceId;
    this.constraint = constraint;
    this.root = root;
    this.sliceFile = this.findSliceFile(sliceId);
  }

  /**
   * 创建门控检查器
   */
  static create(sliceId: string, constraint: GateConstraint, root: string): GateChecker {
    return new GateChecker(sliceId, constraint, root);
  }

  /**
   * 检查门控
   */
  async check(): Promise<GateCheckResult> {
    const gates = this.loadGates();
    const missing: string[] = [];

    // 检查必须的门控
    for (const gate of this.constraint.required) {
      if (!gates[gate]) {
        missing.push(gate);
      }
    }

    return {
      passed: missing.length === 0,
      missing,
      current: gates,
    };
  }

  /**
   * 更新门控
   */
  async update(gate: string, value: boolean): Promise<void> {
    const content = fs.readFileSync(this.sliceFile, "utf-8");
    const slice = yaml.load(content) as any;

    // 确保 gates 对象存在
    if (!slice.gates) {
      slice.gates = {};
    }

    // 更新门控
    slice.gates[gate] = value;

    // 保存
    const updated = yaml.dump(slice);
    fs.writeFileSync(this.sliceFile, updated, "utf-8");
  }

  /**
   * 批量更新门控
   */
  async updateMultiple(gates: Record<string, boolean>): Promise<void> {
    const content = fs.readFileSync(this.sliceFile, "utf-8");
    const slice = yaml.load(content) as any;

    // 确保 gates 对象存在
    if (!slice.gates) {
      slice.gates = {};
    }

    // 更新所有门控
    for (const [gate, value] of Object.entries(gates)) {
      slice.gates[gate] = value;
    }

    // 保存
    const updated = yaml.dump(slice);
    fs.writeFileSync(this.sliceFile, updated, "utf-8");
  }

  /**
   * 获取当前门控状态
   */
  getGates(): Record<string, boolean> {
    return this.loadGates();
  }

  /**
   * 检查是否可以推进到下一阶段
   */
  canAdvance(targetState: string): boolean {
    const gates = this.loadGates();
    const stateGateMap: Record<string, string[]> = {
      "requirements-defined": [],
      "design-defined": ["requirements_ready"],
      "behavior-defined": ["design_ready"],
      "test-defined": ["behavior_ready"],
      "implementing": ["test_ready"],
      "verifying": ["implementation_ready"],
      "accepted": ["verification_ready"],
    };

    const requiredGates = stateGateMap[targetState] || [];
    return requiredGates.every((gate) => gates[gate] === true);
  }

  /**
   * 加载门控状态
   */
  private loadGates(): Record<string, boolean> {
    try {
      const content = fs.readFileSync(this.sliceFile, "utf-8");
      const slice = yaml.load(content) as any;
      return slice.gates || {};
    } catch (error) {
      throw new Error(
        `Failed to load gates from ${this.sliceFile}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 查找 slice.yaml 文件
   */
  private findSliceFile(sliceId: string): string {
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
          return sliceFile;
        }
      }
    }

    throw new Error(`Slice not found: ${sliceId}`);
  }

  /**
   * 格式化门控状态
   */
  static formatGates(gates: Record<string, boolean>): string {
    const lines = ["Gate status:"];
    for (const [gate, value] of Object.entries(gates)) {
      const status = value ? "✓" : "✗";
      lines.push(`  ${status} ${gate}: ${value}`);
    }
    return lines.join("\n");
  }

  /**
   * 格式化检查结果
   */
  static formatCheckResult(result: GateCheckResult): string {
    const lines: string[] = [];

    if (result.passed) {
      lines.push("✓ All required gates passed");
    } else {
      lines.push("✗ Missing required gates:");
      for (const gate of result.missing) {
        lines.push(`  - ${gate}`);
      }
    }

    lines.push("");
    lines.push("Current gate status:");
    for (const [gate, value] of Object.entries(result.current)) {
      const status = value ? "✓" : "✗";
      lines.push(`  ${status} ${gate}: ${value}`);
    }

    return lines.join("\n");
  }
}
