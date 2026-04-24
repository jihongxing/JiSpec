import type { StageConfig, PipelineRunOptions, StageResult } from "./pipeline-executor";
import type { ProgressTracker } from "./progress-tracker";

/**
 * 阶段依赖图
 */
export interface StageDependencyGraph {
  stages: Map<string, StageConfig>;
  dependencies: Map<string, string[]>; // stageId -> [依赖的 stageId]
}

/**
 * 并行执行批次
 */
export interface ExecutionBatch {
  batchId: number;
  stages: StageConfig[];
}

/**
 * 并行执行器
 *
 * 功能：
 * 1. 分析阶段依赖关系
 * 2. 构建执行批次（拓扑排序）
 * 3. 并行执行独立阶段
 * 4. 控制并发数量
 */
export class ParallelExecutor {
  private root: string;
  private maxConcurrent: number;

  constructor(root: string, maxConcurrent: number = 3) {
    this.root = root;
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * 构建依赖图
   */
  buildDependencyGraph(stages: StageConfig[]): StageDependencyGraph {
    const graph: StageDependencyGraph = {
      stages: new Map(),
      dependencies: new Map(),
    };

    // 1. 添加所有阶段
    for (const stage of stages) {
      graph.stages.set(stage.id, stage);
      graph.dependencies.set(stage.id, []);
    }

    // 2. 分析依赖关系
    // 简单策略：如果阶段 B 的输入依赖阶段 A 的输出，则 B 依赖 A
    for (let i = 0; i < stages.length; i++) {
      const currentStage = stages[i];
      const deps: string[] = [];

      // 检查前面的阶段
      for (let j = 0; j < i; j++) {
        const prevStage = stages[j];

        // 如果当前阶段的输入与前一阶段的输出有交集，则存在依赖
        if (this.hasOutputInputDependency(prevStage, currentStage)) {
          deps.push(prevStage.id);
        }
      }

      // 如果没有显式依赖，但有 nextStage 指向，则依赖前一个阶段
      if (deps.length === 0 && i > 0) {
        deps.push(stages[i - 1].id);
      }

      graph.dependencies.set(currentStage.id, deps);
    }

    return graph;
  }

  /**
   * 检查输出-输入依赖
   */
  private hasOutputInputDependency(producer: StageConfig, consumer: StageConfig): boolean {
    const outputs = new Set(producer.outputs.files);
    const inputs = new Set(consumer.inputs.files);

    for (const output of outputs) {
      if (inputs.has(output)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 构建执行批次（拓扑排序）
   */
  buildExecutionBatches(graph: StageDependencyGraph): ExecutionBatch[] {
    const batches: ExecutionBatch[] = [];
    const completed = new Set<string>();
    const remaining = new Set(graph.stages.keys());

    let batchId = 0;

    while (remaining.size > 0) {
      const batch: StageConfig[] = [];

      // 找出所有依赖已完成的阶段
      for (const stageId of remaining) {
        const deps = graph.dependencies.get(stageId) || [];
        const allDepsCompleted = deps.every((dep) => completed.has(dep));

        if (allDepsCompleted) {
          const stage = graph.stages.get(stageId)!;
          batch.push(stage);
        }
      }

      // 如果没有可执行的阶段，说明存在循环依赖
      if (batch.length === 0) {
        throw new Error("Circular dependency detected in pipeline stages");
      }

      // 添加批次
      batches.push({
        batchId: batchId++,
        stages: batch,
      });

      // 标记为已完成
      for (const stage of batch) {
        completed.add(stage.id);
        remaining.delete(stage.id);
      }
    }

    return batches;
  }

  /**
   * 并行执行批次
   */
  async executeBatch(
    batch: ExecutionBatch,
    sliceId: string,
    options: PipelineRunOptions,
    progressTracker: ProgressTracker,
    runStage: (
      sliceId: string,
      stage: StageConfig,
      options: PipelineRunOptions,
      progressTracker: ProgressTracker
    ) => Promise<StageResult>
  ): Promise<StageResult[]> {
    console.log(`\n[Parallel] Executing batch ${batch.batchId} with ${batch.stages.length} stage(s)`);

    // 限制并发数量
    const results: StageResult[] = [];
    const queue = [...batch.stages];

    while (queue.length > 0) {
      // 取出最多 maxConcurrent 个阶段
      const chunk = queue.splice(0, this.maxConcurrent);

      // 并行执行
      const chunkResults = await Promise.all(
        chunk.map(async (stage) => {
          console.log(`[Parallel] Starting stage: ${stage.id}`);
          progressTracker.stageStart(stage.id);

          try {
            const result = await runStage(sliceId, stage, options, progressTracker);

            if (result.success) {
              progressTracker.stageEnd(stage.id, true);
              console.log(`[Parallel] ✓ Stage ${stage.id} completed`);
            } else {
              progressTracker.stageEnd(stage.id, false, result.error);
              console.error(`[Parallel] ✗ Stage ${stage.id} failed: ${result.error}`);
            }

            return result;
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            progressTracker.stageEnd(stage.id, false, errorMsg);
            console.error(`[Parallel] ✗ Stage ${stage.id} failed: ${errorMsg}`);

            return {
              stageId: stage.id,
              success: false,
              startTime: new Date().toISOString(),
              endTime: new Date().toISOString(),
              duration: 0,
              error: errorMsg,
              retries: 0,
            };
          }
        })
      );

      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * 执行整个流水线（并行模式）
   */
  async executeParallel(
    stages: StageConfig[],
    sliceId: string,
    options: PipelineRunOptions,
    progressTracker: ProgressTracker,
    runStage: (
      sliceId: string,
      stage: StageConfig,
      options: PipelineRunOptions,
      progressTracker: ProgressTracker
    ) => Promise<StageResult>
  ): Promise<StageResult[]> {
    console.log("\n[Parallel] Building dependency graph...");

    // 1. 构建依赖图
    const graph = this.buildDependencyGraph(stages);

    // 2. 构建执行批次
    const batches = this.buildExecutionBatches(graph);

    console.log(`[Parallel] Execution plan: ${batches.length} batch(es)`);
    for (const batch of batches) {
      console.log(`  Batch ${batch.batchId}: ${batch.stages.map((s) => s.id).join(", ")}`);
    }

    // 3. 按批次执行
    const allResults: StageResult[] = [];

    for (const batch of batches) {
      const batchResults = await this.executeBatch(batch, sliceId, options, progressTracker, runStage);

      allResults.push(...batchResults);

      // 检查是否有失败的阶段
      const failed = batchResults.filter((r) => !r.success);
      if (failed.length > 0) {
        console.error(`\n[Parallel] Batch ${batch.batchId} failed. Stopping pipeline.`);
        throw new Error(`Stages failed: ${failed.map((r) => r.stageId).join(", ")}`);
      }
    }

    return allResults;
  }

  /**
   * 可视化依赖图（用于调试）
   */
  visualizeDependencyGraph(graph: StageDependencyGraph): string {
    const lines: string[] = [];

    lines.push("Dependency Graph:");
    lines.push("");

    for (const [stageId, deps] of graph.dependencies) {
      if (deps.length === 0) {
        lines.push(`  ${stageId} (no dependencies)`);
      } else {
        lines.push(`  ${stageId} depends on: ${deps.join(", ")}`);
      }
    }

    return lines.join("\n");
  }
}
