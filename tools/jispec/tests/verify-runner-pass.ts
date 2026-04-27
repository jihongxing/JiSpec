import assert from "node:assert/strict";
import { renderVerifyText, runVerify } from "../verify/verify-runner";
import { FIXED_GENERATED_AT, cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

async function main(): Promise<void> {
  console.log("=== Verify Runner PASS Tests ===\n");

  let passed = 0;
  let failed = 0;
  const fixtureRoot = createVerifyFixture("verify-pass");

  try {
    const result = await runVerify({
      root: fixtureRoot,
      generatedAt: FIXED_GENERATED_AT,
    });

    assert.equal(result.verdict, "PASS");
    assert.equal(result.ok, true);
    console.log("✓ Test 1: runVerify returns PASS for the sample repository");
    passed++;

    assert.equal(result.exitCode, 0);
    assert.equal(result.issueCount, 0);
    assert.deepEqual(result.sources, ["legacy-validator"]);
    assert.equal(result.generatedAt, FIXED_GENERATED_AT);
    console.log("✓ Test 2: PASS results keep zero-count statistics and stable metadata");
    passed++;

    const text = renderVerifyText(result);
    assert.ok(text.includes("JiSpec verify verdict: PASS"));
    assert.ok(text.includes("Summary: 0 total | 0 blocking | 0 advisory | 0 non-blocking errors"));
    assert.ok(text.includes("No issues found."));
    console.log("✓ Test 3: text renderer exposes the verdict and count summary");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(fixtureRoot);
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
