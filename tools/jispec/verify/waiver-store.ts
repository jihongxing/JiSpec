import fs from "node:fs";
import path from "node:path";
import { appendAuditEvent, readAuditEvents } from "../audit/event-ledger";
import { computeIssueFingerprint, issueMatchesCodeAndPath } from "./issue-fingerprint";
import { createVerifyRunResult } from "./verdict";
import type { VerifyIssue, VerifyRunResult } from "./verdict";

export interface VerifyWaiver {
  id: string;
  status?: "active" | "revoked";
  ruleId?: string;
  issueCode?: string;
  issuePath?: string;
  issueFingerprint?: string;
  owner: string;
  reason: string;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
  revokedBy?: string;
  revokeReason?: string;
}

export interface WaiverCreateOptions {
  code?: string;
  path?: string;
  fingerprint?: string;
  ruleId?: string;
  owner: string;
  reason: string;
  expiresAt?: string;
  actor?: string;
}

export interface WaiverCreateResult {
  waiver: VerifyWaiver;
  filePath: string;
}

export interface WaiverRevokeOptions {
  revokedBy: string;
  reason: string;
}

export interface WaiverRevokeResult {
  waiver: VerifyWaiver;
  filePath: string;
}

export interface WaiverRenewOptions {
  actor: string;
  reason: string;
  expiresAt: string;
}

export interface WaiverExpireAuditOptions {
  now?: Date;
  actor?: string;
  reason?: string;
}

export interface WaiverApplyResult {
  totalIssues: number;
  waivedIssues: number;
  matchedWaiverIds: string[];
  unmatchedActiveWaiverIds: string[];
  result: VerifyRunResult;
}

export interface WaiverLifecycleSummary {
  total: number;
  active: number;
  expired: number;
  revoked: number;
  invalid: number;
  activeIds: string[];
  expiredIds: string[];
  revokedIds: string[];
  invalidIds: string[];
}

const WAIVER_DIR = ".spec/waivers";

/**
 * Create a new waiver.
 */
export function createWaiver(root: string, options: WaiverCreateOptions): WaiverCreateResult {
  validateWaiverCreateOptions(options);
  const waiverDir = path.join(root, WAIVER_DIR);

  if (!fs.existsSync(waiverDir)) {
    fs.mkdirSync(waiverDir, { recursive: true });
  }

  const id = generateWaiverId();
  const waiver: VerifyWaiver = {
    id,
    status: "active",
    ruleId: options.ruleId,
    issueCode: options.code,
    issuePath: options.path,
    issueFingerprint: options.fingerprint,
    owner: options.owner,
    reason: options.reason,
    createdAt: new Date().toISOString(),
    expiresAt: options.expiresAt,
  };

  const filePath = path.join(waiverDir, `${id}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(waiver, null, 2)}\n`, "utf-8");
  appendAuditEvent(root, {
    type: "waiver_create",
    actor: options.actor ?? options.owner,
    reason: options.reason,
    sourceArtifact: {
      kind: "verify-waiver",
      path: filePath,
    },
    affectedContracts: describeAffectedWaiverContracts(waiver),
    details: {
      waiverId: waiver.id,
      matcher: describeWaiverMatcher(waiver),
      expiresAt: waiver.expiresAt,
    },
  });

  return { waiver, filePath };
}

export function revokeWaiver(root: string, waiverId: string, options: WaiverRevokeOptions): WaiverRevokeResult {
  validateWaiverRevokeOptions(options);
  const filePath = path.join(root, WAIVER_DIR, `${waiverId}.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Waiver not found: ${waiverId}`);
  }

  const waiver = JSON.parse(fs.readFileSync(filePath, "utf-8")) as VerifyWaiver;
  if (waiver.status === "revoked") {
    throw new Error(`Waiver is already revoked: ${waiverId}`);
  }

  const revoked: VerifyWaiver = {
    ...waiver,
    status: "revoked",
    revokedAt: new Date().toISOString(),
    revokedBy: options.revokedBy,
    revokeReason: options.reason,
  };

  fs.writeFileSync(filePath, `${JSON.stringify(revoked, null, 2)}\n`, "utf-8");
  appendAuditEvent(root, {
    type: "waiver_revoke",
    actor: options.revokedBy,
    reason: options.reason,
    sourceArtifact: {
      kind: "verify-waiver",
      path: filePath,
    },
    affectedContracts: describeAffectedWaiverContracts(revoked),
    details: {
      waiverId: revoked.id,
      matcher: describeWaiverMatcher(revoked),
      revokedAt: revoked.revokedAt,
    },
  });
  return { waiver: revoked, filePath };
}

