import path from "node:path";
import fs from "node:fs";
import * as yaml from "js-yaml";
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
  summarizeWaiverLifecycle,
  type WaiverApplyResult,
} from "./waiver-store";
import { createRawFactsSnapshot, addRawFact, stableSortRawFacts, type RawFactsSnapshot } from "../facts/raw-facts";
import { buildCanonicalFacts, stableSortCanonicalFacts, type CanonicalFactsSnapshot } from "../facts/canonical-facts";
import { createFactsContract } from "../facts/facts-contract";
import { loadVerifyPolicy, policyFileExists, resolvePolicyPath } from "../policy/policy-loader";
import { evaluateVerifyPolicy } from "../policy/policy-engine";
import { normalizeReplayPaths, type ReplayMetadata } from "../replay/replay-metadata";
import { isPolicySchemaError, validatePolicyAgainstFactsContract } from "../policy/policy-schema";
import { classifyGitDiff } from "../change/git-diff-classifier";
import { computeLaneDecision } from "../change/lane-decision";
import { readChangeSession, type ChangeSession } from "../change/change-session";
import {
  summarizeExecutionForkGovernanceRecord,
  type ExecutionForkGovernanceRecord,
  type ExecutionForkGovernanceSummary,
} from "../kernel/execution-fork";
import {
  summarizeKtmRuntimeRecord,
  type KtmRuntimeRecord,
  type KtmRuntimeSummary,
} from "../kernel/ktm";
import { buildKernelProvenanceBinding, resolveCanonicalChangeId } from "../kernel/provenance";
import { agentDisciplineCollector } from "./agent-discipline-collector";
import { collectBootstrapTakeoverIssues } from "./bootstrap-takeover-collector";
import { collectContractAssetIssues, isContractScopedPath } from "./contract-asset-collector";
import { collectGreenfieldRatchetIssues } from "./greenfield-ratchet-collector";
import { collectGreenfieldSpecDebtIssues } from "./greenfield-spec-debt-collector";
import { collectGreenfieldReviewPackIssues } from "./greenfield-review-pack-collector";
import { collectGreenfieldDirtyIssues } from "./greenfield-dirty-collector";
import {
  importExternalGraphArtifact,
  type ExternalGraphImportResult,
} from "../integrations/external-graph-import";
import { buildVerifyGateCoverageReport } from "./gate-coverage";
import { summarizeVerifyGateGapLedger, updateVerifyGateGapLedger } from "./gate-gap-ledger";
import {
  countPendingBootstrapSpecDebtPaths,
  isBootstrapSpecDebtPending,
  readBootstrapSpecDebtRecord,
} from "../bootstrap/spec-debt";

export interface VerifySupplementalCollector {
  source: string;
  collect(root: string, options: VerifyRunOptions): Promise<VerifyIssue[]> | VerifyIssue[];
}

interface KernelSurfaceEvidence {
  changeId?: string;
  executionForkArtifactPath: string;
  executionFork?: ExecutionForkGovernanceSummary;
  ktmKernelLogPath: string;
  ktmStateSnapshotPath: string;
  ktmRuntimeSummaryPath: string;
  ktmAuditLedgerPath: string;
  ktmRuntime?: KtmRuntimeSummary;
  issues: VerifyIssue[];
}

