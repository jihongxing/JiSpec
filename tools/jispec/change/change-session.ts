import fs from "node:fs";
import path from "node:path";
import type { LaneDecision } from "./lane-decision";
import type { ClassifiedPath } from "./git-diff-classifier";
import type { SpecDeltaChangeType, SpecDeltaDraftResult } from "./spec-delta";

export type ChangeSessionOrchestrationMode = "prompt" | "execute";

/**
 * Command hint for next action.
 */
export interface ChangeSessionCommandHint {
  command: string;
  description: string;
}

/**
 * Change session state.
 */
export interface ChangeSession {
  id: string;
  createdAt: string;
  summary: string;
  orchestrationMode?: ChangeSessionOrchestrationMode;
  laneDecision: LaneDecision;
  changedPaths: ClassifiedPath[];
  changeType?: SpecDeltaChangeType;
  specDelta?: SpecDeltaDraftResult;
  sliceId?: string;
  contextId?: string;
  baseRef?: string;
  nextCommands: ChangeSessionCommandHint[];
  impactSummary?: string[];
}

/**
 * Resolve path to active change session file.
 */
export function resolveActiveSessionPath(root: string): string {
  return path.join(root, ".jispec", "change-session.json");
}

/**
 * Resolve path to archived change sessions directory.
 */
export function resolveArchivedSessionsDir(root: string): string {
  return path.join(root, ".jispec", "change-sessions");
}

/**
 * Write active change session to disk.
 */
export function writeChangeSession(root: string, session: ChangeSession): void {
  const sessionPath = resolveActiveSessionPath(root);
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), "utf-8");
}

/**
 * Read active change session from disk.
 */
export function readChangeSession(root: string): ChangeSession | null {
  const sessionPath = resolveActiveSessionPath(root);
  if (!fs.existsSync(sessionPath)) {
    return null;
  }
  const content = fs.readFileSync(sessionPath, "utf-8");
  return JSON.parse(content) as ChangeSession;
}

/**
 * Read an archived change session from disk.
 */
export function readArchivedChangeSession(root: string, sessionId: string): ChangeSession | null {
  const archivePath = path.join(resolveArchivedSessionsDir(root), `${sessionId}.json`);
  if (!fs.existsSync(archivePath)) {
    return null;
  }

  const content = fs.readFileSync(archivePath, "utf-8");
  return JSON.parse(content) as ChangeSession;
}

/**
 * Load a change session by active state or archive lookup.
 */
export function loadChangeSession(root: string, sessionId?: string): ChangeSession | null {
  if (!sessionId) {
    return readChangeSession(root);
  }

  const active = readChangeSession(root);
  if (active?.id === sessionId) {
    return active;
  }

  return readArchivedChangeSession(root, sessionId);
}

/**
 * Check whether the given session ID is the current active session.
 */
export function isActiveChangeSession(root: string, sessionId: string): boolean {
  const active = readChangeSession(root);
  return active?.id === sessionId;
}

/**
 * Archive active change session.
 */
export function archiveChangeSession(root: string): void {
  const sessionPath = resolveActiveSessionPath(root);
  if (!fs.existsSync(sessionPath)) {
    return;
  }

  const session = readChangeSession(root);
  if (!session) {
    return;
  }

  const archiveDir = resolveArchivedSessionsDir(root);
  fs.mkdirSync(archiveDir, { recursive: true });

  const archivePath = path.join(archiveDir, `${session.id}.json`);
  fs.renameSync(sessionPath, archivePath);
}

/**
 * Clear active change session.
 */
export function clearChangeSession(root: string): void {
  const sessionPath = resolveActiveSessionPath(root);
  if (fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
  }
}

/**
 * Generate a unique session ID.
 */
export function generateSessionId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `change-${timestamp}-${random}`;
}
