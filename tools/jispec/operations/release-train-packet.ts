import fs from "node:fs";
import path from "node:path";
import { inspectAuditLedger } from "../audit/event-ledger";

export type ReleaseTrainPacketStatus = "ready" | "blocked";
export type ReleaseTrainRepoStatus = "ready" | "blocked";

export interface ReleaseTrainPacket {
  schemaVersion: 1;
  kind: "jispec-release-train-packet";
  generatedAt: string;
  root: string;
  status: ReleaseTrainPacketStatus;
  boundary: {
    localOnly: true;
    sourceUploadRequired: false;
    realtimeCollaborationRequired: false;
    executesCommands: false;
    replacesVerify: false;
    replacesDoctorGlobal: false;
    replacesPostReleaseGate: false;
    deferredSurfacesDiagnosticOnly: true;
  };
  sourceAggregate: {
    status: string;
    sourcePath: string;
    repoCount: number;
    promotionReady: boolean;
  };
  releaseCompare: {
    status: string;
    sourcePath: string;
    overallStatus: string;
    globalContextStatus: string;
    relevantOwnerActionCount: number;
  };
  trainReadiness: {
    ready: boolean;
    blockedRepoCount: number;
    ownerAssignmentCount: number;
    requiredReviewCount: number;
    dueSoonReviewCount: number;
    overdueReviewCount: number;
    escalatedReviewCount: number;
    safeNextCommand: string;
  };
  repos: ReleaseTrainRepo[];
  ownerAssignments: ReleaseTrainOwnerAssignment[];
  requiredReviews: ReleaseTrainRequiredReview[];
  auditEvidenceRefs: Array<{
    type: string;
    actor: string;
    sourceArtifact: string;
    affectedContracts: string[];
  }>;
  verifyBoundaryStatement: string;
  blockers: string[];
}

export interface ReleaseTrainRepo {
  repoId: string;
  role: string;
  owner: string;
  status: ReleaseTrainRepoStatus;
  blockedReasons: string[];
  ownerAssignmentCount: number;
  requiredReviewCount: number;
  dueSoonReviewCount: number;
  overdueReviewCount: number;
  escalatedReviewCount: number;
}

export interface ReleaseTrainOwnerAssignment {
  actionId: string;
  repoId: string;
  teamId: string;
  owner: string;
  reviewers: string[];
  escalationPath: string[];
  command: string;
  affectedContracts: string[];
  sourceArtifact: string;
}

export interface ReleaseTrainRequiredReview {
  reviewId: string;
  repoId: string;
  reviewer: string;
  owner: string;
  teamId: string;
  slaBucket: string;
  status: string;
  dueAt: string;
  command: string;
  affectedContracts: string[];
  escalationPath: string[];
  sourceArtifact: string;
}

export interface ReleaseTrainPacketWriteResult {
  root: string;
  packetPath: string;
  summaryPath: string;
  packet: ReleaseTrainPacket;
}

const DEFAULT_PACKET_PATH = ".spec/operations/release-train-packet.json";
const AGGREGATE_PATH = ".spec/console/multi-repo-governance.json";
const RELEASE_COMPARE_PATH = ".spec/releases/compare/v1-to-current/compare-report.json";
const RELEASE_DRIFT_TREND_PATH = ".spec/releases/drift-trend.json";
const ORG_GRAPH_PATH = ".spec/operations/org-responsibility-graph.json";
const OPS_AGING_LEDGER_PATH = ".spec/operations/ops-aging-ledger.json";

