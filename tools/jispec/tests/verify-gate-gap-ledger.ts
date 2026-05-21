import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { renderCiSummaryMarkdown, renderCiSummaryText } from "../ci/ci-summary";
import { buildVerifyReport } from "../ci/verify-report";
import { renderVerifySummaryMarkdown } from "../ci/verify-summary";
import {
  VERIFY_GATE_GAP_LEDGER_RELATIVE_PATH,
  type VerifyGateGapLedger,
} from "../verify/gate-gap-ledger";
import { runVerify } from "../verify/verify-runner";
import { TEST_SUITES } from "./regression-runner";
import { cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Verify Gate Gap Ledger Tests ===\n");

  const results: TestResult[] = [];

  results.push(await recordAsync("verify writes a phase-7 gate gap ledger from gate coverage metadata", async () => {
    const root = createVerifyFixture("verify-gate-gap-ledger-write");
    try {
      const result = await runVerify({ root, generatedAt: "2026-05-21T00:00:00.000Z" });
      const ledger = readLedger(root);
      const metadata = result.metadata?.gateGapLedger as Record<string, unknown>;

      assert.equal(ledger.phase, "north-star-score-optimization-phase-7");
      assert.equal(ledger.sourceCoveragePhase, "north-star-score-optimization-phase-5");
      assert.ok(ledger.summary.unresolved >= 4);
      assert.ok(ledger.entries.some((entry) => entry.id === "artifact:ci_report"));
      assert.ok(ledger.entries.some((entry) => entry.id === "artifact:policy"));
      assert.ok(ledger.entries.every((entry) => entry.nextCommand.length > 0));
      assert.equal(metadata.phase, "north-star-score-optimization-phase-7");
      assert.equal(metadata.path, VERIFY_GATE_GAP_LEDGER_RELATIVE_PATH);
      assert.equal(result.ok, true);
      assert.equal(result.exitCode, 0);
    } finally {
      cleanupVerifyFixture(root);
    }
  }));

  results.push(await recordAsync("ledger distinguishes new, persistent, and resolved gaps across verify runs", async () => {
    const root = createVerifyFixture("verify-gate-gap-ledger-trend");
    try {
      await runVerify({ root, generatedAt: "2026-05-21T00:00:00.000Z" });
      writeText(root, ".spec/policy.yaml", "version: 1\nrules: []\n");
      const second = await runVerify({ root, generatedAt: "2026-05-22T00:00:00.000Z" });
      const ledger = readLedger(root);
      const policy = ledger.entries.find((entry) => entry.id === "artifact:policy");
      const ci = ledger.entries.find((entry) => entry.id === "artifact:ci_report");

      assert.equal(policy?.status, "resolved");
      assert.equal(policy?.resolvedAt, "2026-05-22T00:00:00.000Z");
      assert.equal(ci?.status, "unresolved");
      assert.equal(ci?.firstSeenAt, "2026-05-21T00:00:00.000Z");
      assert.equal(ci?.occurrenceCount, 2);
      assert.ok(ledger.summary.persistent >= 1);
      assert.ok(ledger.summary.resolved >= 1);
      assert.equal((second.metadata?.gateGapLedger as Record<string, unknown>).persistent, ledger.summary.persistent);
    } finally {
      cleanupVerifyFixture(root);
    }
  }));

  results.push(await recordAsync("verify summaries and CI summaries expose gate gap ledger trend", async () => {
    const root = createVerifyFixture("verify-gate-gap-ledger-summary");
    try {
      const result = await runVerify({ root, generatedAt: "2026-05-21T00:00:00.000Z" });
      const report = buildVerifyReport(result, { repoRoot: root, provider: "local" });
      const verifySummary = renderVerifySummaryMarkdown(report);
      const ciMarkdown = renderCiSummaryMarkdown(report);
      const ciText = renderCiSummaryText(report);

      assert.match(verifySummary, /## Gate Gap Ledger/);
      assert.match(verifySummary, /Phase: `north-star-score-optimization-phase-7`/);
      assert.match(verifySummary, /Gate gap ledger tracks coverage debt over time/);
      assert.match(ciMarkdown, /## Gate Gap Ledger/);
      assert.match(ciMarkdown, /Trend:/);
      assert.match(ciText, /Gate Gap Ledger:/);
      assert.match(ciText, /Top next command:/);
    } finally {
      cleanupVerifyFixture(root);
    }
  }));

  results.push(record("stage-7 gate gap ledger suite is registered in verify-ci-gates", () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "verify-gate-gap-ledger.ts");
    assert.ok(suite);
    assert.equal(suite.area, "verify-ci-gates");
    assert.equal(suite.expectedTests, 4);
    assert.equal(suite.task, "North-Star-Score-Phase-7");
  }));

  printResults(results);
}

function readLedger(root: string): VerifyGateGapLedger {
  return JSON.parse(
    fs.readFileSync(path.join(root, VERIFY_GATE_GAP_LEDGER_RELATIVE_PATH), "utf-8"),
  ) as VerifyGateGapLedger;
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
