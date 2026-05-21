import fs from "node:fs";
import path from "node:path";
import { createFactsContract } from "../facts/facts-contract";
import { loadVerifyPolicy, policyFileExists, resolvePolicyPath } from "../policy/policy-loader";
import { extractPolicyFactKeysForRule, validatePolicyAgainstFactsContract } from "../policy/policy-schema";
import type { VerifyPolicy } from "../policy/policy-schema";
import type { VerifyIssue, VerifyRunResult } from "./verdict";

export type GateCoverageStatus = "ok" | "attention" | "blocked" | "not_available_yet";
export type ArtifactFreshnessStatus = "fresh" | "stale" | "missing" | "invalid" | "not_available_yet";

export interface VerifyGateArtifactFreshness {
  id: "ci_report" | "policy" | "baseline" | "release_compare" | "impact_graph";
  path: string;
  status: ArtifactFreshnessStatus;
  generatedAt?: string;
  reason: string;
  nextCommand: string;
}

export interface VerifyGateStackCoverage {
  id: "node_typescript" | "python" | "go_or_java";
  status: "detected" | "not_detected";
  evidence: string[];
}

export interface VerifyGatePolicyStableFactGuard {
  status: GateCoverageStatus;
  policyPath: string;
  blockingRuleCount: number;
  unstableBlockingRuleCount: number;
  unknownFactCount: number;
  factsContractVersion: string;
  guardedRules: Array<{
    id: string;
    action: string;
    factKeys: string[];
    stableOnly: boolean;
  }>;
  nextCommand: string;
}

export interface VerifyGateIssueNextAction {
  code: string;
  severity: VerifyIssue["severity"];
  path?: string;
  owner: string;
  nextCommand: string;
  sourceArtifact: string;
  rationale: string;
}

export interface VerifyGateCoverageReport {
  phase: "north-star-score-optimization-phase-5";
  status: GateCoverageStatus;
  stackCoverage: {
    detectedCount: number;
    requiredClassCoverage: ["node_typescript", "python", "go_or_java"];
    fixtures: VerifyGateStackCoverage[];
  };
  artifactFreshness: VerifyGateArtifactFreshness[];
  policyStableFactGuard: VerifyGatePolicyStableFactGuard;
  issueNextActions: VerifyGateIssueNextAction[];
  topNextCommand: string;
}

