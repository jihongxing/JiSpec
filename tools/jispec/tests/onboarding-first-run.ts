import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runFirstRun, type FirstRunResult } from "../onboarding/first-run";
import { getRepoRoot } from "./verify-test-helpers";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== Onboarding First Run Tests ===\n");

  const repoRoot = getRepoRoot();
  const results: TestResult[] = [];

  runCase(results, "empty directory recommends Greenfield init with explicit write set", () => {
    withTempRoot("jispec-first-run-empty-", (root) => {
      const result = runFirstRun({ root });
      assert.equal(result.classification, "greenfield_start");
      assert.match(result.nextAction.command, /npm run jispec -- init/);
      assert.equal(result.boundaries.readOnly, true);
      assert.equal(result.boundaries.sourceUploadRequired, false);
      assert.equal(result.nextAction.writesLocalArtifacts, true);
      assert.ok(result.nextAction.writes.includes(".spec/policy.yaml"));
    });
  });

  runCase(results, "legacy repository recommends bootstrap discover without inventing contracts", () => {
    withTempRoot("jispec-first-run-legacy-", (root) => {
      writeText(root, "package.json", JSON.stringify({ name: "legacy" }, null, 2));
      writeText(root, "src/routes.ts", "export const route = '/orders';\n");
      const result = runFirstRun({ root });
      assert.equal(result.classification, "legacy_takeover_start");
      assert.match(result.nextAction.command, /bootstrap discover/);
      assert.match(result.nextAction.command, /--init-project/);
      assert.ok(result.state.sourceSignals.includes("package.json"));
      assert.ok(result.nextAction.writes.includes(".spec/facts/bootstrap/evidence-graph.json"));
    });
  });

  runCase(results, "open bootstrap draft recommends adopt with the specific session", () => {
    withTempRoot("jispec-first-run-draft-", (root) => {
      writeJson(root, ".spec/sessions/bootstrap-open/manifest.json", {
        sessionId: "bootstrap-open",
        status: "drafted",
        updatedAt: "2026-05-01T00:00:00.000Z",
      });
      const result = runFirstRun({ root });
      assert.equal(result.classification, "open_bootstrap_draft");
      assert.match(result.nextAction.command, /adopt/);
      assert.match(result.nextAction.command, /--session bootstrap-open/);
      assert.ok(result.nextAction.writes.includes(".spec/handoffs/adopt-summary.md"));
    });
  });

  runCase(results, "adopted contracts without policy recommend policy migrate", () => {
    withTempRoot("jispec-first-run-policy-", (root) => {
      writeText(root, "jiproject/project.yaml", "name: sample\n");
      writeText(root, ".spec/contracts/domain.yaml", "contexts: []\n");
      const result = runFirstRun({ root });
      assert.equal(result.classification, "needs_policy");
      assert.match(result.nextAction.command, /policy migrate/);
      assert.ok(result.nextAction.writes.includes(".spec/policy.yaml"));
      assert.ok(result.nextAction.writes.includes(".spec/audit/events.jsonl"));
    });
  });

  runCase(results, "blocking verify report recommends console dashboard and actions stay read-only", () => {
    withTempRoot("jispec-first-run-blocked-", (root) => {
      writeText(root, "jiproject/project.yaml", "name: sample\n");
      writeText(root, ".spec/policy.yaml", "version: 1\nrules: []\n");
      writeJson(root, ".jispec-ci/verify-report.json", {
        verdict: "FAIL_BLOCKING",
        ok: false,
      });
      const result = runFirstRun({ root });
      assert.equal(result.classification, "verify_blocked");
      assert.match(result.nextAction.command, /console dashboard/);
      assert.equal(result.nextAction.writesLocalArtifacts, false);
      assert.ok(result.alternativeActions.some((action) => action.command.includes("console actions")));
    });
  });

  runCase(results, "active change session recommends implement and CLI emits JSON", () => {
    withTempRoot("jispec-first-run-active-", (root) => {
      writeJson(root, ".jispec/change-session.json", {
        id: "change-123",
        summary: "Add refund validation",
        orchestrationMode: "execute",
      });
      const direct = runFirstRun({ root });
      assert.equal(direct.classification, "active_change_session");
      assert.match(direct.nextAction.command, /implement/);

      const cli = runCli(repoRoot, ["first-run", "--root", root, "--json"]);
      assert.equal(cli.status, 0, cli.stderr);
      const payload = JSON.parse(cli.stdout) as FirstRunResult;
      assert.equal(payload.classification, "active_change_session");
      assert.equal(payload.state.activeChangeSession?.id, "change-123");
      assert.equal(payload.boundaries.llmBlockingGate, false);
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

function withTempRoot(prefix: string, run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeText(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function writeJson(root: string, relativePath: string, content: unknown): void {
  writeText(root, relativePath, JSON.stringify(content, null, 2));
}

function runCli(repoRoot: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", path.join(repoRoot, "tools", "jispec", "cli.ts"), ...args], {
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
