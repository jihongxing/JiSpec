import fs from "node:fs";
import path from "node:path";
import type { MultiRepoGovernanceSnapshot } from "./governance-export";
import { loadRepoGroupConfig, type RepoGroupConfig, type RepoGroupRepo } from "./repo-group";

export interface MultiRepoGovernanceAggregateOptions {
  root: string;
  snapshotPaths?: string[];
  directoryPaths?: string[];
  outPath?: string;
  generatedAt?: string;
}

export interface MultiRepoGovernanceRepoPosture {
  repoId: string;
  repoName: string;
  repoRoot: string;
  snapshotPath: string;
  exportedAt: string;
  sourceHash: string;
  verifyVerdict: string;
  policyProfile: string;
  policyOwner: string;
  activeWaivers: number;
  expiringSoonWaivers: string[];
  expiredWaivers: string[];
  unmatchedActiveWaivers: string[];
  openSpecDebt: number;
  bootstrapSpecDebt: number;
  releaseDriftStatus: string;
  releaseDriftTrendComparisons: number;
  latestAuditActor: string;
  contractRefs: MultiRepoContractRef[];
  risk: {
    score: number;
    level: "low" | "medium" | "high";
    reasons: string[];
  };
}

export interface MultiRepoContractRef {
  ref: string;
  hash: string;
}

export interface MultiRepoGovernanceRepoGroupEntry extends RepoGroupRepo {
  snapshotStatus: "available" | "not_available_yet";
  snapshotPath?: string;
}

export interface CrossRepoContractDriftHint {
  kind: "cross_repo_contract_drift";
  upstreamRepoId: string;
  downstreamRepoId: string;
  contractRef: string;
  upstreamHash: string;
  downstreamHash: string;
  severity: "owner_action";
  suggestedCommand: string;
  blockingGateReplacement: false;
}

export interface MultiRepoOwnerAction {
  kind: "cross_repo_contract_drift";
  repoId: string;
  message: string;
  suggestedCommand: string;
}

export interface MultiRepoGovernanceMissingSnapshot {
  inputPath: string;
  resolvedPath: string;
  reason: "snapshot_not_found";
}

export interface MultiRepoGovernanceAggregate {
  schemaVersion: 1;
  kind: "jispec-multi-repo-governance-aggregate";
  generatedAt: string;
  root: string;
  boundary: {
    localOnly: true;
    readOnlyAggregate: true;
    consumesExportedSnapshotsOnly: true;
    sourceUploadRequired: false;
    scansSourceCode: false;
    runsVerify: false;
    replacesCliGate: false;
    markdownIsMachineApi: false;
  };
  inputs: {
    snapshotPaths: string[];
    directoryPaths: string[];
    loadedSnapshots: number;
    missingSnapshots: number;
  };
  summary: {
    repoCount: number;
    missingSnapshotCount: number;
    verifyVerdicts: Record<string, number>;
    policyProfiles: Record<string, number>;
    totalActiveWaivers: number;
    totalExpiringSoonWaivers: number;
    totalExpiredWaivers: number;
    totalUnmatchedActiveWaivers: number;
    totalOpenSpecDebt: number;
    totalBootstrapSpecDebt: number;
    releaseDriftHotspotCount: number;
    totalReleaseDriftComparisons: number;
    latestAuditActors: string[];
  };
  repoGroup: {
    status: RepoGroupConfig["status"];
    sourcePath: string;
    repos: MultiRepoGovernanceRepoGroupEntry[];
    warnings: string[];
  };
  repos: MultiRepoGovernanceRepoPosture[];
  missingSnapshots: MultiRepoGovernanceMissingSnapshot[];
  contractDriftHints: CrossRepoContractDriftHint[];
  ownerActions: MultiRepoOwnerAction[];
  singleRepoGateReplacement: false;
  hotspots: {
    highestRiskRepos: MultiRepoGovernanceRepoPosture[];
    expiringSoonWaivers: Array<{ repoId: string; repoName: string; waiverId: string }>;
    unmatchedActiveWaivers: Array<{ repoId: string; repoName: string; waiverId: string }>;
    specDebt: Array<{ repoId: string; repoName: string; openSpecDebt: number; bootstrapSpecDebt: number }>;
    releaseDrift: Array<{ repoId: string; repoName: string; status: string; comparisons: number }>;
    verify: Array<{ repoId: string; repoName: string; verdict: string }>;
  };
}

