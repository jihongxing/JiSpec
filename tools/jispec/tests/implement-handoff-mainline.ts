import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runImplement } from "../implement/implement-runner";
import { clearChangeSession, readArchivedChangeSession, readChangeSession, writeChangeSession, type ChangeSession } from "../change/change-session";
import type { BootstrapTakeoverReport } from "../bootstrap/takeover";
import { cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

async function main(): Promise<void> {
  console.log("=== Implement Handoff Mainline Tests ===\n");

  let passed = 0;
  let failed = 0;

  const fixtureRoot = createVerifyFixture("implement-handoff-mainline");

  try {
    const session: ChangeSession = {
      id: "change-handoff",
      createdAt: "2026-04-27T00:00:00.000Z",
      summary: "Tighten order refund flow",
      laneDecision: {
        lane: "strict",
        reasons: ["changed path hits domain core: src/domain/order.ts"],
        autoPromoted: false,
      },
      changedPaths: [{ path: "src/domain/order.ts", kind: "domain_core" }],
      baseRef: "HEAD",
      nextCommands: [{ command: "npm run verify", description: "Run full verify" }],
    };
    const sourcePath = path.join(fixtureRoot, "src", "domain", "order.ts");
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, 'export const refundStatus = "pending";\n', "utf-8");
    writeChangeSession(fixtureRoot, session);

    const takeoverReport: BootstrapTakeoverReport = {
      version: 1,
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z",
      repoRoot: fixtureRoot.replace(/\\/g, "/"),
      sessionId: "bootstrap-takeover",
      status: "committed",
      manifestPath: ".spec/sessions/bootstrap-takeover/manifest.json",
      sourceEvidenceGraphPath: ".spec/facts/bootstrap/evidence-graph.json",
      adoptedArtifactPaths: [".spec/contracts/domain.yaml", ".spec/contracts/api_spec.json"],
      specDebtPaths: [".spec/spec-debt/bootstrap-takeover/feature.json"],
      rejectedArtifactKinds: [],
      decisions: [
        {
          artifactKind: "domain",
          finalState: "adopted",
          targetPath: ".spec/contracts/domain.yaml",
          edited: false,
          sourceFiles: ["src/domain/order.ts"],
          confidenceScore: 0.9,
          provenanceNote: "test fixture",
        },
        {
          artifactKind: "api",
          finalState: "adopted",
          targetPath: ".spec/contracts/api_spec.json",
          edited: false,
          sourceFiles: ["src/domain/order.ts"],
          confidenceScore: 0.9,
          provenanceNote: "test fixture",
        },
      ],
      baselineHandoff: {
        expectedContractPaths: [".spec/contracts/domain.yaml", ".spec/contracts/api_spec.json"],
        deferredSpecDebtPaths: [".spec/spec-debt/bootstrap-takeover/feature.json"],
        rejectedArtifactKinds: [],
      },
    };
    fs.mkdirSync(path.join(fixtureRoot, ".spec", "sessions", "bootstrap-takeover"), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, ".spec", "sessions", "bootstrap-takeover", "manifest.json"), "{}\n", "utf-8");
    fs.mkdirSync(path.join(fixtureRoot, ".spec", "contracts"), { recursive: true });
    fs.writeFileSync(
      path.join(fixtureRoot, ".spec", "contracts", "domain.yaml"),
      "metadata:\n  name: order-domain\ndomain:\n  aggregate: order\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(fixtureRoot, ".spec", "contracts", "api_spec.json"),
      JSON.stringify({ api_spec: { endpoints: [{ method: "POST", path: "/refunds" }] } }, null, 2),
      "utf-8",
    );
    fs.mkdirSync(path.join(fixtureRoot, ".spec", "spec-debt", "bootstrap-takeover"), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, ".spec", "spec-debt", "bootstrap-takeover", "feature.json"), "{}\n", "utf-8");
    fs.mkdirSync(path.join(fixtureRoot, ".spec", "handoffs"), { recursive: true });
    fs.writeFileSync(
      path.join(fixtureRoot, ".spec", "handoffs", "bootstrap-takeover.json"),
      JSON.stringify(takeoverReport, null, 2),
      "utf-8",
    );

    const result = await runImplement({
      root: fixtureRoot,
      testCommand: 'node -e "const fs=require(\'fs\');process.exit(fs.readFileSync(\'src/domain/order.ts\',\'utf8\').includes(\'mediated\')?0:1)"',
      maxIterations: 1,
    });

    assert.equal(result.outcome, "budget_exhausted");
    assert.ok(result.handoffPacket);
    assert.ok(result.decisionPacket);
    assert.equal(result.decisionPacket?.state, "needs_external_patch");
    assert.equal(result.decisionPacket?.stopPoint, "budget");
    assert.equal(result.decisionPacket?.mergeable, false);
    assert.equal(result.decisionPacket?.executionStatus.scopeCheck, "not_applicable");
    assert.equal(result.decisionPacket?.executionStatus.tests, "failed");
    assert.equal(result.decisionPacket?.executionStatus.verify, "not_run");
    assert.equal(result.decisionPacket?.executionStatus.nextActionOwner, "human_or_external_tool");
    assert.equal(result.decisionPacket?.nextActionDetail.type, "submit_external_patch");
    assert.equal(result.decisionPacket?.nextActionDetail.owner, "human_or_external_tool");
    assert.equal(result.decisionPacket?.nextActionDetail.failedCheck, "budget");
    assert.equal(
      result.decisionPacket?.nextActionDetail.command,
      "npm run jispec-cli -- implement --session-id change-handoff --external-patch <path>",
    );
    assert.equal(result.decisionPacket?.nextActionDetail.externalToolHandoff?.required, true);
    assert.ok(result.decisionPacket?.nextActionDetail.externalToolHandoff?.request.includes("focused handoff"));
    assert.deepEqual(result.decisionPacket?.nextActionDetail.externalToolHandoff?.filesNeedingAttention, [
      "src/domain/order.ts",
    ]);
    assert.equal(result.handoffPacket?.replay.replayable, true);
    assert.equal(result.handoffPacket?.replay.previousAttempt.outcome, "budget_exhausted");
    assert.equal(result.handoffPacket?.replay.previousAttempt.failedCheck, "budget");
    assert.equal(result.handoffPacket?.replay.inputs.testCommand, result.metadata.testCommand);
    assert.equal(result.handoffPacket?.replay.commands.retryWithExternalPatch, "npm run jispec-cli -- implement --from-handoff .jispec/handoff/change-handoff.json --external-patch <path>");
    assert.equal(result.decisionPacket?.implementationBoundary.businessCodeGeneratedByJiSpec, false);
    assert.equal(result.decisionPacket?.implementationBoundary.implementationOwner, "human_or_external_tool");
    assert.equal(result.handoffPacket?.contractContext.lane, "strict");
    assert.equal(result.handoffPacket?.decisionPacket.state, "needs_external_patch");
    assert.equal(result.handoffPacket?.decisionPacket.nextAction, result.decisionPacket?.nextAction);
    assert.equal(result.handoffPacket?.decisionPacket.nextActionDetail.failedCheck, "budget");
    assert.ok(result.handoffPacket?.decisionPacket.implementationBoundary.note.includes("does not generate or own business-code implementation"));
    assert.equal(result.handoffPacket?.nextSteps.externalToolHandoff?.required, true);
    assert.ok(result.handoffPacket?.nextSteps.externalToolHandoff?.request.includes("focused handoff"));
    assert.deepEqual(result.handoffPacket?.contractContext.adoptedContractPaths, [
      ".spec/contracts/api_spec.json",
      ".spec/contracts/domain.yaml",
    ]);
    assert.equal(result.handoffPacket?.nextSteps.verifyCommand, "npm run verify");
    assert.ok(result.handoffPacket?.nextSteps.verifyRecommendation.includes("full verify gate"));
    assert.ok(result.decisionPacket?.nextAction.includes("handoff packet"));

    clearChangeSession(fixtureRoot);
    assert.equal(readChangeSession(fixtureRoot), null);
    const replayPatchPath = writePatch(fixtureRoot, "replay.patch", [
      "diff --git a/src/domain/order.ts b/src/domain/order.ts",
      "index 2ddc7cb..e07a8bd 100644",
      "--- a/src/domain/order.ts",
      "+++ b/src/domain/order.ts",
      "@@ -1 +1 @@",
      '-export const refundStatus = "pending";',
      '+export const refundStatus = "mediated";',
    ]);

    const replayed = await runImplement({
      root: fixtureRoot,
      fromHandoff: ".jispec/handoff/change-handoff.json",
      externalPatchPath: replayPatchPath,
    });

    assert.equal(replayed.metadata.replay?.previousOutcome, "budget_exhausted");
    assert.equal(replayed.metadata.replay?.previousFailedCheck, "budget");
    assert.equal(replayed.metadata.replay?.restoredSession, true);
    assert.equal(replayed.outcome, "patch_verified");
    assert.equal(replayed.patchMediation?.applied, true);
    assert.equal(replayed.decisionPacket?.state, "ready_to_merge");
    assert.equal(replayed.metadata.sessionArchived, true);
    assert.equal(readChangeSession(fixtureRoot), null);
    assert.ok(readArchivedChangeSession(fixtureRoot, "change-handoff"));
    console.log("✓ Test 1: failed strict-lane implement handoff includes replay state and can restore the next patch attempt");
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

function writePatch(root: string, name: string, lines: string[]): string {
  const patchDir = path.join(root, ".jispec", "patches");
  fs.mkdirSync(patchDir, { recursive: true });
  const patchPath = path.join(patchDir, name);
  fs.writeFileSync(patchPath, `${lines.join("\n")}\n`, "utf-8");
  return patchPath;
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
