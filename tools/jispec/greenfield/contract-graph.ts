import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import type {
  GreenfieldEvidenceGraph,
  GreenfieldEvidenceNode,
} from "./evidence-graph";

export type ContractGraphNodeKind =
  | "requirement"
  | "bounded_context"
  | "domain_entity"
  | "domain_event"
  | "invariant"
  | "api_contract"
  | "bdd_scenario"
  | "slice"
  | "test"
  | "code_fact"
  | "migration"
  | "review_decision"
  | "spec_debt"
  | "baseline"
  | "delta";

export type ContractGraphEdgeRelation =
  | "defines"
  | "owns"
  | "depends_on"
  | "verifies"
  | "covered_by"
  | "implements"
  | "consumes"
  | "emits"
  | "blocked_by"
  | "supersedes"
  | "deferred_by"
  | "waived_by"
  | "derived_from";

export interface ContractGraphNode {
  id: string;
  kind: ContractGraphNodeKind;
  label: string;
  path?: string;
  source_id?: string;
  context_id?: string;
  requirement_ids?: string[];
  checksum?: string;
}

export interface ContractGraphEdge {
  from: string;
  to: string;
  relation: ContractGraphEdgeRelation;
  source: "explicit_anchor" | "evidence_graph" | "static_collector" | "review_record" | "spec_debt";
  reason?: string;
}

export interface ContractGraph {
  schema_version: 1;
  graph_kind: "deterministic-contract-graph";
  generated_at: string;
  nodes: ContractGraphNode[];
  edges: ContractGraphEdge[];
  summary: {
    node_counts: Record<ContractGraphNodeKind, number>;
    edge_counts: Record<ContractGraphEdgeRelation, number>;
  };
  warnings: string[];
}

export interface DirtyGraph {
  schema_version: 1;
  change_id: string;
  generated_at: string;
  seeds: string[];
  dirty_nodes: ContractGraphNode[];
  dirty_edges: ContractGraphEdge[];
  dirty_asset_paths: string[];
  required_updates: DirtyRequiredUpdate[];
  warnings: string[];
}

export interface DirtyRequiredUpdate {
  node_id: string;
  kind: ContractGraphNodeKind;
  path?: string;
  reason: string;
  status: "pending";
}

export interface DirtyAnalysis {
  graphAvailable: boolean;
  graph?: ContractGraph;
  dirtyGraph: DirtyGraph;
}

export interface DirtySeedInput {
  changeId: string;
  summary: string;
  contextId?: string;
  sliceId?: string;
  generatedAt?: string;
}

const CONTRACT_GRAPH_PATH = ".spec/evidence/contract-graph.json";

export function buildContractGraphFromEvidenceGraph(
  graph: GreenfieldEvidenceGraph,
  generatedAt?: string,
): ContractGraph {
  const nodes = new Map<string, ContractGraphNode>();
  const edges = new Map<string, ContractGraphEdge>();

  for (const evidenceNode of graph.nodes) {
    const node = contractNodeFromEvidenceNode(evidenceNode);
    if (node) {
      nodes.set(node.id, node);
    }
  }

  for (const evidenceNode of graph.nodes) {
    addRequirementDerivedEdges(edges, evidenceNode);
  }

  addContextOwnershipEdges(nodes, edges);
  addDomainToContractEdges(nodes, edges);
  addContractToScenarioEdges(nodes, edges);
  addScenarioToTestEdges(nodes, edges);
  addContractAndScenarioToSliceEdges(nodes, edges);
  addContextConsumesEdges(graph, nodes, edges);

  for (const fact of graph.implementationFacts) {
    const codeNodeId = codeNodeIdForPath(fact.path);
    nodes.set(codeNodeId, {
      id: codeNodeId,
      kind: fact.kind === "migration" ? "migration" : "code_fact",
      label: fact.label,
      path: fact.path,
      source_id: fact.id,
      context_id: fact.contextId,
      requirement_ids: stableUnique(fact.requirementIds ?? []),
    });
    for (const contractId of fact.contractIds ?? []) {
      addEdge(edges, {
        from: apiNodeId(contractId),
        to: codeNodeId,
        relation: "implements",
        source: "static_collector",
        reason: "Implementation fact claims contract trace.",
      });
    }
    for (const scenarioId of fact.scenarioIds ?? []) {
      addEdge(edges, {
        from: bddNodeId(scenarioId),
        to: codeNodeId,
        relation: "implements",
        source: "static_collector",
        reason: "Implementation fact claims scenario trace.",
      });
    }
  }

  const nextGraph: Omit<ContractGraph, "summary"> = {
    schema_version: 1,
    graph_kind: "deterministic-contract-graph",
    generated_at: generatedAt ?? new Date().toISOString(),
    nodes: stableNodes(Array.from(nodes.values())),
    edges: stableEdges(Array.from(edges.values())),
    warnings: [],
  };

  return {
    ...nextGraph,
    summary: summarizeContractGraph(nextGraph.nodes, nextGraph.edges),
  };
}

