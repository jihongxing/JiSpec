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
  console.log("=== Console Decision Deck Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("dashboard exposes a first-screen decision deck with value-report metrics", () => {
    withFixture((root) => {
      writeDecisionDeckFixture(root);
      const dashboard = buildConsoleGovernanceDashboard(root);

      assert.equal(dashboard.boundary.firstScreen, "governance_status");
      assert.equal(dashboard.decisionDeck.mergeability.status, "attention");
      assert.match(dashboard.decisionDeck.mergeability.answer, /WARN_ADVISORY/);
      assert.equal(dashboard.decisionDeck.topRisk.level, "high");
      assert.equal(dashboard.decisionDeck.owner.name, "security-owner");
      assert.match(dashboard.decisionDeck.nextCommand, /waiver revoke waiver-expired/);
      assert.match(dashboard.decisionDeck.evidence.primary, /\.spec\/waivers/);
      assert.equal(dashboard.decisionDeck.valueReport.status, "ok");
      assert.equal(dashboard.decisionDeck.valueReport.metrics.estimatedManualSortingMinutesSaved, 42);
      assert.equal(dashboard.decisionDeck.valueReport.metrics.blockingIssuesCaught, 2);
      assert.equal(dashboard.decisionDeck.valueReport.metrics.executeStopsNeedingReview, 1);
    });
  }));

  results.push(record("governance action plan sorts owner actions by explicit priority", () => {
    withFixture((root) => {
      writeDecisionDeckFixture(root);
      const plan = buildConsoleGovernanceActionPlan(root);
      const primary = plan.actions[0];
      const renewal = plan.actions.find((action) => action.kind === "renew_waiver");

      assert.equal(primary?.kind, "revoke_waiver");
      assert.equal(primary?.priority.bucket, "p0_blocking");
      assert.equal(primary?.priority.rank, 10);
      assert.match(primary?.priority.rationale ?? "", /high risk revoke_waiver/);
      assert.ok(renewal);
      assert.ok(primary!.priority.rank < renewal!.priority.rank);
      assert.ok(plan.actions.every((action) => action.replacesCliGate === false));
    });
  }));

  results.push(record("static HTML renders the decision deck, prioritized actions, and value report entry", () => {
    withFixture((root) => {
      writeDecisionDeckFixture(root);
      const html = renderLocalConsoleUiHtml(buildLocalConsoleUiModel({ root }));

      assert.match(html, /Value Report/);
      assert.match(html, /Manual Sorting Saved/);
      assert.match(html, /Blocking Caught/);
      assert.match(html, /Execute Stops/);
      assert.match(html, /actionPriorities/);
      assert.match(html, /decisionDeck/);
      assert.match(html, /p0_blocking/);
      assert.match(html, /waiver revoke waiver-expired/);
      assert.match(html, /42 minute\(s\) saved/);
      assert.doesNotMatch(html, /marketing/i);
      assert.doesNotMatch(html, /file browser/i);
    });
  }));

  results.push(record("console UI CLI JSON exposes decision deck without executing commands", () => {
    withFixture((root) => {
      writeDecisionDeckFixture(root);
      const cli = runCli(["console", "ui", "--root", root, "--json"]);

      assert.equal(cli.status, 0, cli.stderr);
      const payload = JSON.parse(cli.stdout) as {
        boundary?: { readOnly?: boolean; executesCommands?: boolean; overridesVerify?: boolean };
        decisionDeck?: {
          nextCommand?: string;
          valueReport?: { status?: string; metrics?: { estimatedManualSortingMinutesSaved?: number } };
        };
      };
      assert.equal(payload.boundary?.readOnly, true);
      assert.equal(payload.boundary?.executesCommands, false);
      assert.equal(payload.boundary?.overridesVerify, false);
      assert.match(payload.decisionDeck?.nextCommand ?? "", /waiver revoke waiver-expired/);
      assert.equal(payload.decisionDeck?.valueReport?.status, "ok");
      assert.equal(payload.decisionDeck?.valueReport?.metrics?.estimatedManualSortingMinutesSaved, 42);
    });
  }));

  results.push(record("phase-3 decision deck suite is registered in runtime-extended", () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "console-decision-deck.ts");
    assert.ok(suite);
    assert.equal(suite.area, "runtime-extended");
    assert.equal(suite.expectedTests, 5);
    assert.equal(suite.task, "North-Star-Score-Phase-3");
  }));

  printResults(results);
}

function writeDecisionDeckFixture(root: string): void {
  const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  writeJson(root, ".jispec-ci/verify-report.json", {
    verdict: "WARN_ADVISORY",
    issueCount: 2,
    blockingIssueCount: 0,
    advisoryIssueCount: 2,
    counts: { total: 2, blocking: 0, advisory: 2 },
    modes: {},
  });
  writeYaml(root, ".spec/policy.yaml", {
    version: 1,
    team: {
      profile: "small_team",
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
  writeJson(root, ".spec/metrics/value-report.json", {
    version: 1,
    reportKind: "repo-local-value-report",
    root,
    generatedAt: "2026-05-21T00:00:00.000Z",
    headline: {
      estimatedManualSortingMinutesSaved: 42,
      blockingIssuesCaught: 2,
      advisoryRisksSurfaced: 3,
      openGovernanceDebt: 2,
      executeStopsNeedingReview: 1,
      weeklyAnswer: "JiSpec avoided an estimated 42 minutes of manual artifact sorting.",
      riskAnswer: "JiSpec surfaced 2 blocking issues and 3 advisory risks.",
    },
    metrics: {
      manualSortingReduction: { estimatedMinutesSaved: 42 },
      riskSurfacing: { blockingIssuesCaught: 2, advisoryRisksSurfaced: 3 },
      executeMediationStopPoints: { stopPoints: { post_verify: 1 } },
    },
    boundary: {
      localOnly: true,
      blockingGate: false,
      sourceUploadRequired: false,
    },
  });
}

function withFixture(run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-decision-deck-"));
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
