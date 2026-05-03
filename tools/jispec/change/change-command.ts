import path from "node:path";
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
import { draftSpecDelta, isSpecDeltaChangeType, type SpecDeltaChangeType } from "./spec-delta";
import { resolveChangeCommandMode, type ChangeDefaultModeResolution } from "./orchestration-config";
import { summarizeChangeImpact, type ChangeImpactSummary } from "./impact-summary";
import { renderHumanDecisionSnapshot } from "../human-decision-packet";

export type ChangeCommandMode = ChangeSessionOrchestrationMode;

export interface ChangeCommandOptions {
  root: string;
  summary: string;
  lane?: LaneType;
  mode?: ChangeCommandMode;
  sliceId?: string;
  contextId?: string;
  changeType?: SpecDeltaChangeType;
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
  boundary: ChangeExecutionBoundary;
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
    decisionState?: NonNullable<ImplementRunResult["decisionPacket"]>["state"];
    decisionStopPoint?: NonNullable<ImplementRunResult["decisionPacket"]>["stopPoint"];
    decisionNextAction?: string;
    decisionNextActionOwner?: NonNullable<ImplementRunResult["decisionPacket"]>["executionStatus"]["nextActionOwner"];
    decisionNextActionType?: NonNullable<ImplementRunResult["decisionPacket"]>["nextActionDetail"]["type"];
    decisionFailedCheck?: NonNullable<ImplementRunResult["decisionPacket"]>["nextActionDetail"]["failedCheck"];
    decisionNextCommand?: string;
    decisionExternalHandoffRequest?: string;
    decisionChecks?: NonNullable<ImplementRunResult["decisionPacket"]>["executionStatus"];
    implementationBoundaryNote?: string;
    mergeable?: boolean;
  };
}

export interface ChangeExecutionBoundary {
  modeSource: ChangeDefaultModeResolution["source"];
  promptModeRecordsOnly: true;
  executeModeRunsMediationAndVerify: true;
  explicitCliModeOverridesProjectDefault: boolean;
  projectDefaultAppliesOnlyWhenModeOmitted: true;
  businessCodeGeneratedByJiSpec: false;
  adoptBoundary: {
    enforced: boolean;
    status: "not_applicable" | "clear" | "paused_open_bootstrap_draft";
    openDraftSessionId?: string;
    nextAction?: string;
  };
}

export interface ChangeCommandResult {
  session: ChangeSession;
  mode: ChangeCommandMode;
  execution: ChangeCommandExecutionSummary;
  text: string;
  exitCode: number;
  modeResolution: ChangeDefaultModeResolution;
}