export interface VerifyRunOptions {
  root: string;
  strict?: boolean;
  supplementalCollectors?: VerifySupplementalCollector[];
  ignoreAgentDiscipline?: boolean;
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
  agentDisciplineCollector,
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
  {
    source: "greenfield-ratchet",
    collect(root) {
      return collectGreenfieldRatchetIssues(root);
    },
  },
  {
    source: "greenfield-spec-debt",
    collect(root) {
      return collectGreenfieldSpecDebtIssues(root);
    },
  },
  {
    source: "greenfield-review-pack",
    collect(root) {
      return collectGreenfieldReviewPackIssues(root);
    },
  },
  {
    source: "greenfield-dirty",
    collect(root) {
      return collectGreenfieldDirtyIssues(root);
    },
  },
];
const DEFAULT_EXTERNAL_GRAPH_PATH = ".spec/integrations/external-graph.json";

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
  const activeSession = readChangeSession(root);
  const kernelSurface = loadKernelSurfaceEvidence(root, activeSession);
  const canonicalChangeId = resolveCanonicalChangeId(activeSession) ?? kernelSurface?.changeId ?? "not_available_yet";
  const provenanceBinding = activeSession
    ? buildKernelProvenanceBinding(activeSession, "active_change_session")
    : undefined;
  const executionFork = kernelSurface?.executionFork;
  const ktmRuntime = kernelSurface?.ktmRuntime;
  const legacyIssues = reconcileLegacyIssuesWithTakeover(await collectLegacyIssues(root), root);
  const supplementalResult = await collectSupplementalIssues(root, options.strict === true, options);
  const externalGraphImport = importExternalGraphArtifact({
    root,
    mode: "import-only",
    sourcePath: DEFAULT_EXTERNAL_GRAPH_PATH,
  });

  for (const source of supplementalResult.sources) {
    sources.push(source);
  }
  if (externalGraphImport.status !== "not_available_yet") {
    sources.push("external-graph-import");
  }

  let result = createVerifyRunResult(
    root,
    mergeVerifyIssues(
      legacyIssues,
      kernelSurface?.issues ?? [],
      supplementalResult.issues,
      collectExternalGraphImportIssues(externalGraphImport),
    ),
    {
      sources,
      generatedAt: options.generatedAt,
    },
  );
  result.metadata = {
    ...result.metadata,
    factsContractVersion: factsContract.version,
    ...buildExternalGraphImportMetadata(externalGraphImport),
  };

  // Write baseline if requested
  if (options.writeBaseline) {
    writeVerifyBaseline(root, result);
  }

  // Apply governance mitigations that should influence effective blocking facts.
  result = await applyGovernanceMitigations(result, options);

  // Build facts and apply policy if requested
  const rawFacts = await buildRawFactsSnapshot(result, options, externalGraphImport);
  const canonicalFacts = buildCanonicalFacts(rawFacts);

  // Write facts if requested
  if (options.factsOutPath) {
    await writeFactsSnapshot(root, canonicalFacts, options.factsOutPath);
  }

  // Apply policy hook after waivers/baselines so policy sees the effective gate state.
  result = await applyPolicyHook(result, canonicalFacts, factsContract, options);

  // Observe mode remains a final presentation-layer downgrade over the policy-aware result.
  result = await applyObservePostProcessing(result, options);
  result.metadata = {
    ...result.metadata,
    provenanceBinding,
    replay: buildVerifyReplay(result, options, kernelSurface),
  };
  if (canonicalChangeId !== "not_available_yet") {
    result.metadata.changeId = canonicalChangeId;
  }
  if (executionFork) {
    result.metadata.executionFork = executionFork;
  }
  if (ktmRuntime) {
    result.metadata.ktmRuntime = ktmRuntime;
  }
  result.metadata = {
    ...result.metadata,
    ...buildImpactGraphMetadata(root),
  };
  const gateCoverage = buildVerifyGateCoverageReport({
    root,
    result,
    generatedAt: result.generatedAt,
    policyPath: options.policyPath,
  });
  const gateGapLedger = updateVerifyGateGapLedger(root, gateCoverage, result.generatedAt);
  result.metadata = {
    ...result.metadata,
    gateCoverage,
    gateGapLedger: summarizeVerifyGateGapLedger(gateGapLedger),
  };

  return result;
}

