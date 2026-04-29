import assert from "node:assert/strict";
import { computeIssueFingerprint } from "../verify/issue-fingerprint";
import { createWaiver, loadActiveWaivers, revokeWaiver, summarizeWaiverLifecycle } from "../verify/waiver-store";
import { runVerify, type VerifySupplementalCollector } from "../verify/verify-runner";
import { cleanupVerifyFixture, createVerifyFixture, FIXED_GENERATED_AT } from "./verify-test-helpers";

async function main(): Promise<void> {
  console.log("=== Verify Waiver Hardening Tests ===\n");

  let passed = 0;
  let failed = 0;
  const fixtureRoot = createVerifyFixture("verify-waiver-hardening");

  const waivedIssue = {
    kind: "schema" as const,
    severity: "blocking" as const,
    code: "API_CONTRACT_INVALID_JSON",
    path: ".spec/contracts/api_spec.json",
    message: "API contract is not valid JSON.",
  };

  const collector: VerifySupplementalCollector = {
    source: "waiver-hardening",
    async collect() {
      return [
        waivedIssue,
        {
          kind: "missing_file",
          severity: "blocking",
          code: "FEATURE_CONTRACT_SCENARIOS_MISSING",
          path: ".spec/contracts/behaviors.feature",
          message: "Behavior contract must contain at least one Scenario to remain reviewable in verify.",
        },
      ];
    },
  };

  try {
    assert.throws(
      () => createWaiver(fixtureRoot, { code: "X", owner: "", reason: "missing owner" }),
      /owner is required/i,
    );
    assert.throws(
      () => createWaiver(fixtureRoot, { code: "X", owner: "team", reason: "ok", expiresAt: "not-a-date" }),
      /not a valid ISO timestamp/i,
    );
    console.log("✓ Test 1: waiver creation validates required owner and expiration format");
    passed++;

    const expired = createWaiver(fixtureRoot, {
      code: "FEATURE_CONTRACT_SCENARIOS_MISSING",
      path: ".spec/contracts/behaviors.feature",
      owner: "contracts-team",
      reason: "expired test waiver",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    const fingerprintWaiver = createWaiver(fixtureRoot, {
      fingerprint: computeIssueFingerprint(waivedIssue),
      owner: "contracts-team",
      reason: "Known malformed bootstrap API draft during migration",
    });
    const staleWaiver = createWaiver(fixtureRoot, {
      code: "STALE_WAIVER",
      owner: "contracts-team",
      reason: "No current issue should match this waiver",
    });

    const activeWaivers = loadActiveWaivers(fixtureRoot, new Date("2026-04-27T00:00:00.000Z"));
    assert.equal(activeWaivers.length, 2);
    assert.deepEqual(activeWaivers.map((waiver) => waiver.id).sort(), [fingerprintWaiver.waiver.id, staleWaiver.waiver.id].sort());
    assert.notEqual(expired.waiver.id, fingerprintWaiver.waiver.id);
    const lifecycle = summarizeWaiverLifecycle(fixtureRoot, new Date("2026-04-27T00:00:00.000Z"));
    assert.equal(lifecycle.active, 2);
    assert.equal(lifecycle.expired, 1);
    console.log("✓ Test 2: active waiver loading filters out expired waiver files and reports lifecycle counts");
    passed++;

    const result = await runVerify({
      root: fixtureRoot,
      generatedAt: FIXED_GENERATED_AT,
      supplementalCollectors: [collector],
    });

    assert.equal(result.verdict, "FAIL_BLOCKING");
    const downgraded = result.issues.find((issue) => issue.code === "API_CONTRACT_INVALID_JSON");
    const remaining = result.issues.find((issue) => issue.code === "FEATURE_CONTRACT_SCENARIOS_MISSING");
    assert.ok(downgraded);
    assert.equal(downgraded?.severity, "advisory");
    assert.equal(downgraded?.message, waivedIssue.message);
    assert.equal((downgraded?.details as Record<string, unknown>)?.matched_by, "waiver");
    assert.equal((downgraded?.details as Record<string, unknown>)?.waiver_id, fingerprintWaiver.waiver.id);
    assert.equal((downgraded?.details as Record<string, unknown>)?.waiver_matcher, "fingerprint");
    assert.equal(remaining?.severity, "blocking");
    assert.equal(result.metadata?.waiversApplied, 1);
    assert.deepEqual(result.metadata?.unmatchedActiveWaiverIds, [staleWaiver.waiver.id]);
    assert.equal((result.metadata?.waiverLifecycle as Record<string, unknown>)?.active, 2);
    console.log("✓ Test 3: fingerprint waivers downgrade only matching issues and preserve unmatched blockers");
    passed++;

    const revoked = revokeWaiver(fixtureRoot, fingerprintWaiver.waiver.id, {
      revokedBy: "contracts-team",
      reason: "Contract was repaired",
    });
    assert.equal(revoked.waiver.status, "revoked");
    assert.equal(loadActiveWaivers(fixtureRoot, new Date("2026-04-27T00:00:00.000Z")).some((waiver) => waiver.id === fingerprintWaiver.waiver.id), false);
    const afterRevoke = summarizeWaiverLifecycle(fixtureRoot, new Date("2026-04-27T00:00:00.000Z"));
    assert.equal(afterRevoke.revoked, 1);
    console.log("✓ Test 4: revoked waivers are retained for audit but excluded from active matching");
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
