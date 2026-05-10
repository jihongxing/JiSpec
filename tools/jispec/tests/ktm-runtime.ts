import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildKtmRuntimeRecord,
  summarizeKtmRuntimeRecord,
  writeKtmRuntimeArtifact,
} from "../kernel/ktm";
import { cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

async function main(): Promise<void> {
  console.log("=== KTM Runtime Tests ===\n");

  let passed = 0;
  let failed = 0;
  const fixtureRoot = createVerifyFixture("ktm-runtime");

  try {
    const input = {
      sessionId: "change-ktm-1",
      changeId: "change-ktm-1",
      createdAt: "2026-05-10T00:00:00.000Z",
      sessionSource: "active" as const,
      changeSummary: "Commit deterministic runtime state",
      lane: "strict" as const,
      outcome: "patch_verified",
      testsPassed: true,
      decisionState: "ready_to_merge",
      decisionStopPoint: "post_verify",
      decisionSummary: "External patch was scoped, applied, tested, and verified.",
      decisionOwner: "reviewer",
      decisionNextAction: "Review and merge according to your normal workflow.",
      facts: {
        changeId: "change-ktm-1",
        outcome: "patch_verified",
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
    };

    const first = buildKtmRuntimeRecord(input);
    const second = buildKtmRuntimeRecord(input);

    assert.equal(first.id, second.id);
    assert.equal(first.transition.id, second.transition.id);
    assert.equal(first.inputFingerprint, second.inputFingerprint);
    assert.equal(first.outputFingerprint, second.outputFingerprint);
    assert.equal(first.transition.decision, "approve");
    assert.equal(first.transition.toState.status, "committed");
    assert.equal(first.transition.committed, true);

    const artifactPath = writeKtmRuntimeArtifact(fixtureRoot, first);
    const runtimeDir = path.join(fixtureRoot, ".jispec", "kernel-runtime", "change-ktm-1");
    assert.ok(fs.existsSync(artifactPath));
    assert.ok(fs.existsSync(path.join(runtimeDir, "state-snapshot.json")));
    assert.ok(fs.existsSync(path.join(runtimeDir, "kernel-runtime.md")));

    const summary = summarizeKtmRuntimeRecord(first);
    assert.equal(summary.transitionId, first.transition.id);
    assert.equal(summary.decision, "approve");
    assert.equal(summary.committed, true);
    assert.equal(summary.toStatus, "committed");
    console.log("✓ Test 1: KTM record generation is deterministic");
    passed++;

    const kernelLog = JSON.parse(fs.readFileSync(artifactPath, "utf-8")) as Record<string, unknown>;
    assert.equal(kernelLog.changeId, "change-ktm-1");
    assert.equal((kernelLog.transition as Record<string, unknown>).decision, "approve");
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(runtimeDir, "state-snapshot.json"), "utf-8")).status,
      "committed",
    );
    assert.ok(fs.readFileSync(path.join(runtimeDir, "kernel-runtime.md"), "utf-8").includes("KTM Runtime"));
    console.log("✓ Test 2: KTM writes kernel-log and state snapshot from the same runtime boundary");
    passed++;

    const bypassInput = {
      ...input,
      sessionId: "change-ktm-2",
      changeId: "change-ktm-2",
      changeSummary: "Reject malformed KTM publication attempts",
    };
    const bypassRecord = buildKtmRuntimeRecord(bypassInput);
    const bypassRuntimeDir = path.join(fixtureRoot, ".jispec", "kernel-runtime", "change-ktm-2");
    const bypassStagingDir = path.join(
      path.dirname(bypassRuntimeDir),
      `.staging-${bypassRecord.id}`,
    );
    const tamperedRecord = {
      ...bypassRecord,
      transition: {
        ...bypassRecord.transition,
        outputs: bypassRecord.transition.outputs.filter((output) => output.kind !== "state-snapshot"),
      },
    };

    assert.throws(
      () => writeKtmRuntimeArtifact(fixtureRoot, tamperedRecord),
      /Cannot publish KTM runtime record:.*missing runtime output: state-snapshot/,
    );
    assert.equal(fs.existsSync(bypassRuntimeDir), false);
    assert.equal(fs.existsSync(bypassStagingDir), false);

    const failingInput = {
      ...input,
      sessionId: "change-ktm-3",
      changeId: "change-ktm-3",
      changeSummary: "Cleanup after KTM publication failure",
    };
    const failingRecord = buildKtmRuntimeRecord(failingInput);
    const failingRuntimeDir = path.join(fixtureRoot, ".jispec", "kernel-runtime", "change-ktm-3");
    const failingStagingDir = path.join(
      path.dirname(failingRuntimeDir),
      `.staging-${failingRecord.id}`,
    );
    const originalRenameSync = fs.renameSync;
    let renameIntercepted = false;
    try {
      fs.renameSync = ((...args: Parameters<typeof fs.renameSync>) => {
        renameIntercepted = true;
        throw new Error("simulated KTM publish failure");
      }) as typeof fs.renameSync;

      assert.throws(
        () => writeKtmRuntimeArtifact(fixtureRoot, failingRecord),
        /simulated KTM publish failure/,
      );
    } finally {
      fs.renameSync = originalRenameSync;
    }

    assert.equal(renameIntercepted, true);
    assert.equal(fs.existsSync(failingRuntimeDir), false);
    assert.equal(fs.existsSync(failingStagingDir), false);
    console.log("✓ Test 3: malformed or interrupted KTM publication is rejected and leaves no partial runtime");
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
