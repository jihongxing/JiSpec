import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { readChangeSession } from "../change/change-session";
import {
  collectGreenfieldProvenanceAnchorDrift,
  collectGreenfieldSourceEvolutionDiff,
  type GreenfieldSourceEvolutionDiff,
  type GreenfieldSourceEvolutionItem,
} from "../greenfield/provenance-drift";
import type { VerifyIssue } from "./verdict";

type ReviewStatus = "proposed" | "adopted" | "rejected" | "deferred" | "waived";
type ReviewConfidence = "high" | "medium" | "low";

interface ReviewDecision {
  decision_id?: string;
  decision_type?: string;
  summary?: string;
  confidence?: ReviewConfidence;
  status?: ReviewStatus;
  blocking?: boolean;
  conflicts?: string[];
  affected_assets?: string[];
  defer_record?: {
    expires_at?: string;
  };
  waiver_record?: {
    expires_at?: string;
  };
}

interface ReviewRecord {
  decisions?: ReviewDecision[];
}

type SourceReviewStatus = "proposed" | "adopted" | "rejected" | "deferred" | "waived";

interface SourceReviewDecision {
  item_id?: string;
  evolution_id?: string;
  status?: SourceReviewStatus;
  reason?: string;
  maps_to?: string[];
  defer_record?: {
    expires_at?: string;
  };
  waiver_record?: {
    expires_at?: string;
  };
}

interface SourceReviewRecord {
  items?: SourceReviewDecision[];
  decisions?: SourceReviewDecision[];
}

interface GreenfieldReviewGatePolicy {
  low_confidence_blocks: boolean;
  low_confidence_blocks_by_decision_type: Record<string, boolean>;
  conflict_blocks: boolean;
  blocking_review_item_blocks: boolean;
  blocking_open_decision_types: string[];
  rejected_blocks: boolean;
  deferred_or_waived_severity: "ignore" | "advisory" | "blocking";
  expired_defer_or_waive_severity: "ignore" | "advisory" | "blocking";
}

interface EvidenceGraph {
  nodes?: Array<{
    id?: string;
    type?: string;
    label?: string;
    path?: string;
  }>;
  edges?: Array<{
    from?: string;
    to?: string;
    relation?: string;
  }>;
  summary?: {
    requirementCoverage?: {
      uncovered?: string[];
    };
  };
}

export interface GreenfieldReviewPackCounts {
  unresolvedBlockingCount: number;
  lowConfidenceUnadoptedCount: number;
  rejectedCount: number;
  deferredOrWaivedCount: number;
}

const REVIEW_RECORD_PATH = ".spec/greenfield/review-pack/review-record.yaml";
const EVIDENCE_GRAPH_PATH = ".spec/evidence/evidence-graph.json";
const DELTAS_ROOT = ".spec/deltas";

