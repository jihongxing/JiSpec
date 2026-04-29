import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import type { DraftArtifact, DraftArtifactKind } from "./draft";
import { normalizeEvidencePath, type EvidenceExclusionSummary } from "./evidence-graph";
import type { AdoptionRankedEvidence, AdoptionRankedEvidenceEntry } from "./evidence-ranking";
import {
  parseFeatureConfidenceFromGherkin,
  type FeatureRecommendation,
  type ParsedFeatureConfidenceSummary,
} from "./feature-confidence";
import {
  getBootstrapTakeoverBriefRelativePath,
  type BootstrapTakeoverDecisionRecord,
  type BootstrapTakeoverReport,
} from "./takeover";

const ADOPTION_RANKED_EVIDENCE_PATH = ".spec/facts/bootstrap/adoption-ranked-evidence.json";

export interface BootstrapTakeoverBriefSummary {
  boundaryCandidates: string[];
  adoptedContracts: string[];
  deferredSpecDebt: string[];
  strongestEvidence: string[];
  excludedFileCount: number;
  featureRecommendation?: FeatureRecommendation;
  featureConfidenceReason?: string;
  nextActions: string[];
}

export interface BootstrapTakeoverBrief {
  relativePath: string;
  content: string;
  summary: BootstrapTakeoverBriefSummary;
}

export interface BootstrapTakeoverBriefInput {
  root: string;
  report: BootstrapTakeoverReport;
  artifacts: DraftArtifact[];
  decisions: Array<{
    artifactKind: DraftArtifactKind;
    kind: "accept" | "reject" | "skip_as_spec_debt" | "edit";
    note?: string;
    editedContent?: string;
  }>;
}

interface BoundaryCandidate {
  name: string;
  confidenceScore: number;
  sourceFiles: string[];
  provenanceNote?: string;
}

interface DomainDraft {
  domain?: {
    primary_contexts?: unknown;
    areas?: unknown;
  };
}

export function buildBootstrapTakeoverBrief(input: BootstrapTakeoverBriefInput): BootstrapTakeoverBrief {
  const rankedEvidence = loadAdoptionRankedEvidence(input.root);
  const boundaries = extractBoundaryCandidates(input.artifacts, input.decisions, input.report);
  const strongestEvidence = (rankedEvidence?.evidence ?? []).slice(0, 5);
  const excludedSummary = rankedEvidence?.excludedSummary ?? emptyExclusionSummary();
  const featureConfidence = extractFeatureConfidence(input.artifacts, input.decisions);
  const nextActions = buildNextActions(input.report);
  const summary: BootstrapTakeoverBriefSummary = {
    boundaryCandidates: boundaries.map((boundary) => boundary.name),
    adoptedContracts: [...input.report.adoptedArtifactPaths],
    deferredSpecDebt: [...input.report.specDebtPaths],
    strongestEvidence: strongestEvidence.map((entry) => entry.path),
    excludedFileCount: excludedSummary.totalExcludedFileCount,
    featureRecommendation: featureConfidence.recommendation,
    featureConfidenceReason: featureConfidence.confidenceReasons[0],
    nextActions,
  };

  return {
    relativePath: getBootstrapTakeoverBriefRelativePath(),
    summary,
    content: renderTakeoverBriefMarkdown({
      report: input.report,
      boundaries,
      strongestEvidence,
      excludedSummary,
      featureConfidence,
      nextActions,
    }),
  };
}

export function renderTakeoverBriefSummary(summary: BootstrapTakeoverBriefSummary): string[] {
  const lines: string[] = [];
  lines.push(
    `Boundaries: ${summary.boundaryCandidates.length > 0 ? summary.boundaryCandidates.slice(0, 5).join(", ") : "none identified"}`,
  );
  lines.push(
    `Adopted: ${summary.adoptedContracts.length}; Spec debt: ${summary.deferredSpecDebt.length}; Excluded noise: ${summary.excludedFileCount}`,
  );
  if (summary.strongestEvidence.length > 0) {
    lines.push(`Top evidence: ${summary.strongestEvidence.slice(0, 3).join(", ")}`);
  }
  if (summary.featureRecommendation) {
    const reason = summary.featureConfidenceReason ? ` - ${summary.featureConfidenceReason}` : "";
    lines.push(`Feature gate: ${summary.featureRecommendation}${reason}`);
  }
  if (summary.nextActions.length > 0) {
    lines.push(`Next: ${summary.nextActions[0]}`);
  }
  return lines;
}

