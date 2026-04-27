import fs from "node:fs";
import path from "node:path";
import { renderPrCommentMarkdown } from "./pr-comment";
import type { VerifyReport, VerifyReportContext } from "./verify-report";

/**
 * Check if running in GitLab CI environment.
 */
export function isGitLabCiEnv(env?: NodeJS.ProcessEnv): boolean {
  const e = env ?? process.env;
  return !!e.GITLAB_CI;
}

/**
 * Build GitLab context from environment variables.
 */
export function buildGitLabContext(env?: NodeJS.ProcessEnv): VerifyReportContext {
  const e = env ?? process.env;

  const repoSlug = e.CI_PROJECT_PATH; // e.g., "group/project"
  const branch = e.CI_COMMIT_REF_NAME;
  const commitSha = e.CI_COMMIT_SHA;
  const mergeRequestIid = e.CI_MERGE_REQUEST_IID;

  return {
    repoRoot: e.CI_PROJECT_DIR || process.cwd(),
    repoSlug,
    provider: "gitlab",
    mergeRequestIid,
    branch,
    commitSha,
  };
}

/**
 * Render GitLab MR note markdown.
 * Uses the same format as PR comments.
 */
export function renderGitLabNoteMarkdown(report: VerifyReport): string {
  return renderPrCommentMarkdown(report);
}

/**
 * Resolve path for GitLab MR note artifact.
 */
export function resolveGitLabNoteArtifactPath(root: string): string {
  return path.join(root, ".jispec-ci", "gitlab-mr-note.md");
}

/**
 * Write GitLab MR note artifact to file.
 */
export function writeGitLabNoteArtifact(
  report: VerifyReport,
  root: string,
): string {
  const notePath = resolveGitLabNoteArtifactPath(root);
  const markdown = renderGitLabNoteMarkdown(report);

  fs.mkdirSync(path.dirname(notePath), { recursive: true });
  fs.writeFileSync(notePath, `${markdown.endsWith("\n") ? markdown : `${markdown}\n`}`, "utf-8");

  return notePath;
}