export function writeContractGraph(rootInput: string, graph: ContractGraph): string {
  const root = path.resolve(rootInput);
  const graphPath = path.join(root, CONTRACT_GRAPH_PATH);
  fs.mkdirSync(path.dirname(graphPath), { recursive: true });
  fs.writeFileSync(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf-8");
  return normalizePath(graphPath);
}

export function loadContractGraph(rootInput: string): ContractGraph | undefined {
  const root = path.resolve(rootInput);
  const graphPath = path.join(root, CONTRACT_GRAPH_PATH);
  if (!fs.existsSync(graphPath)) {
    return undefined;
  }

  try {
    return JSON.parse(fs.readFileSync(graphPath, "utf-8")) as ContractGraph;
  } catch {
    return undefined;
  }
}

export function analyzeDirtyPropagation(rootInput: string, input: DirtySeedInput): DirtyAnalysis {
  const root = path.resolve(rootInput);
  const graph = loadContractGraph(root);
  const seeds = inferDirtySeeds(input);

  if (!graph) {
    return {
      graphAvailable: false,
      dirtyGraph: {
        schema_version: 1,
        change_id: input.changeId,
        generated_at: input.generatedAt ?? new Date().toISOString(),
        seeds,
        dirty_nodes: [],
        dirty_edges: [],
        dirty_asset_paths: [],
        required_updates: [],
        warnings: [`Deterministic Contract Graph is missing at ${CONTRACT_GRAPH_PATH}.`],
      },
    };
  }

  const dirty = propagateDirty(graph, seeds, input.changeId, input.generatedAt);
  return {
    graphAvailable: true,
    graph,
    dirtyGraph: dirty,
  };
}

export function renderDirtyReport(dirty: DirtyGraph): string {
  return [
    `# Dirty Propagation Report: ${dirty.change_id}`,
    "",
    "## Seeds",
    "",
    ...(dirty.seeds.length > 0 ? dirty.seeds.map((seed) => `- \`${seed}\``) : ["- None recorded."]),
    "",
    "## Dirty Nodes",
    "",
    ...(dirty.dirty_nodes.length > 0
      ? dirty.dirty_nodes.map((node) => `- \`${node.id}\` (${node.kind})${node.path ? ` -> \`${node.path}\`` : ""}`)
      : ["- None recorded."]),
    "",
    "## Required Updates",
    "",
    ...(dirty.required_updates.length > 0
      ? dirty.required_updates.map((update) => `- \`${update.node_id}\` (${update.kind}): ${update.reason}${update.path ? ` \`${update.path}\`` : ""}`)
      : ["- None recorded."]),
    "",
    "## Dirty Assets",
    "",
    ...(dirty.dirty_asset_paths.length > 0
      ? dirty.dirty_asset_paths.map((assetPath) => `- \`${assetPath}\``)
      : ["- None recorded."]),
    "",
    "## Warnings",
    "",
    ...(dirty.warnings.length > 0 ? dirty.warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
  ].join("\n");
}

