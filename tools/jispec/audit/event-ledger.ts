import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const AUDIT_EVENT_LEDGER_RELATIVE_PATH = ".spec/audit/events.jsonl";

export type AuditEventType =
  | "adopt_accept"
  | "adopt_edit"
  | "adopt_reject"
  | "adopt_defer"
  | "review_adopt"
  | "review_reject"
  | "review_defer"
  | "review_waive"
  | "waiver_create"
  | "waiver_revoke"
  | "waiver_expire"
  | "waiver_renew"
  | "policy_migrate"
  | "policy_change"
  | "default_mode_set"
  | "default_mode_reset"
  | "release_snapshot"
  | "release_compare"
  | "external_patch_intake"
  | "spec_debt_repay"
  | "spec_debt_cancel"
  | "spec_debt_owner_review";

export interface AuditArtifactRef {
  path: string;
  kind: string;
}

export interface AuditEvent {
  version: 1;
  id: string;
  type: AuditEventType;
  timestamp: string;
  actor: string;
  reason: string;
  sourceArtifact: AuditArtifactRef;
  affectedContracts: string[];
  details?: Record<string, unknown>;
}

export interface AppendAuditEventInput {
  type: AuditEventType;
  actor?: string;
  reason?: string;
  timestamp?: string;
  sourceArtifact: AuditArtifactRef;
  affectedContracts?: string[];
  details?: Record<string, unknown>;
}

export function appendAuditEvent(rootInput: string, input: AppendAuditEventInput): { event: AuditEvent; ledgerPath: string } {
  const root = path.resolve(rootInput);
  const ledgerPath = path.join(root, AUDIT_EVENT_LEDGER_RELATIVE_PATH);
  const event: AuditEvent = {
    version: 1,
    id: `audit-${crypto.randomUUID()}`,
    type: input.type,
    timestamp: input.timestamp ?? new Date().toISOString(),
    actor: normalizeText(input.actor) ?? inferAuditActor(),
    reason: normalizeText(input.reason) ?? defaultReasonForEvent(input.type),
    sourceArtifact: {
      kind: input.sourceArtifact.kind,
      path: normalizeAuditPath(root, input.sourceArtifact.path),
    },
    affectedContracts: stableUnique(input.affectedContracts ?? []),
    details: input.details,
  };

  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, `${JSON.stringify(event)}\n`, "utf-8");
  return { event, ledgerPath };
}

export function readAuditEvents(rootInput: string): AuditEvent[] {
  const ledgerPath = path.join(path.resolve(rootInput), AUDIT_EVENT_LEDGER_RELATIVE_PATH);
  if (!fs.existsSync(ledgerPath)) {
    return [];
  }

  return fs.readFileSync(ledgerPath, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AuditEvent);
}

export function inferAuditActor(): string {
  return normalizeText(process.env.JISPEC_ACTOR)
    ?? normalizeText(process.env.GIT_AUTHOR_NAME)
    ?? normalizeText(process.env.USERNAME)
    ?? normalizeText(process.env.USER)
    ?? "unknown";
}

export function normalizeAuditPath(root: string, targetPath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(resolvedRoot, targetPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return normalizeRelativePath(relative);
  }
  return normalizeRelativePath(targetPath);
}

function defaultReasonForEvent(type: AuditEventType): string {
  return `JiSpec recorded ${type.replace(/_/g, " ")}.`;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right));
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/");
}
