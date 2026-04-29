import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { summarizeGreenfieldSpecDebt } from "../greenfield/spec-debt-ledger";
import { loadContractGraph } from "../greenfield/contract-graph";
import {
  augmentContractGraphWithStaticFacts,
  collectStaticImplementationFacts,
  writeStaticCollectorManifest,
} from "../greenfield/static-collector";
import {
  buildMerkleContractDagLock,
  diffMerkleContractDag,
  loadContractGraphFile,
  readMerkleContractDagLock,
  writeMerkleContractDagArtifacts,
  type MerkleContractDagDiff,
  type MerkleContractDagLock,
} from "./merkle-contract-dag";

export interface ReleaseSnapshotOptions {
  root: string;
  version: string;
  force?: boolean;
  frozenAt?: string;
}

export interface ReleaseSnapshotResult {
  root: string;
  version: string;
  created: boolean;
  overwritten: boolean;
  currentBaselinePath: string;
  releaseBaselinePath: string;
  releaseSummaryPath: string;
  contractGraphPath?: string;
  contractGraphLockPath?: string;
  contractGraphRootHash?: string;
  staticCollectorManifestPath?: string;
  baselineId?: string;
  projectId?: string;
  counts: BaselineCounts;
  summary: ReleaseBaselineSummary;
}

export interface BaselineCounts {
  requirementIds: number;
  contexts: number;
  contracts: number;
  scenarios: number;
  slices: number;
  assets: number;
}

export interface ReleaseCompareOptions {
  root: string;
  from: string;
  to: string;
}

export interface ReleaseCompareResult {
  root: string;
  from: string;
  to: string;
  fromPath: string;
  toPath: string;
  compareReportJsonPath: string;
  compareReportMarkdownPath: string;
  identical: boolean;
  diffs: BaselineDiff[];
  graphDiff: MerkleContractDagDiff;
  driftSummary: ReleaseDriftSummary;
}

export interface BaselineDiff {
  field: string;
  added: string[];
  removed: string[];
}

export type BaselineSurfaceStatus = "tracked" | "not_tracked";
export type DriftStatus = "changed" | "unchanged" | "not_tracked";

export interface ReleaseBaselineSummary {
  schemaVersion: 1;
  contractGraph: BaselineSurfaceSummary;
  staticCollector: BaselineSurfaceSummary;
  policy: BaselineSurfaceSummary;
}

export interface BaselineSurfaceSummary {
  status: BaselineSurfaceStatus;
  summary: string;
  details: Record<string, unknown>;
}

export interface ReleaseDriftSummary {
  schemaVersion: 1;
  overallStatus: DriftStatus;
  contractGraph: DriftSurfaceSummary;
  staticCollector: DriftSurfaceSummary;
  policy: DriftSurfaceSummary;
}

export interface DriftSurfaceSummary {
  kind: "contract_graph_drift" | "static_collector_drift" | "policy_drift";
  status: DriftStatus;
  summary: string;
  details: Record<string, unknown>;
}

interface PolicySnapshot {
  policy_kind: "verify-policy";
  path: string;
  available: boolean;
  content_hash?: string;
  facts_contract?: string;
  rule_ids: string[];
}

type BaselineDocument = Record<string, unknown>;

const TRACKED_ARRAY_FIELDS = [
  "requirement_ids",
  "contexts",
  "contracts",
  "scenarios",
  "slices",
  "assets",
] as const;

const DEFAULT_POLICY_PATH = ".spec/policy.yaml";

