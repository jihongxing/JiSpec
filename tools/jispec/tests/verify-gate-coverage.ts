import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildVerifyReport } from "../ci/verify-report";
import { renderVerifySummaryMarkdown } from "../ci/verify-summary";
import { buildVerifyGateCoverageReport, type VerifyGateCoverageReport } from "../verify/gate-coverage";
import { runVerify, type VerifySupplementalCollector } from "../verify/verify-runner";
import type { VerifyRunResult } from "../verify/verdict";
import { TEST_SUITES } from "./regression-runner";
import { FIXED_GENERATED_AT, cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Verify Gate Coverage Tests ===\n");

  const results: TestResult[] = [];

  results.push(await recordAsync("multi-stack collector fixture detects Node, Python, and Go/Java surfaces", async () => {
    const root = createVerifyFixture("verify-gate-multistack");
    try {
      writeText(root, "package.json", JSON.stringify({ scripts: { test: "node --test" } }, null, 2));
      writeText(root, "tsconfig.json", "{}\n");
      writeText(root, "pyproject.toml", "[project]\nname = \"fixture\"\n");
      writeText(root, "go.mod", "module example.com/jispec-fixture\n");

      const result = await runVerify({ root, generatedAt: FIXED_GENERATED_AT });
      const coverage = result.metadata?.gateCoverage as VerifyGateCoverageReport;
      assert.equal(coverage.phase, "north-star-score-optimization-phase-5");
      assert.equal(coverage.stackCoverage.detectedCount, 3);
      assert.deepEqual(coverage.stackCoverage.fixtures.map((entry) => entry.status), ["detected", "detected", "detected"]);
    } finally {
      cleanupVerifyFixture(root);
    }
  }));

  results.push(await recordAsync("artifact freshness distinguishes stale, missing, and fresh gate inputs", async () => {
    const root = createVerifyFixture("verify-gate-freshness");
    try {
      writeText(root, ".jispec-ci/verify-report.json", JSON.stringify({ generatedAt: "2026-04-01T00:00:00.000Z" }, null, 2));
      writeText(root, ".spec/policy.yaml", "version: 1\nrules: []\n");
      writeText(root, ".spec/baselines/verify-baseline.json", JSON.stringify({
        version: "1.0",
        createdAt: "2026-05-20T00:00:00.000Z",
        updatedAt: "2026-05-20T00:00:00.000Z",
        repoRoot: root,
        sourceVerdict: "PASS",
        entries: [],
      }, null, 2));
      writeText(root, ".spec/releases/drift-trend.json", JSON.stringify({
        generatedAt: "2026-05-20T00:00:00.000Z",
        latest: { reportPath: ".spec/releases/compare/v1-to-current/compare-report.json" },
      }, null, 2));
      writeText(root, ".spec/releases/compare/v1-to-current/compare-report.json", JSON.stringify({
        generatedAt: "2026-05-20T00:00:00.000Z",
        driftSummary: { overallStatus: "unchanged" },
      }, null, 2));

      const result = await runVerify({ root, generatedAt: "2026-05-21T00:00:00.000Z" });
      const coverage = result.metadata?.gateCoverage as VerifyGateCoverageReport;
      const byId = new Map(coverage.artifactFreshness.map((entry) => [entry.id, entry]));
      assert.equal(byId.get("ci_report")?.status, "stale");
      assert.equal(byId.get("policy")?.status, "fresh");
      assert.equal(byId.get("baseline")?.status, "fresh");
      assert.equal(byId.get("release_compare")?.status, "fresh");
      assert.equal(byId.get("impact_graph")?.status, "not_available_yet");
      assert.equal(byId.get("ci_report")?.nextCommand, "npm run ci:verify");
    } finally {
      cleanupVerifyFixture(root);
    }
  }));

  results.push(await recordAsync("policy stable-fact guard exposes unstable blocking rule posture", async () => {
    const root = createVerifyFixture("verify-gate-policy");
    try {
      writeText(root, ".spec/policy.yaml", [
        "version: 1",
        "requires:",
        '  facts_contract: "1.0"',
        "rules:",
        "  - id: beta-bootstrap-blocker",
        "    enabled: true",
        "    action: fail_blocking",
        '    message: "Bootstrap takeover is required"',
        "    when:",
        "      fact: bootstrap.takeover.present",
        '      op: "=="',
        "      value: true",
        "",
      ].join("\n"));

      const result = await runVerify({ root, generatedAt: FIXED_GENERATED_AT });
      const coverage = result.metadata?.gateCoverage as VerifyGateCoverageReport;
      assert.equal(coverage.policyStableFactGuard.status, "blocked");
      assert.equal(coverage.policyStableFactGuard.blockingRuleCount, 1);
      assert.equal(coverage.policyStableFactGuard.unstableBlockingRuleCount, 1);
      assert.equal(coverage.policyStableFactGuard.guardedRules[0]?.stableOnly, false);
      assert.equal(coverage.policyStableFactGuard.nextCommand, "npm run jispec-cli -- policy migrate");
      assert.ok(result.issues.some((issue) => issue.code === "POLICY_BLOCKING_RULE_USES_UNSTABLE_FACT"));
    } finally {
      cleanupVerifyFixture(root);
    }
  }));

  results.push(await recordAsync("verify issues all receive deterministic owner and next-action packets", async () => {
    const root = createVerifyFixture("verify-gate-next-actions");
    try {
      const collector: VerifySupplementalCollector = {
        source: "phase-5-fixture",
        collect() {
          return [
            {
              kind: "missing_file",
              severity: "blocking",
              code: "PHASE5_ARTIFACT_MISSING",
              path: ".spec/contracts/domain.yaml",
              message: "Domain contract missing for phase 5.",
            },
            {
              kind: "runtime_error",
              severity: "nonblocking_error",
              code: "PHASE5_TOOLING_WARNING",
              path: "phase-5-fixture",
              message: "Tooling collector warning.",
            },
          ];
        },
      };

      const result = await runVerify({ root, generatedAt: FIXED_GENERATED_AT, supplementalCollectors: [collector] });
      const coverage = result.metadata?.gateCoverage as VerifyGateCoverageReport;
      assert.equal(coverage.issueNextActions.length, result.issues.length);
      assert.ok(coverage.issueNextActions.every((entry) => entry.owner.length > 0));
      assert.ok(coverage.issueNextActions.every((entry) => entry.nextCommand.startsWith("npm run jispec-cli --")));
      assert.equal(coverage.issueNextActions.find((entry) => entry.code === "PHASE5_ARTIFACT_MISSING")?.owner, "artifact owner");
      assert.equal(coverage.issueNextActions.find((entry) => entry.code === "PHASE5_TOOLING_WARNING")?.nextCommand, "npm run jispec-cli -- doctor mainline");
    } finally {
      cleanupVerifyFixture(root);
    }
  }));

  results.push(record("verify report and summary expose phase-5 gate coverage metadata", () => {
    const root = createVerifyFixture("verify-gate-report");
    try {
      const result: VerifyRunResult = {
        root,
        verdict: "PASS",
        ok: true,
        exitCode: 0,
        issueCount: 0,
        blockingIssueCount: 0,
        advisoryIssueCount: 0,
        nonBlockingErrorCount: 0,
        issues: [],
        sources: ["legacy-validator"],
        generatedAt: FIXED_GENERATED_AT,
        metadata: {
          factsContractVersion: "1.0",
          gateCoverage: buildVerifyGateCoverageReport({
            root,
            result: {
              root,
              verdict: "PASS",
              ok: true,
              exitCode: 0,
              issueCount: 0,
              blockingIssueCount: 0,
              advisoryIssueCount: 0,
              nonBlockingErrorCount: 0,
              issues: [],
              sources: ["legacy-validator"],
              generatedAt: FIXED_GENERATED_AT,
              metadata: { impactGraphFreshness: "not_available_yet" },
            },
            generatedAt: FIXED_GENERATED_AT,
          }),
        },
      };
      const report = buildVerifyReport(result, { repoRoot: root, provider: "local" });
      assert.equal((report.modes?.gateCoverage as VerifyGateCoverageReport).phase, "north-star-score-optimization-phase-5");
      const summary = renderVerifySummaryMarkdown(report);
      assert.match(summary, /Gate Coverage/);
      assert.match(summary, /Phase: `north-star-score-optimization-phase-5`/);
      assert.match(summary, /Policy stable-fact guard:/);
    } finally {
      cleanupVerifyFixture(root);
    }
  }));

  results.push(record("stage-5 gate coverage suite is registered in verify-ci-gates", () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "verify-gate-coverage.ts");
    assert.ok(suite);
    assert.equal(suite.area, "verify-ci-gates");
    assert.equal(suite.expectedTests, 6);
    assert.equal(suite.task, "North-Star-Score-Phase-5");
  }));

  printResults(results);
}

function writeText(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function recordAsync(name: string, fn: () => Promise<void>): Promise<TestResult> {
  try {
    await fn();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function printResults(results: TestResult[]): void {
  let passed = 0;
  let failed = 0;

  for (const result of results) {
    if (result.passed) {
      console.log(`✓ ${result.name}`);
      passed++;
    } else {
      console.log(`✗ ${result.name}`);
      console.log(`  Error: ${result.error ?? "unknown error"}`);
      failed++;
    }
  }

  console.log(`\n${passed}/${results.length} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
