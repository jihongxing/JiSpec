import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { appendAuditEvent } from "../audit/event-ledger";
import { readChangeSession } from "../change/change-session";
import { renderHumanDecisionSnapshotText } from "../human-decision-packet";
import type { GreenfieldSourceEvolutionDiff, GreenfieldSourceEvolutionItem } from "./provenance-drift";
import {
  buildInitialRequirementLifecycleRegistry,
  GREENFIELD_REQUIREMENT_LIFECYCLE_PATH,
  loadRequirementLifecycleRegistry,
  readManifestRequirementIds,
  readManifestSnapshotId,
  type GreenfieldRequirementLifecycleEntry,
  type GreenfieldRequirementLifecycleRegistry,
} from "./source-lifecycle";
import {
  loadGreenfieldSourceManifest,
  loadResolvedGreenfieldSourceManifest,
  normalizePath,
} from "./source-documents";

export type GreenfieldSourceReviewAction = "adopt" | "reject" | "defer" | "waive";
export type GreenfieldSourceReviewStatus = "proposed" | "adopted" | "rejected" | "deferred" | "waived";

export interface GreenfieldSourceReviewHistoryEntry {
  action: GreenfieldSourceReviewAction;
  actor: string;
  reason: string;
  timestamp: string;
}

export interface GreenfieldSourceReviewDecision {
  item_id: string;
  evolution_id: string;
  anchor_id?: string;
  evolution_kind: string;
  source_document: string;
  status: GreenfieldSourceReviewStatus;
  severity: "blocking" | "advisory";
  summary: string;
  reason?: string;
  owner?: string;
  maps_to?: string[];
  updated_at?: string;
  review_history?: GreenfieldSourceReviewHistoryEntry[];
  defer_record?: {
    owner: string;
    reason: string;
    expires_at?: string;
  };
  waiver_record?: {
    owner: string;
    reason: string;
    expires_at?: string;
  };
}

export interface GreenfieldSourceReviewRecord {
  version: 1;
  change_id: string;
  generated_at: string;
  updated_at: string;
  source_evolution_path: string;
  proposed_snapshot_path?: string;
  items: GreenfieldSourceReviewDecision[];
}

export interface GreenfieldSourceReviewListItem {
  itemId: string;
  evolutionId: string;
  anchorId?: string;
  evolutionKind: string;
  sourceDocument: string;
  severity: "blocking" | "advisory";
  summary: string;
  path: string;
  effectiveStatus: GreenfieldSourceReviewStatus;
  reason?: string;
  mapsTo: string[];
  owner?: string;
}

export interface GreenfieldSourceReviewListResult {
  root: string;
  changeId: string;
  sourceEvolutionPath: string;
  sourceReviewPath: string;
  proposedSnapshotPath?: string;
  total: number;
  blockingOpenCount: number;
  items: GreenfieldSourceReviewListItem[];
}

export interface GreenfieldSourceReviewTransitionOptions {
  root: string;
  change?: string;
  itemId: string;
  action: GreenfieldSourceReviewAction;
  actor?: string;
  owner?: string;
  reason?: string;
  expiresAt?: string;
  mapsTo?: string[];
  now?: string;
}

export interface GreenfieldSourceReviewTransitionResult {
  root: string;
  changeId: string;
  sourceReviewPath: string;
  sourceEvolutionPath: string;
  decision: GreenfieldSourceReviewDecision;
  nextCommands: string[];
}

export interface GreenfieldSourceAdoptOptions {
  root: string;
  change?: string;
  actor?: string;
  reason?: string;
  now?: string;
}

export interface GreenfieldSourceAdoptResult {
  root: string;
  changeId: string;
  activeSnapshotPath: string;
  compatibilitySnapshotPath: string;
  lifecyclePath: string;
  currentBaselinePath: string;
  sourceEvolutionPath: string;
  sourceReviewPath: string;
  activeSnapshotId?: string;
  lifecycleVersion: number;
  adoptedRequirementCount: number;
  appliedDeltas: string[];
  nextCommands: string[];
}

const DELTAS_ROOT = ".spec/deltas";
const ACTIVE_SOURCE_DOCUMENTS_PATH = ".spec/greenfield/source-documents.active.yaml";
const COMPAT_SOURCE_DOCUMENTS_PATH = ".spec/greenfield/source-documents.yaml";
const CURRENT_BASELINE_PATH = ".spec/baselines/current.yaml";

