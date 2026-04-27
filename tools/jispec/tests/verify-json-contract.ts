import assert from "node:assert/strict";
import { renderVerifyJSON, runVerify } from "../verify/verify-runner";
import { FIXED_GENERATED_AT, cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

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
    console.log("✓ Test 2: top-level JSON keys stay in the expected order");
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
