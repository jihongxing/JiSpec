import fs from "node:fs";
import path from "node:path";
import { listHandoffPackets, type HandoffPacket } from "../implement/handoff-packet";

export type MainlineFlowState =
  | "idle"
  | "continue_active_session"
  | "resume_from_handoff"
  | "resume_patch_mediation"
  | "stale_artifact"
  | "malformed_session";

export interface MainlineFlowRecovery {
  state: MainlineFlowState;
  status: "pass" | "fail";
  summary: string;
  details: string[];
  ownerAction?: string;
  nextCommand?: string;
  sourceArtifacts: string[];
  sessionId?: string;
}

interface ChangeSessionRecord {
  id?: unknown;
  summary?: unknown;
  orchestrationMode?: unknown;
  laneDecision?: {
    lane?: unknown;
    reasons?: unknown;
    autoPromoted?: unknown;
  };
  changedPaths?: Array<{ path?: unknown; kind?: unknown }>;
  nextCommands?: Array<{ command?: unknown; description?: unknown }>;
  impactSummary?: {
    freshness?: {
      status?: unknown;
      path?: unknown;
      reason?: unknown;
    };
    nextReplayCommand?: unknown;
    artifacts?: Record<string, unknown>;
    missingVerificationHints?: unknown;
  };
}

interface PatchMediationRecord {
  status?: unknown;
  externalPatchPath?: unknown;
  replay?: {
    commands?: {
      retryWithExternalPatch?: unknown;
      inspectHandoff?: unknown;
    };
    nextHumanAction?: unknown;
  };
  completedAt?: unknown;
}

export function diagnoseMainlineFlow(root: string): MainlineFlowRecovery {
  const activeSessionPath = path.join(root, ".jispec", "change-session.json");
  const activeSession = readJsonRecord<ChangeSessionRecord>(activeSessionPath);

  if (activeSession === "malformed") {
    return {
      state: "malformed_session",
      status: "fail",
      summary: "Active change session is malformed.",
      details: [
        "The active .jispec/change-session.json could not be parsed into a stable recovery packet.",
        "Repair or regenerate the session before continuing mainline work.",
      ],
      ownerAction: "Repair or regenerate the active change session JSON.",
      nextCommand: "npm run jispec-cli -- change \"<summary>\" --json",
      sourceArtifacts: [".jispec/change-session.json"],
    };
  }

  if (activeSession && typeof activeSession.id === "string" && activeSession.id.trim()) {
    return diagnoseActiveSession(root, activeSessionPath, activeSession.id, activeSession);
  }

  return diagnoseReplayOnlyState(root);
}

