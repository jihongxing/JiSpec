import path from "node:path";
import type { ImplementRunResult } from "../implement/implement-runner";
import type { DebugPacket } from "./types";

export function buildDebugPacketFromImplementResult(result: ImplementRunResult, generatedAt = new Date().toISOString(), root?: string): DebugPacket {
  const stopPoint = result.decisionPacket?.stopPoint ?? inferStopPoint(result);
  const failingCheck = result.decisionPacket?.nextActionDetail.failedCheck ?? inferFailedCheck(result);
  const retryCommand = result.decisionPacket?.nextActionDetail.command
    ?? `npm run jispec-cli -- implement --session-id ${result.sessionId} --external-patch <path>`;
  const failedCommand = failingCheck === "verify"
    ? result.postVerify?.command
    : result.metadata.testCommand;

  return {
    schemaVersion: 1,
    kind: "jispec-agent-debug-packet",
    sessionId: result.sessionId,
    generatedAt,
    stopPoint,
    failedCommand,
    exitCode: inferExitCode(result),
    failingCheck,
    minimalReproductionCommand: failedCommand ?? retryCommand,
    observedEvidence: buildObservedEvidence(result),
    currentHypothesis: buildHypothesis(result, failingCheck),
    filesLikelyInvolved: result.patchMediation?.touchedPaths ?? result.handoffPacket?.nextSteps.filesNeedingAttention ?? [],
    repeatedFailureCount: 1,
    nextAllowedAction: result.decisionPacket?.nextAction ?? "Review the failed implementation attempt and submit a corrected patch.",
    retryCommand,
    truthSources: [
      ...(result.metadata.patchMediationPath ? [{ path: normalizeArtifactPath(result.metadata.patchMediationPath, root), provenance: "EXTRACTED" as const, note: "Patch mediation failure evidence." }] : []),
      ...(result.metadata.handoffPacketPath ? [{ path: normalizeArtifactPath(result.metadata.handoffPacketPath, root), provenance: "EXTRACTED" as const, note: "Implementation handoff evidence." }] : []),
    ],
  };
}

function normalizeArtifactPath(artifactPath: string, root?: string): string {
  if (!root) {
    return artifactPath.replace(/\\/g, "/");
  }
  return path.isAbsolute(artifactPath)
    ? path.relative(root, artifactPath).replace(/\\/g, "/")
    : artifactPath.replace(/\\/g, "/");
}

function inferStopPoint(result: ImplementRunResult): string {
  if (result.outcome === "patch_rejected_out_of_scope") {
    return "scope_check";
  }
  if (result.outcome === "verify_blocked") {
    return "post_verify";
  }
  return result.testsPassed === false ? "test" : "preflight";
}

function inferFailedCheck(result: ImplementRunResult): string {
  if (result.outcome === "patch_rejected_out_of_scope") {
    return "scope_check";
  }
  if (result.outcome === "verify_blocked") {
    return "verify";
  }
  return result.testsPassed === false ? "tests" : "unknown";
}

function inferExitCode(result: ImplementRunResult): number | null {
  if (result.outcome === "verify_blocked") {
    return result.postVerify?.exitCode ?? 1;
  }
  if (result.testsPassed === false) {
    return 1;
  }
  return null;
}

function buildObservedEvidence(result: ImplementRunResult): string[] {
  const evidence: string[] = [];
  if (result.patchMediation?.violations.length) {
    evidence.push(...result.patchMediation.violations);
  }
  if (result.patchMediation?.test?.errorMessage) {
    evidence.push(result.patchMediation.test.errorMessage);
  }
  if (result.postVerify?.verdict) {
    evidence.push(`post-verify verdict: ${result.postVerify.verdict}`);
  }
  return evidence.length > 0 ? evidence : ["No detailed failure output was recorded."];
}

function buildHypothesis(result: ImplementRunResult, failingCheck: string): string {
  if (failingCheck === "scope_check") {
    return "The patch touched paths outside the active change session scope.";
  }
  if (failingCheck === "tests") {
    return "The patch applied, but the mediated test command did not pass.";
  }
  if (failingCheck === "verify") {
    return "Tests passed, but deterministic verify reported blocking issues.";
  }
  return `Implementation outcome ${result.outcome} requires owner review.`;
}
