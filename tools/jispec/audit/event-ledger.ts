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
  | "policy_approval_decision"
  | "policy_migrate"
  | "policy_change"
  | "default_mode_set"
  | "default_mode_reset"
  | "release_snapshot"
  | "release_compare"
  | "external_patch_intake"
  | "external_tool_run_requested"
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
  sequence: number;
  type: AuditEventType;
  timestamp: string;
  actor: string;
  reason: string;
  sourceArtifact: AuditArtifactRef;
  affectedContracts: string[];
  previousHash: string | null;
  eventHash: string;
  signature?: {
    algorithm: "reserved-none";
    value: null;
  };
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

export type AuditLedgerIntegrityStatus = "not_available_yet" | "verified" | "warning" | "invalid";

export interface AuditLedgerIntegrityIssue {
  line: number;
  code:
    | "AUDIT_EVENT_UNPARSEABLE"
    | "AUDIT_EVENT_SCHEMA_MISSING_FIELD"
    | "AUDIT_EVENT_SEQUENCE_GAP"
    | "AUDIT_EVENT_HASH_MISMATCH"
    | "AUDIT_EVENT_PREVIOUS_HASH_MISMATCH"
    | "AUDIT_EVENT_TIMESTAMP_OUT_OF_ORDER"
    | "AUDIT_EVENT_LEGACY_UNCHAINED";
  message: string;
}

export interface AuditLedgerInspection {
  ledgerPath: string;
  status: AuditLedgerIntegrityStatus;
  eventCount: number;
  verifiedEventCount: number;
  legacyEventCount: number;
  parseErrorCount: number;
  latestSequence: number;
  latestHash: string | null;
  issues: AuditLedgerIntegrityIssue[];
  events: AuditEvent[];
}

