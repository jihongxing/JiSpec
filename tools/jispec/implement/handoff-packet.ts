/**
 * Handoff packet for implementation mediation.
 * Creates an actionable summary for external implementer takeover.
 */

import path from "node:path";
import fs from "node:fs";
import { loadBootstrapTakeoverReport } from "../bootstrap/takeover";
import type { ChangeSession } from "../change/change-session";
import type { ImplementRunResult } from "./implement-runner";
import type { EpisodeMemory } from "./episode-memory";
import { getRecentHypotheses, getRejectedPaths, getEpisodesByOutcome } from "./episode-memory";

export interface ImplementContractContext {
  lane: "fast" | "strict";
  changedPaths: string[];
  changedPathKinds: string[];
  bootstrapTakeoverPresent: boolean;
  adoptedContractPaths: string[];
  deferredSpecDebtPaths: string[];
}

export type ImplementationDecisionStopPoint =
  | "preflight"
  | "scope_check"
  | "patch_apply"
  | "test"
  | "post_verify"
  | "budget"
  | "stall";

export type ImplementationMediationOutcome =
  | "preflight_passed"
  | "external_patch_received"
  | "patch_verified"
  | "patch_rejected_out_of_scope"
  | "budget_exhausted"
  | "stall_detected"
  | "verify_blocked";

export type ImplementationCheckStatus = "passed" | "failed" | "not_run" | "not_applicable";

export type ImplementationNextActionOwner =
  | "reviewer"
  | "verify_gate"
  | "human_or_external_tool"
  | "external_patch_author";

export type ImplementationFailedCheck =
  | "none"
  | "scope_check"
  | "patch_apply"
  | "tests"
  | "verify"
  | "budget"
  | "stall";

export type ImplementationNextActionType =
  | "submit_external_patch"
  | "resubmit_external_patch"
  | "fix_patch_scope"
  | "fix_patch_tests"
  | "fix_verify_blockers"
  | "review_and_merge"
  | "run_verify"
  | "adjust_approach";

export interface ImplementationDecisionPacket {
  state:
    | "ready_for_verify"
    | "ready_to_merge"
    | "needs_external_patch"
    | "needs_patch_rescope"
    | "needs_patch_rework"
    | "blocked_by_verify";
  stopPoint: ImplementationDecisionStopPoint;
  mergeable: boolean;
  summary: string;
  nextAction: string;
  nextActionDetail: {
    type: ImplementationNextActionType;
    owner: ImplementationNextActionOwner;
    failedCheck: ImplementationFailedCheck;
    command?: string;
    externalToolHandoff?: {
      required: boolean;
      request: string;
      allowedPaths: string[];
      filesNeedingAttention: string[];
      testCommand: string;
      verifyCommand: string;
    };
  };
  executionStatus: {
    stoppedAt: ImplementationDecisionStopPoint;
    scopeCheck: ImplementationCheckStatus;
    patchApply: ImplementationCheckStatus;
    tests: ImplementationCheckStatus;
    verify: ImplementationCheckStatus;
    nextActionOwner: ImplementationNextActionOwner;
  };
  implementationBoundary: {
    jispecRole: "mediation_and_verification";
    businessCodeGeneratedByJiSpec: false;
    implementationOwner: "existing_workspace" | "external_patch_author" | "human_or_external_tool";
    note: string;
  };
  scope: {
    status: "not_applicable" | "accepted" | "rejected_out_of_scope" | "apply_failed";
    touchedPaths: string[];
    allowedPaths: string[];
    violations: string[];
  };
  test: {
    command: string;
    passed: boolean;
    status: "passed" | "failed" | "not_run";
  };
  verify: {
    command?: string;
    verdict?: string;
    ok?: boolean;
    status: "passed" | "blocking" | "not_run";
  };
  suggestedActions: string[];
}

export interface HandoffPacket {
  sessionId: string;
  changeIntent: string;
  outcome: ImplementationMediationOutcome;
  iterations: number;
  tokensUsed: number;
  costUSD: number;
  contractContext: ImplementContractContext;
  decisionPacket: ImplementationDecisionPacket;

  summary: {
    whatWorked: string[];
    whatFailed: string[];
    lastError: string;
    stallReason?: string;
  };

  nextSteps: {
    suggestedActions: string[];
    filesNeedingAttention: string[];
    externalToolHandoff?: NonNullable<ImplementationDecisionPacket["nextActionDetail"]["externalToolHandoff"]>;
    testCommand: string;
    verifyCommand: string;
    verifyRecommendation: string;
  };

