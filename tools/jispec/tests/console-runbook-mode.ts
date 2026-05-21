import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import {
  buildConsoleGovernanceDashboard,
} from "../console/governance-dashboard";
import {
  buildConsoleGovernanceActionPlan,
  renderConsoleGovernanceActionPlanText,
} from "../console/governance-actions";
import {
  buildLocalConsoleUiModel,
  renderLocalConsoleUiHtml,
} from "../console/ui/static-dashboard";
import { TEST_SUITES } from "./regression-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== Console Runbook Mode Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("action plan exposes a phase-8 ordered governance runbook", () => {
    withFixture((root) => {
      writeRunbookFixture(root);
      const plan = buildConsoleGovernanceActionPlan(root);
      const topStep = plan.runbook.topStep;

      assert.equal(plan.runbook.phase, "north-star-score-optimization-phase-8");
      assert.equal(plan.runbook.status, "ready");
      assert.equal(plan.runbook.steps.length, 3);
      assert.ok(topStep);
      assert.equal(topStep.order, 1);
      assert.match(topStep.command, /waiver revoke waiver-expired/);
      assert.equal(topStep.owner, "security-owner");
      assert.match(topStep.expectedArtifact, /\.spec\/waivers\/\*\.json/);
      assert.equal(topStep.verificationCommand, "npm run ci:verify");
      assert.match(topStep.rollbackOption, /renewal|renew/i);
      assert.match(topStep.deferOption, /renewing the waiver/i);
      assert.ok(topStep.evidenceArtifacts.includes(".spec/metrics/value-report.json"));
    });
  }));

  results.push(record("runbook keeps Console read-only and does not replace verify", () => {
    withFixture((root) => {
      writeRunbookFixture(root);
      const plan = buildConsoleGovernanceActionPlan(root);
      const text = renderConsoleGovernanceActionPlanText(plan);

      assert.equal(plan.boundary.readOnly, true);
      assert.equal(plan.boundary.executesCommands, false);
      assert.equal(plan.boundary.writesLocalArtifacts, false);
      assert.equal(plan.runbook.boundary.readOnly, true);
      assert.equal(plan.runbook.boundary.executesCommands, false);
      assert.equal(plan.runbook.boundary.writesLocalArtifacts, false);
      assert.equal(plan.runbook.boundary.replacesVerify, false);
      assert.ok(plan.runbook.steps.every((step) => step.verificationCommand.length > 0));
      assert.match(text, /Runbook:/);
      assert.match(text, /Expected artifact:/);
      assert.match(text, /Verify: npm run ci:verify/);
    });
  }));

  results.push(record("dashboard decision deck relates top runbook to value-report impact", () => {
    withFixture((root) => {
      writeRunbookFixture(root);
      const dashboard = buildConsoleGovernanceDashboard(root);

      assert.equal(dashboard.decisionDeck.runbook.status, "ready");
      assert.equal(dashboard.decisionDeck.runbook.stepCount, 3);
      assert.match(dashboard.decisionDeck.runbook.topStep?.command ?? "", /waiver revoke waiver-expired/);
      assert.equal(dashboard.decisionDeck.runbook.valueReportImpact.status, "ok");
      assert.equal(dashboard.decisionDeck.runbook.valueReportImpact.metrics.estimatedManualSortingMinutesSaved, 64);
      assert.equal(dashboard.decisionDeck.runbook.valueReportImpact.metrics.blockingIssuesCaught, 4);
      assert.match(dashboard.decisionDeck.runbook.valueReportImpact.summary, /64 minute/);
    });
  }));

  results.push(record("static dashboard and CLI JSON expose runbook without executing commands", () => {
    withFixture((root) => {
      writeRunbookFixture(root);
      const html = renderLocalConsoleUiHtml(buildLocalConsoleUiModel({ root }));
      const cli = runCli(["console", "ui", "--root", root, "--json"]);

      assert.match(html, /Top Runbook/);
      assert.match(html, /Expected Artifact/);
      assert.match(html, /Rollback:/);
      assert.match(html, /runbook/);
      assert.match(html, /waiver revoke waiver-expired/);
      assert.equal(cli.status, 0, cli.stderr);

      const payload = JSON.parse(cli.stdout) as {
        boundary?: { readOnly?: boolean; executesCommands?: boolean; overridesVerify?: boolean };
        runbook?: {
          status?: string;
          steps?: Array<{ command?: string; expectedArtifact?: string; verificationCommand?: string }>;
          valueReportImpact?: { metrics?: { blockingIssuesCaught?: number } };
        };
      };
      assert.equal(payload.boundary?.readOnly, true);
      assert.equal(payload.boundary?.executesCommands, false);
      assert.equal(payload.boundary?.overridesVerify, false);
      assert.equal(payload.runbook?.status, "ready");
      assert.match(payload.runbook?.steps?.[0]?.command ?? "", /waiver revoke waiver-expired/);
      assert.match(payload.runbook?.steps?.[0]?.expectedArtifact ?? "", /\.spec\/waivers/);
      assert.equal(payload.runbook?.steps?.[0]?.verificationCommand, "npm run ci:verify");
      assert.equal(payload.runbook?.valueReportImpact?.metrics?.blockingIssuesCaught, 4);
    });
  }));

  results.push(record("phase-8 runbook suite is registered in runtime-extended", () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "console-runbook-mode.ts");
    assert.ok(suite);
    assert.equal(suite.area, "runtime-extended");
    assert.equal(suite.expectedTests, 5);
    assert.equal(suite.task, "North-Star-Score-Phase-8");
  }));

  printResults(results);
}