export function buildReleaseTrainPacket(rootInput: string): ReleaseTrainPacket {
  const root = path.resolve(rootInput);
  const aggregate = readJson(path.join(root, AGGREGATE_PATH));
  const driftTrend = readJson(path.join(root, RELEASE_DRIFT_TREND_PATH));
  const releaseComparePath = resolveReleaseComparePath(driftTrend);
  const releaseCompare = readJson(path.join(root, releaseComparePath));
  const orgGraph = readJson(path.join(root, ORG_GRAPH_PATH));
  const agingLedger = readJson(path.join(root, OPS_AGING_LEDGER_PATH));
  const audit = inspectAuditLedger(root);

  const repoGroup = isRecord(aggregate?.repoGroup) ? aggregate.repoGroup : {};
  const promotion = isRecord(aggregate?.promotionReadiness) ? aggregate.promotionReadiness : {};
  const driftSummary = isRecord(releaseCompare?.driftSummary) ? releaseCompare.driftSummary : {};
  const globalContext = isRecord(releaseCompare?.globalContext) ? releaseCompare.globalContext : {};
  const globalContextDetails = isRecord(globalContext.details) ? globalContext.details : {};
  const ownerAssignments = buildOwnerAssignments(orgGraph);
  const requiredReviews = buildRequiredReviews(agingLedger);
  const repos = buildRepos(repoGroup, ownerAssignments, requiredReviews);
  const auditEvidenceRefs = buildAuditEvidenceRefs(agingLedger, orgGraph, audit.events);
  const safeNextCommand = ownerAssignments[0]?.command ?? "npm run jispec-cli -- doctor global --write-release-train --json";
  const summary = {
    blockedRepoCount: repos.filter((repo) => repo.status === "blocked").length,
    ownerAssignmentCount: ownerAssignments.length,
    requiredReviewCount: requiredReviews.length,
    dueSoonReviewCount: requiredReviews.filter((review) => review.slaBucket === "due-soon").length,
    overdueReviewCount: requiredReviews.filter((review) => review.slaBucket === "overdue").length,
    escalatedReviewCount: requiredReviews.filter((review) => review.slaBucket === "escalated").length,
  };
  const blockers = buildBlockers({
    aggregate,
    releaseCompare,
    orgGraph,
    agingLedger,
    promotion,
    globalContext,
    ownerAssignments,
    requiredReviews,
    auditEvidenceRefs,
    safeNextCommand,
  });

  return {
    schemaVersion: 1,
    kind: "jispec-release-train-packet",
    generatedAt: new Date().toISOString(),
    root: normalizePath(root),
    status: blockers.length === 0 ? "ready" : "blocked",
    boundary: {
      localOnly: true,
      sourceUploadRequired: false,
      realtimeCollaborationRequired: false,
      executesCommands: false,
      replacesVerify: false,
      replacesDoctorGlobal: false,
      replacesPostReleaseGate: false,
      deferredSurfacesDiagnosticOnly: true,
    },
    sourceAggregate: {
      status: aggregate ? "available" : "missing",
      sourcePath: AGGREGATE_PATH,
      repoCount: Array.isArray(repoGroup.repos) ? repoGroup.repos.length : repos.length,
      promotionReady: promotion.ready === true,
    },
    releaseCompare: {
      status: releaseCompare ? "available" : "missing",
      sourcePath: releaseComparePath,
      overallStatus: stringValue(driftSummary.overallStatus) ?? "not_available_yet",
      globalContextStatus: stringValue(globalContext.status) ?? "not_available_yet",
      relevantOwnerActionCount: Array.isArray(globalContextDetails.relevantOwnerActions)
        ? globalContextDetails.relevantOwnerActions.length
        : 0,
    },
    trainReadiness: {
      ready: blockers.length === 0 && summary.blockedRepoCount === 0,
      ...summary,
      safeNextCommand,
    },
    repos,
    ownerAssignments,
    requiredReviews,
    auditEvidenceRefs,
    verifyBoundaryStatement: "Release train packet is local read-only evidence. It does not execute release commands, replace verify, replace post-release gate, override doctor global, upload source, or require real-time collaboration.",
    blockers,
  };
}

export function writeReleaseTrainPacket(rootInput: string, outPath: string = DEFAULT_PACKET_PATH): ReleaseTrainPacketWriteResult {
  const root = path.resolve(rootInput);
  const packetPath = path.resolve(root, outPath);
  const summaryPath = packetPath.replace(/\.json$/i, ".md");
  const packet = buildReleaseTrainPacket(root);

  fs.mkdirSync(path.dirname(packetPath), { recursive: true });
  fs.writeFileSync(packetPath, `${JSON.stringify(packet, null, 2)}\n`, "utf-8");
  fs.writeFileSync(summaryPath, renderReleaseTrainPacketMarkdown(packet), "utf-8");

  return {
    root: normalizePath(root),
    packetPath: normalizePath(path.relative(root, packetPath)),
    summaryPath: normalizePath(path.relative(root, summaryPath)),
    packet,
  };
}

