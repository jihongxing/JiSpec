import * as fs from "fs";
import * as path from "path";
import { Slice } from "./types";

/**
 * 依赖类型
 */
export type DependencyType = "hard" | "soft" | "conflict" | "optional";

/**
 * 切片依赖
 */
export interface SliceDependency {
  sourceSliceId: string;
  targetSliceId: string;
  type: DependencyType;
  reason: string;
  version?: string;
  metadata?: Record<string, any>;
}

/**
 * 切片节点
 */
export interface SliceNode {
  sliceId: string;
  slice: Slice;
  inDegree: number;
  outDegree: number;
  dependencies: string[];
  dependents: string[];
  level: number; // 依赖层级
}

/**
 * 依赖图
 */
export interface DependencyGraph {
  nodes: Map<string, SliceNode>;
  edges: Map<string, SliceDependency[]>;
  cycles: string[][];
  criticalPath: string[];
  maxDepth: number;
}

/**
 * 依赖分析结果
 */
export interface DependencyAnalysis {
  graph: DependencyGraph;
  hasCycles: boolean;
  isAcyclic: boolean;
  topologicalOrder: string[];
  executionBatches: string[][];
  statistics: {
    totalNodes: number;
    totalEdges: number;
    maxDepth: number;
    avgDependencies: number;
    isolatedNodes: string[];
  };
}

/**
 * 依赖图构建器
 */
export class DependencyGraphBuilder {
  private slices: Map<string, Slice> = new Map();
  private explicitDependencies: SliceDependency[] = [];

  /**
   * 添加切片
   */
  addSlice(slice: Slice): void {
    this.slices.set(slice.id, slice);
  }

  /**
   * 添加显式依赖
   */
  addDependency(dependency: SliceDependency): void {
    this.explicitDependencies.push(dependency);
  }

  /**
   * 从配置文件加载依赖
   */
  loadDependenciesFromConfig(configPath: string): void {
    if (!fs.existsSync(configPath)) {
      return;
    }

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (config.dependencies) {
      for (const dep of config.dependencies) {
        this.addDependency(dep);
      }
    }
  }

  /**
   * 自动发现依赖（基于代码分析）
   */
  async discoverDependencies(): Promise<SliceDependency[]> {
    const discovered: SliceDependency[] = [];

    for (const [sourceId, sourceSlice] of this.slices) {
      for (const [targetId, targetSlice] of this.slices) {
        if (sourceId === targetId) continue;

        // 检查文件依赖
        const hasFileDependency = this.checkFileDependency(
          sourceSlice,
          targetSlice
        );
        if (hasFileDependency) {
          discovered.push({
            sourceSliceId: sourceId,
            targetSliceId: targetId,
            type: "hard",
            reason: "File dependency detected",
            metadata: { autoDiscovered: true },
          });
        }

        // 检查模块依赖
        const hasModuleDependency = this.checkModuleDependency(
          sourceSlice,
          targetSlice
        );
        if (hasModuleDependency) {
          discovered.push({
            sourceSliceId: sourceId,
            targetSliceId: targetId,
            type: "soft",
            reason: "Module dependency detected",
            metadata: { autoDiscovered: true },
          });
        }
      }
    }

    return discovered;
  }