function writeRunbookFixture(root: string): void {
  const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  writeJson(root, ".jispec-ci/verify-report.json", {
    verdict: "WARN_ADVISORY",
    issueCount: 3,
    blockingIssueCount: 0,
    advisoryIssueCount: 3,
    counts: { total: 3, blocking: 0, advisory: 3 },
    modes: {},
  });
  writeYaml(root, ".spec/policy.yaml", {
    version: 1,
    team: {
      profile: "regulated",
      owner: "platform",
      reviewers: ["reviewer"],
      required_reviewers: 1,
    },
    rules: [],
  });
  writeJson(root, ".spec/waivers/waiver-expired.json", {
    id: "waiver-expired",
    status: "active",
    owner: "security-owner",
    reason: "Temporary security exception",
    issueCode: "SECURITY_REVIEW_REQUIRED",
    createdAt: "2026-04-01T00:00:00.000Z",
    expiresAt: "2026-05-01T00:00:00.000Z",
  });
  writeJson(root, ".spec/waivers/waiver-soon.json", {
    id: "waiver-soon",
    status: "active",
    owner: "contracts-owner",
    reason: "Temporary API exception",
    issueCode: "API_CONTRACT_INVALID_JSON",
    createdAt: "2026-05-01T00:00:00.000Z",
    expiresAt: soon,
  });
  writeYaml(root, ".spec/spec-debt/ledger.yaml", {
    version: 1,
    debts: [{
      id: "debt-expired",
      status: "open",
      owner: "domain-owner",
      reason: "Contract follow-up",
      affected_contracts: ["api:checkout"],
      created_at: "2026-04-01T00:00:00.000Z",
      expires_at: "2026-05-01T00:00:00.000Z",
    }],
  });
  writeJson(root, ".spec/metrics/value-report.json", {
    version: 1,
    reportKind: "repo-local-value-report",
    root,
    generatedAt: "2026-05-21T00:00:00.000Z",
    headline: {
      estimatedManualSortingMinutesSaved: 64,
      blockingIssuesCaught: 4,
      advisoryRisksSurfaced: 5,
      openGovernanceDebt: 3,
      executeStopsNeedingReview: 2,
      weeklyAnswer: "JiSpec avoided an estimated 64 minutes of manual artifact sorting.",
      riskAnswer: "JiSpec surfaced 4 blocking issues and 5 advisory risks.",
    },
    metrics: {
      manualSortingReduction: { estimatedMinutesSaved: 64 },
      riskSurfacing: { blockingIssuesCaught: 4, advisoryRisksSurfaced: 5 },
      executeMediationStopPoints: { stopPoints: { post_verify: 2 } },
    },
    boundary: {
      localOnly: true,
      blockingGate: false,
      sourceUploadRequired: false,
    },
  });
}

function withFixture(run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-runbook-"));
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

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error instanceof Error ? error.message : String(error) };
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

main();
