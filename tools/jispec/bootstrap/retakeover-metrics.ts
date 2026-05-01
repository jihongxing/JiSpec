import fs from "node:fs";
import path from "node:path";

export type RetakeoverFixtureClass =
  | "high-noise-protocol-repo"
  | "multilingual-finance-service-repo"
  | "docs-api-schema-scattered-repo"
  | "synthetic-god-file-monolith"
  | "synthetic-contract-drift"
  | "synthetic-noise-heavy-hidden-signal"
  | "synthetic-thin-behavior-evidence";

export type RetakeoverFeatureRecommendation = "accept_candidate" | "defer_as_spec_debt" | "unknown";
export type RetakeoverFeatureOverclaimRisk = "low" | "medium" | "high";
export type RetakeoverVerifySafety = "non_blocking" | "blocking";
export type RetakeoverNextAction = "adoptable_initial_packet" | "owner_review_spec_debt" | "fix_blocking_verify";

export interface RetakeoverQualityScorecard {
  noiseSuppressionRate: number;
  topEvidenceSignalRate: number;
  adoptCorrectionLoad: number;
  featureOverclaimRisk: RetakeoverFeatureOverclaimRisk;
  verifySafety: RetakeoverVerifySafety;
  takeoverReadinessScore: number;
  riskNotes: string[];
  nextAction: RetakeoverNextAction;
}

export interface RetakeoverQualityScorecardInput {
  rankedEvidence?: {
    summary?: {
      candidateCount?: number;
      selectedCount?: number;
    };
    evidence?: Array<{
      path?: string;
      kind?: string;
      metadata?: Record<string, unknown>;
    }>;
    excludedSummary?: {
      totalExcludedFileCount?: number;
    };
  };
  discoverSummary?: Record<string, unknown>;
  featureContent?: string;
  featureRecommendation: RetakeoverFeatureRecommendation;
  acceptedArtifacts: string[];
  deferredArtifacts: string[];
  verifyOk: boolean;
}

export interface RetakeoverMetrics {
  version: 1;
  fixtureId: string;
  fixtureClass: RetakeoverFixtureClass;
  discoverSummary: Record<string, unknown>;
  topRankedEvidence: string[];
  draftQuality: {
    domainContextCount: number;
    aggregateRootCount: number;
    apiSurfaceCount: number;
    featureRecommendation: RetakeoverFeatureRecommendation;
  };
  adoptCorrection: {
    acceptedArtifacts: string[];
    deferredArtifacts: string[];
  };
  verifyVerdict: string;
  verifyOk: boolean;
  qualityScorecard: RetakeoverQualityScorecard;
}

export interface RetakeoverArtifactWriteResult {
  metricsPath: string;
  summaryPath: string;
}

export interface RetakeoverPoolMetrics {
  version: 1;
  fixtureCount: number;
  fixtureClasses: RetakeoverFixtureClass[];
  verify: {
    okCount: number;
    blockingCount: number;
    verdicts: Record<string, number>;
  };
  draftQuality: {
    totalDomainContextCount: number;
    totalAggregateRootCount: number;
    totalApiSurfaceCount: number;
    featureRecommendations: Record<RetakeoverFeatureRecommendation, number>;
  };
  adoptCorrection: {
    fixturesWithDeferredArtifacts: string[];
    deferredArtifactCount: number;
  };
  qualityScorecard: {
    averageTakeoverReadinessScore: number;
    lowestReadinessScore: number;
    fixturesNeedingOwnerReview: string[];
    fixturesWithBlockingVerify: string[];
    featureOverclaimRisk: Record<RetakeoverFeatureOverclaimRisk, number>;
  };
  fixtures: RetakeoverMetrics[];
}

export interface RetakeoverPoolArtifactWriteResult {
  metricsPath: string;
  summaryPath: string;
}

