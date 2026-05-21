import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import {
  HUMAN_SUMMARY_COMPANION_NOTE,
  renderHumanDecisionSnapshot,
  renderHumanDecisionSnapshotText,
} from "../human-decision-packet";
import {
  collectConsoleLocalSnapshot,
  type ConsoleGovernanceObjectSnapshot,
  type ConsoleLocalSnapshot,
} from "../console/read-model-snapshot";

export type NorthStarScenarioId =
  | "legacy_takeover"
  | "greenfield"
  | "daily_change"
  | "mainline_recovery_drill"
  | "external_patch_mediation"
  | "policy_waiver"
  | "release_drift"
  | "console_governance"
  | "multi_repo_aggregation"
  | "privacy_report"
  | "source_evolution_adopted"
  | "source_evolution_deferred_repaid"
  | "console_source_evolution"
  | "multi_repo_owner_action"
  | "release_compare_global_context"
  | "doctor_global_health"
  | "global_operations_packet"
  | "org_responsibility_graph"
  | "async_review_inbox"
  | "ops_aging_ledger"
  | "release_train_packet"
  | "org_operations_console";

export type NorthStarProofClaim =
  | "verifiable"
  | "auditable"
  | "blockable"
  | "replayable"
  | "localFirst"
  | "externalToolsControlled";

export interface NorthStarAcceptanceOptions {
  root: string;
  outPath?: string;
  generatedAt?: string;
}

export interface NorthStarScenario {
  id: NorthStarScenarioId;
  title: string;
  status: "passed" | "blocking";
  task?: NorthStarScenarioTask;
  requiredArtifacts: string[];
  presentArtifacts: string[];
  missingArtifacts: string[];
  blockingReasons: string[];
  machineArtifactPath: string;
  humanDecisionPacketPath: string;
  ownerAction: string;
  nextCommand: string;
  proofClaims: NorthStarProofClaim[];
  evidence?: NorthStarScenarioEvidence;
}

export interface NorthStarScenarioEvidence {
  summary: string;
  lifecycleRegistryPath?: string;
  lifecycleRegistryVersion?: number;
  activeSnapshotId?: string;
  lastAdoptedChangeId?: string | null;
  sourceEvolutionPath?: string;
  sourceReviewPath?: string;
  currentChangeState?: string;
  openReviewItems?: number;
  blockingOpenReviewItems?: number;
  deferredItems?: number;
  expiredDeferredItems?: number;
  reviewedBlockingItems?: number;
  sourceEvolutionRepresentativeArtifact?: string;
  sourceReviewCoverage?: {
    totalItems: number;
    open: number;
    adopted: number;
    deferred: number;
    waived: number;
    rejected: number;
  };
  pendingChanges?: Array<{
    changeId: string;
    openReviewItems: number;
    blockingOpenReviewItems: number;
    sourceEvolutionPath?: string;
    sourceReviewPath?: string;
  }>;
  aggregateContractDriftHintCount?: number;
  aggregateOwnerActionCount?: number;
  aggregatePromotionReady?: boolean;
  aggregatePromotionPhase?: string;
  releaseCompareReportPath?: string;
  releaseCompareGlobalContextStatus?: string;
  releaseCompareOwnerReviewRecommendationCount?: number;
  releaseCompareRelevantHintCount?: number;
  releaseCompareRelevantOwnerActionCount?: number;
  doctorGlobalReady?: boolean;
  doctorGlobalBlockerCount?: number;
  globalOperationsPacketStatus?: string;
  globalOperationsOwnerActionCount?: number;
  globalOperationsCrossRepoRefCount?: number;
  globalOperationsSupportSurfaceCount?: number;
  globalOperationsAsyncEvidenceAvailable?: number;
  globalOperationsAsyncEvidenceTotal?: number;
  globalOperationsPrivacyStatus?: string;
  globalOperationsBoundaryReplacesVerify?: boolean;
  globalOperationsDeferredSurfacesDiagnosticOnly?: boolean;
  globalOperationsSourceUploadRequired?: boolean;
  globalOperationsRealtimeCollaborationRequired?: boolean;
  orgResponsibilityGraphStatus?: string;
  orgResponsibilityTeamCount?: number;
  orgResponsibilityRepoCount?: number;
  orgResponsibilityOwnerActionCount?: number;
  orgResponsibilityReviewerCoverage?: number;
  orgResponsibilityEscalationCoverage?: number;
  orgResponsibilityBoundaryReplacesVerify?: boolean;
  orgResponsibilitySourceUploadRequired?: boolean;
  orgResponsibilityRealtimeCollaborationRequired?: boolean;
  asyncReviewInboxStatus?: string;
  asyncReviewReviewerCount?: number;
  asyncReviewTotalItems?: number;
  asyncReviewPending?: number;
  asyncReviewAccepted?: number;
  asyncReviewBlocked?: number;
  asyncReviewExpired?: number;
  asyncReviewReviewersMissing?: number;
  asyncReviewEscalationReadyItems?: number;
  asyncReviewBoundaryReplacesVerify?: boolean;
  asyncReviewSourceUploadRequired?: boolean;
  asyncReviewRealtimeCollaborationRequired?: boolean;
  opsAgingLedgerStatus?: string;
  opsAgingTotalItems?: number;
  opsAgingFresh?: number;
  opsAgingDueSoon?: number;
  opsAgingOverdue?: number;
  opsAgingEscalated?: number;
  opsAgingItemsWithEscalationPath?: number;
  opsAgingItemsMissingEscalationPath?: number;
  opsAgingBoundaryReplacesVerify?: boolean;
  opsAgingSourceUploadRequired?: boolean;
  opsAgingRealtimeCollaborationRequired?: boolean;
  releaseTrainPacketStatus?: string;
  releaseTrainReady?: boolean;
  releaseTrainRepoCount?: number;
  releaseTrainBlockedRepoCount?: number;
  releaseTrainOwnerAssignmentCount?: number;
  releaseTrainRequiredReviewCount?: number;
  releaseTrainSafeNextCommand?: string;
  releaseTrainGlobalContextStatus?: string;
  releaseTrainBoundaryReplacesVerify?: boolean;
  releaseTrainBoundaryReplacesPostReleaseGate?: boolean;
  releaseTrainSourceUploadRequired?: boolean;
  releaseTrainRealtimeCollaborationRequired?: boolean;
  orgOperationsConsoleStatus?: string;
  orgOperationsReady?: boolean;
  orgOperationsAvailableObjectCount?: number;
  orgOperationsMissingObjectCount?: number;
  orgOperationsResponsibilityAssignments?: number;
  orgOperationsReviewItems?: number;
  orgOperationsSlaAttentionCount?: number;
  orgOperationsBlockedRepoCount?: number;
  orgOperationsBoundaryReplacesVerify?: boolean;
  orgOperationsBoundaryReplacesPostReleaseGate?: boolean;
  orgOperationsSourceUploadRequired?: boolean;
  orgOperationsRealtimeCollaborationRequired?: boolean;
  mainlineRecoveryDrillStatus?: string;
  mainlineRecoveryDrillStepCount?: number;
  mainlineRecoveryDrillExpectedNextState?: string;
  mainlineRecoveryDrillVerificationCommand?: string;
  governedRequirementEvolution: boolean;
}

export interface NorthStarAcceptance {
  schemaVersion: 1;
  kind: "jispec-north-star-acceptance";
  generatedAt: string;
  root: string;
  contract: {
    version: 1;
    scenarioSuite: "north-star-acceptance";
    sourcePlan: "docs/architecture/north-star-acceptance.md";
  };
  boundary: {
    localOnly: true;
    sourceUploadRequired: false;
    llmBlockingDecisionSource: false;
    deterministicLocalArtifactsOnly: true;
    replacesVerify: false;
    replacesDoctorV1: false;
    replacesDoctorRuntime: false;
    replacesDoctorPilot: false;
    replacesPostReleaseGate: false;
  };
  summary: {
    ready: boolean;
    scenarioCount: number;
    passedScenarioCount: number;
    blockingScenarioCount: number;
  };
  proofClaims: Record<NorthStarProofClaim, boolean>;
  scenarios: NorthStarScenario[];
  blockers: Array<{
    scenarioId: NorthStarScenarioId;
    title: string;
    task?: NorthStarScenarioTask;
    missingArtifacts: string[];
    requiredArtifacts: string[];
    blockingReasons: string[];
    ownerAction: string;
    nextCommand: string;
  }>;
  requiredExternalGates: Array<{
    id: "post_release_gate" | "doctor_mainline" | "doctor_runtime" | "doctor_pilot";
    command: string;
    authority: "blocking_gate";
  }>;
}

export interface NorthStarAcceptanceResult {
  root: string;
  acceptancePath: string;
  decisionPacketPath: string;
  scenarioArtifactPaths: string[];
  scenarioDecisionPacketPaths: string[];
  acceptance: NorthStarAcceptance;
}

interface ScenarioDefinition {
  id: NorthStarScenarioId;
  title: string;
  task?: NorthStarScenarioTask;
  requiredArtifacts: string[];
  ownerAction: string;
  nextCommand: string;
  proofClaims: NorthStarProofClaim[];
}

interface NorthStarScenarioTask {
  id: string;
  week: string;
  priority: "P0" | "P1";
  owner: string;
  acceptanceCommand: string;
}

interface ScenarioContext {
  snapshot: ConsoleLocalSnapshot;
  currentBaseline?: Record<string, unknown>;
}

const DEFAULT_ACCEPTANCE_PATH = ".spec/north-star/acceptance.json";