export function renewWaiver(root: string, waiverId: string, options: WaiverRenewOptions): WaiverCreateResult {
  validateWaiverRenewOptions(options);
  const filePath = path.join(root, WAIVER_DIR, `${waiverId}.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Waiver not found: ${waiverId}`);
  }

  const waiver = JSON.parse(fs.readFileSync(filePath, "utf-8")) as VerifyWaiver;
  if (waiver.status === "revoked") {
    throw new Error(`Cannot renew revoked waiver: ${waiverId}`);
  }

  const renewed: VerifyWaiver = {
    ...waiver,
    status: "active",
    expiresAt: options.expiresAt,
  };

  fs.writeFileSync(filePath, `${JSON.stringify(renewed, null, 2)}\n`, "utf-8");
  appendAuditEvent(root, {
    type: "waiver_renew",
    actor: options.actor,
    reason: options.reason,
    sourceArtifact: {
      kind: "verify-waiver",
      path: filePath,
    },
    affectedContracts: describeAffectedWaiverContracts(renewed),
    details: {
      waiverId: renewed.id,
      matcher: describeWaiverMatcher(renewed),
      previousExpiresAt: waiver.expiresAt,
      nextExpiresAt: renewed.expiresAt,
    },
  });
  return { waiver: renewed, filePath };
}

/**
 * List all waivers (including expired ones).
 */
export function listWaivers(root: string): VerifyWaiver[] {
  const waiverDir = path.join(root, WAIVER_DIR);

  if (!fs.existsSync(waiverDir)) {
    return [];
  }

  const files = fs.readdirSync(waiverDir).filter((f) => f.endsWith(".json"));
  const waivers: VerifyWaiver[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(waiverDir, file), "utf-8");
      const waiver = JSON.parse(content) as VerifyWaiver;
      waivers.push(waiver);
    } catch (error) {
      console.warn(`Failed to load waiver ${file}: ${error}`);
    }
  }

  return waivers;
}

/**
 * Load active (non-expired) waivers.
 */
export function loadActiveWaivers(root: string, now?: Date): VerifyWaiver[] {
  const allWaivers = listWaivers(root);
  const currentTime = now ?? new Date();

  return allWaivers.filter((waiver) => isWaiverActive(waiver, currentTime));
}

export function summarizeWaiverLifecycle(root: string, now?: Date): WaiverLifecycleSummary {
  const currentTime = now ?? new Date();
  const activeIds: string[] = [];
  const expiredIds: string[] = [];
  const revokedIds: string[] = [];
  const invalidIds: string[] = [];

  for (const waiver of listWaivers(root)) {
    if (!isWaiverShapeValid(waiver)) {
      invalidIds.push(waiver.id ?? "unknown");
    } else if (isWaiverRevoked(waiver)) {
      revokedIds.push(waiver.id);
    } else if (isWaiverExpired(waiver, currentTime)) {
      expiredIds.push(waiver.id);
    } else {
      activeIds.push(waiver.id);
    }
  }

  return {
    total: activeIds.length + expiredIds.length + revokedIds.length + invalidIds.length,
    active: activeIds.length,
    expired: expiredIds.length,
    revoked: revokedIds.length,
    invalid: invalidIds.length,
    activeIds: stableSort(activeIds),
    expiredIds: stableSort(expiredIds),
    revokedIds: stableSort(revokedIds),
    invalidIds: stableSort(invalidIds),
  };
}

