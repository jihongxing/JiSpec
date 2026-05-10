import fs from "node:fs";
import path from "node:path";
import { appendAuditEvent } from "../audit/event-ledger";
import {
  createKernelId,
  createKernelIdentity,
  createKernelTimestamp,
  stableKernelList,
  type AmbiguityDebtRecord,
  type KernelMutationSource,
  type KernelProvenanceLink,
} from "../kernel/shared-models";
import {
  extractMutationCandidateChangeIds,
  type AmbiguityDebtPriorSignal,
  type MutationBoundaryInput,
  type MutationBoundaryProjection,
} from "./mutation-boundary-model";

export const AMBIGUITY_DEBT_LEDGER_RELATIVE_PATH = ".spec/ambiguity-debt/ledger.json";
const DEFAULT_REVIEW_WINDOW_DAYS = 7;

export interface AmbiguityDebtReviewRecord {
  requestedAt: string;
  requestedBy: string;
  reason: string;
}

export interface AmbiguityDebtReclassificationRecord {
  reclassifiedAt: string;
  reclassifiedBy: string;
  reason: string;
  candidateChangeIds: string[];
}

export interface AmbiguityDebtResolutionRecord {
  resolvedAt: string;
  resolvedBy: string;
  reason: string;
  outcome: "resolved" | "archived";
}

export interface AmbiguityDebtLedgerRecord extends AmbiguityDebtRecord {
  summary: string;
  updatedAt?: string;
  ownerReview?: AmbiguityDebtReviewRecord;
  reclassification?: AmbiguityDebtReclassificationRecord;
  resolution?: AmbiguityDebtResolutionRecord;
}

export interface AmbiguityDebtLedger {
  version: 1;
  debts: AmbiguityDebtLedgerRecord[];
}

export interface AmbiguityDebtRegistrationSummary {
  action: "created" | "updated";
  debtId: string;
  mutationId: string;
  summary: string;
  status: AmbiguityDebtLedgerRecord["status"];
  owner: string;
  reason: string;
  confidence: number;
  nextReview?: string;
  candidateChangeIds: string[];
  source: KernelMutationSource | "unknown";
  ledgerPath: string;
}

export interface AmbiguityDebtRegistrationResult {
  ledgerPath: string;
  record: AmbiguityDebtLedgerRecord;
  summary: AmbiguityDebtRegistrationSummary;
}

export interface AmbiguityDebtOwnerReviewOptions {
  actor: string;
  reason: string;
  requestedAt?: string;
  nextReview?: string;
  changeId?: string;
}

export interface AmbiguityDebtReclassifyOptions {
  actor: string;
  reason: string;
  reclassifiedAt?: string;
  candidateChangeIds?: string[];
  changeId?: string;
}

export interface AmbiguityDebtResolveOptions {
  actor: string;
  reason: string;
  resolvedAt?: string;
  changeId?: string;
}

export interface AmbiguityDebtArchiveOptions {
  actor: string;
  reason: string;
  archivedAt?: string;
  changeId?: string;
}

export function resolveAmbiguityDebtLedgerPath(rootInput: string): string {
  return path.join(path.resolve(rootInput), AMBIGUITY_DEBT_LEDGER_RELATIVE_PATH);
}

export function loadAmbiguityDebtLedger(rootInput: string): AmbiguityDebtLedger {
  const ledgerPath = resolveAmbiguityDebtLedgerPath(rootInput);
  if (!fs.existsSync(ledgerPath)) {
    return createEmptyAmbiguityDebtLedger();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(ledgerPath, "utf-8")) as Partial<AmbiguityDebtLedger>;
    const rawDebts = Array.isArray(parsed.debts) ? (parsed.debts as unknown[]) : [];
    const debts = rawDebts
      .filter(isRecord)
      .map(normalizeAmbiguityDebtLedgerRecord)
      .filter((entry): entry is AmbiguityDebtLedgerRecord => entry !== undefined);

    return {
      version: 1,
      debts: sortAmbiguityDebtRecords(debts),
    };
  } catch {
    return createEmptyAmbiguityDebtLedger();
  }
}

export function listAmbiguityDebtRecords(rootInput: string): AmbiguityDebtLedgerRecord[] {
  return loadAmbiguityDebtLedger(rootInput).debts;
}

