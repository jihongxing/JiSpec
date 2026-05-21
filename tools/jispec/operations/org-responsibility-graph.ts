import fs from "node:fs";
import path from "node:path";
import { inspectAuditLedger } from "../audit/event-ledger";

export type OrgResponsibilityGraphStatus = "ready" | "blocked";

export interface OrgResponsibilityGraph {
  schemaVersion: 1;
  kind: "jispec-org-responsibility-graph";
  generatedAt: string;
  root: string;
  status: OrgResponsibilityGraphStatus;
  boundary: {
    localOnly: true;
    sourceUploadRequired: false;
    realtimeCollaborationRequired: false;
    executesCommands: false;
    replacesVerify: false;
    replacesDoctorGlobal: false;
    deferredSurfacesDiagnosticOnly: true;
  };
  orgTopology: {
    orgId: string;
    sourcePath: string;
    teamCount: number;
    repoCount: number;
    teams: OrgTeam[];
    repos: OrgRepo[];
  };
  responsibilityEdges: ResponsibilityEdge[];
  ownerActionAssignments: OwnerActionAssignment[];
  reviewerCoverage: {
    totalOwnerActions: number;
    actionsWithOwner: number;
    actionsWithReviewer: number;
    actionsWithEscalation: number;
  };
  auditEvidenceRefs: Array<{
    type: string;
    actor: string;
    sourceArtifact: string;
    affectedContracts: string[];
  }>;
  verifyBoundaryStatement: string;
  blockers: string[];
}

export interface OrgTeam {
  id: string;
  name: string;
  owner: string;
  reviewers: string[];
  escalation: string[];
}

export interface OrgRepo {
  id: string;
  ownerTeamId: string;
  owner: string;
  role: string;
}

export interface ResponsibilityEdge {
  repoId: string;
  teamId: string;
  owner: string;
  reviewers: string[];
  escalationPath: string[];
  source: "org-topology" | "global-operations-packet" | "multi-repo-governance";
}

export interface OwnerActionAssignment {
  actionId: string;
  repoId: string;
  teamId: string;
  owner: string;
  reviewers: string[];
  escalationPath: string[];
  command: string;
  affectedContracts: string[];
}

export interface OrgResponsibilityGraphWriteResult {
  root: string;
  graphPath: string;
  summaryPath: string;
  graph: OrgResponsibilityGraph;
}

const DEFAULT_GRAPH_PATH = ".spec/operations/org-responsibility-graph.json";
const ORG_TOPOLOGY_PATH = ".spec/operations/org-topology.json";
const GLOBAL_OPERATIONS_PACKET_PATH = ".spec/operations/global-operations-packet.json";

export function buildOrgResponsibilityGraph(rootInput: string): OrgResponsibilityGraph {
  const root = path.resolve(rootInput);
  const topology = readJson(path.join(root, ORG_TOPOLOGY_PATH));
  const packet = readJson(path.join(root, GLOBAL_OPERATIONS_PACKET_PATH));
  const aggregate = readJson(path.join(root, ".spec", "console", "multi-repo-governance.json"));
  const audit = inspectAuditLedger(root);

  const repos = buildRepos(topology, packet, aggregate);
  const teams = buildTeams(topology, repos);
  const edges = buildResponsibilityEdges(topology, repos, teams);
  const assignments = buildOwnerActionAssignments(packet, aggregate, edges, teams);
  const auditEvidenceRefs = buildAuditEvidenceRefs(packet, audit.events);
  const reviewerCoverage = {
    totalOwnerActions: assignments.length,
    actionsWithOwner: assignments.filter((assignment) => isKnown(assignment.owner) && isKnown(assignment.teamId)).length,
    actionsWithReviewer: assignments.filter((assignment) => assignment.reviewers.length > 0).length,
    actionsWithEscalation: assignments.filter((assignment) => assignment.escalationPath.length > 0).length,
  };
  const blockers = buildBlockers({
    packet,
    repos,
    teams,
    assignments,
    reviewerCoverage,
    auditEvidenceRefs,
  });

  return {
    schemaVersion: 1,
    kind: "jispec-org-responsibility-graph",
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
    orgTopology: {
      orgId: stringValue(topology?.orgId) ?? stringValue(aggregate?.orgId) ?? "local-org",
      sourcePath: topology ? ORG_TOPOLOGY_PATH : GLOBAL_OPERATIONS_PACKET_PATH,
      teamCount: teams.length,
      repoCount: repos.length,
      teams,
      repos,
    },
    responsibilityEdges: edges,
    ownerActionAssignments: assignments,
    reviewerCoverage,
    auditEvidenceRefs,
    verifyBoundaryStatement: "Org responsibility graph is local read-only evidence. It does not execute owner action commands, upload source, replace verify, override doctor global, or require real-time collaboration.",
    blockers,
  };
}

