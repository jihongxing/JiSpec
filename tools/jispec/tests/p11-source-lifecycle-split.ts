import assert from "node:assert/strict";
import fs from "node:fs";
import { runChangeCommand } from "../change/change-command";
import { runGreenfieldSourceAdopt, runGreenfieldSourceReviewTransition } from "../greenfield/source-governance";
import { runGreenfieldSourceRefresh } from "../greenfield/source-refresh";
import { runVerify } from "../verify/verify-runner";
import {
  createFixtureRoot,
  findEvolutionItemId,
  initializeGreenfieldProject,
  loadAdoptionRecord,
  loadBaseline,
  loadLifecycle,
  writeWorkspaceRequirements,
} from "./p11-source-lifecycle-helpers";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== P11 Source Lifecycle Split Tests ===\n");

  const root = createFixtureRoot("jispec-p11-source-lifecycle-split-");
  const results: TestResult[] = [];

  try {
    initializeGreenfieldProject(root, [
      { id: "REQ-ORD-001", statement: "A shopper must submit an order." },
      { id: "REQ-ORD-002", statement: "Checkout must reject unavailable items." },
    ]);

    const change = await runChangeCommand({
      root,
      summary: "Split checkout validation requirement",
      mode: "prompt",
      changeType: "redesign",
      contextId: "ordering",
    });

    writeWorkspaceRequirements(root, [
      { id: "REQ-ORD-001", statement: "A shopper must submit an order." },
      { id: "REQ-ORD-010", statement: "Checkout must reject unavailable items." },
      { id: "REQ-ORD-011", statement: "Checkout must reject recalled items." },
    ]);

    const refresh = runGreenfieldSourceRefresh({
      root,
      change: change.session.specDelta?.changeId,
    });
    const splitItemId = findEvolutionItemId(root, refresh.changeId, (item) =>
      item.evolution_kind === "split" && item.predecessor_ids?.includes("REQ-ORD-002") === true
    );

    let blockedAdoptMessage = "";
    try {
      runGreenfieldSourceAdopt({
        root,
        change: refresh.changeId,
        actor: "architect",
        reason: "should block before split review",
      });
    } catch (error) {
      blockedAdoptMessage = error instanceof Error ? error.message : String(error);
    }
    const preReviewVerify = await runVerify({ root, generatedAt: "2026-05-04T00:00:00.000Z" });

    runGreenfieldSourceReviewTransition({
      root,
      change: refresh.changeId,
      itemId: splitItemId,
      action: "adopt",
      actor: "architect",
      reason: "Split successor mapping is accepted.",
      now: "2026-05-04T00:00:00.000Z",
    });
    runGreenfieldSourceAdopt({
      root,
      change: refresh.changeId,
      actor: "architect",
      reason: "Promote split lifecycle update.",
      now: "2026-05-04T00:00:00.000Z",
    });

    const lifecycle = loadLifecycle(root);
    const baseline = loadBaseline(root);
    const adoption = loadAdoptionRecord(root, refresh.changeId);
    const postAdoptVerify = await runVerify({ root, generatedAt: "2026-05-04T00:00:00.000Z" });

    results.push(record("split lifecycle blocks before review and names successor-mapping debt", () => {
      assert.match(blockedAdoptMessage, /still need adopt, defer, or waive/i);
      assert.ok(preReviewVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_REQUIREMENT_SPLIT_UNMAPPED"));
    }));

    results.push(record("split lifecycle adoption records predecessor replacement and successor supersession", () => {
      const predecessor = lifecycle.requirements?.find((entry) => entry.id === "REQ-ORD-002");
      const successorA = lifecycle.requirements?.find((entry) => entry.id === "REQ-ORD-010");
      const successorB = lifecycle.requirements?.find((entry) => entry.id === "REQ-ORD-011");
      assert.equal(lifecycle.last_adopted_change_id, refresh.changeId);
      assert.equal(predecessor?.status, "split");
      assert.deepEqual(predecessor?.replaced_by, ["REQ-ORD-010", "REQ-ORD-011"]);
      assert.deepEqual(successorA?.supersedes, ["REQ-ORD-002"]);
      assert.deepEqual(successorB?.supersedes, ["REQ-ORD-002"]);
      assert.equal(adoption.status, "adopted");
      assert.ok(adoption.decisions?.some((decision) => decision.evolution_id === splitItemId && decision.status === "adopted"));
      assert.equal(baseline.requirement_ids?.includes("REQ-ORD-010"), true);
      assert.equal(baseline.requirement_ids?.includes("REQ-ORD-011"), true);
      assert.equal(baseline.applied_deltas?.includes(refresh.changeId), true);
    }));

    results.push(record("split lifecycle verify clears blocking successor-mapping issues after adoption", () => {
      assert.equal(postAdoptVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_REQUIREMENT_SPLIT_UNMAPPED"), false);
      assert.equal(postAdoptVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_EVOLUTION_UNREVIEWED"), false);
      assert.equal(postAdoptVerify.blockingIssueCount, 0);
    }));
  } catch (error) {
    results.push({
      name: "p11 source lifecycle split execution",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
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
