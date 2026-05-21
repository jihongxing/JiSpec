import fs from "node:fs";
import path from "node:path";
import { inspectAuditLedger } from "../audit/event-ledger";

export type GlobalOperationsPacketStatus = "ready" | "blocked";

export interface GlobalOperationsPacket {
  schemaVersion: 1;
  kind: "jispec-global-operations-packet";
  generatedAt: string;
  root: string;
  status: GlobalOperationsPacketStatus;
  boundary: {
    localOnly: true;
    sourceUploadRequired: false;
    realtimeCollaborationRequired: false;
    executesCommands: false;
    replacesVerify: false;
    replacesDoctorGlobal: false;
    deferredSurfacesDiagnosticOnly: true;
  };
  repoGroupTopology: {
    status: string;
    sourcePath: string;
    repoCount: number;
    repos: Array<{
      id: string;
      role: string;
      owner: string;
      snapshotStatus: string;
      upstreamContractRefs: string[];
      downstreamContractRefs: string[];
    }>;
  };
  crossRepoContractRefs: Array<{
    upstreamRepoId: string;
    downstreamRepoId: string;
    contractRef: string;
    ownerActionId: string;
    evidence: Record<string, unknown>;
  }>;
  ownerActionLifecycle: Array<{
    id: string;
    status: string;
    owner: string;
    repoId: string;
    command: string;
    followupCommands: string[];
    affectedContracts: string[];
  }>;
  promotionReadiness: {
    ready: boolean;
    phase: string;
    checklistPassed: number;
    checklistTotal: number;
    blockers: string[];
    referencedSupportSurfaces: string[];
  };
  privacyPosture: {
    status: "available" | "missing" | "attention";
    highSeverityFindingCount: number | "not_available_yet";
    sourceArtifact: string;
  };
  auditEvidenceRefs: Array<{
    type: string;
    actor: string;
    sourceArtifact: string;
    affectedContracts: string[];
  }>;
  asyncCollaborationEvents: Array<{
    kind: "reviewer_acknowledged" | "waiver_approved" | "debt_repaid" | "drift_owner_assigned" | "promotion_accepted" | "promotion_rejected";
    status: "available" | "missing";
    evidenceArtifact: string;
  }>;
  verifyBoundaryStatement: string;
  doctorGlobalReadiness: {
    ready: boolean | "not_available_yet";
    blockerCount: number | "not_available_yet";
    sourceArtifact: string;
  };
  blockers: string[];
}

export interface GlobalOperationsPacketWriteResult {
  root: string;
  packetPath: string;
  summaryPath: string;
  packet: GlobalOperationsPacket;
}

export interface GlobalOperationsPacketOptions {
  doctorGlobalReport?: Record<string, unknown>;
}

const DEFAULT_PACKET_PATH = ".spec/operations/global-operations-packet.json";