  episodeMemory: {
    attemptedHypotheses: string[];
    rejectedPaths: string[];
  };

  replay: {
    version: 1;
    replayable: boolean;
    source: "handoff_packet";
    sourceSession: ChangeSession;
    previousAttempt: {
      outcome: ImplementationMediationOutcome;
      stopPoint: ImplementationDecisionStopPoint;
      failedCheck: ImplementationFailedCheck;
      summary: string;
      lastError: string;
      patchMediationPath?: string;
      externalPatchPath?: string;
      postVerifyVerdict?: string;
      postVerifyCommand?: string;
    };
    inputs: {
      testCommand: string;
      verifyCommand: string;
      lane: "fast" | "strict";
      changedPaths: string[];
      allowedPatchPaths: string[];
    };
    commands: {
      restore: string;
      retryWithExternalPatch: string;
      rerunVerify: string;
    };
  };

  metadata: {
    createdAt: string;
    startedAt: string;
    completedAt: string;
  };
}

export interface ResolvedHandoffPacket {
  packet: HandoffPacket;
  path: string;
}

const HANDOFF_RELATIVE_DIR = ".jispec/handoff";

/**
 * Generate handoff packet from implement result.
 */
export function generateHandoffPacket(
  root: string,
  session: ChangeSession,
  result: ImplementRunResult,
  episodeMemory: EpisodeMemory,
  lastError: string,
): HandoffPacket {
  const successEpisodes = getEpisodesByOutcome(episodeMemory, "success");
  const failureEpisodes = getEpisodesByOutcome(episodeMemory, "failure");

  const whatWorked = buildWhatWorked(successEpisodes);
  const whatFailed = buildWhatFailed(failureEpisodes);
  const suggestedActions = buildSuggestedActions(result, episodeMemory, session);
  const filesNeedingAttention = buildFilesNeedingAttention(episodeMemory, session);
  const contractContext = buildContractContext(root, session, result);
  const decisionPacket = buildImplementationDecisionPacket(result, session);
  const verifyCommand = buildVerifyCommandForLane(result.lane);
  const verifyRecommendation =
    result.lane === "fast"
      ? "Run the local fast-lane verify precheck next. It may still auto-promote to strict if the diff now hits contract-critical files."
      : "Run the full verify gate next so contract, bootstrap, and policy checks are all re-evaluated together.";

  return {
    sessionId: result.sessionId,
    changeIntent: session.summary,
    outcome: result.outcome,
    iterations: result.iterations,
    tokensUsed: result.tokensUsed,
    costUSD: result.costUSD,
    contractContext,
    decisionPacket,

    summary: {
      whatWorked,
      whatFailed,
      lastError,
      stallReason: result.metadata.stallReason,
    },

    nextSteps: {
      suggestedActions: [
        ...suggestedActions,
        `Run verify next: ${verifyCommand}`,
      ],
      filesNeedingAttention,
      externalToolHandoff: decisionPacket.nextActionDetail.externalToolHandoff,
      testCommand: result.metadata.testCommand,
      verifyCommand,
      verifyRecommendation,
    },

    episodeMemory: {
      attemptedHypotheses: getRecentHypotheses(episodeMemory, 10),
      rejectedPaths: getRejectedPaths(episodeMemory),
    },

    replay: buildReplayState(session, result, decisionPacket, lastError, verifyCommand),

    metadata: {
      createdAt: new Date().toISOString(),
      startedAt: result.metadata.startedAt,
      completedAt: result.metadata.completedAt,
    },
  };
}

function buildReplayState(
  session: ChangeSession,
  result: ImplementRunResult,
  decisionPacket: ImplementationDecisionPacket,
  lastError: string,
  verifyCommand: string,
): HandoffPacket["replay"] {
  const handoffPath = `${HANDOFF_RELATIVE_DIR}/${result.sessionId}.json`;

  return {
    version: 1,
    replayable: true,
    source: "handoff_packet",
    sourceSession: session,
    previousAttempt: {
      outcome: result.outcome,
      stopPoint: decisionPacket.stopPoint,
      failedCheck: decisionPacket.nextActionDetail.failedCheck,
      summary: decisionPacket.summary,
      lastError,
      patchMediationPath: result.metadata.patchMediationPath,
      externalPatchPath: result.metadata.externalPatchPath,
      postVerifyVerdict: result.postVerify?.verdict,
      postVerifyCommand: result.postVerify?.command,
    },
    inputs: {
      testCommand: result.metadata.testCommand,
      verifyCommand,
      lane: result.lane,
      changedPaths: session.changedPaths.map((entry) => entry.path).sort((left, right) => left.localeCompare(right)),
      allowedPatchPaths: decisionPacket.nextActionDetail.externalToolHandoff?.allowedPaths ?? session.changedPaths.map((entry) => entry.path).sort((left, right) => left.localeCompare(right)),
    },
    commands: {
      restore: `npm run jispec-cli -- implement --from-handoff ${handoffPath}`,
      retryWithExternalPatch: `npm run jispec-cli -- implement --from-handoff ${handoffPath} --external-patch <path>`,
      rerunVerify: verifyCommand,
    },
  };
}