export function recordExpiredWaiverAuditEvents(root: string, options: WaiverExpireAuditOptions = {}): VerifyWaiver[] {
  const currentTime = options.now ?? new Date();
  const alreadyRecorded = new Set(
    readAuditEvents(root)
      .filter((event) => event.type === "waiver_expire")
      .map((event) => event.details ? String(event.details.waiverId ?? "") : "")
      .filter(Boolean),
  );
  const expired = listWaivers(root)
    .filter((waiver) => isWaiverShapeValid(waiver))
    .filter((waiver) => !isWaiverRevoked(waiver) && isWaiverExpired(waiver, currentTime))
    .filter((waiver) => !alreadyRecorded.has(waiver.id));

  for (const waiver of expired) {
    appendAuditEvent(root, {
      type: "waiver_expire",
      actor: options.actor ?? waiver.owner,
      reason: options.reason ?? `Waiver ${waiver.id} expired at ${waiver.expiresAt}.`,
      sourceArtifact: {
        kind: "verify-waiver",
        path: path.join(root, WAIVER_DIR, `${waiver.id}.json`),
      },
      affectedContracts: describeAffectedWaiverContracts(waiver),
      details: {
        waiverId: waiver.id,
        matcher: describeWaiverMatcher(waiver),
        expiresAt: waiver.expiresAt,
      },
    });
  }

  return expired;
}

/**
 * Check if a waiver is expired.
 */
export function isWaiverExpired(waiver: VerifyWaiver, now?: Date): boolean {
  if (!waiver.expiresAt) {
    return false;
  }

  const currentTime = now ?? new Date();
  const expiresAt = new Date(waiver.expiresAt);

  return currentTime > expiresAt;
}

export function isWaiverRevoked(waiver: VerifyWaiver): boolean {
  return waiver.status === "revoked";
}

/**
 * Apply waivers to verify result.
 * Waived issues are downgraded to advisory severity.
 */
export function applyWaivers(
  result: VerifyRunResult,
  waivers: VerifyWaiver[],
): WaiverApplyResult {
  const waivedIssues: VerifyIssue[] = [];
  const remainingIssues: VerifyIssue[] = [];
  const matchedWaiverIds = new Set<string>();
  const activeWaiverIds = new Set(waivers.map((waiver) => waiver.id));

  for (const issue of result.issues) {
    const matchingWaiver = findMatchingWaiver(issue, waivers);

    if (matchingWaiver) {
      matchedWaiverIds.add(matchingWaiver.id);
      waivedIssues.push({
        ...issue,
        severity: "advisory",
        details: mergeIssueDetails(issue.details, {
          matched_by: "waiver",
          waiver_id: matchingWaiver.id,
          waiver_owner: matchingWaiver.owner,
          waiver_reason: matchingWaiver.reason,
          waiver_expires_at: matchingWaiver.expiresAt,
          waiver_matcher: describeWaiverMatcher(matchingWaiver),
          original_severity: issue.severity,
        }),
      });
    } else {
      remainingIssues.push(issue);
    }
  }

  const waiverIds = stableSort([...matchedWaiverIds]);
  const unmatchedActiveWaiverIds = stableSort([...activeWaiverIds].filter((id) => !matchedWaiverIds.has(id)));

  const recomputed = createVerifyRunResult(
    result.root,
    [...remainingIssues, ...waivedIssues],
    {
      sources: result.sources,
      generatedAt: result.generatedAt,
    },
  );

  return {
    totalIssues: result.issues.length,
    waivedIssues: waivedIssues.length,
    matchedWaiverIds: waiverIds,
    unmatchedActiveWaiverIds,
    result: {
      ...recomputed,
      metadata: {
        ...result.metadata,
        waiversApplied: matchedWaiverIds.size,
        waiverIds,
        unmatchedActiveWaiverIds,
      },
    },
  };
}

/**
 * Find a matching waiver for an issue.
 */
