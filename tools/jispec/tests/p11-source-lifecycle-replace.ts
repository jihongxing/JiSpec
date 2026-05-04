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
  loadSourceReviewRecord,
  writeWorkspaceRequirements,
} from "./p11-source-lifecycle-helpers";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== P11 Source Lifecycle Replace Tests ===\n");

  const root = createFixtureRoot("jispec-p11-source-lifecycle-replace-");
  const results: TestResult[] = [];

  try {
    initializeGreenfieldProject(root, [
      { id: "REQ-ORD-001", statement: "A shopper must submit an order." },
      { id: "REQ-ORD-002", statement: "Checkout must reject unavailable items." },
    ]);

    const change = await runChangeCommand({
      root,
      summary: "Replace checkout validation requirement",
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
    const deprecatedItemId = findEvolutionItemId(root, refresh.changeId, (item) =>
      item.evolution_kind === "deprecated" && item.anchor_id === "REQ-ORD-002"
    );
    const addedItemId = findEvolutionItemId(root, refresh.changeId, (item) =>
      item.evolution_kind === "added" && item.anchor_id === "REQ-ORD-020"
    );
    const preReviewVerify = await runVerify({ root, generatedAt: "2026-05-04T00:00:00.000Z" });

    runGreenfieldSourceReviewTransition({
      root,
      change: refresh.changeId,
      itemId: deprecatedItemId,
      action: "adopt",
      actor: "architect",
      reason: "REQ-ORD-020 replaces REQ-ORD-002.",
      mapsTo: ["REQ-ORD-020"],
      now: "2026-05-04T00:00:00.000Z",
    });
    runGreenfieldSourceReviewTransition({
      root,
      change: refresh.changeId,
      itemId: addedItemId,
      action: "adopt",
      actor: "architect",
      reason: "Replacement requirement is accepted into active truth.",
      now: "2026-05-04T00:00:00.000Z",
    });
    runGreenfieldSourceAdopt({
      root,
      change: refresh.changeId,
      actor: "architect",
      reason: "Promote replacement lifecycle update.",
      now: "2026-05-04T00:00:00.000Z",
    });

    const reviewRecord = loadSourceReviewRecord(root, refresh.changeId);
    const adoption = loadAdoptionRecord(root, refresh.changeId);
    const lifecycle = loadLifecycle(root);
    const baseline = loadBaseline(root);
    const postAdoptVerify = await runVerify({ root, generatedAt: "2026-05-04T00:00:00.000Z" });

    results.push(record("replacement requires explicit lifecycle review before verify can clear removal debt", () => {
      assert.ok(preReviewVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_REQUIREMENT_REMOVED"));
      assert.ok(preReviewVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_EVOLUTION_UNREVIEWED"));
    }));

    results.push(record("replacement adoption records maps_to, replaced_by, and successor supersession", () => {
      const predecessor = lifecycle.requirements?.find((entry) => entry.id === "REQ-ORD-002");
      const successor = lifecycle.requirements?.find((entry) => entry.id === "REQ-ORD-020");
      assert.ok(reviewRecord.items?.some((item) => item.evolution_id === deprecatedItemId && item.maps_to?.includes("REQ-ORD-020")));
      assert.ok(adoption.decisions?.some((decision) => decision.evolution_id === deprecatedItemId && decision.maps_to?.includes("REQ-ORD-020")));
      assert.equal(predecessor?.status, "replaced");
      assert.deepEqual(predecessor?.replaced_by, ["REQ-ORD-020"]);
      assert.deepEqual(successor?.supersedes, ["REQ-ORD-002"]);
      assert.equal(baseline.requirement_ids?.includes("REQ-ORD-020"), true);
    }));

    results.push(record("replacement verify clears removal and review blockers after adoption", () => {
      assert.equal(postAdoptVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_REQUIREMENT_REMOVED"), false);
      assert.equal(postAdoptVerify.issues.some((issue) => issue.code === "GREENFIELD_SOURCE_EVOLUTION_UNREVIEWED"), false);
      assert.equal(postAdoptVerify.blockingIssueCount, 0);
    }));
  } catch (error) {
    results.push({
      name: "p11 source lifecycle replace execution",
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