  /**
   * 检查文件依赖
   */
  private checkFileDependency(source: Slice, target: Slice): boolean {
    // 简化实现：检查是否有文件路径重叠
    const sourceFiles = this.getSliceFiles(source);
    const targetFiles = this.getSliceFiles(target);

    for (const sourceFile of sourceFiles) {
      for (const targetFile of targetFiles) {
        if (this.filesOverlap(sourceFile, targetFile)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 检查模块依赖
   */
  private checkModuleDependency(source: Slice, target: Slice): boolean {
    // 简化实现：检查描述中是否提到目标切片
    const sourceDesc = source.description.toLowerCase();
    const targetTitle = target.title.toLowerCase();

    return sourceDesc.includes(targetTitle);
  }

  /**
   * 获取切片相关文件
   */
  private getSliceFiles(slice: Slice): string[] {
    // 简化实现：从描述中提取文件路径
    const files: string[] = [];
    const filePattern = /`([^`]+\.(ts|js|tsx|jsx|go|py))`/g;
    let match;

    while ((match = filePattern.exec(slice.description)) !== null) {
      files.push(match[1]);
    }

    return files;
  }

  /**
   * 检查文件是否重叠
   */
  private filesOverlap(file1: string, file2: string): boolean {
    return file1 === file2 || file1.startsWith(file2) || file2.startsWith(file1);
  }

  /**
   * 构建依赖图
   */
  async buildGraph(): Promise<DependencyGraph> {
    // 合并显式依赖和自动发现的依赖
    const autoDeps = await this.discoverDependencies();
    const allDeps = [...this.explicitDependencies, ...autoDeps];

    // 去重
    const uniqueDeps = this.deduplicateDependencies(allDeps);

    // 构建节点
    const nodes = new Map<string, SliceNode>();
    for (const [sliceId, slice] of this.slices) {
      nodes.set(sliceId, {
        sliceId,
        slice,
        inDegree: 0,
        outDegree: 0,
        dependencies: [],
        dependents: [],
        level: 0,
      });
    }

    // 构建边
    const edges = new Map<string, SliceDependency[]>();
    for (const dep of uniqueDeps) {
      const sourceNode = nodes.get(dep.sourceSliceId);
      const targetNode = nodes.get(dep.targetSliceId);

      if (!sourceNode || !targetNode) continue;

      // 更新节点信息
      sourceNode.outDegree++;
      targetNode.inDegree++;
      sourceNode.dependencies.push(dep.targetSliceId);
      targetNode.dependents.push(dep.sourceSliceId);

      // 添加边
      if (!edges.has(dep.sourceSliceId)) {
        edges.set(dep.sourceSliceId, []);
      }
      edges.get(dep.sourceSliceId)!.push(dep);
    }

    // 计算依赖层级
    this.calculateLevels(nodes, edges);

    // 检测循环依赖
    const cycles = this.detectCycles(nodes, edges);

    // 计算关键路径
    const criticalPath = this.findCriticalPath(nodes, edges);

    // 计算最大深度
    const maxDepth = Math.max(...Array.from(nodes.values()).map((n) => n.level));

    return {
      nodes,
      edges,
      cycles,
      criticalPath,
      maxDepth,
    };
  }

  /**
   * 去重依赖
   */
  private deduplicateDependencies(deps: SliceDependency[]): SliceDependency[] {
    const seen = new Set<string>();
    const unique: SliceDependency[] = [];

    for (const dep of deps) {
      const key = `${dep.sourceSliceId}->${dep.targetSliceId}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(dep);
      }
    }

    return unique;
  }

  /**
   * 计算依赖层级
   */
  private calculateLevels(
    nodes: Map<string, SliceNode>,
    edges: Map<string, SliceDependency[]>
  ): void {
    const visited = new Set<string>();
    const stack: string[] = [];

    // 找到所有入度为 0 的节点（根节点）
    const roots = Array.from(nodes.values())
      .filter((n) => n.inDegree === 0)
      .map((n) => n.sliceId);

    // DFS 计算层级
    const dfs = (nodeId: string, level: number) => {
      const node = nodes.get(nodeId)!;
      node.level = Math.max(node.level, level);

      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const deps = edges.get(nodeId) || [];
      for (const dep of deps) {
        dfs(dep.targetSliceId, level + 1);
      }
    };

    for (const root of roots) {
      dfs(root, 0);
    }
  }