export function createReleaseSnapshot(options: ReleaseSnapshotOptions): ReleaseSnapshotResult {
  const root = path.resolve(options.root);
  const version = normalizeVersion(options.version);
  const currentBaselinePath = resolveCurrentBaselinePath(root);
  if (!fs.existsSync(currentBaselinePath)) {
    throw new Error(`Current baseline does not exist: ${currentBaselinePath}`);
  }

  const currentBaseline = readYamlObject(currentBaselinePath);
  const releaseBaselinePath = resolveReleaseBaselinePath(root, version);
  const releaseSummaryPath = resolveReleaseSummaryPath(root, version);
  const exists = fs.existsSync(releaseBaselinePath);
  if (exists && options.force !== true) {
    const existingBaseline = readYamlObject(releaseBaselinePath);
    const existingGraph = readContractGraphRef(root, existingBaseline);
    const existingStaticCollector = readStaticCollectorManifestRef(root, existingBaseline);
    return {
      root: normalizePath(root),
      version,
      created: false,
      overwritten: false,
      currentBaselinePath: normalizePath(currentBaselinePath),
      releaseBaselinePath: normalizePath(releaseBaselinePath),
      releaseSummaryPath: normalizePath(releaseSummaryPath),
      contractGraphPath: existingGraph.graphPath,
      contractGraphLockPath: existingGraph.lockPath,
      contractGraphRootHash: existingGraph.lock?.root_hash,
      staticCollectorManifestPath: existingStaticCollector.manifestPath,
      baselineId: stringValue(currentBaseline.baseline_id),
      projectId: stringValue(currentBaseline.project_id),
      counts: countBaseline(currentBaseline),
      summary: summarizeReleaseBaseline(existingBaseline),
    };
  }

  const staticCollectorManifest = collectStaticImplementationFacts(root, { generatedAt: options.frozenAt });
  const staticCollectorManifestPath = writeStaticCollectorManifest(
    root,
    staticCollectorManifest,
    resolveReleaseStaticCollectorManifestRelativePath(version),
  );
  const baseGraph = loadContractGraph(root);
  const graph = baseGraph
    ? augmentContractGraphWithStaticFacts(baseGraph, staticCollectorManifest.facts)
    : undefined;
  const graphArtifacts = graph
    ? writeMerkleContractDagArtifacts({
        root,
        version,
        graph,
        generatedAt: options.frozenAt,
      })
    : undefined;

  const releaseBaseline = {
    release_version: version,
    frozen_at: options.frozenAt ?? new Date().toISOString(),
    source_baseline: ".spec/baselines/current.yaml",
    ...currentBaseline,
    ...(graphArtifacts
      ? {
          contract_graph: {
            graph_kind: "merkle-contract-dag",
            graph_path: normalizePath(path.relative(root, graphArtifacts.graphPath)),
            lock_path: normalizePath(path.relative(root, graphArtifacts.lockPath)),
            root_hash: graphArtifacts.lock.root_hash,
            graph_hash: graphArtifacts.lock.graph_hash,
            node_counts: graphArtifacts.lock.node_counts,
            edge_counts: graphArtifacts.lock.edge_counts,
            critical_node_ids: graphArtifacts.lock.critical_node_ids,
          },
        }
      : {}),
    static_collector_manifest: {
      manifest_kind: staticCollectorManifest.manifest_kind,
      manifest_path: normalizePath(path.relative(root, staticCollectorManifestPath)),
      fact_count: staticCollectorManifest.facts.length,
      unresolved_surface_count: staticCollectorManifest.unresolved_surfaces.length,
    },
    policy_snapshot: snapshotPolicy(root, currentBaseline),
  };
  const summary = summarizeReleaseBaseline(releaseBaseline);

  fs.mkdirSync(path.dirname(releaseBaselinePath), { recursive: true });
  fs.writeFileSync(releaseBaselinePath, dumpYaml(releaseBaseline), "utf-8");
  fs.mkdirSync(path.dirname(releaseSummaryPath), { recursive: true });
  fs.writeFileSync(releaseSummaryPath, renderReleaseSummary(root, releaseBaseline, summary), "utf-8");

  return {
    root: normalizePath(root),
    version,
    created: !exists,
    overwritten: exists,
    currentBaselinePath: normalizePath(currentBaselinePath),
    releaseBaselinePath: normalizePath(releaseBaselinePath),
    releaseSummaryPath: normalizePath(releaseSummaryPath),
    contractGraphPath: graphArtifacts?.graphPath,
    contractGraphLockPath: graphArtifacts?.lockPath,
    contractGraphRootHash: graphArtifacts?.lock.root_hash,
    staticCollectorManifestPath,
    baselineId: stringValue(currentBaseline.baseline_id),
    projectId: stringValue(currentBaseline.project_id),
    counts: countBaseline(currentBaseline),
    summary,
  };
}

