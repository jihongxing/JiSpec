import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * 输入约束配置
 */
export interface InputConstraint {
  files: string[];           // 输入文件路径
  allowRead: boolean;        // 是否允许读取（默认 true）
  allowWrite: boolean;       // 是否允许写入（默认 false）
}

/**
 * 约束检查结果
 */
export interface ConstraintCheckResult {
  passed: boolean;
  violations: ConstraintViolation[];
}

/**
 * 约束违反记录
 */
export interface ConstraintViolation {
  file: string;
  type: "modified" | "deleted" | "permission_denied";
  message: string;
  before?: string;  // 修改前的 hash
  after?: string;   // 修改后的 hash
}

/**
 * 文件快照
 */
interface FileSnapshot {
  path: string;
  hash: string;
  exists: boolean;
  size: number;
  mtime: number;
}

/**
 * 输入约束检查器
 *
 * 功能：
 * 1. 创建输入文件的快照（hash）
 * 2. 执行后验证文件未被修改
 * 3. 防止违反单向约束
 */
export class InputConstraintChecker {
  private snapshots: Map<string, FileSnapshot> = new Map();
  private constraint: InputConstraint;

  private constructor(constraint: InputConstraint) {
    this.constraint = constraint;
  }

  /**
   * 创建约束检查器
   */
  static create(constraint: InputConstraint): InputConstraintChecker {
    return new InputConstraintChecker(constraint);
  }

  /**
   * 创建文件快照
   */
  async snapshot(): Promise<void> {
    for (const filePath of this.constraint.files) {
      const snapshot = await this.createFileSnapshot(filePath);
      this.snapshots.set(filePath, snapshot);
    }
  }

  /**
   * 验证文件未被修改
   */
  async verify(): Promise<ConstraintCheckResult> {
    const violations: ConstraintViolation[] = [];

    for (const [filePath, originalSnapshot] of this.snapshots) {
      const currentSnapshot = await this.createFileSnapshot(filePath);

      // 检查文件是否被删除
      if (originalSnapshot.exists && !currentSnapshot.exists) {
        violations.push({
          file: filePath,
          type: "deleted",
          message: `Input file was deleted: ${filePath}`,
          before: originalSnapshot.hash,
        });
        continue;
      }

      // 检查文件是否被修改
      if (originalSnapshot.exists && currentSnapshot.exists) {
        if (originalSnapshot.hash !== currentSnapshot.hash) {
          violations.push({
            file: filePath,
            type: "modified",
            message: `Input file was modified: ${filePath}`,
            before: originalSnapshot.hash,
            after: currentSnapshot.hash,
          });
        }
      }
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  /**
   * 获取约束的文件列表
   */
  getFiles(): string[] {
    return this.constraint.files;
  }

  /**
   * 检查文件是否允许读取
   */
  canRead(filePath: string): boolean {
    return this.constraint.allowRead && this.constraint.files.includes(filePath);
  }

  /**
   * 检查文件是否允许写入
   */
  canWrite(filePath: string): boolean {
    return this.constraint.allowWrite && this.constraint.files.includes(filePath);
  }

  /**
   * 创建单个文件的快照
   */
  private async createFileSnapshot(filePath: string): Promise<FileSnapshot> {
    try {
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, "utf-8");
      const hash = this.hashContent(content);

      return {
        path: filePath,
        hash,
        exists: true,
        size: stats.size,
        mtime: stats.mtimeMs,
      };
    } catch (error) {
      // 文件不存在
      return {
        path: filePath,
        hash: "",
        exists: false,
        size: 0,
        mtime: 0,
      };
    }
  }

  /**
   * 计算内容的 hash
   */
  private hashContent(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * 格式化违反信息
   */
  static formatViolations(violations: ConstraintViolation[]): string {
    if (violations.length === 0) {
      return "No violations";
    }

    const lines = ["Input constraint violations:"];
    for (const violation of violations) {
      lines.push(`  - ${violation.message}`);
      if (violation.before && violation.after) {
        lines.push(`    Before: ${violation.before.substring(0, 8)}...`);
        lines.push(`    After:  ${violation.after.substring(0, 8)}...`);
      }
    }

    return lines.join("\n");
  }
}
