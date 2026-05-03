import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import type {
  GreenfieldEvidenceGraph,
  GreenfieldEvidenceNode,
} from "../greenfield/evidence-graph";
import {
  collectStaticImplementationFacts,
  hasStaticFactMapping,
  isGovernedStaticFact,
  isGovernedStaticPath,
  type StaticImplementationFact,
} from "../greenfield/static-collector";
import type { VerifyIssue, VerifyIssueSeverity } from "./verdict";

type RatchetClassificationState = "ignored" | "experimental" | "intentional";

interface RatchetClassification {
  fact_id?: string;
  state?: RatchetClassificationState;
  reason?: string;
  expires_at?: string;
}

interface RatchetClassificationFile {
  classifications?: RatchetClassification[];
}

const EVIDENCE_GRAPH_PATH = ".spec/evidence/evidence-graph.json";
const CLASSIFICATIONS_PATH = ".spec/evidence/ratchet-classifications.yaml";

export function collectGreenfieldRatchetIssues(rootInput: string): VerifyIssue[] {
  const root = path.resolve(rootInput);
  const graph = loadGreenfieldEvidenceGraph(root);
  if (!graph) {
    return [];
  }

  const classifications = loadRatchetClassifications(root);
  const issues = [
    ...collectSpecDriftIssues(root, graph),
    ...collectCodeDriftIssues(root, graph, classifications),
  ];

  return issues.sort((left, right) =>
    `${left.severity}|${left.code}|${left.path ?? ""}|${left.message}`.localeCompare(
      `${right.severity}|${right.code}|${right.path ?? ""}|${right.message}`,
    ),
  );
}

export function readGreenfieldRatchetCounts(rootInput: string): {
  codeDriftCount: number;
  specDriftCount: number;
  classifiedDriftCount: number;
} {
  const issues = collectGreenfieldRatchetIssues(rootInput);

  return {
    codeDriftCount: issues.filter((issue) => issue.code === "GREENFIELD_CODE_DRIFT").length,
    specDriftCount: issues.filter((issue) => issue.code.startsWith("GREENFIELD_SPEC_DRIFT")).length,
    classifiedDriftCount: issues.filter((issue) => issue.code === "GREENFIELD_CLASSIFIED_CODE_DRIFT").length,
  };
}

function collectSpecDriftIssues(root: string, graph: GreenfieldEvidenceGraph): VerifyIssue[] {
  const issues: VerifyIssue[] = [];
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  for (const node of graph.nodes) {
    if (!node.path || node.type === "source_document" || node.type === "implementation_fact") {
      continue;
    }
    if (fs.existsSync(path.join(root, node.path))) {
      continue;
    }

    issues.push({
      kind: "semantic",
      severity: "advisory",
      code: "GREENFIELD_SPEC_DRIFT_ASSET_MISSING",
      path: node.path,
      message: `Evidence Graph expects ${node.type} \`${node.label}\`, but the referenced asset is missing.`,
      details: {
        node_id: node.id,
        node_type: node.type,
      },
    });
  }

  for (const scenario of graph.nodes.filter((node) => node.type === "scenario")) {
    const covered = graph.edges.some((edge) => edge.from === scenario.id && edge.relation === "covered_by" && nodesById.get(edge.to)?.type === "test");
    if (!covered) {
      issues.push({
        kind: "semantic",
        severity: "advisory",
        code: "GREENFIELD_SPEC_DRIFT_SCENARIO_UNTESTED",
        path: scenario.path,
        message: `Scenario \`${scenario.label}\` has no test coverage edge in the Evidence Graph.`,
        details: {
          node_id: scenario.id,
          requirement_ids: scenario.requirementIds ?? [],
        },
      });
    }
  }

  for (const slice of graph.nodes.filter((node) => node.type === "slice")) {
    if (!slice.path || !sliceRequiresImplementationEvidence(root, slice)) {
      continue;
    }
    const hasImplementationFact = graph.edges.some((edge) =>
      edge.from === slice.id &&
      edge.relation === "absorbs" &&
      nodesById.get(edge.to)?.type === "implementation_fact",
    );
    if (!hasImplementationFact) {
      issues.push({
        kind: "semantic",
        severity: "advisory",
        code: "GREENFIELD_SPEC_DRIFT_IMPLEMENTATION_MISSING",
        path: slice.path,
        message: `Slice \`${slice.label}\` has entered implementation scope but has no implementation fact in the Evidence Graph.`,
        details: {
          node_id: slice.id,
          requirement_ids: slice.requirementIds ?? [],
        },
      });
    }
  }

  return issues;
}

