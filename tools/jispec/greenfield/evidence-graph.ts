import type { GreenfieldApiContractDraft, GreenfieldContractDraft } from "./api-contract-draft";
import type { GreenfieldBehaviorDraft, GreenfieldScenarioDraft } from "./behavior-draft";
import type { GreenfieldDomainDraft } from "./domain-draft";
import type { GreenfieldSliceDraft, GreenfieldSliceQueueDraft } from "./slice-queue";
import type { GreenfieldInputContract } from "./source-documents";
import {
  inferEvidenceProvenanceDescriptor,
  type EvidenceOwnerReviewPosture,
  type EvidenceProvenanceLabel,
} from "../provenance/evidence-provenance";

export type GreenfieldEvidenceNodeType =
  | "source_document"
  | "requirement"
  | "context"
  | "domain_artifact"
  | "contract"
  | "scenario"
  | "slice"
  | "test"
  | "implementation_fact";

export type GreenfieldEvidenceEdgeRelation =
  | "defines"
  | "owns"
  | "maps_to"
  | "references"
  | "implemented_by"
  | "verified_by"
  | "covered_by"
  | "depends_on"
  | "absorbs";

export type GreenfieldImplementationFactKind =
  | "route"
  | "schema"
  | "test"
  | "migration"
  | "type_definition";

export interface GreenfieldEvidenceNode {
  id: string;
  type: GreenfieldEvidenceNodeType;
  label: string;
  path?: string;
  contextId?: string;
  requirementIds?: string[];
  sourceConfidence?: "requirements" | "technical_solution" | "inferred";
  implementationKind?: GreenfieldImplementationFactKind;
  provenanceLabel?: EvidenceProvenanceLabel;
  evidenceKind?: string;
  sourcePath?: string;
  confidence?: number | null;
  ownerReviewPosture?: EvidenceOwnerReviewPosture;
  data?: Record<string, unknown>;
}

export interface GreenfieldEvidenceEdge {
  from: string;
  to: string;
  relation: GreenfieldEvidenceEdgeRelation;
  reason?: string;
}

export interface GreenfieldImplementationFact {
  id: string;
  kind: GreenfieldImplementationFactKind;
  label: string;
  path: string;
  contextId?: string;
  requirementIds?: string[];
  contractIds?: string[];
  scenarioIds?: string[];
  testIds?: string[];
  sliceIds?: string[];
  provenanceLabel?: EvidenceProvenanceLabel;
  evidenceKind?: string;
  sourcePath?: string;
  confidence?: number | null;
  ownerReviewPosture?: EvidenceOwnerReviewPosture;
}

export interface GreenfieldEvidenceGraph {
  schemaVersion: 1;
  generatedAt: string;
  graphKind: "greenfield-initialization";
  nodes: GreenfieldEvidenceNode[];
  edges: GreenfieldEvidenceEdge[];
  implementationFacts: GreenfieldImplementationFact[];
  summary: {
    nodeCounts: Record<GreenfieldEvidenceNodeType, number>;
    edgeCounts: Record<GreenfieldEvidenceEdgeRelation, number>;
    requirementCoverage: {
      total: number;
      withScenario: number;
      withContract: number;
      withSlice: number;
      withTest: number;
      uncovered: string[];
    };
  };
  warnings: string[];
}

export interface GreenfieldEvidenceImpact {
  seedIds: string[];
  affectedNodes: GreenfieldEvidenceNode[];
  affectedEdges: GreenfieldEvidenceEdge[];
  affectedAssetPaths: string[];
  warnings: string[];
}

export interface GreenfieldEvidenceGraphInput {
  inputContract: GreenfieldInputContract;
  domainDraft: GreenfieldDomainDraft;
  apiContractDraft: GreenfieldApiContractDraft;
  behaviorDraft: GreenfieldBehaviorDraft;
  sliceQueueDraft: GreenfieldSliceQueueDraft;
  generatedAt?: string;
  implementationFacts?: GreenfieldImplementationFact[];
}

const REQUIREMENTS_DOCUMENT_NODE_ID = "source-document:requirements";
const TECHNICAL_SOLUTION_DOCUMENT_NODE_ID = "source-document:technical-solution";

