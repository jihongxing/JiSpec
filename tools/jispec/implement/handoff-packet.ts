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

export interface HandoffPacket {
  sessionId: string;
  changeIntent: string;
  outcome: "budget_exhausted" | "stall_detected" | "external_patch_received";
  iterations: number;
  tokensUsed: number;
  costUSD: number;
  contractContext: ImplementContractContext;

  summary: {
    whatWorked: string[];
    whatFailed: string[];
    lastError: string;
    stallReason?: string;
  };

  nextSteps: {
    suggestedActions: string[];
    filesNeedingAttention: string[];
    testCommand: string;
    verifyCommand: string;
    verifyRecommendation: string;
  };

  episodeMemory: {
    attemptedHypotheses: string[];
    rejectedPaths: string[];
  };

  metadata: {
    createdAt: string;
    startedAt: string;
    completedAt: string;
  };
}

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
  const verifyCommand = buildVerifyCommandForLane(result.lane);
  const verifyRecommendation =
    result.lane === "fast"
      ? "Run the local fast-lane verify precheck next. It may still auto-promote to strict if the diff now hits contract-critical files."
      : "Run the full verify gate next so contract, bootstrap, and policy checks are all re-evaluated together.";

  return {
    sessionId: result.sessionId,
    changeIntent: session.summary,
    outcome: result.outcome as "budget_exhausted" | "stall_detected" | "external_patch_received",
    iterations: result.iterations,
    tokensUsed: result.tokensUsed,
    costUSD: result.costUSD,
    contractContext,

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
      testCommand: result.metadata.testCommand,
      verifyCommand,
      verifyRecommendation,
    },

    episodeMemory: {
      attemptedHypotheses: getRecentHypotheses(episodeMemory, 10),
      rejectedPaths: getRejectedPaths(episodeMemory),
    },

    metadata: {
      createdAt: new Date().toISOString(),
      startedAt: result.metadata.startedAt,
      completedAt: result.metadata.completedAt,
    },
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

  // Metadata
  lines.push("=== Metadata ===");
  lines.push(`Created: ${packet.metadata.createdAt}`);
  lines.push(`Started: ${packet.metadata.startedAt}`);
  lines.push(`Completed: ${packet.metadata.completedAt}`);

  return lines.join("\n");
}
