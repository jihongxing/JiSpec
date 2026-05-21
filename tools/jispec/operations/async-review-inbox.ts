import fs from "node:fs";
import path from "node:path";
import { inspectAuditLedger } from "../audit/event-ledger";

export type AsyncReviewInboxStatus = "ready" | "blocked";
export type AsyncReviewItemStatus = "pending" | "accepted" | "blocked" | "expired";

export interface AsyncReviewInbox {
  schemaVersion: 1;
  kind: "jispec-async-review-inbox";
  generatedAt: string;
  root: string;
  status: AsyncReviewInboxStatus;
  boundary: {
    localOnly: true;
    sourceUploadRequired: false;
    realtimeCollaborationRequired: false;
    executesCommands: false;
    replacesVerify: false;
    replacesDoctorGlobal: false;
    deferredSurfacesDiagnosticOnly: true;
  };
  sourceGraph: {
    status: string;
    sourcePath: string;
    teamCount: number;
    repoCount: number;
    ownerActionAssignmentCount: number;
  };
  summary: {
    reviewerCount: number;
    totalItems: number;
    pending: number;
    accepted: number;
    blocked: number;
    expired: number;
    reviewersMissing: number;
    escalationReadyItems: number;
  };
  reviewers: ReviewerInbox[];
  items: AsyncReviewItem[];
  auditEvidenceRefs: Array<{
    type: string;
    actor: string;
    sourceArtifact: string;
    affectedContracts: string[];
  }>;
  verifyBoundaryStatement: string;
  blockers: string[];
}

export interface ReviewerInbox {
  reviewer: string;
  ownerTeams: string[];
  pending: string[];
  accepted: string[];
  blocked: string[];
  expired: string[];
  escalationPath: string[];
}

export interface AsyncReviewItem {
  requestId: string;
  kind: "owner_action_review";
  status: AsyncReviewItemStatus;
  reviewer: string;
  owner: string;
  teamId: string;
  repoId: string;
  actionId: string;
  command: string;
  affectedContracts: string[];
  escalationPath: string[];
  sourceArtifact: string;
}

export interface AsyncReviewInboxWriteResult {
  root: string;
  inboxPath: string;
  summaryPath: string;
  inbox: AsyncReviewInbox;
}

const DEFAULT_INBOX_PATH = ".spec/operations/async-review-inbox.json";
const ORG_GRAPH_PATH = ".spec/operations/org-responsibility-graph.json";

export function buildAsyncReviewInbox(rootInput: string): AsyncReviewInbox {
  const root = path.resolve(rootInput);
  const graph = readJson(path.join(root, ORG_GRAPH_PATH));
  const audit = inspectAuditLedger(root);
  const assignments = Array.isArray(graph?.ownerActionAssignments) ? graph.ownerActionAssignments.filter(isRecord) : [];
  const items = assignments.flatMap((assignment) => buildReviewItems(assignment, audit.events));
  const reviewers = buildReviewerInboxes(items);
  const auditEvidenceRefs = buildAuditEvidenceRefs(graph, audit.events);
  const summary = {
    reviewerCount: reviewers.length,
    totalItems: items.length,
    pending: items.filter((item) => item.status === "pending").length,
    accepted: items.filter((item) => item.status === "accepted").length,
    blocked: items.filter((item) => item.status === "blocked").length,
    expired: items.filter((item) => item.status === "expired").length,
    reviewersMissing: assignments.filter((assignment) => stringArray(assignment.reviewers).length === 0).length,
    escalationReadyItems: items.filter((item) => item.escalationPath.length > 0).length,
  };
  const blockers = buildBlockers({ graph, assignments, items, reviewers, summary, auditEvidenceRefs });

  return {
    schemaVersion: 1,
    kind: "jispec-async-review-inbox",
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
      deferredSurfacesDiagnosticOnly: true,
    },
    sourceGraph: {
      status: stringValue(graph?.status) ?? "not_available_yet",
      sourcePath: ORG_GRAPH_PATH,
      teamCount: numberValue(isRecord(graph?.orgTopology) ? graph.orgTopology.teamCount : undefined) ?? 0,
      repoCount: numberValue(isRecord(graph?.orgTopology) ? graph.orgTopology.repoCount : undefined) ?? 0,
      ownerActionAssignmentCount: assignments.length,
    },
    summary,
    reviewers,
    items,
    auditEvidenceRefs,
    verifyBoundaryStatement: "Async review inbox is local read-only evidence. It does not notify remote services, require real-time collaboration, execute review commands, upload source, replace verify, or override doctor global.",
    blockers,
  };
}