export function buildImplementationDecisionPacket(result: ImplementRunResult, session?: ChangeSession): ImplementationDecisionPacket {
  const patch = result.patchMediation;
  const postVerify = result.postVerify;
  const scope = {
    status: patch?.status ?? "not_applicable" as ImplementationDecisionPacket["scope"]["status"],
    touchedPaths: patch?.touchedPaths ?? [],
    allowedPaths: patch?.allowedPaths ?? [],
    violations: patch?.violations ?? [],
  };
  const testPassed = result.testsPassed;
  const testStatus = buildTestStatus(result);
  const verifyStatus: ImplementationDecisionPacket["verify"]["status"] = postVerify
    ? (postVerify.ok ? "passed" : "blocking")
    : "not_run";
  const base = {
    implementationBoundary: buildImplementationBoundary(result),
    scope,
    test: {
      command: result.metadata.testCommand,
      passed: testPassed,
      status: testStatus,
    },
    verify: {
      command: postVerify?.command,
      verdict: postVerify?.verdict,
      ok: postVerify?.ok,
      status: verifyStatus,
    },
  };

  if (result.outcome === "patch_rejected_out_of_scope") {
    const stopPoint = "scope_check";
    const state = "needs_patch_rescope";
    return {
      ...base,
      state,
      stopPoint,
      mergeable: false,
      summary: "External patch was rejected before apply because it touched paths outside the active change scope.",
      nextAction: "Revise the external patch so it only touches allowed paths, or start a new change session with the broader scope.",
      nextActionDetail: buildNextActionDetail(result, session, {
        type: "fix_patch_scope",
        owner: "human_or_external_tool",
        failedCheck: "scope_check",
        command: buildExternalPatchCommand(result),
        request: "Revise the external patch so every touched path is inside the active change scope, then submit it through implementation mediation again.",
      }),
      executionStatus: buildExecutionStatus(result, stopPoint, "human_or_external_tool"),
      suggestedActions: [
        `Allowed paths: ${scope.allowedPaths.join(", ") || "none"}`,
        `Rejected paths: ${scope.violations.join("; ") || "none"}`,
        "Submit a new external patch after scope is corrected.",
      ],
    };
  }

  if (patch?.status === "apply_failed") {
    const stopPoint = "patch_apply";
    return {
      ...base,
      state: "needs_patch_rework",
      stopPoint,
      mergeable: false,
      summary: "External patch was in scope, but applying it failed.",
      nextAction: "Refresh the patch against the current workspace and submit it again.",
      nextActionDetail: buildNextActionDetail(result, session, {
        type: "resubmit_external_patch",
        owner: "external_patch_author",
        failedCheck: "patch_apply",
        command: buildExternalPatchCommand(result),
        request: "Refresh the patch against the current workspace so git apply succeeds, then submit it through implementation mediation again.",
      }),
      executionStatus: buildExecutionStatus(result, stopPoint, "external_patch_author"),
      suggestedActions: [
        "Regenerate the patch from the current repository state.",
        patch.violations.length > 0 ? `Apply failure: ${patch.violations.join("; ")}` : "Inspect git apply output in the patch mediation artifact.",
      ],
    };
  }

  if (result.outcome === "external_patch_received" && !result.testsPassed) {
    const stopPoint = "test";
    return {
      ...base,
      state: "needs_patch_rework",
      stopPoint,
      mergeable: false,
      summary: "External patch applied inside scope, but mediated tests failed.",
      nextAction: "Fix the patch and rerun implementation mediation with the same scoped change session.",
      nextActionDetail: buildNextActionDetail(result, session, {
        type: "fix_patch_tests",
        owner: "external_patch_author",
        failedCheck: "tests",
        command: buildExternalPatchCommand(result),
        request: "Fix the accepted patch so the mediated test command passes, then submit the corrected patch through implementation mediation again.",
      }),
      executionStatus: buildExecutionStatus(result, stopPoint, "external_patch_author"),
      suggestedActions: [
        `Run tests manually: ${result.metadata.testCommand}`,
        "Review the handoff packet and patch mediation artifact before submitting a corrected patch.",
      ],
    };
  }

  if (result.outcome === "budget_exhausted") {
    const stopPoint = "budget";
    return {
      ...base,
      state: "needs_external_patch",
      stopPoint,
      mergeable: false,
      summary: "Implementation mediation stopped because the configured budget was exhausted.",
      nextAction: "Use the handoff packet as the request for a human or external coding tool patch.",
      nextActionDetail: buildNextActionDetail(result, session, {
        type: "submit_external_patch",
        owner: "human_or_external_tool",
        failedCheck: "budget",
        command: buildExternalPatchCommand(result),
        request: "Use this focused handoff as the implementation request for a human or external coding tool, then submit the resulting patch through implementation mediation.",
      }),
      executionStatus: buildExecutionStatus(result, stopPoint, "human_or_external_tool"),
      suggestedActions: [
        "Review files needing attention in the handoff packet.",
        `Run tests after patching: ${result.metadata.testCommand}`,
      ],
    };
  }

  if (result.outcome === "stall_detected") {
    const stopPoint = "stall";
    return {
      ...base,
      state: "needs_external_patch",
      stopPoint,
      mergeable: false,
      summary: "Implementation mediation stopped because progress stalled.",
      nextAction: "Change approach or hand off to a human/external coding tool with the recorded stall reason.",
      nextActionDetail: buildNextActionDetail(result, session, {
        type: "adjust_approach",
        owner: "human_or_external_tool",
        failedCheck: "stall",
        command: buildExternalPatchCommand(result),
        request: "Change implementation approach using the recorded stall reason, then submit a fresh patch through implementation mediation.",
      }),
      executionStatus: buildExecutionStatus(result, stopPoint, "human_or_external_tool"),
      suggestedActions: [
        result.metadata.stallReason ? `Stall reason: ${result.metadata.stallReason}` : "Inspect repeated failure patterns in the handoff packet.",
        `Run tests after patching: ${result.metadata.testCommand}`,
      ],
    };
  }

  if (result.outcome === "verify_blocked") {
    const stopPoint = "post_verify";
    return {
      ...base,
      state: "blocked_by_verify",
      stopPoint,
      mergeable: false,
      summary: "Tests passed, but post-implement verify produced a blocking verdict.",
      nextAction: "Resolve blocking verify issues before merging or archiving the change session.",
      nextActionDetail: buildNextActionDetail(result, session, {
        type: "fix_verify_blockers",
        owner: "verify_gate",
        failedCheck: "verify",
        command: postVerify?.command ?? buildVerifyCommandForLane(result.lane),
      }),
      executionStatus: buildExecutionStatus(result, stopPoint, "verify_gate"),
      suggestedActions: [
        postVerify?.command ? `Rerun verify: ${postVerify.command}` : "Rerun verify after fixing blocking issues.",
        "Review verify-summary.md for the blocking issue list.",
      ],
    };
  }

  if (result.outcome === "patch_verified") {
    const stopPoint = "post_verify";
    return {
      ...base,
      state: "ready_to_merge",
      stopPoint,
      mergeable: true,
      summary: "External patch was scoped, applied, tested, and verified.",
      nextAction: "Review the mediated patch and proceed with normal merge/review.",
      nextActionDetail: buildNextActionDetail(result, session, {
        type: "review_and_merge",
        owner: "reviewer",
        failedCheck: "none",
        command: "npm run ci:verify",
      }),
      executionStatus: buildExecutionStatus(result, stopPoint, "reviewer"),
      suggestedActions: [
        postVerify?.command ? `Verified with: ${postVerify.command}` : "Review post-implement verify result.",
        "Review the patch mediation artifact for scope and provenance.",
      ],
    };
  }

  const stopPoint = postVerify ? "post_verify" : "preflight";
  const mergeable = postVerify?.ok === true;
  return {
    ...base,
    state: postVerify?.ok ? "ready_to_merge" : "ready_for_verify",
    stopPoint,
    mergeable,
    summary: postVerify?.ok
      ? "Preflight tests passed and post-implement verify is non-blocking."
      : "Preflight tests already pass; no patch was applied by JiSpec.",
    nextAction: postVerify?.ok
      ? "Review and merge according to your normal workflow."
      : "Run verify next before treating this change as mergeable.",
    nextActionDetail: buildNextActionDetail(result, session, {
      type: postVerify?.ok ? "review_and_merge" : "run_verify",
      owner: mergeable ? "reviewer" : "verify_gate",
      failedCheck: "none",
      command: postVerify?.ok ? "npm run ci:verify" : buildVerifyCommandForLane(result.lane),
    }),
    executionStatus: buildExecutionStatus(result, stopPoint, mergeable ? "reviewer" : "verify_gate"),
    suggestedActions: [
      postVerify?.command ? `Verified with: ${postVerify.command}` : `Run verify next: ${buildVerifyCommandForLane(result.lane)}`,
    ],
  };
}

