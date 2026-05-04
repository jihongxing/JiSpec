import fs from "node:fs";
import path from "node:path";
import { findLatestDisciplineReport } from "../discipline/artifacts";
import { computeIssueFingerprint } from "../verify/issue-fingerprint";
import type { VerifyRunResult } from "../verify/verdict";

export interface VerifyReportCounts {
  total: number;
  blocking: number;
  advisory: number;
  nonblockingError: number;
}

export interface VerifyReportIssue {
  code: string;
  severity: "blocking" | "advisory" | "nonblocking_error";
  path?: string;
  message: string;
  ruleId?: string;
  fingerprint?: string;
}

export interface VerifyReportLinks {
  consoleUrl?: string;
  waiverUrl?: string;
}

export interface VerifyReportContext {
  repoRoot: string;
  repoSlug?: string;
  provider: "local" | "github" | "gitlab" | "jenkins";
  pullRequestNumber?: string;
  mergeRequestIid?: string;
  branch?: string;
  commitSha?: string;
}

export interface VerifyReport {
  version: 1;
  generatedAt: string;
  verdict: string;
  ok: boolean;
  counts: VerifyReportCounts;
  issues: VerifyReportIssue[];
  factsContractVersion?: string;
  matchedPolicyRules?: string[];
  modes?: Record<string, unknown>;
  context: VerifyReportContext;
  links?: VerifyReportLinks;
}

export interface VerifyArtifactPaths {
  outputDir: string;
  reportPath: string;
  summaryPath: string;
  verifySummaryPath: string;
}

interface ReleaseCompareSnapshot {
  reportPath: string;
  reportMarkdownPath?: string;
  overallStatus?: string;
  globalContextStatus?: string;
  aggregatePath?: string;
  aggregateGeneratedAt?: string;
  ownerReviewRecommendationCount: number;
  relevantContractDriftHintCount: number;
  relevantOwnerActionCount: number;
  representativeArtifacts: string[];
  representativeArtifact?: string;
  sourceEvolutionChangeId?: string;
  summary?: string;
  replayCommand?: string;
}

/**
 * Build a verify report from a verify run result.
 */
export function buildVerifyReport(
  result: VerifyRunResult,
  context: VerifyReportContext,
): VerifyReport {
  const counts: VerifyReportCounts = {
    total: result.issueCount,
    blocking: result.blockingIssueCount,
    advisory: result.advisoryIssueCount,
    nonblockingError: result.nonBlockingErrorCount,
  };

  const issues: VerifyReportIssue[] = result.issues.map((issue) => ({
    code: issue.code,
    severity: issue.severity,
    path: issue.path,
    message: issue.message,
    ruleId: issue.details && typeof issue.details === "object" && "ruleId" in issue.details
      ? String(issue.details.ruleId)
      : undefined,
    fingerprint: computeIssueFingerprint(issue),
  }));
  const latestDiscipline = findLatestDisciplineReport(context.repoRoot);
  const latestReleaseCompare = readLatestReleaseCompareSnapshot(context.repoRoot);
  const modes = {
    ...(result.metadata ?? {}),
    ...(latestDiscipline ? {
      agentDiscipline: {
        latestReportPath: latestDiscipline.path,
        completionStatus: latestDiscipline.report.completion.status,
        mode: latestDiscipline.report.mode,
      },
    } : {}),
    ...(latestReleaseCompare ? {
      releaseCompareReportPath: latestReleaseCompare.reportPath,
      ...(latestReleaseCompare.reportMarkdownPath ? { releaseCompareReportMarkdownPath: latestReleaseCompare.reportMarkdownPath } : {}),
      ...(latestReleaseCompare.overallStatus ? { releaseCompareOverallStatus: latestReleaseCompare.overallStatus } : {}),
      ...(latestReleaseCompare.globalContextStatus ? { releaseCompareGlobalContextStatus: latestReleaseCompare.globalContextStatus } : {}),
      ...(latestReleaseCompare.aggregatePath ? { releaseCompareAggregatePath: latestReleaseCompare.aggregatePath } : {}),
      ...(latestReleaseCompare.aggregateGeneratedAt ? { releaseCompareAggregateGeneratedAt: latestReleaseCompare.aggregateGeneratedAt } : {}),
      releaseCompareOwnerReviewRecommendationCount: latestReleaseCompare.ownerReviewRecommendationCount,
      releaseCompareRelevantContractDriftHintCount: latestReleaseCompare.relevantContractDriftHintCount,
      releaseCompareRelevantOwnerActionCount: latestReleaseCompare.relevantOwnerActionCount,
      ...(latestReleaseCompare.representativeArtifacts.length > 0
        ? { releaseCompareRepresentativeArtifacts: latestReleaseCompare.representativeArtifacts }
        : {}),
      ...(latestReleaseCompare.representativeArtifact
        ? { releaseCompareRepresentativeArtifact: latestReleaseCompare.representativeArtifact }
        : {}),
      ...(latestReleaseCompare.sourceEvolutionChangeId
        ? { releaseCompareSourceEvolutionChangeId: latestReleaseCompare.sourceEvolutionChangeId }
        : {}),
      ...(latestReleaseCompare.summary ? { releaseCompareSummary: latestReleaseCompare.summary } : {}),
      ...(latestReleaseCompare.replayCommand ? { releaseCompareReplayCommand: latestReleaseCompare.replayCommand } : {}),
    } : {}),
  };

  return {
    version: 1,
    generatedAt: result.generatedAt,
    verdict: result.verdict,
    ok: result.ok,
    counts,
    issues,
    factsContractVersion: result.metadata?.factsContractVersion as string | undefined,
    matchedPolicyRules: result.metadata?.matchedPolicyRules as string[] | undefined,
    modes,
    context,
    links: buildVerifyReportLinks(context, counts),
  };
}

