import { type LifecycleState, LIFECYCLE_ORDER } from "./validator";
import { DependencyGraphBuilder, type DependencyGraph, type DependencyEdge } from "./dependency-graph";

/**
 * Types of changes that can trigger impact analysis
 */
export type ChangeType =
  | "content_changed"      // File content modified
  | "state_regressed"      // Lifecycle state moved backward
  | "gate_failed"          // Gate changed from true to false
  | "trace_broken"         // Trace link removed or invalidated
  | "dependency_added"     // New dependency added
  | "dependency_removed";  // Dependency removed

/**
 * Artifact types that can change
 */
export type ArtifactType =
  | "requirements"
  | "design"
  | "behavior"
  | "test"
  | "code"
  | "evidence";

/**
 * Represents a change event in a slice
 */
export interface ChangeEvent {
  slice_id: string;
  timestamp: string;
  change_type: ChangeType;
  changed_artifacts: ArtifactType[];
  previous_state?: LifecycleState;
  current_state: LifecycleState;
  details?: string;
}

/**
 * Represents the impact of a change on a downstream slice
 */
export interface ImpactedSlice {
  slice_id: string;
  current_state: LifecycleState;
  impact_reason: string;
  affected_dependency: {
    kind: string;
    required_state: LifecycleState;
  };
  recommended_action: "rerun" | "review" | "monitor";
  earliest_rerun_stage?: string;
}

/**
 * Result of impact analysis
 */
export interface ImpactAnalysisResult {
  source_slice: string;
  change_event: ChangeEvent;
  impacted_slices: ImpactedSlice[];
  total_impacted: number;
  analysis_timestamp: string;
}

/**
 * Invalidation action to be taken
 */
export interface InvalidationAction {
  slice_id: string;
  action: "invalidate_gates" | "reset_state" | "mark_stale";
  gates_to_invalidate?: string[];
  target_state?: LifecycleState;
  reason: string;
}

/**
 * Result of invalidation operation
 */
export interface InvalidationResult {
  source_slice: string;
  actions: InvalidationAction[];
  dry_run: boolean;
  timestamp: string;
}

/**
 * Analyzes the impact of changes on dependent slices
 */
export class ImpactAnalyzer {
  private root: string;
  private graphBuilder: DependencyGraphBuilder;

  constructor(root: string) {
    this.root = root;
    this.graphBuilder = new DependencyGraphBuilder(root);
  }

  /**
   * Analyze impact of a change event on downstream slices
   */
  analyzeImpact(changeEvent: ChangeEvent): ImpactAnalysisResult {
    const graph = this.graphBuilder.build();
    const downstream = this.graphBuilder.getDownstream(graph, changeEvent.slice_id);
    const impactedSlices: ImpactedSlice[] = [];

    for (const downstreamId of downstream) {
      const impact = this.analyzeSliceImpact(graph, changeEvent, downstreamId);
      if (impact) {
        impactedSlices.push(impact);
      }
    }

    return {
      source_slice: changeEvent.slice_id,
      change_event: changeEvent,
      impacted_slices: impactedSlices,
      total_impacted: impactedSlices.length,
      analysis_timestamp: new Date().toISOString(),
    };
  }

  /**
   * Analyze impact on a specific downstream slice
   */
  private analyzeSliceImpact(
    graph: DependencyGraph,
    changeEvent: ChangeEvent,
    downstreamId: string
  ): ImpactedSlice | null {
    const downstreamNode = graph.nodes.get(downstreamId);
    if (!downstreamNode) return null;

    // Find the dependency edge from downstream to source
    const dependency = downstreamNode.dependencies.find(
      dep => dep.slice_id === changeEvent.slice_id
    );
    if (!dependency) return null;

    // Determine if this change impacts the downstream slice
    const impactReason = this.determineImpactReason(changeEvent, dependency);
    if (!impactReason) return null;

    // Determine recommended action
    const recommendedAction = this.determineRecommendedAction(changeEvent, dependency);

    // Determine earliest rerun stage
    const earliestRerunStage = this.determineEarliestRerunStage(dependency.kind);

    return {
      slice_id: downstreamId,
      current_state: downstreamNode.state,
      impact_reason: impactReason,
      affected_dependency: {
        kind: dependency.kind,
        required_state: dependency.required_state,
      },
      recommended_action: recommendedAction,
      earliest_rerun_stage: earliestRerunStage,
    };
  }

  /**
   * Determine why a change impacts a downstream slice
   */
  private determineImpactReason(
    changeEvent: ChangeEvent,
    dependency: { kind: string; required_state: LifecycleState; optional?: boolean }
  ): string | null {
    // Optional dependencies only trigger warnings
    if (dependency.optional) {
      return `Optional dependency on ${dependency.kind} changed`;
    }

    // Check if changed artifact matches dependency kind
    const artifactChanged = changeEvent.changed_artifacts.some(
      artifact => artifact === dependency.kind
    );

    if (artifactChanged) {
      return `Upstream ${dependency.kind} artifact changed`;
    }

    // Check if state regressed below required state
    if (changeEvent.change_type === "state_regressed" && changeEvent.previous_state) {
      const currentStateIndex = LIFECYCLE_ORDER.indexOf(changeEvent.current_state);
      const requiredStateIndex = LIFECYCLE_ORDER.indexOf(dependency.required_state);

      if (currentStateIndex < requiredStateIndex) {
        return `Upstream state regressed below required state (${dependency.required_state})`;
      }
    }

    // Check if gate failed
    if (changeEvent.change_type === "gate_failed") {
      return `Upstream gate failed, may affect ${dependency.kind} stability`;
    }

    return null;
  }