export const RETAKEOVER_METRICS_RELATIVE_PATH = ".spec/handoffs/retakeover-metrics.json";
export const RETAKEOVER_SUMMARY_RELATIVE_PATH = ".spec/handoffs/retakeover-summary.md";
export const RETAKEOVER_POOL_METRICS_RELATIVE_PATH = ".spec/handoffs/retakeover-pool-metrics.json";
export const RETAKEOVER_POOL_SUMMARY_RELATIVE_PATH = ".spec/handoffs/retakeover-pool-summary.md";

export function parseRetakeoverFeatureRecommendation(feature: string): RetakeoverFeatureRecommendation {
  if (feature.includes("# adoption_recommendation: accept_candidate")) {
    return "accept_candidate";
  }
  if (feature.includes("# adoption_recommendation: defer_as_spec_debt")) {
    return "defer_as_spec_debt";
  }
  return "unknown";
}

export function buildRetakeoverQualityScorecard(input: RetakeoverQualityScorecardInput): RetakeoverQualityScorecard {
  const rankedEvidence = input.rankedEvidence?.evidence ?? [];
  const topEvidence = rankedEvidence.slice(0, 10);
  const excludedCount = sanitizeCount(input.rankedEvidence?.excludedSummary?.totalExcludedFileCount);
  const candidateCount = Math.max(
    sanitizeCount(input.rankedEvidence?.summary?.candidateCount),
    sanitizeCount(input.rankedEvidence?.summary?.selectedCount),
    topEvidence.length,
  );
  const noiseSuppressionRate = excludedCount === 0
    ? 1
    : ratio(excludedCount, candidateCount + excludedCount);
  const strongTopEvidenceCount = topEvidence.filter(isStrongTakeoverSignal).length;
  const topEvidenceSignalRate = topEvidence.length > 0 ? ratio(strongTopEvidenceCount, topEvidence.length) : 0;
  const artifactDecisionCount = input.acceptedArtifacts.length + input.deferredArtifacts.length;
  const adoptCorrectionLoad = artifactDecisionCount > 0 ? ratio(input.deferredArtifacts.length, artifactDecisionCount) : 0;
  const featureOverclaimRisk = classifyFeatureOverclaimRisk(input);
  const verifySafety: RetakeoverVerifySafety = input.verifyOk ? "non_blocking" : "blocking";
  const takeoverReadinessScore = calculateTakeoverReadinessScore({
    noiseSuppressionRate,
    topEvidenceSignalRate,
    adoptCorrectionLoad,
    featureOverclaimRisk,
    verifySafety,
  });
  const riskNotes = buildRiskNotes({
    noiseSuppressionRate,
    topEvidenceSignalRate,
    adoptCorrectionLoad,
    featureOverclaimRisk,
    verifySafety,
  });
  const nextAction = selectNextAction({
    verifySafety,
    adoptCorrectionLoad,
    featureOverclaimRisk,
  });

  return {
    noiseSuppressionRate,
    topEvidenceSignalRate,
    adoptCorrectionLoad,
    featureOverclaimRisk,
    verifySafety,
    takeoverReadinessScore,
    riskNotes,
    nextAction,
  };
}

export function writeRetakeoverArtifacts(rootInput: string, metrics: RetakeoverMetrics): RetakeoverArtifactWriteResult {
  const root = path.resolve(rootInput);
  const metricsPath = path.join(root, RETAKEOVER_METRICS_RELATIVE_PATH);
  const summaryPath = path.join(root, RETAKEOVER_SUMMARY_RELATIVE_PATH);

  fs.mkdirSync(path.dirname(metricsPath), { recursive: true });
  fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2), "utf-8");
  fs.writeFileSync(summaryPath, renderRetakeoverSummaryMarkdown(metrics), "utf-8");

  return { metricsPath, summaryPath };
}

