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

export const RETAKEOVER_METRICS_RELATIVE_PATH = ".spec/handoffs/retakeover-metrics.json";
export const RETAKEOVER_SUMMARY_RELATIVE_PATH = ".spec/handoffs/retakeover-summary.md";

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
