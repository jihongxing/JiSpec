import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { appendAuditEvent } from "../audit/event-ledger";
import { draftSpecDelta, type SpecDeltaDraftResult } from "../change/spec-delta";
import { writeGreenfieldSpecDebtRecord, type GreenfieldSpecDebtRecord } from "./spec-debt-ledger";

export type GreenfieldReviewAction = "adopt" | "reject" | "defer" | "waive";
export type GreenfieldReviewLanguage = "zh-CN" | "en-US";
export type GreenfieldReviewStatus = "proposed" | "adopted" | "rejected" | "deferred" | "waived";
export type GreenfieldReviewConfidence = "high" | "medium" | "low";

export interface GreenfieldReviewEvidenceRef {
  source?: string;
  ref?: string;
  excerpt?: string;
  path?: string;
  line?: number;
  paragraph_id?: string;
  checksum?: string;
}

export interface GreenfieldReviewDecision {
  decision_id: string;
  decision_type: string;
  summary: string;
  recommended_action?: string;
  confidence: GreenfieldReviewConfidence;
  evidence_refs: GreenfieldReviewEvidenceRef[];
  rejected_alternatives: string[];
  risks: string[];
  conflicts: string[];
  status: GreenfieldReviewStatus;
  blocking: boolean;
  affected_assets: string[];
  review_history?: GreenfieldReviewHistoryEntry[];
  correction?: GreenfieldReviewCorrectionRef;
  defer_record?: GreenfieldReviewDeferRecord;
  waiver_record?: GreenfieldReviewWaiverRecord;
}

export interface GreenfieldReviewHistoryEntry {
  action: GreenfieldReviewAction;
  actor: string;
  reason: string;
  timestamp: string;
}

export interface GreenfieldReviewCorrectionRef {
  correction_path: string;
  delta_path?: string;
  delta_id?: string;
  hint: string;
}

export interface GreenfieldReviewDeferRecord {
  owner: string;
  reason: string;
  expires_at?: string;
  repayment_hint: string;
  open_decision_path: string;
}

export interface GreenfieldReviewWaiverRecord {
  owner: string;
  reason: string;
  expires_at?: string;
  debt_id: string;
  ledger_path: string;
}

export interface GreenfieldReviewRecord {
  review_pack_version?: number;
  project_id?: string;
  project_name?: string;
  generated_at?: string;
  gate?: {
    status?: string;
    policy_hint?: string;
  };
  decisions: GreenfieldReviewDecision[];
}

export interface GreenfieldReviewListResult {
  root: string;
  recordPath: string;
  total: number;
  groups: Record<string, GreenfieldReviewDecision[]>;
  decisions: GreenfieldReviewDecision[];
}

export interface GreenfieldReviewTransitionOptions {
  root: string;
  decisionId: string;
  action: GreenfieldReviewAction;
  actor?: string;
  owner?: string;
  reason?: string;
  expiresAt?: string;
  now?: string;
}

export interface GreenfieldReviewTransitionResult {
  root: string;
  recordPath: string;
  decision: GreenfieldReviewDecision;
  action: GreenfieldReviewAction;
  correction?: GreenfieldReviewCorrectionRef;
  specDebt?: GreenfieldSpecDebtRecord;
  openDecisionPath?: string;
  nextCommands: string[];
}

export interface GreenfieldReviewBriefOptions {
  root: string;
  lang?: GreenfieldReviewLanguage;
  output?: string;
}

export interface GreenfieldReviewBriefResult {
  root: string;
  lang: GreenfieldReviewLanguage;
  outputPath: string;
  markdown: string;
  decisionCount: number;
  blockingCount: number;
  lowConfidenceCount: number;
  rejectedCount: number;
}

const REVIEW_RECORD_PATH = ".spec/greenfield/review-pack/review-record.yaml";
const REVIEW_CORRECTION_DIR = ".spec/greenfield/review-corrections";
const GREENFIELD_OPEN_DECISIONS_PATH = ".spec/greenfield/open-decisions.md";
const REVIEW_OPEN_DECISIONS_PATH = ".spec/greenfield/review-pack/open-decisions.md";
const SPEC_DEBT_LEDGER_PATH = ".spec/spec-debt/ledger.yaml";