export interface MultiRepoGovernanceAggregateResult {
  root: string;
  aggregatePath: string;
  summaryPath: string;
  aggregate: MultiRepoGovernanceAggregate;
}

const DEFAULT_AGGREGATE_PATH = ".spec/console/multi-repo-governance.json";
const DEFAULT_SNAPSHOT_PATH = ".spec/console/governance-snapshot.json";

export function aggregateMultiRepoGovernance(
  options: MultiRepoGovernanceAggregateOptions,
): MultiRepoGovernanceAggregateResult {
  const root = path.resolve(options.root);
  const repoGroup = loadRepoGroupConfig(root);
  const directoryPaths = (options.directoryPaths ?? []).map((entry) => normalizePath(path.resolve(root, entry)));
  const snapshotInputs = resolveSnapshotInputs(root, options.snapshotPaths ?? [], directoryPaths);
  if (snapshotInputs.snapshotPaths.length === 0 && snapshotInputs.missingSnapshots.length === 0 && repoGroup.repos.length === 0) {
    throw new Error("No governance snapshots found. Provide --snapshot or --dir with exported .spec/console/governance-snapshot.json files.");
  }

  const repos = snapshotInputs.snapshotPaths
    .map((snapshotPath) => loadSnapshot(snapshotPath))
    .map(({ snapshot, snapshotPath }) => buildRepoPosture(snapshot, snapshotPath))
    .sort((left, right) => left.repoId.localeCompare(right.repoId));
  const repoGroupSummary = buildRepoGroupSummary(root, repoGroup, repos);
  const repoGroupMissingSnapshots = repoGroupSummary.repos
    .filter((repo) => repo.snapshotStatus === "not_available_yet")
    .map((repo) => ({
      inputPath: normalizePath(path.resolve(root, repo.path, DEFAULT_SNAPSHOT_PATH)),
      resolvedPath: normalizePath(path.resolve(root, repo.path, DEFAULT_SNAPSHOT_PATH)),
      reason: "snapshot_not_found" as const,
    }));
  const aggregate = buildAggregate(
    root,
    snapshotInputs.snapshotPaths,
    directoryPaths,
    repos,
    [...snapshotInputs.missingSnapshots, ...repoGroupMissingSnapshots],
    repoGroupSummary,
    options.generatedAt ?? new Date().toISOString(),
  );
  const aggregatePath = resolveOutPath(root, options.outPath);
  const summaryPath = aggregatePath.replace(/\.json$/i, ".md");

  fs.mkdirSync(path.dirname(aggregatePath), { recursive: true });
  fs.writeFileSync(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`, "utf-8");
  fs.writeFileSync(summaryPath, renderMultiRepoGovernanceAggregateText(aggregate), "utf-8");

  return {
    root: normalizePath(root),
    aggregatePath: normalizePath(aggregatePath),
    summaryPath: normalizePath(summaryPath),
    aggregate,
  };
}

export function renderMultiRepoGovernanceAggregateJSON(result: MultiRepoGovernanceAggregateResult): string {
  return JSON.stringify(result, null, 2);
}

export function renderMultiRepoGovernanceAggregateText(aggregate: MultiRepoGovernanceAggregate): string {
  const lines = [
    "# JiSpec Multi-Repo Governance Aggregate",
    "",
    `Generated at: ${aggregate.generatedAt}`,
    `Repos: ${aggregate.summary.repoCount}`,
    `Missing snapshots: ${aggregate.summary.missingSnapshotCount}`,
    `Verify verdicts: ${formatCounts(aggregate.summary.verifyVerdicts)}`,
    `Policy profiles: ${formatCounts(aggregate.summary.policyProfiles)}`,
    `Active waivers: ${aggregate.summary.totalActiveWaivers}`,
    `Expiring soon waivers: ${aggregate.summary.totalExpiringSoonWaivers}`,
    `Open spec debt: ${aggregate.summary.totalOpenSpecDebt}`,
    `Release drift hotspots: ${aggregate.summary.releaseDriftHotspotCount}`,
    `Repo group: ${aggregate.repoGroup.status}`,
    `Contract drift hints: ${aggregate.contractDriftHints.length}`,
    "",
    "## Repo Group",
    "",
    ...formatRepoGroup(aggregate.repoGroup.repos),
    "",
    "## Cross-Repo Contract Drift Hints",
    "",
    ...formatContractDriftHints(aggregate.contractDriftHints),
    "",
    "## Highest Risk Repos",
    "",
    ...formatRiskRepos(aggregate.hotspots.highestRiskRepos),
    "",
    "## Waiver Hotspots",
    "",
    ...formatWaiverRefs(aggregate.hotspots.expiringSoonWaivers, "expiring soon"),
    ...formatWaiverRefs(aggregate.hotspots.unmatchedActiveWaivers, "unmatched active"),
    "",
    "## Spec Debt Hotspots",
    "",
    ...formatSpecDebtHotspots(aggregate.hotspots.specDebt),
    "",
    "## Release Drift Hotspots",
    "",
    ...formatReleaseDriftHotspots(aggregate.hotspots.releaseDrift),
    "",
    "## Missing Snapshots",
    "",
    ...formatMissingSnapshots(aggregate.missingSnapshots),
    "",
    "## Boundary",
    "",
    "- Consumes exported `.spec/console/governance-snapshot.json` files only.",
    "- Does not scan source code, run verify, upload source, replace CI, or override single-repo `verify` verdicts.",
    "- Cross-repo contract drift hints create owner actions and suggested commands only; they do not replace any single-repo gate.",
    "- Markdown is a human companion; JSON is the machine-readable aggregate.",
    "",
  ];

  return lines.join("\n");
}

function buildAggregate(
  root: string,
  snapshotPaths: string[],
  directoryPaths: string[],
  repos: MultiRepoGovernanceRepoPosture[],
  missingSnapshots: MultiRepoGovernanceMissingSnapshot[],
  repoGroup: MultiRepoGovernanceAggregate["repoGroup"],
  generatedAt: string,
): MultiRepoGovernanceAggregate {
  const releaseDrift = repos
    .filter((repo) => isReleaseDriftHotspot(repo.releaseDriftStatus))
    .map((repo) => ({
      repoId: repo.repoId,
      repoName: repo.repoName,
      status: repo.releaseDriftStatus,
      comparisons: repo.releaseDriftTrendComparisons,
    }));

  const contractDriftHints = buildContractDriftHints(repoGroup, repos);
  return {
    schemaVersion: 1,
    kind: "jispec-multi-repo-governance-aggregate",
    generatedAt,
    root: normalizePath(root),
    boundary: {
      localOnly: true,
      readOnlyAggregate: true,
      consumesExportedSnapshotsOnly: true,
      sourceUploadRequired: false,
      scansSourceCode: false,
      runsVerify: false,
      replacesCliGate: false,
      markdownIsMachineApi: false,
    },
    inputs: {
      snapshotPaths: snapshotPaths.map(normalizePath),
      directoryPaths,
      loadedSnapshots: repos.length,
      missingSnapshots: missingSnapshots.length,
    },
    summary: {
      repoCount: repos.length,
      missingSnapshotCount: missingSnapshots.length,
      verifyVerdicts: countBy(repos.map((repo) => repo.verifyVerdict)),
      policyProfiles: countBy(repos.map((repo) => repo.policyProfile)),
      totalActiveWaivers: sum(repos.map((repo) => repo.activeWaivers)),
      totalExpiringSoonWaivers: sum(repos.map((repo) => repo.expiringSoonWaivers.length)),
      totalExpiredWaivers: sum(repos.map((repo) => repo.expiredWaivers.length)),
      totalUnmatchedActiveWaivers: sum(repos.map((repo) => repo.unmatchedActiveWaivers.length)),
      totalOpenSpecDebt: sum(repos.map((repo) => repo.openSpecDebt)),
      totalBootstrapSpecDebt: sum(repos.map((repo) => repo.bootstrapSpecDebt)),
      releaseDriftHotspotCount: releaseDrift.length,
      totalReleaseDriftComparisons: sum(repos.map((repo) => repo.releaseDriftTrendComparisons)),
      latestAuditActors: stableUnique(repos.map((repo) => repo.latestAuditActor).filter((actor) => !isMissing(actor))),
    },
    repos,
    missingSnapshots,
    hotspots: {
      highestRiskRepos: repos
        .filter((repo) => repo.risk.score > 0)
        .sort((left, right) => right.risk.score - left.risk.score || left.repoId.localeCompare(right.repoId))
        .slice(0, 5),
      expiringSoonWaivers: repos.flatMap((repo) => repo.expiringSoonWaivers.map((waiverId) => ({
        repoId: repo.repoId,
        repoName: repo.repoName,
        waiverId,
      }))),
      unmatchedActiveWaivers: repos.flatMap((repo) => repo.unmatchedActiveWaivers.map((waiverId) => ({
        repoId: repo.repoId,
        repoName: repo.repoName,
        waiverId,
      }))),
      specDebt: repos
        .filter((repo) => repo.openSpecDebt + repo.bootstrapSpecDebt > 0)
        .map((repo) => ({
          repoId: repo.repoId,
          repoName: repo.repoName,
          openSpecDebt: repo.openSpecDebt,
          bootstrapSpecDebt: repo.bootstrapSpecDebt,
        })),
      releaseDrift,
      verify: repos
        .filter((repo) => repo.verifyVerdict !== "PASS" && !isMissing(repo.verifyVerdict))
        .map((repo) => ({
          repoId: repo.repoId,
          repoName: repo.repoName,
          verdict: repo.verifyVerdict,
        })),
    },
    repoGroup,
    contractDriftHints,
    ownerActions: buildOwnerActions(contractDriftHints),
    singleRepoGateReplacement: false,
  };
}

function buildRepoPosture(snapshot: MultiRepoGovernanceSnapshot, snapshotPath: string): MultiRepoGovernanceRepoPosture {
  const hints = snapshot.aggregateHints;
  const repo: Omit<MultiRepoGovernanceRepoPosture, "risk"> = {
    repoId: String(snapshot.repo.id),
    repoName: String(snapshot.repo.name),
    repoRoot: String(snapshot.repo.root),
    snapshotPath: normalizePath(snapshotPath),
    exportedAt: String(snapshot.exportedAt),
    sourceHash: String(snapshot.sourceSnapshot.hash ?? "not_declared"),
    verifyVerdict: stringHint(hints.verifyVerdict),
    policyProfile: stringHint(hints.policyProfile),
    policyOwner: stringHint(hints.policyOwner),
    activeWaivers: numberHint(hints.activeWaivers),
    expiringSoonWaivers: stringArrayHint(hints.expiringSoonWaivers),
    expiredWaivers: stringArrayHint(hints.expiredWaivers),
    unmatchedActiveWaivers: stringArrayHint(hints.unmatchedActiveWaivers),
    openSpecDebt: numberHint(hints.openSpecDebt),
    bootstrapSpecDebt: numberHint(hints.bootstrapSpecDebt),
    releaseDriftStatus: stringHint(hints.releaseDriftStatus),
    releaseDriftTrendComparisons: numberHint(hints.releaseDriftTrendComparisons),
    latestAuditActor: stringHint(hints.latestAuditActor),
    contractRefs: contractRefArrayHint(hints.contractRefs),
  };

  return {
    ...repo,
    risk: scoreRepoRisk(repo),
  };
}

function buildRepoGroupSummary(
  root: string,
  repoGroup: RepoGroupConfig,
  repos: MultiRepoGovernanceRepoPosture[],
): MultiRepoGovernanceAggregate["repoGroup"] {
  const postureById = new Map(repos.map((repo) => [repo.repoId, repo]));
  return {
    status: repoGroup.status,
    sourcePath: repoGroup.sourcePath,
    warnings: repoGroup.warnings,
    repos: repoGroup.repos.map((repo) => {
      const posture = postureById.get(repo.id);
      return {
        ...repo,
        snapshotStatus: posture ? "available" : "not_available_yet",
        snapshotPath: posture?.snapshotPath ?? normalizePath(path.resolve(root, repo.path, DEFAULT_SNAPSHOT_PATH)),
      };
    }),
  };
}

function buildContractDriftHints(
  repoGroup: MultiRepoGovernanceAggregate["repoGroup"],
  repos: MultiRepoGovernanceRepoPosture[],
): CrossRepoContractDriftHint[] {
  if (repoGroup.status !== "available") {
    return [];
  }
  const repoById = new Map(repos.map((repo) => [repo.repoId, repo]));
  const hints: CrossRepoContractDriftHint[] = [];
  const seen = new Set<string>();

  for (const downstream of repoGroup.repos) {
    for (const upstreamRef of downstream.upstreamContractRefs) {
      const parsed = parseRepoContractRef(upstreamRef);
      if (!parsed) {
        continue;
      }
      const upstream = repoById.get(parsed.repoId);
      const downstreamPosture = repoById.get(downstream.id);
      if (!upstream || !downstreamPosture) {
        continue;
      }
      const upstreamContract = findContractRef(upstream, parsed.contractRef);
      const downstreamContract = findContractRef(downstreamPosture, parsed.contractRef);
      if (!upstreamContract || !downstreamContract || upstreamContract.hash === downstreamContract.hash) {
        continue;
      }
      const key = `${parsed.repoId}->${downstream.id}:${parsed.contractRef}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      hints.push({
        kind: "cross_repo_contract_drift",
        upstreamRepoId: parsed.repoId,
        downstreamRepoId: downstream.id,
        contractRef: parsed.contractRef,
        upstreamHash: upstreamContract.hash,
        downstreamHash: downstreamContract.hash,
        severity: "owner_action",
        suggestedCommand: buildCrossRepoSuggestedCommand(parsed.repoId, downstream.id, parsed.contractRef),
        blockingGateReplacement: false,
      });
    }
  }

  return hints.sort((left, right) =>
    left.upstreamRepoId.localeCompare(right.upstreamRepoId) ||
    left.downstreamRepoId.localeCompare(right.downstreamRepoId) ||
    left.contractRef.localeCompare(right.contractRef),
  );
}

