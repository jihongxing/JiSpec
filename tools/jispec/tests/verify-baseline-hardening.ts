import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { renderVerifyJSON, runVerify, type VerifySupplementalCollector } from "../verify/verify-runner";
import { loadVerifyBaseline, writeVerifyBaseline } from "../verify/baseline-store";
import { cleanupVerifyFixture, createVerifyFixture, FIXED_GENERATED_AT } from "./verify-test-helpers";

async function main(): Promise<void> {
  console.log("=== Verify Baseline Hardening Tests ===\n");

  let passed = 0;
  let failed = 0;
  const fixtureRoot = createVerifyFixture("verify-baseline-hardening");

  const initialCollector: VerifySupplementalCollector = {
    source: "baseline-seed",
    async collect() {
      return [
        {
          kind: "missing_file",
          severity: "blocking",
          code: "MISSING_ADOPTED_CONTRACT",
          path: ".spec/contracts/domain.yaml",
          message: "Adopted domain contract is missing.",
        },
        {
          kind: "unsupported",
          severity: "advisory",
          code: "ANALYZER_NOT_AVAILABLE",
          path: "contexts/catalog",
          message: "Catalog analyzer is not available yet.",
        },
      ];
    },
  };

  const followupCollector: VerifySupplementalCollector = {
    source: "baseline-followup",
    async collect() {
      return [
        {
          kind: "missing_file",
          severity: "blocking",
          code: "MISSING_ADOPTED_CONTRACT",
          path: ".spec/contracts/domain.yaml",
          message: "Adopted domain contract is missing.",
        },
        {
          kind: "schema",
          severity: "blocking",
          code: "API_CONTRACT_INVALID_JSON",
          path: ".spec/contracts/api_spec.json",
          message: "API contract is not valid JSON.",
        },
      ];
    },
  };

  try {
    const seedResult = await runVerify({
      root: fixtureRoot,
      generatedAt: FIXED_GENERATED_AT,
      supplementalCollectors: [initialCollector],
    });
    const baselinePath = writeVerifyBaseline(fixtureRoot, seedResult);
    const baseline = loadVerifyBaseline(fixtureRoot);

    assert.equal(path.relative(fixtureRoot, baselinePath).replace(/\\/g, "/"), ".spec/baselines/verify-baseline.json");
    assert.ok(baseline);
    assert.equal(baseline?.entries.length, 1);
    assert.equal(baseline?.entries[0]?.code, "MISSING_ADOPTED_CONTRACT");
    console.log("✓ Test 1: baseline writes to the hardened path and records only blocking issues");
    passed++;

    const result = await runVerify({
      root: fixtureRoot,
      generatedAt: FIXED_GENERATED_AT,
      useBaseline: true,
      supplementalCollectors: [followupCollector],
    });

    assert.equal(result.verdict, "FAIL_BLOCKING");
    assert.equal(result.blockingIssueCount, 1);
    assert.equal(result.advisoryIssueCount, 1);
    const baselinedIssue = result.issues.find((issue) => issue.code === "MISSING_ADOPTED_CONTRACT");
    assert.ok(baselinedIssue);
    assert.equal(baselinedIssue?.severity, "advisory");
    assert.equal(baselinedIssue?.message, "Adopted domain contract is missing.");
    assert.equal((baselinedIssue?.details as Record<string, unknown>)?.matched_by, "baseline");
    assert.equal(result.metadata?.baselineApplied, true);
    assert.equal(result.metadata?.baselineMatchCount, 1);
    console.log("✓ Test 2: baseline downgrades only matched historical blocking issues and leaves new blockers intact");
    passed++;

    const payload = JSON.parse(renderVerifyJSON(result)) as Record<string, unknown>;
    assert.ok(typeof payload.metadata === "object" && payload.metadata !== null);
    assert.equal((payload.metadata as Record<string, unknown>).baselineMatchCount, 1);
    console.log("✓ Test 3: verify JSON contract exposes baseline metadata without changing issue identity");
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
