import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { appendAuditEvent } from "../audit/event-ledger";
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
import { normalizeReplayPaths, type ReplayMetadata } from "../replay/replay-metadata";
import {
  HUMAN_SUMMARY_COMPANION_NOTE,
  renderHumanDecisionSnapshot,
} from "../human-decision-packet";
import { splitDecisionCompanionSections } from "../companion/decision-sections";

export interface ReleaseSnapshotOptions {
  root: string;
  version: string;
  force?: boolean;
  frozenAt?: string;
  actor?: string;
  reason?: string;
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
  replay: ReplayMetadata;
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
  comparedAt?: string;
  actor?: string;
  reason?: string;
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
  comparedAt: string;
  driftTrendJsonPath: string;
  driftTrendMarkdownPath: string;
  driftTrend: ReleaseDriftTrendSummary;
  replay: ReplayMetadata;
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
  requirementEvolution: BaselineSurfaceSummary;
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
  behavior: DriftSurfaceSummary;
  policy: DriftSurfaceSummary;
  requirementEvolution: DriftSurfaceSummary;
}

export interface DriftSurfaceSummary {
  kind:
    | "contract_graph_drift"
    | "static_collector_drift"
    | "behavior_drift"
    | "policy_drift"
    | "requirement_evolution_drift";
  status: DriftStatus;
  summary: string;
  details: Record<string, unknown>;
}

export interface ReleaseDriftTrendSummary {
  schemaVersion: 1;
  generatedAt: string;
  compareCount: number;
  changedCompareCount: number;
  unchangedCompareCount: number;
  notTrackedCompareCount: number;
  latest?: ReleaseDriftTrendEntry;
  surfaces: {
    contractGraph: ReleaseDriftSurfaceTrend;
    staticCollector: ReleaseDriftSurfaceTrend;
    behavior: ReleaseDriftSurfaceTrend;
    policy: ReleaseDriftSurfaceTrend;
  };
  comparisons: ReleaseDriftTrendEntry[];
}

export interface ReleaseDriftTrendEntry {
  from: string;
  to: string;
  comparedAt: string;
  reportPath: string;
  markdownPath?: string;
  identical: boolean;
  overallStatus: DriftStatus;
  contractGraphStatus: DriftStatus;
  staticCollectorStatus: DriftStatus;
  behaviorStatus: DriftStatus;
  policyStatus: DriftStatus;
  contractGraphSummary: string;
  staticCollectorSummary: string;
  behaviorSummary: string;
  policySummary: string;
}

export interface ReleaseDriftSurfaceTrend {
  changed: number;
  unchanged: number;
  notTracked: number;
  latestStatus: DriftStatus | "not_available_yet";
  latestSummary: string;
}

interface PolicySnapshot {
  policy_kind: "verify-policy";
  path: string;
  available: boolean;
  content_hash?: string;
  facts_contract?: string;
  rule_ids: string[];
}

interface RequirementEvolutionStateSnapshot {
  tracked: boolean;
  activeSnapshotId?: string;
  lifecycleRegistryPath?: string;
  lifecycleRegistryVersion?: number;
  lastAdoptedChangeId?: string | null;
  sourceEvolutionPath?: string;
  sourceReviewPath?: string;
  proposedSnapshotPath?: string;
  appliedDeltas: string[];
}

