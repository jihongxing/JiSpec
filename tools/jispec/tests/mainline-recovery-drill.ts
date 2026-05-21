import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildMainlineRecoveryDrill,
  writeMainlineRecoveryDrill,
} from "../change/mainline-recovery-drill";
import { collectConsoleLocalSnapshot } from "../console/read-model-snapshot";
import { buildNorthStarAcceptance } from "../north-star/acceptance";
import { Doctor } from "../doctor";
import { TEST_SUITES } from "./regression-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Mainline Recovery Drill Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("active session drill records expected next state and verification command", () => {
    withFixture("mainline-drill-active-", (root) => {
      writeActiveSession(root, {
        id: "change-active",
        summary: "Update docs",
        orchestrationMode: "prompt",
        laneDecision: { lane: "fast", reasons: ["docs only"], autoPromoted: false },
        changedPaths: [{ path: "README.md", kind: "docs_only" }],
        nextCommands: [{ command: "npm run jispec-cli -- verify --fast", description: "Verify the fast lane." }],
      });

      const drill = buildMainlineRecoveryDrill(root);
      assert.equal(drill.kind, "jispec-mainline-recovery-drill");
      assert.equal(drill.status, "ready");
      assert.equal(drill.boundary.executesCommands, false);
      assert.equal(drill.boundary.replacesVerify, false);
      assert.equal(drill.steps[0]?.currentState, "continue_active_session");
      assert.equal(drill.steps[0]?.command, "npm run jispec-cli -- verify --fast");
      assert.match(drill.steps[0]?.expectedNextState ?? "", /active session/i);
      assert.equal(drill.steps[0]?.verificationCommand, "npm run ci:verify");
    });
  }));

  results.push(record("handoff, patch, stale, and malformed states map to drill commands", () => {
    withFixture("mainline-drill-states-", (root) => {
      writeReplayableHandoff(root, "change-replay", "2026-05-21T10:00:00.000Z");
      let drill = buildMainlineRecoveryDrill(root);
      assert.equal(drill.steps[0]?.currentState, "resume_from_handoff");
      assert.match(drill.steps[0]?.command ?? "", /implement --from-handoff/);
      assert.match(drill.steps[0]?.expectedNextState ?? "", /restores implementation context/);

      fs.rmSync(path.join(root, ".jispec"), { recursive: true, force: true });
      writeActiveSession(root, {
        id: "change-patch",
        summary: "Repair patch",
        orchestrationMode: "execute",
        laneDecision: { lane: "strict", reasons: ["source"], autoPromoted: false },
        nextCommands: [{ command: "npm run jispec-cli -- verify", description: "Verify." }],
      });
      writeJson(root, ".jispec/implement/change-patch/patch-mediation.json", {
        sessionId: "change-patch",
        status: "rejected_out_of_scope",
        externalPatchPath: ".jispec/patches/order.patch",
        replay: {
          commands: {
            retryWithExternalPatch: "npm run jispec-cli -- implement --from-handoff .jispec/handoff/change-patch.json --external-patch <path>",
          },
        },
      });
      drill = buildMainlineRecoveryDrill(root);
      assert.equal(drill.status, "blocked");
      assert.equal(drill.steps[0]?.currentState, "resume_patch_mediation");
      assert.match(drill.steps[0]?.command ?? "", /--external-patch <path>/);
      assert.match(drill.steps[0]?.expectedNextState ?? "", /Patch mediation re-evaluates/);

      fs.rmSync(path.join(root, ".jispec"), { recursive: true, force: true });
      writeActiveSession(root, {
        id: "change-stale",
        summary: "Refresh stale impact",
        orchestrationMode: "prompt",
        laneDecision: { lane: "strict", reasons: ["contract"], autoPromoted: true },
        impactSummary: {
          freshness: { status: "stale", path: ".spec/deltas/change-stale/impact-graph.json", reason: "old" },
          nextReplayCommand: "npm run jispec-cli -- change \"Refresh stale impact\" --json",
        },
      });
      drill = buildMainlineRecoveryDrill(root);
      assert.equal(drill.steps[0]?.currentState, "stale_artifact");
      assert.match(drill.steps[0]?.expectedNextState ?? "", /stale impact artifact is regenerated/);
      assert.equal(drill.steps[0]?.verificationCommand, "npm run jispec-cli -- doctor mainline");

      fs.rmSync(path.join(root, ".jispec"), { recursive: true, force: true });
      fs.mkdirSync(path.join(root, ".jispec"), { recursive: true });
      fs.writeFileSync(path.join(root, ".jispec", "change-session.json"), "{ nope", "utf-8");
      drill = buildMainlineRecoveryDrill(root);
      assert.equal(drill.steps[0]?.currentState, "malformed_session");
      assert.match(drill.steps[0]?.expectedNextState ?? "", /parseable \.jispec\/change-session\.json/);
    });
  }));

  results.push(record("writer materializes JSON and Markdown drill artifacts", () => {
    withFixture("mainline-drill-write-", (root) => {
      writeActiveSession(root, {
        id: "change-write",
        summary: "Write drill",
        orchestrationMode: "prompt",
        laneDecision: { lane: "fast", reasons: [], autoPromoted: false },
        nextCommands: [{ command: "npm run jispec-cli -- verify --fast", description: "Verify." }],
      });

      const result = writeMainlineRecoveryDrill(root);
      assert.equal(result.jsonPath, ".jispec/recovery/mainline-drill.json");
      assert.equal(result.markdownPath, ".jispec/recovery/mainline-drill.md");
      assert.ok(fs.existsSync(path.join(root, result.jsonPath)));
      assert.ok(fs.existsSync(path.join(root, result.markdownPath)));
      const parsed = JSON.parse(fs.readFileSync(path.join(root, result.jsonPath), "utf-8")) as { steps?: unknown[] };
      const markdown = fs.readFileSync(path.join(root, result.markdownPath), "utf-8");
      assert.equal(parsed.steps?.length, 1);
      assert.match(markdown, /Expected next state/);
      assert.match(markdown, /Does not execute commands/);
    });
  }));

  results.push(await recordAsync("doctor mainline exposes drill summary and CLI can write drill artifacts", async () => {
    await withFixtureAsync("mainline-drill-doctor-", async (root) => {
      writeActiveSession(root, {
        id: "change-doctor",
        summary: "Doctor drill",
        orchestrationMode: "prompt",
        laneDecision: { lane: "fast", reasons: [], autoPromoted: false },
        nextCommands: [{ command: "npm run jispec-cli -- verify --fast", description: "Verify." }],
      });

      const report = await new Doctor(root).checkMainlineReadiness();
      const check = report.checks.find((candidate) => candidate.name === "Mainline Flow Recovery");
      assert.ok(check);
      assert.equal(check.recoveryDrill?.status, "ready");
      assert.equal(check.recoveryDrill?.steps[0]?.expectedNextState.includes("active session"), true);

      const cli = runCli(["doctor", "mainline", "--root", root, "--write-drill", "--json"]);
      assert.ok([0, 1].includes(cli.status ?? -1), cli.stderr);
      const payload = JSON.parse(cli.stdout) as { recoveryDrillWrite?: { jsonPath?: string; markdownPath?: string } };
      assert.equal(payload.recoveryDrillWrite?.jsonPath, ".jispec/recovery/mainline-drill.json");
      assert.equal(payload.recoveryDrillWrite?.markdownPath, ".jispec/recovery/mainline-drill.md");
      assert.ok(fs.existsSync(path.join(root, ".jispec", "recovery", "mainline-drill.json")));
    });
  }));

  results.push(record("Console and North Star acceptance can reference the drill packet", () => {
    withFixture("mainline-drill-console-", (root) => {
      writeActiveSession(root, {
        id: "change-console",
        summary: "Console drill",
        orchestrationMode: "prompt",
        laneDecision: { lane: "fast", reasons: [], autoPromoted: false },
        nextCommands: [{ command: "npm run jispec-cli -- verify --fast", description: "Verify." }],
      });
      writeMainlineRecoveryDrill(root);

      const snapshot = collectConsoleLocalSnapshot(root);
      const drillObject = snapshot.governance.objects.find((object) => object.id === "mainline_recovery_drill");
      assert.ok(drillObject);
      assert.equal(drillObject.status, "available");
      assert.equal(drillObject.summary.stepCount, 1);
      assert.match(String(drillObject.summary.topStepExpectedNextState), /active session/);

      const acceptance = buildNorthStarAcceptance({ root, generatedAt: "2026-05-22T00:00:00.000Z" });
      const scenario = acceptance.scenarios.find((candidate) => candidate.id === "mainline_recovery_drill");
      assert.ok(scenario);
      assert.equal(scenario.status, "passed");
      assert.equal(scenario.evidence?.mainlineRecoveryDrillStepCount, 1);
      assert.match(scenario.evidence?.mainlineRecoveryDrillExpectedNextState ?? "", /active session/);
    });
  }));

  results.push(record("phase-9 drill suite is registered in change-implement matrix", () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "mainline-recovery-drill.ts");
    assert.ok(suite);
    assert.equal(suite.area, "change-implement");
    assert.equal(suite.expectedTests, 6);
    assert.equal(suite.task, "North-Star-Score-Phase-9");
  }));

  printResults(results);
}

function withFixture(prefix: string, run: (root: string) => void): void {
  const root = fixtureRoot(prefix);
  try {
    run(root);
  } finally {
    cleanup(root);
  }
}

async function withFixtureAsync(prefix: string, run: (root: string) => Promise<void>): Promise<void> {
  const root = fixtureRoot(prefix);
  try {
    await run(root);
  } finally {
    cleanup(root);
  }
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
      sourceSession: { id: sessionId, summary: "Replay session", laneDecision: { lane: "strict" }, changedPaths: [], nextCommands: [] },
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
    metadata: { createdAt, startedAt: createdAt, completedAt: createdAt },
  });
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const cliPath = path.join(repoRoot, "tools", "jispec", "cli.ts");
  const result = spawnSync(process.execPath, ["--import", "tsx", cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf-8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function recordAsync(name: string, fn: () => Promise<void>): Promise<TestResult> {
  try {
    await fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error instanceof Error ? error.message : String(error) };
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
