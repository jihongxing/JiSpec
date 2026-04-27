import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { computeImplementExitCode, runImplement } from "../implement/implement-runner";
import { writeChangeSession, readChangeSession, readArchivedChangeSession, type ChangeSession } from "../change/change-session";
import { cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

function buildSession(id: string, lane: "fast" | "strict"): ChangeSession {
  return {
    id,
    createdAt: "2026-04-27T00:00:00.000Z",
    summary: `Session ${id}`,
    laneDecision: {
      lane,
      reasons: lane === "fast" ? ["all changes are safe for fast lane"] : ["changed path hits domain core: src/domain/order.ts"],
      autoPromoted: false,
    },
    changedPaths: lane === "fast"
      ? [{ path: "README.md", kind: "docs_only" as const }]
      : [{ path: "src/domain/order.ts", kind: "domain_core" as const }],
    baseRef: "HEAD",
    nextCommands: lane === "fast"
      ? [{ command: "npm run jispec-cli -- verify --fast", description: "Run fast verify" }]
      : [{ command: "npm run verify", description: "Run full verify" }],
  };
}

async function main(): Promise<void> {
  console.log("=== Implement Mainline Lane Tests ===\n");

  let passed = 0;
  let failed = 0;

  const successFixture = createVerifyFixture("implement-mainline-fast");
  try {
    writeChangeSession(successFixture, buildSession("change-fast", "fast"));
    const result = await runImplement({
      root: successFixture,
      fast: true,
      testCommand: 'node -e "process.exit(0)"',
    });

    assert.equal(result.outcome, "preflight_failed");
    assert.equal(result.lane, "fast");
    assert.equal(result.autoPromoted, false);
    assert.equal(result.postVerify?.command, "npm run jispec-cli -- verify --fast");
    assert.equal(result.postVerify?.effectiveLane, "fast");
    assert.equal(result.postVerify?.verdict, "PASS");
    assert.equal(result.metadata.sessionArchived, true);
    assert.equal(readChangeSession(successFixture), null);
    assert.ok(readArchivedChangeSession(successFixture, "change-fast"));
    console.log("✓ Test 1: fast-lane implement returns to verify --fast and archives the active session on success");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(successFixture);
  }

  const strictFixture = createVerifyFixture("implement-mainline-strict");
  try {
    writeChangeSession(strictFixture, buildSession("change-strict", "strict"));
    const result = await runImplement({
      root: strictFixture,
      fast: true,
      testCommand: 'node -e "process.exit(0)"',
    });

    assert.equal(result.lane, "strict");
    assert.equal(result.autoPromoted, true);
    assert.equal(result.postVerify?.command, "npm run verify");
    assert.equal(result.postVerify?.effectiveLane, "strict");
    assert.equal(result.postVerify?.verdict, "PASS");
    console.log("✓ Test 2: fast requests auto-promote back to strict when the active change session is already strict");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(strictFixture);
  }

  const failingFixture = createVerifyFixture("implement-mainline-verify-fail");
  try {
    fs.rmSync(
      path.join(failingFixture, "contexts", "ordering", "slices", "ordering-checkout-v1", "evidence.md"),
      { force: true },
    );
    writeChangeSession(failingFixture, buildSession("change-verify-fail", "strict"));
    const result = await runImplement({
      root: failingFixture,
      testCommand: 'node -e "process.exit(0)"',
    });

    assert.equal(result.testsPassed, true);
    assert.equal(result.postVerify?.verdict, "FAIL_BLOCKING");
    assert.equal(computeImplementExitCode(result), 1);
    assert.equal(result.metadata.sessionArchived, undefined);
    assert.ok(readChangeSession(failingFixture));
    console.log("✓ Test 3: implement exit semantics stay blocking when the post-implement verify gate fails");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(failingFixture);
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
