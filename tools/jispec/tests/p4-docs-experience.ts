import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getRepoRoot } from "./verify-test-helpers";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== P4 Documentation Experience Tests ===\n");

  const repoRoot = getRepoRoot();
  const docs = {
    quickstart: readDoc(repoRoot, "quickstart.md"),
    takeover: readDoc(repoRoot, "takeover-guide.md"),
    execute: readDoc(repoRoot, "execute-default-guide.md"),
    console: readDoc(repoRoot, "console-governance-guide.md"),
    cookbook: readDoc(repoRoot, "policy-waiver-spec-debt-cookbook.md"),
  };

  const results: TestResult[] = [];

  runCase(results, "quickstart answers the first three commands and routes users to next guides", () => {
    assert.match(docs.quickstart, /Run These Three Commands/);
    assert.match(docs.quickstart, /npm install/);
    assert.match(docs.quickstart, /doctor mainline/);
    assert.match(docs.quickstart, /bootstrap discover/);
    assert.match(docs.quickstart, /docs\/takeover-guide\.md/);
    assert.match(docs.quickstart, /docs\/console-governance-guide\.md/);
  });

  runCase(results, "takeover guide explains accept, edit, defer, and reject decisions", () => {
    assert.match(docs.takeover, /Use `accept`/);
    assert.match(docs.takeover, /Use `edit`/);
    assert.match(docs.takeover, /Use `defer`/);
    assert.match(docs.takeover, /Use `reject`/);
    assert.match(docs.takeover, /spec debt/i);
    assert.match(docs.takeover, /verify` remains the deterministic local gate/);
  });

  runCase(results, "execute guide keeps implementation ownership outside JiSpec", () => {
    assert.match(docs.execute, /does not turn JiSpec into an autonomous business-code generator/);
    assert.match(docs.execute, /external coding tools still own business-code implementation/i);
    assert.match(docs.execute, /implement --external-patch/);
    assert.match(docs.execute, /--from-handoff/);
    assert.match(docs.execute, /verify_blocked/);
  });

  runCase(results, "console guide states governance boundaries and local gate authority", () => {
    assert.match(docs.console, /not a replacement for `verify`, `ci:verify`, or the local policy gate/);
    assert.match(docs.console, /console dashboard/);
    assert.match(docs.console, /console actions/);
    assert.match(docs.console, /console export-governance/);
    assert.match(docs.console, /does not upload source code/);
  });

  runCase(results, "cookbook covers policy, waiver, spec debt, release compare, and console actions", () => {
    assert.match(docs.cookbook, /policy migrate/);
    assert.match(docs.cookbook, /waiver create/);
    assert.match(docs.cookbook, /waiver renew/);
    assert.match(docs.cookbook, /spec-debt repay/);
    assert.match(docs.cookbook, /spec-debt owner-review/);
    assert.match(docs.cookbook, /release snapshot/);
    assert.match(docs.cookbook, /release compare/);
    assert.match(docs.cookbook, /console actions/);
  });

  runCase(results, "documented command surfaces are still present in CLI help", () => {
    assertHelpIncludes(repoRoot, ["change", "--help"], ["default-mode", "--mode <mode>", "--test-command <cmd>"]);
    assertHelpIncludes(repoRoot, ["implement", "--help"], ["--external-patch <path>", "--from-handoff <path-or-session>"]);
    assertHelpIncludes(repoRoot, ["console", "--help"], ["dashboard", "actions", "export-governance"]);
    assertHelpIncludes(repoRoot, ["spec-debt", "--help"], ["repay", "cancel", "owner-review"]);
    assertHelpIncludes(repoRoot, ["waiver", "--help"], ["create", "renew", "revoke"]);
    assertHelpIncludes(repoRoot, ["release", "--help"], ["snapshot", "compare"]);
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

function readDoc(repoRoot: string, fileName: string): string {
  return fs.readFileSync(path.join(repoRoot, "docs", fileName), "utf-8");
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

function assertHelpIncludes(repoRoot: string, args: string[], snippets: string[]): void {
  const result = spawnSync(process.execPath, ["--import", "tsx", path.join(repoRoot, "tools", "jispec", "cli.ts"), ...args], {
    cwd: repoRoot,
    encoding: "utf-8",
  });

  assert.equal(result.status, 0, result.stderr);
  for (const snippet of snippets) {
    assert.ok(
      result.stdout.includes(snippet),
      `Expected help for '${args.join(" ")}' to include '${snippet}'. Output:\n${result.stdout}`,
    );
  }
}

main();