export function draftGreenfieldEvidenceGraph(input: GreenfieldEvidenceGraphInput): GreenfieldEvidenceGraph {
  const nodes = new Map<string, GreenfieldEvidenceNode>();
  const edges = new Map<string, GreenfieldEvidenceEdge>();
  const requirementIds = input.inputContract.requirements.requirementIds ?? [];

  addNode(nodes, {
    id: REQUIREMENTS_DOCUMENT_NODE_ID,
    type: "source_document",
    label: "Product requirements document",
    path: "docs/input/requirements.md",
    data: {
      status: input.inputContract.requirements.status,
      checksum: input.inputContract.requirements.checksum,
    },
  });
  addNode(nodes, {
    id: TECHNICAL_SOLUTION_DOCUMENT_NODE_ID,
    type: "source_document",
    label: "Technical solution document",
    path: "docs/input/technical-solution.md",
    data: {
      status: input.inputContract.technicalSolution.status,
      checksum: input.inputContract.technicalSolution.checksum,
    },
  });

  for (const requirementId of requirementIds) {
    const nodeId = requirementNodeId(requirementId);
    addNode(nodes, {
      id: nodeId,
      type: "requirement",
      label: requirementId,
      path: "docs/input/requirements.md",
      requirementIds: [requirementId],
      sourceConfidence: "requirements",
    });
    addEdge(edges, {
      from: REQUIREMENTS_DOCUMENT_NODE_ID,
      to: nodeId,
      relation: "defines",
      reason: "Requirement ID was extracted from the product requirements document.",
    });
  }

  for (const contextDomain of input.domainDraft.contextDomains) {
    const context = contextDomain.context;
    const contextNode = contextNodeId(context.id);
    addNode(nodes, {
      id: contextNode,
      type: "context",
      label: context.name,
      path: `contexts/${context.id}/context.yaml`,
      contextId: context.id,
      requirementIds: context.sourceRequirementIds,
      sourceConfidence: context.sourceConfidence,
      data: {
        type: context.type,
        owner: context.owner,
      },
    });
    addEdge(edges, {
      from: TECHNICAL_SOLUTION_DOCUMENT_NODE_ID,
      to: contextNode,
      relation: "defines",
      reason: "Bounded context was drafted from technical and product source documents.",
    });
    addRequirementEdges(edges, context.sourceRequirementIds, contextNode, "maps_to", "Requirement contributes to this bounded context.");

    for (const entity of contextDomain.entities) {
      addDomainArtifact(nodes, edges, context.id, "entity", entity.id, entity.name, entity.sourceRequirementIds);
    }
    for (const valueObject of contextDomain.valueObjects) {
      addDomainArtifact(nodes, edges, context.id, "value_object", valueObject.id, valueObject.name, valueObject.sourceRequirementIds);
    }
    for (const event of contextDomain.events) {
      addDomainArtifact(nodes, edges, context.id, "event", event.id, event.name, event.sourceRequirementIds);
    }
    for (const invariant of contextDomain.invariants) {
      addDomainArtifact(
        nodes,
        edges,
        context.id,
        "invariant",
        invariant.id,
        invariant.id,
        invariant.sourceRequirementId ? [invariant.sourceRequirementId] : [],
      );
    }
  }

  for (const contextContract of input.apiContractDraft.contextContracts) {
    for (const contract of contextContract.contracts) {
      addContract(nodes, edges, contextContract.contextId, contract);
    }
  }

  for (const contextBehavior of input.behaviorDraft.contextBehaviors) {
    for (const scenario of contextBehavior.scenarios) {
      addScenario(nodes, edges, scenario);
      const contracts = contractsForScenario(scenario, input.apiContractDraft);
      for (const contract of contracts) {
        addEdge(edges, {
          from: scenarioNodeId(scenario.id),
          to: contractNodeId(contract.id),
          relation: "references",
          reason: "Scenario and contract share a context and requirement trace.",
        });
      }
    }
  }

  for (const slice of input.sliceQueueDraft.slices) {
    addSlice(nodes, edges, slice);
  }

  const graphWithoutSummary: GreenfieldEvidenceGraph = {
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    graphKind: "greenfield-initialization",
    nodes: [],
    edges: [],
    implementationFacts: normalizeImplementationFacts(input.implementationFacts ?? []),
    summary: emptySummary(),
    warnings: [],
  };

  const graph = absorbGreenfieldImplementationFacts({
    ...graphWithoutSummary,
    nodes: stableNodes(Array.from(nodes.values())),
    edges: stableEdges(Array.from(edges.values())),
  }, input.implementationFacts ?? []);

  return {
    ...graph,
    summary: summarizeGreenfieldEvidenceGraph(graph),
    warnings: collectWarnings(graph, requirementIds),
  };
}