export function collectGreenfieldReviewPackIssues(rootInput: string): VerifyIssue[] {
  const root = path.resolve(rootInput);
  const recordPath = path.join(root, REVIEW_RECORD_PATH);

  if (!fs.existsSync(recordPath)) {
    if (!fs.existsSync(path.join(root, EVIDENCE_GRAPH_PATH))) {
      return [];
    }
    return [{
      kind: "semantic",
      severity: "advisory",
      code: "GREENFIELD_REVIEW_PACK_MISSING",
      path: REVIEW_RECORD_PATH,
      message: "Greenfield project has an Evidence Graph but no Initialization Review Pack record.",
    }];
  }

  const record = loadReviewRecord(recordPath);
  const gatePolicy = loadGreenfieldReviewGatePolicy(root);
  if (!record) {
    return [{
      kind: "semantic",
      severity: "advisory",
      code: "GREENFIELD_REVIEW_PACK_INVALID",
      path: REVIEW_RECORD_PATH,
      message: "Initialization Review Pack record could not be parsed.",
    }];
  }

  const issues: VerifyIssue[] = [];
  for (const decision of record.decisions ?? []) {
    const decisionId = decision.decision_id ?? "unknown-review-decision";
    const status = decision.status ?? "proposed";
    const confidence = decision.confidence ?? "medium";
    const conflicts = Array.isArray(decision.conflicts) ? decision.conflicts : [];
    const blocking = decision.blocking === true;

    if (!isKnownStatus(status)) {
      issues.push(createReviewIssue("GREENFIELD_REVIEW_ITEM_INVALID_STATUS", decision, `Review decision ${decisionId} has an invalid status.`));
      continue;
    }

    if (status === "rejected") {
      if (gatePolicy.rejected_blocks) {
        issues.push(createReviewIssue("GREENFIELD_REVIEW_ITEM_REJECTED", decision, `Review decision ${decisionId} was rejected and needs regeneration or a correction delta.`));
      }
      continue;
    }

    if (status === "deferred" || status === "waived") {
      const expiresAt = status === "deferred" ? decision.defer_record?.expires_at : decision.waiver_record?.expires_at;
      if (isExpired(expiresAt) && gatePolicy.expired_defer_or_waive_severity !== "ignore") {
        issues.push(createReviewIssue(
          "GREENFIELD_REVIEW_ITEM_EXPIRED_DEFER_OR_WAIVE",
          decision,
          `Review decision ${decisionId} is ${status} and its expiration date has passed.`,
          gatePolicy.expired_defer_or_waive_severity,
        ));
        continue;
      }
      if (gatePolicy.deferred_or_waived_severity !== "ignore") {
        issues.push(createReviewIssue(
          "GREENFIELD_REVIEW_ITEM_DEFERRED_OR_WAIVED",
          decision,
          `Review decision ${decisionId} is ${status} and should remain visible as open decision or spec debt.`,
          gatePolicy.deferred_or_waived_severity,
        ));
      }
      continue;
    }

    if (status !== "proposed") {
      continue;
    }

    const unresolvedBlocking =
      (blocking && gatePolicy.blocking_review_item_blocks) ||
      (conflicts.length > 0 && gatePolicy.conflict_blocks) ||
      (decision.decision_type !== undefined && gatePolicy.blocking_open_decision_types.includes(decision.decision_type));
    if (unresolvedBlocking) {
      issues.push(createReviewIssue("GREENFIELD_REVIEW_ITEM_UNRESOLVED_BLOCKING", decision, `Blocking review decision ${decisionId} is still proposed.`));
      continue;
    }

    if (confidence === "low" && lowConfidenceBlocks(decision, gatePolicy)) {
      issues.push(createReviewIssue("GREENFIELD_REVIEW_ITEM_LOW_CONFIDENCE_UNADOPTED", decision, `Low-confidence review decision ${decisionId} is still proposed.`));
    }
  }

  issues.push(...collectWrongThingSignals(root, record));
  issues.push(...collectSourceEvolutionSignals(root));
  issues.push(...collectProvenanceDriftSignals(root));

  return issues.sort((left, right) =>
    `${left.code}|${left.path ?? ""}|${left.message}`.localeCompare(`${right.code}|${right.path ?? ""}|${right.message}`),
  );
}