  /**
   * Determine recommended action for impacted slice
   */
  private determineRecommendedAction(
    changeEvent: ChangeEvent,
    dependency: { kind: string; optional?: boolean }
  ): "rerun" | "review" | "monitor" {
    if (dependency.optional) {
      return "monitor";
    }

    if (changeEvent.change_type === "state_regressed") {
      return "rerun";
    }

    if (changeEvent.change_type === "content_changed") {
      return "rerun";
    }

    return "review";
  }

  /**
   * Determine earliest stage that needs to be rerun
   */
  private determineEarliestRerunStage(dependencyKind: string): string {
    const stageMapping: Record<string, string> = {
      requirements: "requirements",
      design: "design",
      behavior: "behavior",
      test: "test",
      code: "implementing",
      evidence: "verifying",
    };

    return stageMapping[dependencyKind] || "test";
  }

  /**
   * Compute invalidation actions for a change event
   */
  computeInvalidationActions(changeEvent: ChangeEvent, dryRun: boolean = true): InvalidationResult {
    const impactResult = this.analyzeImpact(changeEvent);
    const actions: InvalidationAction[] = [];

    for (const impacted of impactResult.impacted_slices) {
      const action = this.computeInvalidationAction(changeEvent, impacted);
      if (action) {
        actions.push(action);
      }
    }

    return {
      source_slice: changeEvent.slice_id,
      actions,
      dry_run: dryRun,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Compute invalidation action for a single impacted slice
   */
  private computeInvalidationAction(
    changeEvent: ChangeEvent,
    impacted: ImpactedSlice
  ): InvalidationAction | null {
    // Optional dependencies only get monitoring
    if (impacted.recommended_action === "monitor") {
      return null;
    }

    // For state regression, reset downstream state
    if (changeEvent.change_type === "state_regressed") {
      return {
        slice_id: impacted.slice_id,
        action: "reset_state",
        target_state: this.computeTargetState(impacted),
        reason: `Upstream ${changeEvent.slice_id} regressed to ${changeEvent.current_state}`,
      };
    }

    // For content changes, invalidate relevant gates
    if (changeEvent.change_type === "content_changed") {
      const gatesToInvalidate = this.computeGatesToInvalidate(
        impacted.affected_dependency.kind,
        impacted.current_state
      );

      if (gatesToInvalidate.length > 0) {
        return {
          slice_id: impacted.slice_id,
          action: "invalidate_gates",
          gates_to_invalidate: gatesToInvalidate,
          reason: `Upstream ${impacted.affected_dependency.kind} changed`,
        };
      }
    }

    // For gate failures, mark as stale
    if (changeEvent.change_type === "gate_failed") {
      return {
        slice_id: impacted.slice_id,
        action: "mark_stale",
        reason: `Upstream gate failed in ${changeEvent.slice_id}`,
      };
    }

    return null;
  }

  /**
   * Compute target state for state reset
   */
  private computeTargetState(impacted: ImpactedSlice): LifecycleState {
    // Reset to the stage before the earliest rerun stage
    const stageToStateMapping: Record<string, LifecycleState> = {
      requirements: "proposed",
      design: "requirements-defined",
      behavior: "design-defined",
      test: "behavior-defined",
      implementing: "test-defined",
      verifying: "implementing",
    };

    return stageToStateMapping[impacted.earliest_rerun_stage || "test"] || "proposed";
  }

  /**
   * Compute which gates should be invalidated
   */
  private computeGatesToInvalidate(dependencyKind: string, currentState: LifecycleState): string[] {
    const gates: string[] = [];

    // Map dependency kind to gates that depend on it
    const kindToGatesMapping: Record<string, string[]> = {
      requirements: ["requirements_ready", "design_ready", "behavior_ready", "test_ready", "implementation_ready", "verification_ready"],
      design: ["design_ready", "behavior_ready", "test_ready", "implementation_ready", "verification_ready"],
      behavior: ["behavior_ready", "test_ready", "implementation_ready", "verification_ready"],
      test: ["test_ready", "implementation_ready", "verification_ready"],
      code: ["implementation_ready", "verification_ready"],
      evidence: ["verification_ready"],
    };

    const potentialGates = kindToGatesMapping[dependencyKind] || [];

    // Only invalidate gates that are relevant to current state
    const stateToGatesMapping: Record<LifecycleState, string[]> = {
      "proposed": [],
      "requirements-defined": ["requirements_ready"],
      "design-defined": ["requirements_ready", "design_ready"],
      "behavior-defined": ["requirements_ready", "design_ready", "behavior_ready"],
      "test-defined": ["requirements_ready", "design_ready", "behavior_ready", "test_ready"],
      "implementing": ["requirements_ready", "design_ready", "behavior_ready", "test_ready", "implementation_ready"],
      "verifying": ["requirements_ready", "design_ready", "behavior_ready", "test_ready", "implementation_ready", "verification_ready"],
      "accepted": ["requirements_ready", "design_ready", "behavior_ready", "test_ready", "implementation_ready", "verification_ready", "accepted"],
      "released": ["requirements_ready", "design_ready", "behavior_ready", "test_ready", "implementation_ready", "verification_ready", "accepted"],
    };

    const relevantGates = stateToGatesMapping[currentState] || [];

    // Return intersection of potential gates and relevant gates
    return potentialGates.filter(gate => relevantGates.includes(gate));
  }
}

