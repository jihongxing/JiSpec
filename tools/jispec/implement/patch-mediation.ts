import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ChangeSession } from "../change/change-session";

export type PatchMediationStatus =
  | "accepted"
  | "rejected_out_of_scope"
  | "apply_failed";

export interface PatchMediationTestSummary {
  command: string;
  passed: boolean;
  exitCode: number;
  duration: number;
  errorMessage?: string;
}

export interface PatchMediationVerifySummary {
  command: string;
  verdict: string;
  ok: boolean;
  exitCode: number;
  issueCount: number;
  blockingIssueCount: number;
  advisoryIssueCount: number;
  nonBlockingErrorCount: number;
}

export interface PatchMediationArtifact {
  version: 1;
  sessionId: string;
  createdAt: string;
  completedAt?: string;
  externalPatchPath: string;
  status: PatchMediationStatus;
  touchedPaths: string[];
  allowedPaths: string[];
  violations: string[];
  applied: boolean;
  applyExitCode?: number;
  applyStdout?: string;
  applyStderr?: string;
  test?: PatchMediationTestSummary;
  postVerify?: PatchMediationVerifySummary;
}

export interface PatchScopeValidation {
  valid: boolean;
  allowedPaths: string[];
  violations: string[];
}

export interface PatchMediationResult {
  artifact: PatchMediationArtifact;
  artifactPath: string;
}

export function parseUnifiedDiffChangedPaths(diffContent: string): string[] {
  const touched = new Set<string>();

  for (const rawLine of diffContent.split(/\r?\n/)) {
    const line = rawLine.trimEnd();

    if (line.startsWith("diff --git ")) {
      const match = /^diff --git\s+a\/(.+?)\s+b\/(.+)$/.exec(line);
      if (match) {
        addNormalizedPath(touched, match[1]);
        addNormalizedPath(touched, match[2]);
      }
      continue;
    }

    if (line.startsWith("+++ ") || line.startsWith("--- ")) {
      const fileToken = line.slice(4).split("\t")[0].trim();
      addNormalizedPath(touched, stripDiffPrefix(fileToken));
      continue;
    }

    if (line.startsWith("rename from ")) {
      addNormalizedPath(touched, line.slice("rename from ".length));
      continue;
    }

    if (line.startsWith("rename to ")) {
      addNormalizedPath(touched, line.slice("rename to ".length));
    }
  }

  return Array.from(touched).sort((left, right) => left.localeCompare(right));
}

export function validatePatchScope(touchedPaths: string[], session: ChangeSession): PatchScopeValidation {
  const allowedPaths = Array.from(
    new Set(
      session.changedPaths
        .map((entry) => normalizeRepoPath(entry.path))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  ).sort((left, right) => left.localeCompare(right));

  const violations: string[] = [];

  if (touchedPaths.length === 0) {
    violations.push("patch has no parseable changed paths");
  }

  for (const touchedPath of touchedPaths) {
    if (!allowedPaths.some((allowedPath) => isPathWithinAllowedScope(touchedPath, allowedPath))) {
      violations.push(`out-of-scope path: ${touchedPath}`);
    }
  }

  return {
    valid: violations.length === 0,
    allowedPaths,
    violations,
  };
}

export function mediateExternalPatch(
  root: string,
  session: ChangeSession,
  externalPatchPath: string,
): PatchMediationResult {
  const patchPath = path.resolve(root, externalPatchPath);
  const patchContent = fs.readFileSync(patchPath, "utf-8");
  const touchedPaths = parseUnifiedDiffChangedPaths(patchContent);
  const scope = validatePatchScope(touchedPaths, session);
  const createdAt = new Date().toISOString();

  const artifact: PatchMediationArtifact = {
    version: 1,
    sessionId: session.id,
    createdAt,
    externalPatchPath: formatPatchPath(root, patchPath),
    status: scope.valid ? "accepted" : "rejected_out_of_scope",
    touchedPaths,
    allowedPaths: scope.allowedPaths,
    violations: scope.violations,
    applied: false,
  };

  if (!scope.valid) {
    artifact.completedAt = new Date().toISOString();
    const artifactPath = writePatchMediationArtifact(root, artifact);
    return { artifact, artifactPath };
  }

  const applyResult = spawnSync("git", ["apply", "--whitespace=nowarn", patchPath], {
    cwd: root,
    encoding: "utf-8",
  });

  artifact.applyExitCode = applyResult.status ?? 1;
  artifact.applyStdout = applyResult.stdout ?? "";
  artifact.applyStderr = applyResult.stderr ?? "";

  if ((applyResult.status ?? 1) === 0) {
    artifact.applied = true;
  } else {
    artifact.status = "apply_failed";
    artifact.violations = [
      ...artifact.violations,
      artifact.applyStderr.trim() || artifact.applyStdout.trim() || "git apply failed",
    ];
    artifact.completedAt = new Date().toISOString();
  }

  const artifactPath = writePatchMediationArtifact(root, artifact);
  return { artifact, artifactPath };
}

export function writePatchMediationArtifact(root: string, artifact: PatchMediationArtifact): string {
  const artifactDir = path.join(root, ".jispec", "implement", artifact.sessionId);
  fs.mkdirSync(artifactDir, { recursive: true });

  const artifactPath = path.join(artifactDir, "patch-mediation.json");
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2), "utf-8");
  return artifactPath;
}

function addNormalizedPath(target: Set<string>, candidate: string): void {
  const normalized = normalizeRepoPath(candidate);
  if (normalized) {
    target.add(normalized);
  }
}

function stripDiffPrefix(candidate: string): string {
  if (candidate === "/dev/null") {
    return candidate;
  }

  return candidate.replace(/^"?[ab]\//, "").replace(/"$/, "");
}

function normalizeRepoPath(candidate: string): string | null {
  const stripped = candidate.trim().replace(/^"|"$/g, "");
  if (!stripped || stripped === "/dev/null") {
    return null;
  }

  const normalized = path.posix.normalize(stripped.replace(/\\/g, "/"));
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized === ".." ||
    path.isAbsolute(normalized)
  ) {
    return null;
  }

  return normalized;
}

function isPathWithinAllowedScope(touchedPath: string, allowedPath: string): boolean {
  if (touchedPath === allowedPath) {
    return true;
  }

  const directoryScope = allowedPath.endsWith("/") ? allowedPath : `${allowedPath}/`;
  return touchedPath.startsWith(directoryScope);
}

function formatPatchPath(root: string, patchPath: string): string {
  const relative = path.relative(root, patchPath).replace(/\\/g, "/");
  if (!relative.startsWith("../") && relative !== ".." && !path.isAbsolute(relative)) {
    return relative;
  }

  return patchPath.replace(/\\/g, "/");
}
