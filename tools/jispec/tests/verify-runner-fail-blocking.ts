import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runVerify } from "../verify/verify-runner";
import { FIXED_GENERATED_AT, cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

async function main(): Promise<void> {
  console.log("=== Verify Runner FAIL_BLOCKING Tests ===\n");

  let passed = 0;
  let failed = 0;
  const fixtureRoot = createVerifyFixture("verify-fail-blocking");

  try {
    fs.rmSync(
      path.join(fixtureRoot, "contexts", "ordering", "slices", "ordering-checkout-v1", "evidence.md"),
      { force: true },
    );

    const result = await runVerify({
      root: fixtureRoot,
      generatedAt: FIXED_GENERATED_AT,
    });

    assert.equal(result.verdict, "FAIL_BLOCKING");
    assert.equal(result.ok, false);
    console.log("✓ Test 1: missing required slice artifacts produce FAIL_BLOCKING");
    passed++;

    assert.equal(result.exitCode, 1);
    assert.ok(result.blockingIssueCount > 0);
    assert.equal(result.advisoryIssueCount, 0);
    assert.equal(result.nonBlockingErrorCount, 0);
    console.log("✓ Test 2: FAIL_BLOCKING keeps a blocking-only exit contract");
    passed++;

    assert.ok(
      result.issues.some(
        (issue) =>
          issue.code === "SLICE_ARTIFACT_MISSING" &&
          issue.kind === "missing_file" &&
          issue.severity === "blocking",
      ),
    );
    console.log("✓ Test 3: legacy validator issues are mapped into blocking verify issues");
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
