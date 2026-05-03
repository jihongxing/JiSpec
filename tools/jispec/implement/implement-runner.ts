/**
 * Implement runner - main orchestrator for implementation mediation.
 * Mediates external patches, then returns to verify.
 */

import path from "node:path";
import { appendAuditEvent } from "../audit/event-ledger";
import {
  archiveChangeSession,
  isActiveChangeSession,
  loadChangeSession,
  readChangeSession,
  writeChangeSession,
  type ChangeSession,
} from "../change/change-session";
import { BudgetController, type BudgetLimits } from "./budget-controller";
import { runTestCommand, extractErrorMessage, type TestResult } from "./test-runner";
import { buildContextBundle } from "./context-pruning";
import { createEpisodeMemory, addEpisode, type EpisodeMemory } from "./episode-memory";
import { StallDetector } from "./stall-detector";
import {
  buildImplementationDecisionPacket,
  generateHandoffPacket,
  readHandoffPacketFromInput,
  writeHandoffPacket,
  formatHandoffPacket,
  type HandoffPacket,
  type ImplementationDecisionPacket,
} from "./handoff-packet";
import { resolveTestCommand as resolveTestCommandFromResolver, describeTestCommand, validateTestCommand } from "./test-command-resolver";
import { runVerify } from "../verify/verify-runner";
import type { VerifyRunResult } from "../verify/verdict";
import { writeAgentRunSession, writeCompletionEvidence, writeDebugPacket, writeDisciplineReport, writeDisciplineSummary } from "../discipline/artifacts";
import { buildCompletionEvidence } from "../discipline/completion-evidence";
import { buildDebugPacketFromImplementResult } from "../discipline/debug-packet";
import { validatePhaseGate } from "../discipline/phase-gate";
import { buildReviewDiscipline } from "../discipline/review-discipline";
import { buildTestStrategy, validateTestStrategy } from "../discipline/test-strategy";
import type { AgentRunSession, DisciplineReport } from "../discipline/types";
import {
  mediateExternalPatch,
  recordPatchMediationCompletionAudit,
  writePatchMediationArtifact,
  type PatchMediationArtifact,
} from "./patch-mediation";

export interface ImplementRunOptions {
  root: string;
  sessionId?: string;
  fromHandoff?: string;
  testCommand?: string;
  fast?: boolean;
  maxIterations?: number;
  maxTokens?: number;
  maxCostUSD?: number;
  externalPatchPath?: string;
}

export interface ImplementPostVerifySummary {
  command: string;
  requestedLane: "fast" | "strict";
  effectiveLane: "fast" | "strict";
  autoPromoted: boolean;
  verdict: VerifyRunResult["verdict"];
  ok: boolean;
  exitCode: number;
  issueCount: number;
  blockingIssueCount: number;
  advisoryIssueCount: number;
  nonBlockingErrorCount: number;
}

export interface ImplementRunResult {
  outcome:
    | "preflight_passed"
    | "external_patch_received"
    | "patch_verified"
    | "patch_rejected_out_of_scope"
    | "budget_exhausted"
    | "stall_detected"
    | "verify_blocked";
  sessionId: string;
  lane: "fast" | "strict";
  requestedFast: boolean;
  autoPromoted: boolean;
  laneReasons: string[];
  iterations: number;
  tokensUsed: number;
  costUSD: number;
  testsPassed: boolean;
  handoffPacket?: HandoffPacket;
  decisionPacket?: ImplementationDecisionPacket;
  patchMediation?: PatchMediationArtifact;
  postVerify?: ImplementPostVerifySummary;
  metadata: {
    startedAt: string;
    completedAt: string;
    testCommand: string;
    stallReason?: string;
    handoffPacketPath?: string;
    patchMediationPath?: string;
    externalPatchPath?: string;
    verifyCommand?: string;
    sessionArchived?: boolean;
    agentDiscipline?: {
      sessionPath?: string;
      completionEvidencePath?: string;
      disciplineReportPath?: string;
      disciplineSummaryPath?: string;
      debugPacketPath?: string;
      debugPacketMarkdownPath?: string;
    };
    replay?: {
      fromHandoffPath: string;
      previousOutcome: HandoffPacket["outcome"];
      previousStopPoint: HandoffPacket["decisionPacket"]["stopPoint"];
      previousFailedCheck: HandoffPacket["decisionPacket"]["nextActionDetail"]["failedCheck"];
      restoredSession: boolean;
    };
  };
}

