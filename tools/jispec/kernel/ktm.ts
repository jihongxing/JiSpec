import fs from "node:fs";
import path from "node:path";
import {
  createKernelArtifactRef,
  createKernelId,
  serializeKernelRecord,
  type KernelArtifactRef,
  type KernelDecision,
  type KernelIdentity,
  type KernelLifecycleStatus,
  type KernelProvenanceLink,
  type KernelState,
  type KernelTransitionResult,
} from "./shared-models";
import type { KernelProvenanceBinding } from "./provenance";
import type {
  ExecutionForkGovernanceRecord,
  ExecutionForkGovernanceSummary,
} from "./execution-fork";

export type KtmRuntimeDecision = KernelDecision;

export interface KtmRuntimeArtifactPaths {
  artifactDir: string;
  kernelLogPath: string;
  stateSnapshotPath: string;
  runtimeSummaryPath: string;
  auditLedgerPath: string;
}

export interface KtmExecutionForkSnapshot {
  canonicalTraceId: string;
  canonicalTraceSummary: string;
  selectedAxes: string[];
}

export interface KtmRuntimeTransitionInput {
  sessionId: string;
  changeId: string;
  createdAt: string;
  sessionSource: "active" | "archived";
  changeSummary: string;
  lane: "fast" | "strict";
  outcome: string;
  testsPassed: boolean;
  decisionState: string;
  decisionStopPoint: string;
  decisionSummary: string;
  decisionOwner: string;
  decisionNextAction: string;
  provenanceBinding?: KernelProvenanceBinding;
  executionFork?: ExecutionForkGovernanceRecord | ExecutionForkGovernanceSummary;
  facts: Record<string, unknown>;
  policy: Record<string, unknown>;
  replay?: {
    sourceHandoffPath: string;
    restoredSession: boolean;
    previousOutcome: string;
    previousStopPoint: string;
    previousFailedCheck: string;
  };
  postVerify?: {
    command: string;
    ok: boolean;
    verdict: string;
  };
}

export interface KtmRuntimeRecord extends KernelIdentity {
  sessionId: string;
  changeId: string;
  sessionSource: "active" | "archived";
  provenanceBinding?: KernelProvenanceBinding;
  transition: KernelTransitionResult<KernelState<Record<string, unknown>>, KernelArtifactRef>;
  facts: Record<string, unknown>;
  policy: Record<string, unknown>;
  artifactPaths: KtmRuntimeArtifactPaths;
  executionFork?: KtmExecutionForkSnapshot;
  replay?: KtmRuntimeTransitionInput["replay"];
  committedAt: string;
  inputFingerprint: string;
  outputFingerprint: string;
  summary: string;
}

export interface KtmRuntimeSummary {
  artifactDir: string;
  kernelLogPath: string;
  stateSnapshotPath: string;
  runtimeSummaryPath: string;
  auditLedgerPath: string;
  transitionId: string;
  decision: KernelDecision;
  fromStatus: KernelLifecycleStatus;
  toStatus: KernelLifecycleStatus;
  committed: boolean;
  inputFingerprint: string;
  outputFingerprint: string;
}

const KTM_RELATIVE_DIR = ".jispec/kernel-runtime";
const AUDIT_LEDGER_RELATIVE_PATH = ".spec/audit/events.jsonl";

