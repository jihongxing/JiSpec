import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { appendAuditEvent } from "../audit/event-ledger";
import type { ChangeSessionOrchestrationMode } from "./change-session";
import {
  evaluateChangeExecuteDefaultReadiness,
  resolveChangeCommandMode,
  type ChangeExecuteDefaultReadiness,
} from "./orchestration-config";

export type ChangeDefaultModeAction = "show" | "set" | "reset";

export interface ChangeDefaultModeOptions {
  root: string;
  mode?: ChangeSessionOrchestrationMode;
  actor?: string;
  reason?: string;
}

export interface ChangeDefaultModeHistoryEntry {
  timestamp: string;
  action: ChangeDefaultModeAction;
  previousMode: ChangeSessionOrchestrationMode;
  nextMode: ChangeSessionOrchestrationMode;
  previousSource: "cli" | "project_config" | "built_in_default";
  source: "project_config" | "built_in_default";
  actor?: string;
  reason?: string;
  configPath?: string;
  readiness: {
    readyForExecuteDefault: boolean;
    canSetExecuteDefault: boolean;
    openDraftSessionId?: string;
    boundaryStatus: ChangeExecuteDefaultReadiness["boundary"]["adoptBoundary"]["status"];
    blockers: string[];
    warnings: string[];
  };
}

export interface ChangeDefaultModeResult {
  action: ChangeDefaultModeAction;
  root: string;
  currentMode: ChangeSessionOrchestrationMode;
  previousMode: ChangeSessionOrchestrationMode;
  source: "cli" | "project_config" | "built_in_default";
  configPath?: string;
  historyPath?: string;
  readiness: ChangeExecuteDefaultReadiness;
  warnings: string[];
  nextActions: string[];
}

const PROJECT_CONFIG_RELATIVE_PATH = "jiproject/project.yaml";
const HISTORY_RELATIVE_PATH = ".jispec/change-default-mode-history.jsonl";

export function showChangeDefaultMode(rootInput: string): ChangeDefaultModeResult {
  const root = path.resolve(rootInput);
  const resolution = resolveChangeCommandMode(root);
  const readiness = evaluateChangeExecuteDefaultReadiness(root);

  return {
    action: "show",
    root,
    currentMode: resolution.mode,
    previousMode: resolution.mode,
    source: resolution.source,
    configPath: resolution.configPath,
    readiness,
    warnings: renderWarnings(readiness),
    nextActions: buildNextActions(readiness, "show"),
  };
}

export function setChangeDefaultMode(options: ChangeDefaultModeOptions): ChangeDefaultModeResult {
  const root = path.resolve(options.root);
  if (options.mode !== "prompt" && options.mode !== "execute") {
    throw new Error("default mode must be prompt or execute");
  }

  const beforeResolution = resolveChangeCommandMode(root);
  if (options.mode === "execute") {
    const beforeReadiness = evaluateChangeExecuteDefaultReadiness(root);
    if (!beforeReadiness.canSetExecuteDefault) {
      throw new Error(`Cannot enable execute-default until readiness blocker(s) are fixed: ${beforeReadiness.blockers.join("; ")}`);
    }
  }

  writeProjectDefaultMode(root, options.mode);
  const readiness = evaluateChangeExecuteDefaultReadiness(root);
  const historyPath = appendHistory(root, {
    timestamp: new Date().toISOString(),
    action: "set",
    previousMode: beforeResolution.mode,
    nextMode: options.mode,
    previousSource: beforeResolution.source,
    source: "project_config",
    actor: options.actor,
    reason: options.reason,
    configPath: PROJECT_CONFIG_RELATIVE_PATH,
    readiness: {
      readyForExecuteDefault: readiness.readyForExecuteDefault,
      canSetExecuteDefault: readiness.canSetExecuteDefault,
      openDraftSessionId: readiness.openDraftSessionId,
      boundaryStatus: readiness.boundary.adoptBoundary.status,
      blockers: readiness.blockers,
      warnings: readiness.warnings,
    },
  });
  appendAuditEvent(root, {
    type: "default_mode_set",
    actor: options.actor,
    reason: options.reason,
    sourceArtifact: {
      kind: "change-default-mode-history",
      path: historyPath,
    },
    affectedContracts: [PROJECT_CONFIG_RELATIVE_PATH, "change.default_mode"],
    details: {
      previousMode: beforeResolution.mode,
      nextMode: options.mode,
      previousSource: beforeResolution.source,
      source: "project_config",
      readyForExecuteDefault: readiness.readyForExecuteDefault,
      canSetExecuteDefault: readiness.canSetExecuteDefault,
    },
  });

  return {
    action: "set",
    root,
    currentMode: options.mode,
    previousMode: beforeResolution.mode,
    source: "project_config",
    configPath: path.join(root, PROJECT_CONFIG_RELATIVE_PATH),
    historyPath,
    readiness,
    warnings: renderWarnings(readiness),
    nextActions: buildNextActions(readiness, "set"),
  };
}