export function buildGlobalOperationsPacket(rootInput: string, options: GlobalOperationsPacketOptions = {}): GlobalOperationsPacket {
  const root = path.resolve(rootInput);
  const aggregate = readJson(path.join(root, ".spec", "console", "multi-repo-governance.json"));
  const privacy = readJson(path.join(root, ".spec", "privacy", "privacy-report.json"));
  const doctorGlobal = options.doctorGlobalReport ?? readJson(path.join(root, ".spec", "doctor", "global-readiness.json"));
  const audit = inspectAuditLedger(root);

  const repoGroup = isRecord(aggregate?.repoGroup) ? aggregate.repoGroup : {};
  const promotion = isRecord(aggregate?.promotionReadiness) ? aggregate.promotionReadiness : {};
  const checklist = Array.isArray(promotion.checklist) ? promotion.checklist.filter(isRecord) : [];
  const ownerActions = Array.isArray(aggregate?.ownerActions) ? aggregate.ownerActions.filter(isRecord) : [];
  const hints = Array.isArray(aggregate?.contractDriftHints) ? aggregate.contractDriftHints.filter(isRecord) : [];
  const privacySummary = isRecord(privacy?.summary) ? privacy.summary : {};
  const doctorSummary = isRecord(doctorGlobal?.readinessSummary) ? doctorGlobal.readinessSummary : {};
  const auditEvidenceRefs = audit.events.slice(-20).map((event) => ({
    type: String(event.type ?? "unknown"),
    actor: String(event.actor ?? "unknown"),
    sourceArtifact: isRecord(event.sourceArtifact) ? String(event.sourceArtifact.path ?? "not_available_yet") : "not_available_yet",
    affectedContracts: Array.isArray(event.affectedContracts) ? event.affectedContracts.map(String) : [],
  }));
  const asyncCollaborationEvents = buildAsyncCollaborationEvents(auditEvidenceRefs);
  const referencedSupportSurfaces = buildReferencedSupportSurfaces(aggregate, privacy, doctorGlobal, auditEvidenceRefs);
  const blockers = buildBlockers({
    aggregate,
    promotion,
    checklist,
    privacy,
    privacySummary,
    doctorGlobal,
    doctorSummary,
    auditEvidenceRefs,
    asyncCollaborationEvents,
    referencedSupportSurfaces,
  });

  return {
    schemaVersion: 1,
    kind: "jispec-global-operations-packet",
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
    repoGroupTopology: {
      status: stringValue(repoGroup.status) ?? "not_available_yet",
      sourcePath: stringValue(repoGroup.sourcePath) ?? ".spec/console/repo-group.yaml",
      repoCount: Array.isArray(repoGroup.repos) ? repoGroup.repos.length : 0,
      repos: (Array.isArray(repoGroup.repos) ? repoGroup.repos.filter(isRecord) : []).map((repo) => ({
        id: stringValue(repo.id) ?? "unknown",
        role: stringValue(repo.role) ?? "unknown",
        owner: stringValue(repo.owner) ?? "unknown",
        snapshotStatus: stringValue(repo.snapshotStatus) ?? "not_available_yet",
        upstreamContractRefs: stringArray(repo.upstreamContractRefs),
        downstreamContractRefs: stringArray(repo.downstreamContractRefs),
      })),
    },
    crossRepoContractRefs: hints.map((hint) => ({
      upstreamRepoId: stringValue(hint.upstreamRepoId) ?? "unknown",
      downstreamRepoId: stringValue(hint.downstreamRepoId) ?? "unknown",
      contractRef: stringValue(hint.contractRef) ?? "unknown",
      ownerActionId: stringValue(hint.ownerActionId) ?? "unknown",
      evidence: isRecord(hint.evidence) ? hint.evidence : {},
    })),
    ownerActionLifecycle: ownerActions.map((action) => ({
      id: stringValue(action.id) ?? "unknown",
      status: stringValue(action.status) ?? "unknown",
      owner: stringValue(action.owner) ?? "unknown",
      repoId: stringValue(action.repoId) ?? "unknown",
      command: isRecord(action.primaryCommand) ? stringValue(action.primaryCommand.command) ?? "not_available_yet" : "not_available_yet",
      followupCommands: Array.isArray(action.followupCommands)
        ? action.followupCommands.filter(isRecord).map((command) => stringValue(command.command) ?? "not_available_yet")
        : [],
      affectedContracts: stringArray(action.affectedContracts),
    })),
    promotionReadiness: {
      ready: promotion.ready === true,
      phase: stringValue(promotion.phase) ?? "not_available_yet",
      checklistPassed: checklist.filter((item) => item.status === "pass").length,
      checklistTotal: checklist.length,
      blockers: stringArray(promotion.blockers),
      referencedSupportSurfaces,
    },
    privacyPosture: {
      status: !privacy
        ? "missing"
        : (numberValue(privacySummary.highSeverityFindingCount) ?? 0) > 0
          ? "attention"
          : "available",
      highSeverityFindingCount: numberValue(privacySummary.highSeverityFindingCount) ?? "not_available_yet",
      sourceArtifact: ".spec/privacy/privacy-report.json",
    },
    auditEvidenceRefs,
    asyncCollaborationEvents,
    verifyBoundaryStatement: "Global operations packet is local read-only evidence. It does not run verify, replace ci:verify, override doctor global, upload source, or promote deferred collaboration surfaces into global gates.",
    doctorGlobalReadiness: {
      ready: typeof doctorGlobal?.ready === "boolean" ? doctorGlobal.ready : "not_available_yet",
      blockerCount: numberValue(doctorSummary.blockerCount) ?? "not_available_yet",
      sourceArtifact: ".spec/doctor/global-readiness.json",
    },
    blockers,
  };
}