interface PreflightExitResult {
  outcome: "preflight_passed";
  iterations: number;
  tokensUsed: number;
  costUSD: number;
  testsPassed: boolean;
}

interface IterationLoopResult {
  outcome: "preflight_passed" | "budget_exhausted" | "stall_detected";
  iterations: number;
  tokensUsed: number;
  costUSD: number;
  testsPassed: boolean;
  episodeMemory: EpisodeMemory;
  lastError: string;
  stallReason?: string;
}

interface LoadedImplementSession {
  session: ChangeSession;
  source: "active" | "archived";
}

interface LoadedReplayState {
  packet: HandoffPacket;
  path: string;
  restoredSession: boolean;
}

interface ImplementLaneResolution {
  lane: "fast" | "strict";
  requestedFast: boolean;
  autoPromoted: boolean;
  reasons: string[];
}

/**
 * Run implementation mediation.
 */
export async function runImplement(options: ImplementRunOptions): Promise<ImplementRunResult> {
  const root = path.resolve(options.root);
  const startedAt = new Date().toISOString();
  const replay = options.fromHandoff ? restoreReplayState(root, options.fromHandoff) : undefined;
  if (options.sessionId && replay && options.sessionId !== replay.packet.sessionId) {
    throw new Error(`--session-id ${options.sessionId} does not match replay handoff session ${replay.packet.sessionId}.`);
  }

  const loadedSession = loadImplementSession(root, options.sessionId ?? replay?.packet.sessionId);
  if (!loadedSession) {
    throw new Error("No active change session found. Run 'jispec-cli change' first.");
  }

  const session = loadedSession.session;
  const laneResolution = resolveImplementLane(session, options.fast === true);

  const testCommandResolution = resolveTestCommandFromResolver(
    root,
    session,
    options.testCommand ?? replay?.packet.replay.inputs.testCommand,
  );
  const testCommand = testCommandResolution.command;
  const validation = validateTestCommand(testCommand);
  if (!validation.valid) {
    throw new Error(validation.reason ?? "Invalid test command.");
  }

  console.log(describeLaneResolution(laneResolution));
  console.log(describeTestCommand(testCommandResolution));

  let result: ImplementRunResult;
  let episodeMemory: EpisodeMemory | undefined;
  let lastError = "";

  if (options.externalPatchPath) {
    result = mediatePatchIntake(root, session, laneResolution, testCommand, options.externalPatchPath, startedAt);
    if (replay) {
      result.metadata.replay = buildReplayMetadata(replay);
    }
    lastError = result.patchMediation?.test?.errorMessage ?? result.patchMediation?.violations.join("\n") ?? "";
  } else {
    const preflightResult = await runPreflight(root, testCommand);
    if (preflightResult) {
      result = {
        ...preflightResult,
        sessionId: session.id,
        lane: laneResolution.lane,
        requestedFast: laneResolution.requestedFast,
        autoPromoted: laneResolution.autoPromoted,
        laneReasons: [...laneResolution.reasons],
        metadata: {
          startedAt,
          completedAt: new Date().toISOString(),
          testCommand,
          replay: replay ? buildReplayMetadata(replay) : undefined,
        },
      };
    } else {
      const budgetLimits: Partial<BudgetLimits> = {
        maxIterations: options.maxIterations,
        maxTokens: options.maxTokens,
        maxCostUSD: options.maxCostUSD,
      };
      const budget = new BudgetController(budgetLimits);
      const loopResult = await runIterationLoop(root, session, testCommand, budget);
      episodeMemory = loopResult.episodeMemory;
      lastError = loopResult.lastError;

      result = {
        ...loopResult,
        sessionId: session.id,
        lane: laneResolution.lane,
        requestedFast: laneResolution.requestedFast,
        autoPromoted: laneResolution.autoPromoted,
        laneReasons: [...laneResolution.reasons],
        metadata: {
          startedAt,
          completedAt: new Date().toISOString(),
          testCommand,
          stallReason: loopResult.stallReason,
          replay: replay ? buildReplayMetadata(replay) : undefined,
        },
      };
    }
  }

  if (result.testsPassed) {
    const postVerify = await runPostImplementVerify(root, laneResolution.lane);
    result.postVerify = postVerify;
    result.metadata.verifyCommand = postVerify.command;

    if (result.patchMediation) {
      result.patchMediation.postVerify = {
        command: postVerify.command,
        verdict: postVerify.verdict,
        ok: postVerify.ok,
        exitCode: postVerify.exitCode,
        issueCount: postVerify.issueCount,
        blockingIssueCount: postVerify.blockingIssueCount,
        advisoryIssueCount: postVerify.advisoryIssueCount,
        nonBlockingErrorCount: postVerify.nonBlockingErrorCount,
      };
      result.patchMediation.completedAt = new Date().toISOString();
      result.metadata.patchMediationPath = writePatchMediationArtifact(root, result.patchMediation);
    }

    if (!postVerify.ok) {
      result.outcome = "verify_blocked";
      lastError = buildPostVerifyErrorSummary(postVerify);
    } else if (result.patchMediation) {
      result.outcome = "patch_verified";
    }

    if (postVerify.ok && loadedSession.source === "active" && isActiveChangeSession(root, session.id)) {
      archiveChangeSession(root);
      result.metadata.sessionArchived = true;
    }
  }

  result.decisionPacket = buildImplementationDecisionPacket(result, session);
  writeAgentDisciplineArtifacts(root, result, session);
  if (result.patchMediation && result.metadata.patchMediationPath) {
    recordPatchMediationCompletionAudit(
      root,
      result.patchMediation,
      result.metadata.patchMediationPath,
      session,
      result.decisionPacket,
    );
  }

  if (shouldWriteHandoffPacket(result)) {
    if (result.patchMediation?.touchedPaths.length && !episodeMemory) {
      episodeMemory = createEpisodeMemory();
      addEpisode(episodeMemory, {
        iteration: Math.max(result.iterations, 1),
        hypothesis: `External patch intake from ${result.metadata.externalPatchPath ?? "provided patch"}`,
        outcome: result.testsPassed ? "success" : "failure",
        changedFiles: result.patchMediation.touchedPaths,
        errorMessage: lastError,
      });
    }

    const handoffPacket = generateHandoffPacket(
      root,
      session,
      result,
      episodeMemory ?? createEpisodeMemory(),
      lastError,
    );
    handoffPacket.discipline = result.metadata.agentDiscipline;
    handoffPacket.reviewDiscipline = buildReviewDiscipline(handoffPacket);
    const handoffPath = writeHandoffPacket(root, handoffPacket);

    result.handoffPacket = handoffPacket;
    result.metadata.handoffPacketPath = handoffPath;

    console.log(`\nHandoff packet written to: ${handoffPath}`);
    console.log("\n" + formatHandoffPacket(handoffPacket));
  }

  return result;
}