function buildNextActionDetail(
  result: ImplementRunResult,
  session: ChangeSession | undefined,
  options: {
    type: ImplementationNextActionType;
    owner: ImplementationNextActionOwner;
    failedCheck: ImplementationFailedCheck;
    command?: string;
    request?: string;
  },
): ImplementationDecisionPacket["nextActionDetail"] {
  const detail: ImplementationDecisionPacket["nextActionDetail"] = {
    type: options.type,
    owner: options.owner,
    failedCheck: options.failedCheck,
    command: options.command,
  };

  if (options.request) {
    detail.externalToolHandoff = {
      required: true,
      request: options.request,
      allowedPaths: buildAllowedActionPaths(result, session),
      filesNeedingAttention: buildActionAttentionPaths(result, session),
      testCommand: result.metadata.testCommand,
      verifyCommand: buildVerifyCommandForLane(result.lane),
    };
  }

  return detail;
}

function buildExternalPatchCommand(result: ImplementRunResult): string {
  return `npm run jispec-cli -- implement --session-id ${result.sessionId} --external-patch <path>`;
}

function buildAllowedActionPaths(result: ImplementRunResult, session?: ChangeSession): string[] {
  const patchAllowedPaths = result.patchMediation?.allowedPaths ?? [];
  if (patchAllowedPaths.length > 0) {
    return [...patchAllowedPaths].sort((left, right) => left.localeCompare(right));
  }

  return (session?.changedPaths ?? [])
    .map((entry) => entry.path)
    .sort((left, right) => left.localeCompare(right));
}