export function writeAmbiguityDebtLedger(rootInput: string, ledger: AmbiguityDebtLedger): string {
  const ledgerPath = resolveAmbiguityDebtLedgerPath(rootInput);
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, `${JSON.stringify({
    version: 1,
    debts: sortAmbiguityDebtRecords(ledger.debts),
  }, null, 2)}\n`, "utf-8");
  return ledgerPath;
}

export function summarizeAmbiguityDebtPrior(
  rootInput: string,
  input: Pick<MutationBoundaryInput, "source" | "summary" | "touchedPaths" | "facts" | "history" | "payload">,
): AmbiguityDebtPriorSignal | undefined {
  const root = path.resolve(rootInput);
  const ledger = loadAmbiguityDebtLedger(root);
  if (ledger.debts.length === 0) {
    return undefined;
  }

  const normalizedSummary = normalizeText(input.summary) ?? "";
  const candidateChangeIds = extractMutationCandidateChangeIds({
    summary: normalizedSummary,
    facts: normalizeStringArray(input.facts),
    history: normalizeStringArray(input.history),
    payload: input.payload,
  });
  const normalizedTouchedPaths = stableKernelList(
    Array.isArray(input.touchedPaths)
      ? input.touchedPaths.map((entry) => entry.trim().replace(/\\/g, "/")).filter((entry) => entry.length > 0)
      : [],
  );
  const activeDebts = ledger.debts.filter((record) => record.status === "open" || record.status === "reclassified" || record.status === "resolved");

  if (activeDebts.length === 0) {
    return undefined;
  }

  const matchedRecords = activeDebts.filter((record) => {
    const recordSummary = normalizeText(record.summary) ?? "";
    const recordReason = normalizeText(record.reason) ?? "";
    return normalizedSummary.length > 0
      && (recordSummary === normalizedSummary || recordReason === normalizedSummary);
  });

  const matchedByCandidateIds = activeDebts.filter((record) =>
    record.candidateChangeIds.some((candidateId) => candidateChangeIds.includes(candidateId)),
  );

  const touchedPathMatches = normalizedTouchedPaths.filter((touchedPath) =>
    activeDebts.some((record) => {
      const recordSummary = normalizeText(record.summary) ?? "";
      const recordReason = normalizeText(record.reason) ?? "";
      const baseName = path.posix.basename(touchedPath);
      return recordSummary.includes(baseName) || recordReason.includes(baseName);
    }),
  );

  const matchedDebtIds = stableKernelList([
    ...matchedRecords.map((record) => record.id),
    ...matchedByCandidateIds.map((record) => record.id),
  ]);
  if (matchedDebtIds.length === 0) {
    return undefined;
  }

  const matchedCandidateChangeIds = stableKernelList([
    ...matchedRecords.flatMap((record) => record.candidateChangeIds),
    ...matchedByCandidateIds.flatMap((record) => record.candidateChangeIds),
  ]);
  const ownerReviewMatches = activeDebts.filter((record) => Boolean(record.ownerReview) && matchedDebtIds.includes(record.id));
  const confidenceBoost = Number(
    Math.min(
      0.2,
      matchedByCandidateIds.length * 0.12
        + matchedRecords.length * 0.1
        + ownerReviewMatches.length * 0.03
        + touchedPathMatches.length * 0.02,
    ).toFixed(4),
  );

  return {
    matchedDebtIds,
    matchedCandidateChangeIds,
    confidenceBoost,
    rationale: stableKernelList([
      `ambiguity debt prior matched ${matchedDebtIds.length} record(s)`,
      matchedByCandidateIds.length > 0 ? `candidate overlap: ${matchedByCandidateIds.map((record) => record.id).join(", ")}` : "",
      matchedRecords.length > 0 ? `summary overlap: ${matchedRecords.map((record) => record.id).join(", ")}` : "",
      touchedPathMatches.length > 0 ? `touched paths aligned: ${touchedPathMatches.join(", ")}` : "",
      confidenceBoost > 0 ? `confidence boost: ${confidenceBoost.toFixed(4)}` : "",
    ]),
  };
}