export function renderDirtyVerifyFocusYaml(changeId: string, dirty: DirtyGraph, existingFocus: Record<string, unknown>): string {
  return yaml.dump({
    ...existingFocus,
    dirty_propagation: {
      source: "deterministic-contract-graph",
      change_id: changeId,
      seeds: dirty.seeds,
      dirty_nodes: dirty.dirty_nodes.map((node) => node.id),
      dirty_asset_paths: dirty.dirty_asset_paths,
      required_updates: dirty.required_updates,
      warnings: dirty.warnings,
    },
  }, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
}

export function contractGraphPath(): string {
  return CONTRACT_GRAPH_PATH;
}

function propagateDirty(
  graph: ContractGraph,
  seeds: string[],
  changeId: string,
  generatedAt?: string,
): DirtyGraph {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const normalizedSeeds = stableUnique(seeds.map(normalizeDirtySeedId));
  const warnings = normalizedSeeds
    .filter((seed) => !nodesById.has(seed))
    .map((seed) => `Seed ${seed} was not found in the Deterministic Contract Graph.`);
  const visited = new Set<string>();
  const dirtyEdges = new Map<string, ContractGraphEdge>();
  const queue = normalizedSeeds.filter((seed) => nodesById.has(seed));

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);

    for (const edge of graph.edges) {
      if (edge.from !== current || !isDirtyPropagationEdge(edge)) {
        continue;
      }
      dirtyEdges.set(edgeKey(edge), edge);
      if (!visited.has(edge.to)) {
        queue.push(edge.to);
      }
    }
  }

  const dirtyNodes = stableNodes(
    Array.from(visited)
      .map((nodeId) => nodesById.get(nodeId))
      .filter((node): node is ContractGraphNode => node !== undefined),
  );
  const dirtyAssetPaths = stableUnique(
    dirtyNodes
      .map((node) => node.path)
      .filter((assetPath): assetPath is string => Boolean(assetPath)),
  );
  const requiredUpdates = dirtyNodes
    .filter((node) => requiresDownstreamUpdate(node, normalizedSeeds))
    .map((node) => ({
      node_id: node.id,
      kind: node.kind,
      path: node.path,
      reason: `${node.kind} is downstream of a dirty seed and must be reviewed, updated, deferred, or waived.`,
      status: "pending" as const,
    }));

  return {
    schema_version: 1,
    change_id: changeId,
    generated_at: generatedAt ?? new Date().toISOString(),
    seeds: normalizedSeeds,
    dirty_nodes: dirtyNodes,
    dirty_edges: stableEdges(Array.from(dirtyEdges.values())),
    dirty_asset_paths: dirtyAssetPaths,
    required_updates: requiredUpdates,
    warnings,
  };
}

function contractNodeFromEvidenceNode(node: GreenfieldEvidenceNode): ContractGraphNode | undefined {
  switch (node.type) {
    case "requirement":
      return {
        id: reqNodeId(node.requirementIds?.[0] ?? node.label),
        kind: "requirement",
        label: node.label,
        path: node.path,
        source_id: node.id,
        requirement_ids: node.requirementIds,
      };
    case "context":
      return {
        id: contextNodeId(node.contextId ?? stripPrefix(node.id, "context:")),
        kind: "bounded_context",
        label: node.label,
        path: node.path,
        source_id: node.id,
        context_id: node.contextId,
        requirement_ids: node.requirementIds,
      };
    case "domain_artifact":
      return {
        id: domainNodeId(node.label, node.id),
        kind: domainKind(node),
        label: node.label,
        path: node.path,
        source_id: node.id,
        context_id: node.contextId,
        requirement_ids: node.requirementIds,
      };
    case "contract":
      return {
        id: apiNodeId(stripPrefix(node.id, "contract:")),
        kind: "api_contract",
        label: node.label,
        path: node.path,
        source_id: node.id,
        context_id: node.contextId,
        requirement_ids: node.requirementIds,
      };
    case "scenario":
      return {
        id: bddNodeId(stripPrefix(node.id, "scenario:")),
        kind: "bdd_scenario",
        label: node.label,
        path: node.path,
        source_id: node.id,
        context_id: node.contextId,
        requirement_ids: node.requirementIds,
      };
    case "slice":
      return {
        id: sliceNodeId(stripPrefix(node.id, "slice:")),
        kind: "slice",
        label: node.label,
        path: node.path,
        source_id: node.id,
        context_id: node.contextId,
        requirement_ids: node.requirementIds,
      };
    case "test":
      return {
        id: testNodeId(stripPrefix(node.id, "test:")),
        kind: "test",
        label: node.label,
        path: node.path,
        source_id: node.id,
        context_id: node.contextId,
        requirement_ids: node.requirementIds,
      };
    case "implementation_fact":
      return {
        id: codeNodeIdForPath(node.path ?? stripPrefix(node.id, "implementation:")),
        kind: node.implementationKind === "migration" ? "migration" : "code_fact",
        label: node.label,
        path: node.path,
        source_id: node.id,
        context_id: node.contextId,
        requirement_ids: node.requirementIds,
      };
    default:
      return undefined;
  }
}