function buildActionAttentionPaths(result: ImplementRunResult, session?: ChangeSession): string[] {
  const paths = new Set<string>();
  for (const path of result.patchMediation?.touchedPaths ?? []) {
    paths.add(path);
  }
  for (const path of result.patchMediation?.violations ?? []) {
    const match = path.match(/(?:out-of-scope path|path):\s*(.+)$/);
    if (match?.[1]) {
      paths.add(match[1]);
    }
  }
  for (const entry of session?.changedPaths ?? []) {
    paths.add(entry.path);
  }

  return Array.from(paths).sort((left, right) => left.localeCompare(right));
}

function buildTestStatus(result: ImplementRunResult): ImplementationDecisionPacket["test"]["status"] {
  if (result.testsPassed) {
    return "passed";
  }

  if (
    result.patchMediation?.status === "rejected_out_of_scope" ||
    result.patchMediation?.status === "apply_failed"
  ) {
    return "not_run";
  }

  if (
    result.iterations > 0 ||
    result.outcome === "external_patch_received" ||
    result.outcome === "budget_exhausted" ||
    result.outcome === "stall_detected"
  ) {
    return "failed";
  }

  return "not_run";
}

function buildExecutionStatus(
  result: ImplementRunResult,
  stoppedAt: ImplementationDecisionStopPoint,
  nextActionOwner: ImplementationNextActionOwner,
): ImplementationDecisionPacket["executionStatus"] {
  return {
    stoppedAt,
    scopeCheck: buildScopeCheckStatus(result),
    patchApply: buildPatchApplyStatus(result),
    tests: mapTestStatusToCheck(buildTestStatus(result)),
    verify: buildVerifyCheckStatus(result),
    nextActionOwner,
  };
}

function buildScopeCheckStatus(result: ImplementRunResult): ImplementationCheckStatus {
  const patch = result.patchMediation;
  if (!patch) {
    return "not_applicable";
  }

  return patch.status === "rejected_out_of_scope" ? "failed" : "passed";
}

function buildPatchApplyStatus(result: ImplementRunResult): ImplementationCheckStatus {
  const patch = result.patchMediation;
  if (!patch) {
    return "not_applicable";
  }

  if (patch.status === "rejected_out_of_scope") {
    return "not_run";
  }

  return patch.applied ? "passed" : "failed";
}