const SCENARIOS: ScenarioDefinition[] = [
  {
    id: "legacy_takeover",
    title: "Legacy takeover",
    requiredArtifacts: [".spec/handoffs/bootstrap-takeover.json", ".spec/audit/events.jsonl"],
    ownerAction: "Run bootstrap takeover or adopt an existing takeover artifact, then append the audit event.",
    nextCommand: "npm run jispec -- bootstrap discover --json",
    proofClaims: ["auditable", "replayable", "localFirst"],
  },
  {
    id: "greenfield",
    title: "Greenfield",
    task: {
      id: "W2-T1",
      week: "W2",
      priority: "P0",
      owner: "Greenfield Owner",
      acceptanceCommand: "node --import tsx ./tools/jispec/tests/greenfield-empty-directory-acceptance-demo.ts",
    },
    requiredArtifacts: [".spec/greenfield/initialization-summary.md", ".jispec-ci/verify-report.json"],
    ownerAction: "Initialize the Greenfield baseline and run deterministic verify.",
    nextCommand: "npm run jispec -- init --requirements <path> --json",
    proofClaims: ["verifiable", "blockable", "localFirst"],
  },
  {
    id: "daily_change",
    title: "Daily change",
    task: {
      id: "W2-T2",
      week: "W2",
      priority: "P0",
      owner: "Change / Implement Owner",
      acceptanceCommand: "node --import tsx ./tools/jispec/tests/p9-change-impact-summary.ts",
    },
    requiredArtifacts: [".jispec/change-session.json", ".jispec-ci/verify-report.json"],
    ownerAction: "Record a daily change plan and refresh the verify report.",
    nextCommand: "npm run jispec -- change \"<summary>\" --mode execute --json",
    proofClaims: ["verifiable", "blockable", "replayable"],
  },
  {
    id: "mainline_recovery_drill",
    title: "Mainline recovery drill",
    task: {
      id: "North-Star-Score-Phase-9",
      week: "Score Optimization",
      priority: "P0",
      owner: "Change / Implement Owner",
      acceptanceCommand: "node --import tsx ./tools/jispec/tests/mainline-recovery-drill.ts",
    },
    requiredArtifacts: [".jispec/recovery/mainline-drill.json"],
    ownerAction: "Materialize the mainline recovery drill and review the expected next state before continuing.",
    nextCommand: "npm run jispec-cli -- doctor mainline --write-drill --json",
    proofClaims: ["verifiable", "blockable", "replayable", "localFirst"],
  },
  {
    id: "external_patch_mediation",
    title: "External patch mediation",
    task: {
      id: "W3-T1",
      week: "W3",
      priority: "P0",
      owner: "Implement Runtime Owner",
      acceptanceCommand: "node --import tsx ./tools/jispec/tests/implement-patch-mediation.ts",
    },
    requiredArtifacts: [".jispec/implement/*/patch-mediation.json"],
    ownerAction: "Mediate the external patch through the local implement lane before accepting it.",
    nextCommand: "npm run jispec -- implement --external-patch <path> --json",
    proofClaims: ["blockable", "externalToolsControlled", "localFirst"],
  },
  {
    id: "policy_waiver",
    title: "Policy waiver",
    task: {
      id: "W3-T2",
      week: "W3",
      priority: "P0",
      owner: "Audit & Integration Owner",
      acceptanceCommand: "node --import tsx ./tools/jispec/tests/policy-approval-workflow.ts",
    },
    requiredArtifacts: [".spec/waivers/*.json", ".spec/audit/events.jsonl"],
    ownerAction: "Refresh policy waiver posture and record the approval or expiry decision.",
    nextCommand: "npm run jispec -- policy approval status --json",
    proofClaims: ["auditable", "blockable"],
  },
  {
    id: "release_drift",
    title: "Release drift",
    task: {
      id: "W4-T1",
      week: "W4",
      priority: "P0",
      owner: "Release / QA Owner",
      acceptanceCommand: "node --import tsx ./tools/jispec/tests/release-drift-trend.ts",
    },
    requiredArtifacts: [".spec/releases/drift-trend.json", ".spec/baselines/current.yaml", ".spec/requirements/lifecycle.yaml"],
    ownerAction: "Create or compare release snapshots so drift is visible before promotion.",
    nextCommand: "npm run jispec -- release snapshot --version <version> --json",
    proofClaims: ["verifiable", "auditable"],
  },
  {
    id: "console_governance",
    title: "Console governance",
    requiredArtifacts: [".spec/console/governance-snapshot.json"],
    ownerAction: "Export the local Console governance snapshot for owner review.",
    nextCommand: "npm run jispec -- console export-governance --json",
    proofClaims: ["auditable", "localFirst"],
  },
  {
    id: "multi_repo_aggregation",
    title: "Multi-repo aggregation",
    task: {
      id: "W4-T2",
      week: "W4",
      priority: "P0",
      owner: "Console Governance Owner",
      acceptanceCommand: "node --import tsx ./tools/jispec/tests/console-multi-repo-governance.ts",
    },
    requiredArtifacts: [".spec/console/multi-repo-governance.json"],
    ownerAction: "Aggregate exported governance snapshots without scanning source repositories.",
    nextCommand: "npm run jispec -- console aggregate-governance --dir <path> --json",
    proofClaims: ["auditable", "localFirst", "externalToolsControlled"],
  },
  {
    id: "privacy_report",
    title: "Privacy report",
    task: {
      id: "W5-T1",
      week: "W5",
      priority: "P1",
      owner: "Privacy Owner",
      acceptanceCommand: "node --import tsx ./tools/jispec/tests/privacy-redaction.ts",
    },
    requiredArtifacts: [".spec/privacy/privacy-report.json", ".spec/pilot/package.json"],
    ownerAction: "Run privacy report and rebuild the local pilot package before sharing.",
    nextCommand: "npm run jispec -- privacy report --json",
    proofClaims: ["localFirst", "externalToolsControlled", "blockable"],
  },
  {
    id: "source_evolution_adopted",
    title: "Source evolution reviewed and adopted",
    requiredArtifacts: [
      ".spec/baselines/current.yaml",
      ".spec/requirements/lifecycle.yaml",
      ".spec/deltas/*/source-evolution.json",
      ".spec/deltas/*/source-review.yaml",
    ],
    ownerAction: "Review source evolution items and record the adopted lifecycle change before treating it as closed-loop truth.",
    nextCommand: "npm run jispec -- source adopt --change <change-id> --root .",
    proofClaims: ["auditable", "replayable", "localFirst"],
  },
  {
    id: "source_evolution_deferred_repaid",
    title: "Source evolution deferred and later repaid",
    requiredArtifacts: [".spec/deltas/*/source-review.yaml", ".spec/requirements/lifecycle.yaml"],
    ownerAction: "Repay deferred source evolution decisions and keep the review history attached to the lifecycle outcome.",
    nextCommand: "npm run jispec -- source review adopt <item-id> --change <change-id> --root .",
    proofClaims: ["auditable", "replayable", "localFirst"],
  },
  {
    id: "console_source_evolution",
    title: "Console source evolution governance visibility",
    task: {
      id: "P12-T1",
      week: "P12",
      priority: "P0",
      owner: "Console Governance Owner",
      acceptanceCommand: "node --import tsx ./tools/jispec/tests/p12-console-source-evolution.ts",
    },
    requiredArtifacts: [
      ".spec/console/governance-snapshot.json",
      ".spec/baselines/current.yaml",
      ".spec/requirements/lifecycle.yaml",
      ".spec/deltas/*/source-review.yaml",
    ],
    ownerAction: "Export Console governance only after the source evolution object can explain lifecycle state, active change, and review debt.",
    nextCommand: "npm run jispec -- console export-governance --root . --json",
    proofClaims: ["auditable", "localFirst"],
  },
  {
    id: "multi_repo_owner_action",
    title: "Multi-repo owner-action generation",
    task: {
      id: "P12-T2",
      week: "P12",
      priority: "P0",
      owner: "Console Governance Owner",
      acceptanceCommand: "node --import tsx ./tools/jispec/tests/p12-multi-repo-owner-loop.ts",
    },
    requiredArtifacts: [".spec/console/multi-repo-governance.json"],
    ownerAction: "Regenerate the aggregate until cross-repo drift hints produce explicit owner actions instead of silent mismatch.",
    nextCommand: "npm run jispec -- console aggregate-governance --dir <path> --root . --json",
    proofClaims: ["auditable", "localFirst", "externalToolsControlled"],
  },
  {
    id: "release_compare_global_context",
    title: "Release compare with source evolution context",
    task: {
      id: "P13-T1",
      week: "P13",
      priority: "P0",
      owner: "Release / QA Owner",
      acceptanceCommand: "node --import tsx ./tools/jispec/tests/p13-release-global-context.ts",
    },
    requiredArtifacts: [".spec/releases/drift-trend.json", ".spec/releases/compare/*/compare-report.json"],
    ownerAction: "Refresh release compare until the report explains drift through requirement evolution and aggregate context.",
    nextCommand: "npm run jispec -- release compare --from <ref> --to <ref> --root . --json",
    proofClaims: ["verifiable", "auditable", "localFirst"],
  },
  {
    id: "doctor_global_health",
    title: "Doctor global artifact health",
    task: {
      id: "P12-T3",
      week: "P12",
      priority: "P0",
      owner: "Release / Governance Owner",
      acceptanceCommand: "node --import tsx ./tools/jispec/tests/p12-doctor-global.ts",
    },
    requiredArtifacts: [
      ".spec/console/governance-snapshot.json",
      ".spec/console/multi-repo-governance.json",
      ".spec/releases/drift-trend.json",
      ".spec/releases/compare/*/compare-report.json",
    ],
    ownerAction: "Keep the artifact chain healthy enough that doctor global would see a coherent closure loop instead of partial evidence.",
    nextCommand: "npm run jispec -- doctor global --root . --json",
    proofClaims: ["verifiable", "auditable", "localFirst"],
  },
  {
    id: "global_operations_packet",
    title: "Global operations packet",
    task: {
      id: "North-Star-Score-Phase-10",
      week: "Score Optimization",
      priority: "P0",
      owner: "Global Operations Owner",
      acceptanceCommand: "node --import tsx ./tools/jispec/tests/global-operations-packet.ts",
    },
    requiredArtifacts: [".spec/operations/global-operations-packet.json"],
    ownerAction: "Materialize the local-first operations packet after refreshing multi-repo, privacy, audit, and doctor global artifacts.",
    nextCommand: "npm run jispec-cli -- doctor global --write-operations --json",
    proofClaims: ["verifiable", "auditable", "blockable", "localFirst", "externalToolsControlled"],
  },
  {
    id: "org_responsibility_graph",
    title: "Org responsibility graph",
    task: {
      id: "North-Star-Score-Phase-11",
      week: "Score Optimization",
      priority: "P0",
      owner: "Global Operations Owner",
      acceptanceCommand: "node --import tsx ./tools/jispec/tests/org-responsibility-graph.ts",
    },
    requiredArtifacts: [".spec/operations/org-responsibility-graph.json"],
    ownerAction: "Materialize the org responsibility graph after refreshing global operations, org topology, reviewers, escalation paths, and audit evidence.",
    nextCommand: "npm run jispec-cli -- doctor global --write-operations --write-org-graph --json",
    proofClaims: ["verifiable", "auditable", "blockable", "localFirst", "externalToolsControlled"],
  },
  {
    id: "async_review_inbox",
    title: "Async review inbox",
    task: {
      id: "North-Star-Score-Phase-12",
      week: "Score Optimization",
      priority: "P0",
      owner: "Global Operations Owner",
      acceptanceCommand: "node --import tsx ./tools/jispec/tests/async-review-inbox.ts",
    },
    requiredArtifacts: [".spec/operations/async-review-inbox.json"],
    ownerAction: "Materialize the local async review inbox after refreshing org responsibility graph reviewer assignments and audit evidence.",
    nextCommand: "npm run jispec-cli -- doctor global --write-operations --write-org-graph --write-review-inbox --json",
    proofClaims: ["verifiable", "auditable", "blockable", "localFirst", "externalToolsControlled"],
  },
  {
    id: "ops_aging_ledger",
    title: "Ops aging ledger",
    task: {
      id: "North-Star-Score-Phase-13",
      week: "Score Optimization",
      priority: "P0",
      owner: "Global Operations Owner",
      acceptanceCommand: "node --import tsx ./tools/jispec/tests/ops-aging-ledger.ts",
    },
    requiredArtifacts: [".spec/operations/ops-aging-ledger.json"],
    ownerAction: "Materialize the ops aging ledger after refreshing async review inbox and escalation paths.",
    nextCommand: "npm run jispec-cli -- doctor global --write-operations --write-org-graph --write-review-inbox --write-aging-ledger --json",
    proofClaims: ["verifiable", "auditable", "blockable", "localFirst", "externalToolsControlled"],
  },
  {
    id: "release_train_packet",
    title: "Release train packet",
    task: {
      id: "North-Star-Score-Phase-14",
      week: "Score Optimization",
      priority: "P0",
      owner: "Global Operations Owner",
      acceptanceCommand: "node --import tsx ./tools/jispec/tests/release-train-packet.ts",
    },
    requiredArtifacts: [".spec/operations/release-train-packet.json"],
    ownerAction: "Materialize the release train packet after refreshing promotion readiness, release compare context, org responsibility graph, and ops aging ledger.",
    nextCommand: "npm run jispec-cli -- doctor global --write-operations --write-org-graph --write-review-inbox --write-aging-ledger --write-release-train --json",
    proofClaims: ["verifiable", "auditable", "blockable", "localFirst", "externalToolsControlled"],
  },
  {
    id: "org_operations_console",
    title: "Org operations console",
    task: {
      id: "North-Star-Score-Phase-15",
      week: "Score Optimization",
      priority: "P0",
      owner: "Global Operations Owner",
      acceptanceCommand: "node --import tsx ./tools/jispec/tests/org-operations-console.ts",
    },
    requiredArtifacts: [".spec/console/ui/index.html"],
    ownerAction: "Render the local static Console after refreshing org responsibility, async review, SLA aging, and release train artifacts.",
    nextCommand: "npm run jispec-cli -- console ui --root . --json",
    proofClaims: ["verifiable", "auditable", "blockable", "localFirst", "externalToolsControlled"],
  },
];

export function buildNorthStarAcceptance(options: NorthStarAcceptanceOptions): NorthStarAcceptance {
  const root = path.resolve(options.root);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const context = buildScenarioContext(root);
  const scenarios = SCENARIOS.map((definition) => buildScenario(root, definition, context));
  const blockers = scenarios
    .filter((scenario) => scenario.status === "blocking")
    .map((scenario) => ({
      scenarioId: scenario.id,
      title: scenario.title,
      task: scenario.task ? { ...scenario.task } : undefined,
      missingArtifacts: scenario.missingArtifacts,
      requiredArtifacts: scenario.requiredArtifacts,
      blockingReasons: scenario.blockingReasons,
      ownerAction: scenario.ownerAction,
      nextCommand: scenario.nextCommand,
    }));
  const passedScenarioCount = scenarios.filter((scenario) => scenario.status === "passed").length;
  const proofClaims = buildProofClaims(scenarios);

  return {
    schemaVersion: 1,
    kind: "jispec-north-star-acceptance",
    generatedAt,
    root: normalizePath(root),
    contract: {
      version: 1,
      scenarioSuite: "north-star-acceptance",
      sourcePlan: "docs/architecture/north-star-acceptance.md",
    },
    boundary: {
      localOnly: true,
      sourceUploadRequired: false,
      llmBlockingDecisionSource: false,
      deterministicLocalArtifactsOnly: true,
      replacesVerify: false,
      replacesDoctorV1: false,
      replacesDoctorRuntime: false,
      replacesDoctorPilot: false,
      replacesPostReleaseGate: false,
    },
    summary: {
      ready: blockers.length === 0,
      scenarioCount: scenarios.length,
      passedScenarioCount,
      blockingScenarioCount: blockers.length,
    },
    proofClaims,
    scenarios,
    blockers,
    requiredExternalGates: [
      { id: "post_release_gate", command: "npm run post-release:gate", authority: "blocking_gate" },
      { id: "doctor_mainline", command: "npm run jispec-cli -- doctor mainline", authority: "blocking_gate" },
      { id: "doctor_runtime", command: "npm run jispec-cli -- doctor runtime", authority: "blocking_gate" },
      { id: "doctor_pilot", command: "npm run jispec-cli -- doctor pilot", authority: "blocking_gate" },
    ],
  };
}

export function writeNorthStarAcceptance(options: NorthStarAcceptanceOptions): NorthStarAcceptanceResult {
  const root = path.resolve(options.root);
  const acceptance = buildNorthStarAcceptance(options);
  const acceptancePath = resolveOutPath(root, options.outPath);
  const decisionPacketPath = acceptancePath.replace(/\.json$/i, ".md");
  const scenarioArtifactPaths: string[] = [];
  const scenarioDecisionPacketPaths: string[] = [];

  fs.mkdirSync(path.dirname(acceptancePath), { recursive: true });
  fs.writeFileSync(acceptancePath, `${JSON.stringify(acceptance, null, 2)}\n`, "utf-8");
  fs.writeFileSync(decisionPacketPath, renderNorthStarAcceptanceText(acceptance), "utf-8");

  for (const scenario of acceptance.scenarios) {
    const artifactPath = path.join(root, scenario.machineArtifactPath);
    const packetPath = path.join(root, scenario.humanDecisionPacketPath);
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, `${JSON.stringify(buildScenarioArtifact(acceptance, scenario), null, 2)}\n`, "utf-8");
    fs.writeFileSync(packetPath, renderScenarioDecisionPacket(acceptance, scenario), "utf-8");
    scenarioArtifactPaths.push(normalizePath(artifactPath));
    scenarioDecisionPacketPaths.push(normalizePath(packetPath));
  }

  return {
    root: normalizePath(root),
    acceptancePath: normalizePath(acceptancePath),
    decisionPacketPath: normalizePath(decisionPacketPath),
    scenarioArtifactPaths,
    scenarioDecisionPacketPaths,
    acceptance,
  };
}

export function renderNorthStarAcceptanceJSON(result: NorthStarAcceptanceResult): string {
  return JSON.stringify(result, null, 2);
}