export function compareReleaseBaselines(options: ReleaseCompareOptions): ReleaseCompareResult {
  const root = path.resolve(options.root);
  const fromPath = resolveBaselineRef(root, options.from);
  const toPath = resolveBaselineRef(root, options.to);
  const fromBaseline = readYamlObject(fromPath);
  const toBaseline = readYamlObject(toPath);
  const diffs = diffBaselines(fromBaseline, toBaseline);
  const fromGraph = resolveComparableGraph(root, options.from, fromBaseline);
  const toGraph = resolveComparableGraph(root, options.to, toBaseline);
  const graphDiff = diffMerkleContractDag({
    fromGraph: fromGraph.graph,
    toGraph: toGraph.graph,
    fromLock: fromGraph.lock,
    toLock: toGraph.lock,
  });
  const driftSummary = summarizeReleaseDrift({
    graphDiff,
    fromStaticCollector: resolveComparableStaticCollector(root, options.from, fromBaseline),
    toStaticCollector: resolveComparableStaticCollector(root, options.to, toBaseline),
    fromPolicy: resolveComparablePolicy(root, options.from, fromBaseline),
    toPolicy: resolveComparablePolicy(root, options.to, toBaseline),
  });
  const compareReportDir = resolveCompareReportDir(root, options.from, options.to);
  const compareReportJsonPath = path.join(compareReportDir, "compare-report.json");
  const compareReportMarkdownPath = path.join(compareReportDir, "compare-report.md");
  const result: ReleaseCompareResult = {
    root: normalizePath(root),
    from: options.from,
    to: options.to,
    fromPath: normalizePath(fromPath),
    toPath: normalizePath(toPath),
    compareReportJsonPath: normalizePath(compareReportJsonPath),
    compareReportMarkdownPath: normalizePath(compareReportMarkdownPath),
    identical:
      diffs.every((diff) => diff.added.length === 0 && diff.removed.length === 0) &&
      graphDiff.identical &&
      driftSummary.overallStatus !== "changed",
    diffs,
    graphDiff,
    driftSummary,
  };

  fs.mkdirSync(compareReportDir, { recursive: true });
  fs.writeFileSync(compareReportJsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf-8");
  fs.writeFileSync(compareReportMarkdownPath, renderReleaseCompareText(result), "utf-8");
  return result;
}

export function renderReleaseSnapshotText(result: ReleaseSnapshotResult): string {
  const lines = [
    result.overwritten
      ? `Release baseline ${result.version} overwritten.`
      : result.created
        ? `Release baseline ${result.version} created.`
        : `Release baseline ${result.version} already exists.`,
    `Current baseline: ${result.currentBaselinePath}`,
    `Release baseline: ${result.releaseBaselinePath}`,
    `Release summary: ${result.releaseSummaryPath}`,
    ...(result.contractGraphPath
      ? [
          `Contract graph: ${result.contractGraphPath}`,
          `Contract graph lock: ${result.contractGraphLockPath}`,
          `Contract graph root hash: ${result.contractGraphRootHash}`,
        ]
      : []),
    ...(result.staticCollectorManifestPath
      ? [`Static collector manifest: ${result.staticCollectorManifestPath}`]
      : []),
    "",
    "Summary:",
    `- Contract graph: ${result.summary.contractGraph.summary}`,
    `- Static collector: ${result.summary.staticCollector.summary}`,
    `- Policy: ${result.summary.policy.summary}`,
    "",
    "Counts:",
    `- requirements: ${result.counts.requirementIds}`,
    `- contexts: ${result.counts.contexts}`,
    `- contracts: ${result.counts.contracts}`,
    `- scenarios: ${result.counts.scenarios}`,
    `- slices: ${result.counts.slices}`,
    `- assets: ${result.counts.assets}`,
  ];

  if (!result.created && !result.overwritten) {
    lines.push("", "Use --force to overwrite the existing release baseline.");
  }

  return lines.join("\n");
}

export function renderReleaseCompareText(result: ReleaseCompareResult): string {
  const lines = [
    `Baseline comparison: ${result.from} -> ${result.to}`,
    `From: ${result.fromPath}`,
    `To: ${result.toPath}`,
    `JSON report: ${result.compareReportJsonPath}`,
    `Markdown report: ${result.compareReportMarkdownPath}`,
    `Identical: ${result.identical ? "yes" : "no"}`,
  ];

  lines.push("", "## Contract Graph");
  lines.push(`Merkle available: ${result.graphDiff.available ? "yes" : "no"}`);
  lines.push(`Merkle identical: ${result.graphDiff.identical ? "yes" : "no"}`);
  if (result.graphDiff.fromRootHash || result.graphDiff.toRootHash) {
    lines.push(`From root hash: ${result.graphDiff.fromRootHash ?? "missing"}`);
    lines.push(`To root hash: ${result.graphDiff.toRootHash ?? "missing"}`);
  }
  lines.push(`Added nodes: ${result.graphDiff.addedNodes.length}`);
  lines.push(`Removed nodes: ${result.graphDiff.removedNodes.length}`);
  lines.push(`Changed node content: ${result.graphDiff.changedNodeContent.length}`);
  lines.push(`Added edges: ${result.graphDiff.addedEdges.length}`);
  lines.push(`Removed edges: ${result.graphDiff.removedEdges.length}`);
  lines.push(`Affected closure nodes: ${result.graphDiff.affectedClosureNodes.length}`);

  lines.push("", "## Drift Summary");
  lines.push(`Overall: ${result.driftSummary.overallStatus}`);
  lines.push(`Contract graph drift: ${result.driftSummary.contractGraph.status} - ${result.driftSummary.contractGraph.summary}`);
  lines.push(`Static collector drift: ${result.driftSummary.staticCollector.status} - ${result.driftSummary.staticCollector.summary}`);
  lines.push(`Policy drift: ${result.driftSummary.policy.status} - ${result.driftSummary.policy.summary}`);

  if (result.graphDiff.changedNodeContent.length > 0) {
    lines.push("", "Changed node content:");
    lines.push(...result.graphDiff.changedNodeContent.map((value) => `- ${value}`));
  }
  if (result.graphDiff.affectedClosureNodes.length > 0) {
    lines.push("", "Affected closure nodes:");
    lines.push(...result.graphDiff.affectedClosureNodes.map((value) => `- ${value}`));
  }
  if (result.graphDiff.coverageChanges.length > 0) {
    lines.push("", "Coverage changes:");
    lines.push(...result.graphDiff.coverageChanges.map((change) => `- ${change.requirement_id}`));
  }
  if (result.graphDiff.warnings.length > 0) {
    lines.push("", "Merkle warnings:");
    lines.push(...result.graphDiff.warnings.map((warning) => `- ${warning}`));
  }

  for (const diff of result.diffs) {
    if (diff.added.length === 0 && diff.removed.length === 0) {
      continue;
    }
    lines.push("", `## ${diff.field}`);
    if (diff.added.length > 0) {
      lines.push("Added:");
      lines.push(...diff.added.map((value) => `- ${value}`));
    }
    if (diff.removed.length > 0) {
      lines.push("Removed:");
      lines.push(...diff.removed.map((value) => `- ${value}`));
    }
  }

  return lines.join("\n");
}

function resolveCurrentBaselinePath(root: string): string {
  return path.join(root, ".spec", "baselines", "current.yaml");
}

function resolveReleaseBaselinePath(root: string, version: string): string {
  return path.join(root, ".spec", "baselines", "releases", `${version}.yaml`);
}

function resolveReleaseSummaryPath(root: string, version: string): string {
  return path.join(root, ".spec", "releases", version, "release-summary.md");
}

function resolveReleaseGraphPath(root: string, version: string): string {
  return path.join(root, ".spec", "releases", version, "contract-graph.json");
}

function resolveReleaseGraphLockPath(root: string, version: string): string {
  return path.join(root, ".spec", "releases", version, "contract-graph.lock");
}

function resolveReleaseStaticCollectorManifestRelativePath(version: string): string {
  return normalizePath(path.join(".spec", "releases", version, "static-collector-manifest.json"));
}

function resolveReleaseStaticCollectorManifestPath(root: string, version: string): string {
  return path.join(root, ".spec", "releases", version, "static-collector-manifest.json");
}

function resolveCompareReportDir(root: string, from: string, to: string): string {
  return path.join(root, ".spec", "releases", "compare", `${slugifyRef(from)}-to-${slugifyRef(to)}`);
}

function resolveBaselineRef(root: string, ref: string): string {
  if (ref === "current") {
    return resolveCurrentBaselinePath(root);
  }
  const candidate = path.isAbsolute(ref) ? ref : path.join(root, ref);
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  return resolveReleaseBaselinePath(root, normalizeVersion(ref));
}

function readYamlObject(filePath: string): BaselineDocument {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Baseline does not exist: ${filePath}`);
  }
  const parsed = yaml.load(fs.readFileSync(filePath, "utf-8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Baseline must be a YAML object: ${filePath}`);
  }
  return parsed as BaselineDocument;
}

