import fs from "node:fs";
import path from "node:path";
import type { VerifyGateCoverageReport } from "./gate-coverage";

export type VerifyGateGapStatus = "unresolved" | "resolved";
export type VerifyGateGapPosture = "blocking" | "attention" | "informational";

export interface VerifyGateGapLedgerEntry {
  id: string;
  source: "artifact_freshness" | "policy_stable_fact_guard" | "verify_issue_next_action";
  posture: VerifyGateGapPosture;
  status: VerifyGateGapStatus;
  owner: string;
  sourceArtifact: string;
  reason: string;
  nextCommand: string;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt?: string;
  occurrenceCount: number;
}

export interface VerifyGateGapLedger {
  version: 1;
  phase: "north-star-score-optimization-phase-7";
  generatedAt: string;
  sourceCoveragePhase?: string;
  summary: {
    total: number;
    unresolved: number;
    resolved: number;
    new: number;
    persistent: number;
    blocking: number;
    attention: number;
    informational: number;
  };
  topNextCommand: string;
  entries: VerifyGateGapLedgerEntry[];
}

export const VERIFY_GATE_GAP_LEDGER_RELATIVE_PATH = ".spec/gates/gap-ledger.json";

export function updateVerifyGateGapLedger(
  rootInput: string,
  coverage: VerifyGateCoverageReport,
  generatedAt: string,
): VerifyGateGapLedger {
  const root = path.resolve(rootInput);
  const previousLedger = readVerifyGateGapLedger(root);
  const previousById = new Map((previousLedger?.entries ?? []).map((entry) => [entry.id, entry]));
  const currentGaps = buildCurrentGapEntries(coverage, generatedAt);
  const currentIds = new Set(currentGaps.map((entry) => entry.id));
  const merged = currentGaps.map((entry) => mergeCurrentGap(entry, previousById.get(entry.id), generatedAt));

  for (const previous of previousLedger?.entries ?? []) {
    if (currentIds.has(previous.id)) {
      continue;
    }
    merged.push({
      ...previous,
      status: "resolved",
      lastSeenAt: previous.lastSeenAt,
      resolvedAt: previous.resolvedAt ?? generatedAt,
    });
  }

  const ledger = buildLedger({
    generatedAt,
    sourceCoveragePhase: coverage.phase,
    entries: merged.sort((left, right) => compareLedgerEntries(left, right)),
  });
  writeVerifyGateGapLedger(root, ledger);
  return ledger;
}