export function appendAuditEvent(rootInput: string, input: AppendAuditEventInput): { event: AuditEvent; ledgerPath: string } {
  const root = path.resolve(rootInput);
  const ledgerPath = path.join(root, AUDIT_EVENT_LEDGER_RELATIVE_PATH);
  const prior = inspectAuditLedger(root);
  if (prior.status === "invalid") {
    throw new Error("Audit ledger has invalid integrity and must be reviewed before appending a new event.");
  }

  const eventWithoutHash: Omit<AuditEvent, "eventHash"> = {
    version: 1,
    id: `audit-${crypto.randomUUID()}`,
    sequence: prior.latestSequence + 1,
    type: input.type,
    timestamp: input.timestamp ?? new Date().toISOString(),
    actor: normalizeText(input.actor) ?? inferAuditActor(),
    reason: normalizeText(input.reason) ?? defaultReasonForEvent(input.type),
    sourceArtifact: {
      kind: input.sourceArtifact.kind,
      path: normalizeAuditPath(root, input.sourceArtifact.path),
    },
    affectedContracts: stableUnique(input.affectedContracts ?? []),
    previousHash: prior.latestHash,
    signature: {
      algorithm: "reserved-none",
      value: null,
    },
    details: input.details,
  };
  const event: AuditEvent = {
    ...eventWithoutHash,
    eventHash: hashAuditEvent(eventWithoutHash),
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

export function inspectAuditLedger(rootInput: string): AuditLedgerInspection {
  const ledgerPath = path.join(path.resolve(rootInput), AUDIT_EVENT_LEDGER_RELATIVE_PATH);
  if (!fs.existsSync(ledgerPath)) {
    return {
      ledgerPath,
      status: "not_available_yet",
      eventCount: 0,
      verifiedEventCount: 0,
      legacyEventCount: 0,
      parseErrorCount: 0,
      latestSequence: 0,
      latestHash: null,
      issues: [],
      events: [],
    };
  }

  const issues: AuditLedgerIntegrityIssue[] = [];
  const events: AuditEvent[] = [];
  let verifiedEventCount = 0;
  let legacyEventCount = 0;
  let parseErrorCount = 0;
  let latestSequence = 0;
  let latestHash: string | null = null;
  let previousTimestamp: number | undefined;
  let expectedPreviousHash: string | null = null;

  const lines = fs.readFileSync(ledgerPath, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    let candidate: unknown;
    try {
      candidate = JSON.parse(line);
    } catch (error) {
      parseErrorCount++;
      issues.push({
        line: lineNumber,
        code: "AUDIT_EVENT_UNPARSEABLE",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (!isRecord(candidate)) {
      parseErrorCount++;
      issues.push({
        line: lineNumber,
        code: "AUDIT_EVENT_UNPARSEABLE",
        message: "Audit ledger line is not a JSON object.",
      });
      return;
    }

    const event = candidate as unknown as AuditEvent;
    events.push(event);

    for (const field of ["version", "id", "type", "timestamp", "actor", "reason", "sourceArtifact", "affectedContracts"]) {
      if (event[field as keyof AuditEvent] === undefined) {
        issues.push({
          line: lineNumber,
          code: "AUDIT_EVENT_SCHEMA_MISSING_FIELD",
          message: `Audit event is missing required field ${field}.`,
        });
      }
    }

    const sequence = typeof event.sequence === "number" && Number.isInteger(event.sequence)
      ? event.sequence
      : lineNumber;
    if (event.sequence === undefined || event.previousHash === undefined || event.eventHash === undefined) {
      legacyEventCount++;
      issues.push({
        line: lineNumber,
        code: "AUDIT_EVENT_LEGACY_UNCHAINED",
        message: "Audit event predates hash-chain fields and cannot fully prove append order.",
      });
    } else {
      if (sequence !== lineNumber) {
        issues.push({
          line: lineNumber,
          code: "AUDIT_EVENT_SEQUENCE_GAP",
          message: `Expected sequence ${lineNumber}, got ${sequence}.`,
        });
      }
      if (event.previousHash !== expectedPreviousHash) {
        issues.push({
          line: lineNumber,
          code: "AUDIT_EVENT_PREVIOUS_HASH_MISMATCH",
          message: `Expected previousHash ${expectedPreviousHash ?? "null"}, got ${String(event.previousHash)}.`,
        });
      }
      const computedHash = hashAuditEvent(event);
      if (event.eventHash !== computedHash) {
        issues.push({
          line: lineNumber,
          code: "AUDIT_EVENT_HASH_MISMATCH",
          message: "Audit event hash does not match its canonical content.",
        });
      } else {
        verifiedEventCount++;
      }
    }

    const timestamp = new Date(String(event.timestamp ?? "")).getTime();
    if (!Number.isNaN(timestamp)) {
      if (previousTimestamp !== undefined && timestamp < previousTimestamp) {
        issues.push({
          line: lineNumber,
          code: "AUDIT_EVENT_TIMESTAMP_OUT_OF_ORDER",
          message: "Audit event timestamp is earlier than the previous event.",
        });
      }
      previousTimestamp = timestamp;
    }

    latestSequence = Math.max(latestSequence, sequence);
    latestHash = event.eventHash ?? hashLegacyAuditEvent(event);
    expectedPreviousHash = latestHash;
  });

  const hasInvalidIssue = issues.some((issue) => [
    "AUDIT_EVENT_UNPARSEABLE",
    "AUDIT_EVENT_SCHEMA_MISSING_FIELD",
    "AUDIT_EVENT_SEQUENCE_GAP",
    "AUDIT_EVENT_HASH_MISMATCH",
    "AUDIT_EVENT_PREVIOUS_HASH_MISMATCH",
    "AUDIT_EVENT_TIMESTAMP_OUT_OF_ORDER",
  ].includes(issue.code));

  return {
    ledgerPath,
    status: hasInvalidIssue ? "invalid" : issues.length > 0 ? "warning" : "verified",
    eventCount: events.length,
    verifiedEventCount,
    legacyEventCount,
    parseErrorCount,
    latestSequence,
    latestHash,
    issues,
    events,
  };
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

function hashAuditEvent(event: Omit<AuditEvent, "eventHash"> | AuditEvent): string {
  return crypto.createHash("sha256").update(JSON.stringify(sortObject(stripHashFields(event)))).digest("hex");
}

function hashLegacyAuditEvent(event: AuditEvent): string {
  return crypto.createHash("sha256").update(JSON.stringify(sortObject(stripHashFields(event)))).digest("hex");
}

function stripHashFields(event: Omit<AuditEvent, "eventHash"> | AuditEvent): Record<string, unknown> {
  const { eventHash: _eventHash, signature: _signature, ...rest } = event as AuditEvent;
  return rest;
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortObject(entry)]),
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
