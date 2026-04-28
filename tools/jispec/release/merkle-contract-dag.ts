import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  ContractGraph,
  ContractGraphEdge,
  ContractGraphEdgeRelation,
  ContractGraphNode,
  ContractGraphNodeKind,
} from "../greenfield/contract-graph";

export interface MerkleContractDagLock {
  schema_version: 1;
  graph_kind: "merkle-contract-dag";
  release_version: string;
  generated_at: string;
  source_graph_path: string;
  graph_hash: string;
  root_hash: string;
  node_hashes: Record<string, string>;
  edge_hashes: Record<string, string>;
  closure_hashes: Record<string, string>;
  node_counts: Record<string, number>;
  edge_counts: Record<string, number>;
  critical_node_ids: string[];
}

export interface MerkleContractDagDiff {
  available: boolean;
  identical: boolean;
  fromRootHash?: string;
  toRootHash?: string;
  addedNodes: string[];
  removedNodes: string[];
  changedNodeContent: string[];
  addedEdges: string[];
  removedEdges: string[];
  changedEdges: string[];
  affectedClosureNodes: string[];
  coverageChanges: MerkleCoverageChange[];
  warnings: string[];
}

export interface MerkleCoverageChange {
  requirement_id: string;
  from: {
    contracts: string[];
    scenarios: string[];
    slices: string[];
    tests: string[];
  };
  to: {
    contracts: string[];
    scenarios: string[];
    slices: string[];
    tests: string[];
  };
}

export function buildMerkleContractDagLock(input: {
  graph: ContractGraph;
  releaseVersion: string;
  sourceGraphPath: string;
  generatedAt?: string;
}): MerkleContractDagLock {
  const graph = normalizeGraph(input.graph);
  const nodeHashes = Object.fromEntries(graph.nodes.map((node) => [node.id, hashValue(normalizeNode(node))]));
  const edgeHashes = Object.fromEntries(graph.edges.map((edge) => [edgeKey(edge), hashValue(normalizeEdge(edge))]));
  const outgoing = buildOutgoingEdgeMap(graph.edges);
  const closureHashes: Record<string, string> = {};

  for (const node of graph.nodes) {
    closureHashes[node.id] = computeClosureHash(node.id, {
      nodeHashes,
      edgeHashes,
      outgoing,
      memo: closureHashes,
      visiting: new Set(),
    });
  }

  return {
    schema_version: 1,
    graph_kind: "merkle-contract-dag",
    release_version: input.releaseVersion,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    source_graph_path: normalizePath(input.sourceGraphPath),
    graph_hash: hashValue({
      nodes: graph.nodes.map(normalizeNode),
      edges: graph.edges.map(normalizeEdge),
    }),
    root_hash: hashValue({
      graph_kind: "deterministic-contract-graph",
      node_closures: Object.entries(closureHashes).sort(([left], [right]) => left.localeCompare(right)),
    }),
    node_hashes: sortRecord(nodeHashes),
    edge_hashes: sortRecord(edgeHashes),
    closure_hashes: sortRecord(closureHashes),
    node_counts: sortNumericRecord(graph.summary?.node_counts ?? countNodes(graph.nodes)),
    edge_counts: sortNumericRecord(graph.summary?.edge_counts ?? countEdges(graph.edges)),
    critical_node_ids: graph.nodes
      .filter((node) => isCriticalNode(node))
      .map((node) => node.id)
      .sort((left, right) => left.localeCompare(right)),
  };
}

export function writeMerkleContractDagArtifacts(input: {
  root: string;
  version: string;
  graph: ContractGraph;
  generatedAt?: string;
}): {
  graphPath: string;
  lockPath: string;
  lock: MerkleContractDagLock;
} {
  const root = path.resolve(input.root);
  const releaseDir = path.join(root, ".spec", "releases", input.version);
  const graphPath = path.join(releaseDir, "contract-graph.json");
  const lockPath = path.join(releaseDir, "contract-graph.lock");
  fs.mkdirSync(releaseDir, { recursive: true });

  const normalizedGraph = normalizeGraph(input.graph);
  fs.writeFileSync(graphPath, `${JSON.stringify(normalizedGraph, null, 2)}\n`, "utf-8");
  const lock = buildMerkleContractDagLock({
    graph: normalizedGraph,
    releaseVersion: input.version,
    sourceGraphPath: normalizePath(path.relative(root, graphPath)),
    generatedAt: input.generatedAt,
  });
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf-8");

  return {
    graphPath: normalizePath(graphPath),
    lockPath: normalizePath(lockPath),
    lock,
  };
}

