import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as yaml from "js-yaml";
import { evaluateChangeExecuteDefaultReadiness } from "../change/orchestration-config";
import { cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

interface DoctorReport {
  checks?: Array<{ name?: string; status?: string; summary?: string; details?: string[] }>;
  profile?: string;
  ready?: boolean;
}

async function main(): Promise<void> {
  console.log("=== Doctor Mainline Readiness Tests ===\n");

  let passed = 0;
  let failed = 0;

  try {
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    const cliEntry = path.join(repoRoot, "tools", "jispec", "cli.ts");
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", cliEntry, "doctor", "mainline", "--root", repoRoot, "--json"],
      {
        cwd: repoRoot,
        encoding: "utf-8",
      },
    );

    if (![0, 1].includes(result.status ?? -1)) {
      throw new Error(`doctor mainline exited with unexpected status ${result.status}. stderr: ${result.stderr}`);
    }

    const report = JSON.parse(result.stdout) as DoctorReport;
    assert.equal(report.profile, "mainline");
    assert.ok(Array.isArray(report.checks));
    assert.ok((report.checks?.length ?? 0) > 0);
    console.log("✓ Test 1: doctor mainline returns a machine-readable mainline report");
    passed++;

    const checkNames = new Set((report.checks ?? []).map((check) => check.name));
    for (const requiredName of [
      "Bootstrap Mainline Surface",
      "Verify Runtime Surface",
      "Verify Mitigation Surface",
      "Facts & Policy Surface",
      "CI Verify Surface",
      "Change / Implement Mainline Surface",
      "Execute-Default Mediation Readiness",
      "V1 Regression Coverage",
    ]) {
      assert.ok(checkNames.has(requiredName), `Missing mainline readiness check: ${requiredName}`);
    }
    console.log("✓ Test 2: doctor mainline focuses on the bootstrap/verify/ci/change/implement mainline surfaces");
    passed++;

    for (const deferredName of [
      "Collaboration Engine",
      "Conflict Resolution",
      "Collaboration Awareness",
      "Collaboration Locking",
      "Collaboration Notifications",
      "Collaboration Analytics",
      "Resource Management",
      "Fault Recovery",
    ]) {
      assert.ok(!checkNames.has(deferredName), `Deferred surface leaked into doctor mainline: ${deferredName}`);
    }
    console.log("✓ Test 3: doctor mainline does not let deferred collaboration/distributed surfaces participate in mainline readiness");
    passed++;

    const executeDefaultCheck = (report.checks ?? []).find((check) => check.name === "Execute-Default Mediation Readiness");
    assert.equal(executeDefaultCheck?.status, "pass");
    assert.ok(executeDefaultCheck?.summary);
    assert.ok(executeDefaultCheck?.details?.some((detail) => detail.includes("Current default:")));
    assert.ok(executeDefaultCheck?.details?.some((detail) => detail.includes("Default change mode:")));
    assert.ok(executeDefaultCheck?.details?.some((detail) => detail.includes("Decision:")));
    assert.ok(executeDefaultCheck?.details?.some((detail) => detail.includes("Blockers:")));
    assert.ok(executeDefaultCheck?.details?.some((detail) => detail.includes("Current default: execute")));
    assert.ok(executeDefaultCheck?.details?.some((detail) => detail.includes("Decision: Execute-default mediation is configured and ready")));
    assert.ok(executeDefaultCheck?.details?.some((detail) => detail.includes("Blockers: none")));
    assert.ok(executeDefaultCheck?.details?.some((detail) => detail.includes("Guardrail: execute-default only enters implementation mediation")));
    assert.ok(executeDefaultCheck?.details?.some((detail) => detail.includes("Mode precedence: explicit --mode prompt or --mode execute overrides project configuration.")));
    assert.ok(executeDefaultCheck?.details?.some((detail) => detail.includes("Project default scope: change.default_mode applies only when --mode is omitted.")));
    assert.ok(executeDefaultCheck?.details?.some((detail) => detail.includes("Adopt boundary: strict-lane changes still stop before implement")));
    assert.ok(executeDefaultCheck?.details?.some((detail) => detail.includes("Adopt boundary status:")));
    assert.ok(executeDefaultCheck?.details?.some((detail) => detail.includes("Open bootstrap draft:")));
    assert.ok(executeDefaultCheck?.details?.some((detail) => detail.includes("Implementation ownership: JiSpec does not generate or own business-code implementation.")));
    assert.ok(executeDefaultCheck?.details?.some((detail) => detail.includes("Next action:")));
    console.log("✓ Test 4: doctor mainline reports execute-default readiness as a decision packet");
    passed++;

    const promptRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-doctor-prompt-"));
    try {
      const readiness = evaluateChangeExecuteDefaultReadiness(promptRoot);
      assert.equal(readiness.defaultMode, "prompt");
      assert.equal(readiness.source, "built_in_default");
      assert.equal(readiness.readyForExecuteDefault, false);
      assert.equal(readiness.openDraftSessionId, undefined);
      assert.equal(readiness.boundary.promptModeRecordsOnly, true);
      assert.equal(readiness.boundary.executeModeRunsMediationAndVerify, true);
      assert.equal(readiness.boundary.explicitCliModeOverridesProjectDefault, true);
      assert.equal(readiness.boundary.projectDefaultAppliesOnlyWhenModeOmitted, true);
      assert.equal(readiness.boundary.businessCodeGeneratedByJiSpec, false);
      assert.equal(readiness.boundary.adoptBoundary.status, "clear");
      assert.equal(readiness.canSetExecuteDefault, false);
      assert.ok(readiness.blockers?.some((entry) => entry.includes(".spec/policy.yaml is missing")));
      assert.ok(readiness.details.some((detail) => detail.includes("Decision: Prompt remains the default")));
      assert.ok(readiness.details.some((detail) => detail.includes("set change.default_mode: execute")));
    } finally {
      fs.rmSync(promptRoot, { recursive: true, force: true });
    }
    console.log("✓ Test 5: execute-default decision packet explains the built-in prompt default");
    passed++;

    const executeRoot = createVerifyFixture("doctor-execute");
    try {
      writeProjectConfig(executeRoot, "execute");
      writeStarterPolicy(executeRoot);
      const readiness = evaluateChangeExecuteDefaultReadiness(executeRoot);
      assert.equal(readiness.defaultMode, "execute");
      assert.equal(readiness.source, "project_config");
      assert.equal(readiness.readyForExecuteDefault, true);
      assert.equal(readiness.canSetExecuteDefault, true);
      assert.equal(readiness.openDraftSessionId, undefined);
      assert.equal(readiness.boundary.adoptBoundary.status, "clear");
      assert.ok(readiness.details.some((detail) => detail.includes("Decision: Execute-default mediation is configured and ready")));
      assert.ok(readiness.details.some((detail) => detail.includes("run change without --mode")));
      assert.ok(readiness.details.some((detail) => detail.includes("does not generate business code autonomously")));
    } finally {
      cleanupVerifyFixture(executeRoot);
    }
    console.log("✓ Test 6: execute-default decision packet explains project-configured execute mode");
    passed++;

    const openDraftRoot = createVerifyFixture("doctor-open-draft");
    try {
      writeProjectConfig(openDraftRoot, "execute");
      writeStarterPolicy(openDraftRoot);
      writeOpenDraftManifest(openDraftRoot, "bootstrap-open");
      const readiness = evaluateChangeExecuteDefaultReadiness(openDraftRoot);
      assert.equal(readiness.defaultMode, "execute");
      assert.equal(readiness.readyForExecuteDefault, true);
      assert.equal(readiness.canSetExecuteDefault, true);
      assert.equal(readiness.openDraftSessionId, "bootstrap-open");
      assert.equal(readiness.boundary.strictLaneOpenDraftAction, "pause_at_adopt_boundary");
      assert.equal(readiness.boundary.adoptBoundary.status, "open_draft_pause_required");
      assert.equal(readiness.boundary.adoptBoundary.openDraftSessionId, "bootstrap-open");
      assert.equal(readiness.boundary.adoptBoundary.nextAction, "npm run jispec-cli -- adopt --interactive --session bootstrap-open");
      assert.ok(readiness.details.some((detail) => detail.includes("Open bootstrap draft: bootstrap-open")));
      assert.ok(readiness.details.some((detail) => detail.includes("adopt --interactive --session bootstrap-open")));
      assert.ok(readiness.details.some((detail) => detail.includes("strict-lane execute-default")));
    } finally {
      cleanupVerifyFixture(openDraftRoot);
    }
    console.log("✓ Test 7: execute-default decision packet preserves the open-draft adopt boundary");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
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

function writeProjectConfig(root: string, defaultMode: "prompt" | "execute"): void {
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  const projectPath = path.join(root, "jiproject", "project.yaml");
  const parsed = fs.existsSync(projectPath)
    ? yaml.load(fs.readFileSync(projectPath, "utf-8"))
    : {
        id: "doctor-execute-default-fixture",
        name: "Doctor Execute Default Fixture",
      };
  const project = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {
        id: "doctor-execute-default-fixture",
        name: "Doctor Execute Default Fixture",
      };
  const change = typeof project.change === "object" && project.change !== null && !Array.isArray(project.change)
    ? project.change as Record<string, unknown>
    : {};
  change.default_mode = defaultMode;
  project.change = change;

  fs.writeFileSync(
    projectPath,
    yaml.dump(project, { lineWidth: 100, noRefs: true, sortKeys: false }),
    "utf-8",
  );
}

function writeStarterPolicy(root: string): void {
  fs.mkdirSync(path.join(root, ".spec"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".spec", "policy.yaml"),
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