function diffBaselines(fromBaseline: BaselineDocument, toBaseline: BaselineDocument): BaselineDiff[] {
  return TRACKED_ARRAY_FIELDS.map((field) => {
    const fromValues = stringArray(fromBaseline[field]);
    const toValues = stringArray(toBaseline[field]);
    return {
      field,
      added: toValues.filter((value) => !fromValues.includes(value)),
      removed: fromValues.filter((value) => !toValues.includes(value)),
    };
  });
}

function resolveComparableGraph(
  root: string,
  ref: string,
  baseline: BaselineDocument,
): {
  graph?: ReturnType<typeof loadContractGraphFile>;
  lock?: MerkleContractDagLock;
  graphPath?: string;
  lockPath?: string;
} {
  if (ref === "current") {
    const baseGraph = loadContractGraph(root);
    const manifest = collectStaticImplementationFacts(root);
    const graph = baseGraph ? augmentContractGraphWithStaticFacts(baseGraph, manifest.facts) : undefined;
    return {
      graph,
      lock: graph
        ? buildMerkleContractDagLock({
            graph,
            releaseVersion: "current",
            sourceGraphPath: ".spec/evidence/contract-graph.json",
          })
        : undefined,
      graphPath: graph ? ".spec/evidence/contract-graph.json" : undefined,
    };
  }
  return readContractGraphRef(root, baseline, ref);
}

function readStaticCollectorManifestRef(
  root: string,
  baseline: BaselineDocument,
  versionRef?: string,
): {
  manifestPath?: string;
} {
  const manifestRecord = isRecord(baseline.static_collector_manifest) ? baseline.static_collector_manifest : {};
  const versionValue = stringValue(baseline.release_version) ?? versionRef;
  const version = versionValue ? normalizeVersion(versionValue) : undefined;
  const manifestPath = resolveArtifactPath(
    root,
    stringValue(manifestRecord.manifest_path),
    version ? resolveReleaseStaticCollectorManifestPath(root, version) : undefined,
  );

  return {
    manifestPath: manifestPath ? normalizePath(manifestPath) : undefined,
  };
}