function findMatchingWaiver(issue: VerifyIssue, waivers: VerifyWaiver[]): VerifyWaiver | null {
  for (const waiver of waivers) {
    // Match by fingerprint (most specific)
    if (waiver.issueFingerprint) {
      const issueFingerprint = computeIssueFingerprint(issue);
      if (issueFingerprint === waiver.issueFingerprint) {
        return waiver;
      }
      continue;
    }

    // Match by code and path
    if (waiver.issueCode) {
      if (issueMatchesCodeAndPath(issue, waiver.issueCode, waiver.issuePath)) {
        return waiver;
      }
      continue;
    }

    // Match by ruleId (reserved for future use)
    if (waiver.ruleId) {
      // TODO: implement rule-based matching in Task Pack 5
      continue;
    }
  }

  return null;
}

/**
 * Generate a unique waiver ID.
 */
function generateWaiverId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `waiver-${timestamp}-${random}`;
}

function validateWaiverCreateOptions(options: WaiverCreateOptions): void {
  if (!options.owner || options.owner.trim().length === 0) {
    throw new Error("Waiver owner is required.");
  }

  if (!options.reason || options.reason.trim().length === 0) {
    throw new Error("Waiver reason is required.");
  }

  if (!options.code && !options.fingerprint && !options.ruleId) {
    throw new Error("Waiver must specify at least one matcher: code, fingerprint, or ruleId.");
  }

  if (options.expiresAt) {
    const expiresAt = new Date(options.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      throw new Error(`Waiver expiration is not a valid ISO timestamp: ${options.expiresAt}`);
    }
  }
}

function validateWaiverRevokeOptions(options: WaiverRevokeOptions): void {
  if (!options.revokedBy || options.revokedBy.trim().length === 0) {
    throw new Error("Waiver revoke actor is required.");
  }

  if (!options.reason || options.reason.trim().length === 0) {
    throw new Error("Waiver revoke reason is required.");
  }
}

function validateWaiverRenewOptions(options: WaiverRenewOptions): void {
  if (!options.actor || !options.actor.trim()) {
    throw new Error("Waiver renew actor is required.");
  }
  if (!options.reason || !options.reason.trim()) {
    throw new Error("Waiver renew reason is required.");
  }
  const expiresAt = new Date(options.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new Error(`Waiver expiration is not a valid ISO timestamp: ${options.expiresAt}`);
  }
}

function isWaiverActive(waiver: VerifyWaiver, now: Date): boolean {
  return isWaiverShapeValid(waiver) && !isWaiverRevoked(waiver) && !isWaiverExpired(waiver, now);
}

function isWaiverShapeValid(waiver: VerifyWaiver): boolean {
  if (!waiver.id || !waiver.owner || !waiver.reason || !waiver.createdAt) {
    return false;
  }
  if (waiver.status !== undefined && waiver.status !== "active" && waiver.status !== "revoked") {
    return false;
  }
  if (waiver.expiresAt && Number.isNaN(new Date(waiver.expiresAt).getTime())) {
    return false;
  }
  return Boolean(waiver.issueCode || waiver.issueFingerprint || waiver.ruleId);
}

function describeWaiverMatcher(waiver: VerifyWaiver): "fingerprint" | "code_path" | "rule_id" {
  if (waiver.issueFingerprint) {
    return "fingerprint";
  }
  if (waiver.issueCode) {
    return "code_path";
  }
  return "rule_id";
}

function describeAffectedWaiverContracts(waiver: VerifyWaiver): string[] {
  return [
    waiver.ruleId ? `rule:${waiver.ruleId}` : undefined,
    waiver.issueCode ? `issue:${waiver.issueCode}` : undefined,
    waiver.issuePath ? `path:${waiver.issuePath}` : undefined,
    waiver.issueFingerprint ? `fingerprint:${waiver.issueFingerprint}` : undefined,
  ].filter((entry): entry is string => Boolean(entry));
}

function stableSort(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function mergeIssueDetails(details: unknown, annotation: Record<string, unknown>): unknown {
  if (details && typeof details === "object" && !Array.isArray(details)) {
    return {
      ...(details as Record<string, unknown>),
      ...annotation,
    };
  }

  if (details === undefined) {
    return annotation;
  }

  return {
    previous_details: details,
    ...annotation,
  };
}
