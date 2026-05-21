import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Doctor } from "../doctor";
import { diagnoseMainlineFlow } from "../change/mainline-flow";
import { TEST_SUITES } from "./regression-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Mainline Flow Recovery Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("active prompt session exposes owner, next command, and source artifact", () => {
    const root = fixtureRoot("mainline-active-");
    try {
      writeActiveSession(root, {
        id: "change-active",
        summary: "Update docs",
        orchestrationMode: "prompt",
        laneDecision: { lane: "fast", reasons: ["docs only"], autoPromoted: false },
        changedPaths: [{ path: "README.md", kind: "docs_only" }],
        nextCommands: [
          { command: "npm run jispec-cli -- verify --fast", description: "Verify the fast lane." },
        ],
      });

      const diagnosis = diagnoseMainlineFlow(root);
      assert.equal(diagnosis.state, "continue_active_session");
      assert.equal(diagnosis.status, "pass");
      assert.equal(diagnosis.ownerAction, "Follow the current session's next command.");
      assert.equal(diagnosis.nextCommand, "npm run jispec-cli -- verify --fast");
      assert.ok(diagnosis.sourceArtifacts.includes(".jispec/change-session.json"));
    } finally {
      cleanup(root);
    }
  }));

  results.push(record("stale impact artifact blocks recovery with replay command", () => {
    const root = fixtureRoot("mainline-stale-");
    try {
      writeActiveSession(root, {
        id: "change-stale",
        summary: "Refresh stale impact",
        orchestrationMode: "prompt",
        laneDecision: { lane: "strict", reasons: ["contract touched"], autoPromoted: true },
        changedPaths: [{ path: "contexts/order.yaml", kind: "contract" }],
        nextCommands: [{ command: "npm run jispec-cli -- implement", description: "Implement." }],
        impactSummary: {
          freshness: {
            status: "stale",
            path: ".spec/deltas/change-stale/impact-graph.json",
            reason: "Impact graph is older than active change session.",
          },
          nextReplayCommand: "npm run jispec-cli -- change \"Refresh stale impact\" --json",
        },
      });

      const diagnosis = diagnoseMainlineFlow(root);
      assert.equal(diagnosis.state, "stale_artifact");
      assert.equal(diagnosis.status, "fail");
      assert.match(diagnosis.summary, /stale/);
      assert.match(diagnosis.ownerAction ?? "", /Refresh/);
      assert.equal(diagnosis.nextCommand, "npm run jispec-cli -- change \"Refresh stale impact\" --json");
      assert.ok(diagnosis.sourceArtifacts.includes(".spec/deltas/change-stale/impact-graph.json"));
    } finally {
      cleanup(root);
    }
  }));

  results.push(record("patch mediation failure routes to retry command", () => {
    const root = fixtureRoot("mainline-patch-");
    try {
      writeActiveSession(root, {
        id: "change-patch",
        summary: "Repair patch",
        orchestrationMode: "execute",
        laneDecision: { lane: "strict", reasons: ["source touched"], autoPromoted: false },
        changedPaths: [{ path: "src/order.ts", kind: "source" }],
        nextCommands: [{ command: "npm run jispec-cli -- verify", description: "Verify." }],
      });
      writeJson(root, ".jispec/implement/change-patch/patch-mediation.json", {
        version: 1,
        sessionId: "change-patch",
        status: "apply_failed",
        externalPatchPath: ".jispec/patches/order.patch",
        replay: {
          commands: {
            retryWithExternalPatch: "npm run jispec-cli -- implement --from-handoff .jispec/handoff/change-patch.json --external-patch <path>",
          },
        },
      });

      const diagnosis = diagnoseMainlineFlow(root);
      assert.equal(diagnosis.state, "resume_patch_mediation");
      assert.equal(diagnosis.status, "fail");
      assert.match(diagnosis.nextCommand ?? "", /--external-patch <path>/);
      assert.ok(diagnosis.sourceArtifacts.includes(".jispec/implement/change-patch/patch-mediation.json"));
    } finally {
      cleanup(root);
    }
  }));

  results.push(record("missing active session can still resume from replayable handoff", () => {
    const root = fixtureRoot("mainline-handoff-");
    try {
      writeReplayableHandoff(root, "change-replay", "2026-05-21T10:00:00.000Z");

      const diagnosis = diagnoseMainlineFlow(root);
      assert.equal(diagnosis.state, "resume_from_handoff");
      assert.equal(diagnosis.status, "pass");
      assert.equal(diagnosis.nextCommand, "npm run jispec-cli -- implement --from-handoff .jispec/handoff/change-replay.json");
      assert.equal(diagnosis.sessionId, "change-replay");
    } finally {
      cleanup(root);
    }
  }));

  results.push(record("malformed active session fails with regeneration command", () => {
    const root = fixtureRoot("mainline-malformed-");
    try {
      fs.mkdirSync(path.join(root, ".jispec"), { recursive: true });
      fs.writeFileSync(path.join(root, ".jispec", "change-session.json"), "{ nope", "utf-8");

      const diagnosis = diagnoseMainlineFlow(root);
      assert.equal(diagnosis.state, "malformed_session");
      assert.equal(diagnosis.status, "fail");
      assert.match(diagnosis.nextCommand ?? "", /jispec-cli -- change/);
      assert.ok(diagnosis.sourceArtifacts.includes(".jispec/change-session.json"));
    } finally {
      cleanup(root);
    }
  }));

  results.push(await recordAsync("doctor mainline includes recovery check with owner action, next command, and source artifact", async () => {
    const root = fixtureRoot("mainline-doctor-");
    try {
      writeActiveSession(root, {
        id: "change-doctor",
        summary: "Doctor recovery",
        orchestrationMode: "prompt",
        laneDecision: { lane: "fast", reasons: ["docs only"], autoPromoted: false },
        changedPaths: [{ path: "README.md", kind: "docs_only" }],
        nextCommands: [{ command: "npm run jispec-cli -- verify --fast", description: "Verify." }],
      });

      const report = await new Doctor(root).checkMainlineReadiness();
      const check = report.checks.find((candidate) => candidate.name === "Mainline Flow Recovery");
      assert.ok(check);
      assert.equal(check.status, "pass");
      assert.equal(check.ownerAction, "Follow the current session's next command.");
      assert.equal(check.nextCommand, "npm run jispec-cli -- verify --fast");
      assert.ok(check.sourceArtifacts?.includes(".jispec/change-session.json"));
    } finally {
      cleanup(root);
    }
  }));

  results.push(record("stage-4 flow recovery suite is registered in change-implement matrix", () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "mainline-flow-recovery.ts");
    assert.ok(suite);
    assert.equal(suite.area, "change-implement");
    assert.equal(suite.expectedTests, 7);
    assert.equal(suite.task, "North-Star-Score-Phase-4");

    const stableContract = fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "docs", "reference", "v1-mainline-stable-contract.md"), "utf-8");
    assert.match(stableContract, /Mainline Flow Recovery/);
    assert.match(stableContract, /ownerAction/);
    assert.match(stableContract, /sourceArtifacts/);
  }));

  printResults(results);
}

function fixtureRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `jispec-${prefix}`));
}

function cleanup(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

function writeActiveSession(root: string, session: Record<string, unknown>): void {
  writeJson(root, ".jispec/change-session.json", session);
}

function writeReplayableHandoff(root: string, sessionId: string, createdAt: string): void {
  writeJson(root, `.jispec/handoff/${sessionId}.json`, {
    sessionId,
    changeId: sessionId,
    replay: {
      version: 1,
      replayable: true,
      source: "handoff_packet",
      sourceSession: {
        id: sessionId,
        summary: "Replay session",
        laneDecision: { lane: "strict", reasons: [], autoPromoted: false },
        changedPaths: [],
        nextCommands: [],
      },
      previousAttempt: {
        outcome: "verify_blocked",
        stopPoint: "post_verify",
        failedCheck: "verify",
        summary: "Verify blocked",
        lastError: "blocking issue",
      },
      inputs: {
        testCommand: "npm test",
        verifyCommand: "npm run verify",
        lane: "strict",
        changedPaths: [],
        allowedPatchPaths: [],
      },
      commands: {
        restore: `npm run jispec-cli -- implement --from-handoff .jispec/handoff/${sessionId}.json`,
        retryWithExternalPatch: `npm run jispec-cli -- implement --from-handoff .jispec/handoff/${sessionId}.json --external-patch <path>`,
        rerunVerify: "npm run verify",
      },
    },
    metadata: {
      createdAt,
      startedAt: createdAt,
      completedAt: createdAt,
    },
  });
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2), "utf-8");
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function recordAsync(name: string, fn: () => Promise<void>): Promise<TestResult> {
  try {
    await fn();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function printResults(results: TestResult[]): void {
  let passed = 0;
  let failed = 0;

  for (const result of results) {
    if (result.passed) {
      console.log(`✓ ${result.name}`);
      passed++;
    } else {
      console.log(`✗ ${result.name}`);
      console.log(`  Error: ${result.error ?? "unknown error"}`);
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