  /**
   * 检测循环依赖
   */
  private detectCycles(
    nodes: Map<string, SliceNode>,
    edges: Map<string, SliceDependency[]>
  ): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);
      path.push(nodeId);

      const deps = edges.get(nodeId) || [];
      for (const dep of deps) {
        const targetId = dep.targetSliceId;

        if (!visited.has(targetId)) {
          if (dfs(targetId)) return true;
        } else if (recStack.has(targetId)) {
          // 找到循环
          const cycleStart = path.indexOf(targetId);
          const cycle = path.slice(cycleStart);
          cycles.push([...cycle, targetId]);
          return true;
        }
      }

      path.pop();
      recStack.delete(nodeId);
      return false;
    };

    for (const nodeId of nodes.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId);
      }
    }

    return cycles;
  }

  /**
   * 查找关键路径（最长路径）
   */
  private findCriticalPath(
    nodes: Map<string, SliceNode>,
    edges: Map<string, SliceDependency[]>
  ): string[] {
    const memo = new Map<string, { length: number; path: string[] }>();

    const dfs = (nodeId: string): { length: number; path: string[] } => {
      if (memo.has(nodeId)) {
        return memo.get(nodeId)!;
      }

      const deps = edges.get(nodeId) || [];
      if (deps.length === 0) {
        const result = { length: 1, path: [nodeId] };
        memo.set(nodeId, result);
        return result;
      }

      let maxLength = 0;
      let maxPath: string[] = [];

      for (const dep of deps) {
        const result = dfs(dep.targetSliceId);
        if (result.length > maxLength) {
          maxLength = result.length;
          maxPath = result.path;
        }
      }

      const result = { length: maxLength + 1, path: [nodeId, ...maxPath] };
      memo.set(nodeId, result);
      return result;
    };

    let criticalPath: string[] = [];
    let maxLength = 0;

    for (const nodeId of nodes.keys()) {
      const result = dfs(nodeId);
      if (result.length > maxLength) {
        maxLength = result.length;
        criticalPath = result.path;
      }
    }

    return criticalPath;
  }

  /**
   * 分析依赖图
   */
  async analyze(): Promise<DependencyAnalysis> {
    const graph = await this.buildGraph();

    // 拓扑排序
    const topologicalOrder = this.topologicalSort(graph);

    // 生成执行批次
    const executionBatches = this.generateExecutionBatches(graph);

    // 统计信息
    const statistics = this.calculateStatistics(graph);

    return {
      graph,
      hasCycles: graph.cycles.length > 0,
      isAcyclic: graph.cycles.length === 0,
      topologicalOrder,
      executionBatches,
      statistics,
    };
  }

  /**
   * 拓扑排序
   */
  private topologicalSort(graph: DependencyGraph): string[] {
    const order: string[] = [];
    const inDegree = new Map<string, number>();

    // 初始化入度
    for (const [nodeId, node] of graph.nodes) {
      inDegree.set(nodeId, node.inDegree);
    }

    // 找到所有入度为 0 的节点
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    // Kahn 算法
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      order.push(nodeId);

      const deps = graph.edges.get(nodeId) || [];
      for (const dep of deps) {
        const targetId = dep.targetSliceId;
        const newDegree = inDegree.get(targetId)! - 1;
        inDegree.set(targetId, newDegree);

        if (newDegree === 0) {
          queue.push(targetId);
        }
      }
    }

    return order;
  }

  /**
   * 生成执行批次
   */
  private generateExecutionBatches(graph: DependencyGraph): string[][] {
    const batches: string[][] = [];
    const processed = new Set<string>();

    for (let level = 0; level <= graph.maxDepth; level++) {
      const batch = Array.from(graph.nodes.values())
        .filter((n) => n.level === level && !processed.has(n.sliceId))
        .map((n) => n.sliceId);

      if (batch.length > 0) {
        batches.push(batch);
        batch.forEach((id) => processed.add(id));
      }
    }

    return batches;
  }

  /**
   * 计算统计信息
   */
  private calculateStatistics(graph: DependencyGraph) {
    const totalNodes = graph.nodes.size;
    const totalEdges = Array.from(graph.edges.values()).reduce(
      (sum, deps) => sum + deps.length,
      0
    );
    const maxDepth = graph.maxDepth;
    const avgDependencies = totalNodes > 0 ? totalEdges / totalNodes : 0;
    const isolatedNodes = Array.from(graph.nodes.values())
      .filter((n) => n.inDegree === 0 && n.outDegree === 0)
      .map((n) => n.sliceId);

    return {
      totalNodes,
      totalEdges,
      maxDepth,
      avgDependencies,
      isolatedNodes,
    };
  }

  /**
   * 导出依赖图为 DOT 格式（用于 Graphviz 可视化）
   */
  exportToDot(graph: DependencyGraph): string {
    let dot = "digraph DependencyGraph {\n";
    dot += "  rankdir=LR;\n";
    dot += "  node [shape=box];\n\n";

    // 添加节点
    for (const [nodeId, node] of graph.nodes) {
      const label = node.slice.title.replace(/"/g, '\\"');
      const color = node.inDegree === 0 ? "lightgreen" : "lightblue";
      dot += `  "${nodeId}" [label="${label}", fillcolor="${color}", style=filled];\n`;
    }

    dot += "\n";

    // 添加边
    for (const [sourceId, deps] of graph.edges) {
      for (const dep of deps) {
        const style = dep.type === "hard" ? "solid" : "dashed";
        const color =
          dep.type === "conflict"
            ? "red"
            : dep.type === "optional"
            ? "gray"
            : "black";
        dot += `  "${sourceId}" -> "${dep.targetSliceId}" [style=${style}, color=${color}, label="${dep.type}"];\n`;
      }
    }

    // 标记循环依赖
    for (const cycle of graph.cycles) {
      dot += "\n  // Cycle detected:\n";
      for (let i = 0; i < cycle.length - 1; i++) {
        dot += `  // ${cycle[i]} -> ${cycle[i + 1]}\n`;
      }
    }

    dot += "}\n";
    return dot;
  }

  /**
   * 保存依赖图
   */
  async saveDependencyGraph(
    analysis: DependencyAnalysis,
    outputDir: string
  ): Promise<void> {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 保存 JSON 格式
    const jsonPath = path.join(outputDir, "dependency-graph.json");
    fs.writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          hasCycles: analysis.hasCycles,
          topologicalOrder: analysis.topologicalOrder,
          executionBatches: analysis.executionBatches,
          statistics: analysis.statistics,
          cycles: analysis.graph.cycles,
          criticalPath: analysis.graph.criticalPath,
        },
        null,
        2
      )
    );

    // 保存 DOT 格式
    const dotPath = path.join(outputDir, "dependency-graph.dot");
    const dot = this.exportToDot(analysis.graph);
    fs.writeFileSync(dotPath, dot);

    console.log(`Dependency graph saved to ${outputDir}`);
  }
}