function buildAgentRunSession(root: string, result: ImplementRunResult, session: ChangeSession, generatedAt: string): AgentRunSession {
  const touchedPaths = result.patchMediation?.touchedPaths ?? [];
  const allowedPaths = result.patchMediation?.allowedPaths ?? session.changedPaths.map((entry) => entry.path).sort((left, right) => left.localeCompare(right));
  const unexpectedPaths = result.patchMediation?.violations
    .map((violation) => violation.match(/out-of-scope path:\s*(.+)$/)?.[1])
    .filter((entry): entry is string => Boolean(entry))
    ?? touchedPaths.filter((entry) => !isPathAllowed(entry, allowedPaths));
  const testStrategy = buildTestStrategy(session, result.metadata.testCommand, result.lane === "fast");
  const mode = result.lane === "fast" ? "fast_advisory" : "strict_gate";

  return {
    schemaVersion: 1,
    kind: "jispec-agent-discipline-session",
    sessionId: result.sessionId,
    generatedAt,
    mode,
    currentPhase: result.postVerify ? "handoff" : result.testsPassed ? "implement" : "debug",
    transitions: [
      {
        phase: "intent",
        status: "passed",
        actor: "jispec-change",
        timestamp: session.createdAt,
        sourceCommand: "npm run jispec-cli -- change",
        truthSources: [{ path: ".jispec/change-session.json", provenance: "EXTRACTED", note: "Active change session." }],
      },
      {
        phase: "plan",
        status: mode === "strict_gate" ? "passed" : "not_applicable",
        actor: "jispec-implement",
        timestamp: generatedAt,
        sourceCommand: "npm run jispec-cli -- implement",
        truthSources: [{ path: ".jispec/change-session.json", provenance: "EXTRACTED", note: "Change session lane and scope." }],
      },
      {
        phase: "implement",
        status: result.patchMediation?.status === "rejected_out_of_scope" ? "failed" : "passed",
        actor: "external_patch_author",
        timestamp: generatedAt,
        sourceCommand: result.metadata.externalPatchPath ? `npm run jispec-cli -- implement --external-patch ${result.metadata.externalPatchPath}` : "npm run jispec-cli -- implement",
        truthSources: result.metadata.patchMediationPath
          ? [{ path: normalizeArtifactPath(root, result.metadata.patchMediationPath), provenance: "EXTRACTED", note: "Patch mediation artifact." }]
          : [],
      },
      {
        phase: result.postVerify ? "verify" : "debug",
        status: result.postVerify?.ok ? "passed" : result.outcome === "patch_verified" ? "passed" : "failed",
        actor: result.postVerify ? "verify_gate" : "jispec-implement",
        timestamp: generatedAt,
        sourceCommand: result.postVerify?.command ?? result.metadata.testCommand ?? "not recorded",
        truthSources: result.metadata.handoffPacketPath
          ? [{ path: normalizeArtifactPath(root, result.metadata.handoffPacketPath), provenance: "EXTRACTED", note: "Implementation handoff." }]
          : [],
      },
    ],
    allowedPaths,
    touchedPaths,
    unexpectedPaths,
    testStrategy,
    truthSources: [
      { path: ".jispec/change-session.json", provenance: "EXTRACTED", note: "Change session scope and lane." },
    ],
  };
}