export function runGreenfieldSourceReviewList(rootInput: string, change?: string): GreenfieldSourceReviewListResult {
  const root = path.resolve(rootInput);
  const context = loadSourceGovernanceContext(root, change);
  const items = context.diff.items.map((item) => toSourceReviewListItem(item, context.reviewRecord));

  return {
    root: normalizePath(root),
    changeId: context.changeId,
    sourceEvolutionPath: context.sourceEvolutionPath,
    sourceReviewPath: context.sourceReviewPath,
    proposedSnapshotPath: context.proposedSnapshotPath,
    total: items.length,
    blockingOpenCount: items.filter((item) => item.severity === "blocking" && item.effectiveStatus === "proposed").length,
    items: items.sort((left, right) =>
      `${left.effectiveStatus}|${left.severity}|${left.itemId}`.localeCompare(`${right.effectiveStatus}|${right.severity}|${right.itemId}`),
    ),
  };
}

export function runGreenfieldSourceReviewTransition(
  options: GreenfieldSourceReviewTransitionOptions,
): GreenfieldSourceReviewTransitionResult {
  const root = path.resolve(options.root);
  const context = loadSourceGovernanceContext(root, options.change);
  const item = resolveEvolutionItem(context.diff, options.itemId);
  const timestamp = options.now ?? new Date().toISOString();
  const actor = normalizeText(options.actor) ?? inferActor();
  const reason = normalizeText(options.reason) ?? defaultReasonForSourceAction(options.action, item);
  const mapsTo = stableUnique(options.mapsTo ?? []);

  if ((options.action === "defer" || options.action === "waive") && !normalizeText(options.owner)) {
    throw new Error(`--owner is required for source review ${options.action}.`);
  }
  if ((options.action === "reject" || options.action === "defer" || options.action === "waive") && !reason) {
    throw new Error(`--reason is required for source review ${options.action}.`);
  }
  if (options.expiresAt && Number.isNaN(new Date(options.expiresAt).getTime())) {
    throw new Error(`--expires-at is not a valid date: ${options.expiresAt}`);
  }

  const reviewRecord = ensureSourceReviewRecord(context, timestamp);
  const existing = reviewRecord.items.find((entry) => entry.evolution_id === item.evolution_id);
  const decision: GreenfieldSourceReviewDecision = existing ?? {
    item_id: item.evolution_id,
    evolution_id: item.evolution_id,
    anchor_id: item.anchor_id,
    evolution_kind: item.evolution_kind,
    source_document: item.source_document,
    status: "proposed",
    severity: item.severity,
    summary: item.summary,
    maps_to: [],
    review_history: [],
  };

  decision.status = statusForSourceAction(options.action);
  decision.reason = reason;
  decision.updated_at = timestamp;
  decision.maps_to = mapsTo.length > 0 ? mapsTo : decision.maps_to ?? [];
  decision.review_history = [
    ...(decision.review_history ?? []),
    {
      action: options.action,
      actor,
      reason,
      timestamp,
    },
  ];

  if (options.action === "defer") {
    decision.owner = normalizeText(options.owner) ?? actor;
    decision.defer_record = {
      owner: decision.owner,
      reason,
      expires_at: options.expiresAt,
    };
  }

  if (options.action === "waive") {
    decision.owner = normalizeText(options.owner) ?? actor;
    decision.waiver_record = {
      owner: decision.owner,
      reason,
      expires_at: options.expiresAt,
    };
  }

  if (options.action === "adopt") {
    delete decision.defer_record;
    delete decision.waiver_record;
  }

  if (options.action === "reject") {
    delete decision.defer_record;
    delete decision.waiver_record;
  }

  reviewRecord.updated_at = timestamp;
  upsertSourceReviewDecision(reviewRecord, decision);
  writeSourceReviewRecord(root, reviewRecord);

  appendAuditEvent(root, {
    type: auditEventTypeForSourceAction(options.action),
    actor,
    reason,
    sourceArtifact: {
      kind: "greenfield-source-review",
      path: context.sourceReviewPath,
    },
    affectedContracts: [context.sourceEvolutionPath, context.sourceReviewPath, item.path],
    details: {
      changeId: context.changeId,
      itemId: decision.item_id,
      evolutionId: decision.evolution_id,
      evolutionKind: decision.evolution_kind,
      status: decision.status,
      mapsTo: decision.maps_to ?? [],
      owner: decision.owner,
      expiresAt: options.expiresAt,
    },
  });

  return {
    root: normalizePath(root),
    changeId: context.changeId,
    sourceReviewPath: context.sourceReviewPath,
    sourceEvolutionPath: context.sourceEvolutionPath,
    decision,
    nextCommands: [
      `jispec-cli source review list --root ${normalizePath(root)} --change ${context.changeId}`,
      `jispec-cli source adopt --root ${normalizePath(root)} --change ${context.changeId}`,
      "jispec-cli verify --root . --policy .spec/policy.yaml",
    ],
  };
}

