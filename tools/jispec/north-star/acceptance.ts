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
  | "doctor_global_health";

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
  releaseCompareReportPath?: string;
  releaseCompareGlobalContextStatus?: string;
  releaseCompareOwnerReviewRecommendationCount?: number;
  releaseCompareRelevantHintCount?: number;
  releaseCompareRelevantOwnerActionCount?: number;
  doctorGlobalReady?: boolean;
  doctorGlobalBlockerCount?: number;
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
    sourcePlan: "docs/north-star-next-development-plan.md#M7-T5";
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
      sourcePlan: "docs/north-star-next-development-plan.md#M7-T5",
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
    default:
      return { blockingReasons: [] };
  }
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
  if ((summary.expiredDeferredItems ?? 0) > 0) {
    blockingReasons.push(`There are still ${summary.expiredDeferredItems} expired deferred source review item(s).`);
  }
  if ((summary.deferredItems ?? 0) > 0 && repaidItems.length === 0) {
    blockingReasons.push("Deferred source review debt still exists without repayment evidence.");
  }

  return {
    evidence: {
      summary: repaidItems.length > 0
        ? `${repaidItems.length} source review item(s) show deferred debt that was later repaid and adopted.`
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
  const blockingReasons: string[] = [];
  if (!sourceEvolution || sourceEvolution.status !== "available") {
    blockingReasons.push("Console source_evolution_governance object is not available.");
  }

  return {
    evidence: sourceEvolution
      ? {
          summary: sourceEvolution.status === "available"
            ? `Console exposes source evolution governance with state ${stringValue(summary.currentChangeState) ?? "not_available_yet"}.`
            : "Console source evolution governance object is not available yet.",
          lifecycleRegistryPath: stringValue(summary.lifecyclePath),
          activeSnapshotId: stringValue(summary.activeSnapshotId),
          lastAdoptedChangeId: nullableString(summary.lastAdoptedSourceChange),
          sourceEvolutionPath: stringValue(summary.sourceEvolutionPath),
          sourceReviewPath: stringValue(summary.sourceReviewPath),
          currentChangeState: stringValue(summary.currentChangeState),
          openReviewItems: numberValue(summary.openReviewItems),
          blockingOpenReviewItems: numberValue(summary.blockingOpenReviewItems),
          deferredItems: numberValue(summary.deferredItems),
          expiredDeferredItems: numberValue(summary.expiredDeferredItems),
          reviewedBlockingItems: numberValue(summary.reviewedBlockingItems),
          sourceEvolutionRepresentativeArtifact: stringValue(summary.activeRepresentativeItem),
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
  const ownerActions = Array.isArray(aggregate?.ownerActions) ? aggregate.ownerActions : [];
  const contractDriftHints = Array.isArray(aggregate?.contractDriftHints) ? aggregate.contractDriftHints : [];
  const blockingReasons: string[] = [];
  if (!aggregate || aggregate.kind !== "jispec-multi-repo-governance-aggregate") {
    blockingReasons.push("Multi-repo governance aggregate is missing or invalid.");
  }
  if (ownerActions.length === 0) {
    blockingReasons.push("Aggregate does not expose any multi-repo owner action.");
  }
  if (contractDriftHints.length === 0) {
    blockingReasons.push("Aggregate does not expose any cross-repo contract drift hint.");
  }

  const sourceEvolution = findGovernanceObject(context.snapshot, "source_evolution_governance");
  return {
    evidence: {
      summary: ownerActions.length > 0
        ? `Aggregate exposes ${ownerActions.length} owner action(s) and ${contractDriftHints.length} cross-repo drift hint(s).`
        : "Aggregate exists but does not yet expose owner-action loop output.",
      lifecycleRegistryPath: stringValue(sourceEvolution?.summary.lifecyclePath),
      sourceEvolutionPath: stringValue(sourceEvolution?.summary.sourceEvolutionPath),
      sourceReviewPath: stringValue(sourceEvolution?.summary.sourceReviewPath),
      aggregateContractDriftHintCount: numberValue(summary.contractDriftHintCount) ?? contractDriftHints.length,
      aggregateOwnerActionCount: numberValue(summary.ownerActionCount) ?? ownerActions.length,
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
  if (!latest) {
    blockingReasons.push("No release compare report could be resolved from .spec/releases/drift-trend.json.");
  }
  if (globalContext.kind !== "release_compare_global_context") {
    blockingReasons.push("Latest release compare report does not expose the P13 globalContext contract.");
  }
  if (stringValue(globalContext.status) !== "available") {
    blockingReasons.push(`Latest release compare global context status is ${stringValue(globalContext.status) ?? "not_declared"}.`);
  }
  if (!stringValue(sourceEvolutionArtifacts.toSourceEvolutionPath) && !stringValue(details.aggregatePath)) {
    blockingReasons.push("Latest release compare report does not link source evolution or aggregate context artifacts.");
  }
  if (
    stringValue(globalContext.status) === "available" &&
    stringValue(sourceEvolutionArtifacts.toSourceEvolutionPath) &&
    !Boolean(lifecycleDelta.changed)
  ) {
    blockingReasons.push("Latest release compare report does not describe a lifecycle registry delta for the compared release.");
  }

  return {
    evidence: latest
      ? {
          summary: stringValue(globalContext.summary) ?? "Release compare global context is not declared.",
          lifecycleRegistryPath: stringValue(lifecycleDelta.toPath) ?? stringValue(lifecycleDelta.fromPath),
          lifecycleRegistryVersion: numberValue(lifecycleDelta.toVersion) ?? numberValue(lifecycleDelta.fromVersion),
          activeSnapshotId: stringValue(sourceEvolutionArtifacts.toActiveSnapshotId),
          lastAdoptedChangeId: nullableString(sourceEvolutionArtifacts.toLastAdoptedChangeId),
          sourceEvolutionPath: stringValue(sourceEvolutionArtifacts.toSourceEvolutionPath),
          sourceReviewPath: stringValue(sourceEvolutionArtifacts.toSourceReviewPath),
          releaseCompareReportPath: latest.reportPath,
          releaseCompareGlobalContextStatus: stringValue(globalContext.status),
          releaseCompareOwnerReviewRecommendationCount: ownerReviewRecommendations.length,
          releaseCompareRelevantHintCount: relevantHints.length,
          releaseCompareRelevantOwnerActionCount: relevantOwnerActions.length,
          governedRequirementEvolution: Boolean(stringValue(sourceEvolutionArtifacts.toSourceEvolutionPath) || stringValue(sourceEvolutionArtifacts.toSourceReviewPath)),
        }
      : undefined,
    blockingReasons,
  };
}

function evaluateDoctorGlobalHealthScenario(
  root: string,
  context: ScenarioContext,
): { evidence?: NorthStarScenarioEvidence; blockingReasons: string[] } {
  const sourceEvolution = findGovernanceObject(context.snapshot, "source_evolution_governance");
  const compare = evaluateReleaseCompareGlobalContextScenario(root);
  const aggregate = evaluateMultiRepoOwnerActionScenario(root, context);
  const blockers = [
    ...(sourceEvolution && sourceEvolution.status === "available" ? [] : ["Console source evolution governance is not available."]),
    ...aggregate.blockingReasons,
    ...compare.blockingReasons,
  ];

  return {
    evidence: {
      summary: blockers.length === 0
        ? "Artifacts consumed by doctor global are healthy enough to express the broader closure loop."
        : "Doctor global prerequisites are still incomplete.",
      lifecycleRegistryPath: stringValue(sourceEvolution?.summary.lifecyclePath),
      lastAdoptedChangeId: nullableString(sourceEvolution?.summary.lastAdoptedSourceChange),
      sourceEvolutionPath: stringValue(sourceEvolution?.summary.sourceEvolutionPath),
      sourceReviewPath: stringValue(sourceEvolution?.summary.sourceReviewPath),
      aggregateContractDriftHintCount: aggregate.evidence?.aggregateContractDriftHintCount,
      aggregateOwnerActionCount: aggregate.evidence?.aggregateOwnerActionCount,
      releaseCompareReportPath: compare.evidence?.releaseCompareReportPath,
      releaseCompareGlobalContextStatus: compare.evidence?.releaseCompareGlobalContextStatus,
      doctorGlobalReady: blockers.length === 0,
      doctorGlobalBlockerCount: blockers.length,
      governedRequirementEvolution: Boolean(sourceEvolution && sourceEvolution.status === "available"),
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