export function renderNorthStarAcceptanceText(acceptance: NorthStarAcceptance): string {
  const lines = [
    "# JiSpec North Star Acceptance",
    "",
    HUMAN_SUMMARY_COMPANION_NOTE,
    "",
    `Generated at: ${acceptance.generatedAt}`,
    `Ready: ${acceptance.summary.ready}`,
    `Scenarios: ${acceptance.summary.passedScenarioCount}/${acceptance.summary.scenarioCount} passed`,
    `Blocking scenarios: ${acceptance.summary.blockingScenarioCount}`,
    "",
    "## Global Closure",
    "",
    "- Acceptance now answers whether source evolution, Console governance, release compare, multi-repo owner actions, and doctor global prerequisites form one operational loop.",
    "- These checks stay local-first artifacts and do not replace verify or the external blocking gates.",
    "",
    "## Proof Claims",
      "",
    ...Object.entries(acceptance.proofClaims).map(([claim, value]) => `- ${claim}: ${value}`),
    "",
    "## Scenarios",
    "",
    ...acceptance.scenarios.flatMap((scenario) => [
      `- ${scenario.id}: ${scenario.status}`,
      scenario.task ? `  - Task: ${scenario.task.id} (${scenario.task.week}, ${scenario.task.priority})` : undefined,
      `  - Machine artifact: ${scenario.machineArtifactPath}`,
      `  - Human decision packet: ${scenario.humanDecisionPacketPath}`,
      scenario.evidence ? `  - Evidence: ${scenario.evidence.summary}` : undefined,
      scenario.blockingReasons.length > 0 ? `  - Blocking reasons: ${scenario.blockingReasons.join("; ")}` : undefined,
      `  - Next command: ${scenario.nextCommand}`,
    ].filter((line): line is string => line !== undefined)),
    "",
    "## Required Gates",
    "",
    ...acceptance.requiredExternalGates.map((gate) => `- ${gate.command}`),
    "",
    "## Boundary",
    "",
    "- Local-only acceptance package; source upload is not required.",
    "- LLM output is never a blocking decision source for this suite.",
    "- This suite does not replace verify, doctor mainline, doctor runtime, doctor pilot, or post-release gate.",
    "",
  ];

  if (acceptance.blockers.length > 0) {
    lines.push("## Blockers", "");
    lines.push(...acceptance.blockers.flatMap((blocker) => [
      `- ${blocker.scenarioId}: ${blocker.title}`,
      ...blocker.blockingReasons.map((reason) => `  - ${reason}`),
    ]));
    lines.push("");
  }

  return lines.join("\n");
}

function buildScenario(root: string, definition: ScenarioDefinition, context: ScenarioContext): NorthStarScenario {
  const presentArtifacts = definition.requiredArtifacts.flatMap((artifactPath) => resolveArtifactMatches(root, artifactPath));
  const missingArtifacts = definition.requiredArtifacts.filter((artifactPath) => resolveArtifactMatches(root, artifactPath).length === 0);
  const evaluation = evaluateScenarioSemantics(root, definition.id, context);
  const blockingReasons = [...evaluation.blockingReasons];
  if (missingArtifacts.length > 0) {
    blockingReasons.unshift(`Missing artifacts: ${missingArtifacts.join(", ")}`);
  }
  return {
    id: definition.id,
    title: definition.title,
    status: missingArtifacts.length === 0 && blockingReasons.length === 0 ? "passed" : "blocking",
    task: definition.task ? { ...definition.task } : undefined,
    requiredArtifacts: [...definition.requiredArtifacts],
    presentArtifacts,
    missingArtifacts,
    blockingReasons,
    machineArtifactPath: `.spec/north-star/scenarios/${definition.id}.json`,
    humanDecisionPacketPath: `.spec/north-star/scenarios/${definition.id}-decision.md`,
    ownerAction: definition.ownerAction,
    nextCommand: definition.nextCommand,
    proofClaims: [...definition.proofClaims],
    evidence: evaluation.evidence,
  };
}

function buildProofClaims(scenarios: NorthStarScenario[]): Record<NorthStarProofClaim, boolean> {
  const proofClaimIds: NorthStarProofClaim[] = [
    "verifiable",
    "auditable",
    "blockable",
    "replayable",
    "localFirst",
    "externalToolsControlled",
  ];
  return Object.fromEntries(proofClaimIds.map((claim) => [
    claim,
    scenarios.some((scenario) => scenario.status === "passed" && scenario.proofClaims.includes(claim)),
  ])) as Record<NorthStarProofClaim, boolean>;
}

function buildScenarioArtifact(acceptance: NorthStarAcceptance, scenario: NorthStarScenario): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: "jispec-north-star-scenario-artifact",
    generatedAt: acceptance.generatedAt,
    root: acceptance.root,
    scenarioId: scenario.id,
    title: scenario.title,
    status: scenario.status,
    requiredArtifacts: scenario.requiredArtifacts,
    presentArtifacts: scenario.presentArtifacts,
    missingArtifacts: scenario.missingArtifacts,
    blockingReasons: scenario.blockingReasons,
    proofClaims: scenario.proofClaims,
    boundary: acceptance.boundary,
    ownerAction: scenario.ownerAction,
    nextCommand: scenario.nextCommand,
    task: scenario.task ? { ...scenario.task } : undefined,
    evidence: scenario.evidence ? { ...scenario.evidence } : undefined,
  };
}

