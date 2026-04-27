import fs from "node:fs";
import path from "node:path";
import { computeIssueFingerprint, issueMatchesCodeAndPath } from "./issue-fingerprint";
import { createVerifyRunResult } from "./verdict";
import type { VerifyIssue, VerifyRunResult } from "./verdict";

export interface VerifyWaiver {
  id: string;
  ruleId?: string;
  issueCode?: string;
  issuePath?: string;
  issueFingerprint?: string;
  owner: string;
  reason: string;
  createdAt: string;
  expiresAt?: string;
}

export interface WaiverCreateOptions {
  code?: string;
  path?: string;
  fingerprint?: string;
  ruleId?: string;
  owner: string;
  reason: string;
  expiresAt?: string;
}

export interface WaiverCreateResult {
  waiver: VerifyWaiver;
  filePath: string;
}

export interface WaiverApplyResult {
  totalIssues: number;
  waivedIssues: number;
  matchedWaiverIds: string[];
  result: VerifyRunResult;
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

  return { waiver, filePath };
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

  return allWaivers.filter((waiver) => !isWaiverExpired(waiver, currentTime));
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
          original_severity: issue.severity,
        }),
      });
    } else {
      remainingIssues.push(issue);
    }
  }

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
    matchedWaiverIds: [...matchedWaiverIds].sort((left, right) => left.localeCompare(right)),
    result: {
      ...recomputed,
      metadata: {
        ...result.metadata,
        waiversApplied: matchedWaiverIds.size,
        waiverIds: [...matchedWaiverIds].sort((left, right) => left.localeCompare(right)),
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
