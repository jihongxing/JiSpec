import { type LifecycleState, LIFECYCLE_ORDER } from "./validator";
import { DependencyGraphBuilder, type DependencyGraph } from "./dependency-graph";

/**
 * Status of an execution task
 */
export type TaskStatus =
  | "pending"       // Not yet started
  | "ready"         // Dependencies satisfied, ready to run
  | "running"       // Currently executing
  | "completed"     // Successfully completed
  | "failed"        // Execution failed
  | "blocked"       // Blocked by failed upstream dependency
  | "skipped";      // Skipped due to upstream failure

/**
 * Represents a single slice execution task
 */
export interface ExecutionTask {
  slice_id: string;
  current_state: LifecycleState;
  target_state?: LifecycleState;
  status: TaskStatus;
  dependencies: string[];  // slice IDs this task depends on
  blocked_by?: string[];   // slice IDs that are blocking this task
  error?: string;
  started_at?: string;
  completed_at?: string;
}

/**
 * Represents a batch of tasks that can execute in parallel
 */
export interface ExecutionBatch {
  batch_number: number;
  tasks: ExecutionTask[];
  status: "pending" | "running" | "completed" | "failed";
  started_at?: string;
  completed_at?: string;
}

/**
 * Result of scheduling operation
 */
export interface SchedulerResult {
  total_slices: number;
  total_batches: number;
  batches: ExecutionBatch[];
  execution_order: string[];
  dry_run: boolean;
  timestamp: string;
}

/**
 * Result of execution
 */
export interface ExecutionResult {
  scheduler_result: SchedulerResult;
  total_executed: number;
  total_succeeded: number;
  total_failed: number;
  total_blocked: number;
  total_skipped: number;
  duration_ms: number;
  timestamp: string;
}

/**
 * Cross-slice scheduler for parallel execution
 */
export class CrossSliceScheduler {
  private root: string;
  private graphBuilder: DependencyGraphBuilder;

  constructor(root: string) {
    this.root = root;
    this.graphBuilder = new DependencyGraphBuilder(root);
  }