function loadKernelSurfaceEvidence(
  rootInput: string,
  activeSession: Pick<ChangeSession, "id" | "createdAt" | "changeId" | "specDelta" | "executionFork" | "ktmRuntime"> | null,
): KernelSurfaceEvidence | undefined {
  if (!activeSession) {
    return undefined;
  }

  const root = path.resolve(rootInput);
  const executionForkArtifactPath = path.join(root, ".jispec", "implement", activeSession.id, "execution-fork.json");
  const ktmArtifactDir = path.join(root, ".jispec", "kernel-runtime", activeSession.id);
  const ktmKernelLogPath = path.join(ktmArtifactDir, "kernel-log.json");
  const ktmStateSnapshotPath = path.join(ktmArtifactDir, "state-snapshot.json");
  const ktmRuntimeSummaryPath = path.join(ktmArtifactDir, "kernel-runtime.md");
  const ktmAuditLedgerPath = path.join(root, ".spec", "audit", "events.jsonl");
  const issues: VerifyIssue[] = [];
  const canonicalChangeId = resolveCanonicalChangeId(activeSession) ?? activeSession.changeId;
  const executionForkSignal = activeSession.executionFork !== undefined || fs.existsSync(executionForkArtifactPath);
  const ktmSignal = activeSession.ktmRuntime !== undefined || fs.existsSync(ktmKernelLogPath) || fs.existsSync(ktmStateSnapshotPath);

  let loadedExecutionFork: ExecutionForkGovernanceSummary | undefined;
  let loadedKtmRuntime: KtmRuntimeSummary | undefined;
  let parsedExecutionFork: ExecutionForkGovernanceRecord | undefined;
  let parsedKtmRuntime: KtmRuntimeRecord | undefined;

  if (executionForkSignal) {
    if (!fs.existsSync(executionForkArtifactPath)) {
      issues.push(createKernelSurfaceIssue(
        "missing_file",
        "KERNEL_EXECUTION_FORK_MISSING",
        relativeKernelPath(root, executionForkArtifactPath),
        "Execution fork governance is expected, but its kernel artifact is missing.",
        {
          sessionId: activeSession.id,
          changeId: canonicalChangeId,
          expectedArtifact: executionForkArtifactPath,
        },
      ));
    } else {
      parsedExecutionFork = readJsonRecord<ExecutionForkGovernanceRecord>(executionForkArtifactPath);
      if (!parsedExecutionFork) {
        issues.push(createKernelSurfaceIssue(
          "runtime_error",
          "KERNEL_EXECUTION_FORK_INVALID",
          relativeKernelPath(root, executionForkArtifactPath),
          "Execution fork governance artifact could not be parsed.",
          {
            expectedArtifact: executionForkArtifactPath,
            sessionId: activeSession.id,
          },
        ));
      } else if (parsedExecutionFork.sessionId !== activeSession.id || (canonicalChangeId && parsedExecutionFork.changeId !== canonicalChangeId)) {
        issues.push(createKernelSurfaceIssue(
          "trace",
          "KERNEL_EXECUTION_FORK_LINEAGE_MISMATCH",
          relativeKernelPath(root, executionForkArtifactPath),
          "Execution fork governance artifact does not match the active change lineage.",
          {
            sessionId: activeSession.id,
            expectedChangeId: canonicalChangeId,
            observedSessionId: parsedExecutionFork.sessionId,
            observedChangeId: parsedExecutionFork.changeId,
          },
        ));
      } else {
        loadedExecutionFork = summarizeExecutionForkGovernanceRecord(
          parsedExecutionFork,
          relativeKernelPath(root, executionForkArtifactPath),
        );
      }
    }
  }

  if (ktmSignal) {
    const kernelLogExists = fs.existsSync(ktmKernelLogPath);
    const stateSnapshotExists = fs.existsSync(ktmStateSnapshotPath);

    if (!kernelLogExists) {
      issues.push(createKernelSurfaceIssue(
        "missing_file",
        "KERNEL_RUNTIME_KERNEL_LOG_MISSING",
        relativeKernelPath(root, ktmKernelLogPath),
        "Kernel runtime is expected, but kernel-log.json is missing.",
        {
          sessionId: activeSession.id,
          changeId: canonicalChangeId,
          expectedArtifact: ktmKernelLogPath,
        },
      ));
    }

    if (!stateSnapshotExists) {
      issues.push(createKernelSurfaceIssue(
        "missing_file",
        "KERNEL_RUNTIME_STATE_SNAPSHOT_MISSING",
        relativeKernelPath(root, ktmStateSnapshotPath),
        "Kernel runtime is expected, but state-snapshot.json is missing.",
        {
          sessionId: activeSession.id,
          changeId: canonicalChangeId,
          expectedArtifact: ktmStateSnapshotPath,
        },
      ));
    }

    if (kernelLogExists && stateSnapshotExists) {
      parsedKtmRuntime = readJsonRecord<KtmRuntimeRecord>(ktmKernelLogPath);
      const stateSnapshot = readJsonRecord<Record<string, unknown>>(ktmStateSnapshotPath);

      if (!parsedKtmRuntime || !stateSnapshot) {
        issues.push(createKernelSurfaceIssue(
          "runtime_error",
          "KERNEL_RUNTIME_INVALID",
          relativeKernelPath(root, ktmKernelLogPath),
          "Kernel runtime artifact could not be parsed.",
          {
            kernelLogPath: ktmKernelLogPath,
            stateSnapshotPath: ktmStateSnapshotPath,
            sessionId: activeSession.id,
          },
        ));
      } else if (parsedKtmRuntime.sessionId !== activeSession.id || (canonicalChangeId && parsedKtmRuntime.changeId !== canonicalChangeId)) {
        issues.push(createKernelSurfaceIssue(
          "trace",
          "KERNEL_RUNTIME_LINEAGE_MISMATCH",
          relativeKernelPath(root, ktmKernelLogPath),
          "Kernel runtime artifact does not match the active change lineage.",
          {
            sessionId: activeSession.id,
            expectedChangeId: canonicalChangeId,
            observedSessionId: parsedKtmRuntime.sessionId,
            observedChangeId: parsedKtmRuntime.changeId,
          },
        ));
      } else if (!isKernelStateSnapshotCompatible(parsedKtmRuntime, stateSnapshot)) {
        issues.push(createKernelSurfaceIssue(
          "trace",
          "KERNEL_RUNTIME_STATE_SNAPSHOT_MISMATCH",
          relativeKernelPath(root, ktmStateSnapshotPath),
          "Kernel state snapshot does not match the committed KTM transition.",
          {
            sessionId: activeSession.id,
            changeId: parsedKtmRuntime.changeId,
            kernelLogPath: ktmKernelLogPath,
            stateSnapshotPath: ktmStateSnapshotPath,
          },
        ));
      } else {
        loadedKtmRuntime = summarizeKtmRuntimeRecord(parsedKtmRuntime);
      }
    }
  }

  if (activeSession.executionFork && loadedExecutionFork && activeSession.executionFork.canonicalTraceId !== loadedExecutionFork.canonicalTraceId) {
    issues.push(createKernelSurfaceIssue(
      "trace",
      "KERNEL_EXECUTION_FORK_SESSION_MISMATCH",
      relativeKernelPath(root, executionForkArtifactPath),
      "Embedded execution fork metadata disagrees with the kernel artifact.",
      {
        sessionId: activeSession.id,
        sessionCanonicalTraceId: activeSession.executionFork.canonicalTraceId,
        artifactCanonicalTraceId: loadedExecutionFork.canonicalTraceId,
      },
    ));
  }

  if (activeSession.ktmRuntime && loadedKtmRuntime && activeSession.ktmRuntime.transition.id !== loadedKtmRuntime.transitionId) {
    issues.push(createKernelSurfaceIssue(
      "trace",
      "KERNEL_RUNTIME_SESSION_MISMATCH",
      relativeKernelPath(root, ktmKernelLogPath),
      "Embedded KTM metadata disagrees with the kernel artifact.",
      {
        sessionId: activeSession.id,
        sessionTransitionId: activeSession.ktmRuntime.transition.id,
        artifactTransitionId: loadedKtmRuntime.transitionId,
      },
    ));
  }

  return {
    changeId: parsedKtmRuntime?.changeId ?? parsedExecutionFork?.changeId ?? canonicalChangeId,
    executionForkArtifactPath,
    ...(loadedExecutionFork ? { executionFork: loadedExecutionFork } : {}),
    ktmKernelLogPath,
    ktmStateSnapshotPath,
    ktmRuntimeSummaryPath,
    ktmAuditLedgerPath,
    ...(loadedKtmRuntime ? { ktmRuntime: loadedKtmRuntime } : {}),
    issues,
  };
}