export function writeAsyncReviewInbox(rootInput: string, outPath: string = DEFAULT_INBOX_PATH): AsyncReviewInboxWriteResult {
  const root = path.resolve(rootInput);
  const inboxPath = path.resolve(root, outPath);
  const summaryPath = inboxPath.replace(/\.json$/i, ".md");
  const inbox = buildAsyncReviewInbox(root);

  fs.mkdirSync(path.dirname(inboxPath), { recursive: true });
  fs.writeFileSync(inboxPath, `${JSON.stringify(inbox, null, 2)}\n`, "utf-8");
  fs.writeFileSync(summaryPath, renderAsyncReviewInboxMarkdown(inbox), "utf-8");

  return {
    root: normalizePath(root),
    inboxPath: normalizePath(path.relative(root, inboxPath)),
    summaryPath: normalizePath(path.relative(root, summaryPath)),
    inbox,
  };
}

export function renderAsyncReviewInboxMarkdown(inbox: AsyncReviewInbox): string {
  return [
    "# JiSpec Async Review Inbox",
    "",
    "Human companion only. The machine source of truth is `.spec/operations/async-review-inbox.json`.",
    "",
    `Generated at: ${inbox.generatedAt}`,
    `Status: ${inbox.status}`,
    `Reviewers: ${inbox.summary.reviewerCount}`,
    `Items: ${inbox.summary.totalItems}`,
    `Pending: ${inbox.summary.pending}`,
    `Accepted: ${inbox.summary.accepted}`,
    `Blocked: ${inbox.summary.blocked}`,
    `Expired: ${inbox.summary.expired}`,
    "",
    "## Boundary",
    "",
    `- ${inbox.verifyBoundaryStatement}`,
    "- Deferred collaboration surfaces remain diagnostic-only.",
    "",
    "## Reviewer Inboxes",
    "",
    ...(inbox.reviewers.length > 0
      ? inbox.reviewers.map((reviewer) => `- ${reviewer.reviewer}: pending=${reviewer.pending.length}, accepted=${reviewer.accepted.length}, blocked=${reviewer.blocked.length}, expired=${reviewer.expired.length}`)
      : ["- None"]),
    "",
    "## Blockers",
    "",
    ...(inbox.blockers.length > 0 ? inbox.blockers.map((blocker) => `- ${blocker}`) : ["- None"]),
    "",
  ].join("\n");
}

function buildReviewItems(assignment: Record<string, unknown>, auditEvents: unknown[]): AsyncReviewItem[] {
  const reviewers = stringArray(assignment.reviewers);
  if (reviewers.length === 0) {
    return [];
  }

  return reviewers.map((reviewer) => {
    const actionId = stringValue(assignment.actionId) ?? "unknown";
    const status = inferReviewStatus(actionId, reviewer, auditEvents);
    return {
      requestId: `review:${reviewer}:${actionId}`,
      kind: "owner_action_review",
      status,
      reviewer,
      owner: stringValue(assignment.owner) ?? "unknown",
      teamId: stringValue(assignment.teamId) ?? "unknown",
      repoId: stringValue(assignment.repoId) ?? "unknown",
      actionId,
      command: stringValue(assignment.command) ?? "not_available_yet",
      affectedContracts: stringArray(assignment.affectedContracts),
      escalationPath: stringArray(assignment.escalationPath),
      sourceArtifact: ORG_GRAPH_PATH,
    };
  });
}