function buildOwnerActions(hints: CrossRepoContractDriftHint[]): MultiRepoOwnerAction[] {
  return hints.map((hint) => ({
    kind: "cross_repo_contract_drift",
    repoId: hint.downstreamRepoId,
    message: `${hint.downstreamRepoId} may need to reconcile ${hint.contractRef} from ${hint.upstreamRepoId}.`,
    suggestedCommand: hint.suggestedCommand,
  }));
}

function parseRepoContractRef(value: string): { repoId: string; contractRef: string } | undefined {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    return undefined;
  }
  return {
    repoId: value.slice(0, separator),
    contractRef: normalizePath(value.slice(separator + 1)),
  };
}

function findContractRef(repo: MultiRepoGovernanceRepoPosture, contractRef: string): MultiRepoContractRef | undefined {
  return repo.contractRefs.find((candidate) => normalizePath(candidate.ref) === normalizePath(contractRef));
}

function buildCrossRepoSuggestedCommand(upstreamRepoId: string, downstreamRepoId: string, contractRef: string): string {
  return `jispec console aggregate-governance --review-drift ${upstreamRepoId}:${contractRef}->${downstreamRepoId}:${contractRef}`;
}

function scoreRepoRisk(repo: Omit<MultiRepoGovernanceRepoPosture, "risk">): MultiRepoGovernanceRepoPosture["risk"] {
  let score = 0;
  const reasons: string[] = [];

  if (repo.verifyVerdict === "FAIL_BLOCKING") {
    score += 50;
    reasons.push("latest verify verdict is blocking");
  } else if (repo.verifyVerdict === "WARN_ADVISORY") {
    score += 20;
    reasons.push("latest verify verdict has advisory findings");
  } else if (repo.verifyVerdict !== "PASS" && !isMissing(repo.verifyVerdict)) {
    score += 15;
    reasons.push(`latest verify verdict is ${repo.verifyVerdict}`);
  }

  if (isMissing(repo.policyProfile)) {
    score += 20;
    reasons.push("policy posture is not available");
  }
  if (repo.expiringSoonWaivers.length > 0) {
    score += 20;
    reasons.push(`${repo.expiringSoonWaivers.length} waiver(s) expire soon`);
  }
  if (repo.expiredWaivers.length > 0 || repo.unmatchedActiveWaivers.length > 0) {
    score += 25;
    reasons.push("waiver lifecycle has expired or unmatched active waivers");
  }
  if (repo.openSpecDebt > 0 || repo.bootstrapSpecDebt > 0) {
    score += 30;
    reasons.push(`${repo.openSpecDebt + repo.bootstrapSpecDebt} spec debt record(s) need attention`);
  }
  if (isReleaseDriftHotspot(repo.releaseDriftStatus)) {
    score += 25;
    reasons.push(`release drift status is ${repo.releaseDriftStatus}`);
  }

  return {
    score,
    level: score >= 60 ? "high" : score >= 25 ? "medium" : "low",
    reasons,
  };
}

