import path from "node:path";
import fs from "node:fs";
import { loadBootstrapTakeoverReport } from "../bootstrap/takeover";
import { runLegacyRepositoryValidation } from "./legacy-validator-adapter";
import {
  createVerifyRunResult,
  formatVerifyCountSummary,
  toVerifyJSONPayload,
  type VerifyIssue,
  type VerifyRunResult,
} from "./verdict";
import {
  applyVerifyBaseline,
  loadVerifyBaseline,
  writeVerifyBaseline,
  type BaselineApplyResult,
} from "./baseline-store";
import { applyObserveMode, type ObserveModeResult } from "./observe-mode";
import {
  applyWaivers,
  loadActiveWaivers,
  type WaiverApplyResult,
} from "./waiver-store";
import { createRawFactsSnapshot, addRawFact, stableSortRawFacts, type RawFactsSnapshot } from "../facts/raw-facts";
import { buildCanonicalFacts, stableSortCanonicalFacts, type CanonicalFactsSnapshot } from "../facts/canonical-facts";
import { createFactsContract } from "../facts/facts-contract";
import { loadVerifyPolicy, policyFileExists, resolvePolicyPath } from "../policy/policy-loader";
import { evaluateVerifyPolicy } from "../policy/policy-engine";
import { validatePolicyAgainstFactsContract } from "../policy/policy-schema";
import { classifyGitDiff } from "../change/git-diff-classifier";
import { computeLaneDecision } from "../change/lane-decision";
import { collectBootstrapTakeoverIssues } from "./bootstrap-takeover-collector";
import { collectContractAssetIssues, isContractScopedPath } from "./contract-asset-collector";

export interface VerifySupplementalCollector {
  source: string;
  collect(root: string, options: VerifyRunOptions): Promise<VerifyIssue[]> | VerifyIssue[];
}

export interface VerifyRunOptions {
  root: string;
  strict?: boolean;
  supplementalCollectors?: VerifySupplementalCollector[];
  generatedAt?: string;
  useBaseline?: boolean;
  writeBaseline?: boolean;
  observe?: boolean;
  applyWaivers?: boolean;
  policyPath?: string;
  factsOutPath?: string;
  fast?: boolean;
}

const DEFAULT_SUPPLEMENTAL_COLLECTORS: VerifySupplementalCollector[] = [
  {
    source: "contract-assets",
    collect(root) {
      return collectContractAssetIssues(root);
    },
  },
  {
    source: "bootstrap-takeover",
    collect(root) {
      return collectBootstrapTakeoverIssues(root);
    },
  },
];

export async function runVerify(options: VerifyRunOptions): Promise<VerifyRunResult> {
  const root = path.resolve(options.root);

  // Handle fast lane precheck
  if (options.fast) {
    const laneCheck = await checkFastLaneEligibility(root);
    if (!laneCheck.eligible) {
      // Auto-promote to strict
      console.log("Fast lane requested but auto-promoted to strict:");
      for (const reason of laneCheck.reasons) {
        console.log(`- ${reason}`);
      }
      const result = await runFullVerify(root, options);
      result.metadata = {
        ...result.metadata,
        lane: "strict",
        requestedFast: true,
        fastAutoPromoted: true,
        fastPromotionReasons: laneCheck.reasons,
      };
      return result;
    } else {
      // Mark as fast lane in metadata
      const result = await runFullVerify(root, options);
      result.metadata = {
        ...result.metadata,
        lane: "fast",
        requestedFast: true,
        fastAutoPromoted: false,
      };
      return result;
    }
  }

  return runFullVerify(root, options);
}