export async function runChangeCommand(options: ChangeCommandOptions): Promise<ChangeCommandResult> {
  const {
    root,
    summary,
    lane = "auto" as any,
    mode,
    sliceId,
    contextId,
    changeType,
    baseRef = "HEAD",
    json = false,
    testCommand,
    maxIterations,
    maxTokens,
    maxCostUSD,
  } = options;

  if (changeType !== undefined && !isSpecDeltaChangeType(changeType)) {
    throw new Error(`Invalid change type: ${changeType}. Expected add, modify, deprecate, fix, or redesign.`);
  }

  const classification = classifyGitDiff(root, baseRef);
  const modeResolution = resolveChangeCommandMode(root, mode);
  if (modeResolution.warnings.length > 0) {
    throw new Error(`Invalid change default mode configuration: ${modeResolution.warnings.join("; ")}`);
  }
  const effectiveMode = modeResolution.mode;
  const laneDecision = computeLaneDecision(classification, lane);
  const nextCommands = buildNextCommandHints(root, laneDecision.lane, sliceId);
  const createdAt = new Date().toISOString();
  const sessionId = generateSessionId();
  const specDelta = draftSpecDelta({
    root,
    summary,
    changeType,
    createdAt,
    sliceId,
    contextId,
    changedPaths: classification.changedPaths,
  });
  if (specDelta) {
    if (specDelta.sourceEvolutionSummaryPath) {
      nextCommands.unshift({
        command: `Review .spec/deltas/${specDelta.changeId}/source-evolution.md`,
        description: "Review the source evolution diff generated from the active source snapshot and current workspace docs.",
      });
    }
    nextCommands.unshift({
      command: `Review .spec/deltas/${specDelta.changeId}/delta.yaml`,
      description: "Review the proposed Spec Delta before adopting it into the active baseline.",
    });
    nextCommands.unshift({
      command: `Review .spec/deltas/${specDelta.changeId}/verify-focus.yaml`,
      description: "Review the focused verification scope generated from the Greenfield Evidence Graph.",
    });
    nextCommands.unshift({
      command: `Review .spec/deltas/${specDelta.changeId}/ai-implement-handoff.md`,
      description: "Review the change-scoped AI implementation handoff before assigning an implementer.",
    });
  }
  const impactSummary = buildImpactSummary(root, classification.changedPaths, sessionId, sliceId, specDelta);

  const session: ChangeSession = {
    id: sessionId,
    createdAt,
    summary,
    orchestrationMode: effectiveMode,
    laneDecision,
    changedPaths: classification.changedPaths,
    changeType,
    specDelta,
    sliceId,
    contextId,
    baseRef,
    nextCommands,
    impactSummary,
  };

  writeChangeSession(root, session);

  const execution = effectiveMode === "execute"
    ? await runExecuteOrchestration(root, session, {
        modeResolution,
        quiet: json,
        testCommand,
        maxIterations,
        maxTokens,
        maxCostUSD,
      })
    : buildPromptExecutionSummary(modeResolution);

  const result: ChangeCommandResult = {
    session,
    mode: effectiveMode,
    execution,
    text: "",
    exitCode: execution.implement ? computeImplementExitCodeFromExecution(execution) : 0,
    modeResolution,
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
      description: "Run strict-lane implementation mediation inside the current contract boundary.",
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

function buildImpactSummary(
  root: string,
  changedPaths: Array<{ path: string; kind: string }>,
  changeId: string,
  sliceId?: string,
  specDelta?: ReturnType<typeof draftSpecDelta>,
): ChangeImpactSummary | undefined {
  if (specDelta) {
    return {
      ...specDelta.impactSummary,
      changedFiles: stableUnique([
        ...specDelta.impactSummary.changedFiles,
        ...changedPaths.map((entry) => entry.path),
      ]),
      changedKinds: { ...specDelta.impactSummary.changedKinds },
      contractRefs: stableUnique([
        ...specDelta.impactSummary.contractRefs,
        ...specDelta.references.contracts,
      ]),
      testRefs: stableUnique([
        ...specDelta.impactSummary.testRefs,
        ...specDelta.references.tests,
      ]),
      scopeHints: stableUnique([
        ...specDelta.impactSummary.scopeHints,
        ...changedPathScopeHints(changedPaths, sliceId),
      ]),
      impactedContracts: stableUnique([
        ...specDelta.impactSummary.impactedContracts,
        ...specDelta.references.contracts,
      ]),
      impactedFiles: stableUnique([
        ...specDelta.impactSummary.impactedFiles,
        ...changedPaths.map((entry) => entry.path),
      ]),
    };
  }

  return summarizeChangeImpact({
    root,
    changeId,
    changedPaths,
    summary: sliceId ? `Slice ${sliceId}` : undefined,
    sliceId,
    scopeHints: changedPathScopeHints(changedPaths, sliceId),
  });
}

function changedPathScopeHints(
  changedPaths: Array<{ path: string; kind: string }>,
  sliceId?: string,
): string[] {
  const hints: string[] = [];
  const kinds = new Set(changedPaths.map((entry) => entry.kind));

  if (kinds.has("contract") || kinds.has("api_surface") || kinds.has("behavior_surface") || kinds.has("domain_core")) {
    hints.push("contract-sensitive change");
  }
  if (kinds.size === 1 && kinds.has("docs_only")) {
    hints.push("docs-only change");
  }
  if (kinds.size === 1 && kinds.has("test_only")) {
    hints.push("test-only change");
  }
  if (kinds.has("config")) {
    hints.push("config-sensitive change");
  }
  if (sliceId) {
    hints.push(`slice ${sliceId}`);
  }
  return hints;
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function relativePath(root: string, target: string): string {
  return path.relative(root, target).replace(/\\/g, "/");
}

function buildPromptExecutionSummary(modeResolution: ChangeDefaultModeResolution): ChangeCommandExecutionSummary {
  return {
    mode: "prompt",
    state: "planned",
    message: "Prompt mode selected. JiSpec recorded the change session and surfaced next commands without executing downstream steps.",
    boundary: buildChangeExecutionBoundary(modeResolution, "prompt", "fast"),
  };
}

async function runExecuteOrchestration(
  root: string,
  session: ChangeSession,
  options: {
    modeResolution: ChangeDefaultModeResolution;
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
      boundary: buildChangeExecutionBoundary(options.modeResolution, "execute", session.laneDecision.lane, openDraftSessionId),
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
    boundary: buildChangeExecutionBoundary(options.modeResolution, "execute", session.laneDecision.lane),
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
      decisionState: implementResult.decisionPacket?.state,
      decisionStopPoint: implementResult.decisionPacket?.stopPoint,
      decisionNextAction: implementResult.decisionPacket?.nextAction,
      decisionNextActionOwner: implementResult.decisionPacket?.executionStatus.nextActionOwner,
      decisionNextActionType: implementResult.decisionPacket?.nextActionDetail.type,
      decisionFailedCheck: implementResult.decisionPacket?.nextActionDetail.failedCheck,
      decisionNextCommand: implementResult.decisionPacket?.nextActionDetail.command,
      decisionExternalHandoffRequest: implementResult.decisionPacket?.nextActionDetail.externalToolHandoff?.request,
      decisionChecks: implementResult.decisionPacket?.executionStatus,
      implementationBoundaryNote: implementResult.decisionPacket?.implementationBoundary.note,
      mergeable: implementResult.decisionPacket?.mergeable,
    },
  };
}

function buildChangeExecutionBoundary(
  modeResolution: ChangeDefaultModeResolution,
  mode: ChangeCommandMode,
  lane: LaneType,
  openDraftSessionId?: string,
): ChangeExecutionBoundary {
  const executeMode = mode === "execute";
  const strictLane = lane === "strict";
  const pausedAtAdopt = executeMode && strictLane && Boolean(openDraftSessionId);
  const adoptStatus: ChangeExecutionBoundary["adoptBoundary"]["status"] = pausedAtAdopt
    ? "paused_open_bootstrap_draft"
    : executeMode && strictLane
      ? "clear"
      : "not_applicable";

  return {
    modeSource: modeResolution.source,
    promptModeRecordsOnly: true,
    executeModeRunsMediationAndVerify: true,
    explicitCliModeOverridesProjectDefault: modeResolution.source === "cli",
    projectDefaultAppliesOnlyWhenModeOmitted: true,
    businessCodeGeneratedByJiSpec: false,
    adoptBoundary: {
      enforced: executeMode && strictLane,
      status: adoptStatus,
      openDraftSessionId,
      nextAction: pausedAtAdopt
        ? `npm run jispec-cli -- adopt --interactive --session ${openDraftSessionId}`
        : undefined,
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
  lines.push(`Mode source: ${result.modeResolution.source}`);
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

  const impactSummary = session.impactSummary;
  if (impactSummary) {
    lines.push("Impact:");
    lines.push(`- Impact graph: ${impactSummary.artifacts.impactGraphPath}`);
    lines.push(`- Impact report: ${impactSummary.artifacts.impactReportPath}`);
    lines.push(`- Verify focus: ${impactSummary.artifacts.verifyFocusPath}`);
    lines.push(`- Impact graph freshness: ${impactSummary.freshness.status}`);
    lines.push(`- Changed files: ${impactSummary.changedFiles.length}`);
    if (impactSummary.changedFiles.length > 0) {
      lines.push(`- Changed file sample: ${impactSummary.changedFiles.slice(0, 4).join(", ")}`);
    }
    lines.push(`- Contract refs: ${impactSummary.contractRefs.length}`);
    if (impactSummary.contractRefs.length > 0) {
      lines.push(`- Contract sample: ${impactSummary.contractRefs.slice(0, 4).join(", ")}`);
    }
    lines.push(`- Scope hints: ${impactSummary.scopeHints.length}`);
    if (impactSummary.scopeHints.length > 0) {
      lines.push(`- Scope sample: ${impactSummary.scopeHints.slice(0, 4).join("; ")}`);
    }
    lines.push(`- Impacted contracts: ${impactSummary.impactedContracts.length}`);
    lines.push(`- Impacted files: ${impactSummary.impactedFiles.length}`);
    lines.push(`- Advisory only: ${impactSummary.advisoryOnly}`);
    lines.push(`- Next replay command: ${impactSummary.nextReplayCommand}`);
    lines.push("");
  }

  lines.push(...renderHumanDecisionSnapshot(buildChangeDecisionSnapshot(result)));

  if (session.specDelta) {
    lines.push("Spec Delta:");
    lines.push(`- Change ID: ${session.specDelta.changeId}`);
    lines.push(`- Delta: ${session.specDelta.deltaPath}`);
    lines.push(`- Dirty report: ${session.specDelta.dirtyReportPath}`);
    lines.push(`- AI handoff: ${session.specDelta.handoffPath}`);
    lines.push(`- Adoption record: ${session.specDelta.adoptionRecordPath}`);
    lines.push("- Active baseline remains unchanged until explicit adoption.");
    lines.push("");
  }

  lines.push("Execution:");
  lines.push(`- ${execution.message}`);
  lines.push(`- Mode boundary: prompt records the session only; execute runs implementation mediation followed by verify.`);
  lines.push(`- Mode source: ${execution.boundary.modeSource}`);
  lines.push(`- Explicit CLI mode overrides project default: ${execution.boundary.explicitCliModeOverridesProjectDefault}`);
  lines.push(`- Project default applies only when --mode is omitted: ${execution.boundary.projectDefaultAppliesOnlyWhenModeOmitted}`);
  lines.push(`- Adopt boundary: ${execution.boundary.adoptBoundary.status}`);
  if (execution.boundary.adoptBoundary.nextAction) {
    lines.push(`- Adopt next action: ${execution.boundary.adoptBoundary.nextAction}`);
  }
  lines.push(`- Business code generated by JiSpec: ${execution.boundary.businessCodeGeneratedByJiSpec}`);
  if (execution.blockedOn && execution.openDraftSessionId) {
    lines.push(`- Blocked on: ${execution.blockedOn} (${execution.openDraftSessionId})`);
  }
  if (execution.implement) {
    lines.push(`- Implement outcome: ${execution.implement.outcome}`);
    lines.push(`- Effective lane: ${execution.implement.lane}${execution.implement.autoPromoted ? " (auto-promoted)" : ""}`);
    if (execution.implement.decisionState) {
      lines.push(`- Decision state: ${execution.implement.decisionState}`);
    }
    if (execution.implement.decisionStopPoint) {
      lines.push(`- Stopped at: ${execution.implement.decisionStopPoint}`);
    }
    if (execution.implement.decisionNextAction) {
      lines.push(`- Next action: ${execution.implement.decisionNextAction}`);
    }
    if (execution.implement.decisionNextActionOwner) {
      lines.push(`- Next action owner: ${execution.implement.decisionNextActionOwner}`);
    }
    if (execution.implement.decisionNextActionType) {
      lines.push(`- Next action type: ${execution.implement.decisionNextActionType}`);
    }
    if (execution.implement.decisionFailedCheck) {
      lines.push(`- Failed check: ${execution.implement.decisionFailedCheck}`);
    }
    if (execution.implement.decisionNextCommand) {
      lines.push(`- Next command: ${execution.implement.decisionNextCommand}`);
    }
    if (execution.implement.decisionExternalHandoffRequest) {
      lines.push(`- External handoff: ${execution.implement.decisionExternalHandoffRequest}`);
    }
    if (execution.implement.decisionChecks) {
      lines.push(
        `- Checks: scope=${execution.implement.decisionChecks.scopeCheck}, patch=${execution.implement.decisionChecks.patchApply}, test=${execution.implement.decisionChecks.tests}, verify=${execution.implement.decisionChecks.verify}`,
      );
    }
    if (typeof execution.implement.mergeable === "boolean") {
      lines.push(`- Mergeable: ${execution.implement.mergeable}`);
    }
    if (execution.implement.implementationBoundaryNote) {
      lines.push(`- JiSpec role: ${execution.implement.implementationBoundaryNote}`);
    }
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

function buildChangeDecisionSnapshot(result: ChangeCommandResult) {
  const impactSummary = result.session.impactSummary;
  const execution = result.execution;
  const nextCommand =
    execution.implement?.decisionNextCommand ??
    execution.implement?.postVerifyCommand ??
    result.session.nextCommands[0]?.command ??
    "npm run jispec-cli -- verify";

  return {
    currentState:
      execution.state === "implemented"
        ? "change session implemented and returned to verify"
        : execution.state === "awaiting_adopt"
          ? `execute mode paused for adopt session ${execution.openDraftSessionId ?? "unknown"}`
          : "change session recorded and awaiting downstream mediation",
    risk: impactSummary
      ? [
          `impact freshness ${impactSummary.freshness.status}`,
          ...impactSummary.missingVerificationHints.slice(0, 2),
        ].join("; ")
      : "impact summary unavailable",
    evidence: [
      `changed paths: ${result.session.changedPaths.length}`,
      impactSummary ? `contracts: ${impactSummary.contractRefs.length}` : "contracts: 0",
      impactSummary ? `verify focus: ${impactSummary.artifacts.verifyFocusPath}` : "verify focus unavailable",
    ],
    owner:
      execution.implement?.decisionNextActionOwner ??
      (execution.state === "planned" ? "human_or_external_tool" : "reviewer"),
    nextCommand,
  };
}

export function renderChangeCommandJSON(result: ChangeCommandResult): string {
  return JSON.stringify({
    ...result.session,
    mode: result.mode,
    modeResolution: result.modeResolution,
    execution: result.execution,
    exitCode: result.exitCode,
  }, null, 2);
}