export function resetChangeDefaultMode(options: Omit<ChangeDefaultModeOptions, "mode">): ChangeDefaultModeResult {
  const root = path.resolve(options.root);
  const beforeResolution = resolveChangeCommandMode(root);
  removeProjectDefaultMode(root);
  const readiness = evaluateChangeExecuteDefaultReadiness(root);
  const historyPath = appendHistory(root, {
    timestamp: new Date().toISOString(),
    action: "reset",
    previousMode: beforeResolution.mode,
    nextMode: readiness.defaultMode,
    previousSource: beforeResolution.source,
    source: "built_in_default",
    actor: options.actor,
    reason: options.reason,
    configPath: fs.existsSync(path.join(root, PROJECT_CONFIG_RELATIVE_PATH)) ? PROJECT_CONFIG_RELATIVE_PATH : undefined,
    readiness: {
      readyForExecuteDefault: readiness.readyForExecuteDefault,
      canSetExecuteDefault: readiness.canSetExecuteDefault,
      openDraftSessionId: readiness.openDraftSessionId,
      boundaryStatus: readiness.boundary.adoptBoundary.status,
      blockers: readiness.blockers,
      warnings: readiness.warnings,
    },
  });
  appendAuditEvent(root, {
    type: "default_mode_reset",
    actor: options.actor,
    reason: options.reason,
    sourceArtifact: {
      kind: "change-default-mode-history",
      path: historyPath,
    },
    affectedContracts: [PROJECT_CONFIG_RELATIVE_PATH, "change.default_mode"],
    details: {
      previousMode: beforeResolution.mode,
      nextMode: readiness.defaultMode,
      previousSource: beforeResolution.source,
      source: readiness.source,
      readyForExecuteDefault: readiness.readyForExecuteDefault,
      canSetExecuteDefault: readiness.canSetExecuteDefault,
    },
  });

  return {
    action: "reset",
    root,
    currentMode: readiness.defaultMode,
    previousMode: beforeResolution.mode,
    source: readiness.source,
    configPath: readiness.configPath,
    historyPath,
    readiness,
    warnings: renderWarnings(readiness),
    nextActions: buildNextActions(readiness, "reset"),
  };
}

export function renderChangeDefaultModeJSON(result: ChangeDefaultModeResult): string {
  return JSON.stringify({
    action: result.action,
    root: result.root,
    currentMode: result.currentMode,
    previousMode: result.previousMode,
    source: result.source,
    configPath: result.configPath ? path.relative(result.root, result.configPath).replace(/\\/g, "/") : undefined,
    historyPath: result.historyPath ? path.relative(result.root, result.historyPath).replace(/\\/g, "/") : undefined,
    readiness: result.readiness,
    warnings: result.warnings,
    nextActions: result.nextActions,
  }, null, 2);
}

