import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { normalizeEvidencePath } from "../bootstrap/evidence-graph";

export interface ValueReportOptions {
  root: string;
  outPath?: string;
  windowDays?: number;
  generatedAt?: string;
}

export interface ValueReportWriteResult {
  report: ValueReport;
  reportPath: string;
  markdownPath: string;
}

export interface ValueMetricSource {
  path: string;
  kind: "json" | "yaml" | "jsonl";
}

export interface ValueReport {
  version: 1;
  reportKind: "repo-local-value-report";
  root: string;
  generatedAt: string;
  window: {
    days: number;
    from: string;
    to: string;
  };
  boundary: {
    localOnly: true;
    sourceUploadRequired: false;
    defaultNetworkAccess: false;
    blockingGate: false;
    collectsPersonalSensitiveInfo: false;
    actorNamesRedacted: true;
  };
  headline: {
    estimatedManualSortingMinutesSaved: number;
    blockingIssuesCaught: number;
    advisoryRisksSurfaced: number;
    openGovernanceDebt: number;
    executeStopsNeedingReview: number;
    weeklyAnswer: string;
    riskAnswer: string;
  };
  metrics: {
    manualSortingReduction: ManualSortingReductionMetric;
    firstTakeover: FirstTakeoverMetric;
    adoptCorrectionLoad: AdoptCorrectionLoadMetric;
    riskSurfacing: RiskSurfacingMetric;
    waiverDebtAging: WaiverDebtAgingMetric;
    executeMediationStopPoints: ExecuteMediationStopPointMetric;
  };
  sourceArtifacts: ValueMetricSource[];
  console: {
    displayedInGovernanceObject: "takeover_quality_trend";
    replacesVerifyOrCiGate: false;
  };
}

export interface ManualSortingReductionMetric {
  estimatedMinutesSaved: number;
  sourceFilesInventoried: number;
  evidenceCandidatesRanked: number;
  excludedNoiseFiles: number;
  adoptedContractArtifacts: number;
  formula: string;
  sourceArtifacts: string[];
}

export interface FirstTakeoverMetric {
  status: "available" | "not_available_yet";
  startedAt?: string;
  completedAt?: string;
  durationMinutes?: number;
  adoptedArtifactCount: number;
  specDebtArtifactCount: number;
  sourceArtifacts: string[];
}

export interface AdoptCorrectionLoadMetric {
  decisionCount: number;
  acceptedCount: number;
  editedCount: number;
  deferredSpecDebtCount: number;
  rejectedCount: number;
  correctionLoad: number;
  ownerReviewArtifactCount: number;
  sourceArtifacts: string[];
}

export interface RiskSurfacingMetric {
  blockingIssuesCaught: number;
  advisoryRisksSurfaced: number;
  riskCodes: string[];
  topRisks: Array<{
    code: string;
    severity: string;
    source: string;
  }>;
  sourceArtifacts: string[];
}

export interface WaiverDebtAgingMetric {
  activeWaivers: number;
  expiredWaivers: number;
  expiringSoonWaivers: number;
  maxWaiverAgeDays: number;
  openSpecDebt: number;
  expiredSpecDebt: number;
  maxSpecDebtAgeDays: number;
  bootstrapDebtRecords: number;
  sourceArtifacts: string[];
}

export interface ExecuteMediationStopPointMetric {
  handoffCount: number;
  patchMediationCount: number;
  stopPoints: Record<string, number>;
  outcomes: Record<string, number>;
  rejectedPatchCount: number;
  verifyBlockedCount: number;
  sourceArtifacts: string[];
}

const DEFAULT_VALUE_REPORT_PATH = ".spec/metrics/value-report.json";

