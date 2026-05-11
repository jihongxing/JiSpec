import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as yaml from "js-yaml";
import { runChangeCommand, type ChangeCommandResult } from "../change/change-command";
import { readArchivedChangeSession, readChangeSession } from "../change/change-session";
import { cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Change Dual Mode Tests ===\n");

  let passed = 0;
  let failed = 0;

  const promptFixture = createVerifyFixture("change-mode-default-prompt");
  try {
    removeProjectDefaultMode(promptFixture);
    seedDocsFixture(promptFixture);
    initializeGitRepository(promptFixture);
    fs.appendFileSync(path.join(promptFixture, "README.md"), "\nDefault prompt mode docs-only change.\n", "utf-8");

    const payload = runChangeCommand({
      root: promptFixture,
      summary: "Document default prompt mode",
      lane: "fast",
      json: true,
    }) as unknown as Promise<ChangeCommandResult>;

    const result = await payload;
    const activeSession = readChangeSession(promptFixture);

    assert.equal(result.mode, "prompt");
    assert.equal(result.modeResolution.source, "built_in_default");
    assert.equal(result.session.orchestrationMode, "prompt");
    assert.equal(result.execution.mode, "prompt");
    assert.equal(result.execution.state, "planned");
    assert.equal(result.execution.boundary.promptModeRecordsOnly, true);
    assert.equal(result.execution.boundary.executeModeRunsMediationAndVerify, true);
    assert.equal(result.execution.boundary.projectDefaultAppliesOnlyWhenModeOmitted, true);
    assert.equal(result.execution.boundary.businessCodeGeneratedByJiSpec, false);
    assert.equal(result.execution.boundary.adoptBoundary.status, "not_applicable");
    assert.equal(result.session.laneDecision.lane, "fast");
    assert.equal(activeSession?.id, result.session.id);
    assert.equal(activeSession?.orchestrationMode, "prompt");
    console.log("✓ Test 1: built-in default prompt mode records the change session without executing downstream steps");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(promptFixture);
  }

  const explicitPromptFixture = createVerifyFixture("change-mode-explicit-prompt");
  try {
    seedDocsFixture(explicitPromptFixture);
    writeExecuteDefaultProjectConfig(explicitPromptFixture);
    initializeGitRepository(explicitPromptFixture);
    fs.appendFileSync(path.join(explicitPromptFixture, "README.md"), "\nExplicit prompt mode docs-only change.\n", "utf-8");

    const payload = runChangeCommand({
      root: explicitPromptFixture,
      summary: "Document explicit prompt mode",
      lane: "fast",
      mode: "prompt",
      json: true,
    }) as unknown as Promise<ChangeCommandResult>;
    const result = await payload;

    assert.equal(result.mode, "prompt");
    assert.equal(result.session.orchestrationMode, "prompt");
    assert.equal(result.modeResolution.source, "cli");
    assert.equal(result.execution.mode, "prompt");
    assert.equal(result.execution.state, "planned");
    assert.equal(result.execution.implement, undefined);
    assert.equal(result.execution.boundary.explicitCliModeOverridesProjectDefault, true);
    assert.equal(result.execution.boundary.businessCodeGeneratedByJiSpec, false);
    console.log("✓ Test 2: explicit prompt mode overrides project execute-default mediation");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(explicitPromptFixture);
  }

  const configuredExecuteFixture = createVerifyFixture("change-mode-configured-execute");
  try {
    seedDocsFixture(configuredExecuteFixture);
    writeExecuteDefaultProjectConfig(configuredExecuteFixture);
    initializeGitRepository(configuredExecuteFixture);
    fs.appendFileSync(path.join(configuredExecuteFixture, "README.md"), "\nConfigured execute-default docs-only change.\n", "utf-8");

    const payload = runChangeCommand({
      root: configuredExecuteFixture,
      summary: "Document configured execute default",
      lane: "fast",
      testCommand: 'node -e "process.exit(0)"',
      json: true,
    }) as unknown as Promise<ChangeCommandResult>;
    const result = await payload;

    assert.equal(result.mode, "execute");
    assert.equal(result.session.orchestrationMode, "execute");
    assert.equal(result.modeResolution.source, "project_config");
    assert.equal(result.execution.mode, "execute");
    assert.equal(result.execution.state, "implemented");
    assert.equal(result.execution.implement?.lane, "fast");
    assert.equal(result.execution.implement?.testsPassed, true);
    assert.equal(result.execution.implement?.postVerifyVerdict, "PASS");
    assert.equal(result.execution.implement?.sessionArchived, true);
    assert.equal(result.execution.boundary.modeSource, "project_config");
    assert.equal(result.execution.boundary.explicitCliModeOverridesProjectDefault, false);
    assert.equal(result.execution.boundary.projectDefaultAppliesOnlyWhenModeOmitted, true);
    assert.equal(result.execution.boundary.businessCodeGeneratedByJiSpec, false);
    assert.equal(result.execution.boundary.adoptBoundary.status, "not_applicable");
    assert.ok(result.session.id);
    assert.ok(readArchivedChangeSession(configuredExecuteFixture, result.session.id));
    console.log("✓ Test 3: project config can opt into execute-default mediation without --mode");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(configuredExecuteFixture);
  }

  const executeFastFixture = createVerifyFixture("change-mode-execute-fast");
  try {
    seedDocsFixture(executeFastFixture);
    writeStarterPolicy(executeFastFixture);
    initializeGitRepository(executeFastFixture);
    fs.appendFileSync(path.join(executeFastFixture, "README.md"), "\nExecute mode docs-only change.\n", "utf-8");

    const payload = runChangeCommand({
      root: executeFastFixture,
      summary: "Document execute mode",
      lane: "fast",
      mode: "execute",
      testCommand: 'node -e "process.exit(0)"',
      json: true,
    }) as unknown as Promise<ChangeCommandResult>;
    const result = await payload;

    assert.equal(result.mode, "execute");
    assert.equal(result.execution.mode, "execute");
    assert.equal(result.execution.state, "implemented");
    assert.equal(result.execution.implement?.lane, "fast");
    assert.equal(result.execution.implement?.testsPassed, true);
    assert.equal(result.execution.implement?.postVerifyVerdict, "PASS");
    assert.equal(result.execution.implement?.postVerifyCommand, "npm run jispec-cli -- verify --fast");
    assert.equal(result.execution.implement?.sessionArchived, true);
    assert.equal(result.execution.boundary.modeSource, "cli");
    assert.equal(result.execution.boundary.explicitCliModeOverridesProjectDefault, true);
    assert.equal(result.execution.boundary.adoptBoundary.status, "not_applicable");
    assert.equal(readChangeSession(executeFastFixture), null);
    assert.ok(result.session.id);
    assert.ok(readArchivedChangeSession(executeFastFixture, result.session.id));
    console.log("✓ Test 4: explicit execute mode runs the fast-lane implement flow and archives the session after post-implement verify passes");
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

    const payload = runChangeCommand({
      root: strictFixture,
      summary: "Update order domain model",
      lane: "fast",
      mode: "execute",
      json: true,
    }) as unknown as Promise<ChangeCommandResult>;
    const result = await payload;

    assert.equal(result.session.laneDecision.lane, "strict");
    assert.equal(result.session.laneDecision.autoPromoted, true);
    assert.equal(result.execution.mode, "execute");
    assert.equal(result.execution.state, "awaiting_adopt");
    assert.equal(result.execution.blockedOn, "adopt");
    assert.equal(result.execution.openDraftSessionId, "bootstrap-test");
    assert.equal(result.execution.implement, undefined);
    assert.equal(result.execution.boundary.modeSource, "cli");
    assert.equal(result.execution.boundary.businessCodeGeneratedByJiSpec, false);
    assert.equal(result.execution.boundary.adoptBoundary.enforced, true);
    assert.equal(result.execution.boundary.adoptBoundary.status, "paused_open_bootstrap_draft");
    assert.equal(result.execution.boundary.adoptBoundary.openDraftSessionId, "bootstrap-test");
    assert.equal(result.execution.boundary.adoptBoundary.nextAction, "npm run jispec-cli -- adopt --interactive --session bootstrap-test");
    assert.equal(result.session.nextCommands[0]?.command, "npm run jispec-cli -- adopt --interactive --session bootstrap-test");
    assert.equal(readChangeSession(strictFixture)?.id, result.session.id);
    console.log("✓ Test 5: execute mode pauses at the adopt boundary when a strict-lane change still has an open bootstrap draft");
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

function writeExecuteDefaultProjectConfig(root: string): void {
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  const projectPath = path.join(root, "jiproject", "project.yaml");
  const parsed = fs.existsSync(projectPath)
    ? yaml.load(fs.readFileSync(projectPath, "utf-8"))
    : {
        id: "change-dual-mode-fixture",
        name: "Change Dual Mode Fixture",
      };
  const project = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {
        id: "change-dual-mode-fixture",
        name: "Change Dual Mode Fixture",
      };
  const change = typeof project.change === "object" && project.change !== null && !Array.isArray(project.change)
    ? project.change as Record<string, unknown>
    : {};
  change.default_mode = "execute";
  project.change = change;

  fs.writeFileSync(projectPath, yaml.dump(project, { lineWidth: 100, noRefs: true, sortKeys: false }), "utf-8");
  writeStarterPolicy(root);
}

function removeProjectDefaultMode(root: string): void {
  const projectPath = path.join(root, "jiproject", "project.yaml");
  const parsed = fs.existsSync(projectPath)
    ? yaml.load(fs.readFileSync(projectPath, "utf-8"))
    : {};
  const project = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
  if (typeof project.change === "object" && project.change !== null && !Array.isArray(project.change)) {
    const change = { ...(project.change as Record<string, unknown>) };
    delete change.default_mode;
    delete change.defaultMode;
    if (Object.keys(change).length === 0) {
      delete project.change;
    } else {
      project.change = change;
    }
  }
  fs.writeFileSync(projectPath, yaml.dump(project, { lineWidth: 100, noRefs: true, sortKeys: false }), "utf-8");
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
  writeStarterPolicy(root);
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

function writeStarterPolicy(root: string): void {
  const policyPath = path.join(root, ".spec", "policy.yaml");
  fs.mkdirSync(path.dirname(policyPath), { recursive: true });
  fs.writeFileSync(
    policyPath,
    [
      "version: 1",
      "requires:",
      '  facts_contract: "1.0"',
      "team:",
      "  profile: small_team",
      "  owner: unassigned",
      "  reviewers: []",
      "rules: []",
      "",
    ].join("\n"),
    "utf-8",
  );
}

void main();
