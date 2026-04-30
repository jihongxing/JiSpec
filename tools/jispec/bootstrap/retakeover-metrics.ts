import fs from "node:fs";
import path from "node:path";

export type RetakeoverFixtureClass =
  | "high-noise-protocol-repo"
  | "multilingual-finance-service-repo"
  | "docs-api-schema-scattered-repo";

export type RetakeoverFeatureRecommendation = "accept_candidate" | "defer_as_spec_debt" | "unknown";

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

  for (const fixture of fixtures) {
    featureRecommendations[fixture.draftQuality.featureRecommendation] += 1;
    verdicts[fixture.verifyVerdict] = (verdicts[fixture.verifyVerdict] ?? 0) + 1;
  }

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
    "",
    "## Fixture Matrix",
    "",
    "| Fixture | Class | Verify | Feature | Deferred | Top Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
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
    topEvidence,
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |");
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
