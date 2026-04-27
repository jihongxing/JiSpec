import { runVerify } from "../tools/jispec/verify/verify-runner";
import { buildVerifyReport } from "../tools/jispec/ci/verify-report";
import { renderCiSummaryText, renderCiSummaryMarkdown } from "../tools/jispec/ci/ci-summary";
import { renderPrCommentMarkdown } from "../tools/jispec/ci/pr-comment";
import {
  isGitHubActionsEnv,
  buildGitHubContext,
  writeGitHubStepSummary,
  emitGitHubAnnotations,
  writeGitHubPrCommentDraft,
} from "../tools/jispec/ci/github-action";
import {
  isGitLabCiEnv,
  buildGitLabContext,
  writeGitLabNoteArtifact,
} from "../tools/jispec/ci/gitlab-note";
import path from "node:path";
import fs from "node:fs";

async function testTaskPack6() {
  const root = path.resolve(".");

  console.log("=== Testing Task Pack 6: CI Native Gate & PR Feedback ===\n");

  // Test 1: Build verify report
  console.log("Test 1: Building verify report...");
  try {
    const result1 = await runVerify({ root });
    const context1 = {
      repoRoot: root,
      provider: "local" as const,
    };
    const report1 = buildVerifyReport(result1, context1);
    console.log(`✓ Report built: version=${report1.version}, verdict=${report1.verdict}`);
    console.log(`  Counts: ${report1.counts.total} total, ${report1.counts.blocking} blocking`);
  } catch (error) {
    console.log(`✗ Build report failed: ${error}`);
  }

  // Test 2: Render CI summary text
  console.log("\nTest 2: Rendering CI summary (text)...");
  try {
    const result2 = await runVerify({ root });
    const context2 = {
      repoRoot: root,
      provider: "local" as const,
    };
    const report2 = buildVerifyReport(result2, context2);
    const text = renderCiSummaryText(report2);
    console.log(`✓ Text summary rendered (${text.length} chars)`);
    console.log("--- Preview ---");
    console.log(text.substring(0, 200));
    console.log("--- End Preview ---");
  } catch (error) {
    console.log(`✗ Render text summary failed: ${error}`);
  }

  // Test 3: Render CI summary markdown
  console.log("\nTest 3: Rendering CI summary (markdown)...");
  try {
    const result3 = await runVerify({ root });
    const context3 = {
      repoRoot: root,
      provider: "local" as const,
    };
    const report3 = buildVerifyReport(result3, context3);
    const markdown = renderCiSummaryMarkdown(report3);
    console.log(`✓ Markdown summary rendered (${markdown.length} chars)`);
    console.log(`  Contains header: ${markdown.includes("# ")}`);
    console.log(`  Contains table: ${markdown.includes("| Metric | Count |")}`);
  } catch (error) {
    console.log(`✗ Render markdown summary failed: ${error}`);
  }

  // Test 4: Render PR comment
  console.log("\nTest 4: Rendering PR comment...");
  try {
    const result4 = await runVerify({ root });
    const context4 = {
      repoRoot: root,
      repoSlug: "test/repo",
      provider: "github" as const,
      pullRequestNumber: "123",
    };
    const report4 = buildVerifyReport(result4, context4);
    const comment = renderPrCommentMarkdown(report4);
    console.log(`✓ PR comment rendered (${comment.length} chars)`);
    console.log(`  Contains verdict: ${comment.includes("JiSpec Verify:")}`);
    console.log(`  Contains deep links: ${comment.includes("console.jispec.dev")}`);
  } catch (error) {
    console.log(`✗ Render PR comment failed: ${error}`);
  }

  // Test 5: GitHub Actions detection
  console.log("\nTest 5: Testing GitHub Actions detection...");
  const isGitHub = isGitHubActionsEnv();
  console.log(`  Current environment is GitHub Actions: ${isGitHub}`);

  const mockGitHubEnv = {
    GITHUB_ACTIONS: "true",
    GITHUB_STEP_SUMMARY: "/tmp/summary.md",
    GITHUB_REPOSITORY: "owner/repo",
    GITHUB_REF_NAME: "main",
    GITHUB_SHA: "abc123",
  };
  const isGitHubMock = isGitHubActionsEnv(mockGitHubEnv);
  console.log(`  Mock GitHub environment detected: ${isGitHubMock}`);

  if (isGitHubMock) {
    const ghContext = buildGitHubContext(mockGitHubEnv);
    console.log(`✓ GitHub context built: provider=${ghContext.provider}, slug=${ghContext.repoSlug}`);
  }

  // Test 6: GitLab CI detection
  console.log("\nTest 6: Testing GitLab CI detection...");
  const isGitLab = isGitLabCiEnv();
  console.log(`  Current environment is GitLab CI: ${isGitLab}`);

  const mockGitLabEnv = {
    GITLAB_CI: "true",
    CI_PROJECT_PATH: "group/project",
    CI_COMMIT_REF_NAME: "main",
    CI_COMMIT_SHA: "def456",
    CI_MERGE_REQUEST_IID: "42",
  };
  const isGitLabMock = isGitLabCiEnv(mockGitLabEnv);
  console.log(`  Mock GitLab environment detected: ${isGitLabMock}`);

  if (isGitLabMock) {
    const glContext = buildGitLabContext(mockGitLabEnv);
    console.log(`✓ GitLab context built: provider=${glContext.provider}, slug=${glContext.repoSlug}`);
  }

  // Test 7: Write GitHub artifacts (simulated)
  console.log("\nTest 7: Writing GitHub artifacts (simulated)...");
  try {
    const result7 = await runVerify({ root });
    const context7 = buildGitHubContext({
      GITHUB_ACTIONS: "true",
      GITHUB_STEP_SUMMARY: path.join(root, ".jispec-ci", "test-gh-summary.md"),
      GITHUB_REPOSITORY: "test/repo",
      GITHUB_REF_NAME: "main",
      GITHUB_SHA: "abc123",
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_REF: "refs/pull/123/merge",
    });
    const report7 = buildVerifyReport(result7, context7);

    const summaryPath = writeGitHubStepSummary(report7, {
      GITHUB_STEP_SUMMARY: path.join(root, ".jispec-ci", "test-gh-summary.md"),
    });
    console.log(`✓ GitHub step summary written to: ${summaryPath}`);

    const commentPath = writeGitHubPrCommentDraft(report7, root);
    console.log(`✓ GitHub PR comment draft written to: ${commentPath}`);

    if (summaryPath && fs.existsSync(summaryPath)) {
      const summaryContent = fs.readFileSync(summaryPath, "utf-8");
      console.log(`  Summary file size: ${summaryContent.length} bytes`);
    }
  } catch (error) {
    console.log(`✗ Write GitHub artifacts failed: ${error}`);
  }

  // Test 8: Write GitLab artifacts
  console.log("\nTest 8: Writing GitLab artifacts...");
  try {
    const result8 = await runVerify({ root });
    const context8 = buildGitLabContext({
      GITLAB_CI: "true",
      CI_PROJECT_PATH: "test/project",
      CI_COMMIT_REF_NAME: "main",
      CI_COMMIT_SHA: "def456",
      CI_MERGE_REQUEST_IID: "42",
    });
    const report8 = buildVerifyReport(result8, context8);

    const notePath = writeGitLabNoteArtifact(report8, root);
    console.log(`✓ GitLab MR note written to: ${notePath}`);

    if (fs.existsSync(notePath)) {
      const noteContent = fs.readFileSync(notePath, "utf-8");
      console.log(`  Note file size: ${noteContent.length} bytes`);
    }
  } catch (error) {
    console.log(`✗ Write GitLab artifacts failed: ${error}`);
  }

  // Test 9: Full CI wrapper simulation
  console.log("\nTest 9: Testing full CI wrapper (check-jispec.ts)...");
  try {
    const result9 = await runVerify({
      root,
      useBaseline: true,
      policyPath: ".spec/policy.yaml",
      applyWaivers: true,
    });
    const context9 = {
      repoRoot: root,
      provider: "local" as const,
    };
    const report9 = buildVerifyReport(result9, context9);
    const summary = renderCiSummaryText(report9);

    console.log(`✓ CI wrapper simulation completed`);
    console.log(`  Verdict: ${report9.verdict}`);
    console.log(`  Exit code would be: ${result9.ok ? 0 : 1}`);
  } catch (error) {
    console.log(`✗ CI wrapper simulation failed: ${error}`);
  }

  console.log("\n=== Task Pack 6 Tests Complete ===");
}

testTaskPack6().catch(console.error);