function resolveSnapshotInputs(
  root: string,
  snapshotInputs: string[],
  directoryInputs: string[],
): { snapshotPaths: string[]; missingSnapshots: MultiRepoGovernanceMissingSnapshot[] } {
  const explicit = snapshotInputs.map((entry) => ({
    inputPath: entry,
    resolvedPath: path.resolve(root, entry),
  }));
  const discovered = (directoryInputs.length > 0 ? directoryInputs : [root])
    .flatMap((directoryPath) => discoverSnapshotPaths(directoryPath));
  const existingExplicit = explicit
    .filter((entry) => fs.existsSync(entry.resolvedPath))
    .map((entry) => entry.resolvedPath);
  const missingSnapshots = explicit
    .filter((entry) => !fs.existsSync(entry.resolvedPath))
    .map((entry) => ({
      inputPath: normalizePath(path.isAbsolute(entry.inputPath) ? entry.inputPath : path.resolve(root, entry.inputPath)),
      resolvedPath: normalizePath(entry.resolvedPath),
      reason: "snapshot_not_found" as const,
    }));

  return {
    snapshotPaths: stableUnique([...existingExplicit, ...discovered].filter((snapshotPath) => fs.existsSync(snapshotPath)))
      .map((snapshotPath) => path.resolve(snapshotPath)),
    missingSnapshots,
  };
}

