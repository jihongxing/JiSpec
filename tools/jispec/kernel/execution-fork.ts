import fs from "node:fs";
import path from "node:path";
import { createKernelId, createKernelTimestamp, type KernelIdentity } from "./shared-models";
import type { KernelProvenanceBinding } from "./provenance";

export type ExecutionForkAxis = "session" | "implementation" | "verification";

export type ExecutionForkKind =
  | "direct_session"
  | "replay_restore"
  | "preflight_short_circuit"
  | "iterative_mediation"
  | "external_patch_mediation"
  | "verify_pass"
  | "verify_block";

export type ExecutionForkStatus = "selected" | "suppressed";

export interface ExecutionForkCandidate extends KernelIdentity {
  axis: ExecutionForkAxis;
  kind: ExecutionForkKind;
  status: ExecutionForkStatus;
  command: string;
  reason: string;
  artifactPath?: string;
  outcome?: string;
  stopPoint?: string;
}

export interface ExecutionForkTraceStep extends KernelIdentity {
  axis: ExecutionForkAxis;
  candidateId: string;
  kind: ExecutionForkKind;
  command: string;
  reason: string;
}

export interface ExecutionForkGovernanceRecord extends KernelIdentity {
  sessionId: string;
  changeId: string;
  provenanceBinding?: KernelProvenanceBinding;
  sessionSource: "active" | "archived";
  canonicalTraceId: string;
  canonicalTrace: ExecutionForkTraceStep[];
  canonicalTraceSummary: string;
  candidates: ExecutionForkCandidate[];
  replay?: {
    sourceHandoffPath: string;
    restoredSession: boolean;
    previousOutcome: string;
    previousStopPoint: string;
    previousFailedCheck: string;
  };
  summary: {
    replayUsed: boolean;
    externalPatchUsed: boolean;
    verificationUsed: boolean;
    selectedAxes: ExecutionForkAxis[];
    suppressedCount: number;
  };
}

export interface ExecutionForkGovernanceSummary {
  artifactPath: string;
  canonicalTraceId: string;
  canonicalTraceSummary: string;
  candidateCount: number;
  suppressedCandidateCount: number;
  selectedAxes: ExecutionForkAxis[];
  replayUsed: boolean;
  externalPatchUsed: boolean;
  verificationUsed: boolean;
}

export interface BuildExecutionForkGovernanceInput {
  sessionId: string;
  changeId: string;
  createdAt: string;
  sessionSource: "active" | "archived";
  provenanceBinding?: KernelProvenanceBinding;
  testCommand: string;
  implementationCommand: string;
  verifyCommand?: string;
  outcome: string;
  testsPassed: boolean;
  patchMediationPath?: string;
  externalPatchPath?: string;
  postVerify?: {
    command: string;
    ok: boolean;
    verdict: string;
  };
  replay?: {
    sourceHandoffPath: string;
    restoredSession: boolean;
    previousOutcome: string;
    previousStopPoint: string;
    previousFailedCheck: string;
  };
}

export interface WriteExecutionForkGovernanceOptions {
  root: string;
  record: ExecutionForkGovernanceRecord;
}

const EXECUTION_FORK_RELATIVE_DIR = ".jispec/implement";