export function absorbGreenfieldImplementationFacts(
  graph: GreenfieldEvidenceGraph,
  implementationFacts: GreenfieldImplementationFact[],
): GreenfieldEvidenceGraph {
  if (implementationFacts.length === 0) {
    return graph;
  }

  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = new Map(graph.edges.map((edge) => [edgeKey(edge), edge]));
  const facts = new Map(graph.implementationFacts.map((fact) => [fact.id, fact]));

  for (const fact of implementationFacts) {
    facts.set(fact.id, withImplementationFactProvenance(fact));
    const factNodeId = implementationFactNodeId(fact.id);
    addNode(nodes, {
      id: factNodeId,
      type: "implementation_fact",
      label: fact.label,
      path: fact.path,
      contextId: fact.contextId,
      requirementIds: fact.requirementIds,
      implementationKind: fact.kind,
    });
    addRequirementEdges(edges, fact.requirementIds ?? [], factNodeId, "absorbs", "Implementation fact claims requirement trace.");
    for (const contractId of fact.contractIds ?? []) {
      addEdge(edges, { from: contractNodeId(contractId), to: factNodeId, relation: "absorbs" });
    }
    for (const scenarioId of fact.scenarioIds ?? []) {
      addEdge(edges, { from: scenarioNodeId(scenarioId), to: factNodeId, relation: "absorbs" });
    }
    for (const testId of fact.testIds ?? []) {
      addEdge(edges, { from: testNodeId(testId), to: factNodeId, relation: "absorbs" });
    }
    for (const sliceId of fact.sliceIds ?? []) {
      addEdge(edges, { from: sliceNodeId(sliceId), to: factNodeId, relation: "absorbs" });
    }
  }

  const nextGraph = {
    ...graph,
    nodes: stableNodes(Array.from(nodes.values())),
    edges: stableEdges(Array.from(edges.values())),
    implementationFacts: Array.from(facts.values()).sort((left, right) => left.id.localeCompare(right.id)),
  };

  return {
    ...nextGraph,
    summary: summarizeGreenfieldEvidenceGraph(nextGraph),
  };
}

export function findGreenfieldEvidenceImpact(
  graph: GreenfieldEvidenceGraph,
  seedIds: string[],
): GreenfieldEvidenceImpact {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const normalizedSeeds = stableUnique(seedIds.map(normalizeSeedId));
  const warnings = normalizedSeeds
    .filter((seedId) => !nodesById.has(seedId))
    .map((seedId) => `Seed ${seedId} was not found in the Greenfield Evidence Graph.`);
  const visited = new Set<string>();
  const affectedEdgeKeys = new Set<string>();
  const queue = normalizedSeeds.filter((seedId) => nodesById.has(seedId));

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);

    for (const edge of graph.edges) {
      if (edge.from !== current) {
        continue;
      }
      affectedEdgeKeys.add(edgeKey(edge));
      if (!visited.has(edge.to)) {
        queue.push(edge.to);
      }
    }
  }

  const affectedNodes = stableNodes(
    Array.from(visited)
      .map((nodeId) => nodesById.get(nodeId))
      .filter((node): node is GreenfieldEvidenceNode => node !== undefined),
  );
  const affectedEdges = stableEdges(graph.edges.filter((edge) => affectedEdgeKeys.has(edgeKey(edge))));
  const affectedAssetPaths = stableUnique(
    affectedNodes
      .map((node) => node.path)
      .filter((assetPath): assetPath is string => Boolean(assetPath)),
  );

  return {
    seedIds: normalizedSeeds,
    affectedNodes,
    affectedEdges,
    affectedAssetPaths,
    warnings,
  };
}

