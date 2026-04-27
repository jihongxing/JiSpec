/**
 * Implement runner - main orchestrator for implement FSM.
 * Runs a budget-controlled iteration loop, then returns to verify.
 */

import path from "node:path";
import {
  archiveChangeSession,
  isActiveChangeSession,
  loadChangeSession,
  type ChangeSession,
} from "../change/change-session";
import { BudgetController, type BudgetLimits } from "./budget-controller";
import { runTestCommand, extractErrorMessage, type TestResult } from "./test-runner";
import { buildContextBundle } from "./context-pruning";
import { createEpisodeMemory, addEpisode, type EpisodeMemory } from "./episode-memory";
import { StallDetector } from "./stall-detector";
import { generateHandoffPacket, writeHandoffPacket, formatHandoffPacket, type HandoffPacket } from "./handoff-packet";
import { resolveTestCommand as resolveTestCommandFromResolver, describeTestCommand, validateTestCommand } from "./test-command-resolver";
import { runVerify } from "../verify/verify-runner";
import type { VerifyRunResult } from "../verify/verdict";

export interface ImplementRunOptions {
  root: string;
  sessionId?: string;
  testCommand?: string;
  fast?: boolean;
  maxIterations?: number;
  maxTokens?: number;
  maxCostUSD?: number;
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
  outcome: "success" | "budget_exhausted" | "stall_detected" | "preflight_failed";
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
  postVerify?: ImplementPostVerifySummary;
  metadata: {
    startedAt: string;
    completedAt: string;
    testCommand: string;
    stallReason?: string;
    handoffPacketPath?: string;
    verifyCommand?: string;
    sessionArchived?: boolean;
  };
}

interface PreflightExitResult {
  outcome: "preflight_failed";
  iterations: number;
  tokensUsed: number;
  costUSD: number;
  testsPassed: boolean;
}

interface IterationLoopResult {
  outcome: "success" | "budget_exhausted" | "stall_detected";
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

interface ImplementLaneResolution {
  lane: "fast" | "strict";
  requestedFast: boolean;
  autoPromoted: boolean;
  reasons: string[];
}

/**
 * Run implement FSM.
 */
export async function runImplement(options: ImplementRunOptions): Promise<ImplementRunResult> {
  const root = path.resolve(options.root);
  const startedAt = new Date().toISOString();

  const loadedSession = loadImplementSession(root, options.sessionId);
  if (!loadedSession) {
    throw new Error("No active change session found. Run 'jispec-cli change' first.");
  }

  const session = loadedSession.session;
  const laneResolution = resolveImplementLane(session, options.fast === true);

  const testCommandResolution = resolveTestCommandFromResolver(root, session, options.testCommand);
  const testCommand = testCommandResolution.command;
  const validation = validateTestCommand(testCommand);
  if (!validation.valid) {
    throw new Error(validation.reason ?? "Invalid test command.");
  }

  console.log(describeLaneResolution(laneResolution));
  console.log(describeTestCommand(testCommandResolution));

  const preflightResult = await runPreflight(root, testCommand);
  let result: ImplementRunResult;
  let episodeMemory: EpisodeMemory | undefined;
  let lastError = "";

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
      },
    };
  }

  if (result.outcome === "budget_exhausted" || result.outcome === "stall_detected") {
    const handoffPacket = generateHandoffPacket(
      root,
      session,
      result,
      episodeMemory ?? createEpisodeMemory(),
      lastError,
    );
    const handoffPath = writeHandoffPacket(root, handoffPacket);

    result.handoffPacket = handoffPacket;
    result.metadata.handoffPacketPath = handoffPath;

    console.log(`\nHandoff packet written to: ${handoffPath}`);
    console.log("\n" + formatHandoffPacket(handoffPacket));
  }

  if (result.testsPassed) {
    const postVerify = await runPostImplementVerify(root, laneResolution.lane);
    result.postVerify = postVerify;
    result.metadata.verifyCommand = postVerify.command;

    if (postVerify.ok && loadedSession.source === "active" && isActiveChangeSession(root, session.id)) {
      archiveChangeSession(root);
      result.metadata.sessionArchived = true;
    }
  }

  return result;
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
    console.log("Preflight PASSED - tests already pass, skipping the patch loop and returning to verify");
    return {
      outcome: "preflight_failed",
      iterations: 0,
      tokensUsed: 0,
      costUSD: 0,
      testsPassed: true,
    };
  }

  console.log("Preflight FAILED - ready to implement");
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

    console.log("Generating code... (placeholder)");
    const hypothesis = `Iteration ${iteration} hypothesis (placeholder)`;
    const changedFiles: string[] = [];
    const tokensUsed = 1000;
    const costUSD = 0.05;

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
        outcome: "success",
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

  lines.push("=== Implement FSM Result ===");
  lines.push("");
  lines.push(`Outcome: ${result.outcome}`);
  lines.push(`Session: ${result.sessionId}`);
  lines.push(`Lane: ${result.lane}${result.autoPromoted ? " (auto-promoted from fast request)" : ""}`);
  lines.push(`Iterations: ${result.iterations}`);
  lines.push(`Tokens used: ${result.tokensUsed}`);
  lines.push(`Cost: $${result.costUSD.toFixed(2)}`);
  lines.push(`Tests passed: ${result.testsPassed}`);
  lines.push("");
  lines.push(`Started: ${result.metadata.startedAt}`);
  lines.push(`Completed: ${result.metadata.completedAt}`);
  lines.push(`Test command: ${result.metadata.testCommand}`);
  if (result.laneReasons.length > 0) {
    lines.push(`Lane reasons: ${result.laneReasons.join("; ")}`);
  }

  if (result.metadata.stallReason) {
    lines.push("");
    lines.push(`Stall reason: ${result.metadata.stallReason}`);
  }

  if (result.metadata.handoffPacketPath) {
    lines.push("");
    lines.push(`Handoff packet: ${result.metadata.handoffPacketPath}`);
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
