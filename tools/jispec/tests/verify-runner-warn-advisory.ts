import assert from "node:assert/strict";
import { runVerify, type VerifySupplementalCollector } from "../verify/verify-runner";
import { FIXED_GENERATED_AT, cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

async function main(): Promise<void> {
  console.log("=== Verify Runner WARN_ADVISORY Tests ===\n");

  let passed = 0;
  let failed = 0;
  const fixtureRoot = createVerifyFixture("verify-warn-advisory");

  const advisoryCollector: VerifySupplementalCollector = {
    source: "test-advisory",
    async collect() {
      return [
        {
          kind: "unsupported",
          severity: "advisory",
          code: "UNSUPPORTED_ANALYZER",
          path: "contexts/catalog",
          message: "Analyzer coverage for this asset family is not available yet.",
        },
      ];
    },
  };

  try {
    const result = await runVerify({
      root: fixtureRoot,
      generatedAt: FIXED_GENERATED_AT,
      supplementalCollectors: [advisoryCollector],
    });

    assert.equal(result.verdict, "WARN_ADVISORY");
    assert.equal(result.ok, true);
    console.log("✓ Test 1: advisory-only issues map to WARN_ADVISORY");
    passed++;

    assert.equal(result.exitCode, 0);
    assert.equal(result.issueCount, 1);
    assert.equal(result.advisoryIssueCount, 1);
    assert.deepEqual(result.sources, ["legacy-validator", "test-advisory"]);
    console.log("✓ Test 2: WARN_ADVISORY preserves a non-blocking exit code and source list");
    passed++;

    assert.deepEqual(result.issues[0], {
      kind: "unsupported",
      severity: "advisory",
      code: "UNSUPPORTED_ANALYZER",
      path: "contexts/catalog",
      message: "Analyzer coverage for this asset family is not available yet.",
    });
    console.log("✓ Test 3: advisory issues survive the runner without reclassification");
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