function renderScenarioDecisionPacket(acceptance: NorthStarAcceptance, scenario: NorthStarScenario): string {
  const lines = [
    `# North Star Scenario Decision Packet: ${scenario.title}`,
    "",
    HUMAN_SUMMARY_COMPANION_NOTE,
    "",
    ...renderHumanDecisionSnapshot({
      currentState: scenario.status === "passed" ? "Scenario evidence is present." : "Scenario evidence is blocking acceptance.",
      risk: scenario.status === "passed"
        ? "No blocking acceptance gap detected for this scenario."
        : scenario.blockingReasons.join("; "),
      evidence: scenario.presentArtifacts,
      owner: "repo owner",
      nextCommand: scenario.nextCommand,
    }),
    ...(scenario.task ? [
      "## Task",
      "",
      `- Task ID: ${scenario.task.id}`,
      `- Week: ${scenario.task.week}`,
      `- Priority: ${scenario.task.priority}`,
      `- Owner: ${scenario.task.owner}`,
      `- Acceptance command: ${scenario.task.acceptanceCommand}`,
      "",
    ] : []),
    "## Machine Artifact",
    "",
    `- ${scenario.machineArtifactPath}`,
    "",
    "## Required Artifacts",
    "",
    ...scenario.requiredArtifacts.map((artifactPath) => `- ${artifactPath}`),
    ...(scenario.blockingReasons.length > 0 ? [
      "",
      "## Blocking Reasons",
      "",
      ...scenario.blockingReasons.map((reason) => `- ${reason}`),
    ] : []),
    ...(scenario.evidence ? [
      "",
      "## Scenario Evidence",
      "",
      `- ${scenario.evidence.summary}`,
      `- Lifecycle registry: ${scenario.evidence.lifecycleRegistryPath ?? "not recorded"}${scenario.evidence.lifecycleRegistryVersion !== undefined ? ` (v${scenario.evidence.lifecycleRegistryVersion})` : ""}`,
      `- Active source snapshot: ${scenario.evidence.activeSnapshotId ?? "not recorded"}`,
      `- Last adopted source change: ${scenario.evidence.lastAdoptedChangeId ?? "none"}`,
      `- Source evolution artifact: ${scenario.evidence.sourceEvolutionPath ?? "not recorded"}`,
      `- Source review artifact: ${scenario.evidence.sourceReviewPath ?? "not recorded"}`,
      scenario.evidence.currentChangeState ? `- Current change state: ${scenario.evidence.currentChangeState}` : undefined,
      scenario.evidence.sourceEvolutionRepresentativeArtifact
        ? `- Representative artifact: ${scenario.evidence.sourceEvolutionRepresentativeArtifact}`
        : undefined,
      scenario.evidence.openReviewItems !== undefined ? `- Open review items: ${scenario.evidence.openReviewItems}` : undefined,
      scenario.evidence.blockingOpenReviewItems !== undefined
        ? `- Blocking open review items: ${scenario.evidence.blockingOpenReviewItems}`
        : undefined,
      scenario.evidence.deferredItems !== undefined ? `- Deferred items: ${scenario.evidence.deferredItems}` : undefined,
      scenario.evidence.expiredDeferredItems !== undefined
        ? `- Expired deferred items: ${scenario.evidence.expiredDeferredItems}`
        : undefined,
      scenario.evidence.reviewedBlockingItems !== undefined
        ? `- Reviewed blocking items: ${scenario.evidence.reviewedBlockingItems}`
        : undefined,
      scenario.evidence.sourceReviewCoverage
        ? `- Source review coverage: total=${scenario.evidence.sourceReviewCoverage.totalItems}, open=${scenario.evidence.sourceReviewCoverage.open}, adopted=${scenario.evidence.sourceReviewCoverage.adopted}, deferred=${scenario.evidence.sourceReviewCoverage.deferred}, waived=${scenario.evidence.sourceReviewCoverage.waived}, rejected=${scenario.evidence.sourceReviewCoverage.rejected}`
        : undefined,
      scenario.evidence.aggregateContractDriftHintCount !== undefined
        ? `- Aggregate contract drift hints: ${scenario.evidence.aggregateContractDriftHintCount}`
        : undefined,
      scenario.evidence.aggregateOwnerActionCount !== undefined
        ? `- Aggregate owner actions: ${scenario.evidence.aggregateOwnerActionCount}`
        : undefined,
      scenario.evidence.aggregatePromotionReady !== undefined
        ? `- Aggregate promotion readiness: ${scenario.evidence.aggregatePromotionReady}`
        : undefined,
      scenario.evidence.aggregatePromotionPhase
        ? `- Aggregate promotion phase: ${scenario.evidence.aggregatePromotionPhase}`
        : undefined,
      scenario.evidence.releaseCompareReportPath
        ? `- Release compare report: ${scenario.evidence.releaseCompareReportPath}`
        : undefined,
      scenario.evidence.releaseCompareGlobalContextStatus
        ? `- Release compare global context: ${scenario.evidence.releaseCompareGlobalContextStatus}`
        : undefined,
      scenario.evidence.releaseCompareOwnerReviewRecommendationCount !== undefined
        ? `- Release compare owner-review recommendations: ${scenario.evidence.releaseCompareOwnerReviewRecommendationCount}`
        : undefined,
      scenario.evidence.releaseCompareRelevantHintCount !== undefined
        ? `- Release compare relevant hints: ${scenario.evidence.releaseCompareRelevantHintCount}`
        : undefined,
      scenario.evidence.releaseCompareRelevantOwnerActionCount !== undefined
        ? `- Release compare relevant owner actions: ${scenario.evidence.releaseCompareRelevantOwnerActionCount}`
        : undefined,
      scenario.evidence.doctorGlobalReady !== undefined
        ? `- Doctor global prerequisites healthy: ${scenario.evidence.doctorGlobalReady}`
        : undefined,
      scenario.evidence.doctorGlobalBlockerCount !== undefined
        ? `- Doctor global blocker count: ${scenario.evidence.doctorGlobalBlockerCount}`
        : undefined,
      scenario.evidence.globalOperationsPacketStatus
        ? `- Global operations packet: ${scenario.evidence.globalOperationsPacketStatus}`
        : undefined,
      scenario.evidence.globalOperationsOwnerActionCount !== undefined
        ? `- Global operations owner actions: ${scenario.evidence.globalOperationsOwnerActionCount}`
        : undefined,
      scenario.evidence.globalOperationsCrossRepoRefCount !== undefined
        ? `- Global operations cross-repo refs: ${scenario.evidence.globalOperationsCrossRepoRefCount}`
        : undefined,
      scenario.evidence.globalOperationsSupportSurfaceCount !== undefined
        ? `- Global operations support surfaces: ${scenario.evidence.globalOperationsSupportSurfaceCount}`
        : undefined,
      scenario.evidence.globalOperationsAsyncEvidenceAvailable !== undefined
        ? `- Global operations async evidence: ${scenario.evidence.globalOperationsAsyncEvidenceAvailable}/${scenario.evidence.globalOperationsAsyncEvidenceTotal ?? "not recorded"}`
        : undefined,
      scenario.evidence.globalOperationsPrivacyStatus
        ? `- Global operations privacy posture: ${scenario.evidence.globalOperationsPrivacyStatus}`
        : undefined,
      scenario.evidence.globalOperationsBoundaryReplacesVerify !== undefined
        ? `- Global operations replaces verify: ${scenario.evidence.globalOperationsBoundaryReplacesVerify}`
        : undefined,
      scenario.evidence.globalOperationsSourceUploadRequired !== undefined
        ? `- Global operations source upload required: ${scenario.evidence.globalOperationsSourceUploadRequired}`
        : undefined,
      scenario.evidence.globalOperationsRealtimeCollaborationRequired !== undefined
        ? `- Global operations realtime collaboration required: ${scenario.evidence.globalOperationsRealtimeCollaborationRequired}`
        : undefined,
      scenario.evidence.globalOperationsDeferredSurfacesDiagnosticOnly !== undefined
        ? `- Global operations deferred surfaces diagnostic-only: ${scenario.evidence.globalOperationsDeferredSurfacesDiagnosticOnly}`
        : undefined,
      scenario.evidence.orgResponsibilityGraphStatus
        ? `- Org responsibility graph: ${scenario.evidence.orgResponsibilityGraphStatus}`
        : undefined,
      scenario.evidence.orgResponsibilityTeamCount !== undefined
        ? `- Org responsibility teams: ${scenario.evidence.orgResponsibilityTeamCount}`
        : undefined,
      scenario.evidence.orgResponsibilityRepoCount !== undefined
        ? `- Org responsibility repos: ${scenario.evidence.orgResponsibilityRepoCount}`
        : undefined,
      scenario.evidence.orgResponsibilityOwnerActionCount !== undefined
        ? `- Org responsibility owner actions: ${scenario.evidence.orgResponsibilityOwnerActionCount}`
        : undefined,
      scenario.evidence.orgResponsibilityReviewerCoverage !== undefined
        ? `- Org responsibility reviewer coverage: ${scenario.evidence.orgResponsibilityReviewerCoverage}`
        : undefined,
      scenario.evidence.orgResponsibilityEscalationCoverage !== undefined
        ? `- Org responsibility escalation coverage: ${scenario.evidence.orgResponsibilityEscalationCoverage}`
        : undefined,
      scenario.evidence.orgResponsibilityBoundaryReplacesVerify !== undefined
        ? `- Org responsibility replaces verify: ${scenario.evidence.orgResponsibilityBoundaryReplacesVerify}`
        : undefined,
      scenario.evidence.orgResponsibilitySourceUploadRequired !== undefined
        ? `- Org responsibility source upload required: ${scenario.evidence.orgResponsibilitySourceUploadRequired}`
        : undefined,
      scenario.evidence.orgResponsibilityRealtimeCollaborationRequired !== undefined
        ? `- Org responsibility realtime collaboration required: ${scenario.evidence.orgResponsibilityRealtimeCollaborationRequired}`
        : undefined,
      scenario.evidence.asyncReviewInboxStatus
        ? `- Async review inbox: ${scenario.evidence.asyncReviewInboxStatus}`
        : undefined,
      scenario.evidence.asyncReviewReviewerCount !== undefined
        ? `- Async review reviewers: ${scenario.evidence.asyncReviewReviewerCount}`
        : undefined,
      scenario.evidence.asyncReviewTotalItems !== undefined
        ? `- Async review total items: ${scenario.evidence.asyncReviewTotalItems}`
        : undefined,
      scenario.evidence.asyncReviewPending !== undefined
        ? `- Async review pending: ${scenario.evidence.asyncReviewPending}`
        : undefined,
      scenario.evidence.asyncReviewAccepted !== undefined
        ? `- Async review accepted: ${scenario.evidence.asyncReviewAccepted}`
        : undefined,
      scenario.evidence.asyncReviewBlocked !== undefined
        ? `- Async review blocked: ${scenario.evidence.asyncReviewBlocked}`
        : undefined,
      scenario.evidence.asyncReviewExpired !== undefined
        ? `- Async review expired: ${scenario.evidence.asyncReviewExpired}`
        : undefined,
      scenario.evidence.asyncReviewReviewersMissing !== undefined
        ? `- Async review reviewers missing: ${scenario.evidence.asyncReviewReviewersMissing}`
        : undefined,
      scenario.evidence.asyncReviewEscalationReadyItems !== undefined
        ? `- Async review escalation-ready items: ${scenario.evidence.asyncReviewEscalationReadyItems}`
        : undefined,
      scenario.evidence.asyncReviewBoundaryReplacesVerify !== undefined
        ? `- Async review replaces verify: ${scenario.evidence.asyncReviewBoundaryReplacesVerify}`
        : undefined,
      scenario.evidence.asyncReviewSourceUploadRequired !== undefined
        ? `- Async review source upload required: ${scenario.evidence.asyncReviewSourceUploadRequired}`
        : undefined,
      scenario.evidence.asyncReviewRealtimeCollaborationRequired !== undefined
        ? `- Async review realtime collaboration required: ${scenario.evidence.asyncReviewRealtimeCollaborationRequired}`
        : undefined,
      scenario.evidence.opsAgingLedgerStatus
        ? `- Ops aging ledger: ${scenario.evidence.opsAgingLedgerStatus}`
        : undefined,
      scenario.evidence.opsAgingTotalItems !== undefined
        ? `- Ops aging total items: ${scenario.evidence.opsAgingTotalItems}`
        : undefined,
      scenario.evidence.opsAgingFresh !== undefined
        ? `- Ops aging fresh: ${scenario.evidence.opsAgingFresh}`
        : undefined,
      scenario.evidence.opsAgingDueSoon !== undefined
        ? `- Ops aging due soon: ${scenario.evidence.opsAgingDueSoon}`
        : undefined,
      scenario.evidence.opsAgingOverdue !== undefined
        ? `- Ops aging overdue: ${scenario.evidence.opsAgingOverdue}`
        : undefined,
      scenario.evidence.opsAgingEscalated !== undefined
        ? `- Ops aging escalated: ${scenario.evidence.opsAgingEscalated}`
        : undefined,
      scenario.evidence.opsAgingItemsWithEscalationPath !== undefined
        ? `- Ops aging items with escalation path: ${scenario.evidence.opsAgingItemsWithEscalationPath}`
        : undefined,
      scenario.evidence.opsAgingItemsMissingEscalationPath !== undefined
        ? `- Ops aging items missing escalation path: ${scenario.evidence.opsAgingItemsMissingEscalationPath}`
        : undefined,
      scenario.evidence.opsAgingBoundaryReplacesVerify !== undefined
        ? `- Ops aging replaces verify: ${scenario.evidence.opsAgingBoundaryReplacesVerify}`
        : undefined,
      scenario.evidence.opsAgingSourceUploadRequired !== undefined
        ? `- Ops aging source upload required: ${scenario.evidence.opsAgingSourceUploadRequired}`
        : undefined,
      scenario.evidence.opsAgingRealtimeCollaborationRequired !== undefined
        ? `- Ops aging realtime collaboration required: ${scenario.evidence.opsAgingRealtimeCollaborationRequired}`
        : undefined,
      scenario.evidence.releaseTrainPacketStatus
        ? `- Release train packet: ${scenario.evidence.releaseTrainPacketStatus}`
        : undefined,
      scenario.evidence.releaseTrainReady !== undefined
        ? `- Release train ready: ${scenario.evidence.releaseTrainReady}`
        : undefined,
      scenario.evidence.releaseTrainRepoCount !== undefined
        ? `- Release train repos: ${scenario.evidence.releaseTrainRepoCount}`
        : undefined,
      scenario.evidence.releaseTrainBlockedRepoCount !== undefined
        ? `- Release train blocked repos: ${scenario.evidence.releaseTrainBlockedRepoCount}`
        : undefined,
      scenario.evidence.releaseTrainOwnerAssignmentCount !== undefined
        ? `- Release train owner assignments: ${scenario.evidence.releaseTrainOwnerAssignmentCount}`
        : undefined,
      scenario.evidence.releaseTrainRequiredReviewCount !== undefined
        ? `- Release train required reviews: ${scenario.evidence.releaseTrainRequiredReviewCount}`
        : undefined,
      scenario.evidence.releaseTrainSafeNextCommand
        ? `- Release train safe next command: ${scenario.evidence.releaseTrainSafeNextCommand}`
        : undefined,
      scenario.evidence.releaseTrainGlobalContextStatus
        ? `- Release train global context: ${scenario.evidence.releaseTrainGlobalContextStatus}`
        : undefined,
      scenario.evidence.releaseTrainBoundaryReplacesVerify !== undefined
        ? `- Release train replaces verify: ${scenario.evidence.releaseTrainBoundaryReplacesVerify}`
        : undefined,
      scenario.evidence.releaseTrainBoundaryReplacesPostReleaseGate !== undefined
        ? `- Release train replaces post-release gate: ${scenario.evidence.releaseTrainBoundaryReplacesPostReleaseGate}`
        : undefined,
      scenario.evidence.releaseTrainSourceUploadRequired !== undefined
        ? `- Release train source upload required: ${scenario.evidence.releaseTrainSourceUploadRequired}`
        : undefined,
      scenario.evidence.releaseTrainRealtimeCollaborationRequired !== undefined
        ? `- Release train realtime collaboration required: ${scenario.evidence.releaseTrainRealtimeCollaborationRequired}`
        : undefined,
      scenario.evidence.orgOperationsConsoleStatus
        ? `- Org operations console: ${scenario.evidence.orgOperationsConsoleStatus}`
        : undefined,
      scenario.evidence.orgOperationsReady !== undefined
        ? `- Org operations ready: ${scenario.evidence.orgOperationsReady}`
        : undefined,
      scenario.evidence.orgOperationsAvailableObjectCount !== undefined
        ? `- Org operations objects available: ${scenario.evidence.orgOperationsAvailableObjectCount}`
        : undefined,
      scenario.evidence.orgOperationsResponsibilityAssignments !== undefined
        ? `- Org operations responsibility assignments: ${scenario.evidence.orgOperationsResponsibilityAssignments}`
        : undefined,
      scenario.evidence.orgOperationsReviewItems !== undefined
        ? `- Org operations review items: ${scenario.evidence.orgOperationsReviewItems}`
        : undefined,
      scenario.evidence.orgOperationsSlaAttentionCount !== undefined
        ? `- Org operations SLA attention: ${scenario.evidence.orgOperationsSlaAttentionCount}`
        : undefined,
      scenario.evidence.orgOperationsBlockedRepoCount !== undefined
        ? `- Org operations blocked repos: ${scenario.evidence.orgOperationsBlockedRepoCount}`
        : undefined,
      scenario.evidence.orgOperationsBoundaryReplacesVerify !== undefined
        ? `- Org operations replaces verify: ${scenario.evidence.orgOperationsBoundaryReplacesVerify}`
        : undefined,
      scenario.evidence.orgOperationsBoundaryReplacesPostReleaseGate !== undefined
        ? `- Org operations replaces post-release gate: ${scenario.evidence.orgOperationsBoundaryReplacesPostReleaseGate}`
        : undefined,
      scenario.evidence.orgOperationsSourceUploadRequired !== undefined
        ? `- Org operations source upload required: ${scenario.evidence.orgOperationsSourceUploadRequired}`
        : undefined,
      scenario.evidence.orgOperationsRealtimeCollaborationRequired !== undefined
        ? `- Org operations realtime collaboration required: ${scenario.evidence.orgOperationsRealtimeCollaborationRequired}`
        : undefined,
    ].filter((line): line is string => Boolean(line)) : []),
    "",
    "## Text Summary",
    "",
    ...renderHumanDecisionSnapshotText({
      currentState: scenario.status,
      risk: scenario.missingArtifacts.length === 0 ? "none" : scenario.missingArtifacts.join(", "),
      evidence: scenario.presentArtifacts,
      owner: "repo owner",
      nextCommand: scenario.nextCommand,
    }).map((line) => `- ${line}`),
    "",
    `Generated from aggregate: ${acceptance.contract.scenarioSuite}`,
    "",
  ];

  return lines.join("\n");
}

function buildReleaseDriftScenarioEvidence(root: string): NorthStarScenarioEvidence | undefined {
  const baselinePath = path.join(root, ".spec", "baselines", "current.yaml");
  if (!fs.existsSync(baselinePath)) {
    return undefined;
  }

  const baseline = readYamlObject(baselinePath);
  const sourceSnapshot = isRecord(baseline.source_snapshot) ? baseline.source_snapshot : {};
  const lifecycle = isRecord(baseline.requirement_lifecycle) ? baseline.requirement_lifecycle : {};
  const sourceEvolution = isRecord(baseline.source_evolution) ? baseline.source_evolution : {};
  const lifecycleRegistryPath = stringValue(sourceSnapshot.lifecycle_registry_path) ?? stringValue(lifecycle.path);
  const lifecycleRegistryVersion = numberValue(sourceSnapshot.lifecycle_registry_version) ?? numberValue(lifecycle.registry_version);
  const activeSnapshotId = stringValue(sourceSnapshot.active_snapshot_id) ?? stringValue(lifecycle.active_snapshot_id);
  const lastAdoptedChangeId = stringValue(sourceSnapshot.last_adopted_change_id)
    ?? stringValue(lifecycle.last_adopted_change_id)
    ?? stringValue(sourceEvolution.last_adopted_change_id)
    ?? null;
  const sourceEvolutionPath = stringValue(sourceEvolution.source_evolution_path);
  const sourceReviewPath = stringValue(sourceEvolution.source_review_path);
  const governedRequirementEvolution = Boolean(
    lifecycleRegistryPath ||
    lifecycleRegistryVersion !== undefined ||
    activeSnapshotId ||
    lastAdoptedChangeId ||
    sourceEvolutionPath ||
    sourceReviewPath,
  );

  return {
    summary: governedRequirementEvolution
      ? `Release drift includes governed requirement evolution via ${lifecycleRegistryPath ?? ".spec/requirements/lifecycle.yaml"}${lifecycleRegistryVersion !== undefined ? ` v${lifecycleRegistryVersion}` : ""}, active snapshot ${activeSnapshotId ?? "unknown"}, last adopted change ${lastAdoptedChangeId ?? "none"}.`
      : "Release drift baseline exists, but lifecycle migration evidence is not recorded yet.",
    lifecycleRegistryPath,
    lifecycleRegistryVersion,
    activeSnapshotId,
    lastAdoptedChangeId,
    sourceEvolutionPath,
    sourceReviewPath,
    governedRequirementEvolution,
  };
}

function buildScenarioContext(root: string): ScenarioContext {
  return {
    snapshot: collectConsoleLocalSnapshot(root),
    currentBaseline: readOptionalYamlObject(path.join(root, ".spec", "baselines", "current.yaml")),
  };
}