export function renderReleaseTrainPacketMarkdown(packet: ReleaseTrainPacket): string {
  return [
    "# JiSpec Release Train Packet",
    "",
    "Human companion only. The machine source of truth is `.spec/operations/release-train-packet.json`.",
    "",
    `Generated at: ${packet.generatedAt}`,
    `Status: ${packet.status}`,
    `Train ready: ${packet.trainReadiness.ready}`,
    `Repos: ${packet.repos.length}`,
    `Blocked repos: ${packet.trainReadiness.blockedRepoCount}`,
    `Owner assignments: ${packet.trainReadiness.ownerAssignmentCount}`,
    `Required reviews: ${packet.trainReadiness.requiredReviewCount}`,
    `Safe next command: ${packet.trainReadiness.safeNextCommand}`,
    "",
    "## Boundary",
    "",
    `- ${packet.verifyBoundaryStatement}`,
    "- Deferred collaboration surfaces remain diagnostic-only.",
    "",
    "## Repos",
    "",
    ...(packet.repos.length > 0
      ? packet.repos.map((repo) => `- ${repo.repoId}: ${repo.status}, owner=${repo.owner}, reviews=${repo.requiredReviewCount}`)
      : ["- None"]),
    "",
    "## Required Reviews",
    "",
    ...(packet.requiredReviews.length > 0
      ? packet.requiredReviews.map((review) => `- ${review.reviewId}: ${review.slaBucket} (${review.reviewer} -> ${review.owner})`)
      : ["- None"]),
    "",
    "## Blockers",
    "",
    ...(packet.blockers.length > 0 ? packet.blockers.map((blocker) => `- ${blocker}`) : ["- None"]),
    "",
  ].join("\n");
}

function buildOwnerAssignments(orgGraph: Record<string, unknown> | undefined): ReleaseTrainOwnerAssignment[] {
  const assignments = Array.isArray(orgGraph?.ownerActionAssignments) ? orgGraph.ownerActionAssignments.filter(isRecord) : [];
  return assignments.map((assignment) => ({
    actionId: stringValue(assignment.actionId) ?? "unknown",
    repoId: stringValue(assignment.repoId) ?? "unknown",
    teamId: stringValue(assignment.teamId) ?? "unknown",
    owner: stringValue(assignment.owner) ?? "unknown",
    reviewers: stringArray(assignment.reviewers),
    escalationPath: stringArray(assignment.escalationPath),
    command: stringValue(assignment.command) ?? "not_available_yet",
    affectedContracts: stringArray(assignment.affectedContracts),
    sourceArtifact: ORG_GRAPH_PATH,
  }));
}

function buildRequiredReviews(agingLedger: Record<string, unknown> | undefined): ReleaseTrainRequiredReview[] {
  const entries = Array.isArray(agingLedger?.entries) ? agingLedger.entries.filter(isRecord) : [];
  return entries.map((entry) => ({
    reviewId: stringValue(entry.sourceItemId) ?? stringValue(entry.ledgerId) ?? "unknown",
    repoId: stringValue(entry.repoId) ?? "unknown",
    reviewer: stringValue(entry.reviewer) ?? "unknown",
    owner: stringValue(entry.owner) ?? "unknown",
    teamId: stringValue(entry.teamId) ?? "unknown",
    slaBucket: stringValue(entry.slaBucket) ?? "unknown",
    status: stringValue(entry.status) ?? "unknown",
    dueAt: stringValue(entry.dueAt) ?? "not_available_yet",
    command: stringValue(entry.command) ?? "not_available_yet",
    affectedContracts: stringArray(entry.affectedContracts),
    escalationPath: stringArray(entry.escalationPath),
    sourceArtifact: OPS_AGING_LEDGER_PATH,
  }));
}

function buildRepos(
  repoGroup: Record<string, unknown>,
  assignments: ReleaseTrainOwnerAssignment[],
  reviews: ReleaseTrainRequiredReview[],
): ReleaseTrainRepo[] {
  const groupRepos = Array.isArray(repoGroup.repos) ? repoGroup.repos.filter(isRecord) : [];
  const repoIds = stableUnique([
    ...groupRepos.map((repo) => stringValue(repo.id) ?? "unknown"),
    ...assignments.map((assignment) => assignment.repoId),
    ...reviews.map((review) => review.repoId),
  ]).filter((repoId) => repoId !== "unknown");

  return repoIds.map((repoId) => {
    const groupRepo = groupRepos.find((repo) => stringValue(repo.id) === repoId);
    const repoAssignments = assignments.filter((assignment) => assignment.repoId === repoId);
    const repoReviews = reviews.filter((review) => review.repoId === repoId);
    const blockedReasons = [
      ...repoReviews.filter((review) => review.slaBucket === "overdue").map((review) => `overdue:${review.reviewId}`),
      ...repoReviews.filter((review) => review.slaBucket === "escalated").map((review) => `escalated:${review.reviewId}`),
    ];
    return {
      repoId,
      role: stringValue(groupRepo?.role) ?? "unknown",
      owner: stringValue(groupRepo?.owner) ?? repoAssignments[0]?.owner ?? "unknown",
      status: blockedReasons.length === 0 ? "ready" : "blocked",
      blockedReasons,
      ownerAssignmentCount: repoAssignments.length,
      requiredReviewCount: repoReviews.length,
      dueSoonReviewCount: repoReviews.filter((review) => review.slaBucket === "due-soon").length,
      overdueReviewCount: repoReviews.filter((review) => review.slaBucket === "overdue").length,
      escalatedReviewCount: repoReviews.filter((review) => review.slaBucket === "escalated").length,
    };
  });
}

