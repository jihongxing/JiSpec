import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import {
  findGreenfieldEvidenceImpact,
  type GreenfieldEvidenceEdge,
  type GreenfieldEvidenceGraph,
  type GreenfieldEvidenceNode,
} from "../greenfield/evidence-graph";

export interface BlastRadiusSeedInput {
  summary: string;
  contextId?: string;
  sliceId?: string;
}

export interface BlastRadiusReferences {
  requirement_ids: string[];
  contexts: string[];
  contracts: string[];
  scenarios: string[];
  slices: string[];
  tests: string[];
}

export interface BlastRadiusAnalysis {
  available: boolean;
  seedIds: string[];
  affectedNodes: GreenfieldEvidenceNode[];
  affectedEdges: GreenfieldEvidenceEdge[];
  affectedAssetPaths: string[];
  references: BlastRadiusReferences;
  verificationFocus: BlastRadiusReferences & {
    asset_paths: string[];
  };
  warnings: string[];
}

const EVIDENCE_GRAPH_PATH = ".spec/evidence/evidence-graph.json";

export function analyzeGreenfieldBlastRadius(rootInput: string, input: BlastRadiusSeedInput): BlastRadiusAnalysis {
  const root = path.resolve(rootInput);
  const graph = loadEvidenceGraph(root);
  const seedIds = inferBlastRadiusSeeds(input);

  if (!graph) {
    return {
      available: false,
      seedIds,
      affectedNodes: [],
      affectedEdges: [],
      affectedAssetPaths: [],
      references: emptyReferences(),
      verificationFocus: {
        ...emptyReferences(),
        asset_paths: [],
      },
      warnings: [`Greenfield Evidence Graph is missing or unreadable at ${EVIDENCE_GRAPH_PATH}.`],
    };
  }

  const impact = findGreenfieldEvidenceImpact(graph, seedIds);
  const references = referencesFromNodes(impact.affectedNodes);

  return {
    available: true,
    seedIds: impact.seedIds,
    affectedNodes: impact.affectedNodes,
    affectedEdges: impact.affectedEdges,
    affectedAssetPaths: impact.affectedAssetPaths,
    references,
    verificationFocus: {
      ...references,
      asset_paths: impact.affectedAssetPaths,
    },
    warnings: impact.warnings,
  };
}