function renderTakeoverBriefMarkdown(input: {
  report: BootstrapTakeoverReport;
  boundaries: BoundaryCandidate[];
  strongestEvidence: AdoptionRankedEvidenceEntry[];
  excludedSummary: NonNullable<EvidenceExclusionSummary>;
  featureConfidence: ParsedFeatureConfidenceSummary;
  nextActions: string[];
}): string {
  const lines: string[] = [
    "# Bootstrap Takeover Brief",
    "",
    "## Decision Summary",
    "",
    `- Session: ${inlineCode(input.report.sessionId)}`,
    `- Status: ${inlineCode(input.report.status)}`,
    `- Evidence strength: ${inlineCode(input.report.qualitySummary?.evidenceStrength ?? "unknown")}`,
    `- Adopted contracts: ${input.report.adoptedArtifactPaths.length}`,
    `- Deferred spec debt: ${input.report.specDebtPaths.length}`,
    `- Rejected artifacts: ${input.report.rejectedArtifactKinds.length > 0 ? input.report.rejectedArtifactKinds.map(inlineCode).join(", ") : "none"}`,
    `- Machine report: ${markdownLink("bootstrap-takeover.json", ".spec/handoffs/bootstrap-takeover.json")}`,
    "",
    "## Boundary / Aggregate Candidates",
    "",
    ...renderBoundaryCandidates(input.boundaries),
    "",
    "## Adopted Contracts",
    "",
    ...renderAdoptedContracts(input.report),
    "",
    "## Deferred Spec Debt",
    "",
    ...renderSpecDebt(input.report),
    "",
    "## Strongest Evidence",
    "",
    ...renderStrongestEvidence(input.strongestEvidence),
    "",
    "## Excluded Noise Summary",
    "",
    ...renderExcludedSummary(input.excludedSummary),
    "",
    "## Feature Confidence Gate",
    "",
    ...renderFeatureConfidenceGate(input.featureConfidence),
    "",
    "## Next Recommended Actions",
    "",
    ...input.nextActions.map((action) => `- ${action}`),
    "",
  ];

  return `${lines.join("\n").trimEnd()}\n`;
}

function renderBoundaryCandidates(boundaries: BoundaryCandidate[]): string[] {
  if (boundaries.length === 0) {
    return ["- No strong boundary candidates were identified; review the source evidence before widening adoption."];
  }

  return boundaries.slice(0, 5).map((boundary) => {
    const confidence = `${Math.round(boundary.confidenceScore * 100)}%`;
    const sources = boundary.sourceFiles.slice(0, 3).map(renderSourceReference).join(", ");
    const provenance = boundary.provenanceNote ? ` - ${boundary.provenanceNote}` : "";
    return `- ${inlineCode(boundary.name)} (${confidence}) from ${sources || "draft evidence"}${provenance}`;
  });
}

function renderAdoptedContracts(report: BootstrapTakeoverReport): string[] {
  if (report.adoptedArtifactPaths.length === 0) {
    return ["- No contracts were adopted in this takeover commit."];
  }

  return report.adoptedArtifactPaths.map((artifactPath) => {
    const decision = findDecisionForTarget(report.decisions, artifactPath);
    const edited = decision?.edited ? " edited before adoption" : "";
    return `- ${markdownLink(artifactPath, artifactPath)}${edited}`;
  });
}

