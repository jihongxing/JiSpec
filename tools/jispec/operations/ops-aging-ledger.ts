import fs from "node:fs";
import path from "node:path";
import { inspectAuditLedger } from "../audit/event-ledger";

export type OpsAgingLedgerStatus = "ready" | "blocked";
export type OpsSlaBucket = "fresh" | "due-soon" | "overdue" | "escalated";

export interface OpsAgingLedger {
  schemaVersion: 1;
  kind: "jispec-ops-aging-ledger";
  generatedAt: string;
  root: string;
  status: OpsAgingLedgerStatus;
  boundary: {
    localOnly: true;
    sourceUploadRequired: false;
    realtimeCollaborationRequired: false;
    executesCommands: false;
    replacesVerify: false;
    replacesDoctorGlobal: false;
    deferredSurfacesDiagnosticOnly: true;
  };
  sourceInbox: {
    status: string;
    sourcePath: string;
    reviewerCount: number;
    totalItems: number;
  };
  policy: {
    freshHours: number;
    dueSoonHours: number;
    overdueHours: number;
  };
  summary: {
    totalItems: number;
    fresh: number;
    dueSoon: number;
    overdue: number;
    escalated: number;
    itemsWithEscalationPath: number;
    itemsMissingEscalationPath: number;
  };
  entries: OpsAgingEntry[];
  auditEvidenceRefs: Array<{
    type: string;
    actor: string;
    sourceArtifact: string;
    affectedContracts: string[];
  }>;
  verifyBoundaryStatement: string;
  blockers: string[];
}

export interface OpsAgingEntry {
  ledgerId: string;
  sourceItemId: string;
  sourceKind: string;
  status: string;
  slaBucket: OpsSlaBucket;
  owner: string;
  reviewer: string;
  teamId: string;
  repoId: string;
  openedAt: string;
  dueAt: string;
  ageHours: number;
  command: string;
  affectedContracts: string[];
  escalationPath: string[];
  sourceArtifact: string;
}

export interface OpsAgingLedgerWriteResult {
  root: string;
  ledgerPath: string;
  summaryPath: string;
  ledger: OpsAgingLedger;
}

const DEFAULT_LEDGER_PATH = ".spec/operations/ops-aging-ledger.json";
const ASYNC_REVIEW_INBOX_PATH = ".spec/operations/async-review-inbox.json";
const DEFAULT_FRESH_HOURS = 24;
const DEFAULT_DUE_SOON_HOURS = 72;
const DEFAULT_OVERDUE_HOURS = 96;

export function buildOpsAgingLedger(rootInput: string): OpsAgingLedger {
  const root = path.resolve(rootInput);
  const inbox = readJson(path.join(root, ASYNC_REVIEW_INBOX_PATH));
  const audit = inspectAuditLedger(root);
  const generatedAt = new Date().toISOString();
  const now = new Date(generatedAt);
  const rawItems = Array.isArray(inbox?.items) ? inbox.items.filter(isRecord) : [];
  const entries = rawItems.map((item) => buildEntry(item, inbox, now));
  const auditEvidenceRefs = buildAuditEvidenceRefs(inbox, audit.events);
  const summary = {
    totalItems: entries.length,
    fresh: entries.filter((entry) => entry.slaBucket === "fresh").length,
    dueSoon: entries.filter((entry) => entry.slaBucket === "due-soon").length,
    overdue: entries.filter((entry) => entry.slaBucket === "overdue").length,
    escalated: entries.filter((entry) => entry.slaBucket === "escalated").length,
    itemsWithEscalationPath: entries.filter((entry) => entry.escalationPath.length > 0).length,
    itemsMissingEscalationPath: entries.filter((entry) => entry.escalationPath.length === 0).length,
  };
  const blockers = buildBlockers({ inbox, entries, summary, auditEvidenceRefs });

  return {
    schemaVersion: 1,
    kind: "jispec-ops-aging-ledger",
    generatedAt,
    root: normalizePath(root),
    status: blockers.length === 0 ? "ready" : "blocked",
    boundary: {
      localOnly: true,
      sourceUploadRequired: false,
      realtimeCollaborationRequired: false,
      executesCommands: false,
      replacesVerify: false,
      replacesDoctorGlobal: false,
      deferredSurfacesDiagnosticOnly: true,
    },
    sourceInbox: {
      status: stringValue(inbox?.status) ?? "not_available_yet",
      sourcePath: ASYNC_REVIEW_INBOX_PATH,
      reviewerCount: numberValue(isRecord(inbox?.summary) ? inbox.summary.reviewerCount : undefined) ?? 0,
      totalItems: numberValue(isRecord(inbox?.summary) ? inbox.summary.totalItems : undefined) ?? rawItems.length,
    },
    policy: {
      freshHours: DEFAULT_FRESH_HOURS,
      dueSoonHours: DEFAULT_DUE_SOON_HOURS,
      overdueHours: DEFAULT_OVERDUE_HOURS,
    },
    summary,
    entries,
    auditEvidenceRefs,
    verifyBoundaryStatement: "Ops aging ledger is local read-only evidence. It does not notify remote services, execute commands, upload source, replace verify, or override doctor global.",
    blockers,
  };
}

export function writeOpsAgingLedger(rootInput: string, outPath: string = DEFAULT_LEDGER_PATH): OpsAgingLedgerWriteResult {
  const root = path.resolve(rootInput);
  const ledgerPath = path.resolve(root, outPath);
  const summaryPath = ledgerPath.replace(/\.json$/i, ".md");
  const ledger = buildOpsAgingLedger(root);

  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf-8");
  fs.writeFileSync(summaryPath, renderOpsAgingLedgerMarkdown(ledger), "utf-8");

  return {
    root: normalizePath(root),
    ledgerPath: normalizePath(path.relative(root, ledgerPath)),
    summaryPath: normalizePath(path.relative(root, summaryPath)),
    ledger,
  };
}

