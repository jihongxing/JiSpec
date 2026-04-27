import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildNextCommandHints } from "../change/change-command";

function main(): void {
  console.log("=== Change Mainline Hint Tests ===\n");

  let passed = 0;
  let failed = 0;

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-change-hints-"));

  try {
    fs.mkdirSync(path.join(fixtureRoot, ".spec", "sessions", "bootstrap-test"), { recursive: true });
    fs.writeFileSync(
      path.join(fixtureRoot, ".spec", "sessions", "bootstrap-test", "manifest.json"),
      JSON.stringify({
        sessionId: "bootstrap-test",
        repoRoot: fixtureRoot,
        sourceEvidenceGraphPath: ".spec/facts/bootstrap/evidence-graph.json",
        createdAt: "2026-04-27T00:00:00.000Z",
        updatedAt: "2026-04-27T00:00:00.000Z",
        status: "drafted",
        artifactPaths: [],
        artifacts: [],
      }, null, 2),
      "utf-8",
    );

    const strictHints = buildNextCommandHints(fixtureRoot, "strict");
    assert.deepEqual(
      strictHints.map((hint) => hint.command),
      [
        "npm run jispec-cli -- adopt --interactive --session bootstrap-test",
        "npm run jispec-cli -- implement",
        "npm run verify",
      ],
    );
    console.log("✓ Test 1: strict lane hints surface adopt, implement, and full verify in order");
    passed++;

    const fastHints = buildNextCommandHints(fixtureRoot, "fast");
    assert.deepEqual(
      fastHints.map((hint) => hint.command),
      [
        "npm run jispec-cli -- implement --fast",
        "npm run jispec-cli -- verify --fast",
      ],
    );
    console.log("✓ Test 2: fast lane hints surface implement --fast and verify --fast");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