function renderSpecDebt(report: BootstrapTakeoverReport): string[] {
  if (report.specDebtPaths.length === 0) {
    return ["- No draft artifacts were deferred as spec debt."];
  }

  return report.specDebtPaths.map((artifactPath) => {
    const decision = findDecisionForTarget(report.decisions, artifactPath);
    const note = decision?.note ? ` - ${decision.note}` : "";
    return `- ${markdownLink(artifactPath, artifactPath)}${note}`;
  });
}

function renderStrongestEvidence(evidence: AdoptionRankedEvidenceEntry[]): string[] {
  if (evidence.length === 0) {
    return ["- No adoption-ranked evidence packet was found; inspect the evidence graph manually."];
  }

  return evidence.map((entry) => {
    const sources = entry.sourceFiles.length > 0 ? ` from ${entry.sourceFiles.slice(0, 2).map(renderSourceReference).join(", ")}` : "";
    return `- #${entry.rank} ${inlineCode(entry.kind)} ${renderEvidenceReference(entry)} (score ${Math.round(entry.score)}): ${entry.reason}${sources}`;
  });
}

function renderExcludedSummary(summary: NonNullable<EvidenceExclusionSummary>): string[] {
  if (summary.totalExcludedFileCount === 0 || summary.rules.length === 0) {
    return ["- No excluded noise was recorded by bootstrap discover."];
  }

  const lines = [`- Total excluded files: ${summary.totalExcludedFileCount}`];
  for (const rule of summary.rules.slice(0, 6)) {
    const examples =
      rule.examplePaths.length > 0
        ? `; examples: ${rule.examplePaths.slice(0, 3).map((examplePath) => inlineCode(examplePath)).join(", ")}`
        : "";
    lines.push(`- ${inlineCode(rule.ruleId)}: ${rule.fileCount} file(s) excluded (${rule.reason})${examples}`);
  }
  return lines;
}

function renderFeatureConfidenceGate(summary: ParsedFeatureConfidenceSummary): string[] {
  const recommendation =
    summary.recommendation === "accept_candidate"
      ? "accept_candidate"
      : "defer_as_spec_debt";
  const decisionGuidance =
    summary.recommendation === "accept_candidate"
      ? summary.humanReviewScenarioCount > 0 || summary.deferredScenarioCount > 0
        ? "Feature draft can be adopted for its strong scenarios, but tagged behavior scenarios remain review warnings and must not become blocking gates until confirmed."
        : "Feature draft can be adopted as an initial behavior contract because the scenarios passed the confidence gate."
      : "Defer the feature draft as spec debt until an owner confirms the tagged behavior scenarios; do not use it as a blocking gate yet.";
  const lines = [
    `- Recommendation: ${inlineCode(recommendation)}`,
    `- Scenario mix: ${summary.acceptCandidateCount} accept candidate(s), ${summary.deferredScenarioCount} deferred, ${summary.humanReviewScenarioCount} human-review.`,
    `- Decision guidance: ${decisionGuidance}`,
  ];

  if (summary.averageConfidenceScore !== undefined) {
    lines.push(`- Average scenario confidence: ${Math.round(summary.averageConfidenceScore * 100)}%`);
  }

  if (summary.confidenceReasons.length > 0) {
    lines.push(`- Why: ${summary.confidenceReasons.slice(0, 4).join("; ")}.`);
  }

  if (summary.scenarios.length > 0) {
    lines.push("- Scenario recommendations:");
    for (const scenario of summary.scenarios.slice(0, 5)) {
      const review = scenario.humanReviewRequired ? " human review required" : " no human-review tag";
      const confidence =
        typeof scenario.confidenceScore === "number" ? `, ${Math.round(scenario.confidenceScore * 100)}%` : "";
      const reason = scenario.confidenceReasons[0] ? ` - ${scenario.confidenceReasons[0]}` : "";
      lines.push(`- ${inlineCode(scenario.scenarioName)}: ${inlineCode(scenario.recommendation)}${confidence},${review}${reason}`);
    }
  }

  return lines;
}

