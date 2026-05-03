import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import {
  HUMAN_SUMMARY_COMPANION_NOTE,
  renderHumanDecisionSnapshot,
  renderHumanDecisionSnapshotText,
} from "../human-decision-packet";

export type NorthStarScenarioId =
  | "legacy_takeover"
  | "greenfield"
  | "daily_change"
  | "external_patch_mediation"
  | "policy_waiver"
  | "release_drift"
  | "console_governance"
  | "multi_repo_aggregation"
  | "privacy_report";

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
    ownerAction: string;
    nextCommand: string;
  }>;
  requiredExternalGates: Array<{
    id: "post_release_gate" | "doctor_v1" | "doctor_runtime" | "doctor_pilot";
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
];

export function buildNorthStarAcceptance(options: NorthStarAcceptanceOptions): NorthStarAcceptance {
  const root = path.resolve(options.root);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const scenarios = SCENARIOS.map((definition) => buildScenario(root, definition));
  const blockers = scenarios
    .filter((scenario) => scenario.status === "blocking")
    .map((scenario) => ({
      scenarioId: scenario.id,
      title: scenario.title,
      task: scenario.task ? { ...scenario.task } : undefined,
      missingArtifacts: scenario.missingArtifacts,
      requiredArtifacts: scenario.requiredArtifacts,
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
      { id: "doctor_v1", command: "npm run jispec-cli -- doctor v1", authority: "blocking_gate" },
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
    "- This suite does not replace verify, doctor v1, doctor runtime, doctor pilot, or post-release gate.",
    "",
  ];

  return lines.join("\n");
}

function buildScenario(root: string, definition: ScenarioDefinition): NorthStarScenario {
  const presentArtifacts = definition.requiredArtifacts.flatMap((artifactPath) => resolveArtifactMatches(root, artifactPath));
  const missingArtifacts = definition.requiredArtifacts.filter((artifactPath) => resolveArtifactMatches(root, artifactPath).length === 0);
  const evidence = definition.id === "release_drift" ? buildReleaseDriftScenarioEvidence(root) : undefined;
  return {
    id: definition.id,
    title: definition.title,
    status: missingArtifacts.length === 0 ? "passed" : "blocking",
    task: definition.task ? { ...definition.task } : undefined,
    requiredArtifacts: [...definition.requiredArtifacts],
    presentArtifacts,
    missingArtifacts,
    machineArtifactPath: `.spec/north-star/scenarios/${definition.id}.json`,
    humanDecisionPacketPath: `.spec/north-star/scenarios/${definition.id}-decision.md`,
    ownerAction: definition.ownerAction,
    nextCommand: definition.nextCommand,
    proofClaims: [...definition.proofClaims],
    evidence,
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
      risk: scenario.status === "passed" ? "No blocking acceptance gap detected for this scenario." : `Missing artifacts: ${scenario.missingArtifacts.join(", ")}`,
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
    ...(scenario.evidence ? [
      "",
      "## Lifecycle Migration Evidence",
      "",
      `- ${scenario.evidence.summary}`,
      `- Lifecycle registry: ${scenario.evidence.lifecycleRegistryPath ?? "not recorded"}${scenario.evidence.lifecycleRegistryVersion !== undefined ? ` (v${scenario.evidence.lifecycleRegistryVersion})` : ""}`,
      `- Active source snapshot: ${scenario.evidence.activeSnapshotId ?? "not recorded"}`,
      `- Last adopted source change: ${scenario.evidence.lastAdoptedChangeId ?? "none"}`,
      `- Source evolution artifact: ${scenario.evidence.sourceEvolutionPath ?? "not recorded"}`,
      `- Source review artifact: ${scenario.evidence.sourceReviewPath ?? "not recorded"}`,
    ] : []),
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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
