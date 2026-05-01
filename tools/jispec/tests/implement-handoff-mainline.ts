import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runImplement } from "../implement/implement-runner";
import { writeChangeSession, type ChangeSession } from "../change/change-session";
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
      decisions: [],
      baselineHandoff: {
        expectedContractPaths: [".spec/contracts/domain.yaml", ".spec/contracts/api_spec.json"],
        deferredSpecDebtPaths: [".spec/spec-debt/bootstrap-takeover/feature.json"],
        rejectedArtifactKinds: [],
      },
    };
    fs.mkdirSync(path.join(fixtureRoot, ".spec", "handoffs"), { recursive: true });
    fs.writeFileSync(
      path.join(fixtureRoot, ".spec", "handoffs", "bootstrap-takeover.json"),
      JSON.stringify(takeoverReport, null, 2),
      "utf-8",
    );

    const result = await runImplement({
      root: fixtureRoot,
      testCommand: 'node -e "process.exit(1)"',
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
    assert.equal(result.decisionPacket?.implementationBoundary.businessCodeGeneratedByJiSpec, false);
    assert.equal(result.decisionPacket?.implementationBoundary.implementationOwner, "human_or_external_tool");
    assert.equal(result.handoffPacket?.contractContext.lane, "strict");
    assert.equal(result.handoffPacket?.decisionPacket.state, "needs_external_patch");
    assert.equal(result.handoffPacket?.decisionPacket.nextAction, result.decisionPacket?.nextAction);
    assert.ok(result.handoffPacket?.decisionPacket.implementationBoundary.note.includes("does not generate or own business-code implementation"));
    assert.deepEqual(result.handoffPacket?.contractContext.adoptedContractPaths, [
      ".spec/contracts/api_spec.json",
      ".spec/contracts/domain.yaml",
    ]);
    assert.equal(result.handoffPacket?.nextSteps.verifyCommand, "npm run verify");
    assert.ok(result.handoffPacket?.nextSteps.verifyRecommendation.includes("full verify gate"));
    assert.ok(result.decisionPacket?.nextAction.includes("handoff packet"));
    console.log("✓ Test 1: failed strict-lane implement handoff includes contract context and the next verify guidance");
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