function buildNextActions(report: BootstrapTakeoverReport): string[] {
  const actions: string[] = [];

  if (report.specDebtPaths.length > 0) {
    actions.push(`Resolve deferred spec debt before enforcing the full contract set: ${report.specDebtPaths.map(inlineCode).join(", ")}.`);
  }

  if (!report.adoptedArtifactPaths.includes(".spec/contracts/api_spec.json")) {
    actions.push("Review API surface classification and promote the API contract when endpoints, proto services, or OpenAPI surfaces are confirmed.");
  }

  if (!report.adoptedArtifactPaths.includes(".spec/contracts/behaviors.feature")) {
    actions.push("Confirm or rewrite behavior scenarios before using them as blocking delivery gates.");
  }

  if (report.adoptedArtifactPaths.length > 0) {
    actions.push("Run `jispec-cli verify --root .` and treat missing adopted contracts as blocking.");
  }

  actions.push(`Attach this brief and ${markdownLink("bootstrap-takeover.json", ".spec/handoffs/bootstrap-takeover.json")} to the takeover review.`);

  return [...new Set(actions)];
}

function extractFeatureConfidence(
  artifacts: DraftArtifact[],
  decisions: BootstrapTakeoverBriefInput["decisions"],
): ParsedFeatureConfidenceSummary {
  const featureArtifact = artifacts.find((artifact) => artifact.kind === "feature");
  const featureDecision = decisions.find((decision) => decision.artifactKind === "feature");
  const finalContent = getFinalArtifactContent(featureArtifact, featureDecision);
  return parseFeatureConfidenceFromGherkin(finalContent);
}

function extractBoundaryCandidates(
  artifacts: DraftArtifact[],
  decisions: BootstrapTakeoverBriefInput["decisions"],
  report: BootstrapTakeoverReport,
): BoundaryCandidate[] {
  const domainArtifact = artifacts.find((artifact) => artifact.kind === "domain");
  const finalDomainContent = getFinalArtifactContent(domainArtifact, decisions.find((decision) => decision.artifactKind === "domain"));
  const parsed = parseDomainDraft(finalDomainContent);
  const candidates: BoundaryCandidate[] = [];
  const seen = new Set<string>();

  const areas = Array.isArray(parsed?.domain?.areas) ? parsed.domain.areas : [];
  for (const area of areas) {
    if (!area || typeof area !== "object") {
      continue;
    }
    const record = area as Record<string, unknown>;
    const name = getString(record.name);
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    candidates.push({
      name,
      confidenceScore: getNumber(record.confidence_score) ?? 0.5,
      sourceFiles: normalizeSourceFiles(getStringArray(record.source_files)),
      provenanceNote: getString(record.provenance_note),
    });
  }

  const primaryContexts = getStringArray(parsed?.domain?.primary_contexts);
  for (const name of primaryContexts) {
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    candidates.push({
      name,
      confidenceScore: report.qualitySummary?.evidenceStrength === "strong" ? 0.82 : 0.62,
      sourceFiles: [],
      provenanceNote: "Promoted from the draft primary context list.",
    });
  }

  if (candidates.length === 0) {
    for (const name of report.qualitySummary?.primaryContextNames ?? []) {
      candidates.push({
        name,
        confidenceScore: report.qualitySummary?.evidenceStrength === "strong" ? 0.82 : 0.58,
        sourceFiles: [],
        provenanceNote: "Recovered from takeover quality summary.",
      });
    }
  }

  return candidates
    .sort((left, right) => {
      const confidenceDelta = right.confidenceScore - left.confidenceScore;
      if (confidenceDelta !== 0) {
        return confidenceDelta;
      }
      return left.name.localeCompare(right.name);
    })
    .slice(0, 5);
}

function parseDomainDraft(content: string | undefined): DomainDraft | undefined {
  if (!content) {
    return undefined;
  }

  try {
    const parsed = yaml.load(content);
    return parsed && typeof parsed === "object" ? (parsed as DomainDraft) : undefined;
  } catch {
    return undefined;
  }
}

