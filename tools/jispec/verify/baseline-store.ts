import fs from "node:fs";
import path from "node:path";
import { computeIssueFingerprint } from "./issue-fingerprint";
import { createVerifyRunResult } from "./verdict";
import type { VerifyIssue, VerifyRunResult } from "./verdict";

export interface BaselineEntry {
  fingerprint: string;
  code: string;
  path?: string;
  message: string;
  severity: "blocking" | "advisory" | "nonblocking_error";
}

export interface VerifyBaseline {
  version: string;
  createdAt: string;
  updatedAt: string;
  repoRoot: string;
  sourceVerdict: string;
  entries: BaselineEntry[];
}

export interface BaselineApplyResult {
  totalIssues: number;
  baselinedIssues: number;
  newIssues: number;
  matchedFingerprints: string[];
  result: VerifyRunResult;
}

const BASELINE_VERSION = "1.0";
const BASELINE_FILE = ".spec/baselines/verify-baseline.json";
const LEGACY_BASELINE_FILE = ".spec/baseline.json";

/**
 * Write current verify result as baseline.
 */
export function writeVerifyBaseline(root: string, result: VerifyRunResult, filePath?: string): string {
  const baselinePath = resolveBaselinePath(root, filePath);
  const baselineDir = path.dirname(baselinePath);

  if (!fs.existsSync(baselineDir)) {
    fs.mkdirSync(baselineDir, { recursive: true });
  }

  const baseline = buildVerifyBaseline(result);

  fs.writeFileSync(baselinePath, `${JSON.stringify(stableSortBaseline(baseline), null, 2)}\n`, "utf-8");
  return baselinePath;
}

/**
 * Load baseline from disk.
 */
export function loadVerifyBaseline(root: string, filePath?: string): VerifyBaseline | null {
  const baselinePath = resolveExistingBaselinePath(root, filePath);

  if (!baselinePath || !fs.existsSync(baselinePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(baselinePath, "utf-8");
    const baseline = stableSortBaseline(JSON.parse(content) as VerifyBaseline);

    if (baseline.version !== BASELINE_VERSION) {
      console.warn(
        `Baseline version mismatch: expected ${BASELINE_VERSION}, got ${baseline.version}`,
      );
    }

    return baseline;
  } catch (error) {
    console.error(`Failed to load baseline: ${error}`);
    return null;
  }
}

/**
 * Apply baseline to verify result.
 * Issues in baseline are downgraded to advisory severity.
 */
export function applyVerifyBaseline(
  result: VerifyRunResult,
  baseline: VerifyBaseline,
): BaselineApplyResult {
  const baselineFingerprints = new Set(baseline.entries.map((e) => e.fingerprint));
  const newIssues: VerifyIssue[] = [];
  const baselinedIssues: VerifyIssue[] = [];
  const matchedFingerprints = new Set<string>();

  for (const issue of result.issues) {
    const fingerprint = computeIssueFingerprint(issue);

    if (issue.severity === "blocking" && baselineFingerprints.has(fingerprint)) {
      matchedFingerprints.add(fingerprint);
      baselinedIssues.push({
        ...issue,
        severity: "advisory",
        details: mergeIssueDetails(issue.details, {
          matched_by: "baseline",
          baseline_fingerprint: fingerprint,
          baseline_created_at: baseline.createdAt,
          original_severity: issue.severity,
        }),
      });
    } else {
      newIssues.push(issue);
    }
  }

  const recomputed = createVerifyRunResult(
    result.root,
    [...newIssues, ...baselinedIssues],
    {
      sources: result.sources,
      generatedAt: result.generatedAt,
    },
  );

  return {
    totalIssues: result.issues.length,
    baselinedIssues: baselinedIssues.length,
    newIssues: newIssues.length,
    matchedFingerprints: [...matchedFingerprints].sort((left, right) => left.localeCompare(right)),
    result: {
      ...recomputed,
      metadata: {
        ...result.metadata,
        baselineApplied: true,
        baselineCreatedAt: baseline.createdAt,
        baselineMatchCount: baselinedIssues.length,
        baselineNewIssueCount: newIssues.filter((issue) => issue.severity === "blocking").length,
      },
    },
  };
}

export function buildVerifyBaseline(result: VerifyRunResult): VerifyBaseline {
  const timestamp = new Date().toISOString();
  return {
    version: BASELINE_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    repoRoot: result.root,
    sourceVerdict: result.verdict,
    entries: result.issues
      .filter((issue) => issue.severity === "blocking")
      .map((issue) => ({
        fingerprint: computeIssueFingerprint(issue),
        code: issue.code,
        path: issue.path,
        message: issue.message,
        severity: issue.severity,
      })),
  };
}

function resolveBaselinePath(root: string, filePath?: string): string {
  return path.isAbsolute(filePath ?? "") ? (filePath as string) : path.join(root, filePath ?? BASELINE_FILE);
}

function resolveExistingBaselinePath(root: string, filePath?: string): string | null {
  const requestedPath = resolveBaselinePath(root, filePath);
  if (fs.existsSync(requestedPath)) {
    return requestedPath;
  }

  if (!filePath) {
    const legacyPath = path.join(root, LEGACY_BASELINE_FILE);
    if (fs.existsSync(legacyPath)) {
      return legacyPath;
    }
  }

  return null;
}

function stableSortBaseline(baseline: VerifyBaseline): VerifyBaseline {
  return {
    ...baseline,
    entries: [...baseline.entries].sort((left, right) => {
      const codeCompare = left.code.localeCompare(right.code);
      if (codeCompare !== 0) {
        return codeCompare;
      }
      const pathCompare = (left.path ?? "").localeCompare(right.path ?? "");
      if (pathCompare !== 0) {
        return pathCompare;
      }
      return left.fingerprint.localeCompare(right.fingerprint);
    }),
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