function addRequirementDerivedEdges(edges: Map<string, ContractGraphEdge>, node: GreenfieldEvidenceNode): void {
  const target = contractNodeFromEvidenceNode(node);
  if (!target || target.kind === "requirement") {
    return;
  }
  for (const requirementId of node.requirementIds ?? []) {
    addEdge(edges, {
      from: reqNodeId(requirementId),
      to: target.id,
      relation: "derived_from",
      source: "evidence_graph",
      reason: "Asset has explicit requirement trace.",
    });
  }
}

function addDomainToContractEdges(nodes: Map<string, ContractGraphNode>, edges: Map<string, ContractGraphEdge>): void {
  const domainNodes = Array.from(nodes.values()).filter((node) =>
    node.kind === "domain_entity" || node.kind === "domain_event" || node.kind === "invariant",
  );
  const apiNodes = Array.from(nodes.values()).filter((node) => node.kind === "api_contract");

  for (const api of apiNodes) {
    for (const domain of domainNodes) {
      if (api.context_id !== domain.context_id || !intersects(api.requirement_ids ?? [], domain.requirement_ids ?? [])) {
        continue;
      }
      addEdge(edges, {
        from: domain.id,
        to: api.id,
        relation: "depends_on",
        source: "evidence_graph",
        reason: "API contract shares context and requirement trace with domain artifact.",
      });
    }
  }
}

function addContextOwnershipEdges(nodes: Map<string, ContractGraphNode>, edges: Map<string, ContractGraphEdge>): void {
  const contexts = Array.from(nodes.values()).filter((node) => node.kind === "bounded_context");
  const ownedKinds: ContractGraphNodeKind[] = [
    "domain_entity",
    "domain_event",
    "invariant",
    "api_contract",
    "bdd_scenario",
    "slice",
    "test",
    "code_fact",
    "migration",
  ];

  for (const context of contexts) {
    for (const node of nodes.values()) {
      if (!ownedKinds.includes(node.kind) || node.context_id !== context.context_id) {
        continue;
      }
      addEdge(edges, {
        from: context.id,
        to: node.id,
        relation: "owns",
        source: "evidence_graph",
        reason: "Bounded context owns this deterministic contract asset.",
      });
    }
  }
}

function addContractToScenarioEdges(nodes: Map<string, ContractGraphNode>, edges: Map<string, ContractGraphEdge>): void {
  const apiNodes = Array.from(nodes.values()).filter((node) => node.kind === "api_contract");
  const scenarioNodes = Array.from(nodes.values()).filter((node) => node.kind === "bdd_scenario");

  for (const scenario of scenarioNodes) {
    for (const api of apiNodes) {
      if (api.context_id !== scenario.context_id || !intersects(api.requirement_ids ?? [], scenario.requirement_ids ?? [])) {
        continue;
      }
      addEdge(edges, {
        from: api.id,
        to: scenario.id,
        relation: "verifies",
        source: "evidence_graph",
        reason: "Scenario verifies a contract with shared context and requirement trace.",
      });
    }
  }
}