function buildImpactGraphMetadata(root: string): Record<string, unknown> {
  const activeSession = readChangeSession(root);
  const impactSummary = activeSession?.impactSummary;
  const canonicalChangeId = resolveCanonicalChangeId(activeSession);
  const changeId = canonicalChangeId ?? activeSession?.id;
  if (impactSummary && !Array.isArray(impactSummary)) {
    const impactGraphNotApplicable = impactSummary.freshness.status === "not_available_yet" && !isGreenfieldProject(root);
    const impactGraphFreshness = impactGraphNotApplicable ? "not_applicable" : impactSummary.freshness.status;
    const impactGraphFreshnessReason = impactGraphNotApplicable
      ? "Impact graph is only required for Greenfield Spec Delta projects; this project uses a non-Greenfield delivery model."
      : impactSummary.freshness.reason;
    return {
      ...(changeId ? { changeId } : {}),
      impactGraphFreshness,
      impactGraphPath: impactSummary.artifacts.impactGraphPath,
      impactReportPath: impactSummary.artifacts.impactReportPath,
      verifyFocusPath: impactSummary.artifacts.verifyFocusPath,
      impactGraphFreshnessReason,
      impactGraphFreshnessGeneratedAt: impactSummary.freshness.generatedAt,
      impactGraphChangedFiles: impactSummary.changedFiles,
      impactGraphImpactedFiles: impactSummary.impactedFiles,
      impactGraphContractRefs: impactSummary.contractRefs,
      impactGraphScopeHints: impactGraphNotApplicable
        ? impactSummary.scopeHints.filter((hint) => hint !== "impact graph not_available_yet")
        : impactSummary.scopeHints,
      impactGraphMissingVerificationHints: impactGraphNotApplicable ? [] : impactSummary.missingVerificationHints,
      impactGraphNextReplayCommand: impactSummary.nextReplayCommand,
      impactAdvisoryOnly: impactSummary.advisoryOnly,
    };
  }

  return {
    ...(changeId ? { changeId } : {}),
    impactGraphFreshness: "not_available_yet",
    impactAdvisoryOnly: true,
  };
}