function writeAgentDisciplineArtifacts(root: string, result: ImplementRunResult, session: ChangeSession): void {
  const generatedAt = new Date().toISOString();
  const agentSession = buildAgentRunSession(root, result, session, generatedAt);
  const phaseGate = validatePhaseGate(agentSession);
  const testStrategyResult = validateTestStrategy(agentSession.testStrategy!);
  const completionEvidence = buildCompletionEvidence(result, generatedAt, root);
  const sessionPath = writeAgentRunSession(root, agentSession);
  const completionEvidencePath = writeCompletionEvidence(root, completionEvidence);
  let debugPacketPath: string | undefined;
  let debugPacketMarkdownPath: string | undefined;
  if (completionEvidence.status === "blocked" || result.outcome === "external_patch_received" || result.outcome === "patch_rejected_out_of_scope") {
    const debug = buildDebugPacketFromImplementResult(result, generatedAt, root);
    const debugPacket = writeDebugPacket(root, debug);
    debugPacketPath = debugPacket.jsonPath;
    debugPacketMarkdownPath = debugPacket.markdownPath;
  }

  const report: DisciplineReport = {
    schemaVersion: 1,
    kind: "jispec-agent-discipline-report",
    sessionId: result.sessionId,
    generatedAt,
    mode: agentSession.mode,
    phaseGate,
    testStrategy: {
      status: testStrategyResult.status,
      ownerReviewRequired: agentSession.testStrategy?.ownerReviewRequired ?? true,
      command: agentSession.testStrategy?.command,
    },
    completion: {
      status: completionEvidence.status,
      missingEvidence: completionEvidence.missingEvidence,
    },
    isolation: {
      allowedPaths: agentSession.allowedPaths,
      touchedPaths: agentSession.touchedPaths,
      unexpectedPaths: agentSession.unexpectedPaths,
    },
    artifacts: {
      sessionPath,
      completionEvidencePath,
      debugPacketPath,
      debugPacketMarkdownPath,
      summaryPath: `.jispec/agent-run/${result.sessionId}/discipline-summary.md`,
    },
    truthSources: completionEvidence.truthSources,
  };

  const disciplineReportPath = writeDisciplineReport(root, report);
  const disciplineSummaryPath = writeDisciplineSummary(root, report);
  appendAuditEvent(root, {
    type: "agent_discipline_recorded",
    reason: `Agent discipline recorded ${completionEvidence.status} for change session ${result.sessionId}.`,
    sourceArtifact: {
      kind: "agent-discipline-report",
      path: disciplineReportPath,
    },
    affectedContracts: session.impactSummary && !Array.isArray(session.impactSummary)
      ? session.impactSummary.impactedContracts
      : [],
    details: {
      sessionId: result.sessionId,
      mode: report.mode,
      completionStatus: completionEvidence.status,
      phaseGateStatus: phaseGate.status,
      testStrategyStatus: testStrategyResult.status,
      unexpectedPaths: report.isolation.unexpectedPaths,
      artifacts: {
        sessionPath,
        completionEvidencePath,
        disciplineReportPath,
        disciplineSummaryPath,
        debugPacketPath,
        debugPacketMarkdownPath,
      },
    },
  });
  result.metadata.agentDiscipline = {
    sessionPath,
    completionEvidencePath,
    disciplineReportPath,
    disciplineSummaryPath,
    debugPacketPath,
    debugPacketMarkdownPath,
  };
}

