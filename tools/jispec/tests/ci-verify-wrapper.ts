import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import type { VerifyReport } from "../ci/verify-report";
import { cleanupVerifyFixture, createVerifyFixture, getRepoRoot } from "./verify-test-helpers";

interface TestCase {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== CI Verify Wrapper Tests ===\n");

  const results: TestCase[] = [];

  runCase(results, "github wrapper writes required artifacts for a passing required check", () => {
    const fixtureRoot = createVerifyFixture("ci-verify-wrapper-github");
    try {
      const stepSummaryPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jispec-gh-summary-")), "step-summary.md");
      const eventPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jispec-gh-event-")), "pull-request.json");
      fs.writeFileSync(eventPath, JSON.stringify({ number: 42 }, null, 2), "utf-8");

      const run = executeWrapper({
        args: ["--root", fixtureRoot],
        env: {
          GITHUB_ACTIONS: "true",
          GITHUB_STEP_SUMMARY: stepSummaryPath,
          GITHUB_EVENT_NAME: "pull_request",
          GITHUB_REF: "refs/pull/42/merge",
          GITHUB_REPOSITORY: "acme/warehouse",
          GITHUB_REF_NAME: "main",
          GITHUB_SHA: "abc123",
          GITHUB_EVENT_PATH: eventPath,
        },
      });

      assert.equal(run.status, 0);
      const reportPath = path.join(fixtureRoot, ".jispec-ci", "verify-report.json");
      const summaryPath = path.join(fixtureRoot, ".jispec-ci", "ci-summary.md");
      const verifySummaryPath = path.join(fixtureRoot, ".jispec-ci", "verify-summary.md");
      const commentPath = path.join(fixtureRoot, ".jispec-ci", "github-pr-comment.md");

      assert.ok(fs.existsSync(reportPath));
      assert.ok(fs.existsSync(summaryPath));
      assert.ok(fs.existsSync(verifySummaryPath));
      assert.ok(fs.existsSync(commentPath));
      assert.ok(fs.existsSync(stepSummaryPath));

      const report = JSON.parse(fs.readFileSync(reportPath, "utf-8")) as VerifyReport;
      assert.equal(report.context.provider, "github");
      assert.equal(report.context.pullRequestNumber, "42");
      assert.equal(report.ok, true);
      assert.equal(report.verdict, "PASS");
      assert.equal(report.factsContractVersion, "1.0");
      assert.match(fs.readFileSync(summaryPath, "utf-8"), /# ✅ JiSpec Verify: PASS\s*$/m);
      assert.match(fs.readFileSync(verifySummaryPath, "utf-8"), /# JiSpec Verify Summary/);
      assert.match(fs.readFileSync(verifySummaryPath, "utf-8"), /Merge status: Ready to merge\./);
      assert.match(fs.readFileSync(commentPath, "utf-8"), /## ✅ JiSpec Verify: PASS/);
      assert.match(fs.readFileSync(stepSummaryPath, "utf-8"), /# ✅ JiSpec Verify: PASS/);
      assert.match(run.stdout, /CI artifacts written to \.jispec-ci/);
      assert.match(run.stdout, /- \.jispec-ci\/verify-summary\.md/);
    } finally {
      cleanupVerifyFixture(fixtureRoot);
    }
  });

  runCase(results, "gitlab wrapper emits MR note artifact without changing the gate verdict", () => {
    const fixtureRoot = createVerifyFixture("ci-verify-wrapper-gitlab");
    try {
      const run = executeWrapper({
        env: {
          GITLAB_CI: "true",
          CI_PROJECT_DIR: fixtureRoot,
          CI_PROJECT_PATH: "acme/warehouse",
          CI_COMMIT_REF_NAME: "main",
          CI_COMMIT_SHA: "def456",
          CI_MERGE_REQUEST_IID: "17",
          JISPEC_CI_ROOT: fixtureRoot,
        },
      });

      assert.equal(run.status, 0);
      const notePath = path.join(fixtureRoot, ".jispec-ci", "gitlab-mr-note.md");
      const reportPath = path.join(fixtureRoot, ".jispec-ci", "verify-report.json");
      const verifySummaryPath = path.join(fixtureRoot, ".jispec-ci", "verify-summary.md");
      assert.ok(fs.existsSync(notePath));
      assert.ok(fs.existsSync(reportPath));
      assert.ok(fs.existsSync(verifySummaryPath));

      const report = JSON.parse(fs.readFileSync(reportPath, "utf-8")) as VerifyReport;
      assert.equal(report.context.provider, "gitlab");
      assert.equal(report.context.mergeRequestIid, "17");
      assert.equal(report.ok, true);
      assert.match(fs.readFileSync(notePath, "utf-8"), /## ✅ JiSpec Verify: PASS/);
    } finally {
      cleanupVerifyFixture(fixtureRoot);
    }
  });

  runCase(results, "wrapper exits non-zero when verify returns FAIL_BLOCKING and still writes artifacts", () => {
    const fixtureRoot = createVerifyFixture("ci-verify-wrapper-fail");
    try {
      fs.rmSync(
        path.join(fixtureRoot, "contexts", "ordering", "slices", "ordering-checkout-v1", "evidence.md"),
        { force: true },
      );

      const run = executeWrapper({
        args: [`--root=${fixtureRoot}`],
      });

      assert.equal(run.status, 1);
      const reportPath = path.join(fixtureRoot, ".jispec-ci", "verify-report.json");
      const summaryPath = path.join(fixtureRoot, ".jispec-ci", "ci-summary.md");
      const verifySummaryPath = path.join(fixtureRoot, ".jispec-ci", "verify-summary.md");
      assert.ok(fs.existsSync(reportPath));
      assert.ok(fs.existsSync(summaryPath));
      assert.ok(fs.existsSync(verifySummaryPath));

      const report = JSON.parse(fs.readFileSync(reportPath, "utf-8")) as VerifyReport;
      assert.equal(report.context.provider, "local");
      assert.equal(report.ok, false);
      assert.equal(report.verdict, "FAIL_BLOCKING");
      assert.ok(report.issues.some((issue) => issue.code === "SLICE_ARTIFACT_MISSING"));
      assert.match(fs.readFileSync(summaryPath, "utf-8"), /# ❌ JiSpec Verify: FAIL_BLOCKING/);
      assert.match(fs.readFileSync(verifySummaryPath, "utf-8"), /Merge status: Blocked until blocking issues are fixed or explicitly waived\./);
      assert.match(fs.readFileSync(verifySummaryPath, "utf-8"), /SLICE_ARTIFACT_MISSING/);
    } finally {
      cleanupVerifyFixture(fixtureRoot);
    }
  });

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    if (result.passed) {
      console.log(`✓ ${result.name}`);
      passed++;
    } else {
      console.log(`✗ ${result.name}`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
      failed++;
    }
  }

  console.log(`\n${passed}/${results.length} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

function runCase(results: TestCase[], name: string, run: () => void): void {
  try {
    run();
    results.push({ name, passed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: message });
  }
}

function executeWrapper(options: {
  args?: string[];
  env?: Record<string, string | undefined>;
}): SpawnSyncReturns<string> {
  const repoRoot = getRepoRoot();
  return spawnSync(
    process.execPath,
    ["--import", "tsx", path.join(repoRoot, "scripts", "check-jispec.ts"), ...(options.args ?? [])],
    {
      cwd: repoRoot,
      encoding: "utf-8",
      env: {
        ...process.env,
        ...options.env,
      },
    },
  );
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
