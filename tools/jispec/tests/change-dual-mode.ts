import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readArchivedChangeSession, readChangeSession } from "../change/change-session";
import { cleanupVerifyFixture, createVerifyFixture, getRepoRoot } from "./verify-test-helpers";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface CommandExecution {
  status: number | null;
  stdout: string;
  stderr: string;
}

function main(): void {
  console.log("=== Change Dual Mode Tests ===\n");

  let passed = 0;
  let failed = 0;

  const promptFixture = createVerifyFixture("change-mode-prompt");
  try {
    seedDocsFixture(promptFixture);
    initializeGitRepository(promptFixture);
    fs.appendFileSync(path.join(promptFixture, "README.md"), "\nPrompt mode docs-only change.\n", "utf-8");

    const change = runCli([
      "change",
      "Document prompt mode",
      "--root",
      promptFixture,
      "--lane",
      "fast",
      "--mode",
      "prompt",
      "--json",
    ]);

    assert.equal(change.status, 0, `prompt mode exited with ${change.status}. stderr: ${change.stderr}`);
    const payload = JSON.parse(change.stdout) as {
      id?: string;
      mode?: string;
      orchestrationMode?: string;
      execution?: {
        mode?: string;
        state?: string;
      };
      laneDecision?: {
        lane?: string;
      };
    };

    const activeSession = readChangeSession(promptFixture);

    assert.equal(payload.mode, "prompt");
    assert.equal(payload.orchestrationMode, "prompt");
    assert.equal(payload.execution?.mode, "prompt");
    assert.equal(payload.execution?.state, "planned");
    assert.equal(payload.laneDecision?.lane, "fast");
    assert.equal(activeSession?.id, payload.id);
    assert.equal(activeSession?.orchestrationMode, "prompt");
    console.log("✓ Test 1: prompt mode records the change session and returns next-step hints without executing downstream steps");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(promptFixture);
  }

  const executeFastFixture = createVerifyFixture("change-mode-execute-fast");
  try {
    seedDocsFixture(executeFastFixture);
    initializeGitRepository(executeFastFixture);
    fs.appendFileSync(path.join(executeFastFixture, "README.md"), "\nExecute mode docs-only change.\n", "utf-8");

    const change = runCli([
      "change",
      "Document execute mode",
      "--root",
      executeFastFixture,
      "--lane",
      "fast",
      "--mode",
      "execute",
      "--test-command",
      'node -e "process.exit(0)"',
      "--json",
    ]);

    assert.equal(change.status, 0, `execute fast mode exited with ${change.status}. stderr: ${change.stderr}`);
    const payload = JSON.parse(change.stdout) as {
      id?: string;
      mode?: string;
      execution?: {
        mode?: string;
        state?: string;
        implement?: {
          lane?: string;
          testsPassed?: boolean;
          sessionArchived?: boolean;
          postVerifyVerdict?: string;
          postVerifyCommand?: string;
        };
      };
    };

    assert.equal(payload.mode, "execute");
    assert.equal(payload.execution?.mode, "execute");
    assert.equal(payload.execution?.state, "implemented");
    assert.equal(payload.execution?.implement?.lane, "fast");
    assert.equal(payload.execution?.implement?.testsPassed, true);
    assert.equal(payload.execution?.implement?.postVerifyVerdict, "PASS");
    assert.equal(payload.execution?.implement?.postVerifyCommand, "npm run jispec-cli -- verify --fast");
    assert.equal(payload.execution?.implement?.sessionArchived, true);
    assert.equal(readChangeSession(executeFastFixture), null);
    assert.ok(payload.id);
    assert.ok(readArchivedChangeSession(executeFastFixture, payload.id ?? ""));
    console.log("✓ Test 2: execute mode runs the fast-lane implement flow and archives the session after post-implement verify passes");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(executeFastFixture);
  }

  const strictFixture = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-change-mode-strict-"));
  try {
    seedStrictFixture(strictFixture);
    initializeGitRepository(strictFixture);
    fs.mkdirSync(path.join(strictFixture, ".spec", "sessions", "bootstrap-test"), { recursive: true });
    fs.writeFileSync(
      path.join(strictFixture, ".spec", "sessions", "bootstrap-test", "manifest.json"),
      JSON.stringify({
        sessionId: "bootstrap-test",
        repoRoot: strictFixture,
        sourceEvidenceGraphPath: ".spec/facts/bootstrap/evidence-graph.json",
        createdAt: "2026-04-27T00:00:00.000Z",
        updatedAt: "2026-04-27T00:00:00.000Z",
        status: "drafted",
        artifactPaths: [],
        artifacts: [],
      }, null, 2),
      "utf-8",
    );
    fs.appendFileSync(path.join(strictFixture, "src", "domain", "order.ts"), "\nexport const touched = true;\n", "utf-8");

    const change = runCli([
      "change",
      "Update order domain model",
      "--root",
      strictFixture,
      "--lane",
      "fast",
      "--mode",
      "execute",
      "--json",
    ]);

    assert.equal(change.status, 0, `execute strict mode exited with ${change.status}. stderr: ${change.stderr}`);
    const payload = JSON.parse(change.stdout) as {
      id?: string;
      laneDecision?: {
        lane?: string;
        autoPromoted?: boolean;
      };
      execution?: {
        mode?: string;
        state?: string;
        blockedOn?: string;
        openDraftSessionId?: string;
      };
      nextCommands?: Array<{ command?: string }>;
    };

    assert.equal(payload.laneDecision?.lane, "strict");
    assert.equal(payload.laneDecision?.autoPromoted, true);
    assert.equal(payload.execution?.mode, "execute");
    assert.equal(payload.execution?.state, "awaiting_adopt");
    assert.equal(payload.execution?.blockedOn, "adopt");
    assert.equal(payload.execution?.openDraftSessionId, "bootstrap-test");
    assert.equal(payload.nextCommands?.[0]?.command, "npm run jispec-cli -- adopt --interactive --session bootstrap-test");
    assert.equal(readChangeSession(strictFixture)?.id, payload.id);
    console.log("✓ Test 3: execute mode pauses at the adopt boundary when a strict-lane change still has an open bootstrap draft");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    fs.rmSync(strictFixture, { recursive: true, force: true });
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

function seedDocsFixture(root: string): void {
  fs.writeFileSync(
    path.join(root, "README.md"),
    "# Change Dual Mode Fixture\n\nThis repo exercises prompt and execute change flows.\n",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "change-dual-mode-fixture",
      private: true,
      scripts: {
        test: 'node -e "process.exit(0)"',
      },
    }, null, 2),
    "utf-8",
  );
}

function seedStrictFixture(root: string): void {
  fs.writeFileSync(path.join(root, "README.md"), "# Strict Execute Fixture\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "strict-execute-fixture", private: true }, null, 2), "utf-8");
  fs.mkdirSync(path.join(root, "src", "domain"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "domain", "order.ts"),
    "export interface Order { id: string; }\n",
    "utf-8",
  );
}

function initializeGitRepository(root: string): void {
  const commands: Array<{ program: string; args: string[]; label: string }> = [
    { program: "git", args: ["init"], label: "git init" },
    { program: "git", args: ["config", "user.email", "change-mode@example.com"], label: "git config user.email" },
    { program: "git", args: ["config", "user.name", "JiSpec Change Mode"], label: "git config user.name" },
    { program: "git", args: ["add", "."], label: "git add ." },
    { program: "git", args: ["commit", "-m", "Initial fixture baseline"], label: "git commit" },
  ];

  for (const command of commands) {
    const result = spawnSync(command.program, command.args, {
      cwd: root,
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      throw new Error(`Failed to initialize git repository at step '${command.label}': ${result.stderr}`);
    }
  }
}

main();
