import * as fs from "fs";
import * as path from "path";
import { Slice } from "./types";
import { DependencyGraph, SliceDependency } from "./dependency-graph-builder";

/**
 * 冲突类型
 */
export type ConflictType = "resource" | "version" | "logic" | "timing";

/**
 * 冲突严重程度
 */
export type ConflictSeverity = "low" | "medium" | "high" | "critical";

/**
 * 冲突
 */
export interface Conflict {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  sliceIds: string[];
  description: string;
  details: {
    conflictingResources?: string[];
    versionConflicts?: VersionConflict[];
    logicConflicts?: string[];
    timingIssues?: string[];
  };
  detectedAt: Date;
  autoResolvable: boolean;
}

/**
 * 版本冲突
 */
export interface VersionConflict {
  dependency: string;
  versions: Map<string, string>; // sliceId -> version
  compatibilityMatrix: Map<string, Map<string, boolean>>;
}

/**
 * 资源冲突
 */
export interface ResourceConflict {
  resourcePath: string;
  conflictingSlices: string[];
  conflictType: "read-write" | "write-write" | "delete-write";
}

/**
 * 冲突检测结果
 */
export interface ConflictDetectionResult {
  conflicts: Conflict[];
  hasConflicts: boolean;
  criticalConflicts: Conflict[];
  resolvableConflicts: Conflict[];
  summary: {
    totalConflicts: number;
    byType: Record<ConflictType, number>;
    bySeverity: Record<ConflictSeverity, number>;
    autoResolvableCount: number;
  };
}

/**
 * 冲突检测器
 */
export class ConflictDetector {
  private slices: Map<string, Slice> = new Map();
  private dependencyGraph?: DependencyGraph;

  /**
   * 添加切片
   */
  addSlice(slice: Slice): void {
    this.slices.set(slice.id, slice);
  }

  /**
   * 设置依赖图
   */
  setDependencyGraph(graph: DependencyGraph): void {
    this.dependencyGraph = graph;
  }

  /**
   * 检测所有冲突
   */
  async detectConflicts(): Promise<ConflictDetectionResult> {
    const conflicts: Conflict[] = [];

    // 检测资源冲突
    const resourceConflicts = await this.detectResourceConflicts();
    conflicts.push(...resourceConflicts);

    // 检测版本冲突
    const versionConflicts = await this.detectVersionConflicts();
    conflicts.push(...versionConflicts);

    // 检测逻辑冲突
    const logicConflicts = await this.detectLogicConflicts();
    conflicts.push(...logicConflicts);

    // 检测时序冲突
    const timingConflicts = await this.detectTimingConflicts();
    conflicts.push(...timingConflicts);

    // 生成摘要
    const summary = this.generateSummary(conflicts);

    return {
      conflicts,
      hasConflicts: conflicts.length > 0,
      criticalConflicts: conflicts.filter((c) => c.severity === "critical"),
      resolvableConflicts: conflicts.filter((c) => c.autoResolvable),
      summary,
    };
  }

