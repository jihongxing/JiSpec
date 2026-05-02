import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { renderVerifyJSON, runVerify } from "../verify/verify-runner";
import { FIXED_GENERATED_AT, cleanupVerifyFixture, createVerifyFixture, getRepoRoot } from "./verify-test-helpers";

async function main(): Promise<void> {
  console.log("=== Verify JSON Contract Tests ===\n");

  let passed = 0;
  let failed = 0;
  const root = createVerifyFixture("verify-json-contract");

  try {
    const result = await runVerify({
      root,
      generatedAt: FIXED_GENERATED_AT,
    });
    const json = renderVerifyJSON(result);

    const expected = JSON.stringify(
      {
        root,
        verdict: "PASS",
        ok: true,
        exit_code: 0,
        issue_count: 0,
        blocking_issue_count: 0,
        advisory_issue_count: 0,
        non_blocking_error_count: 0,
        sources: ["legacy-validator"],
        generated_at: FIXED_GENERATED_AT,
        issues: [],
        metadata: {
          factsContractVersion: "1.0",
          replay: {
            commands: {
              inspectSummary: "type .spec\\handoffs\\verify-summary.md",
              rerun: "npm run jispec-cli -- verify",
            },
            inputArtifacts: [],
            nextHumanAction: "Review verify summary and continue with merge or advisory follow-up.",
            previousOutcome: "PASS",
            replayable: true,
            source: "verify",
            sourceArtifact: ".spec/contracts",
            version: 1,
          },
        },
      },
      null,
      2,
    );

    assert.equal(json, expected);
    console.log("✓ Test 1: PASS JSON output matches the stable contract snapshot");
    passed++;

    const parsed = JSON.parse(json) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsed), [
      "root",
      "verdict",
      "ok",
      "exit_code",
      "issue_count",
      "blocking_issue_count",
      "advisory_issue_count",
      "non_blocking_error_count",
      "sources",
      "generated_at",
      "issues",
      "metadata",
    ]);
    assert.equal((parsed.metadata as { replay?: { source?: string } }).replay?.source, "verify");
    console.log("✓ Test 2: top-level JSON keys stay in the expected order");
    passed++;

    const repoRoot = getRepoRoot();
    const cli = spawnSync(
      process.execPath,
      ["--import", "tsx", path.join(repoRoot, "tools", "jispec", "cli.ts"), "verify", "--root", root, "--json"],
      {
        cwd: repoRoot,
        encoding: "utf-8",
      },
    );
    assert.equal(cli.status, 0);
    const cliPayload = JSON.parse(cli.stdout) as Record<string, unknown>;
    assert.equal(cliPayload.verdict, "PASS");
    const summaryPath = path.join(root, ".spec", "handoffs", "verify-summary.md");
    assert.ok(fs.existsSync(summaryPath));
    const summary = fs.readFileSync(summaryPath, "utf-8");
    assert.ok(summary.includes("# JiSpec Verify Summary"));
    assert.ok(summary.includes("Merge status: Ready to merge."));
    assert.ok(summary.includes("Machine-readable verify report remains the source of truth."));
    console.log("✓ Test 3: CLI verify --json keeps stdout machine-readable while writing the local verify summary");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(root);
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