export function buildKtmRuntimeRecord(input: KtmRuntimeTransitionInput): KtmRuntimeRecord {
  const decision = resolveDecision(input);
  const committedAt = input.createdAt;
  const artifactPaths = buildArtifactPaths(input.sessionId);
  const inputFingerprint = createKernelId(
    "ktm-input",
    serializeKernelRecord({
      changeId: input.changeId,
      changeSummary: input.changeSummary,
      decisionOwner: input.decisionOwner,
      decisionNextAction: input.decisionNextAction,
      decisionState: input.decisionState,
      decisionStopPoint: input.decisionStopPoint,
      decisionSummary: input.decisionSummary,
      facts: input.facts,
      lane: input.lane,
      outcome: input.outcome,
      policy: input.policy,
      postVerify: input.postVerify ?? null,
      provenanceBinding: input.provenanceBinding?.id,
      replay: input.replay ?? null,
      sessionId: input.sessionId,
      sessionSource: input.sessionSource,
      testsPassed: input.testsPassed,
    executionFork: normalizeExecutionFork(input.executionFork),
    }),
  );
  const transitionId = createKernelId("ktm-transition", `${input.sessionId}|${input.changeId}|${inputFingerprint}`);
  const fromState: KernelState<Record<string, unknown>> = {
    id: createKernelId("ktm-state", `${input.sessionId}|from|${inputFingerprint}`),
    createdAt: input.createdAt,
    kind: "change_runtime",
    status: "observed",
    payload: {
      stage: "before_transition",
      sessionId: input.sessionId,
      changeId: input.changeId,
      sessionSource: input.sessionSource,
      changeSummary: input.changeSummary,
      lane: input.lane,
    },
    lineage: buildRuntimeLineage(input.sessionId, input.changeId, transitionId, input.createdAt, "source"),
  };
  const toStatus = deriveTargetStatus(decision);
  const toState: KernelState<Record<string, unknown>> = {
    id: createKernelId("ktm-state", `${input.sessionId}|to|${inputFingerprint}`),
    createdAt: input.createdAt,
    kind: "change_runtime",
    status: toStatus,
    payload: {
      stage: "after_transition",
      sessionId: input.sessionId,
      changeId: input.changeId,
      sessionSource: input.sessionSource,
      changeSummary: input.changeSummary,
      lane: input.lane,
      outcome: input.outcome,
      testsPassed: input.testsPassed,
      decisionState: input.decisionState,
      decisionStopPoint: input.decisionStopPoint,
      decisionSummary: input.decisionSummary,
      decisionOwner: input.decisionOwner,
      decisionNextAction: input.decisionNextAction,
      executionFork: normalizeExecutionFork(input.executionFork) ?? undefined,
      replay: input.replay,
      postVerify: input.postVerify,
    },
    lineage: buildRuntimeLineage(input.sessionId, input.changeId, transitionId, input.createdAt, "target"),
  };
  const outputs: KernelArtifactRef[] = [
    createKernelArtifactRef("kernel-log", artifactPaths.kernelLogPath),
    createKernelArtifactRef("state-snapshot", artifactPaths.stateSnapshotPath),
    createKernelArtifactRef("runtime-summary", artifactPaths.runtimeSummaryPath),
    createKernelArtifactRef("audit-ledger", artifactPaths.auditLedgerPath),
  ];
  const transition: KernelTransitionResult<KernelState<Record<string, unknown>>, KernelArtifactRef> = {
    id: transitionId,
    createdAt: input.createdAt,
    changeId: input.changeId,
    fromState,
    toState,
    decision,
    outputs,
    provenance: buildRuntimeLineage(input.sessionId, input.changeId, transitionId, input.createdAt, "transition"),
    committed: decision === "approve",
  };
  const outputFingerprint = createKernelId(
    "ktm-output",
    serializeKernelRecord({
      transitionId,
      committed: transition.committed,
      toState: transition.toState,
      outputs: transition.outputs.map((output) => ({ kind: output.kind, path: output.path })),
    }),
  );

  return {
    id: createKernelId("ktm-runtime", `${input.sessionId}|${transitionId}|${inputFingerprint}`),
    createdAt: input.createdAt,
    sessionId: input.sessionId,
    changeId: input.changeId,
    sessionSource: input.sessionSource,
    provenanceBinding: input.provenanceBinding,
    transition,
    facts: input.facts,
    policy: input.policy,
    artifactPaths,
    executionFork: normalizeExecutionFork(input.executionFork) ?? undefined,
    replay: input.replay,
    committedAt,
    inputFingerprint,
    outputFingerprint,
    summary: `${decision.toUpperCase()} ${input.decisionState} from ${fromState.status} to ${toState.status}`,
  };
}