export function buildRetakeoverPoolMetrics(fixtures: RetakeoverMetrics[]): RetakeoverPoolMetrics {
  const featureRecommendations: Record<RetakeoverFeatureRecommendation, number> = {
    accept_candidate: 0,
    defer_as_spec_debt: 0,
    unknown: 0,
  };
  const verdicts: Record<string, number> = {};
  const featureOverclaimRisk: Record<RetakeoverFeatureOverclaimRisk, number> = {
    low: 0,
    medium: 0,
    high: 0,
  };

  for (const fixture of fixtures) {
    featureRecommendations[fixture.draftQuality.featureRecommendation] += 1;
    verdicts[fixture.verifyVerdict] = (verdicts[fixture.verifyVerdict] ?? 0) + 1;
    featureOverclaimRisk[fixture.qualityScorecard.featureOverclaimRisk] += 1;
  }
  const readinessScores = fixtures.map((fixture) => fixture.qualityScorecard.takeoverReadinessScore);

  return {
    version: 1,
    fixtureCount: fixtures.length,
    fixtureClasses: Array.from(new Set(fixtures.map((fixture) => fixture.fixtureClass))).sort(),
    verify: {
      okCount: fixtures.filter((fixture) => fixture.verifyOk).length,
      blockingCount: fixtures.filter((fixture) => !fixture.verifyOk).length,
      verdicts,
    },
    draftQuality: {
      totalDomainContextCount: fixtures.reduce((sum, fixture) => sum + fixture.draftQuality.domainContextCount, 0),
      totalAggregateRootCount: fixtures.reduce((sum, fixture) => sum + fixture.draftQuality.aggregateRootCount, 0),
      totalApiSurfaceCount: fixtures.reduce((sum, fixture) => sum + fixture.draftQuality.apiSurfaceCount, 0),
      featureRecommendations,
    },
    adoptCorrection: {
      fixturesWithDeferredArtifacts: fixtures
        .filter((fixture) => fixture.adoptCorrection.deferredArtifacts.length > 0)
        .map((fixture) => fixture.fixtureId),
      deferredArtifactCount: fixtures.reduce((sum, fixture) => sum + fixture.adoptCorrection.deferredArtifacts.length, 0),
    },
    qualityScorecard: {
      averageTakeoverReadinessScore: average(readinessScores),
      lowestReadinessScore: readinessScores.length > 0 ? Math.min(...readinessScores) : 0,
      fixturesNeedingOwnerReview: fixtures
        .filter((fixture) =>
          fixture.qualityScorecard.nextAction === "owner_review_spec_debt" ||
          fixture.qualityScorecard.featureOverclaimRisk !== "low" ||
          fixture.adoptCorrection.deferredArtifacts.length > 0,
        )
        .map((fixture) => fixture.fixtureId),
      fixturesWithBlockingVerify: fixtures
        .filter((fixture) => fixture.qualityScorecard.verifySafety === "blocking")
        .map((fixture) => fixture.fixtureId),
      featureOverclaimRisk,
    },
    fixtures,
  };
}

export function writeRetakeoverPoolArtifacts(
  rootInput: string,
  fixtures: RetakeoverMetrics[],
): RetakeoverPoolArtifactWriteResult {
  const root = path.resolve(rootInput);
  const poolMetrics = buildRetakeoverPoolMetrics(fixtures);
  const metricsPath = path.join(root, RETAKEOVER_POOL_METRICS_RELATIVE_PATH);
  const summaryPath = path.join(root, RETAKEOVER_POOL_SUMMARY_RELATIVE_PATH);

  fs.mkdirSync(path.dirname(metricsPath), { recursive: true });
  fs.writeFileSync(metricsPath, JSON.stringify(poolMetrics, null, 2), "utf-8");
  fs.writeFileSync(summaryPath, renderRetakeoverPoolSummaryMarkdown(poolMetrics), "utf-8");

  return { metricsPath, summaryPath };
}