export function buildExecutionForkGovernanceRecord(input: BuildExecutionForkGovernanceInput): ExecutionForkGovernanceRecord {
  const replayUsed = Boolean(input.replay?.restoredSession);
  const externalPatchUsed = Boolean(input.externalPatchPath);
  const verificationUsed = Boolean(input.postVerify);

  const sessionCandidate: ExecutionForkCandidate = buildCandidate({
    sessionId: input.sessionId,
    createdAt: input.createdAt,
    axis: "session",
    kind: replayUsed ? "replay_restore" : "direct_session",
    status: "selected",
    command: replayUsed
      ? `npm run jispec-cli -- implement --from-handoff ${input.replay?.sourceHandoffPath ?? `.jispec/handoff/${input.sessionId}.json`}`
      : `npm run jispec-cli -- implement --session-id ${input.sessionId}`,
    reason: replayUsed
      ? "A replayable handoff was supplied, so the active session was restored from the canonical replay source."
      : "No replayable handoff was supplied, so the active change session remained the canonical ingress.",
    artifactPath: input.replay?.sourceHandoffPath,
    outcome: input.replay?.previousOutcome,
    stopPoint: input.replay?.previousStopPoint,
  });

  const suppressedSessionCandidate: ExecutionForkCandidate = buildCandidate({
    sessionId: input.sessionId,
    createdAt: input.createdAt,
    axis: "session",
    kind: replayUsed ? "direct_session" : "replay_restore",
    status: "suppressed",
    command: replayUsed
      ? `npm run jispec-cli -- implement --session-id ${input.sessionId}`
      : `npm run jispec-cli -- implement --from-handoff .jispec/handoff/${input.sessionId}.json`,
    reason: replayUsed
      ? "Direct session execution was suppressed because replay restore took precedence."
      : "Replay restore was suppressed because no replayable handoff was available.",
  });

  const implementationCandidates: ExecutionForkCandidate[] = [
    buildCandidate({
      sessionId: input.sessionId,
      createdAt: input.createdAt,
      axis: "implementation",
      kind: "preflight_short_circuit",
      status: input.outcome === "preflight_passed" ? "selected" : "suppressed",
      command: input.implementationCommand,
      reason: input.outcome === "preflight_passed"
        ? "Preflight succeeded, so implementation mediation short-circuited before any patch work."
        : "Preflight did not short-circuit the run because the change needed additional mediation.",
      outcome: input.outcome,
    }),
    buildCandidate({
      sessionId: input.sessionId,
      createdAt: input.createdAt,
      axis: "implementation",
      kind: "iterative_mediation",
      status: input.outcome === "budget_exhausted" || input.outcome === "stall_detected" || input.outcome === "verify_blocked"
        ? "selected"
        : (!externalPatchUsed && input.outcome !== "preflight_passed" ? "selected" : "suppressed"),
      command: input.implementationCommand,
      reason: externalPatchUsed
        ? "Iterative mediation was suppressed because an external patch entered through the scoped patch path."
        : input.outcome === "preflight_passed"
          ? "Iterative mediation was suppressed because preflight already passed."
          : "Iterative mediation was the canonical non-patch path for this implementation run.",
      outcome: input.outcome,
    }),
    buildCandidate({
      sessionId: input.sessionId,
      createdAt: input.createdAt,
      axis: "implementation",
      kind: "external_patch_mediation",
      status: externalPatchUsed ? "selected" : "suppressed",
      command: input.externalPatchPath
        ? `${input.implementationCommand} --external-patch ${input.externalPatchPath}`
        : `${input.implementationCommand} --external-patch <path>`,
      reason: externalPatchUsed
        ? "An external patch supplied by the executor became the canonical implementation branch."
        : "No external patch was supplied, so the patch mediation branch was suppressed.",
      artifactPath: input.patchMediationPath,
      outcome: input.outcome,
    }),
  ];

  const verificationCandidates: ExecutionForkCandidate[] = [
    buildCandidate({
      sessionId: input.sessionId,
      createdAt: input.createdAt,
      axis: "verification",
      kind: "verify_pass",
      status: verificationUsed && input.postVerify?.ok === true ? "selected" : "suppressed",
      command: input.verifyCommand ?? defaultVerifyCommand(input.postVerify?.command),
      reason: input.postVerify?.ok === true
        ? "Post-implement verify passed and became part of the canonical execution trace."
        : "Pass-state verification was suppressed because verify was not successful or not available.",
      outcome: input.postVerify?.verdict,
      stopPoint: "post_verify",
    }),
    buildCandidate({
      sessionId: input.sessionId,
      createdAt: input.createdAt,
      axis: "verification",
      kind: "verify_block",
      status: verificationUsed && input.postVerify?.ok === false ? "selected" : "suppressed",
      command: input.verifyCommand ?? defaultVerifyCommand(input.postVerify?.command),
      reason: input.postVerify?.ok === false
        ? "Post-implement verify blocked the run, so the block branch became canonical."
        : "Blocking verify branch was suppressed because verify did not fail.",
      outcome: input.postVerify?.verdict,
      stopPoint: "post_verify",
    }),
  ];

  const candidates = [
    sessionCandidate,
    suppressedSessionCandidate,
    ...implementationCandidates,
    ...verificationCandidates,
  ];
  const canonicalTrace = candidates
    .filter((candidate) => candidate.status === "selected")
    .sort((left, right) => axisOrder(left.axis) - axisOrder(right.axis))
    .map((candidate) => ({
      id: createKernelId("execution-fork-step", `${input.sessionId}|${candidate.axis}|${candidate.kind}|${candidate.command}`),
      createdAt: input.createdAt,
      axis: candidate.axis,
      candidateId: candidate.id,
      kind: candidate.kind,
      command: candidate.command,
      reason: candidate.reason,
    }));
  const canonicalTraceId = createKernelId(
    "execution-fork",
    `${input.sessionId}|${canonicalTrace.map((step) => step.candidateId).join("|")}`,
  );
  const canonicalTraceSummary = canonicalTrace.map((step) => `${step.axis}:${step.kind}`).join(" -> ");
  const selectedAxes = canonicalTrace.map((step) => step.axis);

  return {
    id: createKernelId("execution-fork-governance", `${input.sessionId}|${canonicalTraceId}`),
    createdAt: input.createdAt,
    sessionId: input.sessionId,
    changeId: input.changeId,
    provenanceBinding: input.provenanceBinding,
    sessionSource: input.sessionSource,
    canonicalTraceId,
    canonicalTrace,
    canonicalTraceSummary,
    candidates,
    replay: input.replay,
    summary: {
      replayUsed,
      externalPatchUsed,
      verificationUsed,
      selectedAxes,
      suppressedCount: candidates.length - canonicalTrace.length,
    },
  };
}