function collectSourceEvolutionSignals(root: string): VerifyIssue[] {
  const context = resolveSourceEvolutionContext(root);
  if (!context.diff || !Array.isArray(context.diff.items) || context.diff.items.length === 0) {
    return [];
  }

  const issues: VerifyIssue[] = [];
  const reviewRecord = context.reviewRecord;
  const decisions = sourceReviewDecisions(reviewRecord);

  for (const item of context.diff.items) {
    if (item.evolution_kind === "reanchored") {
      issues.push(createSourceLayoutIssue(item, context));
      continue;
    }

    if (item.severity !== "blocking") {
      continue;
    }

    const decision = findSourceReviewDecision(decisions, item);
    if (!context.declared) {
      issues.push(createUndeclaredSourceEvolutionIssue(item, context));
      continue;
    }

    if (!decision || !isKnownSourceReviewStatus(decision.status ?? "proposed") || decision.status === "proposed") {
      issues.push(createUnreviewedSourceEvolutionIssue(item, context));
      continue;
    }

    if (decision.status === "adopted") {
      continue;
    }

    if (decision.status === "rejected") {
      issues.push(createUnreviewedSourceEvolutionIssue(
        item,
        context,
        `Source evolution ${describeSourceEvolutionSubject(item)} was rejected and needs a corrected delta before verify can pass.`,
        decision,
      ));
      continue;
    }

    if (decision.status === "deferred" || decision.status === "waived") {
      const expiresAt = decision.status === "deferred" ? decision.defer_record?.expires_at : decision.waiver_record?.expires_at;
      if (isExpired(expiresAt)) {
        issues.push(createSourceEvolutionIssue(
          "GREENFIELD_SOURCE_EVOLUTION_DEFERRED_EXPIRED",
          "blocking",
          item,
          context,
          `Source evolution ${describeSourceEvolutionSubject(item)} is ${decision.status} but its expiration date has passed.`,
          decision,
        ));
      } else {
        issues.push(createSourceEvolutionIssue(
          "GREENFIELD_SOURCE_EVOLUTION_DEFERRED",
          "advisory",
          item,
          context,
          `Source evolution ${describeSourceEvolutionSubject(item)} is ${decision.status} and remains open until downstream updates are complete.`,
          decision,
        ));
      }
    }
  }

  return issues;
}

function collectProvenanceDriftSignals(root: string): VerifyIssue[] {
  return collectGreenfieldProvenanceAnchorDrift(root).map((drift) => ({
    kind: "semantic",
    severity: drift.severity,
    code: "GREENFIELD_PROVENANCE_ANCHOR_DRIFT",
    path: drift.path,
    message: drift.severity === "advisory"
      ? `Provenance anchor ${drift.anchorId} moved or reworded in ${drift.path}: ${drift.reason}.`
      : `Provenance anchor ${drift.anchorId} drifted in ${drift.path}: ${drift.reason}.`,
    details: {
      source_document: drift.sourceDocument,
      anchor_id: drift.anchorId,
      kind: drift.kind,
      severity: drift.severity,
      expected_line: drift.expectedLine,
      current_line: drift.currentLine,
      paragraph_id: drift.paragraphId,
      expected_checksum: drift.expectedChecksum,
      current_checksum: drift.currentChecksum,
    },
  }));
}

export function readGreenfieldReviewPackCounts(rootInput: string): GreenfieldReviewPackCounts {
  const issues = collectGreenfieldReviewPackIssues(rootInput);

  return {
    unresolvedBlockingCount: issues.filter((issue) => issue.code === "GREENFIELD_REVIEW_ITEM_UNRESOLVED_BLOCKING").length,
    lowConfidenceUnadoptedCount: issues.filter((issue) => issue.code === "GREENFIELD_REVIEW_ITEM_LOW_CONFIDENCE_UNADOPTED").length,
    rejectedCount: issues.filter((issue) => issue.code === "GREENFIELD_REVIEW_ITEM_REJECTED").length,
    deferredOrWaivedCount: issues.filter((issue) => issue.code === "GREENFIELD_REVIEW_ITEM_DEFERRED_OR_WAIVED").length,
  };
}

interface SourceEvolutionContext {
  declared: boolean;
  changeId?: string;
  diff?: GreenfieldSourceEvolutionDiff;
  sourceEvolutionPath?: string;
  proposedSnapshotPath?: string;
  sourceReviewPath?: string;
  reviewRecord?: SourceReviewRecord;
}

function resolveSourceEvolutionContext(root: string): SourceEvolutionContext {
  const activeSession = readChangeSession(root);
  const changeId = activeSession?.specDelta?.changeId;
  if (typeof changeId === "string" && changeId.length > 0) {
    const deltaDir = path.join(root, DELTAS_ROOT, changeId);
    const sourceEvolutionPath = path.join(deltaDir, "source-evolution.json");
    const proposedSnapshotPath = path.join(deltaDir, "source-documents.proposed.yaml");
    const sourceReviewPath = path.join(deltaDir, "source-review.yaml");
    const diff = loadSourceEvolutionDiff(sourceEvolutionPath);
    if (diff) {
      return {
        declared: true,
        changeId,
        diff,
        sourceEvolutionPath: normalizeRelativePath(root, sourceEvolutionPath),
        proposedSnapshotPath: fs.existsSync(proposedSnapshotPath) ? normalizeRelativePath(root, proposedSnapshotPath) : undefined,
        sourceReviewPath: normalizeRelativePath(root, sourceReviewPath),
        reviewRecord: loadSourceReviewRecord(sourceReviewPath),
      };
    }
  }

  return {
    declared: false,
    diff: collectGreenfieldSourceEvolutionDiff(root),
  };
}