export function renderBlastRadiusReport(changeId: string, summary: string, analysis: BlastRadiusAnalysis): string {
  return [
    `# Blast Radius Report: ${changeId}`,
    "",
    `Summary: ${summary}`,
    `Evidence graph: ${analysis.available ? "available" : "missing"}`,
    "",
    "## Seeds",
    "",
    ...(analysis.seedIds.length > 0 ? analysis.seedIds.map((seedId) => `- \`${seedId}\``) : ["- None recorded."]),
    "",
    "## Affected References",
    "",
    ...renderReferenceList("Requirements", analysis.references.requirement_ids),
    ...renderReferenceList("Contexts", analysis.references.contexts),
    ...renderReferenceList("Contracts", analysis.references.contracts),
    ...renderReferenceList("Scenarios", analysis.references.scenarios),
    ...renderReferenceList("Slices", analysis.references.slices),
    ...renderReferenceList("Tests", analysis.references.tests),
    "",
    "## Affected Assets",
    "",
    ...(analysis.affectedAssetPaths.length > 0
      ? analysis.affectedAssetPaths.map((assetPath) => `- \`${assetPath}\``)
      : ["- None recorded."]),
    "",
    "## Verification Focus",
    "",
    "- Affected contracts, scenarios, slices, tests, and assets should be included in this change's verify scope.",
    "- Existing contracts and scenarios reached through the graph are treated as regression acceptance for the change.",
    "- See `verify-focus.yaml` for the machine-readable focus set.",
    "",
    "## Warnings",
    "",
    ...(analysis.warnings.length > 0 ? analysis.warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
  ].join("\n");
}

export function buildBlastRadiusGraphPayload(changeId: string, analysis: BlastRadiusAnalysis): Record<string, unknown> {
  return {
    change_id: changeId,
    evidence_graph_available: analysis.available,
    seeds: analysis.seedIds,
    affected_nodes: analysis.affectedNodes,
    affected_edges: analysis.affectedEdges,
    affected_asset_paths: analysis.affectedAssetPaths,
    references: analysis.references,
    verification_focus: analysis.verificationFocus,
    warnings: analysis.warnings,
  };
}

export function renderVerifyFocusYaml(changeId: string, analysis: BlastRadiusAnalysis): string {
  return yaml.dump({
    change_id: changeId,
    source: "greenfield-evidence-graph",
    verification_focus: analysis.verificationFocus,
    warnings: analysis.warnings,
  }, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
}

function inferBlastRadiusSeeds(input: BlastRadiusSeedInput): string[] {
  return uniquePreserveOrder([
    ...extractRequirementIds(input.summary),
    ...extractContractIds(input.summary),
    ...extractScenarioIds(input.summary),
    ...extractTestIds(input.summary),
    ...(input.contextId ? [`context:${input.contextId}`] : []),
    ...(input.sliceId ? [`slice:${input.sliceId}`] : []),
  ]);
}

function referencesFromNodes(nodes: GreenfieldEvidenceNode[]): BlastRadiusReferences {
  const references = emptyReferences();

  for (const node of nodes) {
    references.requirement_ids.push(...(node.requirementIds ?? []));
    if (node.type === "requirement") {
      references.requirement_ids.push(...(node.requirementIds ?? [node.label]));
    } else if (node.type === "context" && node.contextId) {
      references.contexts.push(node.contextId);
    } else if (node.type === "contract") {
      references.contracts.push(stripPrefix(node.id, "contract:"));
    } else if (node.type === "scenario") {
      references.scenarios.push(stripPrefix(node.id, "scenario:"));
    } else if (node.type === "slice") {
      references.slices.push(stripPrefix(node.id, "slice:"));
    } else if (node.type === "test") {
      references.tests.push(stripPrefix(node.id, "test:"));
    }

    if (node.contextId) {
      references.contexts.push(node.contextId);
    }
  }

  return {
    requirement_ids: unique(references.requirement_ids),
    contexts: unique(references.contexts),
    contracts: unique(references.contracts),
    scenarios: unique(references.scenarios),
    slices: unique(references.slices),
    tests: unique(references.tests),
  };
}

function loadEvidenceGraph(root: string): GreenfieldEvidenceGraph | undefined {
  const graphPath = path.join(root, EVIDENCE_GRAPH_PATH);
  if (!fs.existsSync(graphPath)) {
    return undefined;
  }

  try {
    return JSON.parse(fs.readFileSync(graphPath, "utf-8")) as GreenfieldEvidenceGraph;
  } catch {
    return undefined;
  }
}

function renderReferenceList(label: string, values: string[]): string[] {
  return [
    `### ${label}`,
    "",
    ...(values.length > 0 ? values.map((value) => `- \`${value}\``) : ["- None recorded."]),
    "",
  ];
}

function emptyReferences(): BlastRadiusReferences {
  return {
    requirement_ids: [],
    contexts: [],
    contracts: [],
    scenarios: [],
    slices: [],
    tests: [],
  };
}

function extractRequirementIds(value: string): string[] {
  return value.match(/\bREQ-[A-Z0-9-]+-\d+\b/g) ?? [];
}

function extractContractIds(value: string): string[] {
  return value.match(/\bCTR-[A-Z0-9-]+-\d+\b/g) ?? [];
}

function extractScenarioIds(value: string): string[] {
  return value.match(/\bSCN-[A-Z0-9-]+\b/g) ?? [];
}

function extractTestIds(value: string): string[] {
  return value.match(/\bTEST-[A-Z0-9-]+\b/g) ?? [];
}

function stripPrefix(value: string, prefix: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function uniquePreserveOrder(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