function mapTestStatusToCheck(status: ImplementationDecisionPacket["test"]["status"]): ImplementationCheckStatus {
  if (status === "passed") {
    return "passed";
  }

  if (status === "failed") {
    return "failed";
  }

  return "not_run";
}

function buildVerifyCheckStatus(result: ImplementRunResult): ImplementationCheckStatus {
  if (!result.postVerify) {
    return "not_run";
  }

  return result.postVerify.ok ? "passed" : "failed";
}

function buildImplementationBoundary(result: ImplementRunResult): ImplementationDecisionPacket["implementationBoundary"] {
  const implementationOwner = result.patchMediation
    ? "external_patch_author"
    : result.outcome === "budget_exhausted" || result.outcome === "stall_detected"
      ? "human_or_external_tool"
      : "existing_workspace";

  return {
    jispecRole: "mediation_and_verification",
    businessCodeGeneratedByJiSpec: false,
    implementationOwner,
    note: "JiSpec constrains, records, tests, and verifies implementation work; it does not generate or own business-code implementation.",
  };
}

/**
 * Build what worked summary.
 */
function buildWhatWorked(successEpisodes: any[]): string[] {
  if (successEpisodes.length === 0) {
    return ["No successful iterations"];
  }

  return successEpisodes.map((ep) => {
    const files = ep.changedFiles.length > 0 ? ` (changed: ${ep.changedFiles.join(", ")})` : "";
    return `Iteration ${ep.iteration}: ${ep.hypothesis}${files}`;
  });
}

/**
 * Build what failed summary.
 */
function buildWhatFailed(failureEpisodes: any[]): string[] {
  if (failureEpisodes.length === 0) {
    return ["No failed iterations"];
  }

  // Get last 5 failures
  const recentFailures = failureEpisodes.slice(-5);

  return recentFailures.map((ep) => {
    const error = ep.errorMessage ? `: ${ep.errorMessage.substring(0, 100)}` : "";
    return `Iteration ${ep.iteration}: ${ep.hypothesis}${error}`;
  });
}

/**
 * Build suggested actions.
 */
function buildSuggestedActions(
  result: ImplementRunResult,
  episodeMemory: EpisodeMemory,
  session: ChangeSession,
): string[] {
  const actions: string[] = [];

  if (result.outcome === "stall_detected") {
    actions.push("Review stall reason and break the pattern");

    if (result.metadata.stallReason?.includes("repeated_failures")) {
      actions.push("The same error occurred multiple times - investigate root cause");
    }

    if (result.metadata.stallReason?.includes("oscillation")) {
      actions.push("Files are being changed back and forth - review design approach");
    }

    if (result.metadata.stallReason?.includes("no_progress")) {
      actions.push("No new files being changed - consider expanding scope or different approach");
    }
  }

  if (result.outcome === "budget_exhausted") {
    actions.push("Mediation budget exhausted - review the bounded request and continue with an external patch");
  }

  if (result.outcome === "external_patch_received" && result.testsPassed === false) {
    actions.push("External patch was received but did not reach verified state");
  }

  // Add rejected paths guidance
  const rejectedPaths = getRejectedPaths(episodeMemory);
  if (rejectedPaths.length > 0) {
    actions.push(`Review rejected paths: ${rejectedPaths.slice(0, 3).join(", ")}${rejectedPaths.length > 3 ? "..." : ""}`);
  }

  // Add test command
  actions.push(`Run tests manually: ${result.metadata.testCommand}`);

  return actions;
}

function buildContractContext(
  root: string,
  session: ChangeSession,
  result: ImplementRunResult,
): ImplementContractContext {
  const takeover = loadBootstrapTakeoverReport(root);
  const changedPaths = session.changedPaths.map((entry) => entry.path).sort((left, right) => left.localeCompare(right));
  const changedPathKinds = Array.from(new Set(session.changedPaths.map((entry) => entry.kind))).sort((left, right) => left.localeCompare(right));

  return {
    lane: result.lane,
    changedPaths,
    changedPathKinds,
    bootstrapTakeoverPresent: Boolean(takeover && takeover.status === "committed"),
    adoptedContractPaths: takeover?.adoptedArtifactPaths ?? [],
    deferredSpecDebtPaths: takeover?.specDebtPaths ?? [],
  };
}

function buildVerifyCommandForLane(lane: "fast" | "strict"): string {
  return lane === "fast"
    ? "npm run jispec-cli -- verify --fast"
    : "npm run verify";
}

/**
 * Build files needing attention.
 */