export function writeGlobalOperationsPacket(
  rootInput: string,
  outPath: string = DEFAULT_PACKET_PATH,
  options: GlobalOperationsPacketOptions = {},
): GlobalOperationsPacketWriteResult {
  const root = path.resolve(rootInput);
  const packetPath = path.resolve(root, outPath);
  const summaryPath = packetPath.replace(/\.json$/i, ".md");
  const packet = buildGlobalOperationsPacket(root, options);

  fs.mkdirSync(path.dirname(packetPath), { recursive: true });
  fs.writeFileSync(packetPath, `${JSON.stringify(packet, null, 2)}\n`, "utf-8");
  fs.writeFileSync(summaryPath, renderGlobalOperationsPacketMarkdown(packet), "utf-8");

  return {
    root: normalizePath(root),
    packetPath: normalizePath(path.relative(root, packetPath)),
    summaryPath: normalizePath(path.relative(root, summaryPath)),
    packet,
  };
}

export function renderGlobalOperationsPacketMarkdown(packet: GlobalOperationsPacket): string {
  return [
    "# JiSpec Global Operations Packet",
    "",
    "Human companion only. The machine source of truth is `.spec/operations/global-operations-packet.json`.",
    "",
    `Generated at: ${packet.generatedAt}`,
    `Status: ${packet.status}`,
    `Repo group: ${packet.repoGroupTopology.status} (${packet.repoGroupTopology.repoCount} repo(s))`,
    `Cross-repo refs: ${packet.crossRepoContractRefs.length}`,
    `Owner actions: ${packet.ownerActionLifecycle.length}`,
    `Promotion readiness: ${packet.promotionReadiness.ready ? "ready" : "blocked"}`,
    `Privacy posture: ${packet.privacyPosture.status}`,
    `Audit evidence refs: ${packet.auditEvidenceRefs.length}`,
    "",
    "## Boundary",
    "",
    `- ${packet.verifyBoundaryStatement}`,
    "- Deferred collaboration surfaces remain diagnostic-only.",
    "",
    "## Owner Actions",
    "",
    ...(packet.ownerActionLifecycle.length > 0
      ? packet.ownerActionLifecycle.map((action) => `- ${action.id}: ${action.owner} -> ${action.command}`)
      : ["- None"]),
    "",
    "## Async Collaboration Evidence",
    "",
    ...packet.asyncCollaborationEvents.map((event) => `- ${event.kind}: ${event.status} (${event.evidenceArtifact})`),
    "",
    "## Blockers",
    "",
    ...(packet.blockers.length > 0 ? packet.blockers.map((blocker) => `- ${blocker}`) : ["- None"]),
    "",
  ].join("\n");
}

function buildReferencedSupportSurfaces(
  aggregate: Record<string, unknown> | undefined,
  privacy: Record<string, unknown> | undefined,
  doctorGlobal: Record<string, unknown> | undefined,
  auditEvidenceRefs: GlobalOperationsPacket["auditEvidenceRefs"],
): string[] {
  return stableUnique([
    aggregate ? "multi_repo_governance_aggregate" : undefined,
    privacy ? "privacy_redaction_posture" : undefined,
    doctorGlobal ? "doctor_global_readiness" : undefined,
    auditEvidenceRefs.length > 0 ? "audit_event_ledger" : undefined,
  ]);
}