function getFinalArtifactContent(
  artifact: DraftArtifact | undefined,
  decision: BootstrapTakeoverBriefInput["decisions"][number] | undefined,
): string | undefined {
  if (!artifact) {
    return undefined;
  }

  if (decision?.kind === "edit" && typeof decision.editedContent === "string") {
    return decision.editedContent;
  }

  return artifact.content;
}

function findDecisionForTarget(
  decisions: BootstrapTakeoverDecisionRecord[],
  targetPath: string,
): BootstrapTakeoverDecisionRecord | undefined {
  return decisions.find((decision) => decision.targetPath === targetPath);
}

function loadAdoptionRankedEvidence(rootInput: string): AdoptionRankedEvidence | undefined {
  const root = path.resolve(rootInput);
  const rankedPath = path.join(root, ADOPTION_RANKED_EVIDENCE_PATH);
  if (!fs.existsSync(rankedPath)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(rankedPath, "utf-8")) as AdoptionRankedEvidence;
    return {
      ...parsed,
      evidence: Array.isArray(parsed.evidence)
        ? [...parsed.evidence].sort((left, right) => left.rank - right.rank)
        : [],
      excludedSummary: parsed.excludedSummary ?? emptyExclusionSummary(),
    };
  } catch {
    return undefined;
  }
}

function emptyExclusionSummary(): NonNullable<EvidenceExclusionSummary> {
  return {
    totalExcludedFileCount: 0,
    rules: [],
  };
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function normalizeSourceFiles(sourceFiles: string[]): string[] {
  return [...new Set(sourceFiles.map((sourceFile) => normalizeEvidencePath(sourceFile)))]
    .filter((sourceFile) => sourceFile.length > 0)
    .sort((left, right) => left.localeCompare(right));
}

function renderEvidenceReference(entry: AdoptionRankedEvidenceEntry): string {
  if (entry.kind === "route" || isRouteReference(entry.path) || !isRepoFileReference(entry.path)) {
    return inlineCode(entry.path);
  }

  return markdownLink(entry.path, entry.path);
}

function renderSourceReference(reference: string): string {
  return isRepoFileReference(reference) ? markdownLink(reference, reference) : inlineCode(reference);
}

function markdownLink(label: string, repoPath: string): string {
  if (!isRepoFileReference(repoPath)) {
    return inlineCode(label);
  }

  return `[${escapeMarkdownLabel(label)}](${toBriefRelativeHref(repoPath)})`;
}

function toBriefRelativeHref(repoPath: string): string {
  const normalized = normalizeEvidencePath(repoPath).replace(/^\/+/, "");
  if (normalized === ".spec/handoffs/bootstrap-takeover.json") {
    return "bootstrap-takeover.json";
  }
  if (normalized.startsWith(".spec/")) {
    return `../${encodeHref(normalized.slice(".spec/".length))}`;
  }
  return `../../${encodeHref(normalized)}`;
}

function isRepoFileReference(reference: string): boolean {
  const normalized = normalizeEvidencePath(reference).trim();
  if (!normalized || isRouteReference(normalized)) {
    return false;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
    return false;
  }
  if (/^[A-Z]:\//i.test(normalized)) {
    return false;
  }
  if (normalized.includes(" ") || normalized.includes("\n")) {
    return false;
  }
  if (normalized.startsWith("#")) {
    return false;
  }
  if (normalized.startsWith(".spec/")) {
    return true;
  }

  const fileName = path.posix.basename(normalized);
  if (!fileName.includes(".")) {
    return false;
  }

  return !normalized.startsWith("../") && !normalized.startsWith("./../");
}

function isRouteReference(reference: string): boolean {
  const normalized = normalizeEvidencePath(reference).trim();
  return (
    normalized.startsWith("/") ||
    /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+\//i.test(normalized)
  );
}

function encodeHref(href: string): string {
  return href.split("/").filter((segment) => segment.length > 0).map((segment) => encodeURIComponent(segment)).join("/");
}

function escapeMarkdownLabel(label: string): string {
  return label.replace(/([\\\[\]])/g, "\\$1");
}

function inlineCode(input: string): string {
  return `\`${input.replace(/`/g, "'")}\``;
}