export function runGreenfieldSourceAdopt(options: GreenfieldSourceAdoptOptions): GreenfieldSourceAdoptResult {
  const root = path.resolve(options.root);
  const context = loadSourceGovernanceContext(root, options.change);
  const now = options.now ?? new Date().toISOString();
  const actor = normalizeText(options.actor) ?? inferActor();
  const reason = normalizeText(options.reason) ?? `Adopt source evolution ${context.changeId} into the active Greenfield source baseline.`;
  const reviewRecord = ensureSourceReviewRecord(context, now);

  const unresolved = context.diff.items.filter((item) => {
    if (item.evolution_kind === "reanchored" || item.severity !== "blocking") {
      return false;
    }
    const decision = reviewRecord.items.find((entry) => entry.evolution_id === item.evolution_id);
    return !decision || !["adopted", "deferred", "waived"].includes(decision.status);
  });
  if (unresolved.length > 0) {
    throw new Error(`Source adopt blocked: ${unresolved.map((item) => item.anchor_id ?? item.evolution_id).join(", ")} still need adopt, defer, or waive.`);
  }

  const activeManifest = promoteProposedManifest(context.activeManifest, context.proposedManifest, context.changeId);
  const activeSnapshotPath = path.join(root, ACTIVE_SOURCE_DOCUMENTS_PATH);
  const compatibilitySnapshotPath = path.join(root, COMPAT_SOURCE_DOCUMENTS_PATH);
  fs.mkdirSync(path.dirname(activeSnapshotPath), { recursive: true });
  fs.writeFileSync(activeSnapshotPath, dumpYaml(activeManifest), "utf-8");
  fs.writeFileSync(compatibilitySnapshotPath, dumpYaml(activeManifest), "utf-8");

  const priorLifecycle = loadRequirementLifecycleRegistry(root)
    ?? buildInitialRequirementLifecycleRegistry(context.activeManifest, {
      generatedAt: now,
      registryVersion: 1,
      lastAdoptedChangeId: null,
    });
  const lifecycle = applySourceEvolutionToLifecycle(priorLifecycle, context.diff, reviewRecord, {
    generatedAt: now,
    activeSnapshotId: readManifestSnapshotId(activeManifest),
    changeId: context.changeId,
  });
  const lifecyclePath = path.join(root, GREENFIELD_REQUIREMENT_LIFECYCLE_PATH);
  fs.mkdirSync(path.dirname(lifecyclePath), { recursive: true });
  fs.writeFileSync(lifecyclePath, renderLifecycleYaml(lifecycle), "utf-8");

  const currentBaselinePath = path.join(root, CURRENT_BASELINE_PATH);
  const currentBaseline = readYamlObject(currentBaselinePath);
  const updatedBaseline = updateCurrentBaseline(currentBaseline, activeManifest, lifecycle, context);
  fs.mkdirSync(path.dirname(currentBaselinePath), { recursive: true });
  fs.writeFileSync(currentBaselinePath, dumpYaml(updatedBaseline), "utf-8");

  reviewRecord.updated_at = now;
  writeSourceReviewRecord(root, reviewRecord);
  updateSpecDeltaAdoptionRecord(root, context.changeId, reviewRecord, actor, now);

  appendAuditEvent(root, {
    type: "source_adopt",
    actor,
    reason,
    sourceArtifact: {
      kind: "greenfield-source-adopt",
      path: CURRENT_BASELINE_PATH,
    },
    affectedContracts: [
      ACTIVE_SOURCE_DOCUMENTS_PATH,
      COMPAT_SOURCE_DOCUMENTS_PATH,
      GREENFIELD_REQUIREMENT_LIFECYCLE_PATH,
      CURRENT_BASELINE_PATH,
      context.sourceEvolutionPath,
      context.sourceReviewPath,
    ],
    details: {
      changeId: context.changeId,
      activeSnapshotId: readManifestSnapshotId(activeManifest),
      lifecycleVersion: lifecycle.registry_version,
      requirementCount: lifecycle.requirements.length,
      appliedDeltas: stringArrayValue(updatedBaseline.applied_deltas),
    },
  });

  return {
    root: normalizePath(root),
    changeId: context.changeId,
    activeSnapshotPath: normalizePath(activeSnapshotPath),
    compatibilitySnapshotPath: normalizePath(compatibilitySnapshotPath),
    lifecyclePath: normalizePath(lifecyclePath),
    currentBaselinePath: normalizePath(currentBaselinePath),
    sourceEvolutionPath: context.sourceEvolutionPath,
    sourceReviewPath: context.sourceReviewPath,
    activeSnapshotId: readManifestSnapshotId(activeManifest),
    lifecycleVersion: lifecycle.registry_version,
    adoptedRequirementCount: lifecycle.requirements.length,
    appliedDeltas: stringArrayValue(updatedBaseline.applied_deltas),
    nextCommands: [
      "jispec-cli verify --root . --policy .spec/policy.yaml",
      `jispec-cli release snapshot --root ${normalizePath(root)} --version next`,
    ],
  };
}