export function recordAmbiguityDebtFromMutationBoundary(
  rootInput: string,
  boundary: MutationBoundaryProjection,
  options: {
    actor?: string;
    owner?: string;
    reason?: string;
    reviewWindowDays?: number;
    changeId?: string;
  } = {},
): AmbiguityDebtRegistrationResult | undefined {
  if (boundary.classification !== "unmapped_mutation") {
    return undefined;
  }

  const root = path.resolve(rootInput);
  const createdAt = normalizeTimestamp(boundary.mutation.createdAt);
  const ledger = loadAmbiguityDebtLedger(root);
  const debtId = createKernelId("ambiguity-debt", boundary.mutation.id);
  const existing = ledger.debts.find((record) => record.id === debtId || record.mutationId === boundary.mutation.id);
  const owner = normalizeOwner(options.owner) ?? existing?.owner ?? inferAmbiguityDebtOwner();
  const reason = normalizeText(options.reason) ?? existing?.reason ?? boundary.mutation.reason ?? boundary.hypothesis.summary;
  const nextReview = formatReviewWindow(createdAt, options.reviewWindowDays ?? DEFAULT_REVIEW_WINDOW_DAYS);
  const lineage = existing?.lineage && existing.lineage.length > 0
    ? existing.lineage
    : buildDebtLineage(boundary, debtId, createdAt);

  const record: AmbiguityDebtLedgerRecord = {
    id: debtId,
    createdAt: existing?.createdAt ?? createdAt,
    updatedAt: existing ? createdAt : undefined,
    mutationId: boundary.mutation.id,
    status: "open",
    owner,
    reason,
    confidence: boundary.confidence,
    nextReview,
    source: boundary.mutation.source ?? "unknown",
    candidateChangeIds: stableKernelList(boundary.candidateChangeIds),
    lineage,
    summary: boundary.mutation.summary,
    ownerReview: existing?.status === "open" ? existing.ownerReview : undefined,
    reclassification: undefined,
    resolution: undefined,
  };

  const nextLedger: AmbiguityDebtLedger = {
    version: 1,
    debts: sortAmbiguityDebtRecords([
      ...ledger.debts.filter((entry) => entry.id !== record.id),
      record,
    ]),
  };

  const ledgerPath = writeAmbiguityDebtLedger(root, nextLedger);
  appendAuditEvent(root, {
    type: "ambiguity_debt_open",
    actor: normalizeText(options.actor) ?? owner,
    reason,
    changeId: normalizeText(options.changeId) ?? undefined,
    timestamp: createdAt,
    sourceArtifact: {
      kind: "ambiguity-debt-ledger",
      path: ledgerPath,
    },
    affectedContracts: stableKernelList([
      `mutation:${boundary.mutation.id}`,
      ...record.candidateChangeIds,
    ]),
    details: {
      debtId: record.id,
      mutationId: record.mutationId,
      changeId: normalizeText(options.changeId) ?? undefined,
      action: existing ? "updated" : "created",
      status: record.status,
      confidence: record.confidence,
      nextReview: record.nextReview,
      candidateChangeIds: record.candidateChangeIds,
      source: record.source,
      summary: record.summary,
    },
  });

  return {
    ledgerPath,
    record,
    summary: {
      action: existing ? "updated" : "created",
      debtId: record.id,
      mutationId: record.mutationId,
      summary: record.summary,
      status: record.status,
      owner: record.owner,
      reason: record.reason,
      confidence: record.confidence,
      nextReview: record.nextReview,
      candidateChangeIds: record.candidateChangeIds,
      source: record.source,
      ledgerPath: path.relative(root, ledgerPath).replace(/\\/g, "/"),
    },
  };
}

export function requestAmbiguityDebtOwnerReview(
  rootInput: string,
  debtId: string,
  options: AmbiguityDebtOwnerReviewOptions,
): AmbiguityDebtLedgerRecord {
  validateMutationActor(options.actor, "Ambiguity debt owner review actor is required.");
  validateText(options.reason, "Ambiguity debt owner review reason is required.");

  const root = path.resolve(rootInput);
  const ledger = loadAmbiguityDebtLedger(root);
  const existing = requireAmbiguityDebtRecord(ledger, debtId);
  const requestedAt = normalizeTimestamp(options.requestedAt);
  const updated: AmbiguityDebtLedgerRecord = {
    ...existing,
    updatedAt: requestedAt,
    nextReview: options.nextReview ?? formatReviewWindow(requestedAt, DEFAULT_REVIEW_WINDOW_DAYS),
    ownerReview: {
      requestedAt,
      requestedBy: options.actor,
      reason: options.reason,
    },
  };

  writeAmbiguityDebtLedger(root, {
    version: 1,
    debts: ledger.debts.map((record) => record.id === debtId ? updated : record),
  });
  appendAuditEvent(root, {
    type: "ambiguity_debt_owner_review",
    actor: options.actor,
    reason: options.reason,
    changeId: normalizeText(options.changeId) ?? undefined,
    timestamp: requestedAt,
    sourceArtifact: {
      kind: "ambiguity-debt-ledger",
      path: resolveAmbiguityDebtLedgerPath(root),
    },
    affectedContracts: stableKernelList([
      `mutation:${updated.mutationId}`,
      ...updated.candidateChangeIds,
    ]),
    details: {
      debtId: updated.id,
      mutationId: updated.mutationId,
      changeId: normalizeText(options.changeId) ?? undefined,
      owner: updated.owner,
      nextReview: updated.nextReview,
      status: updated.status,
    },
  });

  return updated;
}