export function renderChangeDefaultModeText(result: ChangeDefaultModeResult): string {
  const lines = [
    "=== JiSpec Change Default Mode ===",
    "",
    `Action: ${result.action}`,
    `Current mode: ${result.currentMode}`,
    `Previous mode: ${result.previousMode}`,
    `Source: ${result.source}`,
  ];

  if (result.configPath) {
    lines.push(`Config: ${path.relative(result.root, result.configPath).replace(/\\/g, "/")}`);
  }
  if (result.historyPath) {
    lines.push(`History: ${path.relative(result.root, result.historyPath).replace(/\\/g, "/")}`);
  }

  lines.push("");
  lines.push("Readiness:");
  for (const detail of result.readiness.details) {
    lines.push(`- ${detail}`);
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  lines.push("");
  lines.push("Next actions:");
  for (const nextAction of result.nextActions) {
    lines.push(`- ${nextAction}`);
  }

  return lines.join("\n");
}

function writeProjectDefaultMode(root: string, mode: ChangeSessionOrchestrationMode): void {
  const projectPath = path.join(root, PROJECT_CONFIG_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(projectPath), { recursive: true });
  const project = readProjectYaml(projectPath);
  const change = isRecord(project.change) ? { ...project.change } : {};
  delete change.defaultMode;
  change.default_mode = mode;
  project.change = change;
  fs.writeFileSync(projectPath, yaml.dump(project, { lineWidth: 100, noRefs: true, sortKeys: false }), "utf-8");
}

function removeProjectDefaultMode(root: string): void {
  const projectPath = path.join(root, PROJECT_CONFIG_RELATIVE_PATH);
  if (!fs.existsSync(projectPath)) {
    return;
  }

  const project = readProjectYaml(projectPath);
  if (!isRecord(project.change)) {
    return;
  }

  const change = { ...project.change };
  delete change.default_mode;
  delete change.defaultMode;

  if (Object.keys(change).length === 0) {
    delete project.change;
  } else {
    project.change = change;
  }

  fs.writeFileSync(projectPath, yaml.dump(project, { lineWidth: 100, noRefs: true, sortKeys: false }), "utf-8");
}

function readProjectYaml(projectPath: string): Record<string, unknown> {
  if (!fs.existsSync(projectPath)) {
    return {
      id: "jispec-project",
      name: "JiSpec Project",
    };
  }

  const parsed = yaml.load(fs.readFileSync(projectPath, "utf-8"));
  if (!isRecord(parsed)) {
    throw new Error(`${PROJECT_CONFIG_RELATIVE_PATH} is not an object and cannot be edited safely.`);
  }
  return { ...parsed };
}

function appendHistory(root: string, entry: ChangeDefaultModeHistoryEntry): string {
  const historyPath = path.join(root, HISTORY_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.appendFileSync(historyPath, `${JSON.stringify(entry)}\n`, "utf-8");
  return historyPath;
}

function buildNextActions(readiness: ChangeExecuteDefaultReadiness, action: ChangeDefaultModeAction): string[] {
  if (!readiness.canSetExecuteDefault) {
    return [
      ...readiness.ownerActions,
      "Keep prompt as the default until execute-default blockers are resolved.",
    ];
  }

  if (readiness.openDraftSessionId) {
    return [
      `Run npm run jispec-cli -- adopt --interactive --session ${readiness.openDraftSessionId} before relying on strict-lane execute-default.`,
      "Use --mode prompt on individual change commands when you need a manual pause.",
    ];
  }

  if (readiness.defaultMode === "execute") {
    return [
      "Run npm run jispec-cli -- change \"<summary>\" to use execute-default mediation.",
      "Use npm run jispec-cli -- change default-mode set prompt as the rollback path.",
    ];
  }

  if (action === "reset") {
    return [
      "Prompt is the default again.",
      "Use --mode execute for explicit trials before re-enabling execute-default.",
    ];
  }

  return [
    "Prompt is the default.",
    "Run npm run jispec-cli -- change default-mode set execute when the team is ready to make mediation the default.",
  ];
}

function renderWarnings(readiness: ChangeExecuteDefaultReadiness): string[] {
  const warnings = [...readiness.warnings];
  if (readiness.openDraftSessionId) {
    warnings.push(`Open bootstrap draft ${readiness.openDraftSessionId}; strict-lane execute-default still pauses at adopt.`);
  }
  return uniqueSorted(warnings);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}