export function renderGreenfieldSourceReviewListText(result: GreenfieldSourceReviewListResult): string {
  const lines = [
    "Greenfield Source Review",
    `Root: ${result.root}`,
    `Change ID: ${result.changeId}`,
    `Source evolution: ${result.sourceEvolutionPath}`,
    `Source review: ${result.sourceReviewPath}`,
    `Blocking open: ${result.blockingOpenCount}`,
    "",
  ];

  if (result.items.length === 0) {
    lines.push("- No source evolution items.");
    return lines.join("\n");
  }

  for (const item of result.items) {
    lines.push(`- ${item.itemId} [${item.effectiveStatus}, ${item.severity}, ${item.evolutionKind}]: ${item.summary}`);
  }
  return lines.join("\n");
}

export function renderGreenfieldSourceReviewTransitionText(result: GreenfieldSourceReviewTransitionResult): string {
  const nextCommand = result.decision.status === "adopted"
    ? result.nextCommands.find((command) => command.includes("source adopt")) ?? result.nextCommands[0] ?? "not recorded"
    : result.nextCommands[0] ?? "not recorded";
  const affectedArtifact = result.decision.anchor_id
    ? `${result.decision.source_document}:${result.decision.anchor_id}`
    : result.decision.source_document;
  const expiration = result.decision.defer_record?.expires_at ?? result.decision.waiver_record?.expires_at;

  return [
    "Greenfield source review updated.",
    `Change ID: ${result.changeId}`,
    `Item: ${result.decision.item_id}`,
    `Status: ${result.decision.status}`,
    `Source review: ${result.sourceReviewPath}`,
    "",
    "Decision packet:",
    ...renderHumanDecisionSnapshotText({
      currentState: `${result.decision.status} source review for ${result.decision.evolution_kind}`,
      risk: renderSourceReviewDecisionRisk(result.decision),
      evidence: [
        result.sourceReviewPath,
        result.sourceEvolutionPath,
        result.decision.summary,
      ],
      owner: result.decision.owner ?? "reviewer",
      nextCommand,
      affectedArtifact,
      expiration,
    }).map((entry) => `- ${entry}`),
    "",
    "Next:",
    ...result.nextCommands.map((command) => `- ${command}`),
  ].join("\n");
}

export function renderGreenfieldSourceAdoptText(result: GreenfieldSourceAdoptResult): string {
  return [
    "Greenfield source adopt complete.",
    `Change ID: ${result.changeId}`,
    `Active snapshot: ${result.activeSnapshotPath}`,
    `Lifecycle: ${result.lifecyclePath}`,
    `Current baseline: ${result.currentBaselinePath}`,
    `Active snapshot ID: ${result.activeSnapshotId ?? "unknown"}`,
    `Lifecycle version: ${result.lifecycleVersion}`,
    `Applied deltas: ${result.appliedDeltas.length > 0 ? result.appliedDeltas.join(", ") : "none"}`,
    "",
    "Next:",
    ...result.nextCommands.map((command) => `- ${command}`),
  ].join("\n");
}

interface SourceGovernanceContext {
  root: string;
  changeId: string;
  sourceEvolutionPath: string;
  sourceReviewPath: string;
  proposedSnapshotPath?: string;
  activeManifest: Record<string, unknown>;
  proposedManifest: Record<string, unknown>;
  diff: GreenfieldSourceEvolutionDiff;
  reviewRecord?: GreenfieldSourceReviewRecord;
}