function evaluateScenarioSemantics(
  root: string,
  scenarioId: NorthStarScenarioId,
  context: ScenarioContext,
): { evidence?: NorthStarScenarioEvidence; blockingReasons: string[] } {
  switch (scenarioId) {
    case "release_drift":
      return evaluateReleaseDriftScenario(root);
    case "source_evolution_adopted":
      return evaluateSourceEvolutionAdoptedScenario(root, context);
    case "source_evolution_deferred_repaid":
      return evaluateSourceEvolutionDeferredRepaidScenario(root, context);
    case "console_source_evolution":
      return evaluateConsoleSourceEvolutionScenario(context);
    case "multi_repo_owner_action":
      return evaluateMultiRepoOwnerActionScenario(root, context);
    case "release_compare_global_context":
      return evaluateReleaseCompareGlobalContextScenario(root);
    case "doctor_global_health":
      return evaluateDoctorGlobalHealthScenario(root, context);
    case "mainline_recovery_drill":
      return evaluateMainlineRecoveryDrillScenario(context);
    case "global_operations_packet":
      return evaluateGlobalOperationsPacketScenario(root, context);
    case "org_responsibility_graph":
      return evaluateOrgResponsibilityGraphScenario(root, context);
    case "async_review_inbox":
      return evaluateAsyncReviewInboxScenario(root, context);
    case "ops_aging_ledger":
      return evaluateOpsAgingLedgerScenario(root, context);
    case "release_train_packet":
      return evaluateReleaseTrainPacketScenario(root, context);
    case "org_operations_console":
      return evaluateOrgOperationsConsoleScenario(root, context);
    default:
      return { blockingReasons: [] };
  }
}

function evaluateGlobalOperationsPacketScenario(
  root: string,
  context: ScenarioContext,
): { evidence?: NorthStarScenarioEvidence; blockingReasons: string[] } {
  const packet = readJsonObject(path.join(root, ".spec", "operations", "global-operations-packet.json"));
  const operationObject = findGovernanceObject(context.snapshot, "global_operations_packet");
  const summary = operationObject?.summary ?? {};
  const promotion = isRecord(packet?.promotionReadiness) ? packet.promotionReadiness : {};
  const privacy = isRecord(packet?.privacyPosture) ? packet.privacyPosture : {};
  const boundary = isRecord(packet?.boundary) ? packet.boundary : {};
  const ownerActions = Array.isArray(packet?.ownerActionLifecycle) ? packet.ownerActionLifecycle : [];
  const crossRepoRefs = Array.isArray(packet?.crossRepoContractRefs) ? packet.crossRepoContractRefs : [];
  const auditRefs = Array.isArray(packet?.auditEvidenceRefs) ? packet.auditEvidenceRefs : [];
  const asyncEvents = Array.isArray(packet?.asyncCollaborationEvents) ? packet.asyncCollaborationEvents.filter(isRecord) : [];
  const supportSurfaces = Array.isArray(promotion.referencedSupportSurfaces)
    ? promotion.referencedSupportSurfaces.map(String)
    : [];
  const availableAsyncEvents = asyncEvents.filter((event) => event.status === "available").length;
  const blockingReasons: string[] = [];
  const status = stringValue(packet?.status);

  if (!packet || packet.kind !== "jispec-global-operations-packet") {
    blockingReasons.push("Global operations packet is missing or invalid.");
  }
  if (status !== "ready") {
    blockingReasons.push(`Global operations packet status is ${status ?? "not_declared"}.`);
  }
  if (ownerActions.length === 0) {
    blockingReasons.push("Global operations packet does not expose owner action lifecycle evidence.");
  }
  if (crossRepoRefs.length === 0) {
    blockingReasons.push("Global operations packet does not expose cross-repo contract refs.");
  }
  if (supportSurfaces.length < 2) {
    blockingReasons.push("Global operations packet references fewer than two support surfaces.");
  }
  if (privacy.status !== "available") {
    blockingReasons.push(`Global operations packet privacy posture is ${stringValue(privacy.status) ?? "not_declared"}.`);
  }
  if (auditRefs.length === 0) {
    blockingReasons.push("Global operations packet does not reference audit evidence.");
  }
  if (availableAsyncEvents < 4) {
    blockingReasons.push(`Global operations packet only has ${availableAsyncEvents} async collaboration evidence class(es).`);
  }
  if (boundary.replacesVerify !== false) {
    blockingReasons.push("Global operations packet boundary must not replace verify.");
  }
  if (boundary.sourceUploadRequired !== false) {
    blockingReasons.push("Global operations packet boundary must not require source upload.");
  }
  if (boundary.realtimeCollaborationRequired !== false) {
    blockingReasons.push("Global operations packet boundary must not require real-time collaboration.");
  }
  if (boundary.deferredSurfacesDiagnosticOnly !== true) {
    blockingReasons.push("Global operations packet must keep deferred collaboration surfaces diagnostic-only.");
  }

  return {
    evidence: {
      summary: status === "ready"
        ? `Global operations packet is ready with ${ownerActions.length} owner action(s), ${crossRepoRefs.length} cross-repo ref(s), and ${availableAsyncEvents}/${asyncEvents.length} async evidence class(es).`
        : "Global operations packet is not ready yet.",
      aggregateOwnerActionCount: numberValue(summary.ownerActionCount) ?? ownerActions.length,
      globalOperationsPacketStatus: status,
      globalOperationsOwnerActionCount: numberValue(summary.ownerActionCount) ?? ownerActions.length,
      globalOperationsCrossRepoRefCount: numberValue(summary.crossRepoContractRefCount) ?? crossRepoRefs.length,
      globalOperationsSupportSurfaceCount: numberValue(summary.referencedSupportSurfaceCount) ?? supportSurfaces.length,
      globalOperationsAsyncEvidenceAvailable: numberValue(summary.asyncCollaborationEvidenceAvailable) ?? availableAsyncEvents,
      globalOperationsAsyncEvidenceTotal: numberValue(summary.asyncCollaborationEvidenceTotal) ?? asyncEvents.length,
      globalOperationsPrivacyStatus: stringValue(summary.privacyStatus) ?? stringValue(privacy.status),
      globalOperationsBoundaryReplacesVerify: boundary.replacesVerify === true,
      globalOperationsSourceUploadRequired: boundary.sourceUploadRequired === true,
      globalOperationsRealtimeCollaborationRequired: boundary.realtimeCollaborationRequired === true,
      globalOperationsDeferredSurfacesDiagnosticOnly: boundary.deferredSurfacesDiagnosticOnly === true,
      governedRequirementEvolution: true,
    },
    blockingReasons,
  };
}

function evaluateOrgResponsibilityGraphScenario(
  root: string,
  context: ScenarioContext,
): { evidence?: NorthStarScenarioEvidence; blockingReasons: string[] } {
  const graph = readJsonObject(path.join(root, ".spec", "operations", "org-responsibility-graph.json"));
  const graphObject = findGovernanceObject(context.snapshot, "org_responsibility_graph");
  const summary = graphObject?.summary ?? {};
  const topology = isRecord(graph?.orgTopology) ? graph.orgTopology : {};
  const coverage = isRecord(graph?.reviewerCoverage) ? graph.reviewerCoverage : {};
  const boundary = isRecord(graph?.boundary) ? graph.boundary : {};
  const assignments = Array.isArray(graph?.ownerActionAssignments) ? graph.ownerActionAssignments : [];
  const edges = Array.isArray(graph?.responsibilityEdges) ? graph.responsibilityEdges : [];
  const auditRefs = Array.isArray(graph?.auditEvidenceRefs) ? graph.auditEvidenceRefs : [];
  const status = stringValue(graph?.status);
  const teamCount = numberValue(summary.teamCount) ?? numberValue(topology.teamCount) ?? 0;
  const repoCount = numberValue(summary.repoCount) ?? numberValue(topology.repoCount) ?? 0;
  const ownerActionCount = numberValue(summary.ownerActionAssignmentCount) ?? assignments.length;
  const reviewerCoverage = numberValue(summary.reviewerCoverage)
    ?? coverageRatio(coverage.actionsWithReviewer, coverage.totalOwnerActions);
  const escalationCoverage = numberValue(summary.escalationCoverage)
    ?? coverageRatio(coverage.actionsWithEscalation, coverage.totalOwnerActions);
  const blockingReasons: string[] = [];

  if (!graph || graph.kind !== "jispec-org-responsibility-graph") {
    blockingReasons.push("Org responsibility graph is missing or invalid.");
  }
  if (status !== "ready") {
    blockingReasons.push(`Org responsibility graph status is ${status ?? "not_declared"}.`);
  }
  if (teamCount <= 0 || repoCount <= 0 || edges.length <= 0) {
    blockingReasons.push("Org responsibility graph does not expose team/repo responsibility edges.");
  }
  if (ownerActionCount <= 0) {
    blockingReasons.push("Org responsibility graph does not assign owner actions.");
  }
  if (reviewerCoverage < 1) {
    blockingReasons.push("Org responsibility graph reviewer coverage is incomplete.");
  }
  if (escalationCoverage < 1) {
    blockingReasons.push("Org responsibility graph escalation coverage is incomplete.");
  }
  if (auditRefs.length === 0) {
    blockingReasons.push("Org responsibility graph does not reference audit evidence.");
  }
  if (boundary.replacesVerify !== false) {
    blockingReasons.push("Org responsibility graph boundary must not replace verify.");
  }
  if (boundary.sourceUploadRequired !== false) {
    blockingReasons.push("Org responsibility graph boundary must not require source upload.");
  }
  if (boundary.realtimeCollaborationRequired !== false) {
    blockingReasons.push("Org responsibility graph boundary must not require real-time collaboration.");
  }

  return {
    evidence: {
      summary: status === "ready"
        ? `Org responsibility graph is ready with ${teamCount} team(s), ${repoCount} repo(s), and ${ownerActionCount} owner action assignment(s).`
        : "Org responsibility graph is not ready yet.",
      orgResponsibilityGraphStatus: status,
      orgResponsibilityTeamCount: teamCount,
      orgResponsibilityRepoCount: repoCount,
      orgResponsibilityOwnerActionCount: ownerActionCount,
      orgResponsibilityReviewerCoverage: reviewerCoverage,
      orgResponsibilityEscalationCoverage: escalationCoverage,
      orgResponsibilityBoundaryReplacesVerify: boundary.replacesVerify === true,
      orgResponsibilitySourceUploadRequired: boundary.sourceUploadRequired === true,
      orgResponsibilityRealtimeCollaborationRequired: boundary.realtimeCollaborationRequired === true,
      governedRequirementEvolution: true,
    },
    blockingReasons,
  };
}

function coverageRatio(value: unknown, total: unknown): number {
  const numerator = numberValue(value) ?? 0;
  const denominator = numberValue(total) ?? 0;
  return denominator <= 0 ? 0 : numerator / denominator;
}

function evaluateAsyncReviewInboxScenario(
  root: string,
  context: ScenarioContext,
): { evidence?: NorthStarScenarioEvidence; blockingReasons: string[] } {
  const inbox = readJsonObject(path.join(root, ".spec", "operations", "async-review-inbox.json"));
  const inboxObject = findGovernanceObject(context.snapshot, "async_review_inbox");
  const summary = inboxObject?.summary ?? {};
  const rawSummary = isRecord(inbox?.summary) ? inbox.summary : {};
  const boundary = isRecord(inbox?.boundary) ? inbox.boundary : {};
  const reviewers = Array.isArray(inbox?.reviewers) ? inbox.reviewers : [];
  const items = Array.isArray(inbox?.items) ? inbox.items : [];
  const auditRefs = Array.isArray(inbox?.auditEvidenceRefs) ? inbox.auditEvidenceRefs : [];
  const status = stringValue(inbox?.status);
  const reviewerCount = numberValue(summary.reviewerCount) ?? numberValue(rawSummary.reviewerCount) ?? reviewers.length;
  const totalItems = numberValue(summary.totalItems) ?? numberValue(rawSummary.totalItems) ?? items.length;
  const pending = numberValue(summary.pending) ?? numberValue(rawSummary.pending) ?? 0;
  const accepted = numberValue(summary.accepted) ?? numberValue(rawSummary.accepted) ?? 0;
  const blocked = numberValue(summary.blocked) ?? numberValue(rawSummary.blocked) ?? 0;
  const expired = numberValue(summary.expired) ?? numberValue(rawSummary.expired) ?? 0;
  const reviewersMissing = numberValue(summary.reviewersMissing) ?? numberValue(rawSummary.reviewersMissing) ?? 0;
  const escalationReadyItems = numberValue(summary.escalationReadyItems) ?? numberValue(rawSummary.escalationReadyItems) ?? 0;
  const blockingReasons: string[] = [];

  if (!inbox || inbox.kind !== "jispec-async-review-inbox") {
    blockingReasons.push("Async review inbox is missing or invalid.");
  }
  if (status !== "ready") {
    blockingReasons.push(`Async review inbox status is ${status ?? "not_declared"}.`);
  }
  if (reviewerCount <= 0 || totalItems <= 0) {
    blockingReasons.push("Async review inbox does not expose reviewer queues.");
  }
  if (reviewersMissing > 0) {
    blockingReasons.push("Async review inbox has owner actions without reviewers.");
  }
  if (escalationReadyItems < totalItems) {
    blockingReasons.push("Async review inbox escalation coverage is incomplete.");
  }
  if (auditRefs.length === 0) {
    blockingReasons.push("Async review inbox does not reference audit evidence.");
  }
  if (boundary.replacesVerify !== false) {
    blockingReasons.push("Async review inbox boundary must not replace verify.");
  }
  if (boundary.sourceUploadRequired !== false) {
    blockingReasons.push("Async review inbox boundary must not require source upload.");
  }
  if (boundary.realtimeCollaborationRequired !== false) {
    blockingReasons.push("Async review inbox boundary must not require real-time collaboration.");
  }

  return {
    evidence: {
      summary: status === "ready"
        ? `Async review inbox is ready with ${reviewerCount} reviewer(s), ${totalItems} item(s), and ${pending} pending review(s).`
        : "Async review inbox is not ready yet.",
      asyncReviewInboxStatus: status,
      asyncReviewReviewerCount: reviewerCount,
      asyncReviewTotalItems: totalItems,
      asyncReviewPending: pending,
      asyncReviewAccepted: accepted,
      asyncReviewBlocked: blocked,
      asyncReviewExpired: expired,
      asyncReviewReviewersMissing: reviewersMissing,
      asyncReviewEscalationReadyItems: escalationReadyItems,
      asyncReviewBoundaryReplacesVerify: boundary.replacesVerify === true,
      asyncReviewSourceUploadRequired: boundary.sourceUploadRequired === true,
      asyncReviewRealtimeCollaborationRequired: boundary.realtimeCollaborationRequired === true,
      governedRequirementEvolution: true,
    },
    blockingReasons,
  };
}