export function renderGreenfieldEvidenceGraphSummary(graph: GreenfieldEvidenceGraph): string {
  const relationCount = (relation: GreenfieldEvidenceEdgeRelation) => graph.summary.edgeCounts[relation] ?? 0;
  return [
    "# Greenfield Evidence Graph",
    "",
    "## Summary",
    "",
    `- Nodes: ${graph.nodes.length}`,
    `- Edges: ${graph.edges.length}`,
    `- Requirements: ${graph.summary.requirementCoverage.total}`,
    `- Requirements with scenarios: ${graph.summary.requirementCoverage.withScenario}`,
    `- Requirements with contracts: ${graph.summary.requirementCoverage.withContract}`,
    `- Requirements with slices: ${graph.summary.requirementCoverage.withSlice}`,
    `- Requirements with tests: ${graph.summary.requirementCoverage.withTest}`,
    `- Implementation facts: ${graph.implementationFacts.length}`,
    "",
    "## Core Trace",
    "",
    `- Requirement to scenario edges: ${relationCount("verified_by")}`,
    `- Scenario to test edges: ${relationCount("covered_by")}`,
    `- Scenario or contract to slice edges: ${relationCount("implemented_by")}`,
    `- Dependency edges: ${relationCount("depends_on")}`,
    "",
    "## Uncovered Requirements",
    "",
    ...(graph.summary.requirementCoverage.uncovered.length > 0
      ? graph.summary.requirementCoverage.uncovered.map((requirementId) => `- \`${requirementId}\``)
      : ["- None"]),
    "",
    "## Warnings",
    "",
    ...(graph.warnings.length > 0 ? graph.warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
  ].join("\n");
}

function addDomainArtifact(
  nodes: Map<string, GreenfieldEvidenceNode>,
  edges: Map<string, GreenfieldEvidenceEdge>,
  contextId: string,
  artifactType: "entity" | "value_object" | "event" | "invariant",
  artifactId: string,
  label: string,
  requirementIds: string[],
): void {
  const nodeId = domainArtifactNodeId(contextId, artifactId);
  addNode(nodes, {
    id: nodeId,
    type: "domain_artifact",
    label,
    path: domainArtifactPath(contextId, artifactType),
    contextId,
    requirementIds,
    data: { artifactType },
  });
  addEdge(edges, {
    from: contextNodeId(contextId),
    to: nodeId,
    relation: "owns",
    reason: "Domain artifact belongs to this bounded context.",
  });
  addRequirementEdges(edges, requirementIds, nodeId, "maps_to", "Requirement contributes to this domain artifact.");
}

function addContract(
  nodes: Map<string, GreenfieldEvidenceNode>,
  edges: Map<string, GreenfieldEvidenceEdge>,
  contextId: string,
  contract: GreenfieldContractDraft,
): void {
  const nodeId = contractNodeId(contract.id);
  addNode(nodes, {
    id: nodeId,
    type: "contract",
    label: contract.name,
    path: `contexts/${contextId}/design/contracts.yaml`,
    contextId,
    requirementIds: contract.sourceRequirementIds,
    sourceConfidence: contract.sourceConfidence,
    data: {
      direction: contract.direction,
      sourceContext: contract.sourceContext,
    },
  });
  addEdge(edges, {
    from: contextNodeId(contextId),
    to: nodeId,
    relation: "owns",
    reason: "Contract is drafted under this bounded context.",
  });
  addRequirementEdges(edges, contract.sourceRequirementIds, nodeId, "maps_to", "Requirement maps to this contract draft.");
  if (contract.sourceContext) {
    addEdge(edges, {
      from: contextNodeId(contextId),
      to: contextNodeId(contract.sourceContext),
      relation: "depends_on",
      reason: "Contract reads from or integrates with an upstream context.",
    });
  }
}

function addScenario(
  nodes: Map<string, GreenfieldEvidenceNode>,
  edges: Map<string, GreenfieldEvidenceEdge>,
  scenario: GreenfieldScenarioDraft,
): void {
  const nodeId = scenarioNodeId(scenario.id);
  addNode(nodes, {
    id: nodeId,
    type: "scenario",
    label: scenario.scenario,
    path: `contexts/${scenario.contextId}/behavior/scenarios/${scenario.id}.feature`,
    contextId: scenario.contextId,
    requirementIds: scenario.requirementIds,
    sourceConfidence: scenario.sourceConfidence,
    data: {
      feature: scenario.feature,
    },
  });
  addEdge(edges, {
    from: contextNodeId(scenario.contextId),
    to: nodeId,
    relation: "owns",
    reason: "Behavior scenario is drafted under this bounded context.",
  });
  addRequirementEdges(edges, scenario.requirementIds, nodeId, "verified_by", "Requirement is expressed by this behavior scenario.");
}

function addSlice(
  nodes: Map<string, GreenfieldEvidenceNode>,
  edges: Map<string, GreenfieldEvidenceEdge>,
  slice: GreenfieldSliceDraft,
): void {
  const nodeId = sliceNodeId(slice.id);
  addNode(nodes, {
    id: nodeId,
    type: "slice",
    label: slice.title,
    path: `contexts/${slice.contextId}/slices/${slice.id}/slice.yaml`,
    contextId: slice.contextId,
    requirementIds: slice.requirementIds,
    data: {
      priority: slice.priority,
      goal: slice.goal,
    },
  });
  addEdge(edges, {
    from: contextNodeId(slice.contextId),
    to: nodeId,
    relation: "owns",
    reason: "Implementation slice belongs to this bounded context.",
  });
  addRequirementEdges(edges, slice.requirementIds, nodeId, "implemented_by", "Requirement is planned in this implementation slice.");

  for (const scenarioId of slice.scenarioIds) {
    addEdge(edges, {
      from: scenarioNodeId(scenarioId),
      to: nodeId,
      relation: "implemented_by",
      reason: "Scenario is included in this slice handoff.",
    });
  }
  for (const contractId of slice.contractIds) {
    addEdge(edges, {
      from: contractNodeId(contractId),
      to: nodeId,
      relation: "implemented_by",
      reason: "Contract is in scope for this implementation slice.",
    });
  }
  for (const testId of slice.testIds) {
    const testNode = testNodeId(testId);
    addNode(nodes, {
      id: testNode,
      type: "test",
      label: testId,
      path: `contexts/${slice.contextId}/slices/${slice.id}/test-spec.yaml`,
      contextId: slice.contextId,
      requirementIds: slice.requirementIds,
      data: {
        planned: true,
        sliceId: slice.id,
      },
    });
    addEdge(edges, {
      from: nodeId,
      to: testNode,
      relation: "verified_by",
      reason: "Slice has a planned test specification.",
    });
  }
  for (const scenario of slice.scenarios) {
    addEdge(edges, {
      from: scenarioNodeId(scenario.id),
      to: testNodeId(testIdForScenario(scenario.id)),
      relation: "covered_by",
      reason: "Scenario is covered by the generated slice test spec.",
    });
  }
  for (const dependency of slice.dependencies) {
    addEdge(edges, {
      from: nodeId,
      to: sliceNodeId(dependency.slice_id),
      relation: "depends_on",
      reason: `${dependency.kind} must reach ${dependency.required_state}.`,
    });
  }
}

function contractsForScenario(
  scenario: GreenfieldScenarioDraft,
  apiContractDraft: GreenfieldApiContractDraft,
): GreenfieldContractDraft[] {
  const contextContracts = apiContractDraft.contextContracts.find((entry) => entry.contextId === scenario.contextId);
  if (!contextContracts) {
    return [];
  }

  return contextContracts.contracts.filter((contract) =>
    intersects(contract.sourceRequirementIds, scenario.requirementIds),
  );
}

function summarizeGreenfieldEvidenceGraph(graph: Pick<GreenfieldEvidenceGraph, "nodes" | "edges">): GreenfieldEvidenceGraph["summary"] {
  const nodeCounts = emptyNodeCounts();
  const edgeCounts = emptyEdgeCounts();
  const requirementNodes = graph.nodes.filter((node) => node.type === "requirement");
  const requirementIds = requirementNodes.map((node) => node.requirementIds?.[0] ?? node.label);
  const requirementCoverage = {
    total: requirementIds.length,
    withScenario: 0,
    withContract: 0,
    withSlice: 0,
    withTest: 0,
    uncovered: [] as string[],
  };

  for (const node of graph.nodes) {
    nodeCounts[node.type]++;
  }
  for (const edge of graph.edges) {
    edgeCounts[edge.relation]++;
  }

  for (const requirementId of requirementIds) {
    const source = requirementNodeId(requirementId);
    const reachable = reachableNodes(source, graph.edges);
    const reachableNodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const hasScenario = reachable.some((id) => reachableNodesById.get(id)?.type === "scenario");
    const hasContract = reachable.some((id) => reachableNodesById.get(id)?.type === "contract");
    const hasSlice = reachable.some((id) => reachableNodesById.get(id)?.type === "slice");
    const hasTest = reachable.some((id) => reachableNodesById.get(id)?.type === "test");

    if (hasScenario) {
      requirementCoverage.withScenario++;
    }
    if (hasContract) {
      requirementCoverage.withContract++;
    }
    if (hasSlice) {
      requirementCoverage.withSlice++;
    }
    if (hasTest) {
      requirementCoverage.withTest++;
    }
    if (!hasScenario && !hasContract && !hasSlice && !hasTest) {
      requirementCoverage.uncovered.push(requirementId);
    }
  }

  return {
    nodeCounts,
    edgeCounts,
    requirementCoverage,
  };
}

function collectWarnings(graph: GreenfieldEvidenceGraph, requirementIds: string[]): string[] {
  const warnings: string[] = [];
  const covered = new Set(
    graph.edges
      .filter((edge) => edge.from.startsWith("requirement:"))
      .map((edge) => edge.from.replace(/^requirement:/, "")),
  );

  for (const requirementId of requirementIds) {
    if (!covered.has(requirementId)) {
      warnings.push(`Requirement ${requirementId} has no evidence edges yet.`);
    }
  }

  return warnings.sort((left, right) => left.localeCompare(right));
}

function reachableNodes(source: string, edges: GreenfieldEvidenceEdge[]): string[] {
  const visited = new Set<string>();
  const queue = edges.filter((edge) => edge.from === source).map((edge) => edge.to);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const edge of edges) {
      if (edge.from === current && !visited.has(edge.to)) {
        queue.push(edge.to);
      }
    }
  }

  return Array.from(visited);
}