function discoverSnapshotPaths(directoryPath: string): string[] {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }
  const stat = fs.statSync(directoryPath);
  if (stat.isFile()) {
    return directoryPath.endsWith(".json") ? [directoryPath] : [];
  }

  const candidates = [path.join(directoryPath, DEFAULT_SNAPSHOT_PATH)];
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const childPath = path.join(directoryPath, entry.name);
    if (entry.isFile() && entry.name === "governance-snapshot.json") {
      candidates.push(childPath);
    }
    if (entry.isDirectory()) {
      candidates.push(path.join(childPath, DEFAULT_SNAPSHOT_PATH));
    }
  }

  return candidates.filter((candidate) => fs.existsSync(candidate));
}

function loadSnapshot(snapshotPath: string): { snapshotPath: string; snapshot: MultiRepoGovernanceSnapshot } {
  const data = JSON.parse(fs.readFileSync(snapshotPath, "utf-8")) as MultiRepoGovernanceSnapshot;
  validateSnapshot(data, snapshotPath);
  return { snapshotPath: normalizePath(path.resolve(snapshotPath)), snapshot: data };
}

function validateSnapshot(snapshot: MultiRepoGovernanceSnapshot, snapshotPath: string): void {
  if (snapshot.schemaVersion !== 1 || snapshot.kind !== "jispec-multi-repo-governance-snapshot") {
    throw new Error(`Invalid governance snapshot at ${snapshotPath}: unsupported schema or kind.`);
  }
  if (!snapshot.boundary?.readOnlySnapshot || snapshot.boundary.scansSourceCode || snapshot.boundary.runsVerify || snapshot.boundary.replacesCliGate) {
    throw new Error(`Invalid governance snapshot at ${snapshotPath}: boundary does not preserve exported read-only semantics.`);
  }
  if (!snapshot.repo?.id || !snapshot.repo?.name || !snapshot.aggregateHints || !Array.isArray(snapshot.governanceObjects)) {
    throw new Error(`Invalid governance snapshot at ${snapshotPath}: missing repo, aggregate hints, or governance objects.`);
  }
  if (snapshot.contract && (snapshot.contract.snapshotContractVersion !== 1 || snapshot.contract.compatibleAggregateVersion !== 1)) {
    throw new Error(`Invalid governance snapshot at ${snapshotPath}: unsupported multi-repo snapshot contract.`);
  }
}

