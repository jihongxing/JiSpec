export type VerifyVerdict = "PASS" | "FAIL_BLOCKING" | "WARN_ADVISORY" | "ERROR_NONBLOCKING";

export type VerifyIssueKind =
  | "schema"
  | "trace"
  | "semantic"
  | "missing_file"
  | "unsupported"
  | "runtime_error";

export type VerifyIssueSeverity = "blocking" | "advisory" | "nonblocking_error";

export interface VerifyIssue {
  kind: VerifyIssueKind;
  severity: VerifyIssueSeverity;
  code: string;
  path?: string;
  message: string;
  details?: unknown;
}

export interface VerifyRunResult {
  root: string;
  verdict: VerifyVerdict;
  ok: boolean;
  exitCode: number;
  issueCount: number;
  blockingIssueCount: number;
  advisoryIssueCount: number;
  nonBlockingErrorCount: number;
  issues: VerifyIssue[];
  sources: string[];
  generatedAt: string;
  metadata?: Record<string, unknown>;
}

interface CreateVerifyRunResultOptions {
  sources?: string[];
  generatedAt?: string;
}

const VERDICT_PRIORITY: Record<VerifyVerdict, number> = {
  FAIL_BLOCKING: 3,
  ERROR_NONBLOCKING: 2,
  WARN_ADVISORY: 1,
  PASS: 0,
};

const SEVERITY_PRIORITY: Record<VerifyIssueSeverity, number> = {
  blocking: 0,
  advisory: 1,
  nonblocking_error: 2,
};

const KIND_PRIORITY: Record<VerifyIssueKind, number> = {
  schema: 0,
  trace: 1,
  missing_file: 2,
  semantic: 3,
  unsupported: 4,
  runtime_error: 5,
};

export function createVerifyRunResult(
  root: string,
  issues: VerifyIssue[],
  options: CreateVerifyRunResultOptions = {},
): VerifyRunResult {
  const stableIssues = stableSortVerifyIssues(issues);
  const verdict = computeVerifyVerdict(stableIssues);

  return {
    root,
    verdict,
    ok: verdict !== "FAIL_BLOCKING",
    exitCode: computeVerifyExitCode(verdict),
    issueCount: stableIssues.length,
    blockingIssueCount: stableIssues.filter((issue) => issue.severity === "blocking").length,
    advisoryIssueCount: stableIssues.filter((issue) => issue.severity === "advisory").length,
    nonBlockingErrorCount: stableIssues.filter((issue) => issue.severity === "nonblocking_error").length,
    issues: stableIssues,
    sources: stableUnique(options.sources ?? []),
    generatedAt: options.generatedAt ?? new Date().toISOString(),
  };
}

export function computeVerifyVerdict(issues: VerifyIssue[]): VerifyVerdict {
  let currentVerdict: VerifyVerdict = "PASS";

  for (const issue of issues) {
    const candidateVerdict =
      issue.severity === "blocking"
        ? "FAIL_BLOCKING"
        : issue.severity === "nonblocking_error"
          ? "ERROR_NONBLOCKING"
          : "WARN_ADVISORY";

    if (VERDICT_PRIORITY[candidateVerdict] > VERDICT_PRIORITY[currentVerdict]) {
      currentVerdict = candidateVerdict;
    }
  }

  return currentVerdict;
}

export function computeVerifyExitCode(verdict: VerifyVerdict): number {
  return verdict === "FAIL_BLOCKING" ? 1 : 0;
}

export function stableSortVerifyIssues(issues: VerifyIssue[]): VerifyIssue[] {
  return [...issues].sort((left, right) => {
    return (
      compareNumber(SEVERITY_PRIORITY[left.severity], SEVERITY_PRIORITY[right.severity]) ||
      compareNumber(KIND_PRIORITY[left.kind], KIND_PRIORITY[right.kind]) ||
      compareString(left.code, right.code) ||
      compareString(left.path ?? "", right.path ?? "") ||
      compareString(left.message, right.message)
    );
  });
}

export function formatVerifyCountSummary(result: VerifyRunResult): string {
  return [
    `${result.issueCount} total`,
    `${result.blockingIssueCount} blocking`,
    `${result.advisoryIssueCount} advisory`,
    `${result.nonBlockingErrorCount} non-blocking errors`,
  ].join(" | ");
}

export function toVerifyJSONPayload(result: VerifyRunResult): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    root: result.root,
    verdict: result.verdict,
    ok: result.ok,
    exit_code: result.exitCode,
    issue_count: result.issueCount,
    blocking_issue_count: result.blockingIssueCount,
    advisory_issue_count: result.advisoryIssueCount,
    non_blocking_error_count: result.nonBlockingErrorCount,
    sources: [...result.sources],
    generated_at: result.generatedAt,
    issues: result.issues.map((issue) => toVerifyIssueJSON(issue)),
  };

  if (result.metadata !== undefined) {
    payload.metadata = sanitizeForJson(result.metadata);
  }

  return payload;
}

function toVerifyIssueJSON(issue: VerifyIssue): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    kind: issue.kind,
    severity: issue.severity,
    code: issue.code,
  };

  if (issue.path) {
    payload.path = issue.path;
  }

  payload.message = issue.message;

  if (issue.details !== undefined) {
    payload.details = sanitizeForJson(issue.details);
  }

  return payload;
}

function sanitizeForJson(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForJson(entry));
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareString(left, right))
      .map(([key, entry]) => [key, sanitizeForJson(entry)]);

    return Object.fromEntries(entries);
  }

  return value;
}

function stableUnique(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    unique.push(value);
  }

  return unique;
}

function compareNumber(left: number, right: number): number {
  return left - right;
}

function compareString(left: string, right: string): number {
  return left.localeCompare(right);
}
