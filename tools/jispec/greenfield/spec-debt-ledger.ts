import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { appendAuditEvent } from "../audit/event-ledger";

export type GreenfieldSpecDebtKind = "waiver" | "defer" | "classified_drift" | "unsynced_asset";
export type GreenfieldSpecDebtStatus = "open" | "repaid" | "cancelled";

export interface GreenfieldSpecDebtRecord {
  id: string;
  kind: GreenfieldSpecDebtKind;
  status: GreenfieldSpecDebtStatus;
  owner: string;
  reason: string;
  created_at: string;
  expires_at?: string;
  affected_assets: string[];
  affected_requirements?: string[];
  affected_contracts?: string[];
  affected_scenarios?: string[];
  affected_slices?: string[];
  repayment_hint: string;
  source?: {
    type: "manual" | "waiver" | "spec_delta" | "ratchet_classification";
    ref?: string;
  };
  owner_review?: {
    requested_at: string;
    requested_by: string;
    reason: string;
  };
}

export interface GreenfieldSpecDebtLedger {
  version: 1;
  debts: GreenfieldSpecDebtRecord[];
}

export interface GreenfieldSpecDebtSummary {
  total: number;
  open: number;
  expired: number;
  repaid: number;
  cancelled: number;
  records: GreenfieldSpecDebtRecord[];
  expiredRecords: GreenfieldSpecDebtRecord[];
  warnings: string[];
}

export interface CreateGreenfieldSpecDebtOptions {
  id?: string;
  kind: GreenfieldSpecDebtKind;
  owner: string;
  reason: string;
  createdAt?: string;
  expiresAt?: string;
  affectedAssets: string[];
  affectedRequirements?: string[];
  affectedContracts?: string[];
  affectedScenarios?: string[];
  affectedSlices?: string[];
  repaymentHint: string;
  source?: GreenfieldSpecDebtRecord["source"];
}

export interface UpdateGreenfieldSpecDebtStatusOptions {
  id: string;
  status: Extract<GreenfieldSpecDebtStatus, "repaid" | "cancelled">;
  actor?: string;
  reason: string;
  updatedAt?: string;
}

export interface MarkGreenfieldSpecDebtOwnerReviewOptions {
  id: string;
  actor: string;
  reason: string;
  requestedAt?: string;
}

const LEDGER_PATH = ".spec/spec-debt/ledger.yaml";

export function createEmptyGreenfieldSpecDebtLedger(): GreenfieldSpecDebtLedger {
  return {
    version: 1,
    debts: [],
  };
}