interface SourceEvolutionArtifactSummary {
  sourceEvolutionPath?: string;
  sourceReviewPath?: string;
  addedRequirements: string[];
  modifiedRequirements: string[];
  deprecatedRequirements: string[];
  deprecatedWithoutSuccessor: string[];
  splitMappings: string[];
  mergeMappings: string[];
  replacedMappings: string[];
  reanchoredAnchors: string[];
  totalItems: number;
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
    const result = {
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
      replay: buildReleaseSnapshotReplay({
        root,
        version,
        currentBaselinePath,
        releaseBaselinePath,
        releaseSummaryPath,
        created: false,
        overwritten: false,
        actor: options.actor,
        reason: options.reason,
      }),
    };
    appendAuditEvent(root, {
      type: "release_snapshot",
      actor: options.actor,
      reason: options.reason ?? `Release baseline ${version} already exists.`,
      sourceArtifact: {
        kind: "release-baseline",
        path: releaseBaselinePath,
      },
      affectedContracts: [".spec/baselines/current.yaml", `.spec/baselines/releases/${version}.yaml`],
      details: {
        version,
        created: result.created,
        overwritten: result.overwritten,
        baselineId: result.baselineId,
        projectId: result.projectId,
      },
    });
    return result;
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
    replay: buildReleaseSnapshotReplay({
      root,
      version,
      currentBaselinePath,
      releaseBaselinePath,
      releaseSummaryPath,
      staticCollectorManifestPath,
      contractGraphPath: graphArtifacts?.graphPath,
      contractGraphLockPath: graphArtifacts?.lockPath,
      created: !exists,
      overwritten: exists,
      actor: options.actor,
      reason: options.reason,
    }),
  };
  const summary = summarizeReleaseBaseline(releaseBaseline);

  fs.mkdirSync(path.dirname(releaseBaselinePath), { recursive: true });
  fs.writeFileSync(releaseBaselinePath, dumpYaml(releaseBaseline), "utf-8");
  fs.mkdirSync(path.dirname(releaseSummaryPath), { recursive: true });
  fs.writeFileSync(releaseSummaryPath, renderReleaseSummary(root, releaseBaseline, summary), "utf-8");

  const result = {
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
    replay: releaseBaseline.replay,
  };
  appendAuditEvent(root, {
    type: "release_snapshot",
    actor: options.actor,
    reason: options.reason ?? `Freeze current baseline as release ${version}.`,
    sourceArtifact: {
      kind: "release-baseline",
      path: releaseBaselinePath,
    },
    affectedContracts: [".spec/baselines/current.yaml", `.spec/baselines/releases/${version}.yaml`],
    details: {
      version,
      created: result.created,
      overwritten: result.overwritten,
      baselineId: result.baselineId,
      projectId: result.projectId,
      contractGraphRootHash: result.contractGraphRootHash,
    },
  });
  return result;
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
    root,
    fromBaseline,
    toBaseline,
    diffs,
    graphDiff,
    fromStaticCollector: resolveComparableStaticCollector(root, options.from, fromBaseline),
    toStaticCollector: resolveComparableStaticCollector(root, options.to, toBaseline),
    fromPolicy: resolveComparablePolicy(root, options.from, fromBaseline),
    toPolicy: resolveComparablePolicy(root, options.to, toBaseline),
  });
  const compareReportDir = resolveCompareReportDir(root, options.from, options.to);
  const compareReportJsonPath = path.join(compareReportDir, "compare-report.json");
  const compareReportMarkdownPath = path.join(compareReportDir, "compare-report.md");
  const comparedAt = options.comparedAt ?? new Date().toISOString();
  const driftTrendJsonPath = resolveReleaseDriftTrendJsonPath(root);
  const driftTrendMarkdownPath = resolveReleaseDriftTrendMarkdownPath(root);
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
    comparedAt,
    driftTrendJsonPath: normalizePath(driftTrendJsonPath),
    driftTrendMarkdownPath: normalizePath(driftTrendMarkdownPath),
    driftTrend: createEmptyReleaseDriftTrend(comparedAt),
    replay: buildReleaseCompareReplay({
      root,
      from: options.from,
      to: options.to,
      fromPath,
      toPath,
      compareReportJsonPath,
      compareReportMarkdownPath,
      driftTrendJsonPath,
      driftTrendMarkdownPath,
      actor: options.actor,
      reason: options.reason,
    }),
  };

  fs.mkdirSync(compareReportDir, { recursive: true });
  fs.writeFileSync(compareReportJsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf-8");
  const driftTrend = refreshReleaseDriftTrend(root, comparedAt);
  result.driftTrend = driftTrend;
  fs.writeFileSync(compareReportJsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf-8");
  fs.writeFileSync(compareReportMarkdownPath, renderReleaseCompareText(result), "utf-8");
  appendAuditEvent(root, {
    type: "release_compare",
    actor: options.actor,
    reason: options.reason ?? `Compare release baselines ${options.from} to ${options.to}.`,
    sourceArtifact: {
      kind: "release-compare-report",
      path: compareReportJsonPath,
    },
    affectedContracts: [normalizePath(path.relative(root, fromPath)), normalizePath(path.relative(root, toPath))],
    details: {
      from: options.from,
      to: options.to,
      identical: result.identical,
      driftStatus: result.driftSummary.overallStatus,
      driftTrendPath: normalizePath(path.relative(root, driftTrendJsonPath)),
      diffCount: result.diffs.length,
    },
  });
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
    `- Requirement evolution: ${result.summary.requirementEvolution.summary}`,
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
    `Drift trend JSON: ${result.driftTrendJsonPath}`,
    `Drift trend Markdown: ${result.driftTrendMarkdownPath}`,
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
  lines.push(`Behavior drift: ${result.driftSummary.behavior.status} - ${result.driftSummary.behavior.summary}`);
  lines.push(`Policy drift: ${result.driftSummary.policy.status} - ${result.driftSummary.policy.summary}`);
  lines.push(
    `Requirement evolution drift: ${result.driftSummary.requirementEvolution.status} - ${result.driftSummary.requirementEvolution.summary}`,
  );

  lines.push("", "## Requirement Evolution");
  lines.push(...renderRequirementEvolutionDriftLines(result.driftSummary.requirementEvolution));

  lines.push("", "## Drift Trend");
  lines.push(`Comparisons: ${result.driftTrend.compareCount}`);
  lines.push(`Changed comparisons: ${result.driftTrend.changedCompareCount}`);
  lines.push(`Latest trend status: ${result.driftTrend.latest?.overallStatus ?? "not_available_yet"}`);
  lines.push(`Contract graph changed: ${result.driftTrend.surfaces.contractGraph.changed}`);
  lines.push("", "## Replay / Provenance");
  lines.push(...renderReplayMarkdown(result.replay));
  lines.push(`Static collector changed: ${result.driftTrend.surfaces.staticCollector.changed}`);
  lines.push(`Behavior changed: ${result.driftTrend.surfaces.behavior.changed}`);
  lines.push(`Policy changed: ${result.driftTrend.surfaces.policy.changed}`);

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

function buildReleaseSnapshotReplay(input: {
  root: string;
  version: string;
  currentBaselinePath: string;
  releaseBaselinePath: string;
  releaseSummaryPath: string;
  staticCollectorManifestPath?: string;
  contractGraphPath?: string;
  contractGraphLockPath?: string;
  created: boolean;
  overwritten: boolean;
  actor?: string;
  reason?: string;
}): ReplayMetadata {
  return {
    version: 1,
    replayable: true,
    source: "release_snapshot",
    sourceArtifact: normalizePath(path.relative(input.root, input.currentBaselinePath)),
    inputArtifacts: normalizeReplayPaths(input.root, [
      input.currentBaselinePath,
      path.join(input.root, ".spec", "policy.yaml"),
      input.staticCollectorManifestPath,
      input.contractGraphPath,
      input.contractGraphLockPath,
    ]),
    commands: {
      rerun: [
        "npm run jispec-cli -- release snapshot",
        `--version ${input.version}`,
        "--force",
        input.actor ? `--actor ${quoteShellValue(input.actor)}` : undefined,
        input.reason ? `--reason ${quoteShellValue(input.reason)}` : undefined,
      ].filter((entry): entry is string => Boolean(entry)).join(" "),
      inspectSummary: `type ${normalizePath(path.relative(input.root, input.releaseSummaryPath)).replace(/\//g, "\\")}`,
    },
    actor: input.actor,
    reason: input.reason,
    previousOutcome: input.overwritten ? "overwritten" : input.created ? "created" : "already_exists",
    nextHumanAction: "Review the release summary and compare this baseline against current before promoting release drift decisions.",
  };
}

function buildReleaseCompareReplay(input: {
  root: string;
  from: string;
  to: string;
  fromPath: string;
  toPath: string;
  compareReportJsonPath: string;
  compareReportMarkdownPath: string;
  driftTrendJsonPath: string;
  driftTrendMarkdownPath: string;
  actor?: string;
  reason?: string;
}): ReplayMetadata {
  return {
    version: 1,
    replayable: true,
    source: "release_compare",
    sourceArtifact: normalizePath(path.relative(input.root, input.compareReportJsonPath)),
    inputArtifacts: normalizeReplayPaths(input.root, [
      input.fromPath,
      input.toPath,
      input.driftTrendJsonPath,
      input.driftTrendMarkdownPath,
    ]),
    commands: {
      rerun: [
        "npm run jispec-cli -- release compare",
        `--from ${quoteShellValue(input.from)}`,
        `--to ${quoteShellValue(input.to)}`,
        input.actor ? `--actor ${quoteShellValue(input.actor)}` : undefined,
        input.reason ? `--reason ${quoteShellValue(input.reason)}` : undefined,
      ].filter((entry): entry is string => Boolean(entry)).join(" "),
      inspectMarkdown: `type ${normalizePath(path.relative(input.root, input.compareReportMarkdownPath)).replace(/\//g, "\\")}`,
    },
    actor: input.actor,
    reason: input.reason,
    previousOutcome: `${input.from}->${input.to}`,
    nextHumanAction: "Review drift summary, then fix changed surfaces or record an explicit release governance decision.",
  };
}

export function refreshReleaseDriftTrend(rootInput: string, generatedAt = new Date().toISOString()): ReleaseDriftTrendSummary {
  const root = path.resolve(rootInput);
  const trend = buildReleaseDriftTrend(root, generatedAt);
  const trendJsonPath = resolveReleaseDriftTrendJsonPath(root);
  const trendMarkdownPath = resolveReleaseDriftTrendMarkdownPath(root);
  fs.mkdirSync(path.dirname(trendJsonPath), { recursive: true });
  fs.writeFileSync(trendJsonPath, `${JSON.stringify(trend, null, 2)}\n`, "utf-8");
  fs.writeFileSync(trendMarkdownPath, renderReleaseDriftTrendText(trend), "utf-8");
  return trend;
}

export function renderReleaseDriftTrendText(trend: ReleaseDriftTrendSummary): string {
  const lines = [
    "# Release Drift Trend",
    "",
    `Generated at: ${trend.generatedAt}`,
    `Comparisons: ${trend.compareCount}`,
    `Changed comparisons: ${trend.changedCompareCount}`,
    `Unchanged comparisons: ${trend.unchangedCompareCount}`,
    `Not tracked comparisons: ${trend.notTrackedCompareCount}`,
    "",
    "## Latest",
    "",
    trend.latest
      ? `- ${trend.latest.from} -> ${trend.latest.to}: ${trend.latest.overallStatus} (${trend.latest.reportPath})`
      : "- No release compare reports available.",
    "",
    "## Surfaces",
    "",
    `- Contract graph: ${renderSurfaceTrendLine(trend.surfaces.contractGraph)}`,
    `- Static collector: ${renderSurfaceTrendLine(trend.surfaces.staticCollector)}`,
    `- Behavior: ${renderSurfaceTrendLine(trend.surfaces.behavior)}`,
    `- Policy: ${renderSurfaceTrendLine(trend.surfaces.policy)}`,
    "",
    "## Comparisons",
    "",
    ...(trend.comparisons.length > 0
      ? trend.comparisons.map((entry) =>
          `- ${entry.from} -> ${entry.to}: ${entry.overallStatus} (graph=${entry.contractGraphStatus}, static=${entry.staticCollectorStatus}, behavior=${entry.behaviorStatus}, policy=${entry.policyStatus})`,
        )
      : ["- None recorded."]),
    "",
  ];
  return lines.join("\n");
}

function buildReleaseDriftTrend(root: string, generatedAt: string): ReleaseDriftTrendSummary {
  const comparisons = listReleaseCompareReportPaths(root)
    .map((reportPath) => readReleaseDriftTrendEntry(root, reportPath))
    .filter((entry): entry is ReleaseDriftTrendEntry => Boolean(entry))
    .sort((left, right) => {
      const timeCompare = left.comparedAt.localeCompare(right.comparedAt);
      return timeCompare === 0 ? left.reportPath.localeCompare(right.reportPath) : timeCompare;
    });
  const latest = comparisons.at(-1);

  return {
    schemaVersion: 1,
    generatedAt,
    compareCount: comparisons.length,
    changedCompareCount: comparisons.filter((entry) => entry.overallStatus === "changed").length,
    unchangedCompareCount: comparisons.filter((entry) => entry.overallStatus === "unchanged").length,
    notTrackedCompareCount: comparisons.filter((entry) => entry.overallStatus === "not_tracked").length,
    ...(latest ? { latest } : {}),
    surfaces: {
      contractGraph: summarizeSurfaceTrend(comparisons, "contractGraphStatus", "contractGraphSummary"),
      staticCollector: summarizeSurfaceTrend(comparisons, "staticCollectorStatus", "staticCollectorSummary"),
      behavior: summarizeSurfaceTrend(comparisons, "behaviorStatus", "behaviorSummary"),
      policy: summarizeSurfaceTrend(comparisons, "policyStatus", "policySummary"),
    },
    comparisons,
  };
}

function createEmptyReleaseDriftTrend(generatedAt: string): ReleaseDriftTrendSummary {
  return {
    schemaVersion: 1,
    generatedAt,
    compareCount: 0,
    changedCompareCount: 0,
    unchangedCompareCount: 0,
    notTrackedCompareCount: 0,
    surfaces: {
      contractGraph: emptySurfaceTrend(),
      staticCollector: emptySurfaceTrend(),
      behavior: emptySurfaceTrend(),
      policy: emptySurfaceTrend(),
    },
    comparisons: [],
  };
}

function readReleaseDriftTrendEntry(root: string, reportPath: string): ReleaseDriftTrendEntry | undefined {
  const report = readJsonObject(reportPath);
  if (!report) {
    return undefined;
  }

  const driftSummary = isRecord(report.driftSummary)
    ? report.driftSummary
    : isRecord(report.drift_summary)
      ? report.drift_summary
      : undefined;
  if (!driftSummary) {
    return undefined;
  }

  const contractGraph = isRecord(driftSummary.contractGraph) ? driftSummary.contractGraph : {};
  const staticCollector = isRecord(driftSummary.staticCollector) ? driftSummary.staticCollector : {};
  const behavior = isRecord(driftSummary.behavior) ? driftSummary.behavior : {};
  const policy = isRecord(driftSummary.policy) ? driftSummary.policy : {};
  const stat = fs.statSync(reportPath);

  return {
    from: stringValue(report.from) ?? "unknown",
    to: stringValue(report.to) ?? "unknown",
    comparedAt: stringValue(report.comparedAt) ?? stat.mtime.toISOString(),
    reportPath: normalizePath(path.relative(root, reportPath)),
    markdownPath: stringValue(report.compareReportMarkdownPath)
      ? normalizePath(path.relative(root, absolutePathFromMaybeRelative(root, stringValue(report.compareReportMarkdownPath)!)))
      : undefined,
    identical: report.identical === true,
    overallStatus: driftStatusValue(driftSummary.overallStatus ?? driftSummary.overall_status),
    contractGraphStatus: driftStatusValue(contractGraph.status),
    staticCollectorStatus: driftStatusValue(staticCollector.status),
    behaviorStatus: driftStatusValue(behavior.status),
    policyStatus: driftStatusValue(policy.status),
    contractGraphSummary: stringValue(contractGraph.summary) ?? "not declared",
    staticCollectorSummary: stringValue(staticCollector.summary) ?? "not declared",
    behaviorSummary: stringValue(behavior.summary) ?? "not declared",
    policySummary: stringValue(policy.summary) ?? "not declared",
  };
}

function listReleaseCompareReportPaths(root: string): string[] {
  const compareRoot = path.join(root, ".spec", "releases", "compare");
  if (!fs.existsSync(compareRoot)) {
    return [];
  }

  return fs.readdirSync(compareRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(compareRoot, entry.name, "compare-report.json"))
    .filter((reportPath) => fs.existsSync(reportPath))
    .sort((left, right) => left.localeCompare(right));
}

function summarizeSurfaceTrend(
  comparisons: ReleaseDriftTrendEntry[],
  statusKey: "contractGraphStatus" | "staticCollectorStatus" | "behaviorStatus" | "policyStatus",
  summaryKey: "contractGraphSummary" | "staticCollectorSummary" | "behaviorSummary" | "policySummary",
): ReleaseDriftSurfaceTrend {
  const latest = comparisons.at(-1);
  return {
    changed: comparisons.filter((entry) => entry[statusKey] === "changed").length,
    unchanged: comparisons.filter((entry) => entry[statusKey] === "unchanged").length,
    notTracked: comparisons.filter((entry) => entry[statusKey] === "not_tracked").length,
    latestStatus: latest?.[statusKey] ?? "not_available_yet",
    latestSummary: latest?.[summaryKey] ?? "not available yet",
  };
}

function emptySurfaceTrend(): ReleaseDriftSurfaceTrend {
  return {
    changed: 0,
    unchanged: 0,
    notTracked: 0,
    latestStatus: "not_available_yet",
    latestSummary: "not available yet",
  };
}

function renderSurfaceTrendLine(trend: ReleaseDriftSurfaceTrend): string {
  return `${trend.latestStatus} latest, ${trend.changed} changed, ${trend.unchanged} unchanged, ${trend.notTracked} not tracked`;
}

function driftStatusValue(value: unknown): DriftStatus {
  return value === "changed" || value === "unchanged" || value === "not_tracked" ? value : "not_tracked";
}

function absolutePathFromMaybeRelative(root: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
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

function resolveReleaseDriftTrendJsonPath(root: string): string {
  return path.join(root, ".spec", "releases", "drift-trend.json");
}

function resolveReleaseDriftTrendMarkdownPath(root: string): string {
  return path.join(root, ".spec", "releases", "drift-trend.md");
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

function summarizeRequirementEvolutionState(baseline: BaselineDocument): BaselineSurfaceSummary {
  const state = readRequirementEvolutionState(baseline);
  if (!state.tracked) {
    return {
      status: "not_tracked",
      summary: "not tracked",
      details: {},
    };
  }

  return {
    status: "tracked",
    summary: [
      state.activeSnapshotId ? `snapshot ${state.activeSnapshotId}` : undefined,
      state.lifecycleRegistryVersion !== undefined ? `lifecycle v${state.lifecycleRegistryVersion}` : undefined,
      state.lastAdoptedChangeId ? `last adopted ${state.lastAdoptedChangeId}` : "no adopted change recorded yet",
    ].filter((entry): entry is string => Boolean(entry)).join(", "),
    details: {
      active_snapshot_id: state.activeSnapshotId,
      lifecycle_registry_path: state.lifecycleRegistryPath,
      lifecycle_registry_version: state.lifecycleRegistryVersion,
      last_adopted_change_id: state.lastAdoptedChangeId ?? null,
      source_evolution_path: state.sourceEvolutionPath,
      source_review_path: state.sourceReviewPath,
      proposed_snapshot_path: state.proposedSnapshotPath,
      applied_deltas: state.appliedDeltas,
    },
  };
}

function summarizeRequirementEvolutionDrift(
  root: string,
  fromBaseline: BaselineDocument,
  toBaseline: BaselineDocument,
  diffs: BaselineDiff[],
): DriftSurfaceSummary {
  const fromState = readRequirementEvolutionState(fromBaseline);
  const toState = readRequirementEvolutionState(toBaseline);
  const requirementDiff = diffs.find((diff) => diff.field === "requirement_ids");
  const addedRequirements = stableUnique([
    ...(requirementDiff?.added ?? []),
  ]);
  const removedRequirements = stableUnique([
    ...(requirementDiff?.removed ?? []),
  ]);
  const artifact = readSourceEvolutionArtifactSummary(root, toBaseline);
  const modifiedRequirements = artifact.modifiedRequirements;
  const replacedMappings = artifact.replacedMappings;
  const splitMappings = artifact.splitMappings;
  const mergeMappings = artifact.mergeMappings;
  const deprecatedWithoutSuccessor = stableUnique([
    ...artifact.deprecatedWithoutSuccessor,
    ...removedRequirements.filter((requirementId) =>
      !replacedMappings.some((mapping) => mapping.startsWith(`${requirementId} -> `)) &&
      !splitMappings.some((mapping) => mapping.startsWith(`${requirementId} -> `)),
    ),
  ]);
  const appliedDeltasAdded = toState.appliedDeltas.filter((changeId) => !fromState.appliedDeltas.includes(changeId));
  const tracked = fromState.tracked ||
    toState.tracked ||
    addedRequirements.length > 0 ||
    removedRequirements.length > 0 ||
    artifact.totalItems > 0;

  if (!tracked) {
    return {
      kind: "requirement_evolution_drift",
      status: "not_tracked",
      summary: "Requirement evolution artifacts are not tracked for either baseline.",
      details: {},
    };
  }

  const changed = addedRequirements.length > 0 ||
    removedRequirements.length > 0 ||
    modifiedRequirements.length > 0 ||
    replacedMappings.length > 0 ||
    splitMappings.length > 0 ||
    mergeMappings.length > 0 ||
    artifact.reanchoredAnchors.length > 0 ||
    !sameNullableString(fromState.activeSnapshotId, toState.activeSnapshotId) ||
    !sameNullableNumber(fromState.lifecycleRegistryVersion, toState.lifecycleRegistryVersion) ||
    !sameNullableString(fromState.lastAdoptedChangeId ?? undefined, toState.lastAdoptedChangeId ?? undefined) ||
    appliedDeltasAdded.length > 0;

  const summary = changed
    ? buildRequirementEvolutionChangedSummary({
        fromState,
        toState,
        addedRequirements,
        modifiedRequirements,
        replacedMappings,
        splitMappings,
        mergeMappings,
        deprecatedWithoutSuccessor,
        appliedDeltasAdded,
      })
    : "Requirement lifecycle registry, source snapshot, and adopted deltas are unchanged.";

  return {
    kind: "requirement_evolution_drift",
    status: changed ? "changed" : "unchanged",
    summary,
    details: {
      from_active_snapshot_id: fromState.activeSnapshotId,
      to_active_snapshot_id: toState.activeSnapshotId,
      from_lifecycle_registry_path: fromState.lifecycleRegistryPath,
      to_lifecycle_registry_path: toState.lifecycleRegistryPath,
      from_lifecycle_registry_version: fromState.lifecycleRegistryVersion,
      to_lifecycle_registry_version: toState.lifecycleRegistryVersion,
      from_last_adopted_change_id: fromState.lastAdoptedChangeId ?? null,
      to_last_adopted_change_id: toState.lastAdoptedChangeId ?? null,
      from_source_evolution_path: fromState.sourceEvolutionPath,
      to_source_evolution_path: toState.sourceEvolutionPath,
      from_source_review_path: fromState.sourceReviewPath,
      to_source_review_path: toState.sourceReviewPath,
      added_requirements: addedRequirements,
      removed_requirements: removedRequirements,
      modified_requirements: modifiedRequirements,
      replaced_mappings: replacedMappings,
      split_mappings: splitMappings,
      merge_mappings: mergeMappings,
      deprecated_without_successor: deprecatedWithoutSuccessor,
      reanchored_anchors: artifact.reanchoredAnchors,
      applied_deltas_added: appliedDeltasAdded,
      applied_deltas_current: toState.appliedDeltas,
      source_evolution_item_count: artifact.totalItems,
    },
  };
}

function buildRequirementEvolutionChangedSummary(input: {
  fromState: RequirementEvolutionStateSnapshot;
  toState: RequirementEvolutionStateSnapshot;
  addedRequirements: string[];
  modifiedRequirements: string[];
  replacedMappings: string[];
  splitMappings: string[];
  mergeMappings: string[];
  deprecatedWithoutSuccessor: string[];
  appliedDeltasAdded: string[];
}): string {
  const clauses = [
    input.toState.activeSnapshotId && !sameNullableString(input.fromState.activeSnapshotId, input.toState.activeSnapshotId)
      ? `active source snapshot ${input.fromState.activeSnapshotId ?? "unknown"} -> ${input.toState.activeSnapshotId}`
      : undefined,
    input.toState.lifecycleRegistryVersion !== undefined &&
        !sameNullableNumber(input.fromState.lifecycleRegistryVersion, input.toState.lifecycleRegistryVersion)
      ? `lifecycle registry v${input.fromState.lifecycleRegistryVersion ?? "?"} -> v${input.toState.lifecycleRegistryVersion}`
      : undefined,
    input.toState.lastAdoptedChangeId &&
        !sameNullableString(input.fromState.lastAdoptedChangeId ?? undefined, input.toState.lastAdoptedChangeId)
      ? `adopted change ${input.fromState.lastAdoptedChangeId ?? "none"} -> ${input.toState.lastAdoptedChangeId}`
      : undefined,
    input.addedRequirements.length > 0 ? `${input.addedRequirements.length} added requirement(s)` : undefined,
    input.modifiedRequirements.length > 0 ? `${input.modifiedRequirements.length} modified requirement(s)` : undefined,
    input.replacedMappings.length > 0 ? `${input.replacedMappings.length} replaced requirement mapping(s)` : undefined,
    input.splitMappings.length > 0 ? `${input.splitMappings.length} split transition(s)` : undefined,
    input.mergeMappings.length > 0 ? `${input.mergeMappings.length} merge transition(s)` : undefined,
    input.deprecatedWithoutSuccessor.length > 0
      ? `${input.deprecatedWithoutSuccessor.length} deprecated requirement(s) without successor`
      : undefined,
    input.appliedDeltasAdded.length > 0 ? `${input.appliedDeltasAdded.length} adopted delta(s)` : undefined,
  ].filter((entry): entry is string => Boolean(entry));

  return clauses.length > 0
    ? `Governed requirement evolution changed: ${clauses.join("; ")}.`
    : "Governed requirement evolution changed.";
}

function readRequirementEvolutionState(baseline: BaselineDocument): RequirementEvolutionStateSnapshot {
  const sourceSnapshot = isRecord(baseline.source_snapshot) ? baseline.source_snapshot : {};
  const lifecycle = isRecord(baseline.requirement_lifecycle) ? baseline.requirement_lifecycle : {};
  const sourceEvolution = isRecord(baseline.source_evolution) ? baseline.source_evolution : {};
  const activeSnapshotId = stringValue(sourceSnapshot.active_snapshot_id) ?? stringValue(lifecycle.active_snapshot_id);
  const lifecycleRegistryPath = stringValue(sourceSnapshot.lifecycle_registry_path) ?? stringValue(lifecycle.path);
  const lifecycleRegistryVersion = numberValue(sourceSnapshot.lifecycle_registry_version) ?? numberValue(lifecycle.registry_version);
  const lastAdoptedChangeId = stringValue(sourceSnapshot.last_adopted_change_id)
    ?? stringValue(lifecycle.last_adopted_change_id)
    ?? stringValue(sourceEvolution.last_adopted_change_id)
    ?? null;

  return {
    tracked: Boolean(
      activeSnapshotId ||
      lifecycleRegistryPath ||
      lifecycleRegistryVersion !== undefined ||
      lastAdoptedChangeId ||
      stringValue(sourceEvolution.source_evolution_path) ||
      stringValue(sourceEvolution.source_review_path) ||
      stringArray(baseline.applied_deltas).length > 0
    ),
    activeSnapshotId,
    lifecycleRegistryPath,
    lifecycleRegistryVersion,
    lastAdoptedChangeId,
    sourceEvolutionPath: stringValue(sourceEvolution.source_evolution_path),
    sourceReviewPath: stringValue(sourceEvolution.source_review_path),
    proposedSnapshotPath: stringValue(sourceEvolution.proposed_snapshot_path),
    appliedDeltas: stringArray(baseline.applied_deltas),
  };
}

function readSourceEvolutionArtifactSummary(root: string, baseline: BaselineDocument): SourceEvolutionArtifactSummary {
  const state = readRequirementEvolutionState(baseline);
  if (!state.sourceEvolutionPath) {
    return {
      sourceEvolutionPath: undefined,
      sourceReviewPath: state.sourceReviewPath,
      addedRequirements: [],
      modifiedRequirements: [],
      deprecatedRequirements: [],
      deprecatedWithoutSuccessor: [],
      splitMappings: [],
      mergeMappings: [],
      replacedMappings: [],
      reanchoredAnchors: [],
      totalItems: 0,
    };
  }

  const diffPath = resolveArtifactPath(root, state.sourceEvolutionPath, undefined);
  const reviewPath = resolveArtifactPath(root, state.sourceReviewPath, undefined);
  const diff = diffPath ? readJsonObject(diffPath) : undefined;
  const items = Array.isArray(diff?.items) ? diff.items.filter(isRecord) : [];
  const review = reviewPath ? readYamlArtifactObject(reviewPath) ?? {} : {};
  const decisions = Array.isArray(review.items) ? review.items.filter(isRecord) : [];

  const decisionsByEvolutionId = new Map(decisions.map((entry) => [
    stringValue(entry.evolution_id) ?? "",
    stringArray(entry.maps_to),
  ]));
  const addedRequirements: string[] = [];
  const modifiedRequirements: string[] = [];
  const deprecatedRequirements: string[] = [];
  const deprecatedWithoutSuccessor: string[] = [];
  const splitMappings: string[] = [];
  const mergeMappings: string[] = [];
  const replacedMappings: string[] = [];
  const reanchoredAnchors: string[] = [];

  for (const item of items) {
    const evolutionKind = stringValue(item.evolution_kind);
    const anchorId = stringValue(item.anchor_id);
    const predecessorIds = stringArray(item.predecessor_ids);
    const successorIds = stringArray(item.successor_ids);
    const decisionMappings = decisionsByEvolutionId.get(stringValue(item.evolution_id) ?? "") ?? [];
    switch (evolutionKind) {
      case "added":
        if (anchorId) {
          addedRequirements.push(anchorId);
        }
        break;
      case "modified":
        if (anchorId) {
          modifiedRequirements.push(anchorId);
        }
        break;
      case "deprecated": {
        if (!anchorId) {
          break;
        }
        deprecatedRequirements.push(anchorId);
        const successors = stableUnique(decisionMappings.length > 0 ? decisionMappings : successorIds);
        if (successors.length > 0) {
          replacedMappings.push(`${anchorId} -> ${successors.join(", ")}`);
        } else {
          deprecatedWithoutSuccessor.push(anchorId);
        }
        break;
      }
      case "split":
        if (predecessorIds.length > 0 && successorIds.length > 0) {
          splitMappings.push(`${predecessorIds.join(", ")} -> ${successorIds.join(", ")}`);
        }
        break;
      case "merged":
        if (predecessorIds.length > 0 && successorIds.length > 0) {
          mergeMappings.push(`${predecessorIds.join(", ")} -> ${successorIds.join(", ")}`);
        }
        break;
      case "reanchored":
        if (anchorId) {
          reanchoredAnchors.push(anchorId);
        }
        break;
    }
  }

  return {
    sourceEvolutionPath: diffPath ? normalizePath(path.relative(root, diffPath)) : state.sourceEvolutionPath,
    sourceReviewPath: reviewPath ? normalizePath(path.relative(root, reviewPath)) : state.sourceReviewPath,
    addedRequirements: stableUnique(addedRequirements),
    modifiedRequirements: stableUnique(modifiedRequirements),
    deprecatedRequirements: stableUnique(deprecatedRequirements),
    deprecatedWithoutSuccessor: stableUnique(deprecatedWithoutSuccessor),
    splitMappings: stableUnique(splitMappings),
    mergeMappings: stableUnique(mergeMappings),
    replacedMappings: stableUnique(replacedMappings),
    reanchoredAnchors: stableUnique(reanchoredAnchors),
    totalItems: items.length,
  };
}

function renderRequirementEvolutionDriftLines(summary: DriftSurfaceSummary): string[] {
  if (summary.kind !== "requirement_evolution_drift") {
    return [`Status: ${summary.status}`, `Summary: ${summary.summary}`];
  }

  const details = summary.details;
  const lines = [
    `Status: ${summary.status}`,
    `Summary: ${summary.summary}`,
    `Lifecycle registry: ${formatTransition(
      stringValue(details.from_lifecycle_registry_path),
      stringValue(details.to_lifecycle_registry_path),
      formatVersion(numberValue(details.from_lifecycle_registry_version)),
      formatVersion(numberValue(details.to_lifecycle_registry_version)),
    )}`,
    `Active source snapshot: ${formatTransition(
      stringValue(details.from_active_snapshot_id),
      stringValue(details.to_active_snapshot_id),
    )}`,
    `Last adopted source change: ${formatTransition(
      nullableStringValue(details.from_last_adopted_change_id),
      nullableStringValue(details.to_last_adopted_change_id),
    )}`,
    `Source evolution artifact: ${formatTransition(
      stringValue(details.from_source_evolution_path),
      stringValue(details.to_source_evolution_path),
    )}`,
    `Source review artifact: ${formatTransition(
      stringValue(details.from_source_review_path),
      stringValue(details.to_source_review_path),
    )}`,
  ];

  pushNamedList(lines, "Added requirements", stringArray(details.added_requirements));
  pushNamedList(lines, "Removed requirements", stringArray(details.removed_requirements));
  pushNamedList(lines, "Modified requirements", stringArray(details.modified_requirements));
  pushNamedList(lines, "Replaced requirements", stringArray(details.replaced_mappings));
  pushNamedList(lines, "Split transitions", stringArray(details.split_mappings));
  pushNamedList(lines, "Merge transitions", stringArray(details.merge_mappings));
  pushNamedList(lines, "Deprecated without successor", stringArray(details.deprecated_without_successor));
  pushNamedList(lines, "Advisory re-anchors", stringArray(details.reanchored_anchors));
  pushNamedList(lines, "Adopted deltas added", stringArray(details.applied_deltas_added));
  return lines;
}

function renderRequirementEvolutionStateLines(summary: BaselineSurfaceSummary): string[] {
  const details = summary.details;
  if (summary.status === "not_tracked") {
    return ["- Requirement evolution is not tracked in this baseline."];
  }

  return [
    `- Summary: ${summary.summary}`,
    `- Active source snapshot: \`${stringValue(details.active_snapshot_id) ?? "unknown"}\``,
    `- Lifecycle registry: \`${stringValue(details.lifecycle_registry_path) ?? "unknown"}\` (${formatVersion(numberValue(details.lifecycle_registry_version))})`,
    `- Last adopted source change: \`${nullableStringValue(details.last_adopted_change_id) ?? "none"}\``,
    `- Source evolution artifact: \`${stringValue(details.source_evolution_path) ?? "not recorded"}\``,
    `- Source review artifact: \`${stringValue(details.source_review_path) ?? "not recorded"}\``,
    `- Applied deltas: ${renderInlineList(stringArray(details.applied_deltas))}`,
  ];
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
  const requirementEvolution = summarizeRequirementEvolutionState(baseline);

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
    requirementEvolution,
  };
}

function summarizeReleaseDrift(input: {
  root: string;
  fromBaseline: BaselineDocument;
  toBaseline: BaselineDocument;
  diffs: BaselineDiff[];
  graphDiff: MerkleContractDagDiff;
  fromStaticCollector: ComparableStaticCollector;
  toStaticCollector: ComparableStaticCollector;
  fromPolicy: ComparablePolicy;
  toPolicy: ComparablePolicy;
}): ReleaseDriftSummary {
  const contractGraph = summarizeContractGraphDrift(input.graphDiff);
  const staticCollector = summarizeStaticCollectorDrift(input.fromStaticCollector, input.toStaticCollector);
  const behavior = summarizeBehaviorDrift(input.fromBaseline, input.toBaseline, input.diffs, input.graphDiff);
  const policy = summarizePolicyDrift(input.fromPolicy, input.toPolicy);
  const requirementEvolution = summarizeRequirementEvolutionDrift(
    input.root,
    input.fromBaseline,
    input.toBaseline,
    input.diffs,
  );
  const statuses = [contractGraph.status, staticCollector.status, behavior.status, policy.status, requirementEvolution.status];
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
    behavior,
    policy,
    requirementEvolution,
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

function summarizeBehaviorDrift(
  fromBaseline: BaselineDocument,
  toBaseline: BaselineDocument,
  diffs: BaselineDiff[],
  graphDiff: MerkleContractDagDiff,
): DriftSurfaceSummary {
  const fromTracked = hasTrackedBehaviorSurface(fromBaseline);
  const toTracked = hasTrackedBehaviorSurface(toBaseline);
  if (!fromTracked && !toTracked) {
    return {
      kind: "behavior_drift",
      status: "not_tracked",
      summary: "Behavior scenarios are not tracked for either baseline.",
      details: {},
    };
  }

  const scenarioDiff = diffs.find((diff) => diff.field === "scenarios");
  const fromScenarios = stringArray(fromBaseline.scenarios);
  const toScenarios = stringArray(toBaseline.scenarios);
  const behaviorNodeChanges = countBehaviorGraphNodeChanges(graphDiff);
  const behaviorCoverageChanges = countBehaviorGraphCoverageChanges(graphDiff);
  const changed =
    (scenarioDiff?.added.length ?? 0) > 0 ||
    (scenarioDiff?.removed.length ?? 0) > 0 ||
    behaviorNodeChanges > 0 ||
    behaviorCoverageChanges > 0;

  return {
    kind: "behavior_drift",
    status: changed ? "changed" : "unchanged",
    summary: changed
      ? "Behavior scenarios, behavior graph nodes, or scenario coverage changed."
      : "Behavior scenarios and scenario coverage are unchanged.",
    details: {
      from_scenarios: fromScenarios,
      to_scenarios: toScenarios,
      scenario_added: scenarioDiff?.added ?? [],
      scenario_removed: scenarioDiff?.removed ?? [],
      behavior_node_changes: behaviorNodeChanges,
      behavior_coverage_changes: behaviorCoverageChanges,
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

function hasTrackedBehaviorSurface(baseline: BaselineDocument): boolean {
  return Object.prototype.hasOwnProperty.call(baseline, "scenarios");
}

function countBehaviorGraphNodeChanges(graphDiff: MerkleContractDagDiff): number {
  return [
    ...graphDiff.addedNodes,
    ...graphDiff.removedNodes,
    ...graphDiff.changedNodeContent,
    ...graphDiff.affectedClosureNodes,
  ].filter(isBehaviorGraphNodeId).length;
}

function countBehaviorGraphCoverageChanges(graphDiff: MerkleContractDagDiff): number {
  return graphDiff.coverageChanges.filter((change) =>
    change.from.scenarios.length > 0 ||
    change.to.scenarios.length > 0 ||
    change.from.tests.length > 0 ||
    change.to.tests.length > 0,
  ).length;
}

function isBehaviorGraphNodeId(nodeId: string): boolean {
  return nodeId.startsWith("@bdd:");
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
  const replay = isRecord(baseline.replay) ? baseline.replay as unknown as ReplayMetadata : undefined;
  return [
    `# Release ${version} Baseline`,
    "",
    `Frozen at: ${stringValue(baseline.frozen_at) ?? "unknown"}`,
    `Project: ${stringValue(baseline.project_name) ?? stringValue(baseline.project_id) ?? "unknown"}`,
    `Source baseline: ${stringValue(baseline.source_baseline) ?? ".spec/baselines/current.yaml"}`,
    "",
    ...renderHumanDecisionSnapshot({
      currentState: `release baseline \`${version}\` frozen from \`${stringValue(baseline.source_baseline) ?? ".spec/baselines/current.yaml"}\``,
      risk: `${specDebt.open} open spec debt item(s), ${specDebt.expired} expired debt item(s)`,
      evidence: [
        `contract graph ${summary.contractGraph.status}`,
        `static collector ${summary.staticCollector.status}`,
        `policy ${summary.policy.status}`,
        `requirement evolution ${summary.requirementEvolution.status}`,
      ],
      owner: replay?.actor ? `release owner \`${replay.actor}\`` : "release owner",
      nextCommand: `\`npm run jispec-cli -- release compare --from ${version} --to current\``,
    }),
    ...splitDecisionCompanionSections({
      subject: `release baseline ${version}`,
      truthSources: [
        stringValue(baseline.source_baseline) ?? ".spec/baselines/current.yaml",
        `.spec/baselines/releases/${version}.yaml`,
        stringValue(isRecord(baseline.contract_graph) ? baseline.contract_graph.graph_path : undefined) ?? ".spec/baselines/releases/<version>-contract-graph.json",
      ],
      strongestEvidence: [
        `contract graph: ${summary.contractGraph.summary}`,
        `static collector: ${summary.staticCollector.summary}`,
        `policy: ${summary.policy.summary}`,
        `requirement evolution: ${summary.requirementEvolution.summary}`,
      ],
      inferredEvidence: [
        `requirements: ${counts.requirementIds}`,
        `contracts: ${counts.contracts}`,
        `slices: ${counts.slices}`,
      ],
      drift: [
        `open spec debt: ${specDebt.open}`,
        `expired spec debt: ${specDebt.expired}`,
      ],
      impact: [
        `contracts: ${counts.contracts}`,
        `scenarios: ${counts.scenarios}`,
        `assets: ${counts.assets}`,
      ],
      nextSteps: [
        `run npm run jispec-cli -- release compare --from ${version} --to current`,
      ],
      maxLines: 150,
    }),
    "",
    "## Replay / Provenance",
    "",
    ...renderReplayMarkdown(replay),
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
    `- Requirement evolution: ${summary.requirementEvolution.summary}`,
    "",
    "## Requirement Evolution State",
    "",
    ...renderRequirementEvolutionStateLines(summary.requirementEvolution),
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
    "## Source Of Truth",
    "",
    "- Machine release baseline YAML, contract graph, static collector manifest, and policy snapshot remain the source of truth.",
    `- ${HUMAN_SUMMARY_COMPANION_NOTE}`,
    "",
  ].join("\n");
}

function renderReplayMarkdown(replay: ReplayMetadata | undefined): string[] {
  if (!replay) {
    return ["- Replay metadata is not available."];
  }

  return [
    `- Source artifact: \`${replay.sourceArtifact ?? "not recorded"}\``,
    `- Input artifacts: ${replay.inputArtifacts.length > 0 ? replay.inputArtifacts.slice(0, 8).map((entry) => `\`${entry}\``).join(", ") : "none recorded"}`,
    `- Actor: \`${replay.actor ?? "not recorded"}\``,
    `- Reason: ${replay.reason ?? "not recorded"}`,
    `- Previous outcome: \`${replay.previousOutcome ?? "not recorded"}\``,
    `- Replay command: \`${replay.commands.rerun ?? "not recorded"}\``,
    `- Next human action: ${replay.nextHumanAction}`,
  ];
}

function quoteShellValue(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function renderList(values: string[]): string[] {
  return values.length > 0 ? values.map((value) => `- \`${value}\``) : ["- None recorded."];
}

function renderInlineList(values: string[]): string {
  return values.length > 0 ? values.map((value) => `\`${value}\``).join(", ") : "none recorded";
}

function pushNamedList(lines: string[], label: string, values: string[]): void {
  if (values.length === 0) {
    return;
  }
  lines.push(`${label}: ${values.map((value) => `\`${value}\``).join(", ")}`);
}

function formatTransition(
  fromValue: string | undefined,
  toValue: string | undefined,
  fromSuffix?: string,
  toSuffix?: string,
): string {
  const fromText = formatValueWithSuffix(fromValue, fromSuffix);
  const toText = formatValueWithSuffix(toValue, toSuffix);
  return fromText === toText ? fromText : `${fromText} -> ${toText}`;
}

function formatValueWithSuffix(value: string | undefined, suffix?: string): string {
  const base = value ?? "not recorded";
  return suffix ? `${base} ${suffix}` : base;
}

function formatVersion(value: number | undefined): string {
  return value !== undefined ? `v${value}` : "unknown version";
}

function nullableStringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function sameNullableString(left: string | undefined, right: string | undefined): boolean {
  return (left ?? null) === (right ?? null);
}

function sameNullableNumber(left: number | undefined, right: number | undefined): boolean {
  return (left ?? null) === (right ?? null);
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((left, right) => left.localeCompare(right));
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

function readYamlArtifactObject(filePath: string): Record<string, unknown> | undefined {
  try {
    const parsed = yaml.load(fs.readFileSync(filePath, "utf-8"));
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