function isPathAllowed(touchedPath: string, allowedPaths: string[]): boolean {
  const normalizedTouched = touchedPath.replace(/\\/g, "/");
  return allowedPaths.some((allowedPath) => {
    const normalizedAllowed = allowedPath.replace(/\\/g, "/").replace(/\/+$/g, "");
    return normalizedTouched === normalizedAllowed || normalizedTouched.startsWith(`${normalizedAllowed}/`);
  });
}

function normalizeArtifactPath(root: string, artifactPath: string): string {
  return path.isAbsolute(artifactPath)
    ? path.relative(root, artifactPath).replace(/\\/g, "/")
    : artifactPath.replace(/\\/g, "/");
}

function shouldWriteHandoffPacket(result: ImplementRunResult): boolean {
  return (
    result.outcome === "budget_exhausted" ||
    result.outcome === "stall_detected" ||
    result.outcome === "patch_rejected_out_of_scope" ||
    result.outcome === "verify_blocked" ||
    (result.outcome === "external_patch_received" && !result.testsPassed)
  );
}

function buildPostVerifyErrorSummary(postVerify: ImplementPostVerifySummary): string {
  return [
    `Post-implement verify ${postVerify.verdict}`,
    `${postVerify.blockingIssueCount} blocking issue(s)`,
    `${postVerify.advisoryIssueCount} advisory issue(s)`,
    `${postVerify.nonBlockingErrorCount} non-blocking error(s)`,
  ].join("; ");
}

function mediatePatchIntake(
  root: string,
  session: ChangeSession,
  laneResolution: ImplementLaneResolution,
  testCommand: string,
  externalPatchPath: string,
  startedAt: string,
): ImplementRunResult {
  console.log(`External patch supplied: ${externalPatchPath}`);
  console.log("Mediating patch scope before applying it.");

  const mediation = mediateExternalPatch(root, session, externalPatchPath);
  const metadata = {
    startedAt,
    completedAt: new Date().toISOString(),
    testCommand,
    patchMediationPath: mediation.artifactPath,
    externalPatchPath: mediation.artifact.externalPatchPath,
  };

  if (mediation.artifact.status === "rejected_out_of_scope") {
    console.log("Patch rejected before apply: touched paths are outside the active change session scope.");
    return {
      outcome: "patch_rejected_out_of_scope",
      sessionId: session.id,
      lane: laneResolution.lane,
      requestedFast: laneResolution.requestedFast,
      autoPromoted: laneResolution.autoPromoted,
      laneReasons: [...laneResolution.reasons],
      iterations: 0,
      tokensUsed: 0,
      costUSD: 0,
      testsPassed: false,
      patchMediation: mediation.artifact,
      metadata,
    };
  }

  if (mediation.artifact.status === "apply_failed") {
    console.log("Patch scope accepted, but git apply failed.");
    return {
      outcome: "external_patch_received",
      sessionId: session.id,
      lane: laneResolution.lane,
      requestedFast: laneResolution.requestedFast,
      autoPromoted: laneResolution.autoPromoted,
      laneReasons: [...laneResolution.reasons],
      iterations: 0,
      tokensUsed: 0,
      costUSD: 0,
      testsPassed: false,
      patchMediation: mediation.artifact,
      metadata,
    };
  }

  console.log("Patch accepted and applied. Running mediated test command.");
  const testResult = runTestCommand(testCommand, { cwd: root });
  const errorMessage = extractErrorMessage(testResult);
  mediation.artifact.test = {
    command: testCommand,
    passed: testResult.passed,
    exitCode: testResult.exitCode,
    duration: testResult.duration,
    errorMessage: errorMessage || undefined,
  };
  mediation.artifact.completedAt = new Date().toISOString();
  metadata.patchMediationPath = writePatchMediationArtifact(root, mediation.artifact);
  metadata.completedAt = mediation.artifact.completedAt;

  return {
    outcome: "external_patch_received",
    sessionId: session.id,
    lane: laneResolution.lane,
    requestedFast: laneResolution.requestedFast,
    autoPromoted: laneResolution.autoPromoted,
    laneReasons: [...laneResolution.reasons],
    iterations: 1,
    tokensUsed: 0,
    costUSD: 0,
    testsPassed: testResult.passed,
    patchMediation: mediation.artifact,
    metadata,
  };
}