async function runFullVerify(root: string, options: VerifyRunOptions): Promise<VerifyRunResult> {
  const factsContract = createFactsContract();
  const sources: string[] = ["legacy-validator"];
  const legacyIssues = reconcileLegacyIssuesWithTakeover(await collectLegacyIssues(root), root);
  const supplementalResult = await collectSupplementalIssues(root, options.strict === true, options);

  for (const source of supplementalResult.sources) {
    sources.push(source);
  }

  let result = createVerifyRunResult(
    root,
    mergeVerifyIssues(legacyIssues, supplementalResult.issues),
    {
      sources,
      generatedAt: options.generatedAt,
    },
  );
  result.metadata = {
    ...result.metadata,
    factsContractVersion: factsContract.version,
  };

  // Write baseline if requested
  if (options.writeBaseline) {
    writeVerifyBaseline(root, result);
  }

  // Build facts and apply policy if requested
  const rawFacts = await buildRawFactsSnapshot(result, options);
  const canonicalFacts = buildCanonicalFacts(rawFacts);

  // Write facts if requested
  if (options.factsOutPath) {
    await writeFactsSnapshot(root, canonicalFacts, options.factsOutPath);
  }

  // Apply policy hook if a policy is configured on disk or explicitly requested.
  result = await applyPolicyHook(result, canonicalFacts, factsContract, options);

  // Apply post-processing in order: waivers -> baseline -> observe
  result = await applyPostProcessing(result, options);

  return result;
}

export function renderVerifyText(result: VerifyRunResult): string {
  const lines = [
    `JiSpec verify verdict: ${result.verdict}`,
    `Root: ${result.root}`,
    `Summary: ${formatVerifyCountSummary(result)}`,
    `Sources: ${result.sources.join(", ") || "none"}`,
    `Generated at: ${result.generatedAt}`,
  ];

  // Add metadata information
  if (result.metadata) {
    if (result.metadata.requestedFast) {
      const lane = result.metadata.lane === "fast" ? "fast" : "strict";
      const promotion = result.metadata.fastAutoPromoted ? " (auto-promoted from fast)" : "";
      lines.push(`Lane: ${lane}${promotion}`);
      if (Array.isArray(result.metadata.fastPromotionReasons) && result.metadata.fastPromotionReasons.length > 0) {
        lines.push(`Fast precheck: ${result.metadata.fastPromotionReasons.join("; ")}`);
      }
    }
    if (result.metadata.baselineApplied) {
      const matchCount =
        typeof result.metadata.baselineMatchCount === "number" ? `, matched ${result.metadata.baselineMatchCount}` : "";
      lines.push(`Baseline: applied (created at ${result.metadata.baselineCreatedAt}${matchCount})`);
    }
    if (result.metadata.waiversApplied) {
      lines.push(`Waivers: ${result.metadata.waiversApplied} matched`);
    }
    if (result.metadata.observeMode) {
      const downgraded =
        typeof result.metadata.observeBlockingDowngraded === "number"
          ? `, downgraded ${result.metadata.observeBlockingDowngraded} blocking issue(s)`
          : "";
      lines.push(`Observe mode: enabled (original verdict: ${result.metadata.originalVerdict}${downgraded})`);
    }
    if (typeof result.metadata.policyPath === "string") {
      const matchedRules = Array.isArray(result.metadata.matchedPolicyRules)
        ? `${result.metadata.matchedPolicyRules.length} matched rule(s)`
        : "policy evaluated";
      lines.push(`Policy: ${result.metadata.policyPath} (${matchedRules})`);
    }
  }

  if (result.issues.length === 0) {
    lines.push("No issues found.");
    return lines.join("\n");
  }

  lines.push("Issues:");

  for (const issue of result.issues) {
    const location = issue.path ? ` ${issue.path}` : "";
    lines.push(`- [${issue.severity}/${issue.kind}/${issue.code}]${location}: ${issue.message}`);
  }

  return lines.join("\n");
}

export function renderVerifyJSON(result: VerifyRunResult): string {
  return JSON.stringify(toVerifyJSONPayload(result), null, 2);
}

async function collectLegacyIssues(root: string): Promise<VerifyIssue[]> {
  try {
    return runLegacyRepositoryValidation(root);
  } catch (error) {
    return [normalizeRuntimeError(error, "legacy-validator")];
  }
}