function resolveComparableStaticCollector(
  root: string,
  ref: string,
  baseline: BaselineDocument,
): ComparableStaticCollector {
  if (ref === "current") {
    const manifest = collectStaticImplementationFacts(root);
    return comparableStaticCollectorFromManifest(manifest, ".spec/evidence/static-collector-manifest.json");
  }

  const manifestRef = readStaticCollectorManifestRef(root, baseline, ref);
  if (manifestRef.manifestPath) {
    const manifest = readJsonObject(manifestRef.manifestPath);
    if (manifest) {
      return comparableStaticCollectorFromManifest(manifest, manifestRef.manifestPath);
    }
  }

  const manifestRecord = isRecord(baseline.static_collector_manifest) ? baseline.static_collector_manifest : {};
  return {
    tracked: Object.keys(manifestRecord).length > 0,
    path: stringValue(manifestRecord.manifest_path),
    factCount: numberValue(manifestRecord.fact_count),
    unresolvedSurfaceCount: numberValue(manifestRecord.unresolved_surface_count),
    signature: stableHash({
      manifest_kind: stringValue(manifestRecord.manifest_kind),
      fact_count: numberValue(manifestRecord.fact_count),
      unresolved_surface_count: numberValue(manifestRecord.unresolved_surface_count),
    }),
  };
}

function comparableStaticCollectorFromManifest(manifest: unknown, manifestPath: string): ComparableStaticCollector {
  const record = isRecord(manifest) ? manifest : {};
  const facts = arrayValue(record.facts);
  const unresolvedSurfaces = arrayValue(record.unresolved_surfaces);
  return {
    tracked: true,
    path: normalizePath(manifestPath),
    factCount: facts.length,
    unresolvedSurfaceCount: unresolvedSurfaces.length,
    signature: stableHash({
      schema_version: record.schema_version,
      manifest_kind: record.manifest_kind,
      collectors: record.collectors,
      facts,
      unresolved_surfaces: unresolvedSurfaces,
      warnings: record.warnings,
    }),
  };
}

function resolveComparablePolicy(root: string, ref: string, baseline: BaselineDocument): ComparablePolicy {
  if (ref === "current") {
    return readPolicySnapshotFromDisk(root, policyPathFromBaseline(baseline));
  }

  const policySnapshot = isRecord(baseline.policy_snapshot) ? baseline.policy_snapshot : undefined;
  if (policySnapshot) {
    return {
      tracked: Boolean(policySnapshot.available) || Boolean(policySnapshot.content_hash) || stringArray(policySnapshot.rule_ids).length > 0,
      path: stringValue(policySnapshot.path),
      contentHash: stringValue(policySnapshot.content_hash),
      factsContract: stringValue(policySnapshot.facts_contract),
      ruleIds: stringArray(policySnapshot.rule_ids),
    };
  }

  const policyRecord = isRecord(baseline.verify_policy) ? baseline.verify_policy : {};
  return {
    tracked: Object.keys(policyRecord).length > 0,
    path: stringValue(policyRecord.path),
    factsContract: stringValue(policyRecord.facts_contract),
    ruleIds: stringArray(policyRecord.rule_ids),
  };
}

function readContractGraphRef(
  root: string,
  baseline: BaselineDocument,
  versionRef?: string,
): {
  graph?: ReturnType<typeof loadContractGraphFile>;
  lock?: MerkleContractDagLock;
  graphPath?: string;
  lockPath?: string;
} {
  const graphRecord = isRecord(baseline.contract_graph) ? baseline.contract_graph : {};
  const versionValue = stringValue(baseline.release_version) ?? versionRef;
  const version = versionValue ? normalizeVersion(versionValue) : undefined;
  const graphPath = resolveArtifactPath(
    root,
    stringValue(graphRecord.graph_path),
    version ? resolveReleaseGraphPath(root, version) : undefined,
  );
  const lockPath = resolveArtifactPath(
    root,
    stringValue(graphRecord.lock_path),
    version ? resolveReleaseGraphLockPath(root, version) : undefined,
  );

  return {
    graph: graphPath ? loadContractGraphFile(graphPath) : undefined,
    lock: lockPath ? readMerkleContractDagLock(lockPath) : undefined,
    graphPath: graphPath ? normalizePath(graphPath) : undefined,
    lockPath: lockPath ? normalizePath(lockPath) : undefined,
  };
}

interface ComparableStaticCollector {
  tracked: boolean;
  path?: string;
  signature?: string;
  factCount?: number;
  unresolvedSurfaceCount?: number;
}