function restoreReplayState(root: string, input: string): LoadedReplayState {
  const resolved = readHandoffPacketFromInput(root, input);
  if (!resolved) {
    throw new Error(`Handoff packet not found: ${input}`);
  }

  const replay = resolved.packet.replay;
  if (!replay?.replayable || !replay.sourceSession?.id) {
    throw new Error(`Handoff packet is not replayable: ${input}`);
  }

  const active = readChangeSession(root);
  if (active && active.id !== replay.sourceSession.id) {
    throw new Error(`Cannot replay handoff ${resolved.packet.sessionId} while active change session ${active.id} is present.`);
  }

  let restoredSession = false;
  if (!active) {
    writeChangeSession(root, replay.sourceSession);
    restoredSession = true;
  }

  return {
    packet: resolved.packet,
    path: resolved.path,
    restoredSession,
  };
}

function buildReplayMetadata(replay: LoadedReplayState): NonNullable<ImplementRunResult["metadata"]["replay"]> {
  return {
    fromHandoffPath: replay.path,
    previousOutcome: replay.packet.replay.previousAttempt.outcome,
    previousStopPoint: replay.packet.replay.previousAttempt.stopPoint,
    previousFailedCheck: replay.packet.replay.previousAttempt.failedCheck,
    restoredSession: replay.restoredSession,
  };
}

function loadImplementSession(root: string, sessionId?: string): LoadedImplementSession | null {
  if (sessionId) {
    const session = loadChangeSession(root, sessionId);
    if (!session) {
      return null;
    }

    return {
      session,
      source: isActiveChangeSession(root, sessionId) ? "active" : "archived",
    };
  }

  const active = loadChangeSession(root);
  if (!active) {
    return null;
  }

  return {
    session: active,
    source: "active",
  };
}

async function runPreflight(
  root: string,
  testCommand: string,
): Promise<PreflightExitResult | null> {
  console.log("Running preflight test...");

  const result = runTestCommand(testCommand, { cwd: root });

  if (result.passed) {
    console.log("Preflight PASSED - tests already pass, skipping patch mediation and returning to verify");
    return {
      outcome: "preflight_passed",
      iterations: 0,
      tokensUsed: 0,
      costUSD: 0,
      testsPassed: true,
    };
  }

  console.log("Preflight FAILED - no external patch supplied, preparing implementation mediation handoff");
  return null;
}

async function runIterationLoop(
  root: string,
  session: ChangeSession,
  testCommand: string,
  budget: BudgetController,
): Promise<IterationLoopResult> {
  let lastTestResult: TestResult | null = null;
  let iteration = 0;
  const episodeMemory = createEpisodeMemory();
  const stallDetector = new StallDetector();
  let lastError = "";

  while (budget.canContinue()) {
    iteration++;
    console.log(`\nIteration ${iteration}:`);

    const context = buildContextBundle(root, session, lastTestResult, episodeMemory);
    console.log(`Context: ${context.workingSet.files.length} files, ${context.workingSet.totalLines} lines`);

    console.log("No external patch supplied; recording a bounded handoff request.");
    const hypothesis = `Iteration ${iteration} external patch request`;
    const changedFiles: string[] = [];
    const tokensUsed = 0;
    const costUSD = 0;

    budget.recordIteration(tokensUsed, costUSD);

    console.log("Running tests...");
    lastTestResult = runTestCommand(testCommand, { cwd: root });

    if (lastTestResult.passed) {
      console.log("Tests PASSED!");
      addEpisode(episodeMemory, {
        iteration,
        hypothesis,
        outcome: "success",
        changedFiles,
      });

      const state = budget.getState();
      return {
        outcome: "preflight_passed",
        iterations: state.iterations,
        tokensUsed: state.tokensUsed,
        costUSD: state.costUSD,
        testsPassed: true,
        episodeMemory,
        lastError,
      };
    }

    console.log("Tests FAILED");
    const errorMsg = extractErrorMessage(lastTestResult);
    if (errorMsg) {
      console.log(`Error: ${errorMsg.substring(0, 200)}...`);
      lastError = errorMsg;
    }

    addEpisode(episodeMemory, {
      iteration,
      hypothesis,
      outcome: "failure",
      changedFiles,
      errorMessage: errorMsg,
    });

    stallDetector.recordIteration(lastTestResult.passed, changedFiles, errorMsg);
    const stallCheck = stallDetector.checkStall();
    if (stallCheck.isStalled) {
      console.log(`\nStall detected: ${stallCheck.reason}`);
      console.log(`Details: ${stallCheck.details}`);

      const state = budget.getState();
      return {
        outcome: "stall_detected",
        iterations: state.iterations,
        tokensUsed: state.tokensUsed,
        costUSD: state.costUSD,
        testsPassed: false,
        stallReason: stallCheck.details,
        episodeMemory,
        lastError,
      };
    }
  }

  console.log("\nBudget exhausted");
  const state = budget.getState();
  return {
    outcome: "budget_exhausted",
    iterations: state.iterations,
    tokensUsed: state.tokensUsed,
    costUSD: state.costUSD,
    testsPassed: false,
    episodeMemory,
    lastError,
  };
}

