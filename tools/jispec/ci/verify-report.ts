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
  const modes = {
    ...(result.metadata ?? {}),
    ...(latestDiscipline ? {
      agentDiscipline: {
        latestReportPath: latestDiscipline.path,
        completionStatus: latestDiscipline.report.completion.status,
        mode: latestDiscipline.report.mode,
      },
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
