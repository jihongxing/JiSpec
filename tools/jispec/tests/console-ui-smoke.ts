import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as yaml from "js-yaml";
import {
  buildLocalConsoleUiModel,
  renderLocalConsoleUiHtml,
  writeLocalConsoleUi,
} from "../console/ui/static-dashboard";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== Console UI Smoke Tests ===\n");

  const results: TestResult[] = [];

  runCase(results, "local UI model is read-only and first screen is governance status", () => {
    withFixture((root) => {
      writeGovernanceFixture(root);
      const model = buildLocalConsoleUiModel({ root });

      assert.equal(model.boundary.readOnly, true);
      assert.equal(model.boundary.offlineCapable, true);
      assert.equal(model.boundary.sourceUploadRequired, false);
      assert.equal(model.boundary.overridesVerify, false);
      assert.equal(model.boundary.scansSourceCode, false);
      assert.equal(model.boundary.executesCommands, false);
      assert.equal(model.boundary.firstScreen, "governance_status");
      assert.equal(model.dashboard.boundary.firstScreen, "governance_status");
      assert.equal(model.dashboard.questions[0]?.id, "mergeability");
    });
  });

  runCase(results, "HTML renders governance objects, questions, actions, and boundary without source upload claims", () => {
    withFixture((root) => {
      writeGovernanceFixture(root);
      const html = renderLocalConsoleUiHtml(buildLocalConsoleUiModel({ root }));

      assert.match(html, /JiSpec Console/);
      assert.match(html, /Governance Questions/);
      assert.match(html, /Can this repo merge right now/);
      assert.match(html, /Policy posture/i);
      assert.match(html, /Waiver lifecycle/i);
      assert.match(html, /Spec debt ledger/i);
      assert.match(html, /Contract drift/i);
      assert.match(html, /Release baseline/i);
      assert.match(html, /Verify trend/i);
      assert.match(html, /Takeover quality trend/i);
      assert.match(html, /Implementation mediation outcomes/i);
      assert.match(html, /Audit events/i);
      assert.match(html, /Suggested Local Commands/);
      assert.match(html, /The UI does not execute commands/);
      assert.match(html, /Owner/);
      assert.match(html, /Risk/);
      assert.match(html, /Affected/);
      assert.match(html, /Source/);
      assert.match(html, /Copy/);
      assert.match(html, /actionDecisionPackets/);
      assert.match(html, /domain-owner/);
      assert.match(html, /spec-debt owner-review debt-1/);
      assert.match(html, /Source upload[\s\S]*no/);
      assert.doesNotMatch(html, /marketing/i);
      assert.doesNotMatch(html, /file browser/i);
    });
  });

  runCase(results, "writer creates a static HTML artifact under .spec console UI", () => {
    withFixture((root) => {
      writeGovernanceFixture(root);
      const result = writeLocalConsoleUi({ root });

      assert.equal(result.relativeOutPath, ".spec/console/ui/index.html");
      assert.ok(result.bytesWritten > 1000);
      assert.ok(fs.existsSync(path.join(root, ".spec", "console", "ui", "index.html")));
      const html = fs.readFileSync(path.join(root, result.relativeOutPath), "utf-8");
      assert.match(html, /application\/json/);
      assert.match(html, /"firstScreen":"governance_status"/);
      assert.match(html, /"actionDecisionPackets":/);
    });
  });

  runCase(results, "CLI writes UI and emits JSON summary without running verify", () => {
    withFixture((root) => {
      writeGovernanceFixture(root);
      const cli = runCli(["console", "ui", "--root", root, "--json"]);

      assert.equal(cli.status, 0, cli.stderr);
      const payload = JSON.parse(cli.stdout) as {
        relativeOutPath?: string;
        boundary?: { readOnly?: boolean; executesCommands?: boolean; overridesVerify?: boolean };
        headline?: { status?: string };
      };
      assert.equal(payload.relativeOutPath, ".spec/console/ui/index.html");
      assert.equal(payload.boundary?.readOnly, true);
      assert.equal(payload.boundary?.executesCommands, false);
      assert.equal(payload.boundary?.overridesVerify, false);
      assert.ok(payload.headline?.status);
      assert.ok(fs.existsSync(path.join(root, ".spec", "console", "ui", "index.html")));
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

function withFixture(run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-ui-"));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeGovernanceFixture(root: string): void {
  writeJson(root, ".jispec-ci/verify-report.json", {
    verdict: "WARN_ADVISORY",
    issueCount: 1,
    blockingIssueCount: 0,
    advisoryIssueCount: 1,
    counts: {
      total: 1,
      blocking: 0,
      advisory: 1,
    },
    modes: {},
  });
  writeYaml(root, ".spec/policy.yaml", {
    version: 1,
    requires: { facts_contract: "1.0" },
    team: { profile: "small_team", owner: "platform", reviewers: ["reviewer"] },
    rules: [],
  });
  writeJson(root, ".spec/waivers/waiver-1.json", {
    id: "waiver-1",
    status: "active",
    owner: "platform",
    reason: "temporary advisory",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  writeYaml(root, ".spec/spec-debt/ledger.yaml", {
    version: 1,
    debts: [
      {
        id: "debt-1",
        status: "open",
        owner: "domain-owner",
        reason: "review behavior wording",
      },
    ],
  });
  writeYaml(root, ".spec/baselines/releases/v1.yaml", {
    version: "v1",
  });
  writeJson(root, ".spec/releases/compare/v1-to-current/compare-report.json", {
    driftSummary: {
      overallStatus: "unchanged",
    },
  });
  writeJson(root, ".spec/releases/drift-trend.json", {
    compareCount: 1,
    changedCompareCount: 0,
    unchangedCompareCount: 1,
    latest: {
      reportPath: ".spec/releases/compare/v1-to-current/compare-report.json",
      overallStatus: "unchanged",
      contractGraphStatus: "unchanged",
      staticCollectorStatus: "unchanged",
      policyStatus: "unchanged",
    },
  });
  writeJson(root, ".spec/handoffs/retakeover-metrics.json", {
    qualityScorecard: {
      score: 0.82,
    },
  });
  writeJson(root, ".jispec/handoff/change-1.json", {
    outcome: "verify_blocked",
    decisionPacket: {
      stopPoint: "post_verify",
    },
    replay: {
      replayable: true,
    },
  });
  writeText(root, ".spec/audit/events.jsonl", `${JSON.stringify({
    version: 1,
    id: "audit-1",
    type: "policy_migrate",
    timestamp: "2026-05-01T00:00:00.000Z",
    actor: "platform",
    reason: "Initialize policy.",
    sourceArtifact: { kind: "policy", path: ".spec/policy.yaml" },
    affectedContracts: [],
  })}\n`);
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

main();