export function readVerifyGateGapLedger(rootInput: string): VerifyGateGapLedger | undefined {
  const ledgerPath = path.join(path.resolve(rootInput), VERIFY_GATE_GAP_LEDGER_RELATIVE_PATH);
  if (!fs.existsSync(ledgerPath)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(ledgerPath, "utf-8"));
    return isLedger(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function summarizeVerifyGateGapLedger(ledger: VerifyGateGapLedger): Record<string, unknown> {
  const unresolvedEntries = ledger.entries.filter((entry) => entry.status === "unresolved");
  return {
    phase: ledger.phase,
    path: VERIFY_GATE_GAP_LEDGER_RELATIVE_PATH,
    total: ledger.summary.total,
    unresolved: ledger.summary.unresolved,
    resolved: ledger.summary.resolved,
    new: ledger.summary.new,
    persistent: ledger.summary.persistent,
    blocking: ledger.summary.blocking,
    attention: ledger.summary.attention,
    informational: ledger.summary.informational,
    topNextCommand: ledger.topNextCommand,
    unresolvedEntryIds: unresolvedEntries.map((entry) => entry.id),
  };
}

function buildCurrentGapEntries(
  coverage: VerifyGateCoverageReport,
  generatedAt: string,
): VerifyGateGapLedgerEntry[] {
  const artifactGaps = coverage.artifactFreshness
    .filter((entry) => entry.status !== "fresh" && entry.status !== "not_applicable")
    .map((entry): VerifyGateGapLedgerEntry => ({
      id: `artifact:${entry.id}`,
      source: "artifact_freshness",
      posture: entry.status === "invalid" ? "blocking" : entry.status === "stale" ? "attention" : "informational",
      status: "unresolved",
      owner: "artifact owner",
      sourceArtifact: entry.path,
      reason: entry.reason,
      nextCommand: entry.nextCommand,
      firstSeenAt: generatedAt,
      lastSeenAt: generatedAt,
      occurrenceCount: 1,
    }));
  const policy = coverage.policyStableFactGuard;
  const policyGaps = policy.status === "ok"
    ? []
    : [{
        id: "policy:stable-fact-guard",
        source: "policy_stable_fact_guard" as const,
        posture: policy.status === "blocked" ? "blocking" as const : "informational" as const,
        status: "unresolved" as const,
        owner: "policy owner",
        sourceArtifact: policy.policyPath,
        reason: `Policy stable-fact guard is ${policy.status}: ${policy.unstableBlockingRuleCount} unstable blocking rule(s), ${policy.unknownFactCount} unknown fact(s).`,
        nextCommand: policy.nextCommand,
        firstSeenAt: generatedAt,
        lastSeenAt: generatedAt,
        occurrenceCount: 1,
      }];
  const issueGaps = coverage.issueNextActions.map((entry): VerifyGateGapLedgerEntry => ({
    id: `issue:${entry.code}:${entry.path ?? "repo"}`,
    source: "verify_issue_next_action",
    posture: entry.severity === "blocking" ? "blocking" : entry.severity === "advisory" ? "attention" : "informational",
    status: "unresolved",
    owner: entry.owner,
    sourceArtifact: entry.sourceArtifact,
    reason: entry.rationale,
    nextCommand: entry.nextCommand,
    firstSeenAt: generatedAt,
    lastSeenAt: generatedAt,
    occurrenceCount: 1,
  }));

  return [...artifactGaps, ...policyGaps, ...issueGaps];
}

function mergeCurrentGap(
  current: VerifyGateGapLedgerEntry,
  previous: VerifyGateGapLedgerEntry | undefined,
  generatedAt: string,
): VerifyGateGapLedgerEntry {
  if (!previous) {
    return current;
  }

  return {
    ...current,
    firstSeenAt: previous.firstSeenAt,
    lastSeenAt: generatedAt,
    occurrenceCount: previous.occurrenceCount + 1,
    resolvedAt: undefined,
  };
}

function buildLedger(input: {
  generatedAt: string;
  sourceCoveragePhase?: string;
  entries: VerifyGateGapLedgerEntry[];
}): VerifyGateGapLedger {
  const unresolved = input.entries.filter((entry) => entry.status === "unresolved");
  const resolved = input.entries.filter((entry) => entry.status === "resolved");
  const newEntries = unresolved.filter((entry) => entry.firstSeenAt === input.generatedAt);
  const persistent = unresolved.filter((entry) => entry.firstSeenAt !== input.generatedAt);

  return {
    version: 1,
    phase: "north-star-score-optimization-phase-7",
    generatedAt: input.generatedAt,
    sourceCoveragePhase: input.sourceCoveragePhase,
    summary: {
      total: input.entries.length,
      unresolved: unresolved.length,
      resolved: resolved.length,
      new: newEntries.length,
      persistent: persistent.length,
      blocking: unresolved.filter((entry) => entry.posture === "blocking").length,
      attention: unresolved.filter((entry) => entry.posture === "attention").length,
      informational: unresolved.filter((entry) => entry.posture === "informational").length,
    },
    topNextCommand: selectTopNextCommand(unresolved),
    entries: input.entries,
  };
}

function writeVerifyGateGapLedger(root: string, ledger: VerifyGateGapLedger): void {
  const ledgerPath = path.join(root, VERIFY_GATE_GAP_LEDGER_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf-8");
}

function selectTopNextCommand(entries: VerifyGateGapLedgerEntry[]): string {
  return entries
    .slice()
    .sort((left, right) => postureRank(left.posture) - postureRank(right.posture) || left.id.localeCompare(right.id))[0]
    ?.nextCommand ?? "npm run jispec-cli -- verify";
}

function compareLedgerEntries(left: VerifyGateGapLedgerEntry, right: VerifyGateGapLedgerEntry): number {
  if (left.status !== right.status) {
    return left.status === "unresolved" ? -1 : 1;
  }
  return postureRank(left.posture) - postureRank(right.posture) || left.id.localeCompare(right.id);
}

function postureRank(posture: VerifyGateGapPosture): number {
  if (posture === "blocking") {
    return 0;
  }
  if (posture === "attention") {
    return 1;
  }
  return 2;
}

function isLedger(value: unknown): value is VerifyGateGapLedger {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { version?: unknown }).version === 1 &&
    Array.isArray((value as { entries?: unknown }).entries)
  );
}
