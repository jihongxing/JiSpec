import path from "node:path";
import { normalizeEvidencePath, type EvidenceExclusionSummary } from "./evidence-graph";

export interface EvidenceExclusionMatch {
  ruleId: string;
  reason: string;
  optInHint?: string;
}

interface EvidenceExclusionRule {
  ruleId: string;
  reason: string;
  optInHint?: string;
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
  ".pnpm",
  ".pnpm-store",
  ".yarn",
  "vendor",
  "vendors",
  "third_party",
  "third-party",
  "bower_components",
  "jspm_packages",
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
  "htmlcov",
  ".coverage",
  ".nyc_output",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".parcel-cache",
  ".turbo",
  ".cache",
  "tmp",
  "temp",
]);
const GENERATED_SEGMENTS = new Set(["generated", "__generated__", ".generated", "autogen", "codegen", "gen"]);
const AUDIT_SEGMENTS = new Set([
  "artifacts",
  "audit",
  "audits",
  "dpi-audit",
  "dependency-audit",
  "dependency-review",
  "security-audit",
  "osv-scanner",
  "trivy",
  "syft",
]);
const TOOL_MIRROR_SEGMENTS = new Set([
  ".gradle",
  ".idea",
  ".vscode",
  ".scannerwork",
  ".sonar",
  ".terraform",
  ".serverless",
  ".vitest",
]);

const DEFAULT_OPT_IN_HINT = "Pass `jispec-cli bootstrap discover --include-noise` to include this class of files intentionally.";

const DEFAULT_EXCLUSION_RULES: EvidenceExclusionRule[] = [
  {
    ruleId: "internal-state",
    reason: "JiSpec, git, and local tool state are not takeover evidence.",
    optInHint: "Internal state is intentionally excluded from takeover evidence and should not usually be opted in.",
    matches: ({ segments }) => segments.some((segment) => INTERNAL_STATE_SEGMENTS.has(segment)),
  },
  {
    ruleId: "dependency-bundle",
    reason: "Vendored and installed dependencies are not repository product evidence.",
    optInHint: DEFAULT_OPT_IN_HINT,
    matches: ({ lowerPath, segments }) =>
      segments.some((segment) => DEPENDENCY_SEGMENTS.has(segment)) ||
      lowerPath.includes("/.yarn/cache/") ||
      lowerPath.includes("/vendor/bundle/"),
  },
  {
    ruleId: "python-cache-or-env",
    reason: "Python caches and virtual environments are generated local runtime state.",
    optInHint: DEFAULT_OPT_IN_HINT,
    matches: ({ segments }) => segments.some((segment) => PYTHON_CACHE_AND_ENV_SEGMENTS.has(segment)),
  },
  {
    ruleId: "build-output",
    reason: "Build, coverage, and framework output directories are generated artifacts.",
    optInHint: DEFAULT_OPT_IN_HINT,
    matches: ({ lowerPath, segments }) =>
      segments.some((segment) => BUILD_OUTPUT_SEGMENTS.has(segment)) ||
      lowerPath.endsWith("/coverage-final.json") ||
      lowerPath.endsWith("/lcov.info"),
  },
  {
    ruleId: "audit-artifact",
    reason: "Audit output and mirrored dependency artifacts should not drive takeover ranking.",
    optInHint: DEFAULT_OPT_IN_HINT,
    matches: ({ lowerPath, segments }) =>
      segments.some((segment) => AUDIT_SEGMENTS.has(segment)) ||
      lowerPath.includes(".pydeps/"),
  },
  {
    ruleId: "tool-mirror",
    reason: "Tool mirrors, IDE metadata, and scanner work directories are local/tooling state rather than product evidence.",
    optInHint: DEFAULT_OPT_IN_HINT,
    matches: ({ segments }) => segments.some((segment) => TOOL_MIRROR_SEGMENTS.has(segment)),
  },
  {
    ruleId: "generated-bundle",
    reason: "Generated code and generated bundle directories should not be treated as source-of-truth evidence.",
    optInHint: DEFAULT_OPT_IN_HINT,
    matches: ({ segments, fileName, isDirectory }) =>
      segments.some((segment) => GENERATED_SEGMENTS.has(segment)) ||
      (isDirectory && (fileName.endsWith("-generated") || fileName.endsWith("_generated"))) ||
      (!isDirectory &&
        (fileName.includes(".generated.") ||
          fileName.includes(".gen.") ||
          fileName.endsWith("_pb.go") ||
          fileName.endsWith(".pb.go") ||
          fileName.endsWith(".g.cs") ||
          fileName.endsWith(".designer.cs"))),
  },
  {
    ruleId: "minified-bundle",
    reason: "Minified bundles are generated outputs, not human-authored contract evidence.",
    optInHint: DEFAULT_OPT_IN_HINT,
    matches: ({ fileName, isDirectory }) => !isDirectory && (fileName.endsWith(".min.js") || fileName.endsWith(".bundle.js")),
  },
];

export function getEvidenceExclusionMatch(repoPathInput: string, options: { isDirectory: boolean; includeNoise?: boolean }): EvidenceExclusionMatch | undefined {
  if (options.includeNoise === true) {
    return undefined;
  }

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
        optInHint: rule.optInHint,
      };
    }
  }

  return undefined;
}

export class EvidenceExclusionSummaryBuilder {
  private readonly counts = new Map<string, { reason: string; optInHint?: string; fileCount: number; examplePaths: Set<string> }>();

  record(match: EvidenceExclusionMatch, repoPath: string, fileCount = 1): void {
    const normalizedPath = normalizeEvidencePath(repoPath);
    const existing = this.counts.get(match.ruleId) ?? {
      reason: match.reason,
      optInHint: match.optInHint,
      fileCount: 0,
      examplePaths: new Set<string>(),
    };

    existing.optInHint = existing.optInHint ?? match.optInHint;
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
        optInHint: value.optInHint,
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
