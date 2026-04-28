import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";

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
