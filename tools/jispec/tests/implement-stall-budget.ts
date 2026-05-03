import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BudgetController } from "../implement/budget-controller";
import { buildContextBundle, formatContextBundle } from "../implement/context-pruning";
import { createEpisodeMemory, addEpisode } from "../implement/episode-memory";
import { StallDetector } from "../implement/stall-detector";
import { renderImplementText, runImplement } from "../implement/implement-runner";
import { writeChangeSession, type ChangeSession } from "../change/change-session";
import { cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

function buildSession(id: string, lane: "fast" | "strict", changedPath: string, kind: ChangeSession["changedPaths"][number]["kind"]): ChangeSession {
  return {
    id,
    createdAt: "2026-05-02T00:00:00.000Z",
    summary: `Implement stall/budget session ${id}`,
    laneDecision: {
      lane,
      reasons: lane === "fast" ? ["all changes are safe for fast lane"] : [`changed path hits governed scope: ${changedPath}`],
      autoPromoted: false,
    },
    changedPaths: [{ path: changedPath, kind }],
    baseRef: "HEAD",
    nextCommands: lane === "fast"
      ? [{ command: "npm run jispec-cli -- verify --fast", description: "Run fast verify" }]
      : [{ command: "npm run verify", description: "Run full verify" }],
  };
}

async function main(): Promise<void> {
  console.log("=== Implement Stall / Budget Tests ===\n");

  let passed = 0;
  let failed = 0;

  try {
    const controller = new BudgetController({ maxIterations: 2, maxTokens: 12, maxCostUSD: 1 });
    assert.deepEqual(controller.getState(), { iterations: 0, tokensUsed: 0, costUSD: 0 });
    assert.equal(controller.canContinue(), true);
    controller.recordIteration(5, 0.25);
    assert.equal(controller.canContinue(), true);
    assert.deepEqual(controller.getRemainingBudget(), { iterations: 1, tokens: 7, costUSD: 0.75 });
    controller.recordIteration(7, 0.75);
    assert.equal(controller.canContinue(), false);
    assert.equal(controller.getExceededLimit(), "iterations");
    console.log("✓ Test 1: budget controller tracks remaining room and exhausts deterministically");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  }

  try {
    const detector = new StallDetector();
    for (let index = 0; index < 5; index++) {
      detector.recordIteration(false, [], "same failure signature");
    }

    const result = detector.checkStall();
    assert.equal(result.isStalled, true);
    assert.equal(result.reason, "no_progress");
    assert.ok(result.details?.includes("No files changed in last 5 iterations"));
    console.log("✓ Test 2: stall detector stops repeated no-progress loops early");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  }

  const contextRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-implement-context-"));
  try {
    fs.mkdirSync(path.join(contextRoot, "docs"), { recursive: true });
    fs.writeFileSync(path.join(contextRoot, "docs", "context.md"), "alpha\nbeta\ngamma\n", "utf-8");

    const session = buildSession("change-context", "fast", "docs/context.md", "docs_only");
    const episodeMemory = createEpisodeMemory();
    addEpisode(episodeMemory, {
      iteration: 1,
      hypothesis: "retry docs context",
      outcome: "failure",
      changedFiles: ["docs/context.md"],
      errorMessage: "still failing",
    });

    const bundle = buildContextBundle(contextRoot, session, {
      passed: false,
      exitCode: 1,
      stdout: "stdout line",
      stderr: "stderr line",
      error: "Error: boom",
      duration: 5,
    }, episodeMemory);
    const text = formatContextBundle(bundle);

    assert.ok(text.includes("=== Change Intent ==="));
    assert.ok(text.includes("=== Working Set ==="));
    assert.ok(text.includes("Files: 1"));
    assert.ok(text.includes("=== Last Error ==="));
    assert.ok(text.includes("=== Attempted Hypotheses ==="));
    assert.ok(text.includes("=== Rejected Paths ==="));
    assert.ok(text.includes("retry docs context"));
    console.log("✓ Test 3: context pruning keeps working set, failure pack, and episode memory in one bundle");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    fs.rmSync(contextRoot, { recursive: true, force: true });
  }

  const budgetFixture = createVerifyFixture("implement-stall-budget-limit");
  try {
    writeChangeSession(budgetFixture, buildSession("change-budget-limit", "fast", "docs/budget.md", "docs_only"));
    const result = await runImplement({
      root: budgetFixture,
      fast: true,
      testCommand: 'node -e "console.error(\'budget stop\');process.exit(1)"',
      maxIterations: 2,
    });

    assert.equal(result.outcome, "budget_exhausted");
    assert.ok(renderImplementText(result).includes("State: needs_external_patch"));
    assert.equal(result.decisionPacket?.state, "needs_external_patch");
    assert.equal(result.decisionPacket?.stopPoint, "budget");
    assert.equal(result.decisionPacket?.executionStatus.nextActionOwner, "human_or_external_tool");
    assert.equal(result.decisionPacket?.nextActionDetail.type, "submit_external_patch");
    assert.equal(result.decisionPacket?.nextActionDetail.failedCheck, "budget");
    assert.ok(result.decisionPacket?.nextActionDetail.externalToolHandoff?.required);
    assert.equal(result.handoffPacket?.outcome, "budget_exhausted");
    assert.equal(result.handoffPacket?.replay.previousAttempt.failedCheck, "budget");
    assert.equal(result.handoffPacket?.episodeMemory.attemptedHypotheses.length, 0);
    assert.equal(result.handoffPacket?.summary.whatWorked[0], "No successful iterations");
    assert.equal(result.handoffPacket?.summary.whatFailed[0], "No failed iterations");
    assert.ok(result.handoffPacket?.nextSteps.externalToolHandoff?.request.includes("focused handoff"));
    assert.equal(result.metadata.sessionArchived, undefined);
    assert.ok(fs.existsSync(path.join(budgetFixture, ".jispec", "change-session.json")));
    console.log("✓ Test 4: capped implement loops stop at budget and hand off recovery context");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(budgetFixture);
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