export function writeExecutionForkGovernanceArtifact(root: string, record: ExecutionForkGovernanceRecord): string {
  const artifactDir = path.join(root, EXECUTION_FORK_RELATIVE_DIR, record.sessionId);
  fs.mkdirSync(artifactDir, { recursive: true });

  const artifactPath = path.join(artifactDir, "execution-fork.json");
  fs.writeFileSync(artifactPath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  fs.writeFileSync(path.join(artifactDir, "execution-fork.md"), renderExecutionForkGovernanceMarkdown(record), "utf-8");
  return artifactPath;
}

export function summarizeExecutionForkGovernanceRecord(
  record: ExecutionForkGovernanceRecord,
  artifactPath: string,
): ExecutionForkGovernanceSummary {
  return {
    artifactPath,
    canonicalTraceId: record.canonicalTraceId,
    canonicalTraceSummary: record.canonicalTraceSummary,
    candidateCount: record.candidates.length,
    suppressedCandidateCount: record.summary.suppressedCount,
    selectedAxes: [...record.summary.selectedAxes],
    replayUsed: record.summary.replayUsed,
    externalPatchUsed: record.summary.externalPatchUsed,
    verificationUsed: record.summary.verificationUsed,
  };
}

export function renderExecutionForkGovernanceMarkdown(record: ExecutionForkGovernanceRecord): string {
  const lines = [
    "# Execution Fork Governance",
    "",
    `Session: ${record.sessionId}`,
    `Change ID: ${record.changeId}`,
    `Canonical trace: ${record.canonicalTraceId}`,
    `Canonical summary: ${record.canonicalTraceSummary}`,
    `Replay used: ${record.summary.replayUsed}`,
    `External patch used: ${record.summary.externalPatchUsed}`,
    `Verification used: ${record.summary.verificationUsed}`,
    `Suppressed candidates: ${record.summary.suppressedCount}`,
    "",
    "## Canonical Trace",
    ...record.canonicalTrace.map((step) => `- ${step.axis}: ${step.kind} (${step.command})`),
    "",
    "## Candidates",
    ...record.candidates.map((candidate) => `- ${candidate.axis}: ${candidate.kind} [${candidate.status}] - ${candidate.reason}`),
    "",
    "This Markdown file is a human-readable companion summary, not a machine API.",
    "",
  ];
  return lines.join("\n");
}

function buildCandidate(input: {
  sessionId: string;
  createdAt: string;
  axis: ExecutionForkAxis;
  kind: ExecutionForkKind;
  status: ExecutionForkStatus;
  command: string;
  reason: string;
  artifactPath?: string;
  outcome?: string;
  stopPoint?: string;
}): ExecutionForkCandidate {
  return {
    id: createKernelId("execution-fork-candidate", `${input.sessionId}|${input.axis}|${input.kind}|${input.command}`),
    createdAt: input.createdAt,
    axis: input.axis,
    kind: input.kind,
    status: input.status,
    command: input.command,
    reason: input.reason,
    artifactPath: input.artifactPath,
    outcome: input.outcome,
    stopPoint: input.stopPoint,
  };
}

function defaultVerifyCommand(command?: string): string {
  return command ?? "npm run verify";
}

function axisOrder(axis: ExecutionForkAxis): number {
  return axis === "session" ? 0 : axis === "implementation" ? 1 : 2;
}
