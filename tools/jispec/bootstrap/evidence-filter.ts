import path from "node:path";
import { normalizeEvidencePath, type EvidenceExclusionSummary } from "./evidence-graph";

export interface EvidenceExclusionMatch {
  ruleId: string;
  reason: string;
}

interface EvidenceExclusionRule {
  ruleId: string;
  reason: string;
  matches(input: {
    normalizedPath: string;
    lowerPath: string;
    segments: string[];
    fileName: string;
    isDirectory: boolean;
  }): boolean;
}

const INTERNAL_STATE_SEGMENTS = new Set([".git", ".jispec", ".jispec-cache", ".spec"]);
const DEPENDENCY_SEGMENTS = new Set([
  "node_modules",
  "vendor",
  "vendors",
  "third_party",
  "third-party",
  "bower_components",
]);
const PYTHON_CACHE_AND_ENV_SEGMENTS = new Set([
  ".pytest_cache",
  ".ruff_cache",
  ".mypy_cache",
  "__pycache__",
  ".tox",
  ".nox",
  ".venv",
  "venv",
  "env",
]);
const BUILD_OUTPUT_SEGMENTS = new Set([
  "dist",
  "build",
  "out",
  "target",
  "coverage",
  ".coverage",
  ".next",
  ".turbo",
  ".cache",
]);
const GENERATED_SEGMENTS = new Set(["generated", "__generated__", ".generated", "autogen"]);

const DEFAULT_EXCLUSION_RULES: EvidenceExclusionRule[] = [
  {
    ruleId: "internal-state",
    reason: "JiSpec, git, and local tool state are not takeover evidence.",
    matches: ({ segments }) => segments.some((segment) => INTERNAL_STATE_SEGMENTS.has(segment)),
  },
  {
    ruleId: "dependency-bundle",
    reason: "Vendored and installed dependencies are not repository product evidence.",
    matches: ({ segments }) => segments.some((segment) => DEPENDENCY_SEGMENTS.has(segment)),
  },
  {
    ruleId: "python-cache-or-env",
    reason: "Python caches and virtual environments are generated local runtime state.",
    matches: ({ segments }) => segments.some((segment) => PYTHON_CACHE_AND_ENV_SEGMENTS.has(segment)),
  },
  {
    ruleId: "build-output",
    reason: "Build, coverage, and framework output directories are generated artifacts.",
    matches: ({ segments }) => segments.some((segment) => BUILD_OUTPUT_SEGMENTS.has(segment)),
  },
  {
    ruleId: "audit-artifact",
    reason: "Audit output and mirrored dependency artifacts should not drive takeover ranking.",
    matches: ({ lowerPath, segments }) =>
      lowerPath.startsWith("artifacts/") ||
      lowerPath.includes("/artifacts/") ||
      segments.includes("dpi-audit") ||
      lowerPath.includes(".pydeps/"),
  },
  {
    ruleId: "generated-bundle",
    reason: "Generated bundle directories should not be treated as source-of-truth evidence.",
    matches: ({ segments, fileName, isDirectory }) =>
      segments.some((segment) => GENERATED_SEGMENTS.has(segment)) ||
      (isDirectory && (fileName.endsWith("-generated") || fileName.endsWith("_generated"))),
  },
  {
    ruleId: "minified-bundle",
    reason: "Minified bundles are generated outputs, not human-authored contract evidence.",
    matches: ({ fileName, isDirectory }) => !isDirectory && (fileName.endsWith(".min.js") || fileName.endsWith(".bundle.js")),
  },
];

export function getEvidenceExclusionMatch(repoPathInput: string, options: { isDirectory: boolean }): EvidenceExclusionMatch | undefined {
  const normalizedPath = normalizeEvidencePath(repoPathInput).replace(/^\/+/, "").replace(/\/+$/, "");
  if (normalizedPath.length === 0) {
    return undefined;
  }

  const lowerPath = normalizedPath.toLowerCase();
  const segments = lowerPath.split("/").filter(Boolean);
  const fileName = path.basename(lowerPath);

  for (const rule of DEFAULT_EXCLUSION_RULES) {
    if (rule.matches({ normalizedPath, lowerPath, segments, fileName, isDirectory: options.isDirectory })) {
      return {
        ruleId: rule.ruleId,
        reason: rule.reason,
      };
    }
  }

  return undefined;
}

export class EvidenceExclusionSummaryBuilder {
  private readonly counts = new Map<string, { reason: string; fileCount: number; examplePaths: Set<string> }>();

  record(match: EvidenceExclusionMatch, repoPath: string, fileCount = 1): void {
    const normalizedPath = normalizeEvidencePath(repoPath);
    const existing = this.counts.get(match.ruleId) ?? {
      reason: match.reason,
      fileCount: 0,
      examplePaths: new Set<string>(),
    };

    existing.fileCount += Math.max(0, Math.trunc(fileCount));
    if (existing.examplePaths.size < 5) {
      existing.examplePaths.add(normalizedPath);
    }
    this.counts.set(match.ruleId, existing);
  }

  toSummary(): EvidenceExclusionSummary {
    const rules = [...this.counts.entries()]
      .map(([ruleId, value]) => ({
        ruleId,
        reason: value.reason,
        fileCount: value.fileCount,
        examplePaths: [...value.examplePaths].sort((left, right) => left.localeCompare(right)),
      }))
      .filter((rule) => rule.fileCount > 0)
      .sort((left, right) => left.ruleId.localeCompare(right.ruleId));

    return {
      totalExcludedFileCount: rules.reduce((sum, rule) => sum + rule.fileCount, 0),
      rules,
    };
  }
}
