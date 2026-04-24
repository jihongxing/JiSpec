import * as fs from "fs";
import * as path from "path";
import { Slice } from "./types";
import { DependencyGraph } from "./dependency-graph-builder";

/**
 * 风险等级
 */
export type RiskLevel = "low" | "medium" | "high" | "critical";

/**
 * 影响类型
 */
export type ImpactType = "direct" | "indirect" | "cascading";

/**
 * 变更类型
 */
export type ChangeType = "add" | "modify" | "delete" | "refactor";

/**
 * 影响报告
 */
export interface ImpactReport {
  changedSlice: string;
  changeType: ChangeType;
  directImpact: ImpactedSlice[];
  indirectImpact: ImpactedSlice[];
  cascadingImpact: ImpactedSlice[];
  affectedFiles: string[];
  affectedTests: string[];
  riskLevel: RiskLevel;
  riskFactors: RiskFactor[];
  recommendations: Recommendation[];
  estimatedEffort: {
    testing: string;
    documentation: string;
    communication: string;
  };
  impactScore: number; // 0-100
}

/**
 * 受影响的切片
 */
export interface ImpactedSlice {
  sliceId: string;
  impactType: ImpactType;
  impactReason: string;
  severity: RiskLevel;
  requiresUpdate: boolean;
  requiresRetest: boolean;
}

/**
 * 风险因素
 */
export interface RiskFactor {
  factor: string;
  description: string;
  severity: RiskLevel;
  mitigation: string;
}

/**
 * 建议
 */
export interface Recommendation {
  type: "testing" | "documentation" | "communication" | "review";
  priority: "high" | "medium" | "low";
  description: string;
  assignees?: string[];
}

/**
 * 变更影响分析器
 */
export class ImpactAnalyzer {
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
   * 分析变更影响
   */
  async analyzeImpact(
    sliceId: string,
    changeType: ChangeType
  ): Promise<ImpactReport> {
    const slice = this.slices.get(sliceId);
    if (!slice) {
      throw new Error(`Slice not found: ${sliceId}`);
    }

    // 分析直接影响
    const directImpact = this.analyzeDirectImpact(sliceId);

    // 分析间接影响
    const indirectImpact = this.analyzeIndirectImpact(sliceId, directImpact);

    // 分析级联影响
    const cascadingImpact = this.analyzeCascadingImpact(
      sliceId,
      directImpact,
      indirectImpact
    );

    // 收集受影响的文件
    const affectedFiles = this.collectAffectedFiles(
      sliceId,
      directImpact,
      indirectImpact
    );

    // 收集受影响的测试
    const affectedTests = this.collectAffectedTests(affectedFiles);

    // 评估风险等级
    const riskLevel = this.assessRiskLevel(
      changeType,
      directImpact,
      indirectImpact,
      cascadingImpact
    );

    // 识别风险因素
    const riskFactors = this.identifyRiskFactors(
      slice,
      changeType,
      directImpact,
      indirectImpact
    );

    // 生成建议
    const recommendations = this.generateRecommendations(
      slice,
      changeType,
      directImpact,
      indirectImpact,
      riskLevel
    );

    // 估算工作量
    const estimatedEffort = this.estimateEffort(
      directImpact,
      indirectImpact,
      affectedTests
    );

    // 计算影响分数
    const impactScore = this.calculateImpactScore(
      directImpact,
      indirectImpact,
      cascadingImpact,
      riskLevel
    );

    return {
      changedSlice: sliceId,
      changeType,
      directImpact,
      indirectImpact,
      cascadingImpact,
      affectedFiles,
      affectedTests,
      riskLevel,
      riskFactors,
      recommendations,
      estimatedEffort,
      impactScore,
    };
  }

  /**
   * 分析直接影响
   */
  private analyzeDirectImpact(sliceId: string): ImpactedSlice[] {
    const impacted: ImpactedSlice[] = [];

    if (!this.dependencyGraph) {
      return impacted;
    }

    const node = this.dependencyGraph.nodes.get(sliceId);
    if (!node) {
      return impacted;
    }

    // 找到所有直接依赖此切片的切片
    for (const dependentId of node.dependents) {
      const dependentNode = this.dependencyGraph.nodes.get(dependentId);
      if (!dependentNode) continue;

      // 分析依赖类型
      const deps = this.dependencyGraph.edges.get(dependentId) || [];
      const dep = deps.find((d) => d.targetSliceId === sliceId);

      impacted.push({
        sliceId: dependentId,
        impactType: "direct",
        impactReason: dep?.reason || "Direct dependency",
        severity: dep?.type === "hard" ? "high" : "medium",
        requiresUpdate: dep?.type === "hard",
        requiresRetest: true,
      });
    }

    return impacted;
  }

