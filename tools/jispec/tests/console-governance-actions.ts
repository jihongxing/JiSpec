import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { buildConsoleGovernanceActionPlan } from "../console/governance-actions";
import { readAuditEvents } from "../audit/event-ledger";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Console Governance Actions Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("action plan suggests policy migration and release compare without writing artifacts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-actions-missing-"));
    try {
      const plan = buildConsoleGovernanceActionPlan(root);
      assert.equal(plan.boundary.readOnly, true);
      assert.equal(plan.boundary.executesCommands, false);
      assert.equal(plan.boundary.writesLocalArtifacts, false);
      assert.ok(plan.actions.some((action) => action.kind === "migrate_policy" && action.command.includes("policy migrate")));
      assert.ok(plan.actions.some((action) => action.kind === "compare_release_drift" && action.command.includes("release compare")));
      assert.equal(fs.existsSync(path.join(root, ".spec", "policy.yaml")), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("action plan generates waiver renew and revoke packets from local waiver posture", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-actions-waiver-"));
    try {
      const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      writeJson(root, ".spec/policy.yaml", { version: 1, rules: [] });
      writeJson(root, ".jispec-ci/verify-report.json", {
        verdict: "PASS",
        counts: { total: 0, blocking: 0, advisory: 0 },
        modes: { unmatchedActiveWaiverIds: ["waiver-stale"] },
      });
      writeJson(root, ".spec/waivers/waiver-soon.json", {
        id: "waiver-soon",
        status: "active",
        owner: "team",
        reason: "temporary",
        issueCode: "API_CONTRACT_INVALID_JSON",
        createdAt: "2026-05-01T00:00:00.000Z",
        expiresAt: soon,
      });
      writeJson(root, ".spec/waivers/waiver-stale.json", {
        id: "waiver-stale",
        status: "active",
        owner: "team",
        reason: "stale",
        issueCode: "STALE",
        createdAt: "2026-05-01T00:00:00.000Z",
      });

      const plan = buildConsoleGovernanceActionPlan(root);
      const renew = plan.actions.find((action) => action.kind === "renew_waiver");
      const revoke = plan.actions.find((action) => action.kind === "revoke_waiver");
      assert.ok(renew?.command.includes("waiver renew waiver-soon"));
      assert.equal(renew?.status, "needs_input");
      assert.ok(revoke?.command.includes("waiver revoke waiver-stale"));
      assert.equal(revoke?.status, "ready");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("action plan generates spec debt owner-review and repay packets", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-actions-debt-"));
    try {
      writeJson(root, ".spec/policy.yaml", { version: 1, rules: [] });
      writeYaml(root, ".spec/spec-debt/ledger.yaml", {
        version: 1,
        debts: [
          {
            id: "debt-open",
            kind: "defer",
            status: "open",
            owner: "domain-owner",
            reason: "Needs owner review",
            created_at: "2026-05-01T00:00:00.000Z",
            affected_assets: [".spec/contracts/domain.yaml"],
            affected_contracts: ["CTR-DOMAIN-001"],
            repayment_hint: "Confirm boundary.",
          },
          {
            id: "debt-expired",
            kind: "waiver",
            status: "open",
            owner: "domain-owner",
            reason: "Expired waiver",
            created_at: "2026-04-01T00:00:00.000Z",
            expires_at: "2026-04-02T00:00:00.000Z",
            affected_assets: [".spec/contracts/behaviors.feature"],
            repayment_hint: "Repay expired waiver.",
          },
        ],
      });

      const plan = buildConsoleGovernanceActionPlan(root);
      const ownerReview = plan.actions.find((action) => action.kind === "mark_spec_debt_owner_review");
      const repay = plan.actions.find((action) => action.kind === "repay_spec_debt");
      assert.ok(ownerReview?.command.includes("spec-debt owner-review debt-open"));
      assert.ok(repay?.command.includes("spec-debt repay debt-expired"));
      assert.equal(repay?.status, "ready");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("CLI governance actions are explicit and write through audited local commands only when run", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-actions-cli-"));
    try {
      writeYaml(root, ".spec/spec-debt/ledger.yaml", {
        version: 1,
        debts: [
          {
            id: "debt-cli",
            kind: "defer",
            status: "open",
            owner: "team",
            reason: "Needs review",
            created_at: "2026-05-01T00:00:00.000Z",
            affected_assets: [".spec/contracts/domain.yaml"],
            repayment_hint: "Review it.",
          },
        ],
      });
      writeJson(root, ".spec/waivers/waiver-cli.json", {
        id: "waiver-cli",
        status: "active",
        owner: "team",
        reason: "temporary",
        issueCode: "API_CONTRACT_INVALID_JSON",
        createdAt: "2026-05-01T00:00:00.000Z",
        expiresAt: "2026-05-02T00:00:00.000Z",
      });

      const actions = runCli(["console", "actions", "--root", root, "--json"]);
      assert.equal(actions.status, 0, actions.stderr);
      const plan = JSON.parse(actions.stdout) as ReturnType<typeof buildConsoleGovernanceActionPlan>;
      assert.equal(plan.boundary.executesCommands, false);
      assert.ok(plan.actions.some((action) => action.command.includes("spec-debt owner-review debt-cli")));
      assert.equal(readAuditEvents(root).length, 0);

      const renew = runCli([
        "waiver",
        "renew",
        "waiver-cli",
        "--root",
        root,
        "--actor",
        "reviewer",
        "--reason",
        "Extend for owner review",
        "--expires-at",
        "2026-06-01T00:00:00.000Z",
        "--json",
      ]);
      assert.equal(renew.status, 0, renew.stderr);
      const ownerReview = runCli([
        "spec-debt",
        "owner-review",
        "debt-cli",
        "--root",
        root,
        "--actor",
        "reviewer",
        "--reason",
        "Needs domain owner",
        "--json",
      ]);
      assert.equal(ownerReview.status, 0, ownerReview.stderr);
      const repay = runCli([
        "spec-debt",
        "repay",
        "debt-cli",
        "--root",
        root,
        "--actor",
        "reviewer",
        "--reason",
        "Debt was repaid",
        "--json",
      ]);
      assert.equal(repay.status, 0, repay.stderr);

      const events = readAuditEvents(root);
      assert.ok(events.some((event) => event.type === "waiver_renew"));
      assert.ok(events.some((event) => event.type === "spec_debt_owner_review"));
      assert.ok(events.some((event) => event.type === "spec_debt_repay"));
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