export function summarizeKtmRuntimeRecord(record: KtmRuntimeRecord): KtmRuntimeSummary {
  return {
    artifactDir: record.artifactPaths.artifactDir,
    kernelLogPath: record.artifactPaths.kernelLogPath,
    stateSnapshotPath: record.artifactPaths.stateSnapshotPath,
    runtimeSummaryPath: record.artifactPaths.runtimeSummaryPath,
    auditLedgerPath: record.artifactPaths.auditLedgerPath,
    transitionId: record.transition.id,
    decision: record.transition.decision,
    fromStatus: record.transition.fromState.status,
    toStatus: record.transition.toState.status,
    committed: record.transition.committed,
    inputFingerprint: record.inputFingerprint,
    outputFingerprint: record.outputFingerprint,
  };
}

export function writeKtmRuntimeArtifact(root: string, record: KtmRuntimeRecord): string {
  assertPublishableKtmRuntimeRecord(record);
  const runtimeDir = path.join(root, record.artifactPaths.artifactDir);
  const stagingDir = path.join(path.dirname(runtimeDir), `.staging-${record.id}`);
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  try {
    const kernelLogPath = path.join(stagingDir, "kernel-log.json");
    const stateSnapshotPath = path.join(stagingDir, "state-snapshot.json");
    const runtimeSummaryPath = path.join(stagingDir, "kernel-runtime.md");

    fs.writeFileSync(kernelLogPath, `${serializeKernelRecord(record)}\n`, "utf-8");
    fs.writeFileSync(stateSnapshotPath, `${serializeKernelRecord(record.transition.toState)}\n`, "utf-8");
    fs.writeFileSync(runtimeSummaryPath, renderKtmRuntimeMarkdown(record), "utf-8");

    fs.rmSync(runtimeDir, { recursive: true, force: true });
    fs.renameSync(stagingDir, runtimeDir);
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }

  return path.join(runtimeDir, "kernel-log.json");
}

export function renderKtmRuntimeMarkdown(record: KtmRuntimeRecord): string {
  const lines = [
    "# KTM Runtime",
    "",
    `Session: ${record.sessionId}`,
    `Change ID: ${record.changeId}`,
    `Decision: ${record.transition.decision}`,
    `From status: ${record.transition.fromState.status}`,
    `To status: ${record.transition.toState.status}`,
    `Committed: ${record.transition.committed}`,
    `Summary: ${record.summary}`,
    `Input fingerprint: ${record.inputFingerprint}`,
    `Output fingerprint: ${record.outputFingerprint}`,
    "",
    "## Artifacts",
    `- Kernel log: ${record.artifactPaths.kernelLogPath}`,
    `- State snapshot: ${record.artifactPaths.stateSnapshotPath}`,
    `- Runtime summary: ${record.artifactPaths.runtimeSummaryPath}`,
    `- Audit ledger: ${record.artifactPaths.auditLedgerPath}`,
    "",
    "## Facts",
    ...renderKeyValueLines(record.facts),
    "",
    "## Policy",
    ...renderKeyValueLines(record.policy),
    "",
    "This Markdown file is a human-readable companion summary, not a machine API.",
    "",
  ];

  return lines.join("\n");
}

function resolveDecision(input: KtmRuntimeTransitionInput): KernelDecision {
  if (input.decisionState === "ready_to_merge" || input.outcome === "patch_verified" || input.outcome === "preflight_passed") {
    return "approve";
  }

  if (input.decisionState === "needs_patch_rescope") {
    return "reject";
  }

  return "defer";
}

function deriveTargetStatus(decision: KernelDecision): KernelLifecycleStatus {
  if (decision === "approve") {
    return "committed";
  }

  if (decision === "reject") {
    return "rolled_back";
  }

  if (decision === "replay") {
    return "resolved";
  }

  return "normalized";
}

