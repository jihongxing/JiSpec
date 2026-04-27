import { createVerifyRunResult } from "./verdict";
import type { VerifyIssue, VerifyRunResult, VerifyVerdict } from "./verdict";

export interface ObserveModeResult {
  originalVerdict: VerifyVerdict;
  observeVerdict: VerifyVerdict;
  blockingDowngraded: number;
  result: VerifyRunResult;
}

/**
 * Apply observe mode to verify result.
 * In observe mode, blocking issues are downgraded to advisory,
 * but the fact collection remains unchanged.
 */
export function applyObserveMode(result: VerifyRunResult): ObserveModeResult {
  const originalVerdict = result.verdict;
  let blockingDowngraded = 0;

  const observedIssues: VerifyIssue[] = result.issues.map((issue) => {
    if (issue.severity === "blocking") {
      blockingDowngraded++;
      return {
        ...issue,
        severity: "advisory" as const,
        details: mergeIssueDetails(issue.details, {
          matched_by: "observe",
          original_severity: issue.severity,
        }),
      };
    }
    return issue;
  });

  const recomputed = createVerifyRunResult(
    result.root,
    observedIssues,
    {
      sources: result.sources,
      generatedAt: result.generatedAt,
    },
  );
  const observeVerdict = recomputed.verdict;

  return {
    originalVerdict,
    observeVerdict,
    blockingDowngraded,
    result: {
      ...recomputed,
      metadata: {
        ...result.metadata,
        observeMode: true,
        originalVerdict,
        observeBlockingDowngraded: blockingDowngraded,
      },
    },
  };
}

function mergeIssueDetails(details: unknown, annotation: Record<string, unknown>): unknown {
  if (details && typeof details === "object" && !Array.isArray(details)) {
    return {
      ...(details as Record<string, unknown>),
      ...annotation,
    };
  }

  if (details === undefined) {
    return annotation;
  }

  return {
    previous_details: details,
    ...annotation,
  };
}