interface ComparablePolicy {
  tracked: boolean;
  path?: string;
  contentHash?: string;
  factsContract?: string;
  ruleIds: string[];
}

function summarizeReleaseBaseline(baseline: BaselineDocument): ReleaseBaselineSummary {
  const graphRecord = isRecord(baseline.contract_graph) ? baseline.contract_graph : undefined;
  const staticRecord = isRecord(baseline.static_collector_manifest) ? baseline.static_collector_manifest : undefined;
  const policyRecord = isRecord(baseline.policy_snapshot)
    ? baseline.policy_snapshot
    : isRecord(baseline.verify_policy)
      ? baseline.verify_policy
      : undefined;
  const policyAvailable = policyRecord ? Boolean(policyRecord.available ?? true) : false;
  const policyRuleIds = stringArray(policyRecord?.rule_ids);

  return {
    schemaVersion: 1,
    contractGraph: graphRecord
      ? {
          status: "tracked",
          summary: `tracked (${String(graphRecord.root_hash ?? "missing root hash")})`,
          details: {
            graph_kind: stringValue(graphRecord.graph_kind),
            graph_path: stringValue(graphRecord.graph_path),
            lock_path: stringValue(graphRecord.lock_path),
            root_hash: stringValue(graphRecord.root_hash),
            node_counts: isRecord(graphRecord.node_counts) ? graphRecord.node_counts : {},
            edge_counts: isRecord(graphRecord.edge_counts) ? graphRecord.edge_counts : {},
          },
        }
      : {
          status: "not_tracked",
          summary: "not tracked",
          details: {},
        },
    staticCollector: staticRecord
      ? {
          status: "tracked",
          summary: `tracked (${Number(staticRecord.fact_count ?? 0)} facts, ${Number(staticRecord.unresolved_surface_count ?? 0)} unresolved)`,
          details: {
            manifest_kind: stringValue(staticRecord.manifest_kind),
            manifest_path: stringValue(staticRecord.manifest_path),
            fact_count: numberValue(staticRecord.fact_count) ?? 0,
            unresolved_surface_count: numberValue(staticRecord.unresolved_surface_count) ?? 0,
          },
        }
      : {
          status: "not_tracked",
          summary: "not tracked",
          details: {},
        },
    policy: policyRecord && policyAvailable
      ? {
          status: "tracked",
          summary: `tracked (${policyRuleIds.length} rules, facts contract ${stringValue(policyRecord.facts_contract) ?? "unknown"})`,
          details: {
            path: stringValue(policyRecord.path),
            facts_contract: stringValue(policyRecord.facts_contract),
            rule_ids: policyRuleIds,
            content_hash: stringValue(policyRecord.content_hash),
          },
        }
      : {
          status: "not_tracked",
          summary: "not tracked",
          details: policyRecord ? { path: stringValue(policyRecord.path), available: false } : {},
        },
  };
}

function summarizeReleaseDrift(input: {
  graphDiff: MerkleContractDagDiff;
  fromStaticCollector: ComparableStaticCollector;
  toStaticCollector: ComparableStaticCollector;
  fromPolicy: ComparablePolicy;
  toPolicy: ComparablePolicy;
}): ReleaseDriftSummary {
  const contractGraph = summarizeContractGraphDrift(input.graphDiff);
  const staticCollector = summarizeStaticCollectorDrift(input.fromStaticCollector, input.toStaticCollector);
  const policy = summarizePolicyDrift(input.fromPolicy, input.toPolicy);
  const statuses = [contractGraph.status, staticCollector.status, policy.status];
  const overallStatus: DriftStatus = statuses.includes("changed")
    ? "changed"
    : statuses.every((status) => status === "unchanged")
      ? "unchanged"
      : "not_tracked";

  return {
    schemaVersion: 1,
    overallStatus,
    contractGraph,
    staticCollector,
    policy,
  };
}

function summarizeContractGraphDrift(graphDiff: MerkleContractDagDiff): DriftSurfaceSummary {
  if (!graphDiff.available) {
    return {
      kind: "contract_graph_drift",
      status: "not_tracked",
      summary: "Contract graph artifacts are missing for one or both baselines.",
      details: {
        warnings: graphDiff.warnings,
        from_root_hash: graphDiff.fromRootHash,
        to_root_hash: graphDiff.toRootHash,
      },
    };
  }

  const changedCount = graphDiff.addedNodes.length +
    graphDiff.removedNodes.length +
    graphDiff.changedNodeContent.length +
    graphDiff.addedEdges.length +
    graphDiff.removedEdges.length +
    graphDiff.changedEdges.length +
    graphDiff.affectedClosureNodes.length +
    graphDiff.coverageChanges.length;
  return {
    kind: "contract_graph_drift",
    status: graphDiff.identical ? "unchanged" : "changed",
    summary: graphDiff.identical
      ? "Merkle Contract DAG root hash is unchanged."
      : `${changedCount} graph signal(s) changed across nodes, edges, closures, or coverage.`,
    details: {
      from_root_hash: graphDiff.fromRootHash,
      to_root_hash: graphDiff.toRootHash,
      added_nodes: graphDiff.addedNodes.length,
      removed_nodes: graphDiff.removedNodes.length,
      changed_node_content: graphDiff.changedNodeContent.length,
      added_edges: graphDiff.addedEdges.length,
      removed_edges: graphDiff.removedEdges.length,
      changed_edges: graphDiff.changedEdges.length,
      affected_closure_nodes: graphDiff.affectedClosureNodes.length,
      coverage_changes: graphDiff.coverageChanges.length,
      warnings: graphDiff.warnings,
    },
  };
}

