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
}

export interface BaselineDiff {
  field: string;
  added: string[];
  removed: string[];
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
      staticCollectorManifestPath: readStaticCollectorManifestRef(root, existingBaseline).manifestPath,
      baselineId: stringValue(currentBaseline.baseline_id),
      projectId: stringValue(currentBaseline.project_id),
      counts: countBaseline(currentBaseline),
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
  };

  fs.mkdirSync(path.dirname(releaseBaselinePath), { recursive: true });
  fs.writeFileSync(releaseBaselinePath, dumpYaml(releaseBaseline), "utf-8");
  fs.mkdirSync(path.dirname(releaseSummaryPath), { recursive: true });
  fs.writeFileSync(releaseSummaryPath, renderReleaseSummary(root, releaseBaseline), "utf-8");

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
    identical: diffs.every((diff) => diff.added.length === 0 && diff.removed.length === 0) && graphDiff.identical,
    diffs,
    graphDiff,
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

function renderReleaseSummary(root: string, baseline: BaselineDocument): string {
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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
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

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