export function reclassifyAmbiguityDebt(
  rootInput: string,
  debtId: string,
  options: AmbiguityDebtReclassifyOptions,
): AmbiguityDebtLedgerRecord {
  validateMutationActor(options.actor, "Ambiguity debt reclassification actor is required.");
  validateText(options.reason, "Ambiguity debt reclassification reason is required.");

  const root = path.resolve(rootInput);
  const ledger = loadAmbiguityDebtLedger(root);
  const existing = requireAmbiguityDebtRecord(ledger, debtId);
  ensureMutableAmbiguityDebt(existing, "reclassify");
  const reclassifiedAt = normalizeTimestamp(options.reclassifiedAt);
  const candidateChangeIds = options.candidateChangeIds && options.candidateChangeIds.length > 0
    ? stableKernelList(options.candidateChangeIds)
    : existing.candidateChangeIds;

  const updated: AmbiguityDebtLedgerRecord = {
    ...existing,
    status: "reclassified",
    updatedAt: reclassifiedAt,
    candidateChangeIds,
    reclassification: {
      reclassifiedAt,
      reclassifiedBy: options.actor,
      reason: options.reason,
      candidateChangeIds,
    },
  };

  writeAmbiguityDebtLedger(root, {
    version: 1,
    debts: ledger.debts.map((record) => record.id === debtId ? updated : record),
  });
  appendAuditEvent(root, {
    type: "ambiguity_debt_reclassify",
    actor: options.actor,
    reason: options.reason,
    changeId: normalizeText(options.changeId) ?? undefined,
    timestamp: reclassifiedAt,
    sourceArtifact: {
      kind: "ambiguity-debt-ledger",
      path: resolveAmbiguityDebtLedgerPath(root),
    },
    affectedContracts: stableKernelList([
      `mutation:${updated.mutationId}`,
      ...updated.candidateChangeIds,
    ]),
    details: {
      debtId: updated.id,
      mutationId: updated.mutationId,
      changeId: normalizeText(options.changeId) ?? undefined,
      status: updated.status,
      candidateChangeIds: updated.candidateChangeIds,
      owner: updated.owner,
    },
  });

  return updated;
}

export function resolveAmbiguityDebt(
  rootInput: string,
  debtId: string,
  options: AmbiguityDebtResolveOptions,
): AmbiguityDebtLedgerRecord {
  validateMutationActor(options.actor, "Ambiguity debt resolve actor is required.");
  validateText(options.reason, "Ambiguity debt resolve reason is required.");

  const root = path.resolve(rootInput);
  const ledger = loadAmbiguityDebtLedger(root);
  const existing = requireAmbiguityDebtRecord(ledger, debtId);
  ensureMutableAmbiguityDebt(existing, "resolve");
  const resolvedAt = normalizeTimestamp(options.resolvedAt);

  const updated: AmbiguityDebtLedgerRecord = {
    ...existing,
    status: "resolved",
    updatedAt: resolvedAt,
    resolution: {
      resolvedAt,
      resolvedBy: options.actor,
      reason: options.reason,
      outcome: "resolved",
    },
  };

  writeAmbiguityDebtLedger(root, {
    version: 1,
    debts: ledger.debts.map((record) => record.id === debtId ? updated : record),
  });
  appendAuditEvent(root, {
    type: "ambiguity_debt_resolve",
    actor: options.actor,
    reason: options.reason,
    changeId: normalizeText(options.changeId) ?? undefined,
    timestamp: resolvedAt,
    sourceArtifact: {
      kind: "ambiguity-debt-ledger",
      path: resolveAmbiguityDebtLedgerPath(root),
    },
    affectedContracts: stableKernelList([
      `mutation:${updated.mutationId}`,
      ...updated.candidateChangeIds,
    ]),
    details: {
      debtId: updated.id,
      mutationId: updated.mutationId,
      changeId: normalizeText(options.changeId) ?? undefined,
      status: updated.status,
      owner: updated.owner,
    },
  });

  return updated;
}