export function readMerkleContractDagLock(filePath: string): MerkleContractDagLock | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return isMerkleLock(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function diffMerkleContractDag(input: {
  fromGraph?: ContractGraph;
  toGraph?: ContractGraph;
  fromLock?: MerkleContractDagLock;
  toLock?: MerkleContractDagLock;
}): MerkleContractDagDiff {
  const warnings: string[] = [];
  if (!input.fromLock || !input.toLock) {
    warnings.push("Merkle Contract DAG lock is missing for one or both baselines.");
  }
  if (!input.fromGraph || !input.toGraph) {
    warnings.push("Canonical Contract Graph artifact is missing for one or both baselines.");
  }

  const fromLock = input.fromLock;
  const toLock = input.toLock;
  const rootIdentical = Boolean(fromLock && toLock && fromLock.root_hash === toLock.root_hash);
  if (rootIdentical && input.fromGraph && input.toGraph) {
    return {
      available: true,
      identical: true,
      fromRootHash: fromLock?.root_hash,
      toRootHash: toLock?.root_hash,
      addedNodes: [],
      removedNodes: [],
      changedNodeContent: [],
      addedEdges: [],
      removedEdges: [],
      changedEdges: [],
      affectedClosureNodes: [],
      coverageChanges: [],
      warnings,
    };
  }

  const addedNodes = diffAddedKeys(fromLock?.node_hashes, toLock?.node_hashes);
  const removedNodes = diffRemovedKeys(fromLock?.node_hashes, toLock?.node_hashes);
  const changedNodeContent = diffChangedKeys(fromLock?.node_hashes, toLock?.node_hashes);
  const addedEdges = diffAddedKeys(fromLock?.edge_hashes, toLock?.edge_hashes);
  const removedEdges = diffRemovedKeys(fromLock?.edge_hashes, toLock?.edge_hashes);
  const changedEdges = diffChangedKeys(fromLock?.edge_hashes, toLock?.edge_hashes);
  const affectedClosureNodes = diffChangedKeys(fromLock?.closure_hashes, toLock?.closure_hashes);
  const coverageChanges = input.fromGraph && input.toGraph
    ? diffRequirementCoverage(input.fromGraph, input.toGraph)
    : [];

  return {
    available: Boolean(fromLock && toLock && input.fromGraph && input.toGraph),
    identical:
      rootIdentical &&
      addedNodes.length === 0 &&
      removedNodes.length === 0 &&
      changedNodeContent.length === 0 &&
      addedEdges.length === 0 &&
      removedEdges.length === 0 &&
      changedEdges.length === 0 &&
      affectedClosureNodes.length === 0 &&
      coverageChanges.length === 0,
    fromRootHash: fromLock?.root_hash,
    toRootHash: toLock?.root_hash,
    addedNodes,
    removedNodes,
    changedNodeContent,
    addedEdges,
    removedEdges,
    changedEdges,
    affectedClosureNodes,
    coverageChanges,
    warnings,
  };
}

export function loadContractGraphFile(filePath: string): ContractGraph | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return parsed as ContractGraph;
  } catch {
    return undefined;
  }
}

function computeClosureHash(
  nodeId: string,
  input: {
    nodeHashes: Record<string, string>;
    edgeHashes: Record<string, string>;
    outgoing: Map<string, ContractGraphEdge[]>;
    memo: Record<string, string>;
    visiting: Set<string>;
  },
): string {
  if (input.memo[nodeId]) {
    return input.memo[nodeId];
  }
  if (input.visiting.has(nodeId)) {
    return hashValue({
      cycle_ref: nodeId,
      content_hash: input.nodeHashes[nodeId],
    });
  }

  input.visiting.add(nodeId);
  const downstream = (input.outgoing.get(nodeId) ?? []).map((edge) => ({
    edge_hash: input.edgeHashes[edgeKey(edge)],
    to: edge.to,
    closure_hash: computeClosureHash(edge.to, input),
  }));
  input.visiting.delete(nodeId);

  const closureHash = hashValue({
    node_id: nodeId,
    content_hash: input.nodeHashes[nodeId] ?? "",
    downstream: downstream.sort((left, right) => `${left.edge_hash}:${left.to}`.localeCompare(`${right.edge_hash}:${right.to}`)),
  });
  input.memo[nodeId] = closureHash;
  return closureHash;
}

function diffRequirementCoverage(fromGraph: ContractGraph, toGraph: ContractGraph): MerkleCoverageChange[] {
  const fromCoverage = requirementCoverage(fromGraph);
  const toCoverage = requirementCoverage(toGraph);
  const requirementIds = Array.from(new Set([...Object.keys(fromCoverage), ...Object.keys(toCoverage)])).sort();
  const changes: MerkleCoverageChange[] = [];

  for (const requirementId of requirementIds) {
    const from = fromCoverage[requirementId] ?? emptyCoverage();
    const to = toCoverage[requirementId] ?? emptyCoverage();
    if (JSON.stringify(from) === JSON.stringify(to)) {
      continue;
    }
    changes.push({ requirement_id: requirementId, from, to });
  }

  return changes;
}

