import fs from "node:fs";
import path from "node:path";
import {
  diagnoseMainlineFlow,
  type MainlineFlowRecovery,
  type MainlineFlowState,
} from "./mainline-flow";

export type MainlineRecoveryDrillStatus = "ready" | "blocked" | "idle";

export interface MainlineRecoveryDrillStep {
  order: number;
  id: string;
  currentState: MainlineFlowState;
  sourceArtifact: string;
  ownerAction: string;
  command: string;
  expectedNextState: string;
  verificationCommand: string;
  risk: "low" | "medium" | "high";
  evidenceArtifacts: string[];
}

export interface MainlineRecoveryDrillPacket {
  schemaVersion: 1;
  kind: "jispec-mainline-recovery-drill";
  generatedAt: string;
  root: string;
  status: MainlineRecoveryDrillStatus;
  summary: string;
  boundary: {
    localOnly: true;
    sourceUploadRequired: false;
    executesCommands: false;
    writesOnlyDeclaredArtifacts: true;
    replacesVerify: false;
    replacesDoctorMainline: false;
  };
  sourceDiagnosis: MainlineFlowRecovery;
  steps: MainlineRecoveryDrillStep[];
}

export interface MainlineRecoveryDrillWriteResult {
  root: string;
  jsonPath: string;
  markdownPath: string;
  drill: MainlineRecoveryDrillPacket;
}

const DEFAULT_DRILL_JSON_PATH = ".jispec/recovery/mainline-drill.json";

export function buildMainlineRecoveryDrill(rootInput: string): MainlineRecoveryDrillPacket {
  const root = path.resolve(rootInput);
  const diagnosis = diagnoseMainlineFlow(root);
  const steps = buildDrillSteps(diagnosis);
  const status: MainlineRecoveryDrillStatus = steps.length === 0
    ? "idle"
    : diagnosis.status === "fail"
      ? "blocked"
      : "ready";

  return {
    schemaVersion: 1,
    kind: "jispec-mainline-recovery-drill",
    generatedAt: new Date().toISOString(),
    root: normalizePath(root),
    status,
    summary: buildDrillSummary(diagnosis, steps),
    boundary: {
      localOnly: true,
      sourceUploadRequired: false,
      executesCommands: false,
      writesOnlyDeclaredArtifacts: true,
      replacesVerify: false,
      replacesDoctorMainline: false,
    },
    sourceDiagnosis: diagnosis,
    steps,
  };
}

export function writeMainlineRecoveryDrill(
  rootInput: string,
  outPath: string = DEFAULT_DRILL_JSON_PATH,
): MainlineRecoveryDrillWriteResult {
  const root = path.resolve(rootInput);
  const jsonPath = path.resolve(root, outPath);
  const markdownPath = jsonPath.replace(/\.json$/i, ".md");
  const drill = buildMainlineRecoveryDrill(root);

  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(drill, null, 2)}\n`, "utf-8");
  fs.writeFileSync(markdownPath, renderMainlineRecoveryDrillMarkdown(drill), "utf-8");

  return {
    root: normalizePath(root),
    jsonPath: normalizePath(path.relative(root, jsonPath)),
    markdownPath: normalizePath(path.relative(root, markdownPath)),
    drill,
  };
}

export function renderMainlineRecoveryDrillMarkdown(drill: MainlineRecoveryDrillPacket): string {
  const lines = [
    "# JiSpec Mainline Recovery Drill",
    "",
    "Human companion only. The machine source of truth is `.jispec/recovery/mainline-drill.json`.",
    "",
    `Generated at: ${drill.generatedAt}`,
    `Status: ${drill.status}`,
    `Summary: ${drill.summary}`,
    "",
    "## Boundary",
    "",
    "- Local only.",
    "- Does not upload source.",
    "- Does not execute commands.",
    "- Does not replace verify or doctor mainline.",
    "",
    "## Source Diagnosis",
    "",
    `- State: ${drill.sourceDiagnosis.state}`,
    `- Status: ${drill.sourceDiagnosis.status}`,
    `- Summary: ${drill.sourceDiagnosis.summary}`,
    `- Source artifacts: ${formatList(drill.sourceDiagnosis.sourceArtifacts)}`,
    "",
    "## Drill Steps",
    "",
  ];

  if (drill.steps.length === 0) {
    lines.push("No recovery drill steps are required.");
    lines.push("");
    return lines.join("\n");
  }

  for (const step of drill.steps) {
    lines.push(`### ${step.order}. ${step.currentState}`);
    lines.push("");
    lines.push(`- Source artifact: ${step.sourceArtifact}`);
    lines.push(`- Owner action: ${step.ownerAction}`);
    lines.push(`- Command: \`${step.command}\``);
    lines.push(`- Expected next state: ${step.expectedNextState}`);
    lines.push(`- Verification command: \`${step.verificationCommand}\``);
    lines.push(`- Risk: ${step.risk}`);
    lines.push("");
  }

  return lines.join("\n");
}

