import { classifyGitDiff } from "./git-diff-classifier";
import { computeLaneDecision, renderLaneDecisionText, type LaneType } from "./lane-decision";
import { listDraftSessionManifests } from "../bootstrap/draft";
import {
  generateSessionId,
  writeChangeSession,
  type ChangeSession,
  type ChangeSessionCommandHint,
  type ChangeSessionOrchestrationMode,
} from "./change-session";
import { computeImplementExitCode, runImplement, type ImplementRunResult } from "../implement/implement-runner";

export type ChangeCommandMode = ChangeSessionOrchestrationMode;

export interface ChangeCommandOptions {
  root: string;
  summary: string;
  lane?: LaneType;
  mode?: ChangeCommandMode;
  sliceId?: string;
  contextId?: string;
  baseRef?: string;
  json?: boolean;
  testCommand?: string;
  maxIterations?: number;
  maxTokens?: number;
  maxCostUSD?: number;
}

export interface ChangeCommandExecutionSummary {
  mode: ChangeCommandMode;
  state: "planned" | "awaiting_adopt" | "implemented";
  message: string;
  blockedOn?: "adopt";
  openDraftSessionId?: string;
  implement?: {
    outcome: ImplementRunResult["outcome"];
    lane: ImplementRunResult["lane"];
    requestedFast: boolean;
    autoPromoted: boolean;
    testsPassed: boolean;
    exitCode: number;
    postVerifyCommand?: string;
    postVerifyVerdict?: NonNullable<ImplementRunResult["postVerify"]>["verdict"];
    postVerifyLane?: "fast" | "strict";
    sessionArchived?: boolean;
    handoffPacketPath?: string;
  };
}

export interface ChangeCommandResult {
  session: ChangeSession;
  mode: ChangeCommandMode;
  execution: ChangeCommandExecutionSummary;
  text: string;
  exitCode: number;
}

export async function runChangeCommand(options: ChangeCommandOptions): Promise<ChangeCommandResult> {
  const {
    root,
    summary,
    lane = "auto" as any,
    mode = "prompt",
    sliceId,
    contextId,
    baseRef = "HEAD",
    json = false,
    testCommand,
    maxIterations,
    maxTokens,
    maxCostUSD,
  } = options;

  const classification = classifyGitDiff(root, baseRef);
  const laneDecision = computeLaneDecision(classification, lane);
  const nextCommands = buildNextCommandHints(root, laneDecision.lane, sliceId);
  const impactSummary = buildImpactSummary(root, sliceId);

  const session: ChangeSession = {
    id: generateSessionId(),
    createdAt: new Date().toISOString(),
    summary,
    orchestrationMode: mode,
    laneDecision,
    changedPaths: classification.changedPaths,
    sliceId,
    contextId,
    baseRef,
    nextCommands,
    impactSummary,
  };

  writeChangeSession(root, session);

  const execution = mode === "execute"
    ? await runExecuteOrchestration(root, session, {
        quiet: json,
        testCommand,
        maxIterations,
        maxTokens,
        maxCostUSD,
      })
    : buildPromptExecutionSummary();

  const result: ChangeCommandResult = {
    session,
    mode,
    execution,
    text: "",
    exitCode: execution.implement ? computeImplementExitCodeFromExecution(execution) : 0,
  };

  result.text = renderChangeCommandText(result);
  return result;
}

export function buildNextCommandHints(
  root: string,
  lane: LaneType,
  sliceId?: string,
): ChangeSessionCommandHint[] {
  const hints: ChangeSessionCommandHint[] = [];
  const openDraftSessionId = findOpenDraftSessionId(root);

  if (lane === "strict") {
    if (openDraftSessionId) {
      hints.push({
        command: `npm run jispec-cli -- adopt --interactive --session ${openDraftSessionId}`,
        description: "Adopt or defer the current bootstrap draft before implementation proceeds.",
      });
    }

    hints.push({
      command: "npm run jispec-cli -- implement",
      description: "Run the strict-lane implementation loop inside the current contract boundary.",
    });

    hints.push({
      command: "npm run verify",
      description: "Run the full post-implement verification gate.",
    });
  } else if (lane === "fast") {
    hints.push({
      command: "npm run jispec-cli -- implement --fast",
      description: "Stay on the local fast lane while the diff remains outside the contract-critical surface.",
    });

    hints.push({
      command: "npm run jispec-cli -- verify --fast",
      description: "Run the local fast-lane verify precheck before pushing.",
    });
  } else if (sliceId) {
    hints.push({
      command: `npm run jispec-cli -- change "${sliceId}" --slice ${sliceId}`,
      description: "Continue with slice-specific change workflow.",
    });
  }

  return hints;
}

function findOpenDraftSessionId(root: string): string | undefined {
  const openDraft = listDraftSessionManifests(root).find(({ manifest }) =>
    manifest.status === "drafted" || manifest.status === "adopting",
  );
  return openDraft?.manifest.sessionId;
}

function buildImpactSummary(root: string, sliceId?: string): string[] | undefined {
  if (!sliceId) {
    return undefined;
  }

  return [
    `Slice: ${sliceId}`,
    "Impact analysis not yet implemented in this version",
  ];
}