function buildAsyncCollaborationEvents(
  auditEvidenceRefs: GlobalOperationsPacket["auditEvidenceRefs"],
): GlobalOperationsPacket["asyncCollaborationEvents"] {
  return [
    {
      kind: "reviewer_acknowledged",
      status: hasAnyType(auditEvidenceRefs, ["policy_approval_decision", "source_review_adopt", "source_review_defer", "source_review_waive"]) ? "available" : "missing",
      evidenceArtifact: ".spec/audit/events.jsonl",
    },
    {
      kind: "waiver_approved",
      status: hasAnyType(auditEvidenceRefs, ["waiver_create", "waiver_renew", "waiver_revoke"]) ? "available" : "missing",
      evidenceArtifact: ".spec/audit/events.jsonl",
    },
    {
      kind: "debt_repaid",
      status: hasAnyType(auditEvidenceRefs, ["spec_debt_repay", "spec_debt_cancel", "spec_debt_owner_review"]) ? "available" : "missing",
      evidenceArtifact: ".spec/audit/events.jsonl",
    },
    {
      kind: "drift_owner_assigned",
      status: hasAnyType(auditEvidenceRefs, ["release_compare", "source_refresh"]) ? "available" : "missing",
      evidenceArtifact: ".spec/audit/events.jsonl",
    },
    {
      kind: "promotion_accepted",
      status: hasAnyType(auditEvidenceRefs, ["source_adopt", "release_snapshot"]) ? "available" : "missing",
      evidenceArtifact: ".spec/audit/events.jsonl",
    },
    {
      kind: "promotion_rejected",
      status: hasAnyType(auditEvidenceRefs, ["source_review_reject", "review_reject", "adopt_reject"]) ? "available" : "missing",
      evidenceArtifact: ".spec/audit/events.jsonl",
    },
  ];
}

function buildBlockers(input: {
  aggregate: Record<string, unknown> | undefined;
  promotion: Record<string, unknown>;
  checklist: Record<string, unknown>[];
  privacy: Record<string, unknown> | undefined;
  privacySummary: Record<string, unknown>;
  doctorGlobal: Record<string, unknown> | undefined;
  doctorSummary: Record<string, unknown>;
  auditEvidenceRefs: GlobalOperationsPacket["auditEvidenceRefs"];
  asyncCollaborationEvents: GlobalOperationsPacket["asyncCollaborationEvents"];
  referencedSupportSurfaces: string[];
}): string[] {
  const blockers: string[] = [];
  if (!input.aggregate) {
    blockers.push("multi_repo_aggregate_missing");
  }
  if (input.promotion.phase !== "north-star-score-optimization-phase-2" || input.promotion.ready !== true || input.checklist.filter((item) => item.status === "pass").length < 5) {
    blockers.push("promotion_readiness_incomplete");
  }
  if (!input.privacy) {
    blockers.push("privacy_report_missing");
  } else if ((numberValue(input.privacySummary.highSeverityFindingCount) ?? 0) > 0) {
    blockers.push("privacy_high_severity_findings");
  }
  if (!input.doctorGlobal) {
    blockers.push("doctor_global_readiness_missing");
  } else if (input.doctorGlobal.ready !== true || (numberValue(input.doctorSummary.blockerCount) ?? 0) > 0) {
    blockers.push("doctor_global_not_ready");
  }
  if (input.auditEvidenceRefs.length === 0) {
    blockers.push("audit_evidence_missing");
  }
  if (input.asyncCollaborationEvents.filter((event) => event.status === "available").length < 4) {
    blockers.push("async_collaboration_audit_events_incomplete");
  }
  if (input.referencedSupportSurfaces.length < 2) {
    blockers.push("support_surface_references_incomplete");
  }
  return blockers;
}

function hasAnyType(events: GlobalOperationsPacket["auditEvidenceRefs"], types: string[]): boolean {
  return events.some((event) => types.includes(event.type));
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
  return Array.isArray(value) ? value.map(String).filter((entry) => entry.length > 0) : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stableUnique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((left, right) => left.localeCompare(right));
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