function loadSourceGovernanceContext(root: string, requestedChange?: string): SourceGovernanceContext {
  const changeId = resolveChangeId(root, requestedChange);
  const deltaDir = path.join(root, DELTAS_ROOT, changeId);
  const sourceEvolutionPath = path.join(deltaDir, "source-evolution.json");
  const sourceReviewPath = path.join(deltaDir, "source-review.yaml");
  const proposedSnapshotPath = path.join(deltaDir, "source-documents.proposed.yaml");
  const activeManifestRef = loadResolvedGreenfieldSourceManifest(root);
  if (!activeManifestRef) {
    throw new Error("No active Greenfield source snapshot found. Run Greenfield init first.");
  }
  const proposedManifest = loadGreenfieldSourceManifest(proposedSnapshotPath);
  if (!proposedManifest) {
    throw new Error(`Proposed source snapshot is missing: ${normalizePath(proposedSnapshotPath)}. Run \`jispec-cli source refresh\` first.`);
  }
  const diff = loadSourceEvolutionDiff(sourceEvolutionPath);
  if (!diff) {
    throw new Error(`Source evolution diff is missing: ${normalizePath(sourceEvolutionPath)}. Run \`jispec-cli source refresh\` first.`);
  }

  return {
    root,
    changeId,
    sourceEvolutionPath: normalizeRelativePath(root, sourceEvolutionPath),
    sourceReviewPath: normalizeRelativePath(root, sourceReviewPath),
    proposedSnapshotPath: fs.existsSync(proposedSnapshotPath) ? normalizeRelativePath(root, proposedSnapshotPath) : undefined,
    activeManifest: activeManifestRef.manifest,
    proposedManifest,
    diff,
    reviewRecord: loadSourceReviewRecord(sourceReviewPath),
  };
}

function resolveChangeId(root: string, requestedChange?: string): string {
  if (requestedChange && requestedChange !== "latest") {
    return requestedChange;
  }

  const activeSession = readChangeSession(root);
  const activeChangeId = activeSession?.specDelta?.changeId;
  if (typeof activeChangeId === "string" && activeChangeId.length > 0) {
    return activeChangeId;
  }

  const deltasRoot = path.join(root, DELTAS_ROOT);
  if (!fs.existsSync(deltasRoot)) {
    throw new Error("No change delta workspace exists yet. Run `jispec-cli change \"<summary>\"` before source governance commands.");
  }

  const latest = fs.readdirSync(deltasRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      id: entry.name,
      mtimeMs: fs.statSync(path.join(deltasRoot, entry.name)).mtimeMs,
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.id.localeCompare(left.id))[0]?.id;

  if (!latest) {
    throw new Error("No change delta workspace exists yet. Run `jispec-cli change \"<summary>\"` before source governance commands.");
  }
  return latest;
}

function loadSourceEvolutionDiff(filePath: string): GreenfieldSourceEvolutionDiff | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as GreenfieldSourceEvolutionDiff;
    return parsed && typeof parsed === "object" && Array.isArray(parsed.items) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function loadSourceReviewRecord(filePath: string): GreenfieldSourceReviewRecord | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const parsed = yaml.load(fs.readFileSync(filePath, "utf-8"));
    if (!isRecord(parsed)) {
      return undefined;
    }
    return {
      version: 1,
      change_id: stringValue(parsed.change_id) ?? "unknown-change",
      generated_at: stringValue(parsed.generated_at) ?? new Date().toISOString(),
      updated_at: stringValue(parsed.updated_at) ?? new Date().toISOString(),
      source_evolution_path: stringValue(parsed.source_evolution_path) ?? "",
      proposed_snapshot_path: stringValue(parsed.proposed_snapshot_path),
      items: Array.isArray(parsed.items)
        ? parsed.items.filter(isRecord).map((entry) => entry as unknown as GreenfieldSourceReviewDecision)
        : [],
    };
  } catch {
    return undefined;
  }
}

function ensureSourceReviewRecord(context: SourceGovernanceContext, generatedAt: string): GreenfieldSourceReviewRecord {
  return context.reviewRecord ?? {
    version: 1,
    change_id: context.changeId,
    generated_at: generatedAt,
    updated_at: generatedAt,
    source_evolution_path: context.sourceEvolutionPath,
    proposed_snapshot_path: context.proposedSnapshotPath,
    items: [],
  };
}

function writeSourceReviewRecord(root: string, record: GreenfieldSourceReviewRecord): void {
  const targetPath = path.join(root, record.source_evolution_path.replace(/source-evolution\.json$/, "source-review.yaml"));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, dumpYaml(record), "utf-8");
}