function summarizeStaticCollectorDrift(
  fromStaticCollector: ComparableStaticCollector,
  toStaticCollector: ComparableStaticCollector,
): DriftSurfaceSummary {
  if (!fromStaticCollector.tracked && !toStaticCollector.tracked) {
    return {
      kind: "static_collector_drift",
      status: "not_tracked",
      summary: "Static collector manifests are not tracked for either baseline.",
      details: {},
    };
  }

  const changed = fromStaticCollector.signature !== toStaticCollector.signature;
  return {
    kind: "static_collector_drift",
    status: changed ? "changed" : "unchanged",
    summary: changed
      ? "Static implementation facts changed."
      : "Static implementation facts are unchanged.",
    details: {
      from_path: fromStaticCollector.path,
      to_path: toStaticCollector.path,
      from_fact_count: fromStaticCollector.factCount,
      to_fact_count: toStaticCollector.factCount,
      from_unresolved_surface_count: fromStaticCollector.unresolvedSurfaceCount,
      to_unresolved_surface_count: toStaticCollector.unresolvedSurfaceCount,
    },
  };
}

function summarizePolicyDrift(fromPolicy: ComparablePolicy, toPolicy: ComparablePolicy): DriftSurfaceSummary {
  if (!fromPolicy.tracked && !toPolicy.tracked) {
    return {
      kind: "policy_drift",
      status: "not_tracked",
      summary: "Verify policy is not tracked for either baseline.",
      details: {},
    };
  }

  const fromSignature = policySignature(fromPolicy);
  const toSignature = policySignature(toPolicy);
  const changed = fromSignature !== toSignature;
  return {
    kind: "policy_drift",
    status: changed ? "changed" : "unchanged",
    summary: changed
      ? "Verify policy path, content hash, facts contract, or rule ids changed."
      : "Verify policy path, facts contract, and rule ids are unchanged.",
    details: {
      from_path: fromPolicy.path,
      to_path: toPolicy.path,
      from_facts_contract: fromPolicy.factsContract,
      to_facts_contract: toPolicy.factsContract,
      from_rule_ids: fromPolicy.ruleIds,
      to_rule_ids: toPolicy.ruleIds,
      from_content_hash: fromPolicy.contentHash,
      to_content_hash: toPolicy.contentHash,
    },
  };
}

function policySignature(policy: ComparablePolicy): string {
  return stableHash({
    tracked: policy.tracked,
    path: policy.path,
    content_hash: policy.contentHash,
    facts_contract: policy.factsContract,
    rule_ids: policy.ruleIds,
  });
}

function snapshotPolicy(root: string, baseline: BaselineDocument): PolicySnapshot {
  const snapshot = readPolicySnapshotFromDisk(root, policyPathFromBaseline(baseline));
  return {
    policy_kind: "verify-policy",
    path: snapshot.path ?? DEFAULT_POLICY_PATH,
    available: snapshot.tracked,
    ...(snapshot.contentHash ? { content_hash: snapshot.contentHash } : {}),
    ...(snapshot.factsContract ? { facts_contract: snapshot.factsContract } : {}),
    rule_ids: snapshot.ruleIds,
  };
}

function readPolicySnapshotFromDisk(root: string, policyPath: string): ComparablePolicy {
  const resolvedPath = path.isAbsolute(policyPath) ? policyPath : path.join(root, policyPath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      tracked: false,
      path: normalizePath(path.relative(root, resolvedPath) || policyPath),
      ruleIds: [],
    };
  }

  const content = fs.readFileSync(resolvedPath, "utf-8");
  const parsed = yaml.load(content);
  const policy = isRecord(parsed) ? parsed : {};
  const requires = isRecord(policy.requires) ? policy.requires : {};
  return {
    tracked: true,
    path: normalizePath(path.relative(root, resolvedPath) || policyPath),
    contentHash: stableHash(content),
    factsContract: stringValue(requires.facts_contract),
    ruleIds: arrayValue(policy.rules)
      .map((rule) => isRecord(rule) ? stringValue(rule.id) : undefined)
      .filter((ruleId): ruleId is string => Boolean(ruleId))
      .sort((left, right) => left.localeCompare(right)),
  };
}