function buildFilesNeedingAttention(
  episodeMemory: EpisodeMemory,
  session: ChangeSession,
): string[] {
  const rejectedPaths = getRejectedPaths(episodeMemory);

  // Start with rejected paths (files that were changed but tests still failed)
  const files = new Set<string>(rejectedPaths);

  // Add changed paths from session
  for (const cp of session.changedPaths) {
    files.add(cp.path);
  }

  return Array.from(files).sort();
}

/**
 * Write handoff packet to disk.
 */
export function writeHandoffPacket(root: string, packet: HandoffPacket): string {
  const handoffDir = path.join(root, ".jispec", "handoff");

  // Create directory if it doesn't exist
  if (!fs.existsSync(handoffDir)) {
    fs.mkdirSync(handoffDir, { recursive: true });
  }

  const filename = `${packet.sessionId}.json`;
  const filepath = path.join(handoffDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(packet, null, 2), "utf-8");

  return filepath;
}

/**
 * Read handoff packet from disk.
 */
export function readHandoffPacket(root: string, sessionId: string): HandoffPacket | null {
  const filepath = path.join(root, ".jispec", "handoff", `${sessionId}.json`);

  if (!fs.existsSync(filepath)) {
    return null;
  }

  const content = fs.readFileSync(filepath, "utf-8");
  return JSON.parse(content);
}

export function readHandoffPacketFromInput(root: string, input: string): ResolvedHandoffPacket | null {
  const filepath = resolveHandoffPacketInput(root, input);
  if (!filepath || !fs.existsSync(filepath)) {
    return null;
  }

  const content = fs.readFileSync(filepath, "utf-8");
  return {
    packet: JSON.parse(content) as HandoffPacket,
    path: filepath,
  };
}

export function resolveHandoffPacketInput(root: string, input: string): string | null {
  if (!input.trim()) {
    return null;
  }

  const direct = path.resolve(root, input);
  if (fs.existsSync(direct)) {
    return direct;
  }

  if (!input.includes("/") && !input.includes("\\") && !input.endsWith(".json")) {
    return path.join(root, HANDOFF_RELATIVE_DIR, `${input}.json`);
  }

  return direct;
}

/**
 * List all handoff packets.
 */
export function listHandoffPackets(root: string): string[] {
  const handoffDir = path.join(root, ".jispec", "handoff");

  if (!fs.existsSync(handoffDir)) {
    return [];
  }

  const files = fs.readdirSync(handoffDir);
  return files
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .sort();
}

/**
 * Format handoff packet as text.
 */