function resolveEvolutionItem(diff: GreenfieldSourceEvolutionDiff, itemId: string): GreenfieldSourceEvolutionItem {
  const match = diff.items.find((item) =>
    item.evolution_id === itemId ||
    item.anchor_id === itemId ||
    `${item.evolution_kind}:${item.anchor_id ?? item.evolution_id}` === itemId,
  );
  if (!match) {
    throw new Error(`Unknown source evolution item: ${itemId}`);
  }
  return match;
}

function toSourceReviewListItem(
  item: GreenfieldSourceEvolutionItem,
  reviewRecord: GreenfieldSourceReviewRecord | undefined,
): GreenfieldSourceReviewListItem {
  const decision = reviewRecord?.items.find((entry) => entry.evolution_id === item.evolution_id);
  const owner = decision?.owner ?? decision?.defer_record?.owner ?? decision?.waiver_record?.owner;
  return {
    itemId: item.evolution_id,
    evolutionId: item.evolution_id,
    anchorId: item.anchor_id,
    evolutionKind: item.evolution_kind,
    sourceDocument: item.source_document,
    severity: item.severity,
    summary: item.summary,
    path: item.path,
    effectiveStatus: decision?.status ?? "proposed",
    reason: decision?.reason,
    mapsTo: stableUnique(decision?.maps_to ?? item.successor_ids ?? []),
    owner,
  };
}

function upsertSourceReviewDecision(record: GreenfieldSourceReviewRecord, decision: GreenfieldSourceReviewDecision): void {
  const index = record.items.findIndex((entry) => entry.evolution_id === decision.evolution_id);
  if (index >= 0) {
    record.items[index] = decision;
    return;
  }
  record.items.push(decision);
}

function statusForSourceAction(action: GreenfieldSourceReviewAction): GreenfieldSourceReviewStatus {
  switch (action) {
    case "adopt":
      return "adopted";
    case "reject":
      return "rejected";
    case "defer":
      return "deferred";
    case "waive":
      return "waived";
  }
}

function auditEventTypeForSourceAction(action: GreenfieldSourceReviewAction): "source_review_adopt" | "source_review_reject" | "source_review_defer" | "source_review_waive" {
  switch (action) {
    case "adopt":
      return "source_review_adopt";
    case "reject":
      return "source_review_reject";
    case "defer":
      return "source_review_defer";
    case "waive":
      return "source_review_waive";
  }
}

function defaultReasonForSourceAction(action: GreenfieldSourceReviewAction, item: GreenfieldSourceEvolutionItem): string {
  return `${action} source evolution ${item.anchor_id ?? item.evolution_id}.`;
}

function renderSourceReviewDecisionRisk(decision: GreenfieldSourceReviewDecision): string {
  switch (decision.status) {
    case "adopted":
      return decision.severity === "blocking"
        ? "blocking source evolution is reviewed, but active truth still stays unchanged until source adopt runs."
        : "advisory source evolution is reviewed and ready for source adopt when desired.";
    case "deferred":
      return "review is recorded as deferred, so downstream contract and test follow-up remains open until repayment.";
    case "waived":
      return "review is recorded as waived, so the exception remains visible and should stay short-lived.";
    case "rejected":
      return "the proposed source evolution was rejected and must be corrected before verify can pass.";
    case "proposed":
    default:
      return "source evolution still needs an explicit governance decision before it can become active truth.";
  }
}

function promoteProposedManifest(
  currentActiveManifest: Record<string, unknown>,
  proposedManifest: Record<string, unknown>,
  changeId: string,
): Record<string, unknown> {
  const snapshot = isRecord(proposedManifest.snapshot) ? { ...proposedManifest.snapshot } : {};
  snapshot.status = "active";
  snapshot.adopted_by_change = changeId;
  const promoted: Record<string, unknown> = {
    ...proposedManifest,
    snapshot,
  };
  if (promoted.open_questions === undefined && currentActiveManifest.open_questions !== undefined) {
    promoted.open_questions = currentActiveManifest.open_questions;
  }
  return promoted;
}