async function collectSupplementalIssues(
  root: string,
  strict: boolean,
  options: VerifyRunOptions,
): Promise<{ issues: VerifyIssue[]; sources: string[] }> {
  const collectors = [
    ...DEFAULT_SUPPLEMENTAL_COLLECTORS,
    ...(options.supplementalCollectors ?? []),
  ];

  const issues: VerifyIssue[] = [];
  const sources: string[] = [];

  for (const collector of collectors) {
    try {
      const collectorIssues = await collector.collect(root, { ...options, root, strict });
      if (!Array.isArray(collectorIssues)) {
        throw new Error(`Collector '${collector.source}' returned a non-array result.`);
      }

      if (collectorIssues.length > 0) {
        sources.push(collector.source);
      }
      issues.push(...collectorIssues);
    } catch (error) {
      sources.push(collector.source);
      issues.push(normalizeRuntimeError(error, collector.source));
    }
  }

  return { issues, sources };
}

function mergeVerifyIssues(...issueSets: VerifyIssue[][]): VerifyIssue[] {
  const merged: VerifyIssue[] = [];
  const seen = new Set<string>();

  for (const issueSet of issueSets) {
    for (const issue of issueSet) {
      const key = [
        issue.severity,
        issue.kind,
        issue.code,
        issue.path ?? "",
        issue.message,
      ].join("|");

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push(issue);
    }
  }

  return merged;
}

function normalizeRuntimeError(error: unknown, source: string): VerifyIssue {
  const message = error instanceof Error ? error.message : String(error);

  return {
    kind: "runtime_error",
    severity: "nonblocking_error",
    code: "VERIFY_RUNTIME_ERROR",
    path: source,
    message: `Verify source '${source}' failed: ${message}`,
    details: error instanceof Error ? { name: error.name, message: error.message } : { message },
  };
}

async function buildRawFactsSnapshot(
  result: VerifyRunResult,
  options: VerifyRunOptions,
): Promise<RawFactsSnapshot> {
  const snapshot = createRawFactsSnapshot(options.root);

  // Add verify facts
  addRawFact(snapshot, "verify.issue_count", result.issueCount, "verify-runner");
  addRawFact(snapshot, "verify.blocking_issue_count", result.blockingIssueCount, "verify-runner");

  const issueCodes = Array.from(new Set(result.issues.map((i) => i.code))).sort();
  addRawFact(snapshot, "verify.issue_codes", issueCodes, "verify-runner");
  addRawFact(snapshot, "verify.contract_issue_count", result.issues.filter((issue) => isContractScopedIssue(issue)).length, "verify-runner");

  // Add contract presence facts
  const contractsDir = path.join(options.root, ".spec", "contracts");
  addRawFact(snapshot, "contracts.domain.present", fs.existsSync(path.join(contractsDir, "domain.yaml")), "verify-runner");
  addRawFact(snapshot, "contracts.api.present", fs.existsSync(path.join(contractsDir, "api_spec.json")), "verify-runner");
  addRawFact(snapshot, "contracts.behavior.present", fs.existsSync(path.join(contractsDir, "behaviors.feature")), "verify-runner");

  const takeoverReport = loadBootstrapTakeoverReport(options.root);
  addRawFact(snapshot, "bootstrap.takeover.present", Boolean(takeoverReport && takeoverReport.status === "committed"), "verify-runner");
  addRawFact(snapshot, "bootstrap.adopted_contract_count", takeoverReport?.adoptedArtifactPaths.length ?? 0, "verify-runner");
  addRawFact(snapshot, "bootstrap.spec_debt_count", takeoverReport?.specDebtPaths.length ?? 0, "verify-runner");
  addRawFact(snapshot, "bootstrap.rejected_artifact_kinds", takeoverReport?.rejectedArtifactKinds ?? [], "verify-runner");
  addRawFact(snapshot, "bootstrap.historical_debt_issue_count", result.issues.filter((issue) => isHistoricalDebtIssue(issue)).length, "verify-runner");

  return stableSortRawFacts(snapshot);
}