export function renderRetakeoverSummaryMarkdown(metrics: RetakeoverMetrics): string {
  const lines = [
    "# JiSpec Retakeover Summary",
    "",
    `Fixture: \`${metrics.fixtureId}\``,
    `Fixture class: \`${metrics.fixtureClass}\``,
    `Verify verdict: \`${metrics.verifyVerdict}\``,
    `Merge status: ${metrics.verifyOk ? "Retakeover is non-blocking." : "Retakeover is blocked until verify issues are resolved."}`,
    "",
    "## Decision",
    "",
    `- ${renderRiskDecision(metrics)}`,
    `- Draft quality: ${renderDraftQuality(metrics)}.`,
    `- Adopt correction: ${renderAdoptCorrection(metrics)}.`,
    `- Next action: \`${metrics.qualityScorecard.nextAction}\`.`,
    "",
    "## Quality Scorecard",
    "",
    "| Signal | Value | Review Meaning |",
    "| --- | --- | --- |",
    ...renderFixtureScorecardRows(metrics),
    "",
    "### Risk Notes",
    "",
    ...renderRiskNoteBullets(metrics.qualityScorecard.riskNotes),
    "",
    "## Discover Ranking",
    "",
    `- Discover summary: ${renderDiscoverSummary(metrics.discoverSummary)}.`,
    ...renderTopRankedEvidence(metrics.topRankedEvidence),
    "",
    "## Review Questions",
    "",
    "- Does top ranked evidence come from product assets instead of noise?",
    "- Are domain, aggregate, API, and behavior drafts strong enough for human review?",
    "- Did adopt decisions clearly separate accepted contracts from deferred spec debt?",
    "- Is verify non-blocking after takeover?",
    "",
    "## Source Of Truth",
    "",
    `- Machine-readable metrics remain the source of truth: \`${RETAKEOVER_METRICS_RELATIVE_PATH}\`.`,
    "- This Markdown file is a human-readable companion summary, not a machine API.",
    "",
  ];

  return `${lines.join("\n")}\n`;
}

export function renderRetakeoverPoolSummaryMarkdown(pool: RetakeoverPoolMetrics): string {
  const lines = [
    "# JiSpec Retakeover Pool Summary",
    "",
    `Fixture count: ${pool.fixtureCount}`,
    `Fixture classes: ${pool.fixtureClasses.map((fixtureClass) => `\`${fixtureClass}\``).join(", ") || "none"}`,
    `Verify status: ${pool.verify.blockingCount === 0 ? "All fixtures are non-blocking." : `${pool.verify.blockingCount} fixture(s) are blocking.`}`,
    "",
    "## Decision",
    "",
    `- ${renderPoolDecision(pool)}`,
    `- Draft totals: ${pool.draftQuality.totalDomainContextCount} domain context(s), ${pool.draftQuality.totalAggregateRootCount} aggregate root(s), ${pool.draftQuality.totalApiSurfaceCount} API surface(s).`,
    `- Feature recommendations: ${renderFeatureRecommendationCounts(pool.draftQuality.featureRecommendations)}.`,
    `- Deferred artifacts: ${pool.adoptCorrection.deferredArtifactCount} across ${pool.adoptCorrection.fixturesWithDeferredArtifacts.length} fixture(s).`,
    `- Average takeover readiness score: ${pool.qualityScorecard.averageTakeoverReadinessScore}/100; lowest score: ${pool.qualityScorecard.lowestReadinessScore}/100.`,
    `- Feature overclaim risk: low=${pool.qualityScorecard.featureOverclaimRisk.low}, medium=${pool.qualityScorecard.featureOverclaimRisk.medium}, high=${pool.qualityScorecard.featureOverclaimRisk.high}.`,
    `- Owner-review fixtures: ${pool.qualityScorecard.fixturesNeedingOwnerReview.map((fixture) => `\`${fixture}\``).join(", ") || "none"}.`,
    "",
    "## Quality Scorecard",
    "",
    "| Fixture | Score | Verify Safety | Feature Risk | Deferred | Next Action | Risk Notes |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...pool.fixtures.map(renderPoolScorecardRow),
    "",
    "## Fixture Matrix",
    "",
    "| Fixture | Class | Verify | Feature | Deferred | Readiness | Risk | Top Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...pool.fixtures.map(renderPoolFixtureRow),
    "",
    "## Coverage Questions",
    "",
    "- Does the pool still cover high-noise, multilingual service, and scattered contract repository shapes?",
    "- Are all fixture takeovers non-blocking after adopt and verify?",
    "- Which fixtures need owner review because behavior evidence was deferred or weak?",
    "- Are top ranked evidence paths product assets instead of noise?",
    "",
    "## Source Of Truth",
    "",
    `- Machine-readable pool metrics remain the source of truth: \`${RETAKEOVER_POOL_METRICS_RELATIVE_PATH}\`.`,
    "- This Markdown file is a human-readable companion summary, not a machine API.",
    "",
  ];

  return `${lines.join("\n")}\n`;
}