function requirementCoverage(graph: ContractGraph): Record<string, MerkleCoverageChange["from"]> {
  const coverage: Record<string, MerkleCoverageChange["from"]> = {};
  for (const node of graph.nodes) {
    for (const requirementId of node.requirement_ids ?? []) {
      coverage[requirementId] ??= emptyCoverage();
      if (node.kind === "api_contract") {
        coverage[requirementId].contracts.push(node.id);
      } else if (node.kind === "bdd_scenario") {
        coverage[requirementId].scenarios.push(node.id);
      } else if (node.kind === "slice") {
        coverage[requirementId].slices.push(node.id);
      } else if (node.kind === "test") {
        coverage[requirementId].tests.push(node.id);
      }
    }
  }
  return Object.fromEntries(
    Object.entries(coverage).map(([requirementId, value]) => [
      requirementId,
      {
        contracts: stableUnique(value.contracts),
        scenarios: stableUnique(value.scenarios),
        slices: stableUnique(value.slices),
        tests: stableUnique(value.tests),
      },
    ]),
  );
}

function emptyCoverage(): MerkleCoverageChange["from"] {
  return {
    contracts: [],
    scenarios: [],
    slices: [],
    tests: [],
  };
}

function normalizeGraph(graph: ContractGraph): ContractGraph {
  return {
    ...graph,
    nodes: [...graph.nodes].sort((left, right) => left.id.localeCompare(right.id)),
    edges: [...graph.edges].sort((left, right) => edgeKey(left).localeCompare(edgeKey(right))),
  };
}

function normalizeNode(node: ContractGraphNode): Record<string, unknown> {
  return sortObject({
    id: node.id,
    kind: node.kind,
    label: node.label,
    path: node.path,
    source_id: node.source_id,
    context_id: node.context_id,
    requirement_ids: node.requirement_ids ? stableUnique(node.requirement_ids) : undefined,
    checksum: node.checksum,
  }) as Record<string, unknown>;
}

function normalizeEdge(edge: ContractGraphEdge): Record<string, unknown> {
  return sortObject({
    from: edge.from,
    relation: edge.relation,
    to: edge.to,
    source: edge.source,
    reason: edge.reason,
  }) as Record<string, unknown>;
}

function buildOutgoingEdgeMap(edges: ContractGraphEdge[]): Map<string, ContractGraphEdge[]> {
  const outgoing = new Map<string, ContractGraphEdge[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
  }
  for (const [nodeId, list] of outgoing.entries()) {
    outgoing.set(nodeId, list.sort((left, right) => edgeKey(left).localeCompare(edgeKey(right))));
  }
  return outgoing;
}

function countNodes(nodes: ContractGraphNode[]): Record<ContractGraphNodeKind, number> {
  const counts = {} as Record<ContractGraphNodeKind, number>;
  for (const node of nodes) {
    counts[node.kind] = (counts[node.kind] ?? 0) + 1;
  }
  return counts;
}

function countEdges(edges: ContractGraphEdge[]): Record<ContractGraphEdgeRelation, number> {
  const counts = {} as Record<ContractGraphEdgeRelation, number>;
  for (const edge of edges) {
    counts[edge.relation] = (counts[edge.relation] ?? 0) + 1;
  }
  return counts;
}

function isCriticalNode(node: ContractGraphNode): boolean {
  return ["requirement", "api_contract", "bdd_scenario", "slice", "test", "code_fact", "migration"].includes(node.kind);
}

function edgeKey(edge: ContractGraphEdge): string {
  return `${edge.from}|${edge.relation}|${edge.to}`;
}

function diffAddedKeys(from: Record<string, string> | undefined, to: Record<string, string> | undefined): string[] {
  const fromKeys = new Set(Object.keys(from ?? {}));
  return Object.keys(to ?? {}).filter((key) => !fromKeys.has(key)).sort();
}

function diffRemovedKeys(from: Record<string, string> | undefined, to: Record<string, string> | undefined): string[] {
  const toKeys = new Set(Object.keys(to ?? {}));
  return Object.keys(from ?? {}).filter((key) => !toKeys.has(key)).sort();
}

function diffChangedKeys(from: Record<string, string> | undefined, to: Record<string, string> | undefined): string[] {
  const fromValues = from ?? {};
  const toValues = to ?? {};
  return Object.keys(fromValues)
    .filter((key) => key in toValues && fromValues[key] !== toValues[key])
    .sort();
}

function hashValue(value: unknown): string {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortObject(value));
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortObject(entry)]),
    );
  }
  return value;
}

function sortRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

function sortNumericRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function isMerkleLock(value: unknown): value is MerkleContractDagLock {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as { schema_version?: unknown }).schema_version === 1 &&
      (value as { graph_kind?: unknown }).graph_kind === "merkle-contract-dag",
  );
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