function loadSourceEvolutionDiff(filePath: string): GreenfieldSourceEvolutionDiff | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as GreenfieldSourceEvolutionDiff;
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.items)) {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function loadSourceReviewRecord(filePath: string): SourceReviewRecord | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  try {
    const parsed = yaml.load(fs.readFileSync(filePath, "utf-8"));
    return isRecord(parsed) ? parsed as SourceReviewRecord : undefined;
  } catch {
    return undefined;
  }
}

function sourceReviewDecisions(record: SourceReviewRecord | undefined): SourceReviewDecision[] {
  if (!record) {
    return [];
  }
  const items = Array.isArray(record.items) ? record.items : [];
  const decisions = Array.isArray(record.decisions) ? record.decisions : [];
  return [...items, ...decisions].filter(isRecord) as SourceReviewDecision[];
}

function findSourceReviewDecision(
  decisions: SourceReviewDecision[],
  item: GreenfieldSourceEvolutionItem,
): SourceReviewDecision | undefined {
  const candidates = new Set<string>([
    item.evolution_id,
    item.anchor_id,
  ].filter((value): value is string => typeof value === "string" && value.length > 0));
  return decisions.find((decision) =>
    candidates.has(decision.evolution_id ?? "") ||
    candidates.has(decision.item_id ?? ""),
  );
}

function isKnownSourceReviewStatus(status: SourceReviewStatus): boolean {
  return status === "proposed" || status === "adopted" || status === "rejected" || status === "deferred" || status === "waived";
}

function createSourceLayoutIssue(
  item: GreenfieldSourceEvolutionItem,
  context: SourceEvolutionContext,
): VerifyIssue {
  const requirementMove = item.anchor_kind === "requirement" && item.contract_level === "required";
  const code = requirementMove ? "GREENFIELD_SOURCE_REANCHORABLE_MOVE" : "GREENFIELD_SOURCE_LAYOUT_DRIFT";
  const message = requirementMove
    ? `Source requirement ${describeSourceEvolutionSubject(item)} moved without semantic change and can be re-anchored.`
    : `Source layout drift detected for ${describeSourceEvolutionSubject(item)}; this looks like a re-anchorable move or heading rewrite.`;
  return createSourceEvolutionIssue(code, "advisory", item, context, message);
}

function createUndeclaredSourceEvolutionIssue(
  item: GreenfieldSourceEvolutionItem,
  context: SourceEvolutionContext,
): VerifyIssue {
  const details = describeSourceEvolutionSubject(item);
  if (item.evolution_kind === "deprecated") {
    return createSourceEvolutionIssue(
      "GREENFIELD_SOURCE_REQUIREMENT_REMOVED",
      "blocking",
      item,
      context,
      `Requirement ${details} was removed from workspace source documents without an explicit source evolution review.`,
    );
  }

  if (item.evolution_kind === "split" || item.evolution_kind === "merged") {
    return createSourceEvolutionIssue(
      "GREENFIELD_SOURCE_REQUIREMENT_SPLIT_UNMAPPED",
      "blocking",
      item,
      context,
      `Requirement evolution ${details} changes successor mapping, but no source refresh or review ledger records the mapping yet.`,
    );
  }

  if (item.source_document === "technical_solution") {
    return createSourceEvolutionIssue(
      "GREENFIELD_SOURCE_BOUNDARY_CHANGED",
      "blocking",
      item,
      context,
      `Technical boundary source evolution ${details} is present in workspace documents but has not been declared through a source refresh.`,
    );
  }

  return createSourceEvolutionIssue(
    "GREENFIELD_SOURCE_EVOLUTION_UNDECLARED",
    "blocking",
    item,
    context,
    `Source evolution ${details} changed required source semantics, but no active change delta or source review declares it yet.`,
  );
}

