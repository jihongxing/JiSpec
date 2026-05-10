import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildExecutionForkGovernanceRecord, writeExecutionForkGovernanceArtifact } from "../kernel/execution-fork";
import { buildKtmRuntimeRecord, writeKtmRuntimeArtifact } from "../kernel/ktm";
import { renderVerifyText, runVerify } from "../verify/verify-runner";
import { cleanupVerifyFixture, createVerifyFixture, FIXED_GENERATED_AT } from "./verify-test-helpers";
import { writeChangeSession, type ChangeSession } from "../change/change-session";

async function main(): Promise<void> {
  console.log("=== Verify Kernel Surface Tests ===\n");

  let passed = 0;
  let failed = 0;

  const passFixture = createVerifyFixture("verify-kernel-surface-pass");
  try {
    const sessionId = "change-kernel-surface-pass";
    writeChangeSession(passFixture, buildSession(sessionId));

    const executionFork = buildExecutionForkGovernanceRecord({
      sessionId,
      changeId: sessionId,
      createdAt: FIXED_GENERATED_AT,
      sessionSource: "active",
      testCommand: "npm test",
      implementationCommand: `npm run jispec-cli -- implement --session-id ${sessionId}`,
      outcome: "budget_exhausted",
      testsPassed: false,
    });
    const ktmRuntime = buildKtmRuntimeRecord({
      sessionId,
      changeId: sessionId,
      createdAt: FIXED_GENERATED_AT,
      sessionSource: "active",
      changeSummary: "Kernel-backed verify surface",
      lane: "strict",
      outcome: "budget_exhausted",
      testsPassed: true,
      decisionState: "ready_to_merge",
      decisionStopPoint: "post_verify",
      decisionSummary: "Kernel runtime committed from disk-backed artifacts.",
      decisionOwner: "reviewer",
      decisionNextAction: "Review and merge according to your normal workflow.",
      executionFork,
      facts: {
        changeId: sessionId,
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

    const executionForkArtifactPath = writeExecutionForkGovernanceArtifact(passFixture, executionFork);
    const kernelLogPath = writeKtmRuntimeArtifact(passFixture, ktmRuntime);
    assert.ok(fs.existsSync(executionForkArtifactPath));
    assert.ok(fs.existsSync(kernelLogPath));

    const result = await runVerify({
      root: passFixture,
      generatedAt: FIXED_GENERATED_AT,
    });

    assert.equal(result.verdict, "PASS");
    assert.equal(result.ok, true);
    const executionForkSummary = result.metadata?.executionFork as { canonicalTraceSummary?: string } | undefined;
    const ktmRuntimeSummary = result.metadata?.ktmRuntime as { decision?: string; toStatus?: string } | undefined;
    const replay = result.metadata?.replay as { inputArtifacts?: string[] } | undefined;
    assert.equal(executionForkSummary?.canonicalTraceSummary, "session:direct_session -> implementation:iterative_mediation");
    assert.equal(ktmRuntimeSummary?.decision, "approve");
    assert.equal(ktmRuntimeSummary?.toStatus, "committed");
    assert.ok(replay?.inputArtifacts?.includes(".jispec/implement/change-kernel-surface-pass/execution-fork.json"));
    assert.ok(replay?.inputArtifacts?.includes(".jispec/kernel-runtime/change-kernel-surface-pass/kernel-log.json"));
    assert.ok(replay?.inputArtifacts?.includes(".jispec/kernel-runtime/change-kernel-surface-pass/state-snapshot.json"));
    assert.ok(renderVerifyText(result).includes("KTM runtime:"));
    console.log("✓ Test 1: verify loads execution fork and KTM runtime from kernel artifacts");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(passFixture);
  }

  const missingFixture = createVerifyFixture("verify-kernel-surface-missing-log");
  try {
    const sessionId = "change-kernel-surface-missing";
    writeChangeSession(missingFixture, buildSession(sessionId));

    const executionFork = buildExecutionForkGovernanceRecord({
      sessionId,
      changeId: sessionId,
      createdAt: FIXED_GENERATED_AT,
      sessionSource: "active",
      testCommand: "npm test",
      implementationCommand: `npm run jispec-cli -- implement --session-id ${sessionId}`,
      outcome: "budget_exhausted",
      testsPassed: false,
    });
    const ktmRuntime = buildKtmRuntimeRecord({
      sessionId,
      changeId: sessionId,
      createdAt: FIXED_GENERATED_AT,
      sessionSource: "active",
      changeSummary: "Missing kernel-log regression",
      lane: "strict",
      outcome: "budget_exhausted",
      testsPassed: true,
      decisionState: "ready_to_merge",
      decisionStopPoint: "post_verify",
      decisionSummary: "State snapshot is present, but kernel log is missing.",
      decisionOwner: "reviewer",
      decisionNextAction: "Review and merge according to your normal workflow.",
      executionFork,
      facts: {
        changeId: sessionId,
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

    writeExecutionForkGovernanceArtifact(missingFixture, executionFork);
    writeKtmRuntimeArtifact(missingFixture, ktmRuntime);
    fs.rmSync(path.join(missingFixture, ".jispec", "kernel-runtime", sessionId, "kernel-log.json"), { force: true });

    const result = await runVerify({
      root: missingFixture,
      generatedAt: FIXED_GENERATED_AT,
    });

    assert.equal(result.verdict, "FAIL_BLOCKING");
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === "KERNEL_RUNTIME_KERNEL_LOG_MISSING"));
    assert.ok(result.issues.some((issue) => issue.path?.includes("kernel-log.json")));
    console.log("✓ Test 2: missing kernel-log fails verify with a blocking kernel lineage issue");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(missingFixture);
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

function buildSession(id: string): ChangeSession {
  return {
    id,
    createdAt: FIXED_GENERATED_AT,
    changeId: id,
    summary: `Change ${id}`,
    laneDecision: {
      lane: "strict",
      reasons: ["kernel surface test"],
      autoPromoted: false,
    },
    changedPaths: [{ path: "src/index.ts", kind: "domain_core" }],
    nextCommands: [{ command: "npm run verify", description: "Run verify" }],
  };
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
