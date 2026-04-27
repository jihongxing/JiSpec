import assert from "node:assert/strict";
import { computeIssueFingerprint } from "../verify/issue-fingerprint";
import { createWaiver } from "../verify/waiver-store";
import { renderVerifyJSON, runVerify, type VerifySupplementalCollector } from "../verify/verify-runner";
import { writeVerifyBaseline } from "../verify/baseline-store";
import { cleanupVerifyFixture, createVerifyFixture, FIXED_GENERATED_AT } from "./verify-test-helpers";

async function main(): Promise<void> {
  console.log("=== Verify Mitigation Stacking Tests ===\n");

  let passed = 0;
  let failed = 0;
  const fixtureRoot = createVerifyFixture("verify-mitigation-stacking");

  const baselineIssue = {
    kind: "missing_file" as const,
    severity: "blocking" as const,
    code: "DOMAIN_CONTRACT_SECTION_MISSING",
    path: ".spec/contracts/domain.yaml",
    message: "Domain contract is missing its domain section.",
  };
  const waiverIssue = {
    kind: "schema" as const,
    severity: "blocking" as const,
    code: "API_CONTRACT_ENDPOINTS_MISSING",
    path: ".spec/contracts/api_spec.json",
    message: "API contract must contain at least one endpoint for verify to gate deterministically.",
  };
  const observeIssue = {
    kind: "trace" as const,
    severity: "blocking" as const,
    code: "TRACE_FILE_MISSING",
    path: "contexts/ordering/slices/ordering-checkout-v1/trace.yaml",
    message: "Trace file is missing.",
  };

  const seedCollector: VerifySupplementalCollector = {
    source: "stacking-seed",
    async collect() {
      return [baselineIssue];
    },
  };

  const finalCollector: VerifySupplementalCollector = {
    source: "stacking-final",
    async collect() {
      return [baselineIssue, waiverIssue, observeIssue];
    },
  };

  try {
    const seedResult = await runVerify({
      root: fixtureRoot,
      generatedAt: FIXED_GENERATED_AT,
      applyWaivers: false,
      supplementalCollectors: [seedCollector],
    });
    writeVerifyBaseline(fixtureRoot, seedResult);
    createWaiver(fixtureRoot, {
      fingerprint: computeIssueFingerprint(waiverIssue),
      owner: "platform-team",
      reason: "Temporary waiver while API draft is normalized",
    });

    const result = await runVerify({
      root: fixtureRoot,
      generatedAt: FIXED_GENERATED_AT,
      useBaseline: true,
      observe: true,
      supplementalCollectors: [finalCollector],
    });

    assert.equal(result.verdict, "WARN_ADVISORY");
    assert.equal(result.blockingIssueCount, 0);
    assert.equal(result.advisoryIssueCount, 3);
    const baselineMatch = result.issues.find((issue) => issue.code === baselineIssue.code);
    const waiverMatch = result.issues.find((issue) => issue.code === waiverIssue.code);
    const observeMatch = result.issues.find((issue) => issue.code === observeIssue.code);
    assert.equal((baselineMatch?.details as Record<string, unknown>)?.matched_by, "baseline");
    assert.equal((waiverMatch?.details as Record<string, unknown>)?.matched_by, "waiver");
    assert.equal((observeMatch?.details as Record<string, unknown>)?.matched_by, "observe");
    assert.equal(result.metadata?.baselineMatchCount, 1);
    assert.equal(result.metadata?.waiversApplied, 1);
    assert.equal(result.metadata?.observeBlockingDowngraded, 1);
    console.log("✓ Test 1: baseline, waiver, and observe stack predictably with distinct annotations");
    passed++;

    const payload = JSON.parse(renderVerifyJSON(result)) as Record<string, unknown>;
    const metadata = payload.metadata as Record<string, unknown>;
    assert.equal(metadata.baselineApplied, true);
    assert.equal(metadata.waiversApplied, 1);
    assert.equal(metadata.observeMode, true);
    assert.equal(metadata.originalVerdict, "FAIL_BLOCKING");
    console.log("✓ Test 2: verify JSON keeps mitigation metadata stable when all three layers are active");
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