function createUnreviewedSourceEvolutionIssue(
  item: GreenfieldSourceEvolutionItem,
  context: SourceEvolutionContext,
  overrideMessage?: string,
  decision?: SourceReviewDecision,
): VerifyIssue {
  const details = describeSourceEvolutionSubject(item);
  if (item.evolution_kind === "deprecated") {
    return createSourceEvolutionIssue(
      "GREENFIELD_SOURCE_REQUIREMENT_REMOVED",
      "blocking",
      item,
      context,
      overrideMessage ?? `Requirement ${details} is marked as removed in source evolution, but no reviewed lifecycle decision records the replacement or deprecation path.`,
      decision,
    );
  }

  if (item.evolution_kind === "split" || item.evolution_kind === "merged") {
    return createSourceEvolutionIssue(
      "GREENFIELD_SOURCE_REQUIREMENT_SPLIT_UNMAPPED",
      "blocking",
      item,
      context,
      overrideMessage ?? `Requirement evolution ${details} needs reviewed successor mapping before verify can accept the split or merge.`,
      decision,
    );
  }

  if (item.source_document === "technical_solution") {
    return createSourceEvolutionIssue(
      "GREENFIELD_SOURCE_BOUNDARY_CHANGED",
      "blocking",
      item,
      context,
      overrideMessage ?? `Technical boundary source evolution ${details} has been declared, but it is still waiting for explicit review.`,
      decision,
    );
  }

  return createSourceEvolutionIssue(
    "GREENFIELD_SOURCE_EVOLUTION_UNREVIEWED",
    "blocking",
    item,
    context,
    overrideMessage ?? `Source evolution ${details} has been declared, but it still needs adopt, defer, waive, or correction before verify can pass.`,
    decision,
  );
}

function createSourceEvolutionIssue(
  code: string,
  severity: "blocking" | "advisory",
  item: GreenfieldSourceEvolutionItem,
  context: SourceEvolutionContext,
  message: string,
  decision?: SourceReviewDecision,
): VerifyIssue {
  return {
    kind: "semantic",
    severity,
    code,
    path: item.path,
    message,
    details: {
      evolution_id: item.evolution_id,
      evolution_kind: item.evolution_kind,
      source_document: item.source_document,
      anchor_id: item.anchor_id,
      anchor_kind: item.anchor_kind,
      contract_level: item.contract_level,
      predecessor_ids: item.predecessor_ids ?? [],
      successor_ids: item.successor_ids ?? [],
      expected_line: item.expected_line,
      current_line: item.current_line,
      expected_checksum: item.expected_checksum,
      current_checksum: item.current_checksum,
      target_origin: context.diff?.target_origin,
      active_change_id: context.changeId,
      declared: context.declared,
      source_evolution_path: context.sourceEvolutionPath,
      proposed_snapshot_path: context.proposedSnapshotPath,
      source_review_path: context.sourceReviewPath,
      review_status: decision?.status,
      review_reason: decision?.reason,
      review_maps_to: decision?.maps_to ?? [],
      defer_expires_at: decision?.defer_record?.expires_at,
      waiver_expires_at: decision?.waiver_record?.expires_at,
    },
  };
}

function describeSourceEvolutionSubject(item: GreenfieldSourceEvolutionItem): string {
  if (typeof item.anchor_id === "string" && item.anchor_id.length > 0) {
    return `${item.anchor_id} (${item.evolution_kind})`;
  }
  if (Array.isArray(item.predecessor_ids) && item.predecessor_ids.length > 0) {
    const successors = Array.isArray(item.successor_ids) && item.successor_ids.length > 0
      ? ` -> ${item.successor_ids.join(", ")}`
      : "";
    return `${item.predecessor_ids.join(", ")}${successors} (${item.evolution_kind})`;
  }
  return item.evolution_id;
}

function normalizeRelativePath(root: string, targetPath: string): string {
  return path.relative(root, targetPath).replace(/\\/g, "/");
}