function inferReviewStatus(actionId: string, reviewer: string, auditEvents: unknown[]): AsyncReviewItemStatus {
  const matching = auditEvents.filter((event) => {
    if (!isRecord(event)) {
      return false;
    }
    const actor = stringValue(event.actor);
    const target = stringValue(event.target) ?? stringValue(event.reviewTarget) ?? stringValue(event.actionId);
    return actor === reviewer && target === actionId;
  });
  if (matching.some((event) => isRecord(event) && event.type === "async_review_expired")) {
    return "expired";
  }
  if (matching.some((event) => isRecord(event) && event.type === "async_review_blocked")) {
    return "blocked";
  }
  if (matching.some((event) => isRecord(event) && event.type === "async_review_accepted")) {
    return "accepted";
  }
  return "pending";
}

function buildReviewerInboxes(items: AsyncReviewItem[]): ReviewerInbox[] {
  const byReviewer = new Map<string, AsyncReviewItem[]>();
  for (const item of items) {
    byReviewer.set(item.reviewer, [...(byReviewer.get(item.reviewer) ?? []), item]);
  }

  return [...byReviewer.entries()]
    .map(([reviewer, reviewerItems]) => ({
      reviewer,
      ownerTeams: stableUnique(reviewerItems.map((item) => item.teamId)),
      pending: idsByStatus(reviewerItems, "pending"),
      accepted: idsByStatus(reviewerItems, "accepted"),
      blocked: idsByStatus(reviewerItems, "blocked"),
      expired: idsByStatus(reviewerItems, "expired"),
      escalationPath: stableUnique(reviewerItems.flatMap((item) => item.escalationPath)),
    }))
    .sort((left, right) => left.reviewer.localeCompare(right.reviewer));
}

function buildAuditEvidenceRefs(graph: Record<string, unknown> | undefined, events: unknown[]): AsyncReviewInbox["auditEvidenceRefs"] {
  const graphRefs = Array.isArray(graph?.auditEvidenceRefs) ? graph.auditEvidenceRefs.filter(isRecord) : [];
  const refs = graphRefs.length > 0 ? graphRefs : events.slice(-20).filter(isRecord);
  return refs.map((event) => ({
    type: String(event.type ?? "unknown"),
    actor: String(event.actor ?? "unknown"),
    sourceArtifact: isRecord(event.sourceArtifact) ? String(event.sourceArtifact.path ?? "not_available_yet") : String(event.sourceArtifact ?? "not_available_yet"),
    affectedContracts: stringArray(event.affectedContracts),
  }));
}

function buildBlockers(input: {
  graph: Record<string, unknown> | undefined;
  assignments: Record<string, unknown>[];
  items: AsyncReviewItem[];
  reviewers: ReviewerInbox[];
  summary: AsyncReviewInbox["summary"];
  auditEvidenceRefs: AsyncReviewInbox["auditEvidenceRefs"];
}): string[] {
  const blockers: string[] = [];
  if (!input.graph) {
    blockers.push("org_responsibility_graph_missing");
  } else if (input.graph.status !== "ready") {
    blockers.push("org_responsibility_graph_not_ready");
  }
  if (input.assignments.length === 0) {
    blockers.push("owner_action_assignments_missing");
  }
  if (input.summary.reviewersMissing > 0 || input.reviewers.length === 0 || input.items.length === 0) {
    blockers.push("reviewer_inbox_missing");
  }
  if (input.summary.escalationReadyItems < input.summary.totalItems) {
    blockers.push("review_escalation_missing");
  }
  if (input.auditEvidenceRefs.length === 0) {
    blockers.push("audit_evidence_missing");
  }
  return blockers;
}

function idsByStatus(items: AsyncReviewItem[], status: AsyncReviewItemStatus): string[] {
  return items.filter((item) => item.status === status).map((item) => item.requestId).sort((left, right) => left.localeCompare(right));
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

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((left, right) => left.localeCompare(right));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter((entry) => entry.trim().length > 0) : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