function diagnoseActiveSession(
  root: string,
  activeSessionPath: string,
  sessionId: string,
  session: ChangeSessionRecord,
): MainlineFlowRecovery {
  const sourceArtifacts = new Set<string>([normalizePath(activeSessionPath, root), ".jispec/change-session.json"]);
  const nextCommands = session.nextCommands?.filter((entry): entry is { command: string; description?: string } => typeof entry?.command === "string" && entry.command.trim().length > 0) ?? [];
  const impactSummary = session.impactSummary;

  const freshness = impactSummary?.freshness?.status;
  if (freshness === "stale") {
    const freshnessPath = stringValue(impactSummary?.freshness?.path);
    if (freshnessPath) {
      sourceArtifacts.add(freshnessPath);
    }
    return {
      state: "stale_artifact",
      status: "fail",
      summary: "Active change session has stale recovery artifacts.",
      details: [
        `Session ${sessionId} is blocked by a stale artifact freshness state.`,
        `Stale reason: ${stringValue(impactSummary?.freshness?.reason) ?? "not_available_yet"}`,
        `Next replay command: ${stringValue(impactSummary?.nextReplayCommand) ?? "not_available_yet"}`,
      ],
      ownerAction: "Refresh the stale artifact before resuming the change session.",
      nextCommand: stringValue(impactSummary?.nextReplayCommand) ?? "npm run jispec-cli -- change \"<summary>\" --json",
      sourceArtifacts: Array.from(sourceArtifacts),
      sessionId,
    };
  }

  const patchMediationPath = path.join(root, ".jispec", "implement", sessionId, "patch-mediation.json");
  const patchMediation = readJsonRecord<PatchMediationRecord>(patchMediationPath);
  if (patchMediation && patchMediation !== "malformed") {
    sourceArtifacts.add(normalizePath(patchMediationPath, root));
    const status = stringValue(patchMediation.status);
    if (status === "apply_failed" || status === "rejected_out_of_scope") {
      return {
        state: "resume_patch_mediation",
        status: "fail",
        summary: "Active implementation mediation needs patch recovery.",
        details: [
          `Patch mediation status: ${status}`,
          `External patch: ${stringValue(patchMediation.externalPatchPath) ?? "not_available_yet"}`,
          `Recovery command: ${stringValue(patchMediation.replay?.commands?.retryWithExternalPatch) ?? "not_available_yet"}`,
        ],
        ownerAction: "Refresh or rescope the external patch, then replay implementation mediation.",
        nextCommand: stringValue(patchMediation.replay?.commands?.retryWithExternalPatch) ?? `npm run jispec-cli -- implement --session-id ${sessionId} --external-patch <path>`,
        sourceArtifacts: Array.from(sourceArtifacts),
        sessionId,
      };
    }
  }

  const handoffPath = path.join(root, ".jispec", "handoff", `${sessionId}.json`);
  const handoff = readHandoffPacketSafe(root, handoffPath);
  if (handoff && handoff.replay?.replayable) {
    sourceArtifacts.add(normalizePath(handoffPath, root));
    return {
      state: "resume_from_handoff",
      status: "pass",
      summary: "Replayable handoff is available for restore.",
      details: [
        `Handoff session: ${handoff.sessionId}`,
        `Previous outcome: ${handoff.replay.previousAttempt.outcome}`,
        `Previous stop point: ${handoff.replay.previousAttempt.stopPoint}`,
        `Previous failed check: ${handoff.replay.previousAttempt.failedCheck}`,
      ],
      ownerAction: "Restore the replayable handoff and continue from the recorded stop point.",
      nextCommand: handoff.replay.commands.restore,
      sourceArtifacts: Array.from(sourceArtifacts),
      sessionId,
    };
  }

  if (nextCommands.length > 0) {
    const nextCommand = nextCommands[0].command;
    return {
      state: "continue_active_session",
      status: "pass",
      summary: "Active change session has a direct continuation path.",
      details: [
        `Session ${sessionId} is on the ${session?.laneDecision?.lane ?? "unknown"} lane.`,
        `Orchestration mode: ${stringValue(session.orchestrationMode) ?? "not_available_yet"}`,
        `Next command count: ${nextCommands.length}`,
      ],
      ownerAction: "Follow the current session's next command.",
      nextCommand,
      sourceArtifacts: Array.from(sourceArtifacts),
      sessionId,
    };
  }

  return {
    state: "malformed_session",
    status: "fail",
    summary: "Active change session has no usable recovery command.",
    details: [
      `Session ${sessionId} did not expose nextCommands, a replayable handoff, or a recoverable patch mediation record.`,
      "The mainline cannot infer a safe continuation path from the current session metadata.",
    ],
    ownerAction: "Repair the session metadata so recovery commands are explicit again.",
    nextCommand: "npm run jispec-cli -- change \"<summary>\" --json",
    sourceArtifacts: Array.from(sourceArtifacts),
    sessionId,
  };
}

function diagnoseReplayOnlyState(root: string): MainlineFlowRecovery {
  const packets = listHandoffPackets(root);
  const latestPacket = selectLatestReplayablePacket(root, packets);

  if (latestPacket) {
    return {
      state: "resume_from_handoff",
      status: "pass",
      summary: "Replayable handoff is available even though no active change session is present.",
      details: [
        `Latest replayable handoff: ${latestPacket.sessionId}`,
        `Previous outcome: ${latestPacket.replay.previousAttempt.outcome}`,
        `Previous stop point: ${latestPacket.replay.previousAttempt.stopPoint}`,
      ],
      ownerAction: "Restore the replayable handoff and continue the recorded implementation path.",
      nextCommand: latestPacket.replay.commands.restore,
      sourceArtifacts: [normalizePath(path.join(root, ".jispec", "handoff", `${latestPacket.sessionId}.json`), root)],
      sessionId: latestPacket.sessionId,
    };
  }

  return {
    state: "idle",
    status: "pass",
    summary: "No active mainline interruption was found.",
    details: [
      "No active .jispec/change-session.json is present.",
      "No replayable handoff packet was found under .jispec/handoff.",
    ],
    sourceArtifacts: [".jispec/change-session.json", ".jispec/handoff/"],
  };
}

function selectLatestReplayablePacket(root: string, sessionIds: string[]): HandoffPacket | null {
  const packets = sessionIds
    .map((sessionId) => readHandoffPacketSafe(root, path.join(root, ".jispec", "handoff", `${sessionId}.json`)))
    .filter((packet): packet is HandoffPacket => Boolean(packet && packet.replay?.replayable));

  if (packets.length === 0) {
    return null;
  }

  return packets.sort((left, right) => {
    const leftKey = left.metadata?.createdAt ?? left.sessionId;
    const rightKey = right.metadata?.createdAt ?? right.sessionId;
    return leftKey.localeCompare(rightKey);
  })[packets.length - 1] ?? null;
}

function readHandoffPacketSafe(root: string, filePath: string): HandoffPacket | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as HandoffPacket;
  } catch {
    return null;
  }
}

function readJsonRecord<T>(filePath: string): T | "malformed" | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return isRecord(parsed) ? (parsed as T) : "malformed";
  } catch {
    return "malformed";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizePath(value: string, root: string): string {
  const relative = path.relative(root, value).replace(/\\/g, "/");
  return relative || path.basename(value);
}