function resolveOutPath(root: string, outPath?: string): string {
  const target = outPath ?? DEFAULT_AGGREGATE_PATH;
  return path.isAbsolute(target) ? target : path.join(root, target);
}

function numberHint(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function stringHint(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value : "not_available_yet";
}

function stringArrayHint(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean).sort((left, right) => left.localeCompare(right)) : [];
}

function contractRefArrayHint(value: unknown): MultiRepoContractRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isRecord)
    .map((entry) => ({
      ref: stringHint(entry.ref),
      hash: stringHint(entry.hash),
    }))
    .filter((entry) => !isMissing(entry.ref) && !isMissing(entry.hash))
    .sort((left, right) => left.ref.localeCompare(right.ref));
}

function isReleaseDriftHotspot(status: string): boolean {
  return !["unchanged", "not_available_yet", "not_declared"].includes(status);
}

function isMissing(value: string): boolean {
  return value === "not_available_yet" || value === "not_declared" || value.trim().length === 0;
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  return entries.length > 0 ? entries.map(([key, value]) => `${key}=${value}`).join(", ") : "none";
}

function formatRiskRepos(repos: MultiRepoGovernanceRepoPosture[]): string[] {
  if (repos.length === 0) {
    return ["- None"];
  }
  return repos.map((repo) => `- ${repo.repoName} (${repo.repoId}): ${repo.risk.level} risk, score ${repo.risk.score}; ${repo.risk.reasons.join("; ")}`);
}