export function writeOrgResponsibilityGraph(rootInput: string, outPath: string = DEFAULT_GRAPH_PATH): OrgResponsibilityGraphWriteResult {
  const root = path.resolve(rootInput);
  const graphPath = path.resolve(root, outPath);
  const summaryPath = graphPath.replace(/\.json$/i, ".md");
  const graph = buildOrgResponsibilityGraph(root);

  fs.mkdirSync(path.dirname(graphPath), { recursive: true });
  fs.writeFileSync(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf-8");
  fs.writeFileSync(summaryPath, renderOrgResponsibilityGraphMarkdown(graph), "utf-8");

  return {
    root: normalizePath(root),
    graphPath: normalizePath(path.relative(root, graphPath)),
    summaryPath: normalizePath(path.relative(root, summaryPath)),
    graph,
  };
}

export function renderOrgResponsibilityGraphMarkdown(graph: OrgResponsibilityGraph): string {
  return [
    "# JiSpec Org Responsibility Graph",
    "",
    "Human companion only. The machine source of truth is `.spec/operations/org-responsibility-graph.json`.",
    "",
    `Generated at: ${graph.generatedAt}`,
    `Status: ${graph.status}`,
    `Org: ${graph.orgTopology.orgId}`,
    `Teams: ${graph.orgTopology.teamCount}`,
    `Repos: ${graph.orgTopology.repoCount}`,
    `Owner actions: ${graph.ownerActionAssignments.length}`,
    `Reviewer coverage: ${graph.reviewerCoverage.actionsWithReviewer}/${graph.reviewerCoverage.totalOwnerActions}`,
    `Escalation coverage: ${graph.reviewerCoverage.actionsWithEscalation}/${graph.reviewerCoverage.totalOwnerActions}`,
    "",
    "## Boundary",
    "",
    `- ${graph.verifyBoundaryStatement}`,
    "- Deferred collaboration surfaces remain diagnostic-only.",
    "",
    "## Responsibility Edges",
    "",
    ...(graph.responsibilityEdges.length > 0
      ? graph.responsibilityEdges.map((edge) => `- ${edge.repoId} -> ${edge.teamId} (${edge.owner})`)
      : ["- None"]),
    "",
    "## Owner Action Assignments",
    "",
    ...(graph.ownerActionAssignments.length > 0
      ? graph.ownerActionAssignments.map((assignment) => `- ${assignment.actionId}: ${assignment.teamId}/${assignment.owner} -> ${assignment.command}`)
      : ["- None"]),
    "",
    "## Blockers",
    "",
    ...(graph.blockers.length > 0 ? graph.blockers.map((blocker) => `- ${blocker}`) : ["- None"]),
    "",
  ].join("\n");
}

function buildRepos(
  topology: Record<string, unknown> | undefined,
  packet: Record<string, unknown> | undefined,
  aggregate: Record<string, unknown> | undefined,
): OrgRepo[] {
  const explicitAssignments = Array.isArray(topology?.repoAssignments) ? topology.repoAssignments.filter(isRecord) : [];
  const packetTopology = isRecord(packet?.repoGroupTopology) ? packet.repoGroupTopology : {};
  const aggregateRepoGroup = isRecord(aggregate?.repoGroup) ? aggregate.repoGroup : {};
  const rawRepos = Array.isArray(packetTopology.repos)
    ? packetTopology.repos.filter(isRecord)
    : Array.isArray(aggregateRepoGroup.repos)
      ? aggregateRepoGroup.repos.filter(isRecord)
      : [];

  return rawRepos.map((repo) => {
    const id = stringValue(repo.id) ?? "unknown";
    const owner = stringValue(repo.owner) ?? "unknown";
    const explicit = explicitAssignments.find((assignment) => stringValue(assignment.repoId) === id);
    return {
      id,
      ownerTeamId: stringValue(explicit?.teamId) ?? slugify(owner),
      owner,
      role: stringValue(repo.role) ?? "unknown",
    };
  });
}

function buildTeams(topology: Record<string, unknown> | undefined, repos: OrgRepo[]): OrgTeam[] {
  const explicitTeams = Array.isArray(topology?.teams) ? topology.teams.filter(isRecord) : [];
  if (explicitTeams.length > 0) {
    return explicitTeams.map((team) => ({
      id: stringValue(team.id) ?? slugify(stringValue(team.name) ?? "unknown"),
      name: stringValue(team.name) ?? stringValue(team.id) ?? "Unknown",
      owner: stringValue(team.owner) ?? "unknown",
      reviewers: stringArray(team.reviewers),
      escalation: stringArray(team.escalation),
    }));
  }

  const teams = new Map<string, OrgTeam>();
  for (const repo of repos) {
    if (!teams.has(repo.ownerTeamId)) {
      teams.set(repo.ownerTeamId, {
        id: repo.ownerTeamId,
        name: repo.owner,
        owner: repo.owner,
        reviewers: [],
        escalation: [],
      });
    }
  }
  return [...teams.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function buildResponsibilityEdges(
  topology: Record<string, unknown> | undefined,
  repos: OrgRepo[],
  teams: OrgTeam[],
): ResponsibilityEdge[] {
  const explicitAssignments = Array.isArray(topology?.repoAssignments) ? topology.repoAssignments.filter(isRecord) : [];
  return repos.map((repo) => {
    const team = teams.find((candidate) => candidate.id === repo.ownerTeamId);
    const explicit = explicitAssignments.find((assignment) => stringValue(assignment.repoId) === repo.id);
    return {
      repoId: repo.id,
      teamId: team?.id ?? repo.ownerTeamId,
      owner: team?.owner ?? repo.owner,
      reviewers: team?.reviewers ?? [],
      escalationPath: team?.escalation ?? [],
      source: explicit ? "org-topology" : "global-operations-packet",
    };
  });
}

function buildOwnerActionAssignments(
  packet: Record<string, unknown> | undefined,
  aggregate: Record<string, unknown> | undefined,
  edges: ResponsibilityEdge[],
  teams: OrgTeam[],
): OwnerActionAssignment[] {
  const packetActions = Array.isArray(packet?.ownerActionLifecycle) ? packet.ownerActionLifecycle.filter(isRecord) : [];
  const aggregateActions = Array.isArray(aggregate?.ownerActions) ? aggregate.ownerActions.filter(isRecord) : [];
  const rawActions = packetActions.length > 0 ? packetActions : aggregateActions;

  return rawActions.map((action) => {
    const repoId = stringValue(action.repoId) ?? "unknown";
    const edge = edges.find((candidate) => candidate.repoId === repoId);
    const team = teams.find((candidate) => candidate.id === edge?.teamId);
    return {
      actionId: stringValue(action.id) ?? "unknown",
      repoId,
      teamId: edge?.teamId ?? "unknown",
      owner: stringValue(action.owner) ?? edge?.owner ?? team?.owner ?? "unknown",
      reviewers: edge?.reviewers ?? team?.reviewers ?? [],
      escalationPath: edge?.escalationPath ?? team?.escalation ?? [],
      command: stringValue(action.command)
        ?? (isRecord(action.primaryCommand) ? stringValue(action.primaryCommand.command) : undefined)
        ?? "not_available_yet",
      affectedContracts: stringArray(action.affectedContracts),
    };
  });
}

function buildAuditEvidenceRefs(packet: Record<string, unknown> | undefined, events: unknown[]): OrgResponsibilityGraph["auditEvidenceRefs"] {
  const packetRefs = Array.isArray(packet?.auditEvidenceRefs) ? packet.auditEvidenceRefs.filter(isRecord) : [];
  const refs = packetRefs.length > 0 ? packetRefs : events.slice(-20).filter(isRecord);
  return refs.map((event) => ({
    type: String(event.type ?? "unknown"),
    actor: String(event.actor ?? "unknown"),
    sourceArtifact: isRecord(event.sourceArtifact) ? String(event.sourceArtifact.path ?? "not_available_yet") : String(event.sourceArtifact ?? "not_available_yet"),
    affectedContracts: stringArray(event.affectedContracts),
  }));
}

function buildBlockers(input: {
  packet: Record<string, unknown> | undefined;
  repos: OrgRepo[];
  teams: OrgTeam[];
  assignments: OwnerActionAssignment[];
  reviewerCoverage: OrgResponsibilityGraph["reviewerCoverage"];
  auditEvidenceRefs: OrgResponsibilityGraph["auditEvidenceRefs"];
}): string[] {
  const blockers: string[] = [];
  if (!input.packet) {
    blockers.push("global_operations_packet_missing");
  } else if (input.packet.status !== "ready") {
    blockers.push("global_operations_packet_not_ready");
  }
  if (input.repos.length === 0 || input.teams.length === 0) {
    blockers.push("repo_topology_missing");
  }
  if (input.assignments.length === 0) {
    blockers.push("owner_action_assignments_missing");
  }
  if (input.assignments.some((assignment) => !isKnown(assignment.owner) || !isKnown(assignment.teamId))) {
    blockers.push("owner_missing");
  }
  if (input.reviewerCoverage.actionsWithReviewer < input.reviewerCoverage.totalOwnerActions) {
    blockers.push("reviewer_coverage_incomplete");
  }
  if (input.reviewerCoverage.actionsWithEscalation < input.reviewerCoverage.totalOwnerActions) {
    blockers.push("escalation_path_missing");
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

function slugify(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized.length > 0 ? normalized : "unknown";
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