function addScenarioToTestEdges(nodes: Map<string, ContractGraphNode>, edges: Map<string, ContractGraphEdge>): void {
  const scenarios = Array.from(nodes.values()).filter((node) => node.kind === "bdd_scenario");
  const tests = Array.from(nodes.values()).filter((node) => node.kind === "test");

  for (const scenario of scenarios) {
    for (const test of tests) {
      if (!intersects(scenario.requirement_ids ?? [], test.requirement_ids ?? [])) {
        continue;
      }
      addEdge(edges, {
        from: scenario.id,
        to: test.id,
        relation: "covered_by",
        source: "evidence_graph",
        reason: "Generated test spec covers scenario requirement trace.",
      });
    }
  }
}

function addContractAndScenarioToSliceEdges(nodes: Map<string, ContractGraphNode>, edges: Map<string, ContractGraphEdge>): void {
  const slices = Array.from(nodes.values()).filter((node) => node.kind === "slice");
  const upstream = Array.from(nodes.values()).filter((node) => node.kind === "api_contract" || node.kind === "bdd_scenario");

  for (const slice of slices) {
    for (const source of upstream) {
      if (slice.context_id !== source.context_id || !intersects(slice.requirement_ids ?? [], source.requirement_ids ?? [])) {
        continue;
      }
      addEdge(edges, {
        from: source.id,
        to: slice.id,
        relation: "implements",
        source: "evidence_graph",
        reason: "Slice implements a contract or scenario with shared requirement trace.",
      });
    }
  }
}

function addContextConsumesEdges(
  graph: GreenfieldEvidenceGraph,
  nodes: Map<string, ContractGraphNode>,
  edges: Map<string, ContractGraphEdge>,
): void {
  const contextEdges = graph.edges.filter((edge) =>
    edge.relation === "depends_on" && edge.from.startsWith("context:") && edge.to.startsWith("context:"),
  );
  for (const contextEdge of contextEdges) {
    const fromContext = stripPrefix(contextEdge.from, "context:");
    const toContext = stripPrefix(contextEdge.to, "context:");
    const fromContracts = Array.from(nodes.values()).filter((node) => node.kind === "api_contract" && node.context_id === fromContext);
    const toDomains = Array.from(nodes.values()).filter((node) =>
      node.context_id === toContext &&
      (node.kind === "domain_entity" || node.kind === "domain_event" || node.kind === "invariant")
    );
    for (const contract of fromContracts) {
      for (const domain of toDomains) {
        addEdge(edges, {
          from: domain.id,
          to: contract.id,
          relation: "consumes",
          source: "evidence_graph",
          reason: "Contract consumes an upstream context boundary.",
        });
      }
    }
  }
}

function inferDirtySeeds(input: DirtySeedInput): string[] {
  return stableUnique([
    ...extractRequirementIds(input.summary).map(reqNodeId),
    ...extractContractIds(input.summary).map(apiNodeId),
    ...extractScenarioIds(input.summary).map(bddNodeId),
    ...extractTestIds(input.summary).map(testNodeId),
    ...extractDomainIds(input.summary).map((domainId) => domainId.startsWith("@domain:") ? domainId : `@domain:${domainId}`),
    ...(input.sliceId ? [sliceNodeId(input.sliceId)] : []),
    ...(input.contextId ? [contextNodeId(input.contextId)] : []),
  ]);
}

function normalizeDirtySeedId(seed: string): string {
  if (seed.startsWith("@")) {
    return seed;
  }
  if (/^REQ-/.test(seed)) {
    return reqNodeId(seed);
  }
  if (/^CTR-/.test(seed)) {
    return apiNodeId(seed);
  }
  if (/^SCN-/.test(seed)) {
    return bddNodeId(seed);
  }
  if (/^TEST-/.test(seed)) {
    return testNodeId(seed);
  }
  return seed;
}

function domainKind(node: GreenfieldEvidenceNode): ContractGraphNodeKind {
  const artifactType = typeof node.data?.artifactType === "string" ? node.data.artifactType : "";
  if (artifactType === "event") {
    return "domain_event";
  }
  if (artifactType === "invariant") {
    return "invariant";
  }
  return "domain_entity";
}

