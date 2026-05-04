import assert from "node:assert/strict";
import fs from "node:fs";
import { runChangeCommand } from "../change/change-command";
import { runGreenfieldSourceReviewTransition } from "../greenfield/source-governance";
import { runGreenfieldSourceRefresh } from "../greenfield/source-refresh";
import { runVerify } from "../verify/verify-runner";
import {
  createFixtureRoot,
  findEvolutionItemId,
  initializeGreenfieldProject,
  loadSourceReviewRecord,
  writeWorkspaceRequirements,
} from "./p11-source-lifecycle-helpers";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== P11 Source Lifecycle Deprecate Tests ===\n");

  const results: TestResult[] = [];

  try {
    const blockingRoot = createFixtureRoot("jispec-p11-source-lifecycle-deprecate-blocking-");
    initializeGreenfieldProject(blockingRoot, [
      { id: "REQ-ORD-001", statement: "A shopper must submit an order." },
      { id: "REQ-ORD-002", statement: "Checkout must reject unavailable items." },
    ]);
    const blockingChange = await runChangeCommand({
      root: blockingRoot,
      summary: "Remove checkout validation requirement",
      mode: "prompt",
      changeType: "deprecate",
      contextId: "ordering",
    });
    writeWorkspaceRequirements(blockingRoot, [
      { id: "REQ-ORD-001", statement: "A shopper must submit an order." },
    ]);
    const blockingRefresh = runGreenfieldSourceRefresh({
      root: blockingRoot,
      change: blockingChange.session.specDelta?.changeId,
    });
    const blockingItemId = findEvolutionItemId(blockingRoot, blockingRefresh.changeId, (item) =>
      item.evolution_kind === "deprecated" && item.anchor_id === "REQ-ORD-002"
    );
    const blockingVerify = await runVerify({ root: blockingRoot, generatedAt: "2026-05-04T00:00:00.000Z" });
    results.push(record("deprecated lifecycle blocks verify before any reviewed deprecation decision exists", () => {
      assert.equal(blockingItemId.length > 0, true);
      assert.ok(blockingVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_REQUIREMENT_REMOVED"));
    }));
    fs.rmSync(blockingRoot, { recursive: true, force: true });

    const deferredRoot = createFixtureRoot("jispec-p11-source-lifecycle-deprecate-deferred-");
    initializeGreenfieldProject(deferredRoot, [
      { id: "REQ-ORD-001", statement: "A shopper must submit an order." },
      { id: "REQ-ORD-002", statement: "Checkout must reject unavailable items." },
    ]);
    const deferredChange = await runChangeCommand({
      root: deferredRoot,
      summary: "Defer removal of checkout validation requirement",
      mode: "prompt",
      changeType: "deprecate",
      contextId: "ordering",
    });
    writeWorkspaceRequirements(deferredRoot, [
      { id: "REQ-ORD-001", statement: "A shopper must submit an order." },
    ]);
    const deferredRefresh = runGreenfieldSourceRefresh({
      root: deferredRoot,
      change: deferredChange.session.specDelta?.changeId,
    });
    const deferredItemId = findEvolutionItemId(deferredRoot, deferredRefresh.changeId, (item) =>
      item.evolution_kind === "deprecated" && item.anchor_id === "REQ-ORD-002"
    );
    runGreenfieldSourceReviewTransition({
      root: deferredRoot,
      change: deferredRefresh.changeId,
      itemId: deferredItemId,
      action: "defer",
      actor: "architect",
      owner: "product-owner",
      reason: "Downstream contracts will be removed in a follow-up.",
      expiresAt: "2099-01-01T00:00:00.000Z",
      now: "2026-05-04T00:00:00.000Z",
    });
    const deferredReview = loadSourceReviewRecord(deferredRoot, deferredRefresh.changeId);
    const deferredVerify = await runVerify({ root: deferredRoot, generatedAt: "2026-05-04T00:00:00.000Z" });
    results.push(record("deprecated lifecycle defer stays visible as advisory debt before repayment", () => {
      assert.ok(deferredReview.items?.some((item) => item.evolution_id === deferredItemId && item.status === "deferred"));
      assert.ok(deferredVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_EVOLUTION_DEFERRED" && issue.severity === "advisory"));
      assert.equal(deferredVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_REQUIREMENT_REMOVED"), false);
    }));
    fs.rmSync(deferredRoot, { recursive: true, force: true });

    const expiredRoot = createFixtureRoot("jispec-p11-source-lifecycle-deprecate-expired-");
    initializeGreenfieldProject(expiredRoot, [
      { id: "REQ-ORD-001", statement: "A shopper must submit an order." },
      { id: "REQ-ORD-002", statement: "Checkout must reject unavailable items." },
    ]);
    const expiredChange = await runChangeCommand({
      root: expiredRoot,
      summary: "Expire deferred removal of checkout validation requirement",
      mode: "prompt",
      changeType: "deprecate",
      contextId: "ordering",
    });
    writeWorkspaceRequirements(expiredRoot, [
      { id: "REQ-ORD-001", statement: "A shopper must submit an order." },
    ]);
    const expiredRefresh = runGreenfieldSourceRefresh({
      root: expiredRoot,
      change: expiredChange.session.specDelta?.changeId,
    });
    const expiredItemId = findEvolutionItemId(expiredRoot, expiredRefresh.changeId, (item) =>
      item.evolution_kind === "deprecated" && item.anchor_id === "REQ-ORD-002"
    );
    runGreenfieldSourceReviewTransition({
      root: expiredRoot,
      change: expiredRefresh.changeId,
      itemId: expiredItemId,
      action: "defer",
      actor: "architect",
      owner: "product-owner",
      reason: "This defer is intentionally expired for regression coverage.",
      expiresAt: "2020-01-01T00:00:00.000Z",
      now: "2026-05-04T00:00:00.000Z",
    });
    const expiredVerify = await runVerify({ root: expiredRoot, generatedAt: "2026-05-04T00:00:00.000Z" });
    results.push(record("expired deprecated defer re-blocks verify deterministically", () => {
      assert.ok(expiredVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_EVOLUTION_DEFERRED_EXPIRED" && issue.severity === "blocking"));
    }));
    fs.rmSync(expiredRoot, { recursive: true, force: true });
  } catch (error) {
    results.push({
      name: "p11 source lifecycle deprecate execution",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  summarize(results);
}

function record(name: string, run: () => void): TestResult {
  try {
    run();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarize(results: TestResult[]): void {
  let passed = 0;
  let failed = 0;

  for (const result of results) {
    if (result.passed) {
      console.log(`✓ ${result.name}`);
      passed++;
    } else {
      console.log(`✗ ${result.name}`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
      failed++;
    }
  }

  console.log(`\n${passed}/${results.length} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