/**
 * Render verify report as JSON.
 */
export function renderVerifyReportJSON(report: VerifyReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Select highlighted issues for display (top N most important).
 */
export function selectHighlightedIssues(
  report: VerifyReport,
  limit: number = 5,
): VerifyReportIssue[] {
  // Prioritize blocking issues first, then advisory, then errors
  const blocking = report.issues.filter((i) => i.severity === "blocking");
  const advisory = report.issues.filter((i) => i.severity === "advisory");
  const errors = report.issues.filter((i) => i.severity === "nonblocking_error");

  const highlighted: VerifyReportIssue[] = [];

  // Add blocking issues first
  for (const issue of blocking) {
    if (highlighted.length >= limit) break;
    highlighted.push(issue);
  }

  // Then advisory
  for (const issue of advisory) {
    if (highlighted.length >= limit) break;
    highlighted.push(issue);
  }

  // Then errors
  for (const issue of errors) {
    if (highlighted.length >= limit) break;
    highlighted.push(issue);
  }

  return highlighted;
}

/**
 * Infer the next action based on the report.
 */
export function inferNextAction(report: VerifyReport): string {
  if (report.ok) {
    return "All checks passed. Ready to merge.";
  }

  if (report.counts.blocking > 0) {
    return `Fix ${report.counts.blocking} blocking issue(s) before merging.`;
  }

  if (report.counts.advisory > 0) {
    return `Review ${report.counts.advisory} advisory issue(s). Consider creating waivers if needed.`;
  }

  if (report.counts.nonblockingError > 0) {
    return `Review ${report.counts.nonblockingError} non-blocking error(s).`;
  }

  return "Review the issues and take appropriate action.";
}

export function detectCiProvider(env: NodeJS.ProcessEnv = process.env): VerifyReportContext["provider"] {
  if (env.GITHUB_ACTIONS) {
    return "github";
  }
  if (env.GITLAB_CI) {
    return "gitlab";
  }
  if (env.JENKINS_HOME || env.BUILD_ID || env.JOB_NAME) {
    return "jenkins";
  }
  return "local";
}

export function buildCiOutputDir(root: string): string {
  return path.join(root, ".jispec-ci");
}

export function resolveVerifyArtifactPaths(root: string): VerifyArtifactPaths {
  const outputDir = buildCiOutputDir(root);
  return {
    outputDir,
    reportPath: path.join(outputDir, "verify-report.json"),
    summaryPath: path.join(outputDir, "ci-summary.md"),
    verifySummaryPath: path.join(outputDir, "verify-summary.md"),
  };
}

export function writeVerifyArtifacts(
  root: string,
  report: VerifyReport,
  summaryMarkdown: string,
  verifySummaryMarkdown?: string,
): VerifyArtifactPaths {
  const artifactPaths = resolveVerifyArtifactPaths(root);
  fs.mkdirSync(artifactPaths.outputDir, { recursive: true });
  fs.writeFileSync(artifactPaths.reportPath, `${renderVerifyReportJSON(report)}\n`, "utf-8");
  fs.writeFileSync(artifactPaths.summaryPath, `${summaryMarkdown.endsWith("\n") ? summaryMarkdown : `${summaryMarkdown}\n`}`, "utf-8");
  if (verifySummaryMarkdown !== undefined) {
    fs.writeFileSync(
      artifactPaths.verifySummaryPath,
      `${verifySummaryMarkdown.endsWith("\n") ? verifySummaryMarkdown : `${verifySummaryMarkdown}\n`}`,
      "utf-8",
    );
  }
  return artifactPaths;
}

function buildVerifyReportLinks(
  context: VerifyReportContext,
  counts: VerifyReportCounts,
): VerifyReportLinks | undefined {
  if (!context.repoSlug) {
    return undefined;
  }

  const baseUrl = (process.env.JISPEC_CONSOLE_BASE_URL || "https://console.jispec.dev").replace(/\/+$/g, "");
  const repoSegment = encodeURIComponent(context.repoSlug);
  const consoleUrl = `${baseUrl}/repos/${repoSegment}/verify`;

  const links: VerifyReportLinks = {
    consoleUrl,
  };

  if (counts.blocking > 0) {
    const params = new URLSearchParams();
    if (context.pullRequestNumber) {
      params.set("pr", context.pullRequestNumber);
    }
    if (context.mergeRequestIid) {
      params.set("mr", context.mergeRequestIid);
    }
    links.waiverUrl = `${baseUrl}/repos/${repoSegment}/waivers/new${params.size > 0 ? `?${params.toString()}` : ""}`;
  }

  return links;
}

function readLatestReleaseCompareSnapshot(rootInput: string): ReleaseCompareSnapshot | undefined {
  const root = path.resolve(rootInput);
  const latestFromTrend = readLatestReleaseComparePathFromTrend(root);
  const reportPath = latestFromTrend?.reportPath ?? findLatestReleaseCompareReportPath(root);
  if (!reportPath) {
    return undefined;
  }

  const report = readJsonObject(reportPath);
  if (!report) {
    return undefined;
  }

  const driftSummary = recordValue(report.driftSummary);
  const globalContext = recordValue(report.globalContext);
  const globalContextDetails = recordValue(globalContext?.details);
  const repoPosture = recordValue(globalContextDetails?.repoPosture);
  const replay = recordValue(report.replay);
  const replayCommands = recordValue(replay?.commands);
  const representativeArtifacts = stringArray(globalContextDetails?.representativeArtifacts);
  const reportMarkdownPath = latestFromTrend?.reportMarkdownPath
    ?? relativeArtifactPath(root, stringValue(report.compareReportMarkdownPath));

  return {
    reportPath: relativeArtifactPath(root, reportPath) ?? normalizePath(reportPath),
    ...(reportMarkdownPath ? { reportMarkdownPath } : {}),
    overallStatus: stringValue(driftSummary?.overallStatus) ?? stringValue(driftSummary?.overall_status),
    globalContextStatus: stringValue(globalContext?.status),
    aggregatePath: stringValue(globalContextDetails?.aggregatePath),
    aggregateGeneratedAt: stringValue(globalContextDetails?.aggregateGeneratedAt),
    ownerReviewRecommendationCount: arrayLength(globalContextDetails?.ownerReviewRecommendations),
    relevantContractDriftHintCount: arrayLength(globalContextDetails?.relevantContractDriftHints),
    relevantOwnerActionCount: arrayLength(globalContextDetails?.relevantOwnerActions),
    representativeArtifacts,
    representativeArtifact: representativeArtifacts[0],
    sourceEvolutionChangeId: stringValue(repoPosture?.sourceEvolutionChangeId),
    summary: stringValue(globalContext?.summary),
    replayCommand: stringValue(replayCommands?.rerun),
  };
}

function readLatestReleaseComparePathFromTrend(root: string): {
  reportPath?: string;
  reportMarkdownPath?: string;
} | undefined {
  const trendPath = path.join(root, ".spec", "releases", "drift-trend.json");
  const trend = readJsonObject(trendPath);
  const latest = recordValue(trend?.latest);
  if (!latest) {
    return undefined;
  }

  const reportPath = absoluteArtifactPath(root, stringValue(latest.reportPath));
  const reportMarkdownPath = relativeArtifactPath(root, stringValue(latest.markdownPath));
  return {
    ...(reportPath ? { reportPath } : {}),
    ...(reportMarkdownPath ? { reportMarkdownPath } : {}),
  };
}

function findLatestReleaseCompareReportPath(root: string): string | undefined {
  const compareRoot = path.join(root, ".spec", "releases", "compare");
  if (!fs.existsSync(compareRoot)) {
    return undefined;
  }

  return fs.readdirSync(compareRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(compareRoot, entry.name, "compare-report.json"))
    .filter((candidate) => fs.existsSync(candidate))
    .sort((left, right) => {
      const delta = fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs;
      return delta !== 0 ? delta : right.localeCompare(left);
    })[0];
}

function readJsonObject(filePath: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return recordValue(parsed);
  } catch {
    return undefined;
  }
}

function absoluteArtifactPath(root: string, filePath: string | undefined): string | undefined {
  if (!filePath) {
    return undefined;
  }
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  return fs.existsSync(resolved) ? resolved : undefined;
}

function relativeArtifactPath(root: string, filePath: string | undefined): string | undefined {
  const resolved = absoluteArtifactPath(root, filePath);
  return resolved ? normalizePath(path.relative(root, resolved)) : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