function addRequirementEdges(
  edges: Map<string, GreenfieldEvidenceEdge>,
  requirementIds: string[],
  target: string,
  relation: GreenfieldEvidenceEdgeRelation,
  reason: string,
): void {
  for (const requirementId of requirementIds) {
    addEdge(edges, {
      from: requirementNodeId(requirementId),
      to: target,
      relation,
      reason,
    });
  }
}

function addNode(nodes: Map<string, GreenfieldEvidenceNode>, node: GreenfieldEvidenceNode): void {
  const normalizedPath = node.path ? normalizeEvidencePath(node.path) : undefined;
  const descriptor = inferEvidenceProvenanceDescriptor({
    confidence: confidenceForGreenfieldNode(node),
    evidenceKind: node.type,
    sourcePath: normalizedPath ?? "",
    ownerReviewRequired: node.sourceConfidence === "inferred" || node.type === "context",
    ambiguous: node.sourceConfidence === "inferred" && node.type !== "context",
  });

  nodes.set(node.id, {
    ...node,
    path: normalizedPath,
    requirementIds: stableUnique(node.requirementIds ?? []),
    ...descriptor,
  });
}

function normalizeImplementationFacts(facts: GreenfieldImplementationFact[]): GreenfieldImplementationFact[] {
  return facts.map(withImplementationFactProvenance);
}

