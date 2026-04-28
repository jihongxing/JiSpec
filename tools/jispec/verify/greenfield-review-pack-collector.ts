import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { collectGreenfieldProvenanceAnchorDrift } from "../greenfield/provenance-drift";
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
  issues.push(...collectProvenanceDriftSignals(root));

  return issues.sort((left, right) =>
    `${left.code}|${left.path ?? ""}|${left.message}`.localeCompare(`${right.code}|${right.path ?? ""}|${right.message}`),
  );
}

function collectProvenanceDriftSignals(root: string): VerifyIssue[] {
  return collectGreenfieldProvenanceAnchorDrift(root).map((drift) => ({
    kind: "semantic",
    severity: "blocking",
    code: "GREENFIELD_PROVENANCE_ANCHOR_DRIFT",
    path: drift.path,
    message: `Provenance anchor ${drift.anchorId} drifted in ${drift.path}: ${drift.reason}.`,
    details: {
      source_document: drift.sourceDocument,
      anchor_id: drift.anchorId,
      kind: drift.kind,
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