function evaluateOpsAgingLedgerScenario(
  root: string,
  context: ScenarioContext,
): { evidence?: NorthStarScenarioEvidence; blockingReasons: string[] } {
  const ledger = readJsonObject(path.join(root, ".spec", "operations", "ops-aging-ledger.json"));
  const ledgerObject = findGovernanceObject(context.snapshot, "ops_aging_ledger");
  const summary = ledgerObject?.summary ?? {};
  const rawSummary = isRecord(ledger?.summary) ? ledger.summary : {};
  const boundary = isRecord(ledger?.boundary) ? ledger.boundary : {};
  const entries = Array.isArray(ledger?.entries) ? ledger.entries : [];
  const auditRefs = Array.isArray(ledger?.auditEvidenceRefs) ? ledger.auditEvidenceRefs : [];
  const status = stringValue(ledger?.status);
  const totalItems = numberValue(summary.totalItems) ?? numberValue(rawSummary.totalItems) ?? entries.length;
  const fresh = numberValue(summary.fresh) ?? numberValue(rawSummary.fresh) ?? 0;
  const dueSoon = numberValue(summary.dueSoon) ?? numberValue(rawSummary.dueSoon) ?? 0;
  const overdue = numberValue(summary.overdue) ?? numberValue(rawSummary.overdue) ?? 0;
  const escalated = numberValue(summary.escalated) ?? numberValue(rawSummary.escalated) ?? 0;
  const itemsWithEscalationPath = numberValue(summary.itemsWithEscalationPath) ?? numberValue(rawSummary.itemsWithEscalationPath) ?? 0;
  const itemsMissingEscalationPath = numberValue(summary.itemsMissingEscalationPath) ?? numberValue(rawSummary.itemsMissingEscalationPath) ?? 0;
  const blockingReasons: string[] = [];

  if (!ledger || ledger.kind !== "jispec-ops-aging-ledger") {
    blockingReasons.push("Ops aging ledger is missing or invalid.");
  }
  if (status !== "ready") {
    blockingReasons.push(`Ops aging ledger status is ${status ?? "not_declared"}.`);
  }
  if (totalItems <= 0 || entries.length <= 0) {
    blockingReasons.push("Ops aging ledger does not expose SLA entries.");
  }
  if (itemsMissingEscalationPath > 0 || itemsWithEscalationPath < totalItems) {
    blockingReasons.push("Ops aging ledger escalation path coverage is incomplete.");
  }
  if (auditRefs.length === 0) {
    blockingReasons.push("Ops aging ledger does not reference audit evidence.");
  }
  if (boundary.replacesVerify !== false) {
    blockingReasons.push("Ops aging ledger boundary must not replace verify.");
  }
  if (boundary.sourceUploadRequired !== false) {
    blockingReasons.push("Ops aging ledger boundary must not require source upload.");
  }
  if (boundary.realtimeCollaborationRequired !== false) {
    blockingReasons.push("Ops aging ledger boundary must not require real-time collaboration.");
  }

  return {
    evidence: {
      summary: status === "ready"
        ? `Ops aging ledger is ready with ${totalItems} item(s): fresh=${fresh}, due-soon=${dueSoon}, overdue=${overdue}, escalated=${escalated}.`
        : "Ops aging ledger is not ready yet.",
      opsAgingLedgerStatus: status,
      opsAgingTotalItems: totalItems,
      opsAgingFresh: fresh,
      opsAgingDueSoon: dueSoon,
      opsAgingOverdue: overdue,
      opsAgingEscalated: escalated,
      opsAgingItemsWithEscalationPath: itemsWithEscalationPath,
      opsAgingItemsMissingEscalationPath: itemsMissingEscalationPath,
      opsAgingBoundaryReplacesVerify: boundary.replacesVerify === true,
      opsAgingSourceUploadRequired: boundary.sourceUploadRequired === true,
      opsAgingRealtimeCollaborationRequired: boundary.realtimeCollaborationRequired === true,
      governedRequirementEvolution: true,
    },
    blockingReasons,
  };
}

function evaluateReleaseTrainPacketScenario(
  root: string,
  context: ScenarioContext,
): { evidence?: NorthStarScenarioEvidence; blockingReasons: string[] } {
  const packet = readJsonObject(path.join(root, ".spec", "operations", "release-train-packet.json"));
  const packetObject = findGovernanceObject(context.snapshot, "release_train_packet");
  const summary = packetObject?.summary ?? {};
  const train = isRecord(packet?.trainReadiness) ? packet.trainReadiness : {};
  const releaseCompare = isRecord(packet?.releaseCompare) ? packet.releaseCompare : {};
  const boundary = isRecord(packet?.boundary) ? packet.boundary : {};
  const repos = Array.isArray(packet?.repos) ? packet.repos : [];
  const ownerAssignments = Array.isArray(packet?.ownerAssignments) ? packet.ownerAssignments : [];
  const requiredReviews = Array.isArray(packet?.requiredReviews) ? packet.requiredReviews : [];
  const auditRefs = Array.isArray(packet?.auditEvidenceRefs) ? packet.auditEvidenceRefs : [];
  const status = stringValue(packet?.status);
  const trainReady = summary.trainReady === true || train.ready === true;
  const repoCount = numberValue(summary.repoCount) ?? repos.length;
  const blockedRepoCount = numberValue(summary.blockedRepoCount) ?? numberValue(train.blockedRepoCount) ?? 0;
  const ownerAssignmentCount = numberValue(summary.ownerAssignmentCount) ?? numberValue(train.ownerAssignmentCount) ?? ownerAssignments.length;
  const requiredReviewCount = numberValue(summary.requiredReviewCount) ?? numberValue(train.requiredReviewCount) ?? requiredReviews.length;
  const safeNextCommand = stringValue(summary.safeNextCommand) ?? stringValue(train.safeNextCommand);
  const globalContextStatus = stringValue(summary.releaseCompareGlobalContextStatus) ?? stringValue(releaseCompare.globalContextStatus);
  const blockingReasons: string[] = [];

  if (!packet || packet.kind !== "jispec-release-train-packet") {
    blockingReasons.push("Release train packet is missing or invalid.");
  }
  if (status !== "ready") {
    blockingReasons.push(`Release train packet status is ${status ?? "not_declared"}.`);
  }
  if (!trainReady) {
    blockingReasons.push("Release train readiness is not true.");
  }
  if (repoCount <= 0) {
    blockingReasons.push("Release train packet does not expose repo coordination.");
  }
  if (ownerAssignmentCount <= 0 || ownerAssignments.length <= 0) {
    blockingReasons.push("Release train packet does not expose owner assignments.");
  }
  if (requiredReviewCount <= 0 || requiredReviews.length <= 0) {
    blockingReasons.push("Release train packet does not expose required reviews.");
  }
  if (!safeNextCommand || safeNextCommand === "not_available_yet") {
    blockingReasons.push("Release train packet does not expose a safe next command.");
  }
  if (globalContextStatus !== "available") {
    blockingReasons.push("Release train packet does not include available release compare global context.");
  }
  if (auditRefs.length === 0) {
    blockingReasons.push("Release train packet does not reference audit evidence.");
  }
  if (boundary.replacesVerify !== false) {
    blockingReasons.push("Release train packet boundary must not replace verify.");
  }
  if (boundary.replacesPostReleaseGate !== false) {
    blockingReasons.push("Release train packet boundary must not replace post-release gate.");
  }
  if (boundary.sourceUploadRequired !== false) {
    blockingReasons.push("Release train packet boundary must not require source upload.");
  }
  if (boundary.realtimeCollaborationRequired !== false) {
    blockingReasons.push("Release train packet boundary must not require real-time collaboration.");
  }

  return {
    evidence: {
      summary: status === "ready"
        ? `Release train packet is ready with ${repoCount} repo(s), ${ownerAssignmentCount} owner assignment(s), ${requiredReviewCount} required review(s), and ${blockedRepoCount} blocked repo(s).`
        : "Release train packet is not ready yet.",
      releaseTrainPacketStatus: status,
      releaseTrainReady: trainReady,
      releaseTrainRepoCount: repoCount,
      releaseTrainBlockedRepoCount: blockedRepoCount,
      releaseTrainOwnerAssignmentCount: ownerAssignmentCount,
      releaseTrainRequiredReviewCount: requiredReviewCount,
      releaseTrainSafeNextCommand: safeNextCommand,
      releaseTrainGlobalContextStatus: globalContextStatus,
      releaseTrainBoundaryReplacesVerify: boundary.replacesVerify === true,
      releaseTrainBoundaryReplacesPostReleaseGate: boundary.replacesPostReleaseGate === true,
      releaseTrainSourceUploadRequired: boundary.sourceUploadRequired === true,
      releaseTrainRealtimeCollaborationRequired: boundary.realtimeCollaborationRequired === true,
      governedRequirementEvolution: true,
    },
    blockingReasons,
  };
}

function evaluateOrgOperationsConsoleScenario(
  root: string,
  context: ScenarioContext,
): { evidence?: NorthStarScenarioEvidence; blockingReasons: string[] } {
  const htmlPath = path.join(root, ".spec", "console", "ui", "index.html");
  const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf-8") : "";
  const orgOps = context.snapshot.governance.orgOperations;
  const boundary = orgOps.boundary;
  const slaAttentionCount = orgOps.sla.dueSoon + orgOps.sla.overdue + orgOps.sla.escalated;
  const blockingReasons: string[] = [];

  if (!html) {
    blockingReasons.push("Org operations static Console HTML is missing.");
  }
  if (!html.includes("Org Operations")) {
    blockingReasons.push("Static Console does not render the org operations panel.");
  }
  if (!orgOps.ready) {
    blockingReasons.push(`Org operations summary is ${orgOps.status}.`);
  }
  if (orgOps.availableObjectCount < orgOps.sourceObjectIds.length) {
    blockingReasons.push("Org operations summary does not include all four local org operations objects.");
  }
  if (orgOps.releaseTrain.blockedRepoCount > 0) {
    blockingReasons.push("Org operations release train has blocked repos.");
  }
  if (boundary.replacesVerify !== false) {
    blockingReasons.push("Org operations console boundary must not replace verify.");
  }
  if (boundary.replacesPostReleaseGate !== false) {
    blockingReasons.push("Org operations console boundary must not replace post-release gate.");
  }
  if (boundary.sourceUploadRequired !== false) {
    blockingReasons.push("Org operations console boundary must not require source upload.");
  }
  if (boundary.realtimeCollaborationRequired !== false) {
    blockingReasons.push("Org operations console boundary must not require real-time collaboration.");
  }

  return {
    evidence: {
      summary: orgOps.ready
        ? `Org operations console is ready with ${orgOps.availableObjectCount}/${orgOps.sourceObjectIds.length} local org operations object(s).`
        : "Org operations console is not ready yet.",
      orgOperationsConsoleStatus: orgOps.status,
      orgOperationsReady: orgOps.ready,
      orgOperationsAvailableObjectCount: orgOps.availableObjectCount,
      orgOperationsMissingObjectCount: orgOps.missingObjectCount,
      orgOperationsResponsibilityAssignments: orgOps.responsibility.ownerActionAssignmentCount,
      orgOperationsReviewItems: orgOps.reviews.totalItems,
      orgOperationsSlaAttentionCount: slaAttentionCount,
      orgOperationsBlockedRepoCount: orgOps.releaseTrain.blockedRepoCount,
      orgOperationsBoundaryReplacesVerify: false,
      orgOperationsBoundaryReplacesPostReleaseGate: false,
      orgOperationsSourceUploadRequired: false,
      orgOperationsRealtimeCollaborationRequired: false,
      governedRequirementEvolution: true,
    },
    blockingReasons,
  };
}

function evaluateMainlineRecoveryDrillScenario(
  context: ScenarioContext,
): { evidence?: NorthStarScenarioEvidence; blockingReasons: string[] } {
  const drill = findGovernanceObject(context.snapshot, "mainline_recovery_drill");
  const summary = drill?.summary ?? {};
  const state = stringValue(summary.state);
  const status = stringValue(summary.status);
  const stepCount = numberValue(summary.stepCount) ?? 0;
  const expectedNextState = stringValue(summary.topStepExpectedNextState);
  const verificationCommand = stringValue(summary.topStepVerificationCommand);
  const blockingReasons: string[] = [];

  if (!drill || state !== "available") {
    blockingReasons.push("Mainline recovery drill artifact is missing.");
  }
  if (status !== "idle" && stepCount <= 0) {
    blockingReasons.push("Mainline recovery drill does not contain any drill step for a non-idle state.");
  }
  if (status !== "idle" && (!expectedNextState || expectedNextState === "not_available_yet")) {
    blockingReasons.push("Mainline recovery drill top step is missing expected next state.");
  }
  if (status !== "idle" && (!verificationCommand || verificationCommand === "not_available_yet")) {
    blockingReasons.push("Mainline recovery drill top step is missing verification command.");
  }

  return {
    evidence: {
      summary: status === "idle"
        ? "Mainline recovery drill is idle; no recovery action is required."
        : `Mainline recovery drill has ${stepCount} step(s), expected next state: ${expectedNextState ?? "not_available_yet"}.`,
      mainlineRecoveryDrillStatus: status,
      mainlineRecoveryDrillStepCount: stepCount,
      mainlineRecoveryDrillExpectedNextState: expectedNextState,
      mainlineRecoveryDrillVerificationCommand: verificationCommand,
      governedRequirementEvolution: false,
    },
    blockingReasons,
  };
}

function evaluateReleaseDriftScenario(root: string): { evidence?: NorthStarScenarioEvidence; blockingReasons: string[] } {
  const evidence = buildReleaseDriftScenarioEvidence(root);
  const blockingReasons: string[] = [];
  if (!evidence) {
    blockingReasons.push("Release drift evidence could not be derived from .spec/baselines/current.yaml.");
  } else if (!evidence.governedRequirementEvolution) {
    blockingReasons.push("Release drift exists but governed requirement evolution is not recorded.");
  }
  return { evidence, blockingReasons };
}