function policyPathFromBaseline(baseline: BaselineDocument): string {
  const policySnapshot = isRecord(baseline.policy_snapshot) ? baseline.policy_snapshot : {};
  const verifyPolicy = isRecord(baseline.verify_policy) ? baseline.verify_policy : {};
  return stringValue(policySnapshot.path) ?? stringValue(verifyPolicy.path) ?? DEFAULT_POLICY_PATH;
}

function resolveArtifactPath(root: string, recordedPath: string | undefined, fallbackPath: string | undefined): string | undefined {
  const candidates = [
    recordedPath ? (path.isAbsolute(recordedPath) ? recordedPath : path.join(root, recordedPath)) : undefined,
    fallbackPath,
  ].filter((entry): entry is string => typeof entry === "string");
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function countBaseline(baseline: BaselineDocument): BaselineCounts {
  return {
    requirementIds: stringArray(baseline.requirement_ids).length,
    contexts: stringArray(baseline.contexts).length,
    contracts: stringArray(baseline.contracts).length,
    scenarios: stringArray(baseline.scenarios).length,
    slices: stringArray(baseline.slices).length,
    assets: stringArray(baseline.assets).length,
  };
}

function renderReleaseSummary(root: string, baseline: BaselineDocument, summary = summarizeReleaseBaseline(baseline)): string {
  const version = stringValue(baseline.release_version) ?? "unknown";
  const counts = countBaseline(baseline);
  const specDebt = summarizeGreenfieldSpecDebt(root);
  return [
    `# Release ${version} Baseline`,
    "",
    `Frozen at: ${stringValue(baseline.frozen_at) ?? "unknown"}`,
    `Project: ${stringValue(baseline.project_name) ?? stringValue(baseline.project_id) ?? "unknown"}`,
    `Source baseline: ${stringValue(baseline.source_baseline) ?? ".spec/baselines/current.yaml"}`,
    "",
    "## Counts",
    "",
    `- Requirements: ${counts.requirementIds}`,
    `- Contexts: ${counts.contexts}`,
    `- Contracts: ${counts.contracts}`,
    `- Scenarios: ${counts.scenarios}`,
    `- Slices: ${counts.slices}`,
    `- Assets: ${counts.assets}`,
    "",
    "## Baseline Summary",
    "",
    `- Contract graph: ${summary.contractGraph.summary}`,
    `- Static collector: ${summary.staticCollector.summary}`,
    `- Policy: ${summary.policy.summary}`,
    "",
    "## Spec Debt",
    "",
    `- Open: ${specDebt.open}`,
    `- Expired: ${specDebt.expired}`,
    `- Repaid: ${specDebt.repaid}`,
    `- Cancelled: ${specDebt.cancelled}`,
    "",
    ...(specDebt.records.length > 0
      ? specDebt.records.map((record) => `- \`${record.id}\` (${record.status}, ${record.kind}): ${record.reason}`)
      : ["- None recorded."]),
    "",
    "## Slices",
    "",
    ...renderList(stringArray(baseline.slices)),
    "",
    "## Contract Graph",
    "",
    ...(isRecord(baseline.contract_graph)
      ? [
          `- Graph: \`${stringValue(baseline.contract_graph.graph_path) ?? "missing"}\``,
          `- Lock: \`${stringValue(baseline.contract_graph.lock_path) ?? "missing"}\``,
          `- Root hash: \`${stringValue(baseline.contract_graph.root_hash) ?? "missing"}\``,
          `- Graph hash: \`${stringValue(baseline.contract_graph.graph_hash) ?? "missing"}\``,
        ]
      : ["- No Contract Graph snapshot recorded."]),
    "",
    "## Static Collector",
    "",
    ...(isRecord(baseline.static_collector_manifest)
      ? [
          `- Manifest: \`${stringValue(baseline.static_collector_manifest.manifest_path) ?? "missing"}\``,
          `- Facts: \`${String(baseline.static_collector_manifest.fact_count ?? "0")}\``,
          `- Unresolved surfaces: \`${String(baseline.static_collector_manifest.unresolved_surface_count ?? "0")}\``,
        ]
      : ["- No static collector manifest recorded."]),
    "",
  ].join("\n");
}

function renderList(values: string[]): string[] {
  return values.length > 0 ? values.map((value) => `- \`${value}\``) : ["- None recorded."];
}

function normalizeVersion(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error(`Invalid release version: ${value}`);
  }
  return normalized;
}

function slugifyRef(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ref";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").sort()
    : [];
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dumpYaml(value: unknown): string {
  return yaml.dump(value, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
}

function readJsonObject(filePath: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function stableHash(value: unknown): string {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortObject(value));
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortObject(entry)]),
    );
  }
  return value;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