function collectCodeDriftIssues(
  root: string,
  graph: GreenfieldEvidenceGraph,
  classifications: Map<string, RatchetClassification>,
): VerifyIssue[] {
  const graphImplementationFactIds = new Set([
    ...graph.implementationFacts.map((fact) => normalizeImplementationFactId(fact.id)),
    ...graph.nodes
      .filter((node) => node.type === "implementation_fact")
      .map((node) => normalizeImplementationFactId(node.id.replace(/^implementation:/, ""))),
  ]);
  const issues: VerifyIssue[] = [];
  const manifest = collectStaticImplementationFacts(root);

  for (const surface of manifest.unresolved_surfaces) {
    if (!isGovernedStaticPath(surface.path) || surface.metadata?.advisory_only === true) {
      continue;
    }
    issues.push({
      kind: "semantic",
      severity: "advisory",
      code: "GREENFIELD_UNRESOLVED_SURFACE",
      path: surface.path,
      message: `${surface.label} could not be resolved deterministically and was not mapped into the Contract Graph.`,
      details: {
        fact_id: surface.id,
        fact_kind: surface.kind,
        confidence: surface.confidence,
        metadata: surface.metadata,
      },
    });
  }

  for (const fact of manifest.facts) {
    if (!isGovernedStaticFact(fact)) {
      continue;
    }
    if (hasStaticFactMapping(fact)) {
      continue;
    }

    const normalizedFactId = normalizeImplementationFactId(fact.id);
    if (graphImplementationFactIds.has(normalizedFactId)) {
      continue;
    }

    const classification = classifications.get(normalizedFactId);
    if (classification) {
      issues.push(createClassifiedCodeDriftIssue(fact, classification));
      continue;
    }

    issues.push({
      kind: "semantic",
      severity: "advisory",
      code: "GREENFIELD_CODE_DRIFT",
      path: fact.path,
      message: `${fact.label} exists in code but is not mapped to a contract, scenario, slice, or implementation fact in the Evidence Graph.`,
      details: {
        fact_id: fact.id,
        fact_kind: fact.kind,
        confidence: fact.confidence,
        classification_hint: CLASSIFICATIONS_PATH,
      },
    });
  }

  return issues;
}

function createClassifiedCodeDriftIssue(
  fact: StaticImplementationFact,
  classification: RatchetClassification,
): VerifyIssue {
  const state = classification.state ?? "intentional";
  const severity: VerifyIssueSeverity = state === "intentional" ? "advisory" : "advisory";

  return {
    kind: "semantic",
    severity,
    code: "GREENFIELD_CLASSIFIED_CODE_DRIFT",
    path: fact.path,
    message: `${fact.label} is outside the Evidence Graph but classified as ${state}.`,
    details: {
      fact_id: fact.id,
      fact_kind: fact.kind,
      confidence: fact.confidence,
      classification: state,
      reason: classification.reason,
      expires_at: classification.expires_at,
    },
  };
}

function sliceRequiresImplementationEvidence(root: string, slice: GreenfieldEvidenceNode): boolean {
  const resolvedPath = path.join(root, slice.path ?? "");
  if (!fs.existsSync(resolvedPath)) {
    return false;
  }

  try {
    const data = yaml.load(fs.readFileSync(resolvedPath, "utf-8"));
    if (!isRecord(data)) {
      return false;
    }
    const lifecycle = isRecord(data.lifecycle) ? data.lifecycle : {};
    const state = typeof lifecycle.state === "string" ? lifecycle.state : undefined;
    const gates = isRecord(data.gates) ? data.gates : {};
    return (
      state === "implementing" ||
      state === "verifying" ||
      state === "accepted" ||
      state === "released" ||
      gates.implementation_ready === true ||
      gates.verification_ready === true ||
      gates.accepted === true
    );
  } catch {
    return false;
  }
}

function loadGreenfieldEvidenceGraph(root: string): GreenfieldEvidenceGraph | undefined {
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

function loadRatchetClassifications(root: string): Map<string, RatchetClassification> {
  const classificationsPath = path.join(root, CLASSIFICATIONS_PATH);
  const classifications = new Map<string, RatchetClassification>();
  if (!fs.existsSync(classificationsPath)) {
    return classifications;
  }

  try {
    const data = yaml.load(fs.readFileSync(classificationsPath, "utf-8")) as RatchetClassificationFile;
    for (const classification of data.classifications ?? []) {
      if (!classification.fact_id || !classification.state) {
        continue;
      }
      classifications.set(normalizeImplementationFactId(classification.fact_id), classification);
    }
  } catch {
    return classifications;
  }

  return classifications;
}

function normalizeImplementationFactId(factId: string): string {
  return factId.replace(/^implementation:/, "").replace(/\s+/g, " ").trim();
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