function evaluateSourceEvolutionAdoptedScenario(
  root: string,
  context: ScenarioContext,
): { evidence?: NorthStarScenarioEvidence; blockingReasons: string[] } {
  const summary = readCurrentSourceEvolutionSummary(root, context.currentBaseline, context.snapshot);
  if (!summary) {
    return {
      blockingReasons: ["Current source evolution summary is not available from the baseline and review artifacts."],
    };
  }

  const blockingReasons: string[] = [];
  const adoptedCount = summary.reviewItems.filter((item) => stringValue(item.status) === "adopted").length;
  if (summary.reviewItems.length === 0) {
    blockingReasons.push("No source review decisions were found for the current source change.");
  }
  if (adoptedCount !== summary.reviewItems.length) {
    blockingReasons.push("Not every source review item is adopted yet.");
  }
  if (
    summary.changeId &&
    summary.lastAdoptedChangeId &&
    summary.changeId !== summary.lastAdoptedChangeId
  ) {
    blockingReasons.push(`Last adopted source change is ${summary.lastAdoptedChangeId}, not the reviewed change ${summary.changeId}.`);
  }

  return {
    evidence: {
      summary: adoptedCount === summary.reviewItems.length && summary.reviewItems.length > 0
        ? `Source evolution change ${summary.changeId ?? "unknown"} is fully adopted and aligned with the lifecycle baseline.`
        : `Source evolution change ${summary.changeId ?? "unknown"} is not fully adopted yet.`,
      lifecycleRegistryPath: summary.lifecycleRegistryPath,
      lifecycleRegistryVersion: summary.lifecycleRegistryVersion,
      activeSnapshotId: summary.activeSnapshotId,
      lastAdoptedChangeId: summary.lastAdoptedChangeId,
      sourceEvolutionPath: summary.sourceEvolutionPath,
      sourceReviewPath: summary.sourceReviewPath,
      currentChangeState: summary.currentChangeState,
      openReviewItems: summary.openReviewItems,
      blockingOpenReviewItems: summary.blockingOpenReviewItems,
      deferredItems: summary.deferredItems,
      expiredDeferredItems: summary.expiredDeferredItems,
      reviewedBlockingItems: summary.reviewedBlockingItems,
      sourceEvolutionRepresentativeArtifact: summary.representativeArtifact,
      sourceReviewCoverage: summary.sourceReviewCoverage,
      pendingChanges: summary.pendingChanges,
      governedRequirementEvolution: true,
    },
    blockingReasons,
  };
}

function evaluateSourceEvolutionDeferredRepaidScenario(
  root: string,
  context: ScenarioContext,
): { evidence?: NorthStarScenarioEvidence; blockingReasons: string[] } {
  const summary = readCurrentSourceEvolutionSummary(root, context.currentBaseline, context.snapshot);
  if (!summary) {
    return {
      blockingReasons: ["Deferred source evolution history could not be reconstructed from the current review artifact."],
    };
  }

  const repaidItems = summary.reviewItems.filter((item) => {
    const history = Array.isArray(item.review_history) ? item.review_history.filter(isRecord) : [];
    const actions = history.map((entry) => stringValue(entry.action)).filter((entry): entry is string => Boolean(entry));
    return actions.includes("defer") && actions.includes("adopt") && stringValue(item.status) === "adopted";
  });
  const blockingReasons: string[] = [];
  if (repaidItems.length === 0) {
    blockingReasons.push("No source review item shows a defer -> adopt repayment history.");
  }
  if ((summary.deferredItems ?? 0) > 0) {
    blockingReasons.push(`There are still ${summary.deferredItems} deferred source review item(s) awaiting repayment.`);
  }
  if ((summary.expiredDeferredItems ?? 0) > 0) {
    blockingReasons.push(`There are still ${summary.expiredDeferredItems} expired deferred source review item(s).`);
  }

  return {
    evidence: {
      summary: repaidItems.length > 0 && (summary.deferredItems ?? 0) === 0 && (summary.expiredDeferredItems ?? 0) === 0
        ? `${repaidItems.length} source review item(s) show defer -> adopt repayment history and the deferred debt is now clear.`
        : "No repaid deferred source review history was found.",
      lifecycleRegistryPath: summary.lifecycleRegistryPath,
      lifecycleRegistryVersion: summary.lifecycleRegistryVersion,
      activeSnapshotId: summary.activeSnapshotId,
      lastAdoptedChangeId: summary.lastAdoptedChangeId,
      sourceEvolutionPath: summary.sourceEvolutionPath,
      sourceReviewPath: summary.sourceReviewPath,
      currentChangeState: summary.currentChangeState,
      openReviewItems: summary.openReviewItems,
      blockingOpenReviewItems: summary.blockingOpenReviewItems,
      deferredItems: summary.deferredItems,
      expiredDeferredItems: summary.expiredDeferredItems,
      reviewedBlockingItems: summary.reviewedBlockingItems,
      sourceEvolutionRepresentativeArtifact: summary.representativeArtifact,
      sourceReviewCoverage: summary.sourceReviewCoverage,
      pendingChanges: summary.pendingChanges,
      governedRequirementEvolution: true,
    },
    blockingReasons,
  };
}

function evaluateConsoleSourceEvolutionScenario(
  context: ScenarioContext,
): { evidence?: NorthStarScenarioEvidence; blockingReasons: string[] } {
  const sourceEvolution = findGovernanceObject(context.snapshot, "source_evolution_governance");
  const summary = sourceEvolution?.summary ?? {};
  const sourceReviewCoverage = isRecord(summary.sourceReviewCoverage)
    ? {
        totalItems: numberValue(summary.sourceReviewCoverage.totalItems) ?? 0,
        open: numberValue(summary.sourceReviewCoverage.open) ?? 0,
        adopted: numberValue(summary.sourceReviewCoverage.adopted) ?? 0,
        deferred: numberValue(summary.sourceReviewCoverage.deferred) ?? 0,
        waived: numberValue(summary.sourceReviewCoverage.waived) ?? 0,
        rejected: numberValue(summary.sourceReviewCoverage.rejected) ?? 0,
      }
    : undefined;
  const pendingChanges = Array.isArray(summary.pendingChanges)
    ? summary.pendingChanges.filter(isRecord).map((entry) => ({
        changeId: stringValue(entry.changeId) ?? "unknown",
        openReviewItems: numberValue(entry.openReviewItems) ?? 0,
        blockingOpenReviewItems: numberValue(entry.blockingOpenReviewItems) ?? 0,
        sourceEvolutionPath: stringValue(entry.sourceEvolutionPath),
        sourceReviewPath: stringValue(entry.sourceReviewPath),
      }))
    : undefined;
  const blockingReasons: string[] = [];
  const currentChangeState = stringValue(summary.currentChangeState);
  const activeSnapshotId = stringValue(summary.activeSnapshotId);
  const lifecyclePath = stringValue(summary.lifecyclePath);
  const sourceEvolutionPath = stringValue(summary.sourceEvolutionPath);
  const sourceReviewPath = stringValue(summary.sourceReviewPath);
  const representativeArtifact = stringValue(summary.activeRepresentativeItem);
  const lastAdoptedSourceChange = nullableString(summary.lastAdoptedSourceChange);
  if (!sourceEvolution || sourceEvolution.status !== "available") {
    blockingReasons.push("Console source_evolution_governance object is not available.");
  }
  if (!currentChangeState || currentChangeState === "not_available_yet") {
    blockingReasons.push("Console source evolution governance does not expose a current change state.");
  }
  if (!activeSnapshotId || activeSnapshotId === "not_available_yet") {
    blockingReasons.push("Console source evolution governance does not expose an active source snapshot id.");
  }
  if (!lifecyclePath || lifecyclePath === "not_available_yet") {
    blockingReasons.push("Console source evolution governance does not expose the lifecycle registry path.");
  }
  if (!sourceEvolutionPath || sourceEvolutionPath === "not_available_yet") {
    blockingReasons.push("Console source evolution governance does not expose a source evolution artifact path.");
  }
  if (!sourceReviewPath || sourceReviewPath === "not_available_yet") {
    blockingReasons.push("Console source evolution governance does not expose a source review artifact path.");
  }
  if (!representativeArtifact || representativeArtifact === "not_available_yet") {
    blockingReasons.push("Console source evolution governance does not expose a representative artifact.");
  }
  if (lastAdoptedSourceChange === null || lastAdoptedSourceChange === "not_available_yet") {
    blockingReasons.push("Console source evolution governance does not expose a last adopted source change.");
  }
  if (!sourceReviewCoverage) {
    blockingReasons.push("Console source evolution governance does not expose source review coverage.");
  }

  return {
    evidence: sourceEvolution
      ? {
          summary: sourceEvolution.status === "available"
            ? `Console exposes source evolution governance with state ${currentChangeState ?? "not_available_yet"}, active snapshot ${activeSnapshotId ?? "not_available_yet"}, and ${summary.reviewedBlockingItems ?? 0} reviewed blocking item(s).`
            : "Console source evolution governance object is not available yet.",
          lifecycleRegistryPath: lifecyclePath,
          activeSnapshotId,
          lastAdoptedChangeId: lastAdoptedSourceChange,
          sourceEvolutionPath,
          sourceReviewPath,
          currentChangeState,
          openReviewItems: numberValue(summary.openReviewItems),
          blockingOpenReviewItems: numberValue(summary.blockingOpenReviewItems),
          deferredItems: numberValue(summary.deferredItems),
          expiredDeferredItems: numberValue(summary.expiredDeferredItems),
          reviewedBlockingItems: numberValue(summary.reviewedBlockingItems),
          sourceEvolutionRepresentativeArtifact: representativeArtifact,
          sourceReviewCoverage,
          pendingChanges,
          governedRequirementEvolution: sourceEvolution.status === "available",
        }
      : undefined,
    blockingReasons,
  };
}

function evaluateMultiRepoOwnerActionScenario(
  root: string,
  context: ScenarioContext,
): { evidence?: NorthStarScenarioEvidence; blockingReasons: string[] } {
  const aggregate = readJsonObject(path.join(root, ".spec", "console", "multi-repo-governance.json"));
  const summary = isRecord(aggregate?.summary) ? aggregate.summary : {};
  const promotionReadiness = isRecord(aggregate?.promotionReadiness) ? aggregate.promotionReadiness : {};
  const ownerActions = Array.isArray(aggregate?.ownerActions) ? aggregate.ownerActions : [];
  const contractDriftHints = Array.isArray(aggregate?.contractDriftHints) ? aggregate.contractDriftHints : [];
  const blockingReasons: string[] = [];
  const summaryOwnerActionCount = numberValue(summary.ownerActionCount);
  const summaryContractDriftHintCount = numberValue(summary.contractDriftHintCount);
  const aggregatePromotionReady = promotionReadiness.ready === true;
  const aggregatePromotionPhase = stringValue(promotionReadiness.phase);
  if (!aggregate || aggregate.kind !== "jispec-multi-repo-governance-aggregate") {
    blockingReasons.push("Multi-repo governance aggregate is missing or invalid.");
  }
  if (summaryOwnerActionCount === undefined) {
    blockingReasons.push("Multi-repo governance aggregate summary does not expose an owner action count.");
  }
  if (summaryContractDriftHintCount === undefined) {
    blockingReasons.push("Multi-repo governance aggregate summary does not expose a contract drift hint count.");
  }
  if ((summaryOwnerActionCount ?? ownerActions.length) === 0) {
    blockingReasons.push("Aggregate does not expose any multi-repo owner action.");
  }
  if ((summaryContractDriftHintCount ?? contractDriftHints.length) === 0) {
    blockingReasons.push("Aggregate does not expose any cross-repo contract drift hint.");
  }
  if (summaryOwnerActionCount !== undefined && summaryOwnerActionCount !== ownerActions.length) {
    blockingReasons.push(`Aggregate owner action count ${summaryOwnerActionCount} does not match the exported owner action list (${ownerActions.length}).`);
  }
  if (summaryContractDriftHintCount !== undefined && summaryContractDriftHintCount !== contractDriftHints.length) {
    blockingReasons.push(`Aggregate contract drift hint count ${summaryContractDriftHintCount} does not match the exported hint list (${contractDriftHints.length}).`);
  }
  if (aggregatePromotionPhase !== "north-star-score-optimization-phase-2") {
    blockingReasons.push("Aggregate does not expose the phase-2 multi-repo promotion readiness contract.");
  }
  if (!aggregatePromotionReady) {
    blockingReasons.push("Aggregate phase-2 multi-repo promotion readiness is not ready.");
  }

  const sourceEvolution = findGovernanceObject(context.snapshot, "source_evolution_governance");
  return {
    evidence: {
      summary: ownerActions.length > 0
        ? `Aggregate exposes ${ownerActions.length} owner action(s), ${contractDriftHints.length} cross-repo drift hint(s), and promotion readiness ${aggregatePromotionReady ? "ready" : "not ready"}.`
        : "Aggregate exists but does not yet expose owner-action loop output.",
      lifecycleRegistryPath: stringValue(sourceEvolution?.summary.lifecyclePath),
      sourceEvolutionPath: stringValue(sourceEvolution?.summary.sourceEvolutionPath),
      sourceReviewPath: stringValue(sourceEvolution?.summary.sourceReviewPath),
      aggregateContractDriftHintCount: summaryContractDriftHintCount ?? contractDriftHints.length,
      aggregateOwnerActionCount: summaryOwnerActionCount ?? ownerActions.length,
      aggregatePromotionReady,
      aggregatePromotionPhase,
      governedRequirementEvolution: Boolean(sourceEvolution && sourceEvolution.status === "available"),
    },
    blockingReasons,
  };
}

