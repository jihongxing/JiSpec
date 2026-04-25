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
   * Compute execution batches using topological sort
   */
  private computeBatches(
    graph: DependencyGraph,
    tasks: Map<string, ExecutionTask>
  ): ExecutionBatch[] {
    const batches: ExecutionBatch[] = [];
    const completed = new Set<string>();
    const remaining = new Set(tasks.keys());

    let batchNumber = 0;
    while (remaining.size > 0) {
      // Find tasks with all dependencies completed
      const readyTasks: ExecutionTask[] = [];

      for (const sliceId of remaining) {
        const task = tasks.get(sliceId)!;
        const allDepsCompleted = task.dependencies.every(depId =>
          completed.has(depId) || !tasks.has(depId)
        );

        if (allDepsCompleted) {
          task.status = "ready";
          readyTasks.push(task);
        }
      }

      // If no tasks are ready, we have a cycle or missing dependency
      if (readyTasks.length === 0) {
        // Mark remaining tasks as blocked
        for (const sliceId of remaining) {
          const task = tasks.get(sliceId)!;
          task.status = "blocked";
          task.blocked_by = task.dependencies.filter(depId => !completed.has(depId));
        }
        break;
      }

      // Create batch
      batches.push({
        batch_number: batchNumber++,
        tasks: readyTasks,
        status: "pending",
      });

      // Mark tasks as completed for next iteration
      for (const task of readyTasks) {
        completed.add(task.slice_id);
        remaining.delete(task.slice_id);
      }
    }

    return batches;
  }

  /**
   * Check if a task is ready to execute based on upstream state requirements
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
      const upstreamTask = completedTasks.get(dep.slice_id);

      // Check if upstream task exists and completed
      if (!upstreamTask || upstreamTask.status !== "completed") {
        return {
          ready: false,
          reason: `Upstream slice ${dep.slice_id} not completed`
        };
      }

      // Check if upstream state meets requirement
      const upstreamNode = graph.nodes.get(dep.slice_id);
      if (!upstreamNode) continue;

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
}