export function renderImplementText(result: ImplementRunResult): string {
  const lines: string[] = [];

  lines.push("=== Implementation Mediation Result ===");
  lines.push("");
  lines.push(`Outcome: ${result.outcome}`);
  lines.push(`Session: ${result.sessionId}`);
  lines.push(`Lane: ${result.lane}${result.autoPromoted ? " (auto-promoted from fast request)" : ""}`);
  lines.push(`Iterations: ${result.iterations}`);
  lines.push(`Tokens used: ${result.tokensUsed}`);
  lines.push(`Cost: $${result.costUSD.toFixed(2)}`);
  lines.push(`Tests passed: ${result.testsPassed}`);
  lines.push("");
  if (result.decisionPacket) {
    lines.push("Decision:");
    lines.push(`  State: ${result.decisionPacket.state}`);
    lines.push(`  Stop point: ${result.decisionPacket.stopPoint}`);
    lines.push(`  Mergeable: ${result.decisionPacket.mergeable}`);
    lines.push(`  Summary: ${result.decisionPacket.summary}`);
    lines.push(`  Next action: ${result.decisionPacket.nextAction}`);
    lines.push(`  Next action owner: ${result.decisionPacket.executionStatus.nextActionOwner}`);
    lines.push(`  Next action type: ${result.decisionPacket.nextActionDetail.type}`);
    lines.push(`  Failed check: ${result.decisionPacket.nextActionDetail.failedCheck}`);
    if (result.decisionPacket.nextActionDetail.command) {
      lines.push(`  Next command: ${result.decisionPacket.nextActionDetail.command}`);
    }
    if (result.decisionPacket.nextActionDetail.externalToolHandoff?.required) {
      lines.push(`  External handoff: ${result.decisionPacket.nextActionDetail.externalToolHandoff.request}`);
    }
    lines.push(
      `  Checks: scope=${result.decisionPacket.executionStatus.scopeCheck}, patch=${result.decisionPacket.executionStatus.patchApply}, test=${result.decisionPacket.executionStatus.tests}, verify=${result.decisionPacket.executionStatus.verify}`,
    );
    lines.push(`  JiSpec role: ${result.decisionPacket.implementationBoundary.note}`);
    lines.push("");
  }
  lines.push(`Started: ${result.metadata.startedAt}`);
  lines.push(`Completed: ${result.metadata.completedAt}`);
  lines.push(`Test command: ${result.metadata.testCommand}`);
  if (result.laneReasons.length > 0) {
    lines.push(`Lane reasons: ${result.laneReasons.join("; ")}`);
  }

  if (result.metadata.replay) {
    lines.push("");
    lines.push("Replay:");
    lines.push(`  From handoff: ${result.metadata.replay.fromHandoffPath}`);
    lines.push(`  Previous outcome: ${result.metadata.replay.previousOutcome}`);
    lines.push(`  Previous stop point: ${result.metadata.replay.previousStopPoint}`);
    lines.push(`  Previous failed check: ${result.metadata.replay.previousFailedCheck}`);
    lines.push(`  Restored session: ${result.metadata.replay.restoredSession}`);
  }

  if (result.metadata.stallReason) {
    lines.push("");
    lines.push(`Stall reason: ${result.metadata.stallReason}`);
  }

  if (result.metadata.handoffPacketPath) {
    lines.push("");
    lines.push(`Handoff packet: ${result.metadata.handoffPacketPath}`);
  }

  if (result.metadata.agentDiscipline) {
    lines.push("");
    lines.push("Agent discipline:");
    lines.push(`  Report: ${result.metadata.agentDiscipline.disciplineReportPath ?? "not_available_yet"}`);
    lines.push(`  Summary: ${result.metadata.agentDiscipline.disciplineSummaryPath ?? "not_available_yet"}`);
    lines.push(`  Completion evidence: ${result.metadata.agentDiscipline.completionEvidencePath ?? "not_available_yet"}`);
    if (result.metadata.agentDiscipline.debugPacketPath) {
      lines.push(`  Debug packet: ${result.metadata.agentDiscipline.debugPacketPath}`);
    }
    if (result.metadata.agentDiscipline.debugPacketMarkdownPath) {
      lines.push(`  Debug summary: ${result.metadata.agentDiscipline.debugPacketMarkdownPath}`);
    }
  }

  if (result.patchMediation) {
    lines.push("");
    lines.push("Patch mediation:");
    lines.push(`  Status: ${result.patchMediation.status}`);
    lines.push(`  External patch: ${result.patchMediation.externalPatchPath}`);
    lines.push(`  Touched paths: ${result.patchMediation.touchedPaths.join(", ") || "none"}`);
    lines.push(`  Allowed paths: ${result.patchMediation.allowedPaths.join(", ") || "none"}`);
    lines.push(`  Applied: ${result.patchMediation.applied}`);
    if (result.patchMediation.violations.length > 0) {
      lines.push(`  Violations: ${result.patchMediation.violations.join("; ")}`);
    }
    if (result.metadata.patchMediationPath) {
      lines.push(`  Artifact: ${result.metadata.patchMediationPath}`);
    }
  }

  if (result.postVerify) {
    lines.push("");
    lines.push("Post-implement verify:");
    lines.push(`  Command: ${result.postVerify.command}`);
    lines.push(`  Lane: ${result.postVerify.effectiveLane}${result.postVerify.autoPromoted ? " (auto-promoted)" : ""}`);
    lines.push(`  Verdict: ${result.postVerify.verdict}`);
    lines.push(`  Issues: ${result.postVerify.issueCount} total (${result.postVerify.blockingIssueCount} blocking, ${result.postVerify.advisoryIssueCount} advisory, ${result.postVerify.nonBlockingErrorCount} non-blocking errors)`);
  }

  if (result.metadata.sessionArchived) {
    lines.push("");
    lines.push("Change session archived after successful post-implement verify.");
  }

  return lines.join("\n");
}