function createReviewIssue(
  code: string,
  decision: ReviewDecision,
  message: string,
  severity: "advisory" | "blocking" = "advisory",
): VerifyIssue {
  return {
    kind: "semantic",
    severity,
    code,
    path: REVIEW_RECORD_PATH,
    message,
    details: {
      decision_id: decision.decision_id,
      decision_type: decision.decision_type,
      status: decision.status,
      confidence: decision.confidence,
      blocking: decision.blocking,
      conflicts: decision.conflicts ?? [],
      affected_assets: decision.affected_assets ?? [],
      summary: decision.summary,
    },
  };
}

function loadGreenfieldReviewGatePolicy(root: string): GreenfieldReviewGatePolicy {
  const defaults: GreenfieldReviewGatePolicy = {
    low_confidence_blocks: true,
    low_confidence_blocks_by_decision_type: {},
    conflict_blocks: true,
    blocking_review_item_blocks: true,
    blocking_open_decision_types: [],
    rejected_blocks: true,
    deferred_or_waived_severity: "advisory",
    expired_defer_or_waive_severity: "blocking",
  };
  const policyPath = path.join(root, ".spec", "policy.yaml");
  if (!fs.existsSync(policyPath)) {
    return defaults;
  }

  try {
    const parsed = yaml.load(fs.readFileSync(policyPath, "utf-8"));
    if (!isRecord(parsed) || !isRecord(parsed.greenfield) || !isRecord(parsed.greenfield.review_gate)) {
      return defaults;
    }
    const reviewGate = parsed.greenfield.review_gate;
    return {
      low_confidence_blocks: booleanValue(reviewGate.low_confidence_blocks, defaults.low_confidence_blocks),
      low_confidence_blocks_by_decision_type: booleanRecordValue(
        reviewGate.low_confidence_blocks_by_decision_type,
        defaults.low_confidence_blocks_by_decision_type,
      ),
      conflict_blocks: booleanValue(reviewGate.conflict_blocks, defaults.conflict_blocks),
      blocking_review_item_blocks: booleanValue(reviewGate.blocking_review_item_blocks, defaults.blocking_review_item_blocks),
      blocking_open_decision_types: stringArrayValue(
        reviewGate.blocking_open_decision_types,
        defaults.blocking_open_decision_types,
      ),
      rejected_blocks: booleanValue(reviewGate.rejected_blocks, defaults.rejected_blocks),
      deferred_or_waived_severity: severityValue(
        reviewGate.deferred_or_waived_severity,
        defaults.deferred_or_waived_severity,
      ),
      expired_defer_or_waive_severity: severityValue(
        reviewGate.expired_defer_or_waive_severity,
        defaults.expired_defer_or_waive_severity,
      ),
    };
  } catch {
    return defaults;
  }
}

function lowConfidenceBlocks(decision: ReviewDecision, policy: GreenfieldReviewGatePolicy): boolean {
  const decisionType = decision.decision_type;
  if (decisionType && Object.prototype.hasOwnProperty.call(policy.low_confidence_blocks_by_decision_type, decisionType)) {
    return policy.low_confidence_blocks_by_decision_type[decisionType] === true;
  }
  return policy.low_confidence_blocks;
}

function isExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) {
    return false;
  }
  const time = new Date(expiresAt).getTime();
  return !Number.isNaN(time) && Date.now() > time;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function booleanRecordValue(value: unknown, fallback: Record<string, boolean>): Record<string, boolean> {
  if (!isRecord(value)) {
    return fallback;
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, boolean] =>
      typeof entry[0] === "string" && typeof entry[1] === "boolean",
    ),
  );
}

function stringArrayValue(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).sort()
    : fallback;
}

function severityValue(value: unknown, fallback: "ignore" | "advisory" | "blocking"): "ignore" | "advisory" | "blocking" {
  return value === "ignore" || value === "advisory" || value === "blocking" ? value : fallback;
}

function loadReviewRecord(recordPath: string): ReviewRecord | undefined {
  try {
    const data = yaml.load(fs.readFileSync(recordPath, "utf-8"));
    if (!isRecord(data)) {
      return undefined;
    }
    return data as ReviewRecord;
  } catch {
    return undefined;
  }
}

