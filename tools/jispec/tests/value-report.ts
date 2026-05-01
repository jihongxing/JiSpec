import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { collectConsoleLocalSnapshot } from "../console/read-model-snapshot";
import { buildValueReport, type ValueReport } from "../metrics/value-report";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== Value Report Tests ===\n");

  const results: TestResult[] = [];

  runCase(results, "value report answers weekly manual sorting and risk surfaced questions", () => {
    withFixture((root) => {
      writeValueFixture(root);
      const result = buildValueReport({
        root,
        generatedAt: "2026-05-08T00:00:00.000Z",
        windowDays: 7,
      });

      assert.equal(result.report.reportKind, "repo-local-value-report");
      assert.ok(result.report.headline.estimatedManualSortingMinutesSaved > 0);
      assert.equal(result.report.headline.blockingIssuesCaught, 1);
      assert.equal(result.report.headline.advisoryRisksSurfaced, 1);
      assert.match(result.report.headline.weeklyAnswer, /manual artifact sorting/);
      assert.match(result.report.headline.riskAnswer, /blocking issue/);
      assert.ok(fs.existsSync(path.join(root, ".spec", "metrics", "value-report.json")));
      assert.ok(fs.existsSync(path.join(root, ".spec", "metrics", "value-report.md")));
    });
  });

  runCase(results, "metrics are traceable to local artifacts and avoid personal sensitive fields", () => {
    withFixture((root) => {
      writeValueFixture(root);
      const { report } = buildValueReport({
        root,
        generatedAt: "2026-05-08T00:00:00.000Z",
      });
      const sourcePaths = report.sourceArtifacts.map((source) => source.path);

      assert.equal(report.boundary.localOnly, true);
      assert.equal(report.boundary.sourceUploadRequired, false);
      assert.equal(report.boundary.defaultNetworkAccess, false);
      assert.equal(report.boundary.blockingGate, false);
      assert.equal(report.boundary.collectsPersonalSensitiveInfo, false);
      assert.equal(report.boundary.actorNamesRedacted, true);
      assert.ok(sourcePaths.includes(".spec/facts/bootstrap/evidence-graph.json"));
      assert.ok(sourcePaths.includes(".jispec-ci/verify-report.json"));
      assert.ok(sourcePaths.includes(".spec/waivers/waiver-1.json"));
      assert.ok(!JSON.stringify(report).includes("alice@example.com"));
    });
  });

  runCase(results, "report computes takeover time, correction load, waiver debt aging, and execute stop points", () => {
    withFixture((root) => {
      writeValueFixture(root);
      const { report } = buildValueReport({
        root,
        generatedAt: "2026-05-08T00:00:00.000Z",
      });

      assert.equal(report.metrics.firstTakeover.status, "available");
      assert.equal(report.metrics.firstTakeover.durationMinutes, 90);
      assert.equal(report.metrics.adoptCorrectionLoad.decisionCount, 3);
      assert.equal(report.metrics.adoptCorrectionLoad.editedCount, 1);
      assert.equal(report.metrics.adoptCorrectionLoad.deferredSpecDebtCount, 1);
      assert.equal(report.metrics.waiverDebtAging.activeWaivers, 2);
      assert.equal(report.metrics.waiverDebtAging.expiredWaivers, 1);
      assert.equal(report.metrics.waiverDebtAging.openSpecDebt, 1);
      assert.equal(report.metrics.waiverDebtAging.expiredSpecDebt, 1);
      assert.equal(report.metrics.executeMediationStopPoints.stopPoints.post_verify, 1);
      assert.equal(report.metrics.executeMediationStopPoints.rejectedPatchCount, 1);
      assert.equal(report.metrics.executeMediationStopPoints.verifyBlockedCount, 1);
    });
  });

  runCase(results, "Console read model displays value report under takeover quality trend without becoming a gate", () => {
    withFixture((root) => {
      writeValueFixture(root);
      buildValueReport({
        root,
        generatedAt: "2026-05-08T00:00:00.000Z",
      });

      const snapshot = collectConsoleLocalSnapshot(root);
      const valueArtifact = snapshot.artifacts.find((artifact) => artifact.id === "value-report");
      const takeoverTrend = snapshot.governance.objects.find((object) => object.id === "takeover_quality_trend");

      assert.equal(valueArtifact?.status, "available");
      assert.ok(takeoverTrend?.status === "available" || takeoverTrend?.status === "partial");
      assert.equal(takeoverTrend?.summary.hasValueReport, true);
      assert.equal(takeoverTrend?.summary.estimatedManualSortingMinutesSaved, 49);
      assert.equal(takeoverTrend?.summary.blockingIssuesCaught, 1);
    });
  });

  runCase(results, "CLI writes JSON and Markdown value reports", () => {
    withFixture((root) => {
      writeValueFixture(root);
      const cli = runCli(["metrics", "value-report", "--root", root, "--json"]);

      assert.equal(cli.status, 0, cli.stderr);
      const payload = JSON.parse(cli.stdout) as { report?: ValueReport; reportPath?: string; markdownPath?: string };
      assert.equal(payload.report?.reportKind, "repo-local-value-report");
      assert.equal(payload.report?.boundary.blockingGate, false);
      assert.ok(payload.reportPath?.endsWith(".spec/metrics/value-report.json"));
      assert.ok(payload.markdownPath?.endsWith(".spec/metrics/value-report.md"));
    });
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

function writeValueFixture(root: string): void {
  writeJson(root, ".spec/facts/bootstrap/evidence-graph.json", {
    sourceFiles: Array.from({ length: 20 }, (_, index) => ({ path: `src/file-${index}.ts`, category: "other" })),
  });
  writeJson(root, ".spec/facts/bootstrap/adoption-ranked-evidence.json", {
    summary: {
      candidateCount: 8,
      selectedCount: 5,
    },
    excludedSummary: {
      totalExcludedFileCount: 12,
    },
  });
  writeJson(root, ".spec/handoffs/bootstrap-takeover.json", {
    version: 1,
    createdAt: "2026-05-01T01:30:00.000Z",
    updatedAt: "2026-05-01T01:30:00.000Z",
    sourceEvidenceGeneratedAt: "2026-05-01T00:00:00.000Z",
    status: "committed",
    adoptedArtifactPaths: ["contexts/orders/domain.yaml", "contexts/orders/contracts.yaml"],
    specDebtPaths: [".spec/spec-debt/bootstrap/feature.json"],
    decisions: [
      { artifactKind: "domain", finalState: "adopted", edited: false },
      { artifactKind: "api", finalState: "adopted", edited: true },
      { artifactKind: "feature", finalState: "spec_debt", edited: false },
    ],
  });
  writeJson(root, ".jispec-ci/verify-report.json", {
    generatedAt: "2026-05-07T10:00:00.000Z",
    verdict: "FAIL_BLOCKING",
    counts: {
      total: 2,
      blocking: 1,
      advisory: 1,
    },
    issues: [
      { code: "API_CONTRACT_MISSING", severity: "blocking", path: "contexts/orders/contracts.yaml" },
      { code: "GREENFIELD_SPEC_DRIFT_SCENARIO_UNTESTED", severity: "advisory", path: "contexts/orders/behavior.feature" },
    ],
  });
  writeJson(root, ".spec/waivers/waiver-1.json", {
    id: "waiver-1",
    status: "active",
    owner: "alice@example.com",
    reason: "Temporary exception",
    createdAt: "2026-04-01T00:00:00.000Z",
    expiresAt: "2026-05-07T00:00:00.000Z",
  });
  writeJson(root, ".spec/waivers/waiver-2.json", {
    id: "waiver-2",
    status: "active",
    owner: "bob@example.com",
    reason: "Reviewed exception",
    createdAt: "2026-05-01T00:00:00.000Z",
    expiresAt: "2026-05-14T00:00:00.000Z",
  });
  writeYaml(root, ".spec/spec-debt/ledger.yaml", {
    version: 1,
    debts: [
      {
        id: "debt-1",
        status: "open",
        owner: "owner@example.com",
        reason: "Needs behavior confirmation",
        created_at: "2026-04-15T00:00:00.000Z",
        expires_at: "2026-05-07T00:00:00.000Z",
      },
    ],
  });
  writeJson(root, ".spec/spec-debt/bootstrap/feature.json", {
    artifactKind: "feature",
    createdAt: "2026-05-01T00:00:00.000Z",
  });
  writeJson(root, ".jispec/handoff/change-1.json", {
    createdAt: "2026-05-07T11:00:00.000Z",
    outcome: "verify_blocked",
    decisionPacket: {
      stopPoint: "post_verify",
    },
  });
  writeJson(root, ".jispec/implement/change-1/patch-mediation.json", {
    createdAt: "2026-05-07T11:30:00.000Z",
    status: "rejected_out_of_scope",
  });
}

function withFixture(run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-value-report-"));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeYaml(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, yaml.dump(value, { lineWidth: 100, noRefs: true, sortKeys: false }));
}

function writeText(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
}

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const cliPath = path.join(repoRoot, "tools", "jispec", "cli.ts");
  const result = spawnSync(process.execPath, ["--import", "tsx", cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf-8",
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function runCase(results: TestResult[], name: string, run: () => void): void {
  try {
    run();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

main();