function applySourceEvolutionToLifecycle(
  previous: GreenfieldRequirementLifecycleRegistry,
  diff: GreenfieldSourceEvolutionDiff,
  reviewRecord: GreenfieldSourceReviewRecord,
  options: {
    generatedAt: string;
    activeSnapshotId?: string;
    changeId: string;
  },
): GreenfieldRequirementLifecycleRegistry {
  const entries = new Map(previous.requirements.map((entry) => [entry.id, cloneLifecycleEntry(entry)]));

  for (const requirementId of readManifestRequirementIds({
    source_documents: {
      requirements: {
        requirement_ids: readManifestRequirementIdsFromDiff(previous, diff),
      },
    },
  })) {
    if (!entries.has(requirementId)) {
      entries.set(requirementId, createLifecycleEntry(requirementId, options.activeSnapshotId, options.changeId));
    }
  }

  for (const item of diff.items) {
    const decision = reviewRecord.items.find((entry) => entry.evolution_id === item.evolution_id);
    const successorIds = stableUnique(decision?.maps_to?.length ? decision.maps_to : item.successor_ids ?? []);

    switch (item.evolution_kind) {
      case "added":
        if (item.anchor_id) {
          entries.set(item.anchor_id, {
            ...createLifecycleEntry(item.anchor_id, options.activeSnapshotId, options.changeId),
            status: "active",
          });
        }
        break;
      case "modified":
        if (item.anchor_id) {
          const entry = entries.get(item.anchor_id) ?? createLifecycleEntry(item.anchor_id, options.activeSnapshotId, options.changeId);
          entry.status = "modified";
          entry.source_snapshot = options.activeSnapshotId;
          entry.modified_by_change = options.changeId;
          entries.set(item.anchor_id, entry);
        }
        break;
      case "deprecated":
        if (item.anchor_id) {
          const entry = entries.get(item.anchor_id) ?? createLifecycleEntry(item.anchor_id, options.activeSnapshotId, options.changeId);
          entry.status = successorIds.length > 0 ? "replaced" : "deprecated";
          entry.source_snapshot = options.activeSnapshotId;
          entry.deprecated_by_change = options.changeId;
          entry.replaced_by = successorIds;
          entries.set(item.anchor_id, entry);
          for (const successorId of successorIds) {
            const successor = entries.get(successorId) ?? createLifecycleEntry(successorId, options.activeSnapshotId, options.changeId);
            successor.status = "active";
            successor.supersedes = stableUnique([...successor.supersedes, item.anchor_id]);
            entries.set(successorId, successor);
          }
        }
        break;
      case "split":
        for (const predecessorId of item.predecessor_ids ?? []) {
          const predecessor = entries.get(predecessorId) ?? createLifecycleEntry(predecessorId, options.activeSnapshotId, options.changeId);
          predecessor.status = "split";
          predecessor.source_snapshot = options.activeSnapshotId;
          predecessor.deprecated_by_change = options.changeId;
          predecessor.replaced_by = successorIds;
          entries.set(predecessorId, predecessor);
        }
        for (const successorId of successorIds) {
          const successor = entries.get(successorId) ?? createLifecycleEntry(successorId, options.activeSnapshotId, options.changeId);
          successor.status = "active";
          successor.supersedes = stableUnique([...successor.supersedes, ...(item.predecessor_ids ?? [])]);
          entries.set(successorId, successor);
        }
        break;
      case "merged": {
        const mergedInto = successorIds[0];
        for (const predecessorId of item.predecessor_ids ?? []) {
          const predecessor = entries.get(predecessorId) ?? createLifecycleEntry(predecessorId, options.activeSnapshotId, options.changeId);
          predecessor.status = "merged";
          predecessor.source_snapshot = options.activeSnapshotId;
          predecessor.deprecated_by_change = options.changeId;
          predecessor.replaced_by = mergedInto ? [mergedInto] : successorIds;
          entries.set(predecessorId, predecessor);
        }
        if (mergedInto) {
          const successor = entries.get(mergedInto) ?? createLifecycleEntry(mergedInto, options.activeSnapshotId, options.changeId);
          successor.status = "active";
          successor.supersedes = stableUnique([...successor.supersedes, ...(item.predecessor_ids ?? [])]);
          successor.merged_from = stableUnique([...successor.merged_from, ...(item.predecessor_ids ?? [])]);
          entries.set(mergedInto, successor);
        }
        break;
      }
      case "reanchored":
        break;
    }
  }

  return {
    version: 1,
    registry_version: previous.registry_version + 1,
    generated_at: options.generatedAt,
    active_snapshot_id: options.activeSnapshotId,
    last_adopted_change_id: options.changeId,
    requirements: Array.from(entries.values()).sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function readManifestRequirementIdsFromDiff(
  previous: GreenfieldRequirementLifecycleRegistry,
  diff: GreenfieldSourceEvolutionDiff,
): string[] {
  const ids = new Set(previous.requirements.map((entry) => entry.id));
  for (const item of diff.items) {
    if (item.anchor_id) {
      ids.add(item.anchor_id);
    }
    for (const predecessor of item.predecessor_ids ?? []) {
      ids.add(predecessor);
    }
    for (const successor of item.successor_ids ?? []) {
      ids.add(successor);
    }
  }
  return Array.from(ids);
}

function createLifecycleEntry(id: string, snapshotId: string | undefined, changeId: string): GreenfieldRequirementLifecycleEntry {
  return {
    id,
    status: "active",
    source_snapshot: snapshotId,
    introduced_by_change: changeId,
    modified_by_change: null,
    deprecated_by_change: null,
    supersedes: [],
    replaced_by: [],
    merged_from: [],
  };
}

function cloneLifecycleEntry(entry: GreenfieldRequirementLifecycleEntry): GreenfieldRequirementLifecycleEntry {
  return {
    ...entry,
    supersedes: [...entry.supersedes],
    replaced_by: [...entry.replaced_by],
    merged_from: [...entry.merged_from],
  };
}

function renderLifecycleYaml(registry: GreenfieldRequirementLifecycleRegistry): string {
  return yaml.dump(registry, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
}

function updateCurrentBaseline(
  baseline: Record<string, unknown>,
  activeManifest: Record<string, unknown>,
  lifecycle: GreenfieldRequirementLifecycleRegistry,
  context: SourceGovernanceContext,
): Record<string, unknown> {
  const sourceSnapshot = isRecord(baseline.source_snapshot) ? baseline.source_snapshot : {};
  const requirementIds = readManifestRequirementIds(activeManifest);
  const appliedDeltas = stableUnique([
    ...stringArrayValue(baseline.applied_deltas),
    context.changeId,
  ]);

  return {
    ...baseline,
    source_snapshot: {
      ...sourceSnapshot,
      active_manifest_path: ACTIVE_SOURCE_DOCUMENTS_PATH,
      compatibility_manifest_path: COMPAT_SOURCE_DOCUMENTS_PATH,
      active_snapshot_id: readManifestSnapshotId(activeManifest),
      lifecycle_registry_path: GREENFIELD_REQUIREMENT_LIFECYCLE_PATH,
      lifecycle_registry_version: lifecycle.registry_version,
      last_adopted_change_id: context.changeId,
    },
    requirement_lifecycle: {
      path: GREENFIELD_REQUIREMENT_LIFECYCLE_PATH,
      registry_version: lifecycle.registry_version,
      active_snapshot_id: lifecycle.active_snapshot_id,
      last_adopted_change_id: context.changeId,
    },
    source_evolution: {
      source_evolution_path: context.sourceEvolutionPath,
      source_review_path: context.sourceReviewPath,
      proposed_snapshot_path: context.proposedSnapshotPath,
      last_adopted_change_id: context.changeId,
    },
    requirement_ids: requirementIds,
    applied_deltas: appliedDeltas,
  };
}

function updateSpecDeltaAdoptionRecord(
  root: string,
  changeId: string,
  reviewRecord: GreenfieldSourceReviewRecord,
  actor: string,
  adoptedAt: string,
): void {
  const targetPath = path.join(root, DELTAS_ROOT, changeId, "adoption-record.yaml");
  if (!fs.existsSync(targetPath)) {
    return;
  }

  const record = readYamlObject(targetPath);
  record.status = "adopted";
  record.adopted_at = adoptedAt;
  record.adopter = actor;
  record.baseline_after = CURRENT_BASELINE_PATH;
  record.decisions = reviewRecord.items.map((item) => ({
    item_id: item.item_id,
    evolution_id: item.evolution_id,
    status: item.status,
    maps_to: item.maps_to ?? [],
  }));
  fs.writeFileSync(targetPath, dumpYaml(record), "utf-8");
}

function readYamlObject(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const parsed = yaml.load(fs.readFileSync(filePath, "utf-8"));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function dumpYaml(value: unknown): string {
  return yaml.dump(value, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
}

function normalizeRelativePath(root: string, targetPath: string): string {
  return path.relative(root, targetPath).replace(/\\/g, "/");
}

function inferActor(): string {
  return normalizeText(process.env.JISPEC_ACTOR)
    ?? normalizeText(process.env.GIT_AUTHOR_NAME)
    ?? normalizeText(process.env.USERNAME)
    ?? normalizeText(process.env.USER)
    ?? "unknown";
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0))).sort((left, right) => left.localeCompare(right));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
