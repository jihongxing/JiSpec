import fs from "node:fs";
import path from "node:path";
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
  requiredArtifacts: string[];
  presentArtifacts: string[];
  missingArtifacts: string[];
  machineArtifactPath: string;
  humanDecisionPacketPath: string;
  ownerAction: string;
  nextCommand: string;
  proofClaims: NorthStarProofClaim[];
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
  requiredArtifacts: string[];
  ownerAction: string;
  nextCommand: string;
  proofClaims: NorthStarProofClaim[];
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
    requiredArtifacts: [".spec/greenfield/initialization-summary.md", ".jispec-ci/verify-report.json"],
    ownerAction: "Initialize the Greenfield baseline and run deterministic verify.",
    nextCommand: "npm run jispec -- init --requirements <path> --json",
    proofClaims: ["verifiable", "blockable", "localFirst"],
  },
  {
    id: "daily_change",
    title: "Daily change",
    requiredArtifacts: [".jispec/change-session.json", ".jispec-ci/verify-report.json"],
    ownerAction: "Record a daily change plan and refresh the verify report.",
    nextCommand: "npm run jispec -- change \"<summary>\" --mode execute --json",
    proofClaims: ["verifiable", "blockable", "replayable"],
  },
  {
    id: "external_patch_mediation",
    title: "External patch mediation",
    requiredArtifacts: [".jispec/implement/*/patch-mediation.json"],
    ownerAction: "Mediate the external patch through the local implement lane before accepting it.",
    nextCommand: "npm run jispec -- implement --external-patch <path> --json",
    proofClaims: ["blockable", "externalToolsControlled", "localFirst"],
  },
  {
    id: "policy_waiver",
    title: "Policy waiver",
    requiredArtifacts: [".spec/waivers/*.json", ".spec/audit/events.jsonl"],
    ownerAction: "Refresh policy waiver posture and record the approval or expiry decision.",
    nextCommand: "npm run jispec -- policy approval status --json",
    proofClaims: ["auditable", "blockable"],
  },
  {
    id: "release_drift",
    title: "Release drift",
    requiredArtifacts: [".spec/releases/drift-trend.json"],
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
    requiredArtifacts: [".spec/console/multi-repo-governance.json"],
    ownerAction: "Aggregate exported governance snapshots without scanning source repositories.",
    nextCommand: "npm run jispec -- console aggregate-governance --dir <path> --json",
    proofClaims: ["auditable", "localFirst", "externalToolsControlled"],
  },
  {
    id: "privacy_report",
    title: "Privacy report",
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
      `  - Machine artifact: ${scenario.machineArtifactPath}`,
      `  - Human decision packet: ${scenario.humanDecisionPacketPath}`,
      `  - Next command: ${scenario.nextCommand}`,
    ]),
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
  return {
    id: definition.id,
    title: definition.title,
    status: missingArtifacts.length === 0 ? "passed" : "blocking",
    requiredArtifacts: [...definition.requiredArtifacts],
    presentArtifacts,
    missingArtifacts,
    machineArtifactPath: `.spec/north-star/scenarios/${definition.id}.json`,
    humanDecisionPacketPath: `.spec/north-star/scenarios/${definition.id}-decision.md`,
    ownerAction: definition.ownerAction,
    nextCommand: definition.nextCommand,
    proofClaims: [...definition.proofClaims],
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
    "## Machine Artifact",
    "",
    `- ${scenario.machineArtifactPath}`,
    "",
    "## Required Artifacts",
    "",
    ...scenario.requiredArtifacts.map((artifactPath) => `- ${artifactPath}`),
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
