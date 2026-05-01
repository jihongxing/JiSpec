import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { appendAuditEvent } from "../audit/event-ledger";
import {
  buildConsoleGovernanceDashboard,
  renderConsoleGovernanceDashboardText,
} from "../console/governance-dashboard";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Console Governance Dashboard Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("dashboard first screen is local governance status with missing artifacts as unknown", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-dashboard-missing-"));
    try {
      const dashboard = buildConsoleGovernanceDashboard(root);
      assert.equal(dashboard.boundary.readOnly, true);
      assert.equal(dashboard.boundary.sourceUploadRequired, false);
      assert.equal(dashboard.boundary.overridesVerify, false);
      assert.equal(dashboard.boundary.scansSourceCode, false);
      assert.equal(dashboard.boundary.firstScreen, "governance_status");
      assert.equal(dashboard.questions[0]?.id, "mergeability");
      assert.equal(dashboard.questions[0]?.status, "unknown");
      assert.equal(dashboard.headline.status, "unknown");
      assert.ok(!renderConsoleGovernanceDashboardText(dashboard).includes("Artifact browser"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("dashboard answers mergeability and release drift from declared artifacts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-dashboard-blocked-"));
    try {
      writeJson(root, ".jispec-ci/verify-report.json", {
        verdict: "FAIL_BLOCKING",
        issueCount: 2,
        blockingIssueCount: 1,
        modes: {},
      });
      writeJson(root, ".spec/releases/compare/v1-to-current/compare-report.json", {
        driftSummary: {
          overallStatus: "changed",
        },
      });

      const dashboard = buildConsoleGovernanceDashboard(root);
      const mergeability = question(dashboard, "mergeability");
      const drift = question(dashboard, "contract_drift_review");
      assert.equal(dashboard.headline.status, "blocked");
      assert.equal(mergeability.status, "blocked");
      assert.match(mergeability.answer, /FAIL_BLOCKING/);
      assert.equal(drift.status, "blocked");
      assert.match(drift.answer, /changed/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("dashboard surfaces waiver, spec debt, execute mediation, and audit governance attention", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-dashboard-governance-"));
    try {
      const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      writeJson(root, ".jispec-ci/verify-report.json", {
        verdict: "WARN_ADVISORY",
        issueCount: 3,
        blockingIssueCount: 0,
        modes: {
          unmatchedActiveWaiverIds: ["waiver-stale"],
        },
      });
      writeJson(root, ".spec/waivers/waiver-soon.json", {
        id: "waiver-soon",
        status: "active",
        owner: "contracts-team",
        reason: "Temporary exception",
        issueCode: "API_CONTRACT_INVALID_JSON",
        createdAt: "2026-05-01T00:00:00.000Z",
        expiresAt: soon,
      });
      writeYaml(root, ".spec/spec-debt/ledger.yaml", {
        version: 1,
        debts: [
          {
            id: "debt-open",
            kind: "waiver",
            status: "open",
            owner: "domain-owner",
            reason: "Thin behavior evidence",
            created_at: "2026-05-01T00:00:00.000Z",
            affected_assets: [".spec/contracts/behaviors.feature"],
            affected_contracts: ["CTR-BEHAVIOR-001"],
            repayment_hint: "Confirm behavior before release.",
          },
        ],
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
      appendAuditEvent(root, {
        type: "waiver_create",
        timestamp: "2026-05-01T00:00:00.000Z",
        actor: "reviewer",
        reason: "Approve temporary exception.",
        sourceArtifact: { kind: "verify-waiver", path: ".spec/waivers/waiver-soon.json" },
        affectedContracts: ["issue:API_CONTRACT_INVALID_JSON"],
      });

      const dashboard = buildConsoleGovernanceDashboard(root);
      assert.equal(question(dashboard, "mergeability").status, "attention");
      assert.equal(question(dashboard, "waiver_attention").status, "attention");
      assert.match(question(dashboard, "waiver_attention").answer, /expiring soon/);
      assert.equal(question(dashboard, "spec_debt_attention").status, "attention");
      assert.match(question(dashboard, "execute_mediation_status").answer, /post_verify/);
      assert.equal(question(dashboard, "audit_traceability").status, "ok");
      assert.match(question(dashboard, "audit_traceability").answer, /reviewer/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("CLI exposes console dashboard as text and JSON", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-dashboard-cli-"));
    try {
      writeJson(root, ".jispec-ci/verify-report.json", {
        verdict: "PASS",
        issueCount: 0,
        blockingIssueCount: 0,
        modes: {},
      });
      const text = runCli(["console", "dashboard", "--root", root]);
      assert.equal(text.status, 0, text.stderr);
      assert.match(text.stdout, /JiSpec Governance Console/);
      assert.match(text.stdout, /Can this repo merge right now/);
      assert.doesNotMatch(text.stdout, /marketing/i);
      assert.doesNotMatch(text.stdout, /file browser/i);

      const json = runCli(["console", "dashboard", "--root", root, "--json"]);
      assert.equal(json.status, 0, json.stderr);
      const payload = JSON.parse(json.stdout) as ReturnType<typeof buildConsoleGovernanceDashboard>;
      assert.equal(payload.boundary.firstScreen, "governance_status");
      assert.equal(payload.questions[0]?.id, "mergeability");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

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

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function question(dashboard: ReturnType<typeof buildConsoleGovernanceDashboard>, id: string) {
  const entry = dashboard.questions.find((item) => item.id === id);
  assert.ok(entry, `Missing question ${id}`);
  return entry;
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

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
