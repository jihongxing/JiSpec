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
  console.log("=== P11 Source Lifecycle Merge Tests ===\n");

  const root = createFixtureRoot("jispec-p11-source-lifecycle-merge-");
  const results: TestResult[] = [];

  try {
    initializeGreenfieldProject(root, [
      { id: "REQ-ORD-001", statement: "A shopper must submit an order." },
      { id: "REQ-ORD-003", statement: "Checkout must reject unavailable items." },
      { id: "REQ-ORD-004", statement: "Checkout must reject recalled items." },
    ]);

    const change = await runChangeCommand({
      root,
      summary: "Merge checkout validation requirements",
      mode: "prompt",
      changeType: "redesign",
      contextId: "ordering",
    });

    writeWorkspaceRequirements(root, [
      { id: "REQ-ORD-001", statement: "A shopper must submit an order." },
      { id: "REQ-ORD-020", statement: "Checkout must reject unavailable or recalled items." },
    ]);

    const refresh = runGreenfieldSourceRefresh({
      root,
      change: change.session.specDelta?.changeId,
    });
    const mergedItemId = findEvolutionItemId(root, refresh.changeId, (item) =>
      item.evolution_kind === "merged" &&
      item.predecessor_ids?.includes("REQ-ORD-003") === true &&
      item.predecessor_ids?.includes("REQ-ORD-004") === true
    );

    const preReviewVerify = await runVerify({ root, generatedAt: "2026-05-04T00:00:00.000Z" });

    runGreenfieldSourceReviewTransition({
      root,
      change: refresh.changeId,
      itemId: mergedItemId,
      action: "adopt",
      actor: "architect",
      reason: "Merged requirement mapping is accepted.",
      now: "2026-05-04T00:00:00.000Z",
    });
    runGreenfieldSourceAdopt({
      root,
      change: refresh.changeId,
      actor: "architect",
      reason: "Promote merged lifecycle update.",
      now: "2026-05-04T00:00:00.000Z",
    });

    const lifecycle = loadLifecycle(root);
    const baseline = loadBaseline(root);
    const adoption = loadAdoptionRecord(root, refresh.changeId);
    const postAdoptVerify = await runVerify({ root, generatedAt: "2026-05-04T00:00:00.000Z" });

    results.push(record("merge lifecycle blocks before review and surfaces successor-mapping requirements", () => {
      assert.ok(preReviewVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_REQUIREMENT_SPLIT_UNMAPPED"));
    }));

    results.push(record("merge lifecycle adoption records merged predecessors and target lineage", () => {
      const predecessorA = lifecycle.requirements?.find((entry) => entry.id === "REQ-ORD-003");
      const predecessorB = lifecycle.requirements?.find((entry) => entry.id === "REQ-ORD-004");
      const successor = lifecycle.requirements?.find((entry) => entry.id === "REQ-ORD-020");
      assert.equal(predecessorA?.status, "merged");
      assert.equal(predecessorB?.status, "merged");
      assert.deepEqual(predecessorA?.replaced_by, ["REQ-ORD-020"]);
      assert.deepEqual(predecessorB?.replaced_by, ["REQ-ORD-020"]);
      assert.deepEqual(successor?.merged_from, ["REQ-ORD-003", "REQ-ORD-004"]);
      assert.deepEqual(successor?.supersedes, ["REQ-ORD-003", "REQ-ORD-004"]);
      assert.ok(adoption.decisions?.some((decision) => decision.evolution_id === mergedItemId && decision.status === "adopted"));
      assert.equal(baseline.requirement_ids?.includes("REQ-ORD-020"), true);
    }));

    results.push(record("merge lifecycle verify clears blocking lineage issues after adoption", () => {
      assert.equal(postAdoptVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_REQUIREMENT_SPLIT_UNMAPPED"), false);
      assert.equal(postAdoptVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_EVOLUTION_UNREVIEWED"), false);
      assert.equal(postAdoptVerify.blockingIssueCount, 0);
    }));
  } catch (error) {
    results.push({
      name: "p11 source lifecycle merge execution",
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