export function formatHandoffPacket(packet: HandoffPacket): string {
  const lines: string[] = [];

  lines.push("=== Handoff Packet ===");
  lines.push("");
  lines.push(`Session: ${packet.sessionId}`);
  lines.push(`Change Intent: ${packet.changeIntent}`);
  lines.push(`Outcome: ${packet.outcome}`);
  lines.push(`Iterations: ${packet.iterations}`);
  lines.push(`Tokens used: ${packet.tokensUsed}`);
  lines.push(`Cost: $${packet.costUSD.toFixed(2)}`);
  lines.push("");

  lines.push("=== Decision Packet ===");
  lines.push(`State: ${packet.decisionPacket.state}`);
  lines.push(`Stop point: ${packet.decisionPacket.stopPoint}`);
  lines.push(`Mergeable: ${packet.decisionPacket.mergeable}`);
  lines.push(`Summary: ${packet.decisionPacket.summary}`);
  lines.push(`Next action: ${packet.decisionPacket.nextAction}`);
  lines.push(`Next action owner: ${packet.decisionPacket.executionStatus.nextActionOwner}`);
  lines.push(`Next action type: ${packet.decisionPacket.nextActionDetail.type}`);
  lines.push(`Failed check: ${packet.decisionPacket.nextActionDetail.failedCheck}`);
  if (packet.decisionPacket.nextActionDetail.command) {
    lines.push(`Next command: ${packet.decisionPacket.nextActionDetail.command}`);
  }
  if (packet.decisionPacket.nextActionDetail.externalToolHandoff?.required) {
    lines.push(`External handoff: ${packet.decisionPacket.nextActionDetail.externalToolHandoff.request}`);
  }
  lines.push(
    `Checks: scope=${packet.decisionPacket.executionStatus.scopeCheck}, patch=${packet.decisionPacket.executionStatus.patchApply}, test=${packet.decisionPacket.executionStatus.tests}, verify=${packet.decisionPacket.executionStatus.verify}`,
  );
  lines.push(`Test: ${packet.decisionPacket.test.status} via ${packet.decisionPacket.test.command}`);
  lines.push(`Verify: ${packet.decisionPacket.verify.status}${packet.decisionPacket.verify.command ? ` via ${packet.decisionPacket.verify.command}` : ""}`);
  lines.push(`JiSpec role: ${packet.decisionPacket.implementationBoundary.note}`);
  lines.push("");

  lines.push("=== Contract Context ===");
  lines.push(`Lane: ${packet.contractContext.lane}`);
  lines.push(`Changed path kinds: ${packet.contractContext.changedPathKinds.join(", ") || "none"}`);
  if (packet.contractContext.bootstrapTakeoverPresent) {
    lines.push(`Adopted contracts: ${packet.contractContext.adoptedContractPaths.join(", ") || "none"}`);
    lines.push(`Deferred spec debt: ${packet.contractContext.deferredSpecDebtPaths.join(", ") || "none"}`);
  } else {
    lines.push("Bootstrap takeover: not present");
  }
  lines.push("");

  // Summary
  lines.push("=== Summary ===");
  lines.push("");

  if (packet.summary.stallReason) {
    lines.push(`Stall Reason: ${packet.summary.stallReason}`);
    lines.push("");
  }

  lines.push("What Worked:");
  for (const item of packet.summary.whatWorked) {
    lines.push(`  - ${item}`);
  }
  lines.push("");

  lines.push("What Failed:");
  for (const item of packet.summary.whatFailed) {
    lines.push(`  - ${item}`);
  }
  lines.push("");

  if (packet.summary.lastError) {
    lines.push("Last Error:");
    lines.push(`  ${packet.summary.lastError.substring(0, 200)}${packet.summary.lastError.length > 200 ? "..." : ""}`);
    lines.push("");
  }

  // Next Steps
  lines.push("=== Next Steps ===");
  lines.push("");

  lines.push("Suggested Actions:");
  for (const action of packet.nextSteps.suggestedActions) {
    lines.push(`  ${action}`);
  }
  lines.push("");

  if (packet.nextSteps.filesNeedingAttention.length > 0) {
    lines.push("Files Needing Attention:");
    for (const file of packet.nextSteps.filesNeedingAttention) {
      lines.push(`  - ${file}`);
    }
    lines.push("");
  }

  if (packet.nextSteps.externalToolHandoff?.required) {
    lines.push("External Tool Handoff:");
    lines.push(`  Request: ${packet.nextSteps.externalToolHandoff.request}`);
    lines.push(`  Allowed paths: ${packet.nextSteps.externalToolHandoff.allowedPaths.join(", ") || "none"}`);
    lines.push(`  Files needing attention: ${packet.nextSteps.externalToolHandoff.filesNeedingAttention.join(", ") || "none"}`);
    lines.push("");
  }

  lines.push(`Test Command: ${packet.nextSteps.testCommand}`);
  lines.push(`Verify Command: ${packet.nextSteps.verifyCommand}`);
  lines.push(`Verify Recommendation: ${packet.nextSteps.verifyRecommendation}`);
  lines.push("");

  // Episode Memory
  if (packet.episodeMemory.attemptedHypotheses.length > 0) {
    lines.push("=== Attempted Hypotheses ===");
    for (const hypothesis of packet.episodeMemory.attemptedHypotheses) {
      lines.push(`  - ${hypothesis}`);
    }
    lines.push("");
  }

  if (packet.episodeMemory.rejectedPaths.length > 0) {
    lines.push("=== Rejected Paths ===");
    for (const path of packet.episodeMemory.rejectedPaths) {
      lines.push(`  - ${path}`);
    }
    lines.push("");
  }

  lines.push("=== Replay ===");
  lines.push(`Replayable: ${packet.replay.replayable}`);
  lines.push(`Previous outcome: ${packet.replay.previousAttempt.outcome}`);
  lines.push(`Previous stop point: ${packet.replay.previousAttempt.stopPoint}`);
  lines.push(`Previous failed check: ${packet.replay.previousAttempt.failedCheck}`);
  lines.push(`Restore command: ${packet.replay.commands.restore}`);
  lines.push(`Retry with patch: ${packet.replay.commands.retryWithExternalPatch}`);
  lines.push("");

  // Metadata
  lines.push("=== Metadata ===");
  lines.push(`Created: ${packet.metadata.createdAt}`);
  lines.push(`Started: ${packet.metadata.startedAt}`);
  lines.push(`Completed: ${packet.metadata.completedAt}`);

  return lines.join("\n");
}