function buildPromptExecutionSummary(): ChangeCommandExecutionSummary {
  return {
    mode: "prompt",
    state: "planned",
    message: "Prompt mode selected. JiSpec recorded the change session and surfaced next commands without executing downstream steps.",
  };
}

async function runExecuteOrchestration(
  root: string,
  session: ChangeSession,
  options: {
    quiet?: boolean;
    testCommand?: string;
    maxIterations?: number;
    maxTokens?: number;
    maxCostUSD?: number;
  },
): Promise<ChangeCommandExecutionSummary> {
  const openDraftSessionId = findOpenDraftSessionId(root);
  if (session.laneDecision.lane === "strict" && openDraftSessionId) {
    return {
      mode: "execute",
      state: "awaiting_adopt",
      blockedOn: "adopt",
      openDraftSessionId,
      message: `Execute mode paused before implement because strict lane requires an explicit bootstrap adopt decision for session ${openDraftSessionId}.`,
    };
  }

  const implementResult = options.quiet
    ? await withSuppressedConsoleLogs(() =>
        runImplement({
          root,
          sessionId: session.id,
          fast: session.laneDecision.lane === "fast",
          testCommand: options.testCommand,
          maxIterations: options.maxIterations,
          maxTokens: options.maxTokens,
          maxCostUSD: options.maxCostUSD,
        }))
    : await runImplement({
        root,
        sessionId: session.id,
        fast: session.laneDecision.lane === "fast",
        testCommand: options.testCommand,
        maxIterations: options.maxIterations,
        maxTokens: options.maxTokens,
        maxCostUSD: options.maxCostUSD,
      });

  return {
    mode: "execute",
    state: "implemented",
    message: `Execute mode ran implement on the ${implementResult.lane} lane and returned control after post-implement verify.`,
    implement: {
      outcome: implementResult.outcome,
      lane: implementResult.lane,
      requestedFast: implementResult.requestedFast,
      autoPromoted: implementResult.autoPromoted,
      testsPassed: implementResult.testsPassed,
      exitCode: computeImplementExitCode(implementResult),
      postVerifyCommand: implementResult.postVerify?.command,
      postVerifyVerdict: implementResult.postVerify?.verdict,
      postVerifyLane: implementResult.postVerify?.effectiveLane,
      sessionArchived: implementResult.metadata.sessionArchived,
      handoffPacketPath: implementResult.metadata.handoffPacketPath,
    },
  };
}

function computeImplementExitCodeFromExecution(execution: ChangeCommandExecutionSummary): number {
  if (!execution.implement) {
    return 0;
  }

  return execution.implement.exitCode;
}

async function withSuppressedConsoleLogs<T>(run: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  console.log = () => {};

  try {
    return await run();
  } finally {
    console.log = originalLog;
  }
}

export function renderChangeCommandText(result: ChangeCommandResult): string {
  const { session, execution } = result;
  const lines: string[] = [];

  lines.push("=== Change Session Created ===");
  lines.push("");
  lines.push(`ID: ${session.id}`);
  lines.push(`Summary: ${session.summary}`);
  lines.push(`Mode: ${execution.mode.toUpperCase()}`);
  lines.push("");

  lines.push(renderLaneDecisionText(session.laneDecision));
  lines.push("");

  if (session.changedPaths.length > 0) {
    lines.push(`Changed paths: ${session.changedPaths.length}`);
    const byKind = new Map<string, number>();
    for (const cp of session.changedPaths) {
      byKind.set(cp.kind, (byKind.get(cp.kind) || 0) + 1);
    }
    for (const [kind, count] of byKind.entries()) {
      lines.push(`- ${kind}: ${count}`);
    }
    lines.push("");
  }

  if (session.impactSummary && session.impactSummary.length > 0) {
    lines.push("Impact:");
    for (const impact of session.impactSummary) {
      lines.push(`- ${impact}`);
    }
    lines.push("");
  }

  lines.push("Execution:");
  lines.push(`- ${execution.message}`);
  if (execution.blockedOn && execution.openDraftSessionId) {
    lines.push(`- Blocked on: ${execution.blockedOn} (${execution.openDraftSessionId})`);
  }
  if (execution.implement) {
    lines.push(`- Implement outcome: ${execution.implement.outcome}`);
    lines.push(`- Effective lane: ${execution.implement.lane}${execution.implement.autoPromoted ? " (auto-promoted)" : ""}`);
    if (execution.implement.postVerifyVerdict) {
      lines.push(`- Post-implement verify: ${execution.implement.postVerifyVerdict} via ${execution.implement.postVerifyCommand}`);
    }
    if (execution.implement.sessionArchived) {
      lines.push("- Change session archived after successful execute-mode handoff.");
    }
    if (execution.implement.handoffPacketPath) {
      lines.push(`- Handoff packet: ${execution.implement.handoffPacketPath}`);
    }
  }
  lines.push("");

  if (session.nextCommands.length > 0) {
    lines.push("Next:");
    for (const hint of session.nextCommands) {
      lines.push(`- ${hint.command}`);
      lines.push(`  ${hint.description}`);
    }
  }

  return lines.join("\n");
}

export function renderChangeCommandJSON(result: ChangeCommandResult): string {
  return JSON.stringify({
    ...result.session,
    mode: result.mode,
    execution: result.execution,
    exitCode: result.exitCode,
  }, null, 2);
}