export function renderGreenfieldSpecDebtLedger(ledger: GreenfieldSpecDebtLedger): string {
  return yaml.dump(ledger, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
}

export function writeGreenfieldSpecDebtRecord(
  rootInput: string,
  options: CreateGreenfieldSpecDebtOptions,
): GreenfieldSpecDebtRecord {
  validateCreateOptions(options);
  const root = path.resolve(rootInput);
  const ledger = loadGreenfieldSpecDebtLedger(root);
  const record: GreenfieldSpecDebtRecord = {
    id: options.id ?? generateDebtId(options.kind, options.reason, options.createdAt ?? new Date().toISOString()),
    kind: options.kind,
    status: "open",
    owner: options.owner,
    reason: options.reason,
    created_at: options.createdAt ?? new Date().toISOString(),
    expires_at: options.expiresAt,
    affected_assets: stableUnique(options.affectedAssets),
    affected_requirements: stableUnique(options.affectedRequirements ?? []),
    affected_contracts: stableUnique(options.affectedContracts ?? []),
    affected_scenarios: stableUnique(options.affectedScenarios ?? []),
    affected_slices: stableUnique(options.affectedSlices ?? []),
    repayment_hint: options.repaymentHint,
    source: options.source,
  };

  const nextLedger: GreenfieldSpecDebtLedger = {
    version: 1,
    debts: [
      ...ledger.debts.filter((entry) => entry.id !== record.id),
      record,
    ].sort((left, right) => left.id.localeCompare(right.id)),
  };

  writeGreenfieldSpecDebtLedger(root, nextLedger);
  return record;
}

export function updateGreenfieldSpecDebtStatus(
  rootInput: string,
  options: UpdateGreenfieldSpecDebtStatusOptions,
): GreenfieldSpecDebtRecord {
  if (!options.id.trim()) {
    throw new Error("Spec debt id is required.");
  }
  if (!options.reason.trim()) {
    throw new Error("Spec debt status update reason is required.");
  }

  const root = path.resolve(rootInput);
  const ledger = loadGreenfieldSpecDebtLedger(root);
  const existing = ledger.debts.find((record) => record.id === options.id);
  if (!existing) {
    throw new Error(`Spec debt not found: ${options.id}`);
  }

  const updated: GreenfieldSpecDebtRecord = {
    ...existing,
    status: options.status,
  };
  const nextLedger: GreenfieldSpecDebtLedger = {
    version: 1,
    debts: ledger.debts
      .map((record) => record.id === options.id ? updated : record)
      .sort((left, right) => left.id.localeCompare(right.id)),
  };

  const ledgerPath = writeGreenfieldSpecDebtLedger(root, nextLedger);
  appendAuditEvent(root, {
    type: options.status === "repaid" ? "spec_debt_repay" : "spec_debt_cancel",
    actor: options.actor ?? existing.owner,
    reason: options.reason,
    timestamp: options.updatedAt,
    sourceArtifact: {
      kind: "greenfield-spec-debt-ledger",
      path: ledgerPath,
    },
    affectedContracts: [
      ...existing.affected_assets,
      ...(existing.affected_contracts ?? []),
      ...(existing.affected_scenarios ?? []),
      ...(existing.affected_slices ?? []),
    ],
    details: {
      debtId: existing.id,
      previousStatus: existing.status,
      nextStatus: options.status,
      owner: existing.owner,
      source: existing.source,
    },
  });
  return updated;
}

export function markGreenfieldSpecDebtOwnerReview(
  rootInput: string,
  options: MarkGreenfieldSpecDebtOwnerReviewOptions,
): GreenfieldSpecDebtRecord {
  if (!options.id.trim()) {
    throw new Error("Spec debt id is required.");
  }
  if (!options.actor.trim()) {
    throw new Error("Spec debt owner review actor is required.");
  }
  if (!options.reason.trim()) {
    throw new Error("Spec debt owner review reason is required.");
  }

  const root = path.resolve(rootInput);
  const ledger = loadGreenfieldSpecDebtLedger(root);
  const existing = ledger.debts.find((record) => record.id === options.id);
  if (!existing) {
    throw new Error(`Spec debt not found: ${options.id}`);
  }
  const ownerReview = {
    requested_at: options.requestedAt ?? new Date().toISOString(),
    requested_by: options.actor,
    reason: options.reason,
  };

  const updated: GreenfieldSpecDebtRecord = {
    ...existing,
    owner_review: ownerReview,
  };
  const nextLedger: GreenfieldSpecDebtLedger = {
    version: 1,
    debts: ledger.debts
      .map((record) => record.id === options.id ? updated : record)
      .sort((left, right) => left.id.localeCompare(right.id)),
  };

  const ledgerPath = writeGreenfieldSpecDebtLedger(root, nextLedger);
  appendAuditEvent(root, {
    type: "spec_debt_owner_review",
    actor: options.actor,
    reason: options.reason,
    timestamp: ownerReview.requested_at,
    sourceArtifact: {
      kind: "greenfield-spec-debt-ledger",
      path: ledgerPath,
    },
    affectedContracts: [
      ...existing.affected_assets,
      ...(existing.affected_contracts ?? []),
      ...(existing.affected_scenarios ?? []),
      ...(existing.affected_slices ?? []),
    ],
    details: {
      debtId: existing.id,
      status: existing.status,
      owner: existing.owner,
      source: existing.source,
    },
  });
  return updated;
}

export function loadGreenfieldSpecDebtLedger(rootInput: string): GreenfieldSpecDebtLedger {
  const root = path.resolve(rootInput);
  const ledgerPath = path.join(root, LEDGER_PATH);
  if (!fs.existsSync(ledgerPath)) {
    return createEmptyGreenfieldSpecDebtLedger();
  }

  const parsed = yaml.load(fs.readFileSync(ledgerPath, "utf-8"));
  if (!isRecord(parsed)) {
    return createEmptyGreenfieldSpecDebtLedger();
  }

  const debts = Array.isArray(parsed.debts)
    ? parsed.debts.filter(isRecord).map(normalizeDebtRecord).filter((entry): entry is GreenfieldSpecDebtRecord => entry !== undefined)
    : [];

  return {
    version: 1,
    debts: debts.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function writeGreenfieldSpecDebtLedger(rootInput: string, ledger: GreenfieldSpecDebtLedger): string {
  const root = path.resolve(rootInput);
  const ledgerPath = path.join(root, LEDGER_PATH);
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, renderGreenfieldSpecDebtLedger(ledger), "utf-8");
  return normalizePath(ledgerPath);
}

export function summarizeGreenfieldSpecDebt(rootInput: string, now?: Date): GreenfieldSpecDebtSummary {
  const ledger = loadGreenfieldSpecDebtLedger(rootInput);
  return summarizeGreenfieldSpecDebtLedger(ledger, now);
}

export function summarizeGreenfieldSpecDebtLedger(
  ledger: GreenfieldSpecDebtLedger,
  now?: Date,
): GreenfieldSpecDebtSummary {
  const currentTime = now ?? new Date();
  const openRecords = ledger.debts.filter((record) => record.status === "open");
  const expiredRecords = openRecords.filter((record) => isGreenfieldSpecDebtExpired(record, currentTime));

  return {
    total: ledger.debts.length,
    open: openRecords.length,
    expired: expiredRecords.length,
    repaid: ledger.debts.filter((record) => record.status === "repaid").length,
    cancelled: ledger.debts.filter((record) => record.status === "cancelled").length,
    records: ledger.debts,
    expiredRecords,
    warnings: collectLedgerWarnings(ledger),
  };
}

export function isGreenfieldSpecDebtExpired(record: GreenfieldSpecDebtRecord, now?: Date): boolean {
  if (record.status !== "open" || !record.expires_at) {
    return false;
  }
  const expiresAt = new Date(record.expires_at);
  if (Number.isNaN(expiresAt.getTime())) {
    return false;
  }
  return (now ?? new Date()).getTime() > expiresAt.getTime();
}

export function renderGreenfieldSpecDebtSummaryMarkdown(summary: GreenfieldSpecDebtSummary): string {
  return [
    "# Greenfield Spec Debt Ledger",
    "",
    "## Summary",
    "",
    `- Total: ${summary.total}`,
    `- Open: ${summary.open}`,
    `- Expired: ${summary.expired}`,
    `- Repaid: ${summary.repaid}`,
    `- Cancelled: ${summary.cancelled}`,
    "",
    "## Open Debt",
    "",
    ...renderDebtList(summary.records.filter((record) => record.status === "open")),
    "",
    "## Warnings",
    "",
    ...(summary.warnings.length > 0 ? summary.warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
  ].join("\n");
}

function normalizeDebtRecord(record: Record<string, unknown>): GreenfieldSpecDebtRecord | undefined {
  const id = stringValue(record.id);
  const kind = stringValue(record.kind) as GreenfieldSpecDebtKind | undefined;
  const status = stringValue(record.status) as GreenfieldSpecDebtStatus | undefined;
  const owner = stringValue(record.owner);
  const reason = stringValue(record.reason);
  const createdAt = stringValue(record.created_at);
  const repaymentHint = stringValue(record.repayment_hint);
  const affectedAssets = stringArray(record.affected_assets);

  if (!id || !isDebtKind(kind) || !isDebtStatus(status) || !owner || !reason || !createdAt || !repaymentHint) {
    return undefined;
  }

  return {
    id,
    kind,
    status,
    owner,
    reason,
    created_at: createdAt,
    expires_at: stringValue(record.expires_at),
    affected_assets: affectedAssets,
    affected_requirements: stringArray(record.affected_requirements),
    affected_contracts: stringArray(record.affected_contracts),
    affected_scenarios: stringArray(record.affected_scenarios),
    affected_slices: stringArray(record.affected_slices),
    repayment_hint: repaymentHint,
    source: normalizeSource(record.source),
    owner_review: normalizeOwnerReview(record.owner_review),
  };
}

function normalizeOwnerReview(value: unknown): GreenfieldSpecDebtRecord["owner_review"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const requestedAt = stringValue(value.requested_at);
  const requestedBy = stringValue(value.requested_by);
  const reason = stringValue(value.reason);
  if (!requestedAt || !requestedBy || !reason) {
    return undefined;
  }
  return {
    requested_at: requestedAt,
    requested_by: requestedBy,
    reason,
  };
}

function normalizeSource(source: unknown): GreenfieldSpecDebtRecord["source"] | undefined {
  if (!isRecord(source)) {
    return undefined;
  }
  const type = stringValue(source.type);
  if (type !== "manual" && type !== "waiver" && type !== "spec_delta" && type !== "ratchet_classification") {
    return undefined;
  }
  return {
    type,
    ref: stringValue(source.ref),
  };
}

function collectLedgerWarnings(ledger: GreenfieldSpecDebtLedger): string[] {
  const warnings: string[] = [];
  for (const record of ledger.debts) {
    if (record.status === "open" && record.affected_assets.length === 0) {
      warnings.push(`Debt ${record.id} has no affected assets.`);
    }
    if (record.expires_at && Number.isNaN(new Date(record.expires_at).getTime())) {
      warnings.push(`Debt ${record.id} has invalid expires_at: ${record.expires_at}.`);
    }
  }
  return warnings.sort((left, right) => left.localeCompare(right));
}

function validateCreateOptions(options: CreateGreenfieldSpecDebtOptions): void {
  if (!isDebtKind(options.kind)) {
    throw new Error(`Invalid spec debt kind: ${options.kind}`);
  }
  if (!options.owner.trim()) {
    throw new Error("Spec debt owner is required.");
  }
  if (!options.reason.trim()) {
    throw new Error("Spec debt reason is required.");
  }
  if (!options.repaymentHint.trim()) {
    throw new Error("Spec debt repayment hint is required.");
  }
  if (options.expiresAt && Number.isNaN(new Date(options.expiresAt).getTime())) {
    throw new Error(`Spec debt expiresAt is not a valid ISO timestamp: ${options.expiresAt}`);
  }
}

function renderDebtList(records: GreenfieldSpecDebtRecord[]): string[] {
  if (records.length === 0) {
    return ["- None"];
  }

  return records.map((record) => {
    const expiry = record.expires_at ? `, expires \`${record.expires_at}\`` : "";
    return `- \`${record.id}\` (${record.kind}, owner \`${record.owner}\`${expiry}): ${record.reason}`;
  });
}

function generateDebtId(kind: string, reason: string, createdAt: string): string {
  const datePart = createdAt.replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const slug = reason
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "spec-debt";
  return `debt-${datePart}-${kind}-${slug}`;
}

function isDebtKind(value: unknown): value is GreenfieldSpecDebtKind {
  return value === "waiver" || value === "defer" || value === "classified_drift" || value === "unsynced_asset";
}

function isDebtStatus(value: unknown): value is GreenfieldSpecDebtStatus {
  return value === "open" || value === "repaid" || value === "cancelled";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? stableUnique(value.filter((entry): entry is string => typeof entry === "string"))
    : [];
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
