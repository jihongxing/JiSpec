import fs from "node:fs";
import path from "node:path";
import { renderCiSummaryMarkdown } from "./ci-summary";
import { renderPrCommentMarkdown } from "./pr-comment";
import { selectHighlightedIssues, type VerifyReport, type VerifyReportContext } from "./verify-report";

/**
 * Check if running in GitHub Actions environment.
 */
export function isGitHubActionsEnv(env?: NodeJS.ProcessEnv): boolean {
  const e = env ?? process.env;
  return e.GITHUB_ACTIONS === "true";
}

/**
 * Build GitHub context from environment variables.
 */
export function buildGitHubContext(env?: NodeJS.ProcessEnv): VerifyReportContext {
  const e = env ?? process.env;

  const repoSlug = e.GITHUB_REPOSITORY; // e.g., "owner/repo"
  const branch = e.GITHUB_REF_NAME;
  const commitSha = e.GITHUB_SHA;
  const pullRequestNumber = resolveGitHubPullRequestNumber(e);

  return {
    repoRoot: e.GITHUB_WORKSPACE || process.cwd(),
    repoSlug,
    provider: "github",
    pullRequestNumber,
    branch,
    commitSha,
  };
}

/**
 * Extract PR number from GITHUB_REF (e.g., "refs/pull/123/merge" -> "123").
 */
function extractPrNumber(ref?: string): string | undefined {
  if (!ref) return undefined;
  const match = ref.match(/^refs\/pull\/(\d+)\//);
  return match ? match[1] : undefined;
}

function resolveGitHubPullRequestNumber(env: NodeJS.ProcessEnv): string | undefined {
  if (env.GITHUB_EVENT_NAME === "pull_request" || env.GITHUB_EVENT_NAME === "pull_request_target") {
    const direct = extractPrNumber(env.GITHUB_REF);
    if (direct) {
      return direct;
    }

    const eventPath = env.GITHUB_EVENT_PATH;
    if (eventPath && fs.existsSync(eventPath)) {
      try {
        const payload = JSON.parse(fs.readFileSync(eventPath, "utf-8")) as { number?: number | string; pull_request?: { number?: number | string } };
        const candidate = payload.pull_request?.number ?? payload.number;
        if (candidate !== undefined) {
          return String(candidate);
        }
      } catch {
        // fall through to undefined
      }
    }
  }

  return undefined;
}

/**
 * Write GitHub Step Summary to GITHUB_STEP_SUMMARY file.
 * Returns the path written, or null if not in GitHub Actions.
 */
export function writeGitHubStepSummary(
  report: VerifyReport,
  env?: NodeJS.ProcessEnv,
): string | null {
  const e = env ?? process.env;
  const summaryPath = e.GITHUB_STEP_SUMMARY;

  if (!summaryPath) {
    return null;
  }

  const markdown = renderCiSummaryMarkdown(report);
  fs.appendFileSync(summaryPath, markdown + "\n");

  return summaryPath;
}

/**
 * Emit GitHub workflow annotations for issues.
 * Blocking issues -> ::error
 * Advisory issues -> ::warning
 */
export function emitGitHubAnnotations(report: VerifyReport): void {
  for (const issue of selectHighlightedIssues(report, 10)) {
    const location = issue.path ? ` file=${issue.path}` : "";
    const message = `[${issue.code}] ${issue.message}`;

    if (issue.severity === "blocking") {
      console.log(`::error${location}::${message}`);
    } else if (issue.severity === "advisory") {
      console.log(`::warning${location}::${message}`);
    }
    // nonblocking_error: no annotation (already in summary)
  }
}

/**
 * Resolve path for GitHub PR comment artifact.
 */
export function resolveGitHubCommentArtifactPath(root: string): string {
  return path.join(root, ".jispec-ci", "github-pr-comment.md");
}

/**
 * Write GitHub PR comment draft to artifact file.
 */
export function writeGitHubPrCommentDraft(
  report: VerifyReport,
  root: string,
): string {
  const commentPath = resolveGitHubCommentArtifactPath(root);
  const markdown = renderPrCommentMarkdown(report);

  fs.mkdirSync(path.dirname(commentPath), { recursive: true });
  fs.writeFileSync(commentPath, `${markdown.endsWith("\n") ? markdown : `${markdown}\n`}`, "utf-8");

  return commentPath;
}