function collectWrongThingSignals(root: string, record: ReviewRecord): VerifyIssue[] {
  return [
    ...collectUncoveredRequirementSignals(root),
    ...collectUnexplainedTechnicalContextSignals(root, record),
    ...collectCrudContractSignals(root),
    ...collectMissingFailurePathSignals(root),
  ];
}

function collectUncoveredRequirementSignals(root: string): VerifyIssue[] {
  const graph = loadEvidenceGraph(root);
  const uncovered = graph?.summary?.requirementCoverage?.uncovered ?? [];
  return uncovered.map((requirementId) => ({
    kind: "semantic",
    severity: "advisory",
    code: "GREENFIELD_REVIEW_SIGNAL_REQUIREMENT_UNCOVERED",
    path: EVIDENCE_GRAPH_PATH,
    message: `Requirement ${requirementId} is not covered by the generated Greenfield Evidence Graph.`,
    details: {
      requirement_id: requirementId,
    },
  }));
}

function collectUnexplainedTechnicalContextSignals(root: string, record: ReviewRecord): VerifyIssue[] {
  const technicalSolutionPath = path.join(root, "docs", "input", "technical-solution.md");
  if (!fs.existsSync(technicalSolutionPath)) {
    return [];
  }

  const technicalSolution = safeRead(technicalSolutionPath);
  const contextCandidates = extractTechnicalContextCandidates(technicalSolution);
  if (contextCandidates.length === 0) {
    return [];
  }

  const explainedContexts = new Set(
    (record.decisions ?? [])
      .filter((decision) => decision.decision_type === "domain_context")
      .flatMap((decision) => extractContextIdsFromDecision(decision))
      .map((entry) => entry.toLowerCase()),
  );

  return contextCandidates
    .filter((contextId) => !explainedContexts.has(contextId))
    .map((contextId) => ({
      kind: "semantic",
      severity: "advisory",
      code: "GREENFIELD_REVIEW_SIGNAL_CONTEXT_UNEXPLAINED",
      path: "docs/input/technical-solution.md",
      message: `Technical solution proposes context ${contextId}, but the Review Pack neither adopts nor excludes it.`,
      details: {
        context_id: contextId,
      },
    }));
}

function collectCrudContractSignals(root: string): VerifyIssue[] {
  const contextsRoot = path.join(root, "contexts");
  if (!fs.existsSync(contextsRoot)) {
    return [];
  }

  const issues: VerifyIssue[] = [];
  for (const contractPath of findContractsFiles(contextsRoot, root)) {
    const parsed = yaml.load(safeRead(path.join(root, contractPath)));
    if (!isRecord(parsed) || !Array.isArray(parsed.contracts)) {
      continue;
    }
    for (const contract of parsed.contracts.filter(isRecord)) {
      const id = typeof contract.id === "string" ? contract.id : "unknown-contract";
      const name = typeof contract.name === "string" ? contract.name : "";
      const direction = typeof contract.direction === "string" ? contract.direction : "";
      const fields = Array.isArray(contract.fields) ? contract.fields.length : 0;
      const looksCrud = /^(Create|Read|Update|Delete|List|Get)[A-Z]/.test(name) || /\bcrud\b/i.test(name);
      const hasBusinessVerb = /\b(Checkout|Availability|OrderCreated|Cart|Product|Payment|Shipment|Refund|Invoice|Event|Snapshot|View)\b/.test(name);
      if (looksCrud && !hasBusinessVerb) {
        issues.push({
          kind: "semantic",
          severity: "advisory",
          code: "GREENFIELD_REVIEW_SIGNAL_CRUD_CONTRACT",
          path: contractPath,
          message: `Contract ${id} (${name || direction}) looks CRUD-oriented and lacks clear business behavior language.`,
          details: {
            contract_id: id,
            contract_name: name,
            field_count: fields,
          },
        });
      }
    }
  }

  return issues;
}