  /**
   * 分析间接影响
   */
  private analyzeIndirectImpact(
    sliceId: string,
    directImpact: ImpactedSlice[]
  ): ImpactedSlice[] {
    const impacted: ImpactedSlice[] = [];
    const visited = new Set<string>([sliceId]);

    // 标记直接影响的切片
    for (const impact of directImpact) {
      visited.add(impact.sliceId);
    }

    // BFS 查找间接影响
    const queue = [...directImpact.map((i) => i.sliceId)];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentNode = this.dependencyGraph?.nodes.get(currentId);
      if (!currentNode) continue;

      for (const dependentId of currentNode.dependents) {
        if (visited.has(dependentId)) continue;
        visited.add(dependentId);

        const deps = this.dependencyGraph?.edges.get(dependentId) || [];
        const dep = deps.find((d) => d.targetSliceId === currentId);

        impacted.push({
          sliceId: dependentId,
          impactType: "indirect",
          impactReason: `Indirect dependency via ${currentId}`,
          severity: "medium",
          requiresUpdate: false,
          requiresRetest: dep?.type === "hard",
        });

        queue.push(dependentId);
      }
    }

    return impacted;
  }

  /**
   * 分析级联影响
   */
  private analyzeCascadingImpact(
    sliceId: string,
    directImpact: ImpactedSlice[],
    indirectImpact: ImpactedSlice[]
  ): ImpactedSlice[] {
    const impacted: ImpactedSlice[] = [];

    // 检查是否在关键路径上
    if (this.isOnCriticalPath(sliceId)) {
      // 关键路径上的变更会影响整个项目时间线
      const allSlices = Array.from(this.slices.keys());
      for (const otherSliceId of allSlices) {
        if (
          otherSliceId === sliceId ||
          directImpact.some((i) => i.sliceId === otherSliceId) ||
          indirectImpact.some((i) => i.sliceId === otherSliceId)
        ) {
          continue;
        }

        impacted.push({
          sliceId: otherSliceId,
          impactType: "cascading",
          impactReason: "On critical path - may affect project timeline",
          severity: "low",
          requiresUpdate: false,
          requiresRetest: false,
        });
      }
    }

    return impacted;
  }

  /**
   * 检查是否在关键路径上
   */
  private isOnCriticalPath(sliceId: string): boolean {
    if (!this.dependencyGraph) {
      return false;
    }

    return this.dependencyGraph.criticalPath.includes(sliceId);
  }

  /**
   * 收集受影响的文件
   */
  private collectAffectedFiles(
    sliceId: string,
    directImpact: ImpactedSlice[],
    indirectImpact: ImpactedSlice[]
  ): string[] {
    const files = new Set<string>();

    // 收集主切片的文件
    const mainSlice = this.slices.get(sliceId);
    if (mainSlice) {
      const mainFiles = this.extractFiles(mainSlice);
      mainFiles.forEach((f) => files.add(f));
    }

    // 收集直接影响切片的文件
    for (const impact of directImpact) {
      const slice = this.slices.get(impact.sliceId);
      if (slice) {
        const sliceFiles = this.extractFiles(slice);
        sliceFiles.forEach((f) => files.add(f));
      }
    }

    // 收集间接影响切片的文件（如果需要重新测试）
    for (const impact of indirectImpact) {
      if (impact.requiresRetest) {
        const slice = this.slices.get(impact.sliceId);
        if (slice) {
          const sliceFiles = this.extractFiles(slice);
          sliceFiles.forEach((f) => files.add(f));
        }
      }
    }

    return Array.from(files);
  }

  /**
   * 提取文件
   */
  private extractFiles(slice: Slice): string[] {
    const files: string[] = [];
    const filePattern = /`([^`]+\.(ts|js|tsx|jsx|go|py|json|yaml|yml))`/g;
    let match;

    const text = `${slice.description} ${slice.tasks?.map((t) => t.description).join(" ")}`;
    while ((match = filePattern.exec(text)) !== null) {
      files.push(match[1]);
    }

    return files;
  }

  /**
   * 收集受影响的测试
   */
  private collectAffectedTests(affectedFiles: string[]): string[] {
    const tests = new Set<string>();

    for (const file of affectedFiles) {
      // 推断测试文件名
      const testFiles = this.inferTestFiles(file);
      testFiles.forEach((t) => tests.add(t));
    }

    return Array.from(tests);
  }

  /**
   * 推断测试文件
   */
  private inferTestFiles(file: string): string[] {
    const tests: string[] = [];
    const ext = path.extname(file);
    const base = path.basename(file, ext);
    const dir = path.dirname(file);

    // 常见测试文件命名模式
    const patterns = [
      `${base}.test${ext}`,
      `${base}.spec${ext}`,
      `${base}_test${ext}`,
      `${base}_spec${ext}`,
      path.join(dir, "__tests__", `${base}${ext}`),
      path.join(dir, "tests", `${base}${ext}`),
    ];

    return patterns;
  }

  /**
   * 评估风险等级
   */
  private assessRiskLevel(
    changeType: ChangeType,
    directImpact: ImpactedSlice[],
    indirectImpact: ImpactedSlice[],
    cascadingImpact: ImpactedSlice[]
  ): RiskLevel {
    let score = 0;

    // 变更类型权重
    const changeTypeWeight = {
      add: 1,
      modify: 2,
      delete: 3,
      refactor: 2,
    };
    score += changeTypeWeight[changeType];

    // 直接影响权重
    score += directImpact.length * 2;

    // 间接影响权重
    score += indirectImpact.length * 1;

    // 级联影响权重
    score += cascadingImpact.length * 0.5;

    // 高严重性影响权重
    const highSeverityCount = [
      ...directImpact,
      ...indirectImpact,
      ...cascadingImpact,
    ].filter((i) => i.severity === "high" || i.severity === "critical").length;
    score += highSeverityCount * 3;

    // 评估风险等级
    if (score >= 20) return "critical";
    if (score >= 10) return "high";
    if (score >= 5) return "medium";
    return "low";
  }

  /**
   * 识别风险因素
   */
  private identifyRiskFactors(
    slice: Slice,
    changeType: ChangeType,
    directImpact: ImpactedSlice[],
    indirectImpact: ImpactedSlice[]
  ): RiskFactor[] {
    const factors: RiskFactor[] = [];

    // 因素 1: 影响范围
    if (directImpact.length > 5) {
      factors.push({
        factor: "Wide Impact Scope",
        description: `This change directly affects ${directImpact.length} slices`,
        severity: "high",
        mitigation: "Conduct thorough testing and staged rollout",
      });
    }

    // 因素 2: 删除操作
    if (changeType === "delete") {
      factors.push({
        factor: "Destructive Change",
        description: "Deleting functionality may break dependent slices",
        severity: "critical",
        mitigation: "Ensure all dependencies are updated or removed",
      });
    }

    // 因素 3: 关键路径
    if (this.isOnCriticalPath(slice.id)) {
      factors.push({
        factor: "Critical Path Impact",
        description: "This slice is on the critical path",
        severity: "high",
        mitigation: "Prioritize this change and monitor closely",
      });
    }

    // 因素 4: 复杂依赖
    if (indirectImpact.length > 10) {
      factors.push({
        factor: "Complex Dependency Chain",
        description: `This change has ${indirectImpact.length} indirect impacts`,
        severity: "medium",
        mitigation: "Document all affected areas and communicate widely",
      });
    }

    // 因素 5: 缺少测试
    const files = this.extractFiles(slice);
    const tests = this.collectAffectedTests(files);
    if (tests.length === 0) {
      factors.push({
        factor: "Insufficient Test Coverage",
        description: "No tests found for affected files",
        severity: "high",
        mitigation: "Add comprehensive test coverage before making changes",
      });
    }

    return factors;
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    slice: Slice,
    changeType: ChangeType,
    directImpact: ImpactedSlice[],
    indirectImpact: ImpactedSlice[],
    riskLevel: RiskLevel
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // 建议 1: 测试
    if (directImpact.length > 0) {
      recommendations.push({
        type: "testing",
        priority: riskLevel === "critical" || riskLevel === "high" ? "high" : "medium",
        description: `Run tests for ${directImpact.length} directly affected slices: ${directImpact.map((i) => i.sliceId).join(", ")}`,
      });
    }

    // 建议 2: 文档更新
    if (changeType === "modify" || changeType === "refactor") {
      recommendations.push({
        type: "documentation",
        priority: "medium",
        description: "Update documentation to reflect changes in behavior or API",
      });
    }

    // 建议 3: 团队沟通
    if (directImpact.length > 3 || riskLevel === "critical") {
      recommendations.push({
        type: "communication",
        priority: "high",
        description: `Notify team members working on affected slices: ${directImpact.map((i) => i.sliceId).join(", ")}`,
      });
    }

    // 建议 4: 代码审查
    if (riskLevel === "critical" || riskLevel === "high") {
      recommendations.push({
        type: "review",
        priority: "high",
        description: "Request thorough code review from senior team members",
      });
    }

    // 建议 5: 分阶段执行
    if (indirectImpact.length > 5) {
      recommendations.push({
        type: "testing",
        priority: "medium",
        description: "Consider staged rollout to minimize risk",
      });
    }

    return recommendations;
  }

  /**
   * 估算工作量
   */
  private estimateEffort(
    directImpact: ImpactedSlice[],
    indirectImpact: ImpactedSlice[],
    affectedTests: string[]
  ): {
    testing: string;
    documentation: string;
    communication: string;
  } {
    // 测试工作量
    const testingHours =
      directImpact.length * 2 + indirectImpact.length * 1 + affectedTests.length * 0.5;
    const testing =
      testingHours < 2
        ? "< 2 hours"
        : testingHours < 8
        ? "2-8 hours"
        : testingHours < 16
        ? "1-2 days"
        : "> 2 days";

    // 文档工作量
    const docHours = directImpact.length * 0.5 + indirectImpact.length * 0.25;
    const documentation =
      docHours < 1 ? "< 1 hour" : docHours < 4 ? "1-4 hours" : "> 4 hours";

    // 沟通工作量
    const commHours = directImpact.length * 0.25;
    const communication =
      commHours < 0.5 ? "< 30 min" : commHours < 2 ? "30 min - 2 hours" : "> 2 hours";

    return {
      testing,
      documentation,
      communication,
    };
  }

  /**
   * 计算影响分数
   */
  private calculateImpactScore(
    directImpact: ImpactedSlice[],
    indirectImpact: ImpactedSlice[],
    cascadingImpact: ImpactedSlice[],
    riskLevel: RiskLevel
  ): number {
    let score = 0;

    // 直接影响分数
    score += directImpact.length * 10;

    // 间接影响分数
    score += indirectImpact.length * 5;

    // 级联影响分数
    score += cascadingImpact.length * 2;

    // 风险等级加成
    const riskMultiplier = {
      low: 1,
      medium: 1.5,
      high: 2,
      critical: 3,
    };
    score *= riskMultiplier[riskLevel];

    // 归一化到 0-100
    return Math.min(100, Math.round(score));
  }

  /**
   * 保存影响报告
   */
  async saveImpactReport(report: ImpactReport, outputPath: string): Promise<void> {
    const reportData = {
      generatedAt: new Date().toISOString(),
      ...report,
    };

    fs.writeFileSync(outputPath, JSON.stringify(reportData, null, 2));
    console.log(`Impact report saved to ${outputPath}`);
  }

  /**
   * 生成影响报告（Markdown 格式）
   */
  generateMarkdownReport(report: ImpactReport): string {
    let md = `# Impact Analysis Report\n\n`;
    md += `**Changed Slice:** ${report.changedSlice}\n`;
    md += `**Change Type:** ${report.changeType}\n`;
    md += `**Risk Level:** ${report.riskLevel.toUpperCase()}\n`;
    md += `**Impact Score:** ${report.impactScore}/100\n\n`;

    md += `## Summary\n\n`;
    md += `- **Direct Impact:** ${report.directImpact.length} slices\n`;
    md += `- **Indirect Impact:** ${report.indirectImpact.length} slices\n`;
    md += `- **Cascading Impact:** ${report.cascadingImpact.length} slices\n`;
    md += `- **Affected Files:** ${report.affectedFiles.length}\n`;
    md += `- **Affected Tests:** ${report.affectedTests.length}\n\n`;

    if (report.directImpact.length > 0) {
      md += `## Direct Impact\n\n`;
      for (const impact of report.directImpact) {
        md += `- **${impact.sliceId}** (${impact.severity})\n`;
        md += `  - Reason: ${impact.impactReason}\n`;
        md += `  - Requires Update: ${impact.requiresUpdate ? "Yes" : "No"}\n`;
        md += `  - Requires Retest: ${impact.requiresRetest ? "Yes" : "No"}\n`;
      }
      md += `\n`;
    }

    if (report.riskFactors.length > 0) {
      md += `## Risk Factors\n\n`;
      for (const factor of report.riskFactors) {
        md += `### ${factor.factor} (${factor.severity})\n\n`;
        md += `${factor.description}\n\n`;
        md += `**Mitigation:** ${factor.mitigation}\n\n`;
      }
    }

    if (report.recommendations.length > 0) {
      md += `## Recommendations\n\n`;
      for (const rec of report.recommendations) {
        md += `- [${rec.priority.toUpperCase()}] **${rec.type}**: ${rec.description}\n`;
      }
      md += `\n`;
    }

    md += `## Estimated Effort\n\n`;
    md += `- **Testing:** ${report.estimatedEffort.testing}\n`;
    md += `- **Documentation:** ${report.estimatedEffort.documentation}\n`;
    md += `- **Communication:** ${report.estimatedEffort.communication}\n`;

    return md;
  }
}