function evaluateReleaseCompareGlobalContextScenario(
  root: string,
): { evidence?: NorthStarScenarioEvidence; blockingReasons: string[] } {
  const latest = readLatestReleaseCompare(root);
  const globalContext = isRecord(latest?.report.globalContext) ? latest?.report.globalContext : {};
  const details = isRecord(globalContext.details) ? globalContext.details : {};
  const lifecycleDelta = isRecord(details.lifecycleRegistryDelta) ? details.lifecycleRegistryDelta : {};
  const sourceEvolutionArtifacts = isRecord(details.sourceEvolutionArtifacts) ? details.sourceEvolutionArtifacts : {};
  const ownerReviewRecommendations = Array.isArray(details.ownerReviewRecommendations) ? details.ownerReviewRecommendations : [];
  const relevantHints = Array.isArray(details.relevantContractDriftHints) ? details.relevantContractDriftHints : [];
  const relevantOwnerActions = Array.isArray(details.relevantOwnerActions) ? details.relevantOwnerActions : [];
  const blockingReasons: string[] = [];
  const globalContextStatus = stringValue(globalContext.status);
  const lifecycleRegistryDeltaPath = stringValue(lifecycleDelta.toPath);
  const lifecycleRegistryDeltaVersion = numberValue(lifecycleDelta.toVersion);
  const sourceEvolutionPath = stringValue(sourceEvolutionArtifacts.toSourceEvolutionPath);
  const sourceReviewPath = stringValue(sourceEvolutionArtifacts.toSourceReviewPath);
  const activeSnapshotId = stringValue(sourceEvolutionArtifacts.toActiveSnapshotId);
  const lastAdoptedChangeId = nullableString(sourceEvolutionArtifacts.toLastAdoptedChangeId);
  if (!latest) {
    blockingReasons.push("No release compare report could be resolved from .spec/releases/drift-trend.json.");
  }
  if (globalContext.kind !== "release_compare_global_context") {
    blockingReasons.push("Latest release compare report does not expose the P13 globalContext contract.");
  }
  if (globalContextStatus !== "available") {
    blockingReasons.push(`Latest release compare global context status is ${globalContextStatus ?? "not_declared"}.`);
  }
  if (!lifecycleRegistryDeltaPath || lifecycleRegistryDeltaVersion === undefined) {
    blockingReasons.push("Latest release compare report does not describe the lifecycle registry delta.");
  }
  if (!sourceEvolutionPath || !sourceReviewPath) {
    blockingReasons.push("Latest release compare report does not describe the source evolution and review artifacts.");
  }
  if (!activeSnapshotId || activeSnapshotId === "not_available_yet") {
    blockingReasons.push("Latest release compare report does not expose an active source snapshot id.");
  }
  if (!lastAdoptedChangeId || lastAdoptedChangeId === "not_available_yet") {
    blockingReasons.push("Latest release compare report does not expose a last adopted source change.");
  }
  if (relevantHints.length === 0) {
    blockingReasons.push("Latest release compare report does not surface any relevant contract drift hints.");
  }
  if (relevantOwnerActions.length === 0) {
    blockingReasons.push("Latest release compare report does not surface any relevant owner actions.");
  }
  if (ownerReviewRecommendations.length === 0) {
    blockingReasons.push("Latest release compare report does not surface any owner-review recommendations.");
  }
  if (!stringValue(details.aggregatePath)) {
    blockingReasons.push("Latest release compare report does not link source evolution or aggregate context artifacts.");
  }
  if (
    globalContextStatus === "available" &&
    sourceEvolutionPath &&
    !Boolean(lifecycleDelta.changed)
  ) {
    blockingReasons.push("Latest release compare report does not describe a lifecycle registry delta for the compared release.");
  }

  return {
    evidence: latest
      ? {
          summary: globalContextStatus === "available"
            ? `Release compare consumed aggregate governance context with ${ownerReviewRecommendations.length} owner-review recommendation(s), ${relevantHints.length} relevant hint(s), and ${relevantOwnerActions.length} relevant owner action(s).`
            : "Release compare global context is not declared.",
          lifecycleRegistryPath: lifecycleRegistryDeltaPath ?? stringValue(lifecycleDelta.fromPath),
          lifecycleRegistryVersion: lifecycleRegistryDeltaVersion ?? numberValue(lifecycleDelta.fromVersion),
          activeSnapshotId,
          lastAdoptedChangeId,
          sourceEvolutionPath,
          sourceReviewPath,
          releaseCompareReportPath: latest.reportPath,
          releaseCompareGlobalContextStatus: globalContextStatus,
          releaseCompareOwnerReviewRecommendationCount: ownerReviewRecommendations.length,
          releaseCompareRelevantHintCount: relevantHints.length,
          releaseCompareRelevantOwnerActionCount: relevantOwnerActions.length,
          governedRequirementEvolution: Boolean(sourceEvolutionPath || sourceReviewPath),
        }
      : undefined,
    blockingReasons,
  };
}

function evaluateDoctorGlobalHealthScenario(
  root: string,
  context: ScenarioContext,
): { evidence?: NorthStarScenarioEvidence; blockingReasons: string[] } {
  const sourceEvolution = evaluateConsoleSourceEvolutionScenario(context);
  const compare = evaluateReleaseCompareGlobalContextScenario(root);
  const aggregate = evaluateMultiRepoOwnerActionScenario(root, context);
  const blockers = [
    ...sourceEvolution.blockingReasons,
    ...aggregate.blockingReasons,
    ...compare.blockingReasons,
  ];

  return {
    evidence: {
      summary: blockers.length === 0
        ? "Artifacts consumed by doctor global are healthy enough to express the broader closure loop."
        : "Doctor global prerequisites are still incomplete.",
      lifecycleRegistryPath: sourceEvolution.evidence?.lifecycleRegistryPath,
      lastAdoptedChangeId: sourceEvolution.evidence?.lastAdoptedChangeId,
      sourceEvolutionPath: sourceEvolution.evidence?.sourceEvolutionPath,
      sourceReviewPath: sourceEvolution.evidence?.sourceReviewPath,
      aggregateContractDriftHintCount: aggregate.evidence?.aggregateContractDriftHintCount,
      aggregateOwnerActionCount: aggregate.evidence?.aggregateOwnerActionCount,
      releaseCompareReportPath: compare.evidence?.releaseCompareReportPath,
      releaseCompareGlobalContextStatus: compare.evidence?.releaseCompareGlobalContextStatus,
      doctorGlobalReady: blockers.length === 0,
      doctorGlobalBlockerCount: blockers.length,
      governedRequirementEvolution: Boolean(sourceEvolution.evidence?.governedRequirementEvolution),
    },
    blockingReasons: blockers,
  };
}

function readCurrentSourceEvolutionSummary(
  root: string,
  currentBaseline: Record<string, unknown> | undefined,
  snapshot: ConsoleLocalSnapshot,
): {
  changeId?: string;
  lifecycleRegistryPath?: string;
  lifecycleRegistryVersion?: number;
  activeSnapshotId?: string;
  lastAdoptedChangeId?: string | null;
  sourceEvolutionPath?: string;
  sourceReviewPath?: string;
  currentChangeState?: string;
  openReviewItems?: number;
  blockingOpenReviewItems?: number;
  deferredItems?: number;
  expiredDeferredItems?: number;
  reviewedBlockingItems?: number;
  representativeArtifact?: string;
  sourceReviewCoverage?: NorthStarScenarioEvidence["sourceReviewCoverage"];
  pendingChanges?: NorthStarScenarioEvidence["pendingChanges"];
  reviewItems: Record<string, unknown>[];
} | undefined {
  const baseline = currentBaseline ?? {};
  const sourceSnapshot = isRecord(baseline.source_snapshot) ? baseline.source_snapshot : {};
  const lifecycle = isRecord(baseline.requirement_lifecycle) ? baseline.requirement_lifecycle : {};
  const sourceEvolution = isRecord(baseline.source_evolution) ? baseline.source_evolution : {};
  const sourceReviewPath = stringValue(sourceEvolution.source_review_path);
  const sourceReview = sourceReviewPath ? readOptionalYamlObject(path.join(root, sourceReviewPath)) : undefined;
  const reviewItems = Array.isArray(sourceReview?.items) ? sourceReview.items.filter(isRecord) : [];
  const governance = findGovernanceObject(snapshot, "source_evolution_governance");
  const governanceSummary = governance?.summary ?? {};

  if (!sourceReviewPath && !governance) {
    return undefined;
  }

  return {
    changeId: stringValue(sourceReview?.change_id),
    lifecycleRegistryPath: stringValue(sourceSnapshot.lifecycle_registry_path) ?? stringValue(lifecycle.path) ?? stringValue(governanceSummary.lifecyclePath),
    lifecycleRegistryVersion: numberValue(sourceSnapshot.lifecycle_registry_version) ?? numberValue(lifecycle.registry_version),
    activeSnapshotId: stringValue(sourceSnapshot.active_snapshot_id) ?? stringValue(lifecycle.active_snapshot_id),
    lastAdoptedChangeId: stringValue(sourceSnapshot.last_adopted_change_id)
      ?? stringValue(lifecycle.last_adopted_change_id)
      ?? stringValue(sourceEvolution.last_adopted_change_id)
      ?? nullableString(governanceSummary.lastAdoptedSourceChange)
      ?? null,
    sourceEvolutionPath: stringValue(sourceEvolution.source_evolution_path) ?? stringValue(governanceSummary.sourceEvolutionPath),
    sourceReviewPath,
    currentChangeState: stringValue(governanceSummary.currentChangeState),
    openReviewItems: numberValue(governanceSummary.openReviewItems),
    blockingOpenReviewItems: numberValue(governanceSummary.blockingOpenReviewItems),
    deferredItems: numberValue(governanceSummary.deferredItems),
    expiredDeferredItems: numberValue(governanceSummary.expiredDeferredItems),
    reviewedBlockingItems: numberValue(governanceSummary.reviewedBlockingItems),
    representativeArtifact: stringValue(governanceSummary.activeRepresentativeItem),
    sourceReviewCoverage: isRecord(governanceSummary.sourceReviewCoverage)
      ? {
          totalItems: numberValue(governanceSummary.sourceReviewCoverage.totalItems) ?? 0,
          open: numberValue(governanceSummary.sourceReviewCoverage.open) ?? 0,
          adopted: numberValue(governanceSummary.sourceReviewCoverage.adopted) ?? 0,
          deferred: numberValue(governanceSummary.sourceReviewCoverage.deferred) ?? 0,
          waived: numberValue(governanceSummary.sourceReviewCoverage.waived) ?? 0,
          rejected: numberValue(governanceSummary.sourceReviewCoverage.rejected) ?? 0,
        }
      : undefined,
    pendingChanges: Array.isArray(governanceSummary.pendingChanges)
      ? governanceSummary.pendingChanges.filter(isRecord).map((entry) => ({
          changeId: stringValue(entry.changeId) ?? "unknown",
          openReviewItems: numberValue(entry.openReviewItems) ?? 0,
          blockingOpenReviewItems: numberValue(entry.blockingOpenReviewItems) ?? 0,
          sourceEvolutionPath: stringValue(entry.sourceEvolutionPath),
          sourceReviewPath: stringValue(entry.sourceReviewPath),
        }))
      : undefined,
    reviewItems,
  };
}

function readLatestReleaseCompare(root: string): { reportPath: string; report: Record<string, unknown> } | undefined {
  const trend = readJsonObject(path.join(root, ".spec", "releases", "drift-trend.json"));
  const latest = isRecord(trend?.latest) ? trend.latest : undefined;
  const reportPath = stringValue(latest?.reportPath);
  if (reportPath) {
    const report = readJsonObject(path.join(root, reportPath));
    if (report) {
      return { reportPath, report };
    }
  }

  const reports = resolveArtifactMatches(root, ".spec/releases/compare/*/compare-report.json");
  const fallback = reports.at(-1);
  if (!fallback) {
    return undefined;
  }
  const report = readJsonObject(path.join(root, fallback));
  return report ? { reportPath: fallback, report } : undefined;
}

function findGovernanceObject(
  snapshot: ConsoleLocalSnapshot,
  id: string,
): ConsoleGovernanceObjectSnapshot | undefined {
  return snapshot.governance.objects.find((object) => object.id === id);
}

function resolveArtifactMatches(root: string, artifactPath: string): string[] {
  if (!artifactPath.includes("*")) {
    return fs.existsSync(path.join(root, artifactPath)) ? [artifactPath] : [];
  }

  const normalizedPattern = artifactPath.replace(/\\/g, "/");
  const wildcardIndex = normalizedPattern.indexOf("*");
  const basePrefix = normalizedPattern.slice(0, wildcardIndex);
  const searchRoot = path.join(root, basePrefix.slice(0, basePrefix.lastIndexOf("/")));
  if (!fs.existsSync(searchRoot)) {
    return [];
  }

  const pattern = new RegExp(`^${escapeRegExp(normalizedPattern).replace(/\\\*/g, "[^/]+")}$`);
  return listFiles(searchRoot)
    .map((candidate) => path.relative(root, candidate).replace(/\\/g, "/"))
    .filter((candidate) => pattern.test(candidate))
    .sort((left, right) => left.localeCompare(right));
}

function resolveOutPath(root: string, outPath: string | undefined): string {
  const candidate = outPath ?? DEFAULT_ACCEPTANCE_PATH;
  return path.isAbsolute(candidate) ? candidate : path.join(root, candidate);
}

function normalizePath(candidate: string): string {
  return candidate.replace(/\\/g, "/");
}

function listFiles(root: string): string[] {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readYamlObject(filePath: string): Record<string, unknown> {
  const parsed = yaml.load(fs.readFileSync(filePath, "utf-8"));
  return isRecord(parsed) ? parsed : {};
}

function readOptionalYamlObject(filePath: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  return readYamlObject(filePath);
}

function readJsonObject(filePath: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function nullableString(value: unknown): string | null | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (value === null) {
    return null;
  }
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