  /**
   * 检测资源冲突
   */
  private async detectResourceConflicts(): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];
    const resourceMap = new Map<string, string[]>(); // resource -> sliceIds

    // 收集每个切片的资源
    for (const [sliceId, slice] of this.slices) {
      const resources = this.extractResources(slice);
      for (const resource of resources) {
        if (!resourceMap.has(resource)) {
          resourceMap.set(resource, []);
        }
        resourceMap.get(resource)!.push(sliceId);
      }
    }

    // 检测冲突
    for (const [resource, sliceIds] of resourceMap) {
      if (sliceIds.length > 1) {
        // 检查是否真的冲突（可能只是读取）
        const conflictType = this.analyzeResourceConflictType(resource, sliceIds);
        if (conflictType) {
          conflicts.push({
            id: `resource-${Date.now()}-${Math.random()}`,
            type: "resource",
            severity: this.assessResourceConflictSeverity(conflictType),
            sliceIds,
            description: `Multiple slices accessing resource: ${resource}`,
            details: {
              conflictingResources: [resource],
            },
            detectedAt: new Date(),
            autoResolvable: conflictType === "read-write",
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * 提取切片的资源
   */
  private extractResources(slice: Slice): string[] {
    const resources: string[] = [];

    // 从描述中提取文件路径
    const filePattern = /`([^`]+\.(ts|js|tsx|jsx|go|py|json|yaml|yml))`/g;
    let match;

    while ((match = filePattern.exec(slice.description)) !== null) {
      resources.push(match[1]);
    }

    // 从任务中提取资源
    if (slice.tasks) {
      for (const task of slice.tasks) {
        const taskResources = this.extractResourcesFromText(task.description);
        resources.push(...taskResources);
      }
    }

    return [...new Set(resources)];
  }

  /**
   * 从文本中提取资源
   */
  private extractResourcesFromText(text: string): string[] {
    const resources: string[] = [];
    const patterns = [
      /`([^`]+\.(ts|js|tsx|jsx|go|py|json|yaml|yml))`/g,
      /file:\s*([^\s]+)/g,
      /path:\s*([^\s]+)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        resources.push(match[1]);
      }
    }

    return resources;
  }

  /**
   * 分析资源冲突类型
   */
  private analyzeResourceConflictType(
    resource: string,
    sliceIds: string[]
  ): "read-write" | "write-write" | "delete-write" | null {
    const operations = sliceIds.map((id) => {
      const slice = this.slices.get(id)!;
      return this.inferOperation(slice, resource);
    });

    const hasWrite = operations.some((op) => op === "write");
    const hasDelete = operations.some((op) => op === "delete");
    const hasRead = operations.some((op) => op === "read");

    if (hasDelete && hasWrite) return "delete-write";
    if (hasWrite && operations.filter((op) => op === "write").length > 1)
      return "write-write";
    if (hasWrite && hasRead) return "read-write";

    return null;
  }

  /**
   * 推断操作类型
   */
  private inferOperation(
    slice: Slice,
    resource: string
  ): "read" | "write" | "delete" {
    const text = `${slice.title} ${slice.description}`.toLowerCase();

    if (
      text.includes("delete") ||
      text.includes("remove") ||
      text.includes("删除")
    ) {
      return "delete";
    }

    if (
      text.includes("create") ||
      text.includes("update") ||
      text.includes("modify") ||
      text.includes("write") ||
      text.includes("新增") ||
      text.includes("修改")
    ) {
      return "write";
    }

    return "read";
  }

  /**
   * 评估资源冲突严重程度
   */
  private assessResourceConflictSeverity(
    conflictType: "read-write" | "write-write" | "delete-write"
  ): ConflictSeverity {
    switch (conflictType) {
      case "delete-write":
        return "critical";
      case "write-write":
        return "high";
      case "read-write":
        return "medium";
    }
  }

  /**
   * 检测版本冲突
   */
  private async detectVersionConflicts(): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];
    const dependencyVersions = new Map<
      string,
      Map<string, string>
    >(); // dependency -> (sliceId -> version)

    // 收集依赖版本
    for (const [sliceId, slice] of this.slices) {
      const deps = this.extractDependencies(slice);
      for (const [dep, version] of deps) {
        if (!dependencyVersions.has(dep)) {
          dependencyVersions.set(dep, new Map());
        }
        dependencyVersions.get(dep)!.set(sliceId, version);
      }
    }

    // 检测版本冲突
    for (const [dep, versions] of dependencyVersions) {
      if (versions.size > 1) {
        const uniqueVersions = new Set(versions.values());
        if (uniqueVersions.size > 1) {
          // 检查版本兼容性
          const compatible = this.checkVersionCompatibility(
            Array.from(uniqueVersions)
          );

          if (!compatible) {
            conflicts.push({
              id: `version-${Date.now()}-${Math.random()}`,
              type: "version",
              severity: "high",
              sliceIds: Array.from(versions.keys()),
              description: `Version conflict for dependency: ${dep}`,
              details: {
                versionConflicts: [
                  {
                    dependency: dep,
                    versions,
                    compatibilityMatrix: new Map(),
                  },
                ],
              },
              detectedAt: new Date(),
              autoResolvable: true,
            });
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * 提取依赖
   */
  private extractDependencies(slice: Slice): Map<string, string> {
    const deps = new Map<string, string>();

    // 简化实现：从描述中提取依赖
    const depPattern = /`([a-z0-9-]+)@([0-9.]+)`/g;
    let match;

    const text = `${slice.description} ${slice.tasks?.map((t) => t.description).join(" ")}`;
    while ((match = depPattern.exec(text)) !== null) {
      deps.set(match[1], match[2]);
    }

    return deps;
  }

  /**
   * 检查版本兼容性
   */
  private checkVersionCompatibility(versions: string[]): boolean {
    // 简化实现：检查主版本号是否相同
    const majorVersions = versions.map((v) => parseInt(v.split(".")[0]));
    return new Set(majorVersions).size === 1;
  }

  /**
   * 检测逻辑冲突
   */
  private async detectLogicConflicts(): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];

    // 检查依赖图中的冲突依赖
    if (this.dependencyGraph) {
      for (const [sourceId, deps] of this.dependencyGraph.edges) {
        const conflictDeps = deps.filter((d) => d.type === "conflict");
        if (conflictDeps.length > 0) {
          for (const dep of conflictDeps) {
            conflicts.push({
              id: `logic-${Date.now()}-${Math.random()}`,
              type: "logic",
              severity: "high",
              sliceIds: [sourceId, dep.targetSliceId],
              description: `Logic conflict: ${dep.reason}`,
              details: {
                logicConflicts: [dep.reason],
              },
              detectedAt: new Date(),
              autoResolvable: false,
            });
          }
        }
      }
    }

    // 检测互斥的业务逻辑
    const mutuallyExclusive = this.detectMutuallyExclusiveSlices();
    for (const [slice1, slice2, reason] of mutuallyExclusive) {
      conflicts.push({
        id: `logic-${Date.now()}-${Math.random()}`,
        type: "logic",
        severity: "critical",
        sliceIds: [slice1, slice2],
        description: `Mutually exclusive slices: ${reason}`,
        details: {
          logicConflicts: [reason],
        },
        detectedAt: new Date(),
        autoResolvable: false,
      });
    }

    return conflicts;
  }

  /**
   * 检测互斥的切片
   */
  private detectMutuallyExclusiveSlices(): [string, string, string][] {
    const mutuallyExclusive: [string, string, string][] = [];

    const sliceArray = Array.from(this.slices.values());
    for (let i = 0; i < sliceArray.length; i++) {
      for (let j = i + 1; j < sliceArray.length; j++) {
        const slice1 = sliceArray[i];
        const slice2 = sliceArray[j];

        const reason = this.checkMutualExclusion(slice1, slice2);
        if (reason) {
          mutuallyExclusive.push([slice1.id, slice2.id, reason]);
        }
      }
    }

    return mutuallyExclusive;
  }

  /**
   * 检查两个切片是否互斥
   */
  private checkMutualExclusion(slice1: Slice, slice2: Slice): string | null {
    const text1 = `${slice1.title} ${slice1.description}`.toLowerCase();
    const text2 = `${slice2.title} ${slice2.description}`.toLowerCase();

    // 检测互斥关键词
    const exclusivePatterns = [
      ["enable", "disable"],
      ["add", "remove"],
      ["create", "delete"],
      ["启用", "禁用"],
      ["添加", "删除"],
    ];

    for (const [keyword1, keyword2] of exclusivePatterns) {
      if (text1.includes(keyword1) && text2.includes(keyword2)) {
        // 检查是否针对同一对象
        const commonWords = this.findCommonWords(text1, text2);
        if (commonWords.length > 0) {
          return `Mutually exclusive operations on: ${commonWords.join(", ")}`;
        }
      }
    }

    return null;
  }

  /**
   * 查找共同词汇
   */
  private findCommonWords(text1: string, text2: string): string[] {
    const words1 = new Set(text1.split(/\s+/).filter((w) => w.length > 3));
    const words2 = new Set(text2.split(/\s+/).filter((w) => w.length > 3));

    const common: string[] = [];
    for (const word of words1) {
      if (words2.has(word)) {
        common.push(word);
      }
    }

    return common;
  }

  /**
   * 检测时序冲突
   */
  private async detectTimingConflicts(): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];

    if (!this.dependencyGraph) {
      return conflicts;
    }

    // 检测循环依赖（时序冲突的一种）
    for (const cycle of this.dependencyGraph.cycles) {
      conflicts.push({
        id: `timing-${Date.now()}-${Math.random()}`,
        type: "timing",
        severity: "critical",
        sliceIds: cycle,
        description: `Circular dependency detected: ${cycle.join(" -> ")}`,
        details: {
          timingIssues: [`Circular dependency: ${cycle.join(" -> ")}`],
        },
        detectedAt: new Date(),
        autoResolvable: false,
      });
    }

    // 检测执行顺序冲突
    const orderConflicts = this.detectExecutionOrderConflicts();
    conflicts.push(...orderConflicts);

    return conflicts;
  }

  /**
   * 检测执行顺序冲突
   */
  private detectExecutionOrderConflicts(): Conflict[] {
    const conflicts: Conflict[] = [];

    if (!this.dependencyGraph) {
      return conflicts;
    }

    // 检查是否有切片要求特定的执行顺序但依赖图不支持
    for (const [sliceId, slice] of this.slices) {
      const requiredOrder = this.extractRequiredOrder(slice);
      if (requiredOrder.length > 0) {
        // 检查依赖图是否满足这个顺序
        const satisfied = this.checkOrderSatisfied(sliceId, requiredOrder);
        if (!satisfied) {
          conflicts.push({
            id: `timing-${Date.now()}-${Math.random()}`,
            type: "timing",
            severity: "high",
            sliceIds: [sliceId, ...requiredOrder],
            description: `Execution order requirement not satisfied for slice ${sliceId}`,
            details: {
              timingIssues: [
                `Required order: ${requiredOrder.join(" -> ")} not satisfied`,
              ],
            },
            detectedAt: new Date(),
            autoResolvable: true,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * 提取要求的执行顺序
   */
  private extractRequiredOrder(slice: Slice): string[] {
    // 简化实现：从描述中提取
    const order: string[] = [];
    const orderPattern = /after\s+([a-z0-9-]+)/gi;
    let match;

    while ((match = orderPattern.exec(slice.description)) !== null) {
      order.push(match[1]);
    }

    return order;
  }

  /**
   * 检查顺序是否满足
   */
  private checkOrderSatisfied(sliceId: string, requiredOrder: string[]): boolean {
    if (!this.dependencyGraph) {
      return false;
    }

    const node = this.dependencyGraph.nodes.get(sliceId);
    if (!node) {
      return false;
    }

    // 检查所有要求的前置切片是否在依赖中
    for (const requiredId of requiredOrder) {
      if (!node.dependencies.includes(requiredId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 生成摘要
   */
  private generateSummary(conflicts: Conflict[]) {
    const byType: Record<ConflictType, number> = {
      resource: 0,
      version: 0,
      logic: 0,
      timing: 0,
    };

    const bySeverity: Record<ConflictSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    let autoResolvableCount = 0;

    for (const conflict of conflicts) {
      byType[conflict.type]++;
      bySeverity[conflict.severity]++;
      if (conflict.autoResolvable) {
        autoResolvableCount++;
      }
    }

    return {
      totalConflicts: conflicts.length,
      byType,
      bySeverity,
      autoResolvableCount,
    };
  }

  /**
   * 保存冲突报告
   */
  async saveConflictReport(
    result: ConflictDetectionResult,
    outputPath: string
  ): Promise<void> {
    const report = {
      detectedAt: new Date().toISOString(),
      summary: result.summary,
      hasConflicts: result.hasConflicts,
      conflicts: result.conflicts.map((c) => ({
        id: c.id,
        type: c.type,
        severity: c.severity,
        sliceIds: c.sliceIds,
        description: c.description,
        details: c.details,
        autoResolvable: c.autoResolvable,
      })),
    };

    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`Conflict report saved to ${outputPath}`);
  }
}