function buildDrillSteps(diagnosis: MainlineFlowRecovery): MainlineRecoveryDrillStep[] {
  if (diagnosis.state === "idle") {
    return [];
  }

  return [{
    order: 1,
    id: `mainline-recovery:${diagnosis.state}:${diagnosis.sessionId ?? "no-session"}`,
    currentState: diagnosis.state,
    sourceArtifact: primarySourceArtifact(diagnosis),
    ownerAction: diagnosis.ownerAction ?? ownerActionForState(diagnosis.state),
    command: diagnosis.nextCommand ?? commandForState(diagnosis.state),
    expectedNextState: expectedNextStateForDiagnosis(diagnosis),
    verificationCommand: verificationCommandForState(diagnosis.state),
    risk: riskForDiagnosis(diagnosis),
    evidenceArtifacts: diagnosis.sourceArtifacts,
  }];
}

function buildDrillSummary(
  diagnosis: MainlineFlowRecovery,
  steps: MainlineRecoveryDrillStep[],
): string {
  if (steps.length === 0) {
    return "No active mainline interruption was found; no recovery drill is required.";
  }
  return `${steps.length} recovery drill step(s) generated for ${diagnosis.state}; each step includes a command, expected next state, and verification command.`;
}

function primarySourceArtifact(diagnosis: MainlineFlowRecovery): string {
  return diagnosis.sourceArtifacts[0] ?? ".jispec/change-session.json";
}

function ownerActionForState(state: MainlineFlowState): string {
  if (state === "continue_active_session") {
    return "Continue the active session from its declared next command.";
  }
  if (state === "resume_from_handoff") {
    return "Restore the replayable handoff and continue from its recorded stop point.";
  }
  if (state === "resume_patch_mediation") {
    return "Refresh the external patch and replay patch mediation.";
  }
  if (state === "stale_artifact") {
    return "Refresh stale impact artifacts before continuing.";
  }
  if (state === "malformed_session") {
    return "Regenerate or repair the active change session.";
  }
  return "No owner action required.";
}

function commandForState(state: MainlineFlowState): string {
  if (state === "resume_from_handoff") {
    return "npm run jispec-cli -- implement --from-handoff .jispec/handoff/<session-id>.json";
  }
  if (state === "resume_patch_mediation") {
    return "npm run jispec-cli -- implement --from-handoff .jispec/handoff/<session-id>.json --external-patch <path>";
  }
  if (state === "stale_artifact" || state === "malformed_session") {
    return "npm run jispec-cli -- change \"<summary>\" --json";
  }
  return "npm run jispec-cli -- doctor mainline";
}

function expectedNextStateForDiagnosis(diagnosis: MainlineFlowRecovery): string {
  if (diagnosis.state === "continue_active_session") {
    return "The active session either reaches verify, writes a handoff packet, or reports a fresh mainline blocker.";
  }
  if (diagnosis.state === "resume_from_handoff") {
    return "The replayed handoff restores implementation context and either passes verify or writes a fresh mediation artifact.";
  }
  if (diagnosis.state === "resume_patch_mediation") {
    return "Patch mediation re-evaluates the external patch and writes an accepted or newly rejected patch-mediation artifact.";
  }
  if (diagnosis.state === "stale_artifact") {
    return "The stale impact artifact is regenerated and doctor mainline no longer reports stale_artifact for this session.";
  }
  if (diagnosis.state === "malformed_session") {
    return "A parseable .jispec/change-session.json exists with an explicit nextCommands entry or replayable handoff.";
  }
  return "No recovery state change is required.";
}

function verificationCommandForState(state: MainlineFlowState): string {
  if (state === "continue_active_session" || state === "resume_from_handoff" || state === "resume_patch_mediation") {
    return "npm run ci:verify";
  }
  return "npm run jispec-cli -- doctor mainline";
}

function riskForDiagnosis(diagnosis: MainlineFlowRecovery): MainlineRecoveryDrillStep["risk"] {
  if (diagnosis.status === "fail") {
    return "high";
  }
  if (diagnosis.state === "resume_from_handoff" || diagnosis.state === "continue_active_session") {
    return "medium";
  }
  return "low";
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
