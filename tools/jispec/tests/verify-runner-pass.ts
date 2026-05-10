import assert from "node:assert/strict";
import { buildExecutionForkGovernanceRecord } from "../kernel/execution-fork";
import { buildKtmRuntimeRecord } from "../kernel/ktm";
import { writeExecutionForkGovernanceArtifact } from "../kernel/execution-fork";
import { writeKtmRuntimeArtifact } from "../kernel/ktm";
import { renderVerifyText, runVerify } from "../verify/verify-runner";
import { FIXED_GENERATED_AT, cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";
import { writeChangeSession, type ChangeSession } from "../change/change-session";

async function main(): Promise<void> {
  console.log("=== Verify Runner PASS Tests ===\n");

  let passed = 0;
  let failed = 0;
  const fixtureRoot = createVerifyFixture("verify-pass");

  try {
    const session: ChangeSession = {
      id: "change-verify-fork",
      createdAt: FIXED_GENERATED_AT,
      summary: "Verify execution fork metadata",
      laneDecision: {
        lane: "strict",
        reasons: ["governed scope"],
        autoPromoted: false,
      },
      changedPaths: [{ path: "src/index.ts", kind: "domain_core" }],
      baseRef: "HEAD",
      nextCommands: [{ command: "npm run verify", description: "Run full verify" }],
    };
    writeChangeSession(fixtureRoot, session);

    const executionFork = buildExecutionForkGovernanceRecord({
      sessionId: "change-verify-fork",
      changeId: "change-verify-fork",
      createdAt: FIXED_GENERATED_AT,
      sessionSource: "active",
      testCommand: "npm test",
      implementationCommand: "npm run jispec-cli -- implement --session-id change-verify-fork",
      outcome: "budget_exhausted",
      testsPassed: false,
    });
    const ktmRuntime = buildKtmRuntimeRecord({
      sessionId: "change-verify-fork",
      changeId: "change-verify-fork",
      createdAt: FIXED_GENERATED_AT,
      sessionSource: "active",
      changeSummary: "Verify execution fork metadata",
      lane: "strict",
      outcome: "preflight_passed",
      testsPassed: true,
      decisionState: "ready_to_merge",
      decisionStopPoint: "post_verify",
      decisionSummary: "Preflight tests already pass; no patch was applied by JiSpec.",
      decisionOwner: "reviewer",
      decisionNextAction: "Review and merge according to your normal workflow.",
      executionFork,
      facts: {
        changeId: "change-verify-fork",
        outcome: "preflight_passed",
      },
      policy: {
        singleWriteAuthority: true,
        deterministicTransition: true,
      },
      postVerify: {
        command: "npm run verify",
        ok: true,
        verdict: "PASS",
      },
    });
    writeExecutionForkGovernanceArtifact(fixtureRoot, executionFork);
    writeKtmRuntimeArtifact(fixtureRoot, ktmRuntime);

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
    const executionForkSummary = result.metadata?.executionFork as { canonicalTraceSummary?: string } | undefined;
    const ktmRuntimeSummary = result.metadata?.ktmRuntime as { toStatus?: string; decision?: string } | undefined;
    assert.ok(executionForkSummary);
    assert.equal(executionForkSummary?.canonicalTraceSummary, "session:direct_session -> implementation:iterative_mediation");
    assert.ok(ktmRuntimeSummary);
    assert.equal(ktmRuntimeSummary?.decision, "approve");
    assert.equal(ktmRuntimeSummary?.toStatus, "committed");
    console.log("✓ Test 2: PASS results keep zero-count statistics and stable metadata");
    passed++;

    const text = renderVerifyText(result);
    assert.ok(text.includes("JiSpec verify verdict: PASS"));
    assert.ok(text.includes("Summary: 0 total | 0 blocking | 0 advisory | 0 non-blocking errors"));
    assert.ok(text.includes("Change ID: change-verify-fork"));
    assert.ok(text.includes("Execution fork:"));
    assert.ok(text.includes("Canonical trace:"));
    assert.ok(text.includes("KTM runtime:"));
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