export function buildValueReport(options: ValueReportOptions): ValueReportWriteResult {
  const root = path.resolve(options.root);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const windowDays = Math.max(1, Math.trunc(options.windowDays ?? 7));
  const generatedDate = parseDate(generatedAt) ?? new Date();
  const windowFrom = new Date(generatedDate.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const window = {
    days: windowDays,
    from: windowFrom,
    to: generatedDate.toISOString(),
  };
  const context = readValueReportContext(root);
  const manualSortingReduction = buildManualSortingMetric(context);
  const firstTakeover = buildFirstTakeoverMetric(context);
  const adoptCorrectionLoad = buildAdoptCorrectionMetric(context);
  const riskSurfacing = buildRiskSurfacingMetric(context, window);
  const waiverDebtAging = buildWaiverDebtAgingMetric(context, generatedDate);
  const executeMediationStopPoints = buildExecuteMediationMetric(context, window);
  const headline = {
    estimatedManualSortingMinutesSaved: manualSortingReduction.estimatedMinutesSaved,
    blockingIssuesCaught: riskSurfacing.blockingIssuesCaught,
    advisoryRisksSurfaced: riskSurfacing.advisoryRisksSurfaced,
    openGovernanceDebt: waiverDebtAging.openSpecDebt + waiverDebtAging.bootstrapDebtRecords + waiverDebtAging.activeWaivers,
    executeStopsNeedingReview: executeMediationStopPoints.rejectedPatchCount + executeMediationStopPoints.verifyBlockedCount,
    weeklyAnswer: `JiSpec avoided an estimated ${manualSortingReduction.estimatedMinutesSaved} minutes of manual artifact sorting in the last ${windowDays} day(s).`,
    riskAnswer: `JiSpec surfaced ${riskSurfacing.blockingIssuesCaught} blocking issue(s), ${riskSurfacing.advisoryRisksSurfaced} advisory risk(s), and ${executeMediationStopPoints.verifyBlockedCount} verify-blocked execute stop point(s).`,
  };
  const report: ValueReport = {
    version: 1,
    reportKind: "repo-local-value-report",
    root: normalizeEvidencePath(root),
    generatedAt: generatedDate.toISOString(),
    window,
    boundary: {
      localOnly: true,
      sourceUploadRequired: false,
      defaultNetworkAccess: false,
      blockingGate: false,
      collectsPersonalSensitiveInfo: false,
      actorNamesRedacted: true,
    },
    headline,
    metrics: {
      manualSortingReduction,
      firstTakeover,
      adoptCorrectionLoad,
      riskSurfacing,
      waiverDebtAging,
      executeMediationStopPoints,
    },
    sourceArtifacts: context.sources,
    console: {
      displayedInGovernanceObject: "takeover_quality_trend",
      replacesVerifyOrCiGate: false,
    },
  };

  const reportPath = resolveOutputPath(root, options.outPath ?? DEFAULT_VALUE_REPORT_PATH);
  const markdownPath = reportPath.replace(/\.json$/i, ".md");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  fs.writeFileSync(markdownPath, renderValueReportMarkdown(report), "utf-8");

  return {
    report,
    reportPath: normalizeEvidencePath(reportPath),
    markdownPath: normalizeEvidencePath(markdownPath),
  };
}

export function renderValueReportJSON(result: ValueReportWriteResult): string {
  return JSON.stringify(result, null, 2);
}

export function renderValueReportText(report: ValueReport): string {
  return [
    "=== JiSpec Value Report ===",
    `Window: ${report.window.from} -> ${report.window.to}`,
    `Estimated manual sorting saved: ${report.headline.estimatedManualSortingMinutesSaved} minute(s)`,
    `Risks surfaced: ${report.headline.blockingIssuesCaught} blocking, ${report.headline.advisoryRisksSurfaced} advisory`,
    `Open governance debt: ${report.headline.openGovernanceDebt}`,
    `Execute stops needing review: ${report.headline.executeStopsNeedingReview}`,
    "",
    report.headline.weeklyAnswer,
    report.headline.riskAnswer,
    "",
    "Boundary: local-only, no source upload, not a blocking gate.",
  ].join("\n");
}

export function renderValueReportMarkdown(report: ValueReport): string {
  return [
    "# JiSpec Value Report",
    "",
    `Window: \`${report.window.from}\` to \`${report.window.to}\``,
    "",
    "## Executive Answer",
    "",
    `- ${report.headline.weeklyAnswer}`,
    `- ${report.headline.riskAnswer}`,
    `- Open governance debt visible locally: ${report.headline.openGovernanceDebt}.`,
    "",
    "## Metrics",
    "",
    `- Manual sorting reduction: ${report.metrics.manualSortingReduction.estimatedMinutesSaved} estimated minute(s) saved.`,
    `- First takeover: ${report.metrics.firstTakeover.status}${report.metrics.firstTakeover.durationMinutes !== undefined ? `, ${report.metrics.firstTakeover.durationMinutes} minute(s)` : ""}.`,
    `- Adopt correction load: ${formatPercent(report.metrics.adoptCorrectionLoad.correctionLoad)} across ${report.metrics.adoptCorrectionLoad.decisionCount} decision(s).`,
    `- Waiver/debt aging: ${report.metrics.waiverDebtAging.expiredWaivers} expired waiver(s), ${report.metrics.waiverDebtAging.expiredSpecDebt} expired spec debt record(s).`,
    `- Execute mediation: ${report.metrics.executeMediationStopPoints.handoffCount} handoff(s), ${report.metrics.executeMediationStopPoints.patchMediationCount} patch mediation record(s).`,
    "",
    "## Source Artifacts",
    "",
    ...report.sourceArtifacts.map((source) => `- \`${source.path}\` (${source.kind})`),
    "",
    "## Boundary",
    "",
    "- Local-only report over JiSpec artifacts.",
    "- Does not upload source and does not collect personal sensitive information.",
    "- Does not replace `verify`, `ci:verify`, policy evaluation, or release gates.",
    "",
  ].join("\n");
}

interface ValueReportContext {
  evidenceGraph?: Record<string, unknown>;
  rankedEvidence?: Record<string, unknown>;
  takeover?: Record<string, unknown>;
  verifyReport?: Record<string, unknown>;
  retakeoverMetrics?: Record<string, unknown>;
  waivers: Record<string, unknown>[];
  greenfieldSpecDebt: Record<string, unknown>[];
  bootstrapSpecDebt: Record<string, unknown>[];
  handoffs: Record<string, unknown>[];
  patchMediations: Record<string, unknown>[];
  sources: ValueMetricSource[];
}

function readValueReportContext(root: string): ValueReportContext {
  const context: ValueReportContext = {
    waivers: [],
    greenfieldSpecDebt: [],
    bootstrapSpecDebt: [],
    handoffs: [],
    patchMediations: [],
    sources: [],
  };

  context.evidenceGraph = readJsonSource(root, ".spec/facts/bootstrap/evidence-graph.json", context.sources);
  context.rankedEvidence = readJsonSource(root, ".spec/facts/bootstrap/adoption-ranked-evidence.json", context.sources);
  context.takeover = readJsonSource(root, ".spec/handoffs/bootstrap-takeover.json", context.sources);
  context.verifyReport = readJsonSource(root, ".jispec-ci/verify-report.json", context.sources);
  context.retakeoverMetrics = readJsonSource(root, ".spec/handoffs/retakeover-metrics.json", context.sources);

  for (const relativePath of listDirectFiles(root, ".spec/waivers", ".json")) {
    const waiver = readJsonSource(root, relativePath, context.sources);
    if (waiver) {
      context.waivers.push(waiver);
    }
  }

  const ledger = readYamlSource(root, ".spec/spec-debt/ledger.yaml", context.sources);
  const debts = isRecord(ledger) && Array.isArray(ledger.debts) ? ledger.debts.filter(isRecord) : [];
  context.greenfieldSpecDebt.push(...debts);

  for (const relativePath of listNestedFiles(root, ".spec/spec-debt", ".json", 2)) {
    const record = readJsonSource(root, relativePath, context.sources);
    if (record) {
      context.bootstrapSpecDebt.push(record);
    }
  }

  for (const relativePath of listDirectFiles(root, ".jispec/handoff", ".json")) {
    const handoff = readJsonSource(root, relativePath, context.sources);
    if (handoff) {
      context.handoffs.push(handoff);
    }
  }

  for (const relativePath of listNestedFiles(root, ".jispec/implement", ".json", 2).filter((entry) => entry.endsWith("/patch-mediation.json"))) {
    const mediation = readJsonSource(root, relativePath, context.sources);
    if (mediation) {
      context.patchMediations.push(mediation);
    }
  }

  context.sources = dedupeSources(context.sources);
  return context;
}

function buildManualSortingMetric(context: ValueReportContext): ManualSortingReductionMetric {
  const evidenceSummary = isRecord(context.evidenceGraph) ? context.evidenceGraph : {};
  const sourceFiles = Array.isArray(evidenceSummary.sourceFiles) ? evidenceSummary.sourceFiles.length : 0;
  const rankedSummary = isRecord(context.rankedEvidence?.summary) ? context.rankedEvidence.summary : {};
  const excludedSummary = isRecord(context.rankedEvidence?.excludedSummary) ? context.rankedEvidence.excludedSummary : {};
  const candidates = numberValue(rankedSummary.candidateCount) ?? numberValue(rankedSummary.selectedCount) ?? 0;
  const excluded = numberValue(excludedSummary.totalExcludedFileCount) ?? 0;
  const adopted = Array.isArray(context.takeover?.adoptedArtifactPaths) ? context.takeover.adoptedArtifactPaths.length : 0;
  const estimatedMinutesSaved = Math.round(sourceFiles * 0.5 + candidates * 2 + excluded * 0.25 + adopted * 10);

  return {
    estimatedMinutesSaved,
    sourceFilesInventoried: sourceFiles,
    evidenceCandidatesRanked: candidates,
    excludedNoiseFiles: excluded,
    adoptedContractArtifacts: adopted,
    formula: "sourceFiles*0.5 + evidenceCandidates*2 + excludedNoiseFiles*0.25 + adoptedContracts*10",
    sourceArtifacts: sourcePaths(context, [
      ".spec/facts/bootstrap/evidence-graph.json",
      ".spec/facts/bootstrap/adoption-ranked-evidence.json",
      ".spec/handoffs/bootstrap-takeover.json",
    ]),
  };
}

function buildFirstTakeoverMetric(context: ValueReportContext): FirstTakeoverMetric {
  if (!context.takeover) {
    return {
      status: "not_available_yet",
      adoptedArtifactCount: 0,
      specDebtArtifactCount: 0,
      sourceArtifacts: [],
    };
  }

  const startedAt = stringValue(context.takeover.sourceEvidenceGeneratedAt) ?? stringValue(context.takeover.createdAt);
  const completedAt = stringValue(context.takeover.createdAt) ?? stringValue(context.takeover.updatedAt);
  const durationMinutes = startedAt && completedAt ? diffMinutes(startedAt, completedAt) : undefined;
  return {
    status: "available",
    startedAt,
    completedAt,
    durationMinutes,
    adoptedArtifactCount: Array.isArray(context.takeover.adoptedArtifactPaths) ? context.takeover.adoptedArtifactPaths.length : 0,
    specDebtArtifactCount: Array.isArray(context.takeover.specDebtPaths) ? context.takeover.specDebtPaths.length : 0,
    sourceArtifacts: sourcePaths(context, [".spec/handoffs/bootstrap-takeover.json"]),
  };
}

function buildAdoptCorrectionMetric(context: ValueReportContext): AdoptCorrectionLoadMetric {
  const decisions = Array.isArray(context.takeover?.decisions) ? context.takeover.decisions.filter(isRecord) : [];
  const accepted = decisions.filter((entry) => stringValue(entry.finalState) === "adopted" && entry.edited !== true).length;
  const edited = decisions.filter((entry) => entry.edited === true).length;
  const deferred = decisions.filter((entry) => stringValue(entry.finalState) === "spec_debt").length;
  const rejected = decisions.filter((entry) => stringValue(entry.finalState) === "rejected").length;
  const correctionPoints = edited + deferred * 0.75 + rejected * 0.5;
  const correctionLoad = decisions.length > 0 ? round(correctionPoints / decisions.length) : 0;

  return {
    decisionCount: decisions.length,
    acceptedCount: accepted,
    editedCount: edited,
    deferredSpecDebtCount: deferred,
    rejectedCount: rejected,
    correctionLoad,
    ownerReviewArtifactCount: edited + deferred + rejected,
    sourceArtifacts: sourcePaths(context, [".spec/handoffs/bootstrap-takeover.json", ".spec/handoffs/retakeover-metrics.json"]),
  };
}

function buildRiskSurfacingMetric(context: ValueReportContext, window: { from: string; to: string }): RiskSurfacingMetric {
  const reportInWindow = context.verifyReport && timestampInWindow(stringValue(context.verifyReport.generatedAt), window);
  const issues = reportInWindow && Array.isArray(context.verifyReport?.issues) ? context.verifyReport.issues.filter(isRecord) : [];
  const blocking = issues.filter((issue) => stringValue(issue.severity) === "blocking");
  const advisory = issues.filter((issue) => stringValue(issue.severity) === "advisory");
  const topRisks = [...blocking, ...advisory].slice(0, 8).map((issue) => ({
    code: stringValue(issue.code) ?? "UNKNOWN",
    severity: stringValue(issue.severity) ?? "unknown",
    source: ".jispec-ci/verify-report.json",
  }));

  return {
    blockingIssuesCaught: blocking.length,
    advisoryRisksSurfaced: advisory.length,
    riskCodes: stableUnique(topRisks.map((risk) => risk.code)),
    topRisks,
    sourceArtifacts: sourcePaths(context, [".jispec-ci/verify-report.json"]),
  };
}

function buildWaiverDebtAgingMetric(context: ValueReportContext, now: Date): WaiverDebtAgingMetric {
  const activeWaivers = context.waivers.filter((waiver) => stringValue(waiver.status) !== "revoked");
  const expiredWaivers = activeWaivers.filter((waiver) => isPastDate(stringValue(waiver.expiresAt), now));
  const expiringSoonWaivers = activeWaivers.filter((waiver) => expiresWithinDays(stringValue(waiver.expiresAt), 14, now));
  const openDebt = context.greenfieldSpecDebt.filter((debt) => stringValue(debt.status) === "open");
  const expiredDebt = openDebt.filter((debt) => isPastDate(stringValue(debt.expires_at), now));

  return {
    activeWaivers: activeWaivers.length,
    expiredWaivers: expiredWaivers.length,
    expiringSoonWaivers: expiringSoonWaivers.length,
    maxWaiverAgeDays: maxAgeDays(activeWaivers.map((waiver) => stringValue(waiver.createdAt)), now),
    openSpecDebt: openDebt.length,
    expiredSpecDebt: expiredDebt.length,
    maxSpecDebtAgeDays: maxAgeDays(openDebt.map((debt) => stringValue(debt.created_at)), now),
    bootstrapDebtRecords: context.bootstrapSpecDebt.length,
    sourceArtifacts: sourcePathsByPrefix(context, [".spec/waivers/", ".spec/spec-debt/"]),
  };
}

function buildExecuteMediationMetric(context: ValueReportContext, window: { from: string; to: string }): ExecuteMediationStopPointMetric {
  const handoffs = context.handoffs.filter((handoff) => timestampInWindow(stringValue(handoff.createdAt) ?? stringValue(handoff.generatedAt), window));
  const patchMediations = context.patchMediations.filter((mediation) => timestampInWindow(stringValue(mediation.createdAt), window));
  const stopPoints: Record<string, number> = {};
  const outcomes: Record<string, number> = {};

  for (const handoff of handoffs) {
    const decisionPacket = isRecord(handoff.decisionPacket) ? handoff.decisionPacket : {};
    increment(stopPoints, stringValue(decisionPacket.stopPoint) ?? "unknown");
    increment(outcomes, stringValue(handoff.outcome) ?? "unknown");
  }
  for (const mediation of patchMediations) {
    increment(outcomes, `patch_${stringValue(mediation.status) ?? "unknown"}`);
  }

  return {
    handoffCount: handoffs.length,
    patchMediationCount: patchMediations.length,
    stopPoints,
    outcomes,
    rejectedPatchCount: patchMediations.filter((entry) => stringValue(entry.status) === "rejected_out_of_scope" || stringValue(entry.status) === "apply_failed").length,
    verifyBlockedCount: handoffs.filter((entry) => stringValue(entry.outcome) === "verify_blocked").length,
    sourceArtifacts: sourcePathsByPrefix(context, [".jispec/handoff/", ".jispec/implement/"]),
  };
}

function readJsonSource(root: string, relativePath: string, sources: ValueMetricSource[]): Record<string, unknown> | undefined {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return undefined;
  }
  try {
    sources.push({ path: normalizeEvidencePath(relativePath), kind: "json" });
    const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf-8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readYamlSource(root: string, relativePath: string, sources: ValueMetricSource[]): Record<string, unknown> | undefined {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return undefined;
  }
  try {
    sources.push({ path: normalizeEvidencePath(relativePath), kind: "yaml" });
    const parsed = yaml.load(fs.readFileSync(absolutePath, "utf-8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function listDirectFiles(root: string, relativeDir: string, extension: string): string[] {
  const dir = path.join(root, relativeDir);
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => normalizeEvidencePath(path.join(relativeDir, entry.name)))
    .sort((left, right) => left.localeCompare(right));
}

function listNestedFiles(root: string, relativeDir: string, extension: string, maxDepth: number): string[] {
  const base = path.join(root, relativeDir);
  const files: string[] = [];
  visitNested(base, base, files, extension, maxDepth);
  return files.map((entry) => normalizeEvidencePath(path.join(relativeDir, path.relative(base, entry)))).sort((left, right) => left.localeCompare(right));
}

function visitNested(base: string, current: string, files: string[], extension: string, maxDepth: number): void {
  if (!fs.existsSync(current)) {
    return;
  }
  const depth = normalizeEvidencePath(path.relative(base, current)).split("/").filter(Boolean).length;
  if (depth > maxDepth) {
    return;
  }
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      visitNested(base, fullPath, files, extension, maxDepth);
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(fullPath);
    }
  }
}

function sourcePaths(context: ValueReportContext, paths: string[]): string[] {
  const sourceSet = new Set(context.sources.map((source) => source.path));
  return paths.filter((entry) => sourceSet.has(entry));
}

function sourcePathsByPrefix(context: ValueReportContext, prefixes: string[]): string[] {
  return context.sources
    .map((source) => source.path)
    .filter((sourcePath) => prefixes.some((prefix) => sourcePath.startsWith(prefix)))
    .sort((left, right) => left.localeCompare(right));
}

function dedupeSources(sources: ValueMetricSource[]): ValueMetricSource[] {
  const byPath = new Map<string, ValueMetricSource>();
  for (const source of sources) {
    byPath.set(source.path, source);
  }
  return Array.from(byPath.values()).sort((left, right) => left.path.localeCompare(right.path));
}

function timestampInWindow(value: string | undefined, window: { from: string; to: string }): boolean {
  if (!value) {
    return true;
  }
  const date = parseDate(value);
  const from = parseDate(window.from);
  const to = parseDate(window.to);
  if (!date || !from || !to) {
    return true;
  }
  return date.getTime() >= from.getTime() && date.getTime() <= to.getTime();
}

function diffMinutes(startedAt: string, completedAt: string): number | undefined {
  const start = parseDate(startedAt);
  const end = parseDate(completedAt);
  if (!start || !end) {
    return undefined;
  }
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function maxAgeDays(values: Array<string | undefined>, now: Date): number {
  const ages = values
    .map((value) => value ? parseDate(value) : undefined)
    .filter((value): value is Date => Boolean(value))
    .map((value) => Math.max(0, Math.floor((now.getTime() - value.getTime()) / (24 * 60 * 60 * 1000))));
  return ages.length > 0 ? Math.max(...ages) : 0;
}

function isPastDate(value: string | undefined, now: Date): boolean {
  const date = value ? parseDate(value) : undefined;
  return Boolean(date && date.getTime() < now.getTime());
}

function expiresWithinDays(value: string | undefined, days: number, now: Date): boolean {
  const date = value ? parseDate(value) : undefined;
  if (!date) {
    return false;
  }
  const delta = date.getTime() - now.getTime();
  return delta >= 0 && delta <= days * 24 * 60 * 60 * 1000;
}

function parseDate(value: string): Date | undefined {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function resolveOutputPath(root: string, outputPath: string): string {
  return path.isAbsolute(outputPath) ? outputPath : path.join(root, outputPath);
}
