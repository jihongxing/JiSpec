import type { GitDiffClassification } from "./git-diff-classifier";

/**
 * Lane type for change classification.
 */
export type LaneType = "fast" | "strict" | "unknown";

/**
 * Lane decision result.
 */
export interface LaneDecision {
  lane: LaneType;
  reasons: string[];
  requestedLane?: LaneType;
  autoPromoted: boolean;
}

/**
 * Compute lane decision from git diff classification.
 */
export function computeLaneDecision(
  classification: GitDiffClassification,
  requestedLane: LaneType = "auto" as any,
): LaneDecision {
  const reasons: string[] = [];
  let lane: LaneType = "unknown";
  let autoPromoted = false;

  // If no changes, default to fast
  if (classification.changedPaths.length === 0) {
    reasons.push("no changes detected");
    return {
      lane: "fast",
      reasons,
      requestedLane: requestedLane === ("auto" as any) ? undefined : requestedLane,
      autoPromoted: false,
    };
  }

  // If user explicitly requested strict, honor it
  if (requestedLane === "strict") {
    reasons.push("user requested strict lane");
    return {
      lane: "strict",
      reasons,
      requestedLane,
      autoPromoted: false,
    };
  }

  // Check if fast lane is eligible based on classification
  if (classification.fastEligible) {
    lane = "fast";
    reasons.push("all changes are safe for fast lane");

    // Add details about what was changed
    const docsCount = classification.changedPaths.filter(p => p.kind === "docs_only").length;
    const testsCount = classification.changedPaths.filter(p => p.kind === "test_only").length;

    if (docsCount > 0) {
      reasons.push(`${docsCount} documentation file(s)`);
    }
    if (testsCount > 0) {
      reasons.push(`${testsCount} test file(s)`);
    }
  } else {
    // Must use strict lane
    lane = "strict";
    reasons.push(...classification.strictReasons);

    // If user requested fast but we're promoting to strict
    if (requestedLane === "fast") {
      autoPromoted = true;
      reasons.push("auto-promoted from fast to strict due to critical path changes");
    }
  }

  return {
    lane,
    reasons,
    requestedLane: requestedLane === ("auto" as any) ? undefined : requestedLane,
    autoPromoted,
  };
}

/**
 * Render lane decision as human-readable text.
 */
export function renderLaneDecisionText(decision: LaneDecision): string {
  const lines: string[] = [];

  lines.push(`Lane: ${decision.lane.toUpperCase()}`);

  if (decision.autoPromoted) {
    lines.push("(auto-promoted from requested fast lane)");
  }

  if (decision.reasons.length > 0) {
    lines.push("");
    lines.push("Why:");
    for (const reason of decision.reasons) {
      lines.push(`- ${reason}`);
    }
  }

  return lines.join("\n");
}