export function archiveAmbiguityDebt(
  rootInput: string,
  debtId: string,
  options: AmbiguityDebtArchiveOptions,
): AmbiguityDebtLedgerRecord {
  validateMutationActor(options.actor, "Ambiguity debt archive actor is required.");
  validateText(options.reason, "Ambiguity debt archive reason is required.");

  const root = path.resolve(rootInput);
  const ledger = loadAmbiguityDebtLedger(root);
  const existing = requireAmbiguityDebtRecord(ledger, debtId);
  ensureMutableAmbiguityDebt(existing, "archive");
  const archivedAt = normalizeTimestamp(options.archivedAt);

  const updated: AmbiguityDebtLedgerRecord = {
    ...existing,
    status: "archived",
    updatedAt: archivedAt,
    resolution: {
      resolvedAt: archivedAt,
      resolvedBy: options.actor,
      reason: options.reason,
      outcome: "archived",
    },
  };

  writeAmbiguityDebtLedger(root, {
    version: 1,
    debts: ledger.debts.map((record) => record.id === debtId ? updated : record),
  });
  appendAuditEvent(root, {
    type: "ambiguity_debt_archive",
    actor: options.actor,
    reason: options.reason,
    changeId: normalizeText(options.changeId) ?? undefined,
    timestamp: archivedAt,
    sourceArtifact: {
      kind: "ambiguity-debt-ledger",
      path: resolveAmbiguityDebtLedgerPath(root),
    },
    affectedContracts: stableKernelList([
      `mutation:${updated.mutationId}`,
      ...updated.candidateChangeIds,
    ]),
    details: {
      debtId: updated.id,
      mutationId: updated.mutationId,
      changeId: normalizeText(options.changeId) ?? undefined,
      status: updated.status,
      owner: updated.owner,
    },
  });

  return updated;
}

export function summarizeAmbiguityDebtRegister(rootInput: string): Record<string, unknown> {
  const root = path.resolve(rootInput);
  const ledgerPath = resolveAmbiguityDebtLedgerPath(root);
  if (!fs.existsSync(ledgerPath)) {
    return { state: "not_available_yet" };
  }

  try {
    const ledger = loadAmbiguityDebtLedger(root);
    const records = ledger.debts;
    const counts = countByStatus(records.map((record) => record.status));
    const ownerReviewRequestedIds = stableKernelList(
      records.filter((record) => Boolean(record.ownerReview)).map((record) => record.id),
    );
    const nextReviewSoonIds = stableKernelList(
      records.filter((record) => isNextReviewSoon(record.nextReview, 14)).map((record) => record.id),
    );
    const overdueIds = stableKernelList(
      records.filter((record) => isNextReviewOverdue(record.nextReview)).map((record) => record.id),
    );

    return {
      state: "available",
      total: records.length,
      open: counts.open ?? 0,
      reclassified: counts.reclassified ?? 0,
      resolved: counts.resolved ?? 0,
      archived: counts.archived ?? 0,
      ownerReviewRequested: ownerReviewRequestedIds.length,
      ownerReviewRequestedIds,
      nextReviewSoonIds,
      overdueIds,
      sourceCount: countByStatus(records.map((record) => String(record.source ?? "unknown"))),
      openIds: stableKernelList(records.filter((record) => record.status === "open").map((record) => record.id)),
      currentOwnerIds: stableKernelList(records.map((record) => record.owner)),
    };
  } catch {
    return { state: "invalid" };
  }
}

export function inferAmbiguityDebtOwner(): string {
  return normalizeOwner(process.env.JISPEC_AMBIGUITY_DEBT_OWNER)
    ?? normalizeOwner(process.env.JISPEC_ACTOR)
    ?? normalizeOwner(process.env.GIT_AUTHOR_NAME)
    ?? normalizeOwner(process.env.USERNAME)
    ?? normalizeOwner(process.env.USER)
    ?? "unknown";
}

export function buildAmbiguityDebtRegistrationSummary(
  result: AmbiguityDebtRegistrationResult,
): AmbiguityDebtRegistrationSummary {
  return result.summary;
}