function formatRepoGroup(repos: MultiRepoGovernanceRepoGroupEntry[]): string[] {
  if (repos.length === 0) {
    return ["- not_available_yet"];
  }
  return repos.map((repo) =>
    `- ${repo.id} (${repo.role}) ${repo.snapshotStatus}: upstream=${formatList(repo.upstreamContractRefs)}, downstream=${formatList(repo.downstreamContractRefs)}`,
  );
}

function formatContractDriftHints(hints: CrossRepoContractDriftHint[]): string[] {
  if (hints.length === 0) {
    return ["- None"];
  }
  return hints.map((hint) =>
    `- ${hint.upstreamRepoId} -> ${hint.downstreamRepoId} ${hint.contractRef}: ${hint.upstreamHash} != ${hint.downstreamHash}; ${hint.suggestedCommand}`,
  );
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function formatWaiverRefs(refs: Array<{ repoId: string; repoName: string; waiverId: string }>, label: string): string[] {
  if (refs.length === 0) {
    return [`- No ${label} waivers`];
  }
  return refs.map((ref) => `- ${ref.repoName} (${ref.repoId}): ${label} waiver ${ref.waiverId}`);
}

function formatSpecDebtHotspots(hotspots: Array<{ repoId: string; repoName: string; openSpecDebt: number; bootstrapSpecDebt: number }>): string[] {
  if (hotspots.length === 0) {
    return ["- None"];
  }
  return hotspots.map((hotspot) => `- ${hotspot.repoName} (${hotspot.repoId}): open=${hotspot.openSpecDebt}, bootstrap=${hotspot.bootstrapSpecDebt}`);
}

function formatReleaseDriftHotspots(hotspots: Array<{ repoId: string; repoName: string; status: string; comparisons: number }>): string[] {
  if (hotspots.length === 0) {
    return ["- None"];
  }
  return hotspots.map((hotspot) => `- ${hotspot.repoName} (${hotspot.repoId}): ${hotspot.status}, comparisons=${hotspot.comparisons}`);
}

function formatMissingSnapshots(missingSnapshots: MultiRepoGovernanceMissingSnapshot[]): string[] {
  if (missingSnapshots.length === 0) {
    return ["- None"];
  }
  return missingSnapshots.map((entry) => `- ${entry.inputPath}: ${entry.reason}`);
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