function withImplementationFactProvenance(fact: GreenfieldImplementationFact): GreenfieldImplementationFact {
  return {
    ...fact,
    path: normalizeEvidencePath(fact.path),
    ...inferEvidenceProvenanceDescriptor({
      confidence: 0.78,
      evidenceKind: fact.kind,
      sourcePath: fact.path,
      ownerReviewRequired: true,
    }),
  };
}

function confidenceForGreenfieldNode(node: GreenfieldEvidenceNode): number | undefined {
  if (node.type === "context") {
    return 0.72;
  }
  if (node.sourceConfidence === "requirements") {
    return 0.96;
  }
  if (node.sourceConfidence === "technical_solution") {
    return 0.82;
  }
  if (node.sourceConfidence === "inferred") {
    return 0.72;
  }
  if (node.type === "source_document") {
    return 0.98;
  }
  return 0.6;
}

function addEdge(edges: Map<string, GreenfieldEvidenceEdge>, edge: GreenfieldEvidenceEdge): void {
  edges.set(edgeKey(edge), edge);
}

function stableNodes(nodes: GreenfieldEvidenceNode[]): GreenfieldEvidenceNode[] {
  return [...nodes].sort((left, right) => `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`));
}

function stableEdges(edges: GreenfieldEvidenceEdge[]): GreenfieldEvidenceEdge[] {
  return [...edges].sort((left, right) => edgeKey(left).localeCompare(edgeKey(right)));
}

