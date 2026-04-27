import crypto from "node:crypto";
import type { VerifyIssue } from "./verdict";

/**
 * Normalize issue input for fingerprint computation.
 * This ensures consistent fingerprints across different runs.
 */
export function normalizeIssueFingerprintInput(issue: VerifyIssue): string {
  const normalizedPath = issue.path ? normalizePath(issue.path) : "";
  const normalizedMessage = normalizeMessage(issue.message);

  return [
    issue.kind,
    issue.code,
    normalizedPath,
    normalizedMessage,
  ].join("|");
}

/**
 * Compute a stable fingerprint for a verify issue.
 * This fingerprint is used for baseline and waiver matching.
 */
export function computeIssueFingerprint(issue: VerifyIssue): string {
  const input = normalizeIssueFingerprintInput(issue);
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Check if an issue matches the given code and optional path.
 * Used for waiver matching when fingerprint is not available.
 */
export function issueMatchesCodeAndPath(
  issue: VerifyIssue,
  code: string,
  path?: string,
): boolean {
  if (issue.code !== code) {
    return false;
  }

  if (path === undefined) {
    return true;
  }

  if (issue.path === undefined) {
    return false;
  }

  return normalizePath(issue.path) === normalizePath(path);
}

/**
 * Normalize file path for consistent comparison.
 * Converts backslashes to forward slashes and removes leading/trailing slashes.
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

/**
 * Normalize message for consistent comparison.
 * Trims whitespace and normalizes line endings.
 */
function normalizeMessage(message: string): string {
  return stripOperationalPrefixes(message.trim().replace(/\r\n/g, "\n"));
}

function stripOperationalPrefixes(message: string): string {
  let normalized = message;
  const prefixes = [
    /^\[BASELINED\]\s*/i,
    /^\[OBSERVE\]\s*/i,
    /^\[HISTORICAL_DEBT\]\s*/i,
    /^\[WAIVED by [^\]]+\]\s*/i,
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of prefixes) {
      if (prefix.test(normalized)) {
        normalized = normalized.replace(prefix, "");
        changed = true;
      }
    }
  }

  return normalized;
}