function createEmptyAmbiguityDebtLedger(): AmbiguityDebtLedger {
  return {
    version: 1,
    debts: [],
  };
}

function normalizeAmbiguityDebtLedgerRecord(record: Record<string, unknown>): AmbiguityDebtLedgerRecord | undefined {
  const id = normalizeText(record.id);
  const createdAt = normalizeTimestampValue(record.createdAt ?? record.created_at);
  const mutationId = normalizeText(record.mutationId);
  const status = normalizeStatus(record.status);
  const owner = normalizeText(record.owner);
  const reason = normalizeText(record.reason);
  const confidence = typeof record.confidence === "number" && Number.isFinite(record.confidence)
    ? record.confidence
    : undefined;
  const source = normalizeSource(record.source);
  const candidateChangeIds = normalizeStringArray(record.candidateChangeIds);
  const lineage = normalizeLineage(record.lineage);
  const summary = normalizeText(record.summary);

  if (!id || !createdAt || !mutationId || !status || !owner || !reason || confidence === undefined || !summary) {
    return undefined;
  }

  return {
    id,
    createdAt,
    updatedAt: normalizeTimestampValue(record.updatedAt),
    mutationId,
    status,
    owner,
    reason,
    confidence,
    nextReview: normalizeTimestampValue(record.nextReview),
    source,
    candidateChangeIds,
    lineage,
    summary,
    ownerReview: normalizeOwnerReview(record.ownerReview),
    reclassification: normalizeReclassification(record.reclassification),
    resolution: normalizeResolution(record.resolution),
  };
}

function normalizeOwnerReview(value: unknown): AmbiguityDebtReviewRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const requestedAt = normalizeTimestampValue(value.requestedAt ?? value.requested_at);
  const requestedBy = normalizeText(value.requestedBy ?? value.requested_by);
  const reason = normalizeText(value.reason);
  if (!requestedAt || !requestedBy || !reason) {
    return undefined;
  }

  return {
    requestedAt,
    requestedBy,
    reason,
  };
}

function normalizeReclassification(value: unknown): AmbiguityDebtReclassificationRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const reclassifiedAt = normalizeTimestampValue(value.reclassifiedAt ?? value.reclassified_at);
  const reclassifiedBy = normalizeText(value.reclassifiedBy ?? value.reclassified_by);
  const reason = normalizeText(value.reason);
  const candidateChangeIds = normalizeStringArray(value.candidateChangeIds ?? value.candidate_change_ids);
  if (!reclassifiedAt || !reclassifiedBy || !reason) {
    return undefined;
  }

  return {
    reclassifiedAt,
    reclassifiedBy,
    reason,
    candidateChangeIds,
  };
}

function normalizeResolution(value: unknown): AmbiguityDebtResolutionRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const resolvedAt = normalizeTimestampValue(value.resolvedAt ?? value.resolved_at);
  const resolvedBy = normalizeText(value.resolvedBy ?? value.resolved_by);
  const reason = normalizeText(value.reason);
  const outcome = value.outcome === "resolved" || value.outcome === "archived" ? value.outcome : undefined;
  if (!resolvedAt || !resolvedBy || !reason || !outcome) {
    return undefined;
  }

  return {
    resolvedAt,
    resolvedBy,
    reason,
    outcome,
  };
}

function buildDebtLineage(
  boundary: MutationBoundaryProjection,
  debtId: string,
  createdAt: string,
): KernelProvenanceLink[] {
  const link = {
    ...createKernelIdentity("lineage", `${boundary.hypothesis.id}|${debtId}`, new Date(createdAt)),
    sourceId: boundary.hypothesis.id,
    sourceKind: "change_hypothesis",
    targetId: debtId,
    targetKind: "ambiguity_debt",
    relationship: "resolved_into",
    confidence: boundary.confidence,
    reason: "Mutation could not be mapped to a canonical change yet.",
  } satisfies KernelProvenanceLink;

  return stableLineage([
    ...boundary.mutation.lineage,
    ...boundary.hypothesis.lineage,
    link,
  ]);
}

function stableLineage(links: KernelProvenanceLink[]): KernelProvenanceLink[] {
  const map = new Map<string, KernelProvenanceLink>();
  for (const link of links) {
    map.set(link.id, link);
  }
  return [...map.values()].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt.localeCompare(right.createdAt);
    }
    return left.id.localeCompare(right.id);
  });
}