function isGreenfieldProject(root: string): boolean {
  const projectPath = path.join(root, "jiproject", "project.yaml");
  if (!fs.existsSync(projectPath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(projectPath, "utf-8");
    return /^\s*delivery_model:\s*greenfield-initialization\s*$/m.test(content);
  } catch {
    return false;
  }
}

function collectExternalGraphImportIssues(result: ExternalGraphImportResult): VerifyIssue[] {
  return result.warnings.map((warning) => ({
    kind: "runtime_error",
    severity: "advisory",
    code: "INVALID_EXTERNAL_GRAPH_ARTIFACT",
    path: result.sourcePath,
    message: `External graph import skipped: ${warning.message}`,
    details: {
      kind: warning.kind,
      blocking: false,
      verifyInterruption: result.verifyInterruption,
      advisoryOnly: true,
    },
  }));
}

function buildExternalGraphImportMetadata(result: ExternalGraphImportResult): Record<string, unknown> {
  return {
    externalGraphImportStatus: result.status,
    externalGraphImportPath: result.sourcePath,
    externalGraphEvidenceCount: result.evidence.length,
    externalGraphWarningCount: result.warnings.length,
    externalGraphAdvisoryOnly: true,
    externalGraphImportOnly: true,
    externalGraphExecution: result.execution,
  };
}

function buildVerifyReplay(
  result: VerifyRunResult,
  options: VerifyRunOptions,
  kernelSurface?: KernelSurfaceEvidence,
): ReplayMetadata {
  const inputArtifacts = [
    ".spec/handoffs/bootstrap-takeover.json",
    ".spec/contracts/domain.yaml",
    ".spec/contracts/api_spec.json",
    ".spec/contracts/behaviors.feature",
    ".spec/policy.yaml",
    DEFAULT_EXTERNAL_GRAPH_PATH,
    options.policyPath,
    options.factsOutPath,
  ].filter((candidate): candidate is string => typeof candidate === "string");

  const activeSession = readChangeSession(options.root);
  if (activeSession) {
    inputArtifacts.push(".jispec/change-session.json");
    if (kernelSurface) {
      inputArtifacts.push(kernelSurface.executionForkArtifactPath);
      inputArtifacts.push(kernelSurface.ktmKernelLogPath);
      inputArtifacts.push(kernelSurface.ktmStateSnapshotPath);
      inputArtifacts.push(kernelSurface.ktmRuntimeSummaryPath);
      inputArtifacts.push(kernelSurface.ktmAuditLedgerPath);
    }
    if (activeSession.impactSummary && !Array.isArray(activeSession.impactSummary)) {
      inputArtifacts.push(
        activeSession.impactSummary.artifacts.deltaPath,
        activeSession.impactSummary.artifacts.impactGraphPath,
        activeSession.impactSummary.artifacts.impactReportPath,
        activeSession.impactSummary.artifacts.verifyFocusPath,
      );
    }
  }

  const existingInputs = inputArtifacts.filter((candidate) => {
    if (candidate === options.factsOutPath) {
      return true;
    }
    return fs.existsSync(path.isAbsolute(candidate) ? candidate : path.join(options.root, candidate));
  });

  const commandParts = ["npm run jispec-cli -- verify"];
  if (options.fast) {
    commandParts.push("--fast");
  }
  if (options.strict) {
    commandParts.push("--strict");
  }
  if (options.useBaseline) {
    commandParts.push("--baseline");
  }
  if (options.writeBaseline) {
    commandParts.push("--write-baseline");
  }
  if (options.observe) {
    commandParts.push("--observe");
  }
  if (options.policyPath) {
    commandParts.push(`--policy ${quoteShellValue(options.policyPath)}`);
  }
  if (options.factsOutPath) {
    commandParts.push(`--facts-out ${quoteShellValue(options.factsOutPath)}`);
  }

  return {
    version: 1,
    replayable: true,
    source: "verify",
    sourceArtifact: fs.existsSync(path.join(options.root, ".spec", "handoffs", "bootstrap-takeover.json"))
      ? ".spec/handoffs/bootstrap-takeover.json"
      : ".spec/contracts",
    inputArtifacts: normalizeReplayPaths(options.root, existingInputs),
    commands: {
      rerun: commandParts.join(" "),
      inspectSummary: "type .spec\\handoffs\\verify-summary.md",
    },
    previousOutcome: result.verdict,
    nextHumanAction: result.exitCode === 0
      ? "Review verify summary and continue with merge or advisory follow-up."
      : "Fix blocking verify issues or record an explicit waiver/spec-debt decision, then rerun verify.",
  };
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
    if (typeof result.metadata.changeId === "string") {
      lines.push(`Change ID: ${result.metadata.changeId}`);
    }
    const provenanceBinding = result.metadata.provenanceBinding as { id?: string; source?: string } | undefined;
    if (provenanceBinding?.id) {
      lines.push(`Provenance binding: ${provenanceBinding.id}`);
      if (provenanceBinding.source) {
        lines.push(`Provenance source: ${provenanceBinding.source}`);
      }
    }
    if (result.metadata.executionFork && isRecord(result.metadata.executionFork)) {
      const executionFork = result.metadata.executionFork as Record<string, unknown>;
      lines.push("Execution fork:");
      if (typeof executionFork.artifactPath === "string") {
        lines.push(`Artifact: ${executionFork.artifactPath}`);
      }
      if (typeof executionFork.canonicalTraceId === "string") {
        lines.push(`Canonical trace: ${executionFork.canonicalTraceId}`);
      }
      if (typeof executionFork.canonicalTraceSummary === "string") {
        lines.push(`Summary: ${executionFork.canonicalTraceSummary}`);
      }
      if (Array.isArray(executionFork.selectedAxes)) {
        lines.push(`Selected axes: ${(executionFork.selectedAxes as unknown[]).join(", ")}`);
      }
      if (typeof executionFork.candidateCount === "number") {
        lines.push(`Candidate count: ${executionFork.candidateCount}`);
      }
      if (typeof executionFork.suppressedCandidateCount === "number") {
        lines.push(`Suppressed candidates: ${executionFork.suppressedCandidateCount}`);
      }
    }
    if (result.metadata.ktmRuntime && isRecord(result.metadata.ktmRuntime)) {
      const ktmRuntime = result.metadata.ktmRuntime as Record<string, unknown>;
      lines.push("KTM runtime:");
      if (typeof ktmRuntime.artifactDir === "string") {
        lines.push(`Artifact dir: ${ktmRuntime.artifactDir}`);
      }
      if (typeof ktmRuntime.kernelLogPath === "string") {
        lines.push(`Kernel log: ${ktmRuntime.kernelLogPath}`);
      }
      if (typeof ktmRuntime.stateSnapshotPath === "string") {
        lines.push(`State snapshot: ${ktmRuntime.stateSnapshotPath}`);
      }
      if (typeof ktmRuntime.runtimeSummaryPath === "string") {
        lines.push(`Runtime summary: ${ktmRuntime.runtimeSummaryPath}`);
      }
      if (typeof ktmRuntime.decision === "string") {
        lines.push(`Decision: ${ktmRuntime.decision}`);
      }
      if (typeof ktmRuntime.transitionId === "string") {
        lines.push(`Transition: ${ktmRuntime.transitionId}`);
      }
      if (typeof ktmRuntime.committed === "boolean") {
        lines.push(`Committed: ${ktmRuntime.committed}`);
      }
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
  ].filter((collector) => !(options.ignoreAgentDiscipline === true && collector.source === "agent-discipline"));

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
  externalGraphImport?: ExternalGraphImportResult,
): Promise<RawFactsSnapshot> {
  const snapshot = createRawFactsSnapshot(options.root);

  // Add verify facts
  addRawFact(snapshot, "verify.issue_count", result.issueCount, "verify-runner");
  addRawFact(snapshot, "verify.blocking_issue_count", result.blockingIssueCount, "verify-runner");

  const issueCodes = Array.from(new Set(result.issues.map((i) => i.code))).sort();
  addRawFact(snapshot, "verify.issue_codes", issueCodes, "verify-runner");
  addRawFact(snapshot, "verify.contract_issue_count", result.issues.filter((issue) => isContractScopedIssue(issue)).length, "verify-runner");
  addRawFact(snapshot, "greenfield.code_drift_count", result.issues.filter((issue) => issue.code === "GREENFIELD_CODE_DRIFT").length, "greenfield-ratchet");
  addRawFact(snapshot, "greenfield.spec_drift_count", result.issues.filter((issue) => issue.code.startsWith("GREENFIELD_SPEC_DRIFT")).length, "greenfield-ratchet");
  addRawFact(snapshot, "greenfield.classified_drift_count", result.issues.filter((issue) => issue.code === "GREENFIELD_CLASSIFIED_CODE_DRIFT").length, "greenfield-ratchet");
  addRawFact(snapshot, "greenfield.spec_debt_open_count", result.issues.filter((issue) => issue.code === "GREENFIELD_SPEC_DEBT_OPEN").length, "greenfield-spec-debt");
  addRawFact(snapshot, "greenfield.spec_debt_expired_count", result.issues.filter((issue) => issue.code === "GREENFIELD_SPEC_DEBT_EXPIRED").length, "greenfield-spec-debt");
  addRawFact(snapshot, "greenfield.review_unresolved_blocking_count", result.issues.filter((issue) => issue.code === "GREENFIELD_REVIEW_ITEM_UNRESOLVED_BLOCKING").length, "greenfield-review-pack");
  addRawFact(snapshot, "greenfield.review_low_confidence_unadopted_count", result.issues.filter((issue) => issue.code === "GREENFIELD_REVIEW_ITEM_LOW_CONFIDENCE_UNADOPTED").length, "greenfield-review-pack");
  addRawFact(snapshot, "greenfield.review_rejected_count", result.issues.filter((issue) => issue.code === "GREENFIELD_REVIEW_ITEM_REJECTED").length, "greenfield-review-pack");
  addRawFact(snapshot, "greenfield.review_deferred_or_waived_count", result.issues.filter((issue) => issue.code === "GREENFIELD_REVIEW_ITEM_DEFERRED_OR_WAIVED").length, "greenfield-review-pack");
  addRawFact(snapshot, "greenfield.dirty_required_update_count", result.issues.filter((issue) => issue.code === "GREENFIELD_DIRTY_CHAIN_UNRECONCILED").length, "greenfield-dirty");
  addRawFact(snapshot, "greenfield.dirty_graph_warning_count", result.issues.filter((issue) => issue.code === "GREENFIELD_DIRTY_GRAPH_WARNING").length, "greenfield-dirty");
  if (externalGraphImport && externalGraphImport.evidence.length > 0) {
    addRawFact(snapshot, "externalGraph.normalizedEvidence", externalGraphImport.evidence, "external-graph-import");
  }

  // Add contract presence facts
  const contractsDir = path.join(options.root, ".spec", "contracts");
  addRawFact(snapshot, "contracts.domain.present", fs.existsSync(path.join(contractsDir, "domain.yaml")), "verify-runner");
  addRawFact(snapshot, "contracts.api.present", fs.existsSync(path.join(contractsDir, "api_spec.json")), "verify-runner");
  addRawFact(snapshot, "contracts.behavior.present", fs.existsSync(path.join(contractsDir, "behaviors.feature")), "verify-runner");

  const takeoverReport = loadBootstrapTakeoverReport(options.root);
  const pendingBootstrapSpecDebtCount = takeoverReport
    ? countPendingBootstrapSpecDebtPaths(options.root, takeoverReport.specDebtPaths)
    : 0;
  const behaviorDeferred = Boolean(
    takeoverReport?.status === "committed" &&
      takeoverReport.decisions.some(
        (decision) =>
          decision.artifactKind === "feature" &&
          decision.finalState === "spec_debt" &&
          typeof decision.targetPath === "string" &&
          fs.existsSync(path.join(options.root, decision.targetPath)) &&
          isBootstrapSpecDebtPending(readBootstrapSpecDebtRecord(options.root, decision.targetPath)),
      ),
  );
  addRawFact(snapshot, "contracts.behavior.deferred", behaviorDeferred, "verify-runner");
  addRawFact(snapshot, "contracts.adopted_count", takeoverReport?.adoptedArtifactPaths.length ?? 0, "verify-runner");
  addRawFact(snapshot, "contracts.deferred_count", pendingBootstrapSpecDebtCount, "verify-runner");
  addRawFact(snapshot, "contracts.missing_count", countContractMissingIssues(result.issues), "verify-runner");
  addRawFact(snapshot, "contracts.drifted_count", countContractDriftIssues(result.issues), "verify-runner");
  addRawFact(snapshot, "bootstrap.takeover.present", Boolean(takeoverReport && takeoverReport.status === "committed"), "verify-runner");
  addRawFact(snapshot, "bootstrap.adopted_contract_count", takeoverReport?.adoptedArtifactPaths.length ?? 0, "verify-runner");
  addRawFact(snapshot, "bootstrap.spec_debt_count", pendingBootstrapSpecDebtCount, "verify-runner");
  addRawFact(snapshot, "bootstrap.rejected_artifact_kinds", takeoverReport?.rejectedArtifactKinds ?? [], "verify-runner");
  addRawFact(snapshot, "bootstrap.historical_debt_issue_count", result.issues.filter((issue) => isHistoricalDebtIssue(issue)).length, "verify-runner");

  const releaseFacts = collectReleaseBaselineFacts(options.root);
  addRawFact(snapshot, "release.baseline.present", releaseFacts.baselinePresent, "verify-runner");
  addRawFact(snapshot, "release.contract_graph.present", releaseFacts.contractGraphPresent, "verify-runner");
  addRawFact(snapshot, "release.static_collector.present", releaseFacts.staticCollectorPresent, "verify-runner");
  addRawFact(snapshot, "release.policy.present", releaseFacts.policyPresent, "verify-runner");
  addRawFact(snapshot, "release.compare.present", releaseFacts.compareCount > 0, "verify-runner");
  addRawFact(snapshot, "release.compare.count", releaseFacts.compareCount, "verify-runner");
  addRawFact(snapshot, "release.compare.changed_count", releaseFacts.compareChangedCount, "verify-runner");

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
    if (isPolicySchemaError(error)) {
      return appendVerifyIssues(result, [
        createPolicyRuntimeIssue(
          error.code,
          message,
          normalizeOutputPath(options.root, policyPath),
          {
            key: error.key,
            replacement: error.replacement,
          },
        ),
      ]);
    }
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

async function applyGovernanceMitigations(
  result: VerifyRunResult,
  options: VerifyRunOptions,
): Promise<VerifyRunResult> {
  let processedResult = result;

  // Step 1: Apply waivers
  if (options.applyWaivers !== false) {
    const waiverLifecycle = summarizeWaiverLifecycle(options.root);
    if (waiverLifecycle.total > 0) {
      processedResult.metadata = {
        ...processedResult.metadata,
        waiverLifecycle,
      };
    }

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

  return processedResult;
}

async function applyObservePostProcessing(
  result: VerifyRunResult,
  options: VerifyRunOptions,
): Promise<VerifyRunResult> {
  let processedResult = result;

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

function quoteShellValue(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function isContractScopedIssue(issue: VerifyIssue): boolean {
  return Boolean(issue.path && isContractScopedPath(issue.path.replace(/\\/g, "/")));
}

function isHistoricalDebtIssue(issue: VerifyIssue): boolean {
  return issue.code.startsWith("HISTORICAL_");
}

function countContractMissingIssues(issues: VerifyIssue[]): number {
  return issues.filter((issue) => isMissingContractIssue(issue)).length;
}

function countContractDriftIssues(issues: VerifyIssue[]): number {
  return issues.filter((issue) => isDriftedContractIssue(issue)).length;
}

function isMissingContractIssue(issue: VerifyIssue): boolean {
  return new Set([
    "BOOTSTRAP_MANIFEST_MISSING",
    "BOOTSTRAP_CONTRACT_MISSING",
    "BOOTSTRAP_SPEC_DEBT_RECORD_MISSING",
    "DOMAIN_CONTRACT_INVALID_YAML",
    "DOMAIN_CONTRACT_INVALID_SHAPE",
    "DOMAIN_CONTRACT_METADATA_MISSING",
    "DOMAIN_CONTRACT_SECTION_MISSING",
    "API_CONTRACT_INVALID_JSON",
    "API_CONTRACT_SECTION_MISSING",
    "API_CONTRACT_ENDPOINTS_MISSING",
    "FEATURE_CONTRACT_SCENARIOS_MISSING",
  ]).has(issue.code);
}

function isDriftedContractIssue(issue: VerifyIssue): boolean {
  if (issue.path && issue.path.replace(/\\/g, "/").startsWith(".spec/contracts/")) {
    return !isMissingContractIssue(issue);
  }

  return issue.code.startsWith("GREENFIELD_") && issue.code.includes("DRIFT");
}

function collectReleaseBaselineFacts(root: string): {
  baselinePresent: boolean;
  contractGraphPresent: boolean;
  staticCollectorPresent: boolean;
  policyPresent: boolean;
  compareCount: number;
  compareChangedCount: number;
} {
  const baselinePath = path.join(root, ".spec", "baselines", "current.yaml");
  if (!fs.existsSync(baselinePath)) {
    return {
      baselinePresent: false,
      contractGraphPresent: false,
      staticCollectorPresent: false,
      policyPresent: false,
      compareCount: 0,
      compareChangedCount: 0,
    };
  }

  const parsed = yaml.load(fs.readFileSync(baselinePath, "utf-8"));
  const baseline = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  const compareReports = listReleaseCompareReports(root);

  return {
    baselinePresent: true,
    contractGraphPresent: isRecord(baseline.contract_graph),
    staticCollectorPresent: isRecord(baseline.static_collector_manifest),
    policyPresent: isRecord(baseline.policy_snapshot),
    compareCount: compareReports.length,
    compareChangedCount: compareReports.filter((report) => report.overallStatus === "changed").length,
  };
}

function listReleaseCompareReports(root: string): Array<{ overallStatus: string }> {
  const compareRoot = path.join(root, ".spec", "releases", "compare");
  if (!fs.existsSync(compareRoot)) {
    return [];
  }

  return fs.readdirSync(compareRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(compareRoot, entry.name, "compare-report.json"))
    .filter((reportPath) => fs.existsSync(reportPath))
    .map((reportPath) => {
      try {
        const parsed = JSON.parse(fs.readFileSync(reportPath, "utf-8")) as Record<string, unknown>;
        const driftSummary = parsed.driftSummary as Record<string, unknown> | undefined;
        return {
          overallStatus: typeof driftSummary?.overallStatus === "string" ? driftSummary.overallStatus : "not_tracked",
        };
      } catch {
        return { overallStatus: "not_tracked" };
      }
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonRecord<T>(filePath: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return undefined;
  }
}

function isKernelStateSnapshotCompatible(
  record: KtmRuntimeRecord,
  snapshot: Record<string, unknown>,
): boolean {
  if (snapshot.id !== record.transition.toState.id) {
    return false;
  }

  if (snapshot.kind !== record.transition.toState.kind || snapshot.status !== record.transition.toState.status) {
    return false;
  }

  const snapshotPayload = isRecord(snapshot.payload) ? snapshot.payload : undefined;
  if (!snapshotPayload) {
    return false;
  }

  if (snapshotPayload.sessionId !== record.sessionId || snapshotPayload.changeId !== record.changeId) {
    return false;
  }

  return true;
}

function createKernelSurfaceIssue(
  kind: VerifyIssue["kind"],
  code: string,
  issuePath: string,
  message: string,
  details?: Record<string, unknown>,
): VerifyIssue {
  return {
    kind,
    severity: "blocking",
    code,
    path: issuePath,
    message,
    ...(details ? { details } : {}),
  };
}

function relativeKernelPath(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).replace(/\\/g, "/");
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