export function runGreenfieldReviewList(rootInput: string): GreenfieldReviewListResult {
  const root = path.resolve(rootInput);
  const record = loadGreenfieldReviewRecord(root);
  const decisions = [...record.decisions].sort(compareDecisions);

  return {
    root: normalizePath(root),
    recordPath: REVIEW_RECORD_PATH,
    total: decisions.length,
    groups: groupReviewDecisions(decisions),
    decisions,
  };
}

export function runGreenfieldReviewTransition(
  options: GreenfieldReviewTransitionOptions,
): GreenfieldReviewTransitionResult {
  const root = path.resolve(options.root);
  const record = loadGreenfieldReviewRecord(root);
  const decision = findDecision(record, options.decisionId);
  const timestamp = options.now ?? new Date().toISOString();
  const actor = options.actor ?? inferActor();
  const reason = options.reason ?? defaultReasonForAction(options.action);

  if ((options.action === "defer" || options.action === "waive") && !options.owner?.trim()) {
    throw new Error(`--owner is required for review ${options.action}.`);
  }
  if ((options.action === "reject" || options.action === "defer" || options.action === "waive") && !reason.trim()) {
    throw new Error(`--reason is required for review ${options.action}.`);
  }
  if (options.expiresAt && Number.isNaN(new Date(options.expiresAt).getTime())) {
    throw new Error(`--expires-at is not a valid date: ${options.expiresAt}`);
  }

  decision.status = statusForAction(options.action);
  decision.review_history = [
    ...(decision.review_history ?? []),
    {
      action: options.action,
      actor,
      reason,
      timestamp,
    },
  ];

  let correction: GreenfieldReviewCorrectionRef | undefined;
  let specDebt: GreenfieldSpecDebtRecord | undefined;
  let openDecisionPath: string | undefined;

  if (options.action === "reject") {
    correction = writeReviewCorrection(root, decision, reason, timestamp);
    decision.correction = correction;
  }

  if (options.action === "defer") {
    openDecisionPath = writeReviewOpenDecision(root, decision, {
      owner: options.owner ?? actor,
      reason,
      expiresAt: options.expiresAt,
      timestamp,
    });
    decision.defer_record = {
      owner: options.owner ?? actor,
      reason,
      expires_at: options.expiresAt,
      repayment_hint: repaymentHintForDecision(decision),
      open_decision_path: openDecisionPath,
    };
  }

  if (options.action === "waive") {
    specDebt = writeGreenfieldSpecDebtRecord(root, {
      id: `debt-review-${slugify(decision.decision_id)}`,
      kind: "waiver",
      owner: options.owner ?? actor,
      reason,
      createdAt: timestamp,
      expiresAt: options.expiresAt,
      affectedAssets: decision.affected_assets,
      affectedContracts: extractAffectedIds(decision, /^CTR-/),
      affectedScenarios: extractAffectedIds(decision, /^SCN-/),
      affectedSlices: extractAffectedSliceIds(decision),
      repaymentHint: repaymentHintForDecision(decision),
      source: {
        type: "waiver",
        ref: decision.decision_id,
      },
    });
    decision.waiver_record = {
      owner: options.owner ?? actor,
      reason,
      expires_at: options.expiresAt,
      debt_id: specDebt.id,
      ledger_path: SPEC_DEBT_LEDGER_PATH,
    };
  }

  updateGateStatus(record);
  writeGreenfieldReviewRecord(root, record);
  appendAuditEvent(root, {
    type: `review_${options.action}`,
    actor,
    reason,
    sourceArtifact: {
      kind: "greenfield-review-record",
      path: REVIEW_RECORD_PATH,
    },
    affectedContracts: [
      ...extractAffectedIds(decision, /^CTR-/),
      ...decision.affected_assets,
    ],
    details: {
      decisionId: decision.decision_id,
      decisionType: decision.decision_type,
      status: decision.status,
      owner: options.owner,
      correctionPath: correction?.correction_path,
      specDebtId: specDebt?.id,
      openDecisionPath,
    },
  });

  return {
    root: normalizePath(root),
    recordPath: REVIEW_RECORD_PATH,
    decision,
    action: options.action,
    correction,
    specDebt,
    openDecisionPath,
    nextCommands: buildTransitionNextCommands(options.action, decision, correction, specDebt),
  };
}