  /**
   * Schedule slices for execution based on dependency graph
   */
  schedule(sliceIds?: string[]): SchedulerResult {
    const graph = this.graphBuilder.build();

    // Determine which slices to schedule
    const targetSlices = sliceIds || Array.from(graph.nodes.keys());

    // Build execution tasks
    const tasks = new Map<string, ExecutionTask>();
    for (const sliceId of targetSlices) {
      const node = graph.nodes.get(sliceId);
      if (!node) continue;

      tasks.set(sliceId, {
        slice_id: sliceId,
        current_state: node.state,
        status: "pending",
        dependencies: node.dependencies.map(dep => dep.slice_id),
      });
    }

    // Compute batches using topological sort
    const batches = this.computeBatches(graph, tasks);

    // Compute execution order
    const executionOrder: string[] = [];
    for (const batch of batches) {
      executionOrder.push(...batch.tasks.map(t => t.slice_id));
    }

    return {
      total_slices: tasks.size,
      total_batches: batches.length,
      batches,
      execution_order: executionOrder,
      dry_run: true,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Compute execution batches using topological sort with readiness checking
   */
  private computeBatches(
    graph: DependencyGraph,
    tasks: Map<string, ExecutionTask>
  ): ExecutionBatch[] {
    const batches: ExecutionBatch[] = [];
    const completed = new Map<string, ExecutionTask>();
    const remaining = new Set(tasks.keys());

    let batchNumber = 0;
    while (remaining.size > 0) {
      // Find tasks with all dependencies completed and state requirements met
      const readyTasks: ExecutionTask[] = [];

      for (const sliceId of remaining) {
        const task = tasks.get(sliceId)!;

        // Check if all dependencies are completed (or not in this task set)
        const allDepsCompleted = task.dependencies.every(depId =>
          completed.has(depId) || !tasks.has(depId)
        );

        if (!allDepsCompleted) {
          continue;
        }

        // Check readiness based on upstream state requirements
        const readinessCheck = this.checkReadiness(task, graph, completed);

        if (readinessCheck.ready) {
          task.status = "ready";
          readyTasks.push(task);
        } else {
          // Task has dependencies completed but state requirements not met
          task.status = "blocked";
          if (readinessCheck.reason) {
            task.blocked_by = [readinessCheck.reason];
          }
        }
      }

      // If no tasks are ready, we have a cycle or unmet state requirements
      if (readyTasks.length === 0) {
        // Mark remaining tasks as blocked
        for (const sliceId of remaining) {
          const task = tasks.get(sliceId)!;
          if (task.status !== "blocked") {
            task.status = "blocked";
            task.blocked_by = task.dependencies.filter(depId => !completed.has(depId));
          }
        }
        break;
      }

      // Create batch
      batches.push({
        batch_number: batchNumber++,
        tasks: readyTasks,
        status: "pending",
      });

      // Mark tasks as completed for next iteration (simulate completion)
      for (const task of readyTasks) {
        const completedTask = { ...task, status: "completed" as TaskStatus };
        completed.set(task.slice_id, completedTask);
        remaining.delete(task.slice_id);
      }
    }

    return batches;
  }

  /**
   * Check if a task is ready to execute based on upstream state requirements
   * For dry-run scheduling: checks if upstream is in task set or already at required state
   * For real execution: checks if upstream completed successfully
   */
  checkReadiness(
    task: ExecutionTask,
    graph: DependencyGraph,
    completedTasks: Map<string, ExecutionTask>
  ): { ready: boolean; reason?: string } {
    const node = graph.nodes.get(task.slice_id);
    if (!node) {
      return { ready: false, reason: "Slice not found in dependency graph" };
    }

    // Check each dependency
    for (const dep of node.dependencies) {
      // If upstream is in completed tasks, check its status
      const upstreamTask = completedTasks.get(dep.slice_id);
      if (upstreamTask) {
        if (upstreamTask.status !== "completed") {
          return {
            ready: false,
            reason: `Upstream slice ${dep.slice_id} not completed`
          };
        }
        // Upstream completed, assume it reached required state
        continue;
      }

      // Upstream not in completed tasks - check current state in graph
      const upstreamNode = graph.nodes.get(dep.slice_id);
      if (!upstreamNode) {
        return {
          ready: false,
          reason: `Upstream slice ${dep.slice_id} not found`
        };
      }

      const upstreamStateIndex = LIFECYCLE_ORDER.indexOf(upstreamNode.state);
      const requiredStateIndex = LIFECYCLE_ORDER.indexOf(dep.required_state);

      if (upstreamStateIndex < requiredStateIndex) {
        return {
          ready: false,
          reason: `Upstream slice ${dep.slice_id} is in state ${upstreamNode.state}, requires ${dep.required_state}`
        };
      }
    }

    return { ready: true };
  }

  /**
   * Propagate failure from a failed task to downstream tasks
   */
  propagateFailure(
    failedTask: ExecutionTask,
    graph: DependencyGraph,
    allTasks: Map<string, ExecutionTask>
  ): string[] {
    const affectedSlices: string[] = [];
    const downstream = this.graphBuilder.getDownstream(graph, failedTask.slice_id);

    for (const downstreamId of downstream) {
      const downstreamTask = allTasks.get(downstreamId);
      if (!downstreamTask) continue;

      // Skip if already failed or blocked
      if (downstreamTask.status === "failed" || downstreamTask.status === "blocked") {
        continue;
      }

      // Mark as blocked
      downstreamTask.status = "blocked";
      downstreamTask.blocked_by = [failedTask.slice_id];
      affectedSlices.push(downstreamId);
    }

    return affectedSlices;
  }

  /**
   * Update batch status based on task statuses
   */
  updateBatchStatus(batch: ExecutionBatch): void {
    const allCompleted = batch.tasks.every(t => t.status === "completed");
    const anyFailed = batch.tasks.some(t => t.status === "failed");

    if (anyFailed) {
      batch.status = "failed";
    } else if (allCompleted) {
      batch.status = "completed";
    } else {
      batch.status = "running";
    }
  }

  /**
   * Execute slices based on the schedule
   */
  async execute(
    sliceIds?: string[],
    options?: {
      maxConcurrent?: number;
      fromBatch?: number;
    }
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    // First, generate the schedule
    const schedule = this.schedule(sliceIds);
    const graph = this.graphBuilder.build();
    const allTasks = new Map<string, ExecutionTask>();

    // Build task map from schedule
    for (const batch of schedule.batches) {
      for (const task of batch.tasks) {
        allTasks.set(task.slice_id, task);
      }
    }

    const maxConcurrent = options?.maxConcurrent || 10;
    const fromBatch = options?.fromBatch || 0;

    let totalExecuted = 0;
    let totalSucceeded = 0;
    let totalFailed = 0;
    let totalBlocked = 0;
    let totalSkipped = 0;

    // Execute batches sequentially
    for (let i = fromBatch; i < schedule.batches.length; i++) {
      const batch = schedule.batches[i];
      batch.status = "running";
      batch.started_at = new Date().toISOString();

      // Execute tasks in batch with concurrency limit
      const executeTask = async (task: ExecutionTask) => {
        // Check readiness before execution
        const completed = new Map<string, ExecutionTask>();
        for (const [id, t] of allTasks.entries()) {
          if (t.status === "completed") {
            completed.set(id, t);
          }
        }

        const readinessCheck = this.checkReadiness(task, graph, completed);
        if (!readinessCheck.ready) {
          task.status = "blocked";
          task.blocked_by = [readinessCheck.reason || "Unknown reason"];
          totalBlocked++;
          return;
        }

        // Execute the task
        task.status = "running";
        task.started_at = new Date().toISOString();
        totalExecuted++;

        try {
          await this.executeTask(task);
          task.status = "completed";
          task.completed_at = new Date().toISOString();
          totalSucceeded++;
        } catch (error) {
          task.status = "failed";
          task.error = error instanceof Error ? error.message : String(error);
          task.completed_at = new Date().toISOString();
          totalFailed++;

          // Propagate failure to downstream tasks
          const affected = this.propagateFailure(task, graph, allTasks);
          totalBlocked += affected.length;
        }
      };

      // Execute tasks with concurrency limit
      const tasks = batch.tasks;
      for (let j = 0; j < tasks.length; j += maxConcurrent) {
        const chunk = tasks.slice(j, j + maxConcurrent);
        await Promise.all(chunk.map(executeTask));
      }

      batch.completed_at = new Date().toISOString();
      this.updateBatchStatus(batch);

      // If any task in batch failed, stop execution
      const batchHasFailures = batch.tasks.some(t => t.status === "failed");
      if (batchHasFailures) {
        // Mark remaining tasks as skipped
        for (let j = i + 1; j < schedule.batches.length; j++) {
          for (const task of schedule.batches[j].tasks) {
            task.status = "skipped";
            totalSkipped++;
          }
        }
        break;
      }
    }

    const duration = Date.now() - startTime;

    // Mark schedule as executed (not dry-run)
    schedule.dry_run = false;

    const result: ExecutionResult = {
      scheduler_result: schedule,
      total_executed: totalExecuted,
      total_succeeded: totalSucceeded,
      total_failed: totalFailed,
      total_blocked: totalBlocked,
      total_skipped: totalSkipped,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    };

    // Persist execution result
    await this.saveExecutionResult(result);

    return result;
  }

  /**
   * Save execution result to disk
   */
  private async saveExecutionResult(result: ExecutionResult): Promise<void> {
    const fs = await import("fs/promises");
    const path = await import("path");

    const executionsDir = path.join(this.root, ".jispec", "executions");
    await fs.mkdir(executionsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `execution-${timestamp}.json`;
    const filepath = path.join(executionsDir, filename);

    await fs.writeFile(filepath, JSON.stringify(result, null, 2), "utf-8");
  }

  /**
   * Execute a single task (slice pipeline)
   */
  private async executeTask(task: ExecutionTask): Promise<void> {
    // Import PipelineExecutor dynamically to avoid circular dependency
    const { PipelineExecutor } = await import("./pipeline-executor");
    const executor = PipelineExecutor.create(this.root);

    // Run the pipeline for this slice
    const result = await executor.run(task.slice_id, {
      dryRun: false,
      skipValidation: false,
      useTUI: false,
    });

    if (!result.success) {
      throw new Error(`Pipeline execution failed: ${result.error || "Unknown error"}`);
    }
  }
}