export function renderOpsAgingLedgerMarkdown(ledger: OpsAgingLedger): string {
  return [
    "# JiSpec Ops Aging Ledger",
    "",
    "Human companion only. The machine source of truth is `.spec/operations/ops-aging-ledger.json`.",
    "",
    `Generated at: ${ledger.generatedAt}`,
    `Status: ${ledger.status}`,
    `Items: ${ledger.summary.totalItems}`,
    `Fresh: ${ledger.summary.fresh}`,
    `Due soon: ${ledger.summary.dueSoon}`,
    `Overdue: ${ledger.summary.overdue}`,
    `Escalated: ${ledger.summary.escalated}`,
    "",
    "## Boundary",
    "",
    `- ${ledger.verifyBoundaryStatement}`,
    "- Deferred collaboration surfaces remain diagnostic-only.",
    "",
    "## Entries",
    "",
    ...(ledger.entries.length > 0
      ? ledger.entries.map((entry) => `- ${entry.ledgerId}: ${entry.slaBucket} (${entry.reviewer} -> ${entry.owner})`)
      : ["- None"]),
    "",
    "## Blockers",
    "",
    ...(ledger.blockers.length > 0 ? ledger.blockers.map((blocker) => `- ${blocker}`) : ["- None"]),
    "",
  ].join("\n");
}

function buildEntry(item: Record<string, unknown>, inbox: Record<string, unknown> | undefined, now: Date): OpsAgingEntry {
  const sourceItemId = stringValue(item.requestId) ?? "unknown";
  const openedAt = parseDateString(item.openedAt) ?? parseDateString(item.createdAt) ?? parseDateString(inbox?.generatedAt) ?? now.toISOString();
  const dueAt = parseDateString(item.dueAt) ?? addHours(openedAt, DEFAULT_DUE_SOON_HOURS);
  const status = stringValue(item.status) ?? "pending";
  const ageHours = Math.max(0, Math.floor((now.getTime() - new Date(openedAt).getTime()) / (60 * 60 * 1000)));
  return {
    ledgerId: `sla:${sourceItemId}`,
    sourceItemId,
    sourceKind: stringValue(item.kind) ?? "owner_action_review",
    status,
    slaBucket: classifyBucket(status, dueAt, now),
    owner: stringValue(item.owner) ?? "unknown",
    reviewer: stringValue(item.reviewer) ?? "unknown",
    teamId: stringValue(item.teamId) ?? "unknown",
    repoId: stringValue(item.repoId) ?? "unknown",
    openedAt,
    dueAt,
    ageHours,
    command: stringValue(item.command) ?? "not_available_yet",
    affectedContracts: stringArray(item.affectedContracts),
    escalationPath: stringArray(item.escalationPath),
    sourceArtifact: stringValue(item.sourceArtifact) ?? ASYNC_REVIEW_INBOX_PATH,
  };
}

function classifyBucket(status: string, dueAt: string, now: Date): OpsSlaBucket {
  if (status === "blocked") {
    return "escalated";
  }
  if (status === "expired") {
    return "overdue";
  }
  const dueTime = new Date(dueAt).getTime();
  const remainingHours = (dueTime - now.getTime()) / (60 * 60 * 1000);
  if (remainingHours < 0) {
    return "overdue";
  }
  if (remainingHours <= DEFAULT_FRESH_HOURS) {
    return "due-soon";
  }
  return "fresh";
}

function buildAuditEvidenceRefs(inbox: Record<string, unknown> | undefined, events: unknown[]): OpsAgingLedger["auditEvidenceRefs"] {
  const inboxRefs = Array.isArray(inbox?.auditEvidenceRefs) ? inbox.auditEvidenceRefs.filter(isRecord) : [];
  const refs = inboxRefs.length > 0 ? inboxRefs : events.slice(-20).filter(isRecord);
  return refs.map((event) => ({
    type: String(event.type ?? "unknown"),
    actor: String(event.actor ?? "unknown"),
    sourceArtifact: isRecord(event.sourceArtifact) ? String(event.sourceArtifact.path ?? "not_available_yet") : String(event.sourceArtifact ?? "not_available_yet"),
    affectedContracts: stringArray(event.affectedContracts),
  }));
}

function buildBlockers(input: {
  inbox: Record<string, unknown> | undefined;
  entries: OpsAgingEntry[];
  summary: OpsAgingLedger["summary"];
  auditEvidenceRefs: OpsAgingLedger["auditEvidenceRefs"];
}): string[] {
  const blockers: string[] = [];
  if (!input.inbox) {
    blockers.push("async_review_inbox_missing");
  } else if (input.inbox.status !== "ready") {
    blockers.push("async_review_inbox_not_ready");
  }
  if (input.entries.length === 0) {
    blockers.push("aging_entries_missing");
  }
  if (input.summary.itemsMissingEscalationPath > 0) {
    blockers.push("escalation_path_missing");
  }
  if (input.auditEvidenceRefs.length === 0) {
    blockers.push("audit_evidence_missing");
  }
  return blockers;
}

function readJson(filePath: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseDateString(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function addHours(isoDate: string, hours: number): string {
  return new Date(new Date(isoDate).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter((entry) => entry.trim().length > 0) : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

