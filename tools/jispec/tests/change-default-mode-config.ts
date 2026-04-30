import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as yaml from "js-yaml";
import { cleanupVerifyFixture, createVerifyFixture, getRepoRoot } from "./verify-test-helpers";

interface CommandExecution {
  status: number | null;
  stdout: string;
  stderr: string;
}

interface DefaultModePayload {
  action?: string;
  currentMode?: string;
  previousMode?: string;
  source?: string;
  configPath?: string;
  historyPath?: string;
  warnings?: string[];
  nextActions?: string[];
  readiness?: {
    defaultMode?: string;
    source?: string;
    readyForExecuteDefault?: boolean;
    openDraftSessionId?: string;
    details?: string[];
  };
}

function main(): void {
  console.log("=== Change Default Mode Config Tests ===\n");

  let passed = 0;
  let failed = 0;

  const fixture = createVerifyFixture("change-default-mode-config");
  try {
    const show = runCli(["change", "default-mode", "show", "--root", fixture, "--json"]);
    assert.equal(show.status, 0, `show exited with ${show.status}. stderr: ${show.stderr}`);
    const payload = JSON.parse(show.stdout) as DefaultModePayload;
    assert.equal(payload.action, "show");
    assert.equal(payload.currentMode, "prompt");
    assert.equal(payload.source, "built_in_default");
    assert.equal(payload.readiness?.readyForExecuteDefault, false);
    assert.ok(payload.nextActions?.some((action) => action.includes("set execute")));
    console.log("✓ Test 1: show reports the built-in prompt default before project config exists");
    passed++;
  } catch (error) {
    failed += reportFailure(passed + failed + 1, error);
  }

  try {
    const setExecute = runCli([
      "change",
      "default-mode",
      "set",
      "execute",
      "--root",
      fixture,
      "--actor",
      "n7-test",
      "--reason",
      "enable execute default",
      "--json",
    ]);
    assert.equal(setExecute.status, 0, `set execute exited with ${setExecute.status}. stderr: ${setExecute.stderr}`);
    const payload = JSON.parse(setExecute.stdout) as DefaultModePayload;
    const project = readProject(fixture);
    assert.equal(payload.action, "set");
    assert.equal(payload.currentMode, "execute");
    assert.equal(payload.previousMode, "prompt");
    assert.equal(payload.source, "project_config");
    assert.equal(payload.readiness?.readyForExecuteDefault, true);
    assert.equal((project.change as Record<string, unknown>).default_mode, "execute");
    assert.ok(payload.historyPath?.endsWith(".jispec/change-default-mode-history.jsonl"));
    console.log("✓ Test 2: set execute writes project config and reports execute readiness");
    passed++;
  } catch (error) {
    failed += reportFailure(passed + failed + 1, error);
  }

  try {
    const setPrompt = runCli([
      "change",
      "default-mode",
      "set",
      "prompt",
      "--root",
      fixture,
      "--actor",
      "n7-test",
      "--reason",
      "rollback to prompt",
      "--json",
    ]);
    assert.equal(setPrompt.status, 0, `set prompt exited with ${setPrompt.status}. stderr: ${setPrompt.stderr}`);
    const payload = JSON.parse(setPrompt.stdout) as DefaultModePayload;
    const project = readProject(fixture);
    assert.equal(payload.currentMode, "prompt");
    assert.equal(payload.previousMode, "execute");
    assert.equal(payload.source, "project_config");
    assert.equal(payload.readiness?.readyForExecuteDefault, false);
    assert.equal((project.change as Record<string, unknown>).default_mode, "prompt");
    console.log("✓ Test 3: set prompt provides the rollback path while preserving project config");
    passed++;
  } catch (error) {
    failed += reportFailure(passed + failed + 1, error);
  }

  try {
    const reset = runCli([
      "change",
      "default-mode",
      "reset",
      "--root",
      fixture,
      "--actor",
      "n7-test",
      "--reason",
      "return to built-in default",
      "--json",
    ]);
    assert.equal(reset.status, 0, `reset exited with ${reset.status}. stderr: ${reset.stderr}`);
    const payload = JSON.parse(reset.stdout) as DefaultModePayload;
    const project = readProject(fixture);
    assert.equal(payload.action, "reset");
    assert.equal(payload.currentMode, "prompt");
    assert.equal(payload.previousMode, "prompt");
    assert.equal(payload.source, "built_in_default");
    assert.equal(project.change, undefined);
    assert.ok(payload.nextActions?.some((action) => action.includes("Prompt is the default again")));
    console.log("✓ Test 4: reset removes change.default_mode and returns to built-in prompt");
    passed++;
  } catch (error) {
    failed += reportFailure(passed + failed + 1, error);
  }

  try {
    const entries = readHistory(fixture);
    assert.equal(entries.length, 3);
    assert.deepEqual(entries.map((entry) => entry.action), ["set", "set", "reset"]);
    assert.deepEqual(entries.map((entry) => entry.nextMode), ["execute", "prompt", "prompt"]);
    assert.ok(entries.every((entry) => entry.actor === "n7-test"));
    assert.ok(entries[0].reason === "enable execute default");
    assert.ok(entries[0].readiness.readyForExecuteDefault === true);
    console.log("✓ Test 5: history jsonl records every default-mode transition");
    passed++;
  } catch (error) {
    failed += reportFailure(passed + failed + 1, error);
  } finally {
    cleanupVerifyFixture(fixture);
  }

  const invalidConfigFixture = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-change-default-invalid-"));
  try {
    fs.mkdirSync(path.join(invalidConfigFixture, "jiproject"), { recursive: true });
    fs.writeFileSync(
      path.join(invalidConfigFixture, "jiproject", "project.yaml"),
      [
        "id: invalid-default-mode",
        "name: Invalid Default Mode",
        "change:",
        "  default_mode: invalid",
        "",
      ].join("\n"),
      "utf-8",
    );
    const setExecute = runCli([
      "change",
      "default-mode",
      "set",
      "execute",
      "--root",
      invalidConfigFixture,
      "--json",
    ]);
    assert.equal(setExecute.status, 1);
    assert.match(setExecute.stderr, /Cannot enable execute-default until configuration warning/);
    assert.equal(fs.existsSync(path.join(invalidConfigFixture, ".jispec", "change-default-mode-history.jsonl")), false);
    console.log("✓ Test 6: set execute is blocked when existing default-mode config has warnings");
    passed++;
  } catch (error) {
    failed += reportFailure(passed + failed + 1, error);
  } finally {
    fs.rmSync(invalidConfigFixture, { recursive: true, force: true });
  }

  const openDraftFixture = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-change-default-open-draft-"));
  try {
    writeOpenDraftManifest(openDraftFixture, "bootstrap-open");
    const setExecute = runCli([
      "change",
      "default-mode",
      "set",
      "execute",
      "--root",
      openDraftFixture,
      "--json",
    ]);
    assert.equal(setExecute.status, 0, `set execute with open draft exited with ${setExecute.status}. stderr: ${setExecute.stderr}`);
    const payload = JSON.parse(setExecute.stdout) as DefaultModePayload;
    assert.equal(payload.currentMode, "execute");
    assert.equal(payload.readiness?.openDraftSessionId, "bootstrap-open");
    assert.ok(payload.warnings?.some((warning) => warning.includes("strict-lane execute-default still pauses at adopt")));
    assert.ok(payload.nextActions?.some((action) => action.includes("adopt --interactive --session bootstrap-open")));
    console.log("✓ Test 7: set execute allows open drafts but surfaces the adopt-boundary warning");
    passed++;
  } catch (error) {
    failed += reportFailure(passed + failed + 1, error);
  } finally {
    fs.rmSync(openDraftFixture, { recursive: true, force: true });
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

function runCli(args: string[]): CommandExecution {
  const repoRoot = getRepoRoot();
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

function readProject(root: string): Record<string, unknown> {
  return yaml.load(fs.readFileSync(path.join(root, "jiproject", "project.yaml"), "utf-8")) as Record<string, unknown>;
}

function readHistory(root: string): Array<Record<string, any>> {
  return fs.readFileSync(path.join(root, ".jispec", "change-default-mode-history.jsonl"), "utf-8")
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
}

function writeOpenDraftManifest(root: string, sessionId: string): void {
  const sessionRoot = path.join(root, ".spec", "sessions", sessionId);
  fs.mkdirSync(sessionRoot, { recursive: true });
  fs.writeFileSync(
    path.join(sessionRoot, "manifest.json"),
    JSON.stringify({
      sessionId,
      repoRoot: root,
      sourceEvidenceGraphPath: ".spec/facts/bootstrap/evidence-graph.json",
      createdAt: "2026-04-30T00:00:00.000Z",
      updatedAt: "2026-04-30T00:00:00.000Z",
      status: "drafted",
      artifactPaths: [],
      artifacts: [],
    }, null, 2),
    "utf-8",
  );
}

function reportFailure(testNumber: number, error: unknown): 1 {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`✗ Test ${testNumber} failed: ${message}`);
  return 1;
}

main();
