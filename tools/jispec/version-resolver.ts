import * as fs from "fs";
import * as path from "path";

/**
 * 版本约束
 */
export interface VersionConstraint {
  sliceId: string;
  dependency: string;
  constraint: string; // e.g., "^1.0.0", ">=2.0.0 <3.0.0"
  reason?: string;
}

/**
 * 版本解析结果
 */
export interface VersionResolution {
  dependency: string;
  resolvedVersion: string;
  satisfiedConstraints: VersionConstraint[];
  unsatisfiedConstraints: VersionConstraint[];
  conflicts: VersionConflict[];
}

/**
 * 版本冲突
 */
export interface VersionConflict {
  dependency: string;
  constraint1: VersionConstraint;
  constraint2: VersionConstraint;
  reason: string;
}

/**
 * 版本兼容性检查结果
 */
export interface CompatibilityCheck {
  compatible: boolean;
  version1: string;
  version2: string;
  breakingChanges: string[];
  warnings: string[];
}

/**
 * 版本解析器
 */
export class VersionResolver {
  private constraints: Map<string, VersionConstraint[]> = new Map();
  private availableVersions: Map<string, string[]> = new Map();

  /**
   * 添加版本约束
   */
  addConstraint(constraint: VersionConstraint): void {
    const { dependency } = constraint;
    if (!this.constraints.has(dependency)) {
      this.constraints.set(dependency, []);
    }
    this.constraints.get(dependency)!.push(constraint);
  }

  /**
   * 设置可用版本
   */
  setAvailableVersions(dependency: string, versions: string[]): void {
    this.availableVersions.set(dependency, versions);
  }

  /**
   * 解析版本
   */
  resolveVersion(dependency: string): VersionResolution {
    const constraints = this.constraints.get(dependency) || [];
    const available = this.availableVersions.get(dependency) || [];

    if (constraints.length === 0) {
      // 没有约束，返回最新版本
      const latest = this.getLatestVersion(available);
      return {
        dependency,
        resolvedVersion: latest,
        satisfiedConstraints: [],
        unsatisfiedConstraints: [],
        conflicts: [],
      };
    }

    // 检测冲突
    const conflicts = this.detectVersionConflicts(constraints);

    if (conflicts.length > 0) {
      // 有冲突，尝试协商
      const negotiated = this.negotiateVersion(dependency, constraints, available);
      return negotiated;
    }

    // 无冲突，找到满足所有约束的版本
    const resolved = this.findSatisfyingVersion(constraints, available);

    return {
      dependency,
      resolvedVersion: resolved.version,
      satisfiedConstraints: resolved.satisfied,
      unsatisfiedConstraints: resolved.unsatisfied,
      conflicts: [],
    };
  }

