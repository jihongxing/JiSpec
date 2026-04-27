import { execSync } from "node:child_process";
import path from "node:path";

/**
 * Classification of changed paths.
 */
export type ChangedPathKind =
  | "contract"
  | "domain_core"
  | "api_surface"
  | "behavior_surface"
  | "test_only"
  | "docs_only"
  | "config"
  | "unknown";

/**
 * Result of classifying a single changed path.
 */
export interface ClassifiedPath {
  path: string;
  kind: ChangedPathKind;
}

/**
 * Result of classifying all changed paths.
 */
export interface GitDiffClassification {
  changedPaths: ClassifiedPath[];
  strictReasons: string[];
  fastEligible: boolean;
}

/**
 * Get changed paths from git diff.
 */
export function getChangedPaths(root: string, baseRef: string = "HEAD"): string[] {
  try {
    const output = execSync(`git diff --name-only ${baseRef}`, {
      cwd: root,
      encoding: "utf-8",
      stdio: "pipe",
    });
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch (error) {
    // If git diff fails, return empty array
    return [];
  }
}

/**
 * Classify a single path.
 */
export function classifyPath(filePath: string): ChangedPathKind {
  const normalized = filePath.replace(/\\/g, "/");

  // Contract assets (highest priority)
  if (
    normalized.startsWith(".spec/contracts/") ||
    normalized.includes("/slice.yaml") ||
    normalized.includes("/requirements.md") ||
    normalized.includes("/design.md") ||
    normalized.includes("/behaviors.feature") ||
    normalized.includes("/trace.yaml") ||
    normalized.includes("/test-spec.yaml")
  ) {
    return "contract";
  }

  // API surface
  if (
    normalized.includes("/routes/") ||
    normalized.includes("/controllers/") ||
    normalized.includes("/api/") ||
    normalized.includes("/endpoints/") ||
    normalized.includes("openapi") ||
    normalized.includes("swagger") ||
    normalized.match(/\/(schema|model|entity|migration)s?\//i)
  ) {
    return "api_surface";
  }

  // Domain core
  if (
    normalized.includes("/domain/") ||
    normalized.includes("/aggregate") ||
    normalized.includes("/repository") ||
    normalized.includes("/service") ||
    normalized.match(/\/(entity|value-object)s?\//i)
  ) {
    return "domain_core";
  }

  // Behavior surface
  if (
    normalized.endsWith(".feature") ||
    normalized.includes("/behaviors/") ||
    normalized.includes("/scenarios/")
  ) {
    return "behavior_surface";
  }

  // Test only
  if (
    normalized.match(/\.(test|spec)\.(ts|js|tsx|jsx)$/) ||
    normalized.includes("/__tests__/") ||
    normalized.includes("/tests/") ||
    normalized.includes("/test/")
  ) {
    return "test_only";
  }

  // Docs only
  if (
    normalized.endsWith(".md") ||
    normalized.endsWith(".txt") ||
    normalized.startsWith("docs/") ||
    normalized === "README.md"
  ) {
    return "docs_only";
  }

  // Config
  if (
    normalized.match(/\.(json|yaml|yml|toml|ini)$/) ||
    normalized.includes("package.json") ||
    normalized.includes("tsconfig") ||
    normalized.includes(".config.") ||
    normalized.startsWith(".github/") ||
    normalized.startsWith(".gitlab/")
  ) {
    return "config";
  }

  return "unknown";
}

/**
 * Classify all changed paths and determine fast lane eligibility.
 */
export function classifyGitDiff(root: string, baseRef: string = "HEAD"): GitDiffClassification {
  const changedPaths = getChangedPaths(root, baseRef);
  const classified: ClassifiedPath[] = changedPaths.map((p) => ({
    path: p,
    kind: classifyPath(p),
  }));

  const strictReasons: string[] = [];
  let fastEligible = true;

  // Check for strict triggers
  for (const cp of classified) {
    if (cp.kind === "contract") {
      strictReasons.push(`changed path hits contract asset: ${cp.path}`);
      fastEligible = false;
    } else if (cp.kind === "api_surface") {
      strictReasons.push(`changed path hits api surface: ${cp.path}`);
      fastEligible = false;
    } else if (cp.kind === "domain_core") {
      strictReasons.push(`changed path hits domain core: ${cp.path}`);
      fastEligible = false;
    } else if (cp.kind === "behavior_surface") {
      strictReasons.push(`changed path hits behavior surface: ${cp.path}`);
      fastEligible = false;
    } else if (cp.kind === "unknown") {
      // Unknown paths are treated as strict by default (conservative)
      strictReasons.push(`changed path is unknown/unclassified: ${cp.path}`);
      fastEligible = false;
    }
  }

  // Fast lane is only eligible if all changes are docs_only, test_only, or safe config
  if (fastEligible && classified.length > 0) {
    const allSafe = classified.every(
      (cp) => cp.kind === "docs_only" || cp.kind === "test_only"
    );
    if (!allSafe) {
      // If there are config changes mixed with safe changes, be conservative
      const hasConfig = classified.some((cp) => cp.kind === "config");
      if (hasConfig) {
        strictReasons.push("config changes require strict verification");
        fastEligible = false;
      }
    }
  }

  return {
    changedPaths: classified,
    strictReasons,
    fastEligible,
  };
}