function collectMissingFailurePathSignals(root: string): VerifyIssue[] {
  const requirements = safeRead(path.join(root, "docs", "input", "requirements.md"));
  if (!/\b(reject|must not|unless|invalid|fail|unavailable|error)\b/i.test(requirements)) {
    return [];
  }

  const scenarioFiles = findScenarioFiles(path.join(root, "contexts"), root);
  if (scenarioFiles.length === 0) {
    return [];
  }
  const scenarioText = scenarioFiles.map((scenarioPath) => safeRead(path.join(root, scenarioPath))).join("\n");
  if (/\b(reject|must not|unless|invalid|fail|unavailable|error|not sellable|no order)\b/i.test(scenarioText)) {
    return [];
  }

  return [{
    kind: "semantic",
    severity: "advisory",
    code: "GREENFIELD_REVIEW_SIGNAL_FAILURE_PATH_MISSING",
    path: "contexts",
    message: "Requirements contain rejection or failure semantics, but generated behavior scenarios do not include an obvious failure path.",
  }];
}

function loadEvidenceGraph(root: string): EvidenceGraph | undefined {
  const graphPath = path.join(root, EVIDENCE_GRAPH_PATH);
  if (!fs.existsSync(graphPath)) {
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(graphPath, "utf-8")) as EvidenceGraph;
  } catch {
    return undefined;
  }
}

function extractTechnicalContextCandidates(content: string): string[] {
  const candidates = new Set<string>();
  for (const match of content.matchAll(/\bbounded contexts?\s+(?:for|as|:)\s*([^\n.]+)/gi)) {
    for (const candidate of extractContextTokens(match[1] ?? "")) {
      candidates.add(candidate);
    }
  }
  for (const match of content.matchAll(/`([a-z][a-z0-9-]*)`/gi)) {
    const contextId = normalizeContextId(match[1] ?? "");
    if (contextId && !isTechnicalWord(contextId)) {
      candidates.add(contextId);
    }
  }
  return Array.from(candidates).sort();
}

function extractContextTokens(segment: string): string[] {
  return segment
    .split(/,|\band\b|，|、|\s+-\s+/i)
    .map(normalizeContextId)
    .filter((entry) => entry && !isTechnicalWord(entry));
}

function extractContextIdsFromDecision(decision: ReviewDecision): string[] {
  const values = [
    decision.summary ?? "",
    ...(decision.affected_assets ?? []),
  ];
  return values.flatMap((value) => {
    const contexts: string[] = [];
    const contextPath = value.match(/contexts\/([^/]+)/);
    if (contextPath?.[1]) {
      contexts.push(contextPath[1]);
    }
    const exclude = value.match(/\b(?:Create|Exclude)\s+([A-Z][A-Za-z0-9-]+)/);
    if (exclude?.[1]) {
      contexts.push(normalizeContextId(exclude[1]));
    }
    return contexts;
  });
}

function findContractsFiles(root: string, repoRoot: string): string[] {
  const files: string[] = [];
  visit(root, repoRoot, files, (relativePath) => /\/design\/contracts\.ya?ml$/i.test(relativePath));
  return files;
}

function findScenarioFiles(root: string, repoRoot: string): string[] {
  const files: string[] = [];
  visit(root, repoRoot, files, (relativePath) => /\/behavior\/scenarios\/.+\.feature$/i.test(relativePath));
  return files;
}

function visit(directory: string, repoRoot: string, files: string[], accept: (relativePath: string) => boolean): void {
  if (!fs.existsSync(directory)) {
    return;
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      visit(fullPath, repoRoot, files, accept);
      continue;
    }
    const relativePath = normalizePath(path.relative(repoRoot, fullPath));
    if (entry.isFile() && accept(relativePath)) {
      files.push(relativePath);
    }
  }
}

function normalizeContextId(value: string): string {
  return value
    .trim()
    .replace(/[`'"]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isTechnicalWord(value: string): boolean {
  return [
    "architecture",
    "context",
    "contexts",
    "direction",
    "integration",
    "solution",
    "technical",
  ].includes(value);
}

function safeRead(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function isKnownStatus(status: string): status is ReviewStatus {
  return ["proposed", "adopted", "rejected", "deferred", "waived"].includes(status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