export function runGreenfieldReviewBrief(options: GreenfieldReviewBriefOptions): GreenfieldReviewBriefResult {
  const root = path.resolve(options.root);
  const lang = options.lang ?? "zh-CN";
  const record = loadGreenfieldReviewRecord(root);
  const markdown = renderGreenfieldReviewBrief(record, lang);
  const outputPath = options.output ?? `.spec/greenfield/review-pack/human-review.${lang}.md`;
  const resolvedOutputPath = path.isAbsolute(outputPath) ? outputPath : path.join(root, outputPath);

  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, markdown, "utf-8");

  const decisions = record.decisions;
  return {
    root: normalizePath(root),
    lang,
    outputPath: normalizePath(resolvedOutputPath),
    markdown,
    decisionCount: decisions.length,
    blockingCount: decisions.filter((decision) => isUnresolvedBlockingDecision(decision)).length,
    lowConfidenceCount: decisions.filter((decision) => decision.confidence === "low" && decision.status === "proposed").length,
    rejectedCount: decisions.filter((decision) => decision.status === "rejected").length,
  };
}

export function renderGreenfieldReviewListText(result: GreenfieldReviewListResult): string {
  const lines = [
    "Greenfield Review Decisions",
    `Root: ${result.root}`,
    `Review record: ${result.recordPath}`,
    `Total: ${result.total}`,
    "",
  ];

  for (const group of ["blocking", "low-confidence", "conflict", "rejected", "deferred", "waived", "adopted", "advisory"]) {
    const decisions = result.groups[group] ?? [];
    lines.push(`${titleCase(group)} (${decisions.length})`);
    if (decisions.length === 0) {
      lines.push("- None");
    } else {
      lines.push(...decisions.map((decision) =>
        `- ${decision.decision_id} [${decision.status}, ${decision.confidence}]: ${decision.summary}`,
      ));
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function renderGreenfieldReviewTransitionText(result: GreenfieldReviewTransitionResult): string {
  const lines = [
    `Review ${result.action} complete.`,
    `Decision: ${result.decision.decision_id}`,
    `Status: ${result.decision.status}`,
    `Review record: ${result.recordPath}`,
  ];

  if (result.correction) {
    lines.push(`Correction: ${result.correction.correction_path}`);
    if (result.correction.delta_path) {
      lines.push(`Correction delta: ${result.correction.delta_path}`);
    }
  }

  if (result.openDecisionPath) {
    lines.push(`Open decision: ${result.openDecisionPath}`);
  }

  if (result.specDebt) {
    lines.push(`Spec debt: ${SPEC_DEBT_LEDGER_PATH}#${result.specDebt.id}`);
  }

  if (result.nextCommands.length > 0) {
    lines.push("", "Next:");
    lines.push(...result.nextCommands.map((command) => `- ${command}`));
  }

  return lines.join("\n");
}

export function renderGreenfieldReviewBriefText(result: GreenfieldReviewBriefResult): string {
  return [
    "Greenfield human review brief written.",
    `Language: ${result.lang}`,
    `Output: ${result.outputPath}`,
    `Decisions: ${result.decisionCount}`,
    `Blocking: ${result.blockingCount}`,
    `Low confidence proposed: ${result.lowConfidenceCount}`,
    `Rejected: ${result.rejectedCount}`,
  ].join("\n");
}

function loadGreenfieldReviewRecord(rootInput: string): GreenfieldReviewRecord {
  const root = path.resolve(rootInput);
  const recordPath = path.join(root, REVIEW_RECORD_PATH);
  if (!fs.existsSync(recordPath)) {
    throw new Error(`Greenfield review record not found: ${REVIEW_RECORD_PATH}`);
  }

  const parsed = yaml.load(fs.readFileSync(recordPath, "utf-8"));
  if (!isRecord(parsed) || !Array.isArray(parsed.decisions)) {
    throw new Error(`Greenfield review record is invalid: ${REVIEW_RECORD_PATH}`);
  }

  return {
    review_pack_version: numberValue(parsed.review_pack_version),
    project_id: stringValue(parsed.project_id),
    project_name: stringValue(parsed.project_name),
    generated_at: stringValue(parsed.generated_at),
    gate: isRecord(parsed.gate)
      ? {
          status: stringValue(parsed.gate.status),
          policy_hint: stringValue(parsed.gate.policy_hint),
        }
      : undefined,
    decisions: parsed.decisions.filter(isRecord).map(normalizeDecision),
  };
}

function writeGreenfieldReviewRecord(root: string, record: GreenfieldReviewRecord): void {
  const recordPath = path.join(root, REVIEW_RECORD_PATH);
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(recordPath, dumpYaml(record), "utf-8");
}

function normalizeDecision(record: Record<string, unknown>): GreenfieldReviewDecision {
  const decisionId = requiredString(record.decision_id, "decision_id");
  const status = normalizeStatus(record.status);
  const confidence = normalizeConfidence(record.confidence);
  return {
    decision_id: decisionId,
    decision_type: requiredString(record.decision_type, `decision_type for ${decisionId}`),
    summary: requiredString(record.summary, `summary for ${decisionId}`),
    recommended_action: stringValue(record.recommended_action),
    confidence,
    evidence_refs: arrayRecords(record.evidence_refs).map((entry) => ({
      source: stringValue(entry.source),
      ref: stringValue(entry.ref),
      excerpt: stringValue(entry.excerpt),
      path: stringValue(entry.path),
      line: numberValue(entry.line),
      paragraph_id: stringValue(entry.paragraph_id),
      checksum: stringValue(entry.checksum),
    })),
    rejected_alternatives: stringArray(record.rejected_alternatives),
    risks: stringArray(record.risks),
    conflicts: stringArray(record.conflicts),
    status,
    blocking: record.blocking === true,
    affected_assets: stringArray(record.affected_assets),
    review_history: arrayRecords(record.review_history).map((entry) => ({
      action: normalizeAction(entry.action),
      actor: stringValue(entry.actor) ?? "unknown",
      reason: stringValue(entry.reason) ?? "",
      timestamp: stringValue(entry.timestamp) ?? "",
    })),
    correction: normalizeCorrection(record.correction),
    defer_record: normalizeDeferRecord(record.defer_record),
    waiver_record: normalizeWaiverRecord(record.waiver_record),
  };
}

function findDecision(record: GreenfieldReviewRecord, decisionId: string): GreenfieldReviewDecision {
  const decision = record.decisions.find((entry) => entry.decision_id === decisionId);
  if (!decision) {
    throw new Error(`Review decision not found: ${decisionId}`);
  }
  return decision;
}

function groupReviewDecisions(decisions: GreenfieldReviewDecision[]): Record<string, GreenfieldReviewDecision[]> {
  const groups: Record<string, GreenfieldReviewDecision[]> = {
    blocking: [],
    "low-confidence": [],
    conflict: [],
    rejected: [],
    deferred: [],
    waived: [],
    adopted: [],
    advisory: [],
  };

  for (const decision of decisions) {
    if (isUnresolvedBlockingDecision(decision)) {
      groups.blocking.push(decision);
    } else if (decision.status === "rejected") {
      groups.rejected.push(decision);
    } else if (decision.status === "deferred") {
      groups.deferred.push(decision);
    } else if (decision.status === "waived") {
      groups.waived.push(decision);
    } else if (decision.status === "adopted") {
      groups.adopted.push(decision);
    } else if (decision.confidence === "low" && decision.status === "proposed") {
      groups["low-confidence"].push(decision);
    } else if (decision.conflicts.length > 0 && decision.status === "proposed") {
      groups.conflict.push(decision);
    } else {
      groups.advisory.push(decision);
    }
  }

  for (const group of Object.values(groups)) {
    group.sort(compareDecisions);
  }
  return groups;
}

function writeReviewCorrection(
  root: string,
  decision: GreenfieldReviewDecision,
  reason: string,
  timestamp: string,
): GreenfieldReviewCorrectionRef {
  const correctionDir = path.join(root, REVIEW_CORRECTION_DIR);
  fs.mkdirSync(correctionDir, { recursive: true });
  const correctionRelativePath = `${REVIEW_CORRECTION_DIR}/${slugify(decision.decision_id)}.yaml`;
  const correctionPath = path.join(root, correctionRelativePath);
  const delta = draftSpecDelta({
    root,
    summary: `Review correction for ${decision.decision_id}: ${reason}`,
    changeType: inferCorrectionChangeType(decision),
    createdAt: timestamp,
    contextId: inferContextId(decision),
    sliceId: inferSliceId(decision),
  });
  const hint = correctionHintForDecision(decision);
  const payload = {
    decision_id: decision.decision_id,
    decision_type: decision.decision_type,
    status: "rejected",
    reason,
    created_at: timestamp,
    affected_assets: decision.affected_assets,
    correction_hint: hint,
    delta: delta
      ? {
          change_id: delta.changeId,
          delta_path: relativePath(root, delta.deltaPath),
          impact_report_path: relativePath(root, delta.impactReportPath),
          verify_focus_path: relativePath(root, delta.verifyFocusPath),
        }
      : null,
  };
  fs.writeFileSync(correctionPath, dumpYaml(payload), "utf-8");

  return {
    correction_path: correctionRelativePath,
    delta_id: delta?.changeId,
    delta_path: delta ? relativePath(root, delta.deltaPath) : undefined,
    hint,
  };
}

function writeReviewOpenDecision(
  root: string,
  decision: GreenfieldReviewDecision,
  options: {
    owner: string;
    reason: string;
    expiresAt?: string;
    timestamp: string;
  },
): string {
  const block = [
    "",
    `## Deferred Review Decision: ${decision.decision_id}`,
    "",
    `- Owner: \`${options.owner}\``,
    `- Reason: ${options.reason}`,
    `- Created at: \`${options.timestamp}\``,
    `- Expires at: ${options.expiresAt ? `\`${options.expiresAt}\`` : "not set"}`,
    `- Repayment hint: ${repaymentHintForDecision(decision)}`,
    `- Affected assets: ${decision.affected_assets.map((asset) => `\`${asset}\``).join(", ") || "none"}`,
    "",
  ].join("\n");

  appendUniqueMarkdownBlock(path.join(root, GREENFIELD_OPEN_DECISIONS_PATH), decision.decision_id, block);
  appendUniqueMarkdownBlock(path.join(root, REVIEW_OPEN_DECISIONS_PATH), decision.decision_id, block);
  return REVIEW_OPEN_DECISIONS_PATH;
}

function appendUniqueMarkdownBlock(filePath: string, marker: string, block: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "# Greenfield Open Decisions\n";
  if (existing.includes(marker)) {
    return;
  }
  fs.writeFileSync(filePath, `${existing.trimEnd()}\n${block}`, "utf-8");
}

function renderGreenfieldReviewBrief(record: GreenfieldReviewRecord, lang: GreenfieldReviewLanguage): string {
  return lang === "en-US" ? renderEnglishBrief(record) : renderChineseBrief(record);
}

function renderChineseBrief(record: GreenfieldReviewRecord): string {
  const decisions = [...record.decisions].sort(compareDecisions);
  const groups = groupReviewDecisions(decisions);
  return [
    `# ${record.project_name ?? record.project_id ?? "Greenfield Project"} 初始化人类审查报告`,
    "",
    "## 总体结论",
    "",
    `- 审查项总数：${decisions.length}`,
    `- 阻断项：${groups.blocking.length}`,
    `- 低置信度未采纳：${groups["low-confidence"].length}`,
    `- 冲突项：${groups.conflict.length}`,
    `- 已否决：${groups.rejected.length}`,
    `- 已延期：${groups.deferred.length}`,
    `- 已豁免：${groups.waived.length}`,
    "",
    renderChineseConclusion(groups),
    "",
    "## 优先审查",
    "",
    ...renderBriefGroup(groups.blocking, "阻断项"),
    ...renderBriefGroup(groups["low-confidence"], "低置信度项"),
    ...renderBriefGroup(groups.conflict, "冲突项"),
    ...renderBriefGroup(groups.rejected, "已否决项"),
    "",
    "## 建议采纳",
    "",
    ...renderBriefGroup(groups.advisory.filter((decision) => decision.confidence === "high"), "高置信度建议"),
    ...renderBriefGroup(groups.advisory.filter((decision) => decision.confidence === "medium"), "中置信度建议"),
    "",
    "## 下一步",
    "",
    "- 对阻断、低置信度、冲突和已否决项执行 `jispec-cli review adopt|reject|defer|waive`。",
    "- 对被 reject 的决策查看 `.spec/greenfield/review-corrections/` 和对应 correction delta。",
    "- 在 `jispec-cli verify --root . --policy .spec/policy.yaml` 通过后，再进入 AI implementation handoff。",
    "",
  ].join("\n");
}

function renderEnglishBrief(record: GreenfieldReviewRecord): string {
  const decisions = [...record.decisions].sort(compareDecisions);
  const groups = groupReviewDecisions(decisions);
  return [
    `# ${record.project_name ?? record.project_id ?? "Greenfield Project"} Human Review Brief`,
    "",
    "## Summary",
    "",
    `- Decisions: ${decisions.length}`,
    `- Blocking: ${groups.blocking.length}`,
    `- Low-confidence proposed: ${groups["low-confidence"].length}`,
    `- Conflicts: ${groups.conflict.length}`,
    `- Rejected: ${groups.rejected.length}`,
    `- Deferred: ${groups.deferred.length}`,
    `- Waived: ${groups.waived.length}`,
    "",
    renderEnglishConclusion(groups),
    "",
    "## Priority Review",
    "",
    ...renderBriefGroup(groups.blocking, "Blocking Items"),
    ...renderBriefGroup(groups["low-confidence"], "Low Confidence Items"),
    ...renderBriefGroup(groups.conflict, "Conflicts"),
    ...renderBriefGroup(groups.rejected, "Rejected Items"),
    "",
    "## Adoption Candidates",
    "",
    ...renderBriefGroup(groups.advisory.filter((decision) => decision.confidence === "high"), "High Confidence"),
    ...renderBriefGroup(groups.advisory.filter((decision) => decision.confidence === "medium"), "Medium Confidence"),
    "",
    "## Next Steps",
    "",
    "- Use `jispec-cli review adopt|reject|defer|waive` for unresolved review decisions.",
    "- Inspect `.spec/greenfield/review-corrections/` for rejected decisions and correction deltas.",
    "- Enter AI implementation handoff only after `jispec-cli verify --root . --policy .spec/policy.yaml` passes.",
    "",
  ].join("\n");
}

function renderBriefGroup(decisions: GreenfieldReviewDecision[], title: string): string[] {
  if (decisions.length === 0) {
    return [`### ${title}`, "", "- None", ""];
  }

  return [
    `### ${title}`,
    "",
    ...decisions.flatMap((decision) => [
      `- \`${decision.decision_id}\`：${decision.summary}`,
      `  - 状态/置信度：\`${decision.status}\` / \`${decision.confidence}\``,
      `  - 建议：${decision.recommended_action ?? "Review before implementation."}`,
      `  - 风险：${decision.risks.length > 0 ? decision.risks.join("; ") : "None recorded."}`,
      `  - 证据：${renderEvidenceRefs(decision.evidence_refs)}`,
    ]),
    "",
  ];
}

function renderChineseConclusion(groups: Record<string, GreenfieldReviewDecision[]>): string {
  if (groups.blocking.length === 0 && groups["low-confidence"].length === 0 && groups.conflict.length === 0 && groups.rejected.length === 0) {
    return "> 当前 Review Pack 没有必须阻断实现的审查项，但中置信度开放决策仍应在实现前确认。";
  }
  return "> 当前 Review Pack 仍存在需要处理的审查项，建议先完成采纳、否决、延期或豁免，再进入实现。";
}

function renderEnglishConclusion(groups: Record<string, GreenfieldReviewDecision[]>): string {
  if (groups.blocking.length === 0 && groups["low-confidence"].length === 0 && groups.conflict.length === 0 && groups.rejected.length === 0) {
    return "> The review pack has no implementation-blocking items, but medium-confidence decisions should still be reviewed before handoff.";
  }
  return "> The review pack still has unresolved items. Resolve them before implementation handoff.";
}

function renderEvidenceRefs(refs: GreenfieldReviewEvidenceRef[]): string {
  if (refs.length === 0) {
    return "none";
  }
  return refs.map((ref) => {
    const parts = [ref.source, ref.ref].filter(Boolean).join(":");
    const location = ref.path ? ` ${ref.path}${ref.line ? `:${ref.line}` : ""}` : "";
    return `${parts || "evidence"}${location}`;
  }).join(", ");
}

function updateGateStatus(record: GreenfieldReviewRecord): void {
  const groups = groupReviewDecisions(record.decisions);
  const blocked = groups.blocking.length > 0 || groups["low-confidence"].length > 0 || groups.conflict.length > 0 || groups.rejected.length > 0;
  record.gate = {
    ...(record.gate ?? {}),
    status: blocked ? "blocked_on_human_review" : "review_ready",
  };
}

function buildTransitionNextCommands(
  action: GreenfieldReviewAction,
  decision: GreenfieldReviewDecision,
  correction: GreenfieldReviewCorrectionRef | undefined,
  specDebt: GreenfieldSpecDebtRecord | undefined,
): string[] {
  if (action === "reject") {
    return [
      correction?.delta_path ? `Review ${correction.delta_path}` : `Review ${correction?.correction_path}`,
      "Regenerate or manually correct affected assets.",
      "Run jispec-cli verify --root . --policy .spec/policy.yaml",
    ].filter((entry): entry is string => typeof entry === "string");
  }

  if (action === "defer") {
    return [
      `Review ${REVIEW_OPEN_DECISIONS_PATH}`,
      "Run jispec-cli verify --root . --policy .spec/policy.yaml",
    ];
  }

  if (action === "waive") {
    return [
      `Review ${SPEC_DEBT_LEDGER_PATH}${specDebt ? `#${specDebt.id}` : ""}`,
      "Run jispec-cli verify --root . --policy .spec/policy.yaml",
    ];
  }

  return [
    `Review decision ${decision.decision_id} is adopted.`,
    "Run jispec-cli verify --root . --policy .spec/policy.yaml",
  ];
}

function isUnresolvedBlockingDecision(decision: GreenfieldReviewDecision): boolean {
  return decision.status === "proposed" && (decision.blocking || decision.conflicts.length > 0);
}

function statusForAction(action: GreenfieldReviewAction): GreenfieldReviewStatus {
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

function defaultReasonForAction(action: GreenfieldReviewAction): string {
  return action === "adopt" ? "Accepted during human review." : "";
}

function inferCorrectionChangeType(decision: GreenfieldReviewDecision): "modify" | "redesign" {
  return decision.decision_type === "domain_context" || decision.decision_type === "slice_plan"
    ? "redesign"
    : "modify";
}

function correctionHintForDecision(decision: GreenfieldReviewDecision): string {
  if (decision.decision_type === "domain_context") {
    return "Regenerate or correct the bounded context map and domain assets.";
  }
  if (decision.decision_type === "contract") {
    return "Regenerate or correct the contract draft and related open decisions.";
  }
  if (decision.decision_type === "behavior") {
    return "Regenerate or correct the behavior scenario and coverage map.";
  }
  if (decision.decision_type === "slice_plan") {
    return "Reorder or regenerate the initial slice queue and dependency plan.";
  }
  return "Create a correction delta and update affected assets before implementation handoff.";
}

function repaymentHintForDecision(decision: GreenfieldReviewDecision): string {
  return `Resolve review decision ${decision.decision_id} before release baseline or implementation handoff.`;
}

function inferContextId(decision: GreenfieldReviewDecision): string | undefined {
  const contextPath = decision.affected_assets.find((asset) => asset.startsWith("contexts/"));
  return contextPath?.split("/")[1];
}

function inferSliceId(decision: GreenfieldReviewDecision): string | undefined {
  for (const asset of decision.affected_assets) {
    const match = asset.match(/\/slices\/([^/]+)/);
    if (match?.[1]) {
      return match[1];
    }
  }
  return undefined;
}

function extractAffectedIds(decision: GreenfieldReviewDecision, pattern: RegExp): string[] {
  const ids = [
    decision.decision_id,
    decision.summary,
    ...decision.evidence_refs.map((ref) => ref.ref ?? ""),
  ].flatMap((value) => value.match(/[A-Z]+-[A-Z0-9-]+-\d+|CTR-[A-Z0-9-]+-\d+|SCN-[A-Z0-9-]+/g) ?? []);
  return unique(ids.filter((id) => pattern.test(id)));
}

function extractAffectedSliceIds(decision: GreenfieldReviewDecision): string[] {
  return unique(decision.affected_assets.flatMap((asset) => {
    const match = asset.match(/\/slices\/([^/]+)/);
    return match?.[1] ? [match[1]] : [];
  }));
}

function compareDecisions(left: GreenfieldReviewDecision, right: GreenfieldReviewDecision): number {
  return left.decision_id.localeCompare(right.decision_id);
}

function normalizeStatus(value: unknown): GreenfieldReviewStatus {
  return value === "adopted" || value === "rejected" || value === "deferred" || value === "waived"
    ? value
    : "proposed";
}

function normalizeConfidence(value: unknown): GreenfieldReviewConfidence {
  return value === "high" || value === "low" ? value : "medium";
}

function normalizeAction(value: unknown): GreenfieldReviewAction {
  return value === "reject" || value === "defer" || value === "waive" ? value : "adopt";
}

function normalizeCorrection(value: unknown): GreenfieldReviewCorrectionRef | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const correctionPath = stringValue(value.correction_path);
  const hint = stringValue(value.hint);
  if (!correctionPath || !hint) {
    return undefined;
  }
  return {
    correction_path: correctionPath,
    delta_path: stringValue(value.delta_path),
    delta_id: stringValue(value.delta_id),
    hint,
  };
}

function normalizeDeferRecord(value: unknown): GreenfieldReviewDeferRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const owner = stringValue(value.owner);
  const reason = stringValue(value.reason);
  const repaymentHint = stringValue(value.repayment_hint);
  const openDecisionPath = stringValue(value.open_decision_path);
  if (!owner || !reason || !repaymentHint || !openDecisionPath) {
    return undefined;
  }
  return {
    owner,
    reason,
    expires_at: stringValue(value.expires_at),
    repayment_hint: repaymentHint,
    open_decision_path: openDecisionPath,
  };
}

function normalizeWaiverRecord(value: unknown): GreenfieldReviewWaiverRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const owner = stringValue(value.owner);
  const reason = stringValue(value.reason);
  const debtId = stringValue(value.debt_id);
  const ledgerPath = stringValue(value.ledger_path);
  if (!owner || !reason || !debtId || !ledgerPath) {
    return undefined;
  }
  return {
    owner,
    reason,
    expires_at: stringValue(value.expires_at),
    debt_id: debtId,
    ledger_path: ledgerPath,
  };
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Review record is missing ${label}.`);
  }
  return value;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? unique(value.filter((entry): entry is string => typeof entry === "string"))
    : [];
}

function arrayRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inferActor(): string {
  return process.env.GIT_AUTHOR_NAME || process.env.USERNAME || process.env.USER || "human-reviewer";
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function relativePath(root: string, target: string): string {
  return path.relative(root, target).replace(/\\/g, "/");
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function dumpYaml(value: unknown): string {
  return yaml.dump(value, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
}