async function writeFactsSnapshot(
  root: string,
  facts: CanonicalFactsSnapshot,
  outputPath: string,
): Promise<void> {
  const resolvedPath = path.isAbsolute(outputPath) ? outputPath : path.join(root, outputPath);
  const dir = path.dirname(resolvedPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sorted = stableSortCanonicalFacts(facts);
  fs.writeFileSync(resolvedPath, JSON.stringify(sorted, null, 2), "utf-8");
}

async function applyPolicyHook(
  result: VerifyRunResult,
  facts: CanonicalFactsSnapshot,
  factsContract: ReturnType<typeof createFactsContract>,
  options: VerifyRunOptions,
): Promise<VerifyRunResult> {
  const policyPath = resolvePolicyPath(options.root, options.policyPath);
  const policyExists = policyFileExists(options.root, options.policyPath);

  if (!policyExists) {
    if (options.policyPath) {
      return appendVerifyIssues(result, [
        createPolicyRuntimeIssue(
          "POLICY_FILE_NOT_FOUND",
          `Policy file not found: ${policyPath}`,
          normalizeOutputPath(options.root, policyPath),
        ),
      ]);
    }
    return result;
  }

  let policy;
  try {
    policy = loadVerifyPolicy(options.root, options.policyPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return appendVerifyIssues(result, [
      createPolicyRuntimeIssue(
        "POLICY_LOAD_FAILED",
        message,
        normalizeOutputPath(options.root, policyPath),
      ),
    ]);
  }

  if (!policy) {
    return result;
  }

  const contractValidation = validatePolicyAgainstFactsContract(policy, factsContract);
  if (!contractValidation.valid) {
    return appendVerifyIssues(
      result,
      contractValidation.issues.map((issue) =>
        createPolicyRuntimeIssue(
          issue.code,
          issue.message,
          normalizeOutputPath(options.root, policyPath),
          {
            factKeys: issue.factKeys,
            ruleId: issue.ruleId,
          },
        ),
      ),
      {
        matchedPolicyRules: [],
        policyPath: normalizeOutputPath(options.root, policyPath),
        policyFactsContractRequired: policy.requires?.facts_contract,
      },
    );
  }

  const evaluation = evaluateVerifyPolicy(policy, facts);
  const policyRuntimeWarnings = evaluation.warnings.map((warning) =>
    createPolicyRuntimeIssue(
      "POLICY_EVALUATION_WARNING",
      warning,
      normalizeOutputPath(options.root, policyPath),
    ),
  );

  // Merge policy-generated issues with existing issues
  const allIssues = mergeVerifyIssues(result.issues, evaluation.generatedIssues, policyRuntimeWarnings);

  const nextResult = createVerifyRunResult(result.root, allIssues, {
    sources: [...result.sources, "policy-engine"],
    generatedAt: result.generatedAt,
  });
  nextResult.metadata = {
    ...result.metadata,
    policyPath: normalizeOutputPath(options.root, policyPath),
    policyFactsContractRequired: policy.requires?.facts_contract,
    matchedPolicyRules: evaluation.matchedRules.map((rule) => rule.ruleId),
  };
  return nextResult;
}

async function applyPostProcessing(
  result: VerifyRunResult,
  options: VerifyRunOptions,
): Promise<VerifyRunResult> {
  let processedResult = result;

  // Step 1: Apply waivers
  if (options.applyWaivers !== false) {
    const waivers = loadActiveWaivers(options.root);
    if (waivers.length > 0) {
      const waiverResult = applyWaivers(processedResult, waivers);
      processedResult = waiverResult.result;
    }
  }

  // Step 2: Apply baseline
  if (options.useBaseline) {
    const baseline = loadVerifyBaseline(options.root);
    if (baseline) {
      const baselineResult = applyVerifyBaseline(processedResult, baseline);
      processedResult = baselineResult.result;
    }
  }

  // Step 3: Apply observe mode
  if (options.observe) {
    const observeResult = applyObserveMode(processedResult);
    processedResult = observeResult.result;
  }

  return processedResult;
}

/**
 * Check if fast lane is eligible based on git diff.
 */
async function checkFastLaneEligibility(root: string): Promise<{ eligible: boolean; reasons: string[] }> {
  const classification = classifyGitDiff(root, "HEAD");
  const decision = computeLaneDecision(classification, "fast");

  return {
    eligible: decision.lane === "fast",
    reasons: decision.reasons,
  };
}

function reconcileLegacyIssuesWithTakeover(legacyIssues: VerifyIssue[], rootInput: string): VerifyIssue[] {
  const root = path.resolve(rootInput);
  const takeoverReport = loadBootstrapTakeoverReport(root);
  if (!takeoverReport || takeoverReport.status !== "committed") {
    return legacyIssues;
  }

  const adoptedPaths = new Set(
    takeoverReport.baselineHandoff.expectedContractPaths
      .map((entry) => normalizeRepoPath(entry))
      .filter((entry): entry is string => typeof entry === "string"),
  );
  const bootstrapScopePaths = new Set<string>(
    [
      normalizeRepoPath(takeoverReport.manifestPath),
      normalizeRepoPath(".spec/handoffs/bootstrap-takeover.json"),
      ...takeoverReport.baselineHandoff.expectedContractPaths.map((entry) => normalizeRepoPath(entry)),
      ...takeoverReport.baselineHandoff.deferredSpecDebtPaths.map((entry) => normalizeRepoPath(entry)),
    ].filter((entry): entry is string => typeof entry === "string"),
  );

  return legacyIssues.map((issue) => {
    const normalizedPath = normalizeRepoPath(issue.path);
    const shouldRemainBlocking =
      normalizedPath !== undefined &&
      (adoptedPaths.has(normalizedPath) ||
        bootstrapScopePaths.has(normalizedPath) ||
        isContractScopedPath(normalizedPath));

    if (shouldRemainBlocking) {
      return issue;
    }

    return {
      ...issue,
      severity: "advisory",
      code: `HISTORICAL_${issue.code}`,
      message: `[HISTORICAL_DEBT] ${issue.message}`,
      details: {
        matched_by: "bootstrap_takeover_historical_debt",
        original_code: issue.code,
        original_severity: issue.severity,
        takeover_session_id: takeoverReport.sessionId,
      },
    } satisfies VerifyIssue;
  });
}

function normalizeRepoPath(repoPath: string | undefined): string | undefined {
  if (!repoPath) {
    return undefined;
  }

  return repoPath.replace(/\\/g, "/");
}

function isContractScopedIssue(issue: VerifyIssue): boolean {
  return Boolean(issue.path && isContractScopedPath(issue.path.replace(/\\/g, "/")));
}

function isHistoricalDebtIssue(issue: VerifyIssue): boolean {
  return issue.code.startsWith("HISTORICAL_");
}

function appendVerifyIssues(
  result: VerifyRunResult,
  extraIssues: VerifyIssue[],
  metadataPatch?: Record<string, unknown>,
): VerifyRunResult {
  const nextResult = createVerifyRunResult(result.root, mergeVerifyIssues(result.issues, extraIssues), {
    sources: [...result.sources, "policy-engine"],
    generatedAt: result.generatedAt,
  });
  nextResult.metadata = {
    ...result.metadata,
    ...metadataPatch,
  };
  return nextResult;
}

function createPolicyRuntimeIssue(
  code: string,
  message: string,
  policyPath?: string,
  details?: Record<string, unknown>,
): VerifyIssue {
  return {
    kind: "runtime_error",
    severity: "nonblocking_error",
    code,
    path: policyPath,
    message,
    details,
  };
}

function normalizeOutputPath(root: string, targetPath: string): string {
  const relativePath = path.relative(root, targetPath);
  return relativePath.replace(/\\/g, "/");
}