  /**
   * 检测版本冲突
   */
  private detectVersionConflicts(
    constraints: VersionConstraint[]
  ): VersionConflict[] {
    const conflicts: VersionConflict[] = [];

    for (let i = 0; i < constraints.length; i++) {
      for (let j = i + 1; j < constraints.length; j++) {
        const c1 = constraints[i];
        const c2 = constraints[j];

        if (!this.areConstraintsCompatible(c1.constraint, c2.constraint)) {
          conflicts.push({
            dependency: c1.dependency,
            constraint1: c1,
            constraint2: c2,
            reason: `Incompatible constraints: ${c1.constraint} vs ${c2.constraint}`,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * 检查约束是否兼容
   */
  private areConstraintsCompatible(c1: string, c2: string): boolean {
    // 简化实现：检查是否有交集
    const range1 = this.parseConstraint(c1);
    const range2 = this.parseConstraint(c2);

    return this.rangesOverlap(range1, range2);
  }

  /**
   * 解析约束
   */
  private parseConstraint(constraint: string): {
    min: string;
    max: string;
    includeMin: boolean;
    includeMax: boolean;
  } {
    // 简化实现：支持常见格式
    if (constraint.startsWith("^")) {
      // ^1.2.3 -> >=1.2.3 <2.0.0
      const version = constraint.slice(1);
      const [major] = version.split(".");
      return {
        min: version,
        max: `${parseInt(major) + 1}.0.0`,
        includeMin: true,
        includeMax: false,
      };
    } else if (constraint.startsWith("~")) {
      // ~1.2.3 -> >=1.2.3 <1.3.0
      const version = constraint.slice(1);
      const [major, minor] = version.split(".");
      return {
        min: version,
        max: `${major}.${parseInt(minor) + 1}.0`,
        includeMin: true,
        includeMax: false,
      };
    } else if (constraint.includes(" ")) {
      // >=1.0.0 <2.0.0
      const parts = constraint.split(" ");
      const min = parts[0].replace(/[><=]/g, "");
      const max = parts[1].replace(/[><=]/g, "");
      return {
        min,
        max,
        includeMin: parts[0].includes("="),
        includeMax: parts[1].includes("="),
      };
    } else {
      // 精确版本
      return {
        min: constraint,
        max: constraint,
        includeMin: true,
        includeMax: true,
      };
    }
  }

  /**
   * 检查范围是否重叠
   */
  private rangesOverlap(
    r1: { min: string; max: string },
    r2: { min: string; max: string }
  ): boolean {
    // 简化实现
    return !(
      this.compareVersions(r1.max, r2.min) < 0 ||
      this.compareVersions(r2.max, r1.min) < 0
    );
  }

  /**
   * 协商版本
   */
  private negotiateVersion(
    dependency: string,
    constraints: VersionConstraint[],
    available: string[]
  ): VersionResolution {
    // 尝试找到满足最多约束的版本
    let bestVersion = "";
    let maxSatisfied = 0;

    for (const version of available) {
      let satisfied = 0;
      for (const constraint of constraints) {
        if (this.satisfiesConstraint(version, constraint.constraint)) {
          satisfied++;
        }
      }

      if (satisfied > maxSatisfied) {
        maxSatisfied = satisfied;
        bestVersion = version;
      }
    }

    // 如果没有找到满足任何约束的版本，使用最新版本
    if (!bestVersion) {
      bestVersion = this.getLatestVersion(available);
    }

    const satisfied: VersionConstraint[] = [];
    const unsatisfied: VersionConstraint[] = [];

    for (const constraint of constraints) {
      if (this.satisfiesConstraint(bestVersion, constraint.constraint)) {
        satisfied.push(constraint);
      } else {
        unsatisfied.push(constraint);
      }
    }

    return {
      dependency,
      resolvedVersion: bestVersion,
      satisfiedConstraints: satisfied,
      unsatisfiedConstraints: unsatisfied,
      conflicts: this.detectVersionConflicts(constraints),
    };
  }

  /**
   * 查找满足约束的版本
   */
  private findSatisfyingVersion(
    constraints: VersionConstraint[],
    available: string[]
  ): {
    version: string;
    satisfied: VersionConstraint[];
    unsatisfied: VersionConstraint[];
  } {
    // 从最新版本开始尝试
    const sorted = available.sort((a, b) => this.compareVersions(b, a));

    for (const version of sorted) {
      const satisfied: VersionConstraint[] = [];
      const unsatisfied: VersionConstraint[] = [];

      for (const constraint of constraints) {
        if (this.satisfiesConstraint(version, constraint.constraint)) {
          satisfied.push(constraint);
        } else {
          unsatisfied.push(constraint);
        }
      }

      if (unsatisfied.length === 0) {
        return { version, satisfied, unsatisfied };
      }
    }

    // 没有找到完全满足的版本，返回最新版本
    const latest = sorted[0] || "0.0.0";
    const satisfied: VersionConstraint[] = [];
    const unsatisfied: VersionConstraint[] = [];

    for (const constraint of constraints) {
      if (this.satisfiesConstraint(latest, constraint.constraint)) {
        satisfied.push(constraint);
      } else {
        unsatisfied.push(constraint);
      }
    }

    return { version: latest, satisfied, unsatisfied };
  }

  /**
   * 检查版本是否满足约束
   */
  satisfiesConstraint(version: string, constraint: string): boolean {
    const range = this.parseConstraint(constraint);

    const minCmp = this.compareVersions(version, range.min);
    const maxCmp = this.compareVersions(version, range.max);

    const satisfiesMin = range.includeMin ? minCmp >= 0 : minCmp > 0;
    const satisfiesMax = range.includeMax ? maxCmp <= 0 : maxCmp < 0;

    return satisfiesMin && satisfiesMax;
  }

  /**
   * 检查版本兼容性
   */
  checkCompatibility(v1: string, v2: string): CompatibilityCheck {
    const cmp = this.compareVersions(v1, v2);

    if (cmp === 0) {
      return {
        compatible: true,
        version1: v1,
        version2: v2,
        breakingChanges: [],
        warnings: [],
      };
    }

    const [major1, minor1] = v1.split(".").map(Number);
    const [major2, minor2] = v2.split(".").map(Number);

    const breakingChanges: string[] = [];
    const warnings: string[] = [];

    // 主版本不同 -> 不兼容
    if (major1 !== major2) {
      breakingChanges.push(`Major version change: ${major1} -> ${major2}`);
      return {
        compatible: false,
        version1: v1,
        version2: v2,
        breakingChanges,
        warnings,
      };
    }

    // 次版本不同 -> 可能有新功能
    if (minor1 !== minor2) {
      warnings.push(`Minor version change: ${minor1} -> ${minor2}`);
    }

    return {
      compatible: true,
      version1: v1,
      version2: v2,
      breakingChanges,
      warnings,
    };
  }

  /**
   * 建议升级
   */
  suggestUpgrade(current: string, available: string[]): string {
    // 找到最新的兼容版本
    const [currentMajor] = current.split(".").map(Number);

    const compatible = available.filter((v) => {
      const [major] = v.split(".").map(Number);
      return major === currentMajor;
    });

    if (compatible.length === 0) {
      return current;
    }

    return this.getLatestVersion(compatible);
  }

  /**
   * 获取最新版本
   */
  private getLatestVersion(versions: string[]): string {
    if (versions.length === 0) {
      return "0.0.0";
    }

    return versions.sort((a, b) => this.compareVersions(b, a))[0];
  }

  /**
   * 比较版本
   */
  compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split(".").map(Number);
    const parts2 = v2.split(".").map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;

      if (p1 !== p2) {
        return p1 - p2;
      }
    }

    return 0;
  }

  /**
   * 解析所有依赖
   */
  resolveAll(): Map<string, VersionResolution> {
    const resolutions = new Map<string, VersionResolution>();

    for (const dependency of this.constraints.keys()) {
      const resolution = this.resolveVersion(dependency);
      resolutions.set(dependency, resolution);
    }

    return resolutions;
  }

  /**
   * 生成锁文件
   */
  generateLockFile(): Record<string, string> {
    const lockFile: Record<string, string> = {};
    const resolutions = this.resolveAll();

    for (const [dependency, resolution] of resolutions) {
      lockFile[dependency] = resolution.resolvedVersion;
    }

    return lockFile;
  }

  /**
   * 保存锁文件
   */
  saveLockFile(outputPath: string): void {
    const lockFile = this.generateLockFile();
    fs.writeFileSync(outputPath, JSON.stringify(lockFile, null, 2));
    console.log(`Lock file saved to ${outputPath}`);
  }

  /**
   * 加载锁文件
   */
  loadLockFile(lockFilePath: string): void {
    if (!fs.existsSync(lockFilePath)) {
      return;
    }

    const lockFile = JSON.parse(fs.readFileSync(lockFilePath, "utf-8"));

    for (const [dependency, version] of Object.entries(lockFile)) {
      this.setAvailableVersions(dependency, [version as string]);
    }
  }

  /**
   * 生成版本解析报告
   */
  generateReport(): string {
    let report = "# Version Resolution Report\n\n";

    const resolutions = this.resolveAll();

    for (const [dependency, resolution] of resolutions) {
      report += `## ${dependency}\n\n`;
      report += `**Resolved Version:** ${resolution.resolvedVersion}\n\n`;

      if (resolution.satisfiedConstraints.length > 0) {
        report += `### Satisfied Constraints\n\n`;
        for (const constraint of resolution.satisfiedConstraints) {
          report += `- ${constraint.sliceId}: ${constraint.constraint}`;
          if (constraint.reason) {
            report += ` (${constraint.reason})`;
          }
          report += `\n`;
        }
        report += `\n`;
      }

      if (resolution.unsatisfiedConstraints.length > 0) {
        report += `### Unsatisfied Constraints\n\n`;
        for (const constraint of resolution.unsatisfiedConstraints) {
          report += `- ${constraint.sliceId}: ${constraint.constraint}`;
          if (constraint.reason) {
            report += ` (${constraint.reason})`;
          }
          report += `\n`;
        }
        report += `\n`;
      }

      if (resolution.conflicts.length > 0) {
        report += `### Conflicts\n\n`;
        for (const conflict of resolution.conflicts) {
          report += `- ${conflict.constraint1.sliceId} (${conflict.constraint1.constraint}) vs `;
          report += `${conflict.constraint2.sliceId} (${conflict.constraint2.constraint})\n`;
          report += `  - ${conflict.reason}\n`;
        }
        report += `\n`;
      }
    }

    return report;
  }

  /**
   * 保存版本解析报告
   */
  saveReport(outputPath: string): void {
    const report = this.generateReport();
    fs.writeFileSync(outputPath, report);
    console.log(`Version resolution report saved to ${outputPath}`);
  }
}

/**
 * 版本管理器
 */
export class VersionManager {
  private resolver: VersionResolver;
  private versionHistory: Map<string, string[]> = new Map();

  constructor() {
    this.resolver = new VersionResolver();
  }

  /**
   * 添加版本约束
   */
  addConstraint(constraint: VersionConstraint): void {
    this.resolver.addConstraint(constraint);
  }

  /**
   * 记录版本历史
   */
  recordVersion(dependency: string, version: string): void {
    if (!this.versionHistory.has(dependency)) {
      this.versionHistory.set(dependency, []);
    }
    this.versionHistory.get(dependency)!.push(version);
  }

  /**
   * 获取版本历史
   */
  getVersionHistory(dependency: string): string[] {
    return this.versionHistory.get(dependency) || [];
  }

  /**
   * 检测版本漂移
   */
  detectVersionDrift(): Map<string, { expected: string; actual: string }> {
    const drift = new Map<string, { expected: string; actual: string }>();
    const resolutions = this.resolver.resolveAll();

    for (const [dependency, resolution] of resolutions) {
      const history = this.getVersionHistory(dependency);
      if (history.length > 0) {
        const latest = history[history.length - 1];
        if (latest !== resolution.resolvedVersion) {
          drift.set(dependency, {
            expected: resolution.resolvedVersion,
            actual: latest,
          });
        }
      }
    }

    return drift;
  }

  /**
   * 获取解析器
   */
  getResolver(): VersionResolver {
    return this.resolver;
  }
}