function buildArtifactPaths(sessionId: string): KtmRuntimeArtifactPaths {
  return {
    artifactDir: path.join(KTM_RELATIVE_DIR, sessionId),
    kernelLogPath: path.join(KTM_RELATIVE_DIR, sessionId, "kernel-log.json"),
    stateSnapshotPath: path.join(KTM_RELATIVE_DIR, sessionId, "state-snapshot.json"),
    runtimeSummaryPath: path.join(KTM_RELATIVE_DIR, sessionId, "kernel-runtime.md"),
    auditLedgerPath: AUDIT_LEDGER_RELATIVE_PATH,
  };
}

function buildRuntimeLineage(
  sessionId: string,
  changeId: string,
  transitionId: string,
  createdAt: string,
  role: "source" | "target" | "transition",
): KernelProvenanceLink[] {
  const sourceId = role === "source" ? changeId : transitionId;
  const targetId = role === "source" ? transitionId : role === "target" ? `${transitionId}:state` : transitionId;
  const relationship = role === "transition" ? "derived_from" : "resolved_into";
  return [
    {
      id: createKernelId("ktm-lineage", `${sessionId}|${changeId}|${transitionId}|${role}`),
      createdAt,
      sourceId,
      sourceKind: role === "source" ? "change" : "ktm_transition",
      targetId,
      targetKind: role === "target" ? "ktm_state" : "ktm_transition",
      relationship,
      confidence: 1,
      reason: "Deterministic KTM transition lineage",
    },
  ];
}

function normalizeExecutionFork(
  executionFork?: ExecutionForkGovernanceRecord | ExecutionForkGovernanceSummary,
): KtmExecutionForkSnapshot | null {
  if (!executionFork) {
    return null;
  }

  if ("selectedAxes" in executionFork) {
    return {
      canonicalTraceId: executionFork.canonicalTraceId,
      canonicalTraceSummary: executionFork.canonicalTraceSummary,
      selectedAxes: [...executionFork.selectedAxes],
    };
  }

  return {
    canonicalTraceId: executionFork.canonicalTraceId,
    canonicalTraceSummary: executionFork.canonicalTraceSummary,
    selectedAxes: [...executionFork.summary.selectedAxes],
  };
}

function assertPublishableKtmRuntimeRecord(record: KtmRuntimeRecord): void {
  const expectedOutputs = new Map<string, string>([
    ["kernel-log", record.artifactPaths.kernelLogPath],
    ["state-snapshot", record.artifactPaths.stateSnapshotPath],
    ["runtime-summary", record.artifactPaths.runtimeSummaryPath],
    ["audit-ledger", record.artifactPaths.auditLedgerPath],
  ]);
  const normalizedOutputs = new Map(
    record.transition.outputs.map((output) => [output.kind, normalizeArtifactPath(output.path)]),
  );
  const issues: string[] = [];

  if (record.transition.outputs.length !== expectedOutputs.size) {
    issues.push(
      `expected ${expectedOutputs.size} runtime outputs, received ${record.transition.outputs.length}`,
    );
  }

  for (const [kind, expectedPath] of expectedOutputs) {
    const actualPath = normalizedOutputs.get(kind);
    if (!actualPath) {
      issues.push(`missing runtime output: ${kind}`);
      continue;
    }

    if (actualPath !== normalizeArtifactPath(expectedPath)) {
      issues.push(`runtime output path mismatch for ${kind}: expected ${expectedPath}, received ${actualPath}`);
    }
  }

  for (const output of record.transition.outputs) {
    if (!expectedOutputs.has(output.kind)) {
      issues.push(`unexpected runtime output kind: ${output.kind}`);
    }
  }

  if (issues.length > 0) {
    throw new Error(`Cannot publish KTM runtime record: ${issues.join("; ")}`);
  }
}

function normalizeArtifactPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function renderKeyValueLines(value: Record<string, unknown>): string[] {
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return ["- none"];
  }

  return entries.map(([key, entry]) => `- ${key}: ${formatValue(entry)}`);
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => formatValue(entry)).join(", ");
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}