function buildAuditEvidenceRefs(
  agingLedger: Record<string, unknown> | undefined,
  orgGraph: Record<string, unknown> | undefined,
  events: unknown[],
): ReleaseTrainPacket["auditEvidenceRefs"] {
  const ledgerRefs = Array.isArray(agingLedger?.auditEvidenceRefs) ? agingLedger.auditEvidenceRefs.filter(isRecord) : [];
  const graphRefs = Array.isArray(orgGraph?.auditEvidenceRefs) ? orgGraph.auditEvidenceRefs.filter(isRecord) : [];
  const refs = [...ledgerRefs, ...graphRefs];
  const sourceRefs = refs.length > 0 ? refs : events.slice(-20).filter(isRecord);
  return sourceRefs.map((event) => ({
    type: String(event.type ?? "unknown"),
    actor: String(event.actor ?? "unknown"),
    sourceArtifact: isRecord(event.sourceArtifact) ? String(event.sourceArtifact.path ?? "not_available_yet") : String(event.sourceArtifact ?? "not_available_yet"),
    affectedContracts: stringArray(event.affectedContracts),
  }));
}

function resolveReleaseComparePath(driftTrend: Record<string, unknown> | undefined): string {
  const latest = isRecord(driftTrend?.latest) ? driftTrend.latest : {};
  const reportPath = stringValue(latest.reportPath);
  return reportPath ?? RELEASE_COMPARE_PATH;
}

function buildBlockers(input: {
  aggregate: Record<string, unknown> | undefined;
  releaseCompare: Record<string, unknown> | undefined;
  orgGraph: Record<string, unknown> | undefined;
  agingLedger: Record<string, unknown> | undefined;
  promotion: Record<string, unknown>;
  globalContext: Record<string, unknown>;
  ownerAssignments: ReleaseTrainOwnerAssignment[];
  requiredReviews: ReleaseTrainRequiredReview[];
  auditEvidenceRefs: ReleaseTrainPacket["auditEvidenceRefs"];
  safeNextCommand: string;
}): string[] {
  const blockers: string[] = [];
  if (!input.aggregate) {
    blockers.push("multi_repo_aggregate_missing");
  }
  if (input.promotion.ready !== true) {
    blockers.push("promotion_readiness_not_ready");
  }
  if (!input.releaseCompare) {
    blockers.push("release_compare_missing");
  }
  if (stringValue(input.globalContext.status) !== "available") {
    blockers.push("release_compare_global_context_missing");
  }
  if (!input.orgGraph || input.orgGraph.status !== "ready") {
    blockers.push("org_responsibility_graph_not_ready");
  }
  if (!input.agingLedger || input.agingLedger.status !== "ready") {
    blockers.push("ops_aging_ledger_not_ready");
  }
  if (input.ownerAssignments.length === 0) {
    blockers.push("owner_assignments_missing");
  }
  if (input.requiredReviews.length === 0) {
    blockers.push("required_reviews_missing");
  }
  if (!isKnown(input.safeNextCommand)) {
    blockers.push("safe_next_command_missing");
  }
  if (input.auditEvidenceRefs.length === 0) {
    blockers.push("audit_evidence_missing");
  }
  return blockers;
}

function readJson(filePath: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter((entry) => entry.trim().length > 0) : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function stableUnique(values: string[]): string[] {
  return [...new Set(values)];
}

function isKnown(value: string): boolean {
  return value.trim().length > 0 && value !== "unknown" && value !== "not_available_yet";
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