function domainNodeId(label: string, fallback: string): string {
  const clean = label && !/^INV-/.test(label) ? label.replace(/[^A-Za-z0-9_]+/g, "") : stripPrefix(fallback, "domain:").replace(/:/g, "-");
  return `@domain:${clean || fallback}`;
}

function reqNodeId(requirementId: string): string {
  return `@req:${requirementId}`;
}

function contextNodeId(contextId: string): string {
  return `@context:${contextId}`;
}

function apiNodeId(contractId: string): string {
  return `@api:${contractId}`;
}

function bddNodeId(scenarioId: string): string {
  return `@bdd:${scenarioId}`;
}

function sliceNodeId(sliceId: string): string {
  return `@slice:${sliceId}`;
}

function testNodeId(testId: string): string {
  return `@test:${testId}`;
}

function codeNodeIdForPath(filePath: string): string {
  return `@code:${filePath.replace(/\\/g, "/")}`;
}

function addEdge(edges: Map<string, ContractGraphEdge>, edge: ContractGraphEdge): void {
  edges.set(edgeKey(edge), edge);
}

function isDirtyPropagationEdge(edge: ContractGraphEdge): boolean {
  return [
    "depends_on",
    "owns",
    "verifies",
    "covered_by",
    "implements",
    "consumes",
    "emits",
    "derived_from",
  ].includes(edge.relation);
}

function requiresDownstreamUpdate(node: ContractGraphNode, seeds: string[]): boolean {
  if (seeds.includes(node.id)) {
    return false;
  }
  return ["api_contract", "bdd_scenario", "slice", "test", "code_fact", "migration"].includes(node.kind);
}

function summarizeContractGraph(nodes: ContractGraphNode[], edges: ContractGraphEdge[]): ContractGraph["summary"] {
  const nodeCounts = emptyNodeCounts();
  const edgeCounts = emptyEdgeCounts();
  for (const node of nodes) {
    nodeCounts[node.kind]++;
  }
  for (const edge of edges) {
    edgeCounts[edge.relation]++;
  }
  return {
    node_counts: nodeCounts,
    edge_counts: edgeCounts,
  };
}

function emptyNodeCounts(): Record<ContractGraphNodeKind, number> {
  return {
    requirement: 0,
    bounded_context: 0,
    domain_entity: 0,
    domain_event: 0,
    invariant: 0,
    api_contract: 0,
    bdd_scenario: 0,
    slice: 0,
    test: 0,
    code_fact: 0,
    migration: 0,
    review_decision: 0,
    spec_debt: 0,
    baseline: 0,
    delta: 0,
  };
}

function emptyEdgeCounts(): Record<ContractGraphEdgeRelation, number> {
  return {
    defines: 0,
    owns: 0,
    depends_on: 0,
    verifies: 0,
    covered_by: 0,
    implements: 0,
    consumes: 0,
    emits: 0,
    blocked_by: 0,
    supersedes: 0,
    deferred_by: 0,
    waived_by: 0,
    derived_from: 0,
  };
}

function stableNodes(nodes: ContractGraphNode[]): ContractGraphNode[] {
  return [...nodes].sort((left, right) => left.id.localeCompare(right.id));
}

function stableEdges(edges: ContractGraphEdge[]): ContractGraphEdge[] {
  return [...edges].sort((left, right) => edgeKey(left).localeCompare(edgeKey(right)));
}

function edgeKey(edge: ContractGraphEdge): string {
  return `${edge.from}|${edge.relation}|${edge.to}`;
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

function extractDomainIds(value: string): string[] {
  const explicit = value.match(/@domain:[A-Za-z0-9_-]+/g) ?? [];
  const bare = value.match(/\bdomain:([A-Za-z0-9_-]+)\b/g) ?? [];
  return [...explicit, ...bare.map((entry) => entry.replace(/^domain:/, ""))];
}

function stripPrefix(value: string, prefix: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function intersects(left: string[], right: string[]): boolean {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