function renderRiskDecision(metrics: RetakeoverMetrics): string {
  if (!metrics.verifyOk) {
    return "Retakeover needs follow-up because verify is blocking.";
  }
  if (metrics.adoptCorrection.deferredArtifacts.length > 0) {
    return "Retakeover can proceed with explicit spec debt follow-up.";
  }
  if (metrics.draftQuality.featureRecommendation === "defer_as_spec_debt") {
    return "Retakeover can proceed, but behavior evidence should stay owner-reviewed.";
  }
  return "Retakeover can proceed as an initial adopted contract packet.";
}

function renderPoolDecision(pool: RetakeoverPoolMetrics): string {
  if (pool.verify.blockingCount > 0) {
    return "Retakeover pool needs follow-up because at least one fixture is blocking.";
  }
  if (pool.adoptCorrection.deferredArtifactCount > 0 || pool.draftQuality.featureRecommendations.defer_as_spec_debt > 0) {
    return "Retakeover pool is non-blocking, with explicit owner-review or spec-debt follow-up for weaker behavior evidence.";
  }
  return "Retakeover pool is non-blocking and all fixture packets are adoptable as initial contracts.";
}

function renderFeatureRecommendationCounts(counts: Record<RetakeoverFeatureRecommendation, number>): string {
  return [
    `accept_candidate=${counts.accept_candidate}`,
    `defer_as_spec_debt=${counts.defer_as_spec_debt}`,
    `unknown=${counts.unknown}`,
  ].join(", ");
}