export function renderImplementJSON(result: ImplementRunResult): string {
  return JSON.stringify(result, null, 2);
}

export function computeImplementExitCode(result: ImplementRunResult): number {
  if (!result.testsPassed) {
    return 1;
  }

  return result.postVerify?.exitCode ?? 0;
}

function resolveImplementLane(session: ChangeSession, requestedFast: boolean): ImplementLaneResolution {
  if (session.laneDecision.lane === "strict") {
    return {
      lane: "strict",
      requestedFast,
      autoPromoted: requestedFast,
      reasons: requestedFast
        ? [...session.laneDecision.reasons, "active change session is already strict, so implement stays on the strict lane"]
        : [...session.laneDecision.reasons],
    };
  }

  if (session.laneDecision.lane === "fast") {
    return {
      lane: "fast",
      requestedFast,
      autoPromoted: false,
      reasons: [...session.laneDecision.reasons],
    };
  }

  return {
    lane: requestedFast ? "fast" : "strict",
    requestedFast,
    autoPromoted: false,
    reasons: requestedFast
      ? ["no stored lane decision was available, so implement honored the explicit fast request"]
      : ["no stored lane decision was available, so implement defaulted to strict"],
  };
}

function describeLaneResolution(resolution: ImplementLaneResolution): string {
  const lines = [
    `Implement lane: ${resolution.lane}${resolution.autoPromoted ? " (auto-promoted from fast request)" : ""}`,
  ];

  if (resolution.reasons.length > 0) {
    lines.push(`Reasons: ${resolution.reasons.join("; ")}`);
  }

  return lines.join("\n");
}

async function runPostImplementVerify(
  root: string,
  lane: "fast" | "strict",
): Promise<ImplementPostVerifySummary> {
  const command = lane === "fast"
    ? "npm run jispec-cli -- verify --fast"
    : "npm run verify";
  const verifyResult = await runVerify({
    root,
    fast: lane === "fast",
    ignoreAgentDiscipline: true,
  });

  return {
    command,
    requestedLane: lane,
    effectiveLane: verifyResult.metadata?.lane === "fast" ? "fast" : "strict",
    autoPromoted: verifyResult.metadata?.fastAutoPromoted === true,
    verdict: verifyResult.verdict,
    ok: verifyResult.ok,
    exitCode: verifyResult.exitCode,
    issueCount: verifyResult.issueCount,
    blockingIssueCount: verifyResult.blockingIssueCount,
    advisoryIssueCount: verifyResult.advisoryIssueCount,
    nonBlockingErrorCount: verifyResult.nonBlockingErrorCount,
  };
}