function sortAmbiguityDebtRecords(records: AmbiguityDebtLedgerRecord[]): AmbiguityDebtLedgerRecord[] {
  return [...records].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt.localeCompare(right.createdAt);
    }
    return left.id.localeCompare(right.id);
  });
}

function requireAmbiguityDebtRecord(
  ledger: AmbiguityDebtLedger,
  debtId: string,
): AmbiguityDebtLedgerRecord {
  const record = ledger.debts.find((entry) => entry.id === debtId);
  if (!record) {
    throw new Error(`Ambiguity debt not found: ${debtId}`);
  }
  return record;
}

function ensureMutableAmbiguityDebt(record: AmbiguityDebtLedgerRecord, action: string): void {
  if (record.status === "archived") {
    throw new Error(`Cannot ${action} archived ambiguity debt ${record.id}.`);
  }
}

function normalizeSource(value: unknown): KernelMutationSource | "unknown" {
  return value === "git_diff"
    || value === "git_commit"
    || value === "external_patch"
    || value === "ci_patch"
    || value === "ide_patch"
    || value === "human_patch"
      ? value
      : "unknown";
}

function normalizeStatus(value: unknown): AmbiguityDebtRecord["status"] | undefined {
  return value === "open" || value === "reclassified" || value === "resolved" || value === "archived"
    ? value
    : undefined;
}

function normalizeLineage(value: unknown): KernelProvenanceLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const links: KernelProvenanceLink[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const id = normalizeText(entry.id);
    const createdAt = normalizeTimestampValue(entry.createdAt ?? entry.created_at);
    const sourceId = normalizeText(entry.sourceId ?? entry.source_id);
    const sourceKind = normalizeText(entry.sourceKind ?? entry.source_kind);
    const targetId = normalizeText(entry.targetId ?? entry.target_id);
    const targetKind = normalizeText(entry.targetKind ?? entry.target_kind);
    const relationship = entry.relationship === "derived_from"
      || entry.relationship === "observed_from"
      || entry.relationship === "normalized_from"
      || entry.relationship === "resolved_into"
      || entry.relationship === "replayed_from"
      ? entry.relationship
      : undefined;
    if (!id || !createdAt || !sourceId || !sourceKind || !targetId || !targetKind || !relationship) {
      continue;
    }

    const link: KernelProvenanceLink = {
      id,
      createdAt,
      sourceId,
      sourceKind,
      targetId,
      targetKind,
      relationship,
    };
    const confidence = typeof entry.confidence === "number" ? entry.confidence : undefined;
    if (confidence !== undefined) {
      link.confidence = confidence;
    }
    const reason = normalizeText(entry.reason);
    if (reason) {
      link.reason = reason;
    }
    const updatedAt = normalizeTimestampValue(entry.updatedAt);
    if (updatedAt) {
      link.updatedAt = updatedAt;
    }

    links.push(link);
  }

  return links;
}

function countByStatus(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? stableKernelList(value.filter((entry): entry is string => typeof entry === "string"))
    : [];
}

function normalizeTimestampValue(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function normalizeTimestamp(input: string | undefined): string {
  return normalizeTimestampValue(input) ?? createKernelTimestamp();
}

function formatReviewWindow(createdAt: string, days: number): string | undefined {
  if (!Number.isFinite(days) || days <= 0) {
    return undefined;
  }

  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  const next = new Date(parsed.getTime() + days * 24 * 60 * 60 * 1000);
  return next.toISOString();
}

function isNextReviewSoon(nextReview: string | undefined, days: number): boolean {
  if (!nextReview) {
    return false;
  }

  const timestamp = new Date(nextReview).getTime();
  if (Number.isNaN(timestamp)) {
    return false;
  }

  const now = Date.now();
  return timestamp >= now && timestamp <= now + days * 24 * 60 * 60 * 1000;
}

function isNextReviewOverdue(nextReview: string | undefined): boolean {
  if (!nextReview) {
    return false;
  }

  const timestamp = new Date(nextReview).getTime();
  return !Number.isNaN(timestamp) && timestamp < Date.now();
}

function normalizeOwner(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function validateMutationActor(value: string, message: string): void {
  if (!normalizeText(value)) {
    throw new Error(message);
  }
}

function validateText(value: string, message: string): void {
  if (!normalizeText(value)) {
    throw new Error(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