function renderPoolFixtureRow(fixture: RetakeoverMetrics): string {
  const deferred = fixture.adoptCorrection.deferredArtifacts.length > 0
    ? fixture.adoptCorrection.deferredArtifacts.join(", ")
    : "none";
  const topEvidence = fixture.topRankedEvidence.slice(0, 3).map(escapeTableCell).join("<br>");
  return [
    `\`${fixture.fixtureId}\``,
    `\`${fixture.fixtureClass}\``,
    `\`${fixture.verifyVerdict}\`${fixture.verifyOk ? "" : " blocking"}`,
    `\`${fixture.draftQuality.featureRecommendation}\``,
    escapeTableCell(deferred),
    `${fixture.qualityScorecard.takeoverReadinessScore}/100`,
    `\`${fixture.qualityScorecard.featureOverclaimRisk}\``,
    topEvidence,
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |");
}

function renderFixtureScorecardRows(metrics: RetakeoverMetrics): string[] {
  const scorecard = metrics.qualityScorecard;
  return [
    renderScorecardRow("Takeover readiness", `${scorecard.takeoverReadinessScore}/100`, "Conservative aggregate score for trend review, not a standalone gate."),
    renderScorecardRow("Verify safety", `\`${scorecard.verifySafety}\``, scorecard.verifySafety === "non_blocking" ? "Adopted and deferred output does not block verify." : "Verify is blocking and must be fixed before merge."),
    renderScorecardRow("Top evidence signal", formatPercent(scorecard.topEvidenceSignalRate), "Share of top ranked evidence carrying strong boundary or contract signal."),
    renderScorecardRow("Noise suppression", formatPercent(scorecard.noiseSuppressionRate), "How much noisy inventory pressure was excluded or absent from this fixture."),
    renderScorecardRow("Adopt correction load", formatPercent(scorecard.adoptCorrectionLoad), "Share of adopted decision surface deferred as spec debt."),
    renderScorecardRow("Feature overclaim risk", `\`${scorecard.featureOverclaimRisk}\``, "Risk that weak behavior evidence was treated as contract-ready."),
    renderScorecardRow("Next action", `\`${scorecard.nextAction}\``, renderNextActionMeaning(scorecard.nextAction)),
  ];
}

function renderScorecardRow(signal: string, value: string, meaning: string): string {
  return [
    escapeTableCell(signal),
    value,
    escapeTableCell(meaning),
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |");
}

function renderPoolScorecardRow(fixture: RetakeoverMetrics): string {
  const deferred = fixture.adoptCorrection.deferredArtifacts.length > 0
    ? fixture.adoptCorrection.deferredArtifacts.join(", ")
    : "none";
  return [
    `\`${fixture.fixtureId}\``,
    `${fixture.qualityScorecard.takeoverReadinessScore}/100`,
    `\`${fixture.qualityScorecard.verifySafety}\``,
    `\`${fixture.qualityScorecard.featureOverclaimRisk}\``,
    escapeTableCell(deferred),
    `\`${fixture.qualityScorecard.nextAction}\``,
    escapeTableCell(fixture.qualityScorecard.riskNotes.join("; ")),
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |");
}

function renderNextActionMeaning(nextAction: RetakeoverNextAction): string {
  if (nextAction === "fix_blocking_verify") {
    return "Resolve deterministic verify issues before treating this takeover as mergeable.";
  }
  if (nextAction === "owner_review_spec_debt") {
    return "Proceed with explicit owner review or spec debt follow-up.";
  }
  return "Review packet is suitable as an initial adopted contract packet.";
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function renderDraftQuality(metrics: RetakeoverMetrics): string {
  const quality = metrics.draftQuality;
  return [
    `${quality.domainContextCount} domain context(s)`,
    `${quality.aggregateRootCount} aggregate root(s)`,
    `${quality.apiSurfaceCount} API surface(s)`,
    `feature recommendation \`${quality.featureRecommendation}\``,
  ].join(", ");
}

function renderAdoptCorrection(metrics: RetakeoverMetrics): string {
  const accepted = metrics.adoptCorrection.acceptedArtifacts.length > 0
    ? metrics.adoptCorrection.acceptedArtifacts.map((artifact) => `\`${artifact}\``).join(", ")
    : "none";
  const deferred = metrics.adoptCorrection.deferredArtifacts.length > 0
    ? metrics.adoptCorrection.deferredArtifacts.map((artifact) => `\`${artifact}\``).join(", ")
    : "none";

  return `accepted ${accepted}; deferred ${deferred}`;
}

function renderDiscoverSummary(summary: Record<string, unknown>): string {
  const preferredKeys = [
    "selectedCount",
    "documentCount",
    "schemaCount",
    "routeCount",
    "sourceFileCount",
    "excludedFileCount",
    "totalExcludedFileCount",
  ];
  const fragments = preferredKeys
    .filter((key) => typeof summary[key] === "number")
    .map((key) => `${key}=${summary[key]}`);

  return fragments.length > 0 ? fragments.join(", ") : "no numeric discover counters available";
}

function renderTopRankedEvidence(topRankedEvidence: string[]): string[] {
  if (topRankedEvidence.length === 0) {
    return ["- Top ranked evidence: none."];
  }

  return [
    "- Top ranked evidence:",
    ...topRankedEvidence.slice(0, 10).map((evidence, index) => `  ${index + 1}. \`${evidence}\``),
  ];
}

function sanitizeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Number(Math.max(0, Math.min(1, numerator / denominator)).toFixed(4));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function isStrongTakeoverSignal(entry: { kind?: string; path?: string; metadata?: Record<string, unknown> }): boolean {
  const boundarySignal = typeof entry.metadata?.boundarySignal === "string" ? entry.metadata.boundarySignal : "";
  return [
    "governance_document",
    "protocol_document",
    "schema_truth_source",
    "explicit_endpoint",
    "service_entrypoint",
  ].includes(boundarySignal) || ["schema", "route"].includes(entry.kind ?? "");
}

function classifyFeatureOverclaimRisk(input: RetakeoverQualityScorecardInput): RetakeoverFeatureOverclaimRisk {
  const feature = input.featureContent ?? "";
  if (input.featureRecommendation === "defer_as_spec_debt") {
    return input.acceptedArtifacts.includes("feature") ? "high" : "low";
  }
  if (input.featureRecommendation === "unknown") {
    return "medium";
  }
  if (feature.includes("@behavior_needs_human_review")) {
    return "high";
  }
  if ((feature.match(/^  Scenario:/gm) ?? []).length === 0) {
    return "medium";
  }
  return "low";
}

function calculateTakeoverReadinessScore(input: {
  noiseSuppressionRate: number;
  topEvidenceSignalRate: number;
  adoptCorrectionLoad: number;
  featureOverclaimRisk: RetakeoverFeatureOverclaimRisk;
  verifySafety: RetakeoverVerifySafety;
}): number {
  const featureRiskScore: Record<RetakeoverFeatureOverclaimRisk, number> = {
    low: 15,
    medium: 8,
    high: 0,
  };
  const verifyScore = input.verifySafety === "non_blocking" ? 15 : 0;
  const score =
    input.noiseSuppressionRate * 20 +
    input.topEvidenceSignalRate * 35 +
    (1 - input.adoptCorrectionLoad) * 15 +
    featureRiskScore[input.featureOverclaimRisk] +
    verifyScore;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildRiskNotes(input: {
  noiseSuppressionRate: number;
  topEvidenceSignalRate: number;
  adoptCorrectionLoad: number;
  featureOverclaimRisk: RetakeoverFeatureOverclaimRisk;
  verifySafety: RetakeoverVerifySafety;
}): string[] {
  const notes: string[] = [];
  if (input.verifySafety === "blocking") {
    notes.push("verify is blocking after takeover");
  }
  if (input.topEvidenceSignalRate < 0.6) {
    notes.push("top ranked evidence has limited strong boundary signal");
  }
  if (input.noiseSuppressionRate < 0.35) {
    notes.push("little or no noisy inventory was suppressed; confirm the fixture is not hiding dependency/build gravity");
  }
  if (input.adoptCorrectionLoad > 0) {
    notes.push("adopt deferred at least one artifact as spec debt");
  }
  if (input.featureOverclaimRisk !== "low") {
    notes.push(`feature overclaim risk is ${input.featureOverclaimRisk}`);
  }
  if (notes.length === 0) {
    notes.push("no immediate scorecard risk");
  }
  return notes;
}

function selectNextAction(input: {
  verifySafety: RetakeoverVerifySafety;
  adoptCorrectionLoad: number;
  featureOverclaimRisk: RetakeoverFeatureOverclaimRisk;
}): RetakeoverNextAction {
  if (input.verifySafety === "blocking") {
    return "fix_blocking_verify";
  }
  if (input.adoptCorrectionLoad > 0 || input.featureOverclaimRisk !== "low") {
    return "owner_review_spec_debt";
  }
  return "adoptable_initial_packet";
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function renderRiskNoteBullets(notes: string[]): string[] {
  if (notes.length === 0) {
    return ["- none"];
  }
  return notes.map((note) => `- ${note}`);
}