function edgeKey(edge: GreenfieldEvidenceEdge): string {
  return `${edge.from}|${edge.relation}|${edge.to}`;
}

function emptySummary(): GreenfieldEvidenceGraph["summary"] {
  return {
    nodeCounts: emptyNodeCounts(),
    edgeCounts: emptyEdgeCounts(),
    requirementCoverage: {
      total: 0,
      withScenario: 0,
      withContract: 0,
      withSlice: 0,
      withTest: 0,
      uncovered: [],
    },
  };
}

function emptyNodeCounts(): Record<GreenfieldEvidenceNodeType, number> {
  return {
    source_document: 0,
    requirement: 0,
    context: 0,
    domain_artifact: 0,
    contract: 0,
    scenario: 0,
    slice: 0,
    test: 0,
    implementation_fact: 0,
  };
}

function emptyEdgeCounts(): Record<GreenfieldEvidenceEdgeRelation, number> {
  return {
    defines: 0,
    owns: 0,
    maps_to: 0,
    references: 0,
    implemented_by: 0,
    verified_by: 0,
    covered_by: 0,
    depends_on: 0,
    absorbs: 0,
  };
}

function domainArtifactPath(contextId: string, artifactType: string): string {
  const fileByType: Record<string, string> = {
    entity: "entities.yaml",
    value_object: "value-objects.yaml",
    event: "events.yaml",
    invariant: "invariants.yaml",
  };
  return `contexts/${contextId}/domain/${fileByType[artifactType] ?? "entities.yaml"}`;
}

function requirementNodeId(requirementId: string): string {
  return `requirement:${requirementId}`;
}

function contextNodeId(contextId: string): string {
  return `context:${contextId}`;
}

function domainArtifactNodeId(contextId: string, artifactId: string): string {
  return `domain:${contextId}:${artifactId}`;
}

function contractNodeId(contractId: string): string {
  return `contract:${contractId}`;
}

function scenarioNodeId(scenarioId: string): string {
  return `scenario:${scenarioId}`;
}

function sliceNodeId(sliceId: string): string {
  return `slice:${sliceId}`;
}

function testNodeId(testId: string): string {
  return `test:${testId}`;
}

function implementationFactNodeId(factId: string): string {
  return `implementation:${factId}`;
}

function normalizeSeedId(seedId: string): string {
  if (seedId.includes(":")) {
    return seedId;
  }
  if (/^REQ-/.test(seedId)) {
    return requirementNodeId(seedId);
  }
  if (/^SCN-/.test(seedId)) {
    return scenarioNodeId(seedId);
  }
  if (/^CTR-/.test(seedId)) {
    return contractNodeId(seedId);
  }
  if (/^TEST-/.test(seedId)) {
    return testNodeId(seedId);
  }
  return seedId;
}

function testIdForScenario(scenarioId: string): string {
  return `TEST-${scenarioId.replace(/^SCN-/, "")}-INTEGRATION`;
}

function normalizeEvidencePath(input: string): string {
  return input.replace(/\\/g, "/");
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function intersects(left: string[], right: string[]): boolean {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}