interface BuildVerifyGateCoverageOptions {
  root: string;
  result: VerifyRunResult;
  generatedAt?: string;
  policyPath?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildVerifyGateCoverageReport(options: BuildVerifyGateCoverageOptions): VerifyGateCoverageReport {
  const root = path.resolve(options.root);
  const generatedAt = options.generatedAt ?? options.result.generatedAt;
  const artifactFreshness = buildArtifactFreshness(root, generatedAt, options.result);
  const issueNextActions = buildIssueNextActions(options.result);
  const policyStableFactGuard = buildPolicyStableFactGuard(root, options.policyPath);
  const fixtures = detectStackCoverage(root);
  const detectedCount = fixtures.filter((entry) => entry.status === "detected").length;
  const status = computeGateCoverageStatus(artifactFreshness, policyStableFactGuard);

  return {
    phase: "north-star-score-optimization-phase-5",
    status,
    stackCoverage: {
      detectedCount,
      requiredClassCoverage: ["node_typescript", "python", "go_or_java"],
      fixtures,
    },
    artifactFreshness,
    policyStableFactGuard,
    issueNextActions,
    topNextCommand: issueNextActions[0]?.nextCommand ?? "npm run jispec-cli -- verify",
  };
}

function detectStackCoverage(root: string): VerifyGateStackCoverage[] {
  return [
    {
      id: "node_typescript",
      status: hasAny(root, ["package.json", "tsconfig.json", "pnpm-lock.yaml", "yarn.lock"]) ? "detected" : "not_detected",
      evidence: existing(root, ["package.json", "tsconfig.json", "pnpm-lock.yaml", "yarn.lock"]),
    },
    {
      id: "python",
      status: hasAny(root, ["pyproject.toml", "requirements.txt", "setup.py", "poetry.lock"]) ? "detected" : "not_detected",
      evidence: existing(root, ["pyproject.toml", "requirements.txt", "setup.py", "poetry.lock"]),
    },
    {
      id: "go_or_java",
      status: hasAny(root, ["go.mod", "pom.xml", "build.gradle", "build.gradle.kts"]) ? "detected" : "not_detected",
      evidence: existing(root, ["go.mod", "pom.xml", "build.gradle", "build.gradle.kts"]),
    },
  ];
}

function buildArtifactFreshness(root: string, generatedAt: string, result: VerifyRunResult): VerifyGateArtifactFreshness[] {
  const impactGraphFreshness = typeof result.metadata?.impactGraphFreshness === "string"
    ? result.metadata.impactGraphFreshness
    : "not_available_yet";
  const impactGraphPath = typeof result.metadata?.impactGraphPath === "string"
    ? result.metadata.impactGraphPath
    : ".spec/deltas/<changeId>/impact-graph.json";
  const impactGraphReason = typeof result.metadata?.impactGraphFreshnessReason === "string"
    ? result.metadata.impactGraphFreshnessReason
    : "Impact graph has not been generated for the active change.";
  const impactReplay = typeof result.metadata?.impactGraphNextReplayCommand === "string"
    ? result.metadata.impactGraphNextReplayCommand
    : "npm run jispec-cli -- change \"<summary>\" --json";

  return [
    classifyGeneratedArtifact({
      root,
      id: "ci_report",
      path: ".jispec-ci/verify-report.json",
      generatedAt,
      maxAgeDays: 7,
      missingNextCommand: "npm run ci:verify",
    }),
    classifyGeneratedArtifact({
      root,
      id: "policy",
      path: ".spec/policy.yaml",
      generatedAt,
      maxAgeDays: 30,
      missingNextCommand: "npm run jispec-cli -- policy migrate",
    }),
    classifyGeneratedArtifact({
      root,
      id: "baseline",
      path: ".spec/baselines/verify-baseline.json",
      generatedAt,
      maxAgeDays: 30,
      missingNextCommand: "npm run jispec-cli -- verify --write-baseline",
    }),
    classifyLatestReleaseCompare(root, generatedAt),
    {
      id: "impact_graph",
      path: impactGraphPath,
      status: normalizeImpactFreshness(impactGraphFreshness),
      generatedAt: typeof result.metadata?.impactGraphFreshnessGeneratedAt === "string"
        ? result.metadata.impactGraphFreshnessGeneratedAt
        : undefined,
      reason: impactGraphReason,
      nextCommand: impactReplay,
    },
  ];
}

function buildPolicyStableFactGuard(root: string, policyPathInput?: string): VerifyGatePolicyStableFactGuard {
  const factsContract = createFactsContract();
  const resolvedPolicyPath = resolvePolicyPath(root, policyPathInput);
  const relativePolicyPath = normalizePath(root, resolvedPolicyPath);
  if (!policyFileExists(root, policyPathInput)) {
    return {
      status: "not_available_yet",
      policyPath: relativePolicyPath,
      blockingRuleCount: 0,
      unstableBlockingRuleCount: 0,
      unknownFactCount: 0,
      factsContractVersion: factsContract.version,
      guardedRules: [],
      nextCommand: "npm run jispec-cli -- policy migrate",
    };
  }

  let policy: VerifyPolicy | null = null;
  try {
    policy = loadVerifyPolicy(root, policyPathInput);
  } catch {
    return {
      status: "blocked",
      policyPath: relativePolicyPath,
      blockingRuleCount: 0,
      unstableBlockingRuleCount: 0,
      unknownFactCount: 0,
      factsContractVersion: factsContract.version,
      guardedRules: [],
      nextCommand: "npm run jispec-cli -- policy migrate",
    };
  }

  if (!policy) {
    return {
      status: "not_available_yet",
      policyPath: relativePolicyPath,
      blockingRuleCount: 0,
      unstableBlockingRuleCount: 0,
      unknownFactCount: 0,
      factsContractVersion: factsContract.version,
      guardedRules: [],
      nextCommand: "npm run jispec-cli -- policy migrate",
    };
  }

  const validation = validatePolicyAgainstFactsContract(policy, factsContract);
  const stableFactKeys = new Set(factsContract.facts.filter((fact) => fact.stability === "stable").map((fact) => fact.key));
  const guardedRules = policy.rules
    .filter((rule) => rule.action === "fail_blocking")
    .map((rule) => {
      const factKeys = extractPolicyFactKeysForRule(rule);
      return {
        id: rule.id,
        action: rule.action,
        factKeys,
        stableOnly: factKeys.every((key) => stableFactKeys.has(key)),
      };
    });
  const unstableBlockingRuleCount = guardedRules.filter((rule) => !rule.stableOnly).length;
  const unknownFactCount = validation.issues
    .filter((issue) => issue.code === "POLICY_UNKNOWN_FACT")
    .reduce((sum, issue) => sum + (issue.factKeys?.length ?? 0), 0);

  return {
    status: validation.valid ? "ok" : "blocked",
    policyPath: relativePolicyPath,
    blockingRuleCount: guardedRules.length,
    unstableBlockingRuleCount,
    unknownFactCount,
    factsContractVersion: factsContract.version,
    guardedRules,
    nextCommand: validation.valid ? "npm run jispec-cli -- verify" : "npm run jispec-cli -- policy migrate",
  };
}

function buildIssueNextActions(result: VerifyRunResult): VerifyGateIssueNextAction[] {
  return result.issues.map((issue) => ({
    code: issue.code,
    severity: issue.severity,
    path: issue.path,
    owner: inferOwner(issue),
    nextCommand: inferIssueNextCommand(issue),
    sourceArtifact: issue.path ?? ".jispec-ci/verify-report.json",
    rationale: inferIssueRationale(issue),
  }));
}

function computeGateCoverageStatus(
  freshness: VerifyGateArtifactFreshness[],
  policy: VerifyGatePolicyStableFactGuard,
): GateCoverageStatus {
  if (policy.status === "blocked" || freshness.some((entry) => entry.status === "invalid")) {
    return "blocked";
  }
  if (freshness.some((entry) => entry.status === "stale")) {
    return "attention";
  }
  return "ok";
}

function classifyGeneratedArtifact(input: {
  root: string;
  id: VerifyGateArtifactFreshness["id"];
  path: string;
  generatedAt: string;
  maxAgeDays: number;
  missingNextCommand: string;
}): VerifyGateArtifactFreshness {
  const absolutePath = path.join(input.root, input.path);
  if (!fs.existsSync(absolutePath)) {
    return {
      id: input.id,
      path: input.path,
      status: "missing",
      reason: `${input.path} has not been produced yet.`,
      nextCommand: input.missingNextCommand,
    };
  }

  const parsed = readJsonObject(absolutePath);
  if (parsed === "invalid") {
    if (input.path.endsWith(".yaml") || input.path.endsWith(".yml")) {
      return {
        id: input.id,
        path: input.path,
        status: "fresh",
        reason: `${input.path} exists and is parsed by its owner command.`,
        nextCommand: "npm run jispec-cli -- verify",
      };
    }
    return {
      id: input.id,
      path: input.path,
      status: "invalid",
      reason: `${input.path} exists but is not readable JSON.`,
      nextCommand: input.missingNextCommand,
    };
  }

  const artifactGeneratedAt = firstString(parsed, ["generatedAt", "generated_at", "updatedAt", "createdAt"]);
  if (!artifactGeneratedAt) {
    return {
      id: input.id,
      path: input.path,
      status: "fresh",
      reason: `${input.path} exists but has no timestamp; treating presence as current local evidence.`,
      nextCommand: "npm run jispec-cli -- verify",
    };
  }

  const stale = isOlderThan(artifactGeneratedAt, input.generatedAt, input.maxAgeDays);
  return {
    id: input.id,
    path: input.path,
    status: stale ? "stale" : "fresh",
    generatedAt: artifactGeneratedAt,
    reason: stale
      ? `${input.path} is older than ${input.maxAgeDays} day(s) relative to this verify run.`
      : `${input.path} is within the ${input.maxAgeDays} day freshness window.`,
    nextCommand: stale ? input.missingNextCommand : "npm run jispec-cli -- verify",
  };
}

function classifyLatestReleaseCompare(root: string, generatedAt: string): VerifyGateArtifactFreshness {
  const trend = readJsonObject(path.join(root, ".spec", "releases", "drift-trend.json"));
  const trendRecord = trend && trend !== "invalid" ? trend : undefined;
  const latest = isRecord(trendRecord?.latest) ? trendRecord.latest : undefined;
  const reportPath = typeof latest?.reportPath === "string"
    ? latest.reportPath
    : findLatestReleaseCompareReport(root);
  if (!reportPath) {
    return {
      id: "release_compare",
      path: ".spec/releases/compare/<from>-to-<to>/compare-report.json",
      status: "missing",
      reason: "No release compare report is available yet.",
      nextCommand: "npm run jispec-cli -- release compare --from <from> --to <to>",
    };
  }

  const report = readJsonObject(path.join(root, reportPath));
  if (report === "invalid") {
    return {
      id: "release_compare",
      path: reportPath,
      status: "invalid",
      reason: "Latest release compare report is not readable JSON.",
      nextCommand: "npm run jispec-cli -- release compare --from <from> --to <to>",
    };
  }

  const artifactGeneratedAt = firstString(report, ["generatedAt", "generated_at", "createdAt"])
    ?? firstString(trendRecord, ["generatedAt", "generated_at", "createdAt"]);
  const stale = artifactGeneratedAt ? isOlderThan(artifactGeneratedAt, generatedAt, 14) : false;
  return {
    id: "release_compare",
    path: reportPath,
    status: stale ? "stale" : "fresh",
    generatedAt: artifactGeneratedAt,
    reason: stale
      ? "Latest release compare is older than 14 day(s) relative to this verify run."
      : "Latest release compare is available for local gate context.",
    nextCommand: stale ? "npm run jispec-cli -- release compare --from <from> --to <to>" : "npm run jispec-cli -- verify",
  };
}

function findLatestReleaseCompareReport(root: string): string | undefined {
  const compareRoot = path.join(root, ".spec", "releases", "compare");
  if (!fs.existsSync(compareRoot)) {
    return undefined;
  }

  return fs.readdirSync(compareRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(".spec", "releases", "compare", entry.name, "compare-report.json").replace(/\\/g, "/"))
    .filter((entry) => fs.existsSync(path.join(root, entry)))
    .sort((left, right) => left.localeCompare(right))
    .at(-1);
}

function normalizeImpactFreshness(value: string): ArtifactFreshnessStatus {
  if (value === "fresh" || value === "stale" || value === "invalid" || value === "not_available_yet") {
    return value;
  }
  return "not_available_yet";
}

function inferOwner(issue: VerifyIssue): string {
  if (issue.code.startsWith("POLICY_")) {
    return "policy owner";
  }
  if (issue.code.includes("WAIVER")) {
    return "governance reviewer";
  }
  if (issue.kind === "missing_file") {
    return "artifact owner";
  }
  if (issue.kind === "runtime_error") {
    return "tooling owner";
  }
  return "repo owner / reviewer";
}

function inferIssueNextCommand(issue: VerifyIssue): string {
  if (issue.code === "POLICY_BLOCKING_RULE_USES_UNSTABLE_FACT" || issue.code === "POLICY_UNKNOWN_FACT") {
    return "npm run jispec-cli -- policy migrate";
  }
  if (issue.code.includes("WAIVER")) {
    return "npm run jispec-cli -- console actions";
  }
  if (issue.kind === "missing_file") {
    return "npm run jispec-cli -- verify";
  }
  if (issue.kind === "runtime_error") {
    return "npm run jispec-cli -- doctor mainline";
  }
  return "npm run jispec-cli -- verify";
}

function inferIssueRationale(issue: VerifyIssue): string {
  if (issue.severity === "blocking") {
    return "Blocking verify issue must be fixed, waived, or explicitly deferred before merge.";
  }
  if (issue.severity === "nonblocking_error") {
    return "Non-blocking runtime error should be inspected without overriding deterministic verify results.";
  }
  return "Advisory issue should be reviewed before merge or tracked as governance debt.";
}

function hasAny(root: string, candidates: string[]): boolean {
  return candidates.some((candidate) => fs.existsSync(path.join(root, candidate)));
}

function existing(root: string, candidates: string[]): string[] {
  return candidates.filter((candidate) => fs.existsSync(path.join(root, candidate)));
}

function readJsonObject(filePath: string): Record<string, unknown> | "invalid" | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return isRecord(parsed) ? parsed : "invalid";
  } catch {
    return "invalid";
  }
}

function firstString(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    if (typeof record[key] === "string" && Number.isFinite(Date.parse(record[key] as string))) {
      return record[key] as string;
    }
  }
  return undefined;
}

function isOlderThan(left: string, right: string, maxAgeDays: number): boolean {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
    return false;
  }
  return rightTime - leftTime > maxAgeDays * DAY_MS;
}

function normalizePath(root: string, target: string): string {
  return path.relative(root, target).replace(/\\/g, "/") || path.basename(target);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
