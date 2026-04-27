import assert from "node:assert/strict";
import { runVerify, type VerifySupplementalCollector } from "../verify/verify-runner";
import { FIXED_GENERATED_AT, cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

async function main(): Promise<void> {
  console.log("=== Verify Runner ERROR_NONBLOCKING Tests ===\n");

  let passed = 0;
  let failed = 0;
  const fixtureRoot = createVerifyFixture("verify-runtime-soft-fail");

  const failingCollector: VerifySupplementalCollector = {
    source: "test-runtime",
    async collect() {
      throw new Error("simulated collector failure");
    },
  };

  try {
    const result = await runVerify({
      root: fixtureRoot,
      generatedAt: FIXED_GENERATED_AT,
      supplementalCollectors: [failingCollector],
    });

    assert.equal(result.verdict, "ERROR_NONBLOCKING");
    assert.equal(result.ok, true);
    console.log("✓ Test 1: supplemental collector failures map to ERROR_NONBLOCKING");
    passed++;

    assert.equal(result.exitCode, 0);
    assert.equal(result.issueCount, 1);
    assert.equal(result.nonBlockingErrorCount, 1);
    assert.deepEqual(result.sources, ["legacy-validator", "test-runtime"]);
    console.log("✓ Test 2: ERROR_NONBLOCKING stays soft for CLI and CI exit semantics");
    passed++;

    assert.equal(result.issues[0]?.kind, "runtime_error");
    assert.equal(result.issues[0]?.severity, "nonblocking_error");
    assert.equal(result.issues[0]?.code, "VERIFY_RUNTIME_ERROR");
    assert.equal(result.issues[0]?.path, "test-runtime");
    assert.ok(result.issues[0]?.message.includes("simulated collector failure"));
    console.log("✓ Test 3: runtime failures are normalized into stable verify issues");
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
