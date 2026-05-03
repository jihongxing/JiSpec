import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildNorthStarAcceptance,
  writeNorthStarAcceptance,
  type NorthStarAcceptance,
} from "../north-star/acceptance";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== North Star Acceptance Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("acceptance contract covers all north-star scenarios without LLM blocking gates", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-north-star-ready-"));
    try {
      writeNorthStarFixture(root);
      const acceptance = buildNorthStarAcceptance({
        root,
        generatedAt: "2026-05-02T00:00:00.000Z",
      });

      assert.equal(acceptance.kind, "jispec-north-star-acceptance");
      assert.equal(acceptance.contract.version, 1);
      assert.equal(acceptance.summary.ready, true);
      assert.equal(acceptance.summary.scenarioCount, 9);
      assert.equal(acceptance.summary.blockingScenarioCount, 0);
      assert.deepEqual(acceptance.boundary, {
        localOnly: true,
        sourceUploadRequired: false,
        llmBlockingDecisionSource: false,
        deterministicLocalArtifactsOnly: true,
        replacesVerify: false,
        replacesDoctorV1: false,
        replacesDoctorRuntime: false,
        replacesDoctorPilot: false,
        replacesPostReleaseGate: false,
      });
      assert.deepEqual(acceptance.scenarios.map((scenario) => scenario.id), [
        "legacy_takeover",
        "greenfield",
        "daily_change",
        "external_patch_mediation",
        "policy_waiver",
        "release_drift",
        "console_governance",
        "multi_repo_aggregation",
        "privacy_report",
      ]);
      const releaseDrift = acceptance.scenarios.find((scenario) => scenario.id === "release_drift");
      assert.equal(releaseDrift?.evidence?.governedRequirementEvolution, true);
      assert.match(releaseDrift?.evidence?.summary ?? "", /lifecycle\.yaml/);
      assert.match(releaseDrift?.evidence?.summary ?? "", /last adopted change change-1/);
      assert.ok(acceptance.proofClaims.verifiable);
      assert.ok(acceptance.proofClaims.auditable);
      assert.ok(acceptance.proofClaims.blockable);
      assert.ok(acceptance.proofClaims.replayable);
      assert.ok(acceptance.proofClaims.localFirst);
      assert.ok(acceptance.proofClaims.externalToolsControlled);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("missing scenario artifacts become blockers with owner actions and next commands", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-north-star-missing-"));
    try {
      writeText(root, "package.json", JSON.stringify({ scripts: { jispec: "jispec" } }, null, 2));
      const acceptance = buildNorthStarAcceptance({
        root,
        generatedAt: "2026-05-02T00:00:00.000Z",
      });

      assert.equal(acceptance.summary.ready, false);
      assert.ok(acceptance.summary.blockingScenarioCount >= 7);
      assert.ok(acceptance.scenarios.some((scenario) => scenario.id === "legacy_takeover" && scenario.status === "blocking"));
      assert.ok(acceptance.scenarios.every((scenario) => scenario.ownerAction.length > 0));
      assert.ok(acceptance.scenarios.every((scenario) => scenario.nextCommand.length > 0));
      assert.ok(acceptance.blockers.every((blocker) => blocker.requiredArtifacts.length > 0));
      assert.deepEqual(
        acceptance.blockers
          .filter((blocker) =>
            [
              "greenfield",
              "daily_change",
              "external_patch_mediation",
              "policy_waiver",
              "release_drift",
              "multi_repo_aggregation",
              "privacy_report",
            ].includes(blocker.scenarioId),
          )
          .map((blocker) => blocker.task?.id),
        ["W2-T1", "W2-T2", "W3-T1", "W3-T2", "W4-T1", "W4-T2", "W5-T1"],
      );
      assert.ok(
        acceptance.blockers
          .filter((blocker) =>
            [
              "greenfield",
              "daily_change",
              "external_patch_mediation",
              "policy_waiver",
              "release_drift",
              "multi_repo_aggregation",
              "privacy_report",
            ].includes(blocker.scenarioId),
          )
          .every((blocker) => Boolean(blocker.task?.acceptanceCommand)),
      );
      assert.equal(acceptance.boundary.llmBlockingDecisionSource, false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("writer and CLI emit aggregate plus per-scenario machine artifacts and decision packets", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-north-star-cli-"));
    try {
      writeNorthStarFixture(root);
      const written = writeNorthStarAcceptance({
        root,
        generatedAt: "2026-05-02T00:00:00.000Z",
      });

      assert.equal(fs.existsSync(written.acceptancePath), true);
      assert.equal(fs.existsSync(written.decisionPacketPath), true);
      const saved = JSON.parse(fs.readFileSync(written.acceptancePath, "utf-8")) as NorthStarAcceptance;
      assert.equal(saved.summary.ready, true);
      for (const scenario of saved.scenarios) {
        assert.equal(fs.existsSync(path.join(root, scenario.machineArtifactPath)), true, scenario.id);
        assert.equal(fs.existsSync(path.join(root, scenario.humanDecisionPacketPath)), true, scenario.id);
        assert.match(fs.readFileSync(path.join(root, scenario.humanDecisionPacketPath), "utf-8"), /Decision Snapshot/);
      }
      const greenfieldScenario = saved.scenarios.find((scenario) => scenario.id === "greenfield");
      const dailyChangeScenario = saved.scenarios.find((scenario) => scenario.id === "daily_change");
      const releaseDriftScenario = saved.scenarios.find((scenario) => scenario.id === "release_drift");
      assert.equal(greenfieldScenario?.task?.id, "W2-T1");
      assert.equal(dailyChangeScenario?.task?.id, "W2-T2");
      assert.equal(releaseDriftScenario?.evidence?.lifecycleRegistryPath, ".spec/requirements/lifecycle.yaml");
      assert.equal(releaseDriftScenario?.evidence?.lifecycleRegistryVersion, 2);
      assert.match(fs.readFileSync(path.join(root, ".spec/north-star/scenarios/greenfield-decision.md"), "utf-8"), /Task ID: W2-T1/);
      assert.match(fs.readFileSync(path.join(root, ".spec/north-star/scenarios/daily_change-decision.md"), "utf-8"), /Task ID: W2-T2/);
      assert.match(fs.readFileSync(path.join(root, ".spec/north-star/scenarios/release_drift-decision.md"), "utf-8"), /Lifecycle Migration Evidence/);
      assert.match(fs.readFileSync(path.join(root, ".spec/north-star/scenarios/release_drift-decision.md"), "utf-8"), /last adopted change change-1/i);

      const cli = runCli(["north-star", "acceptance", "--root", root, "--json"]);
      assert.equal(cli.status, 0, cli.stderr);
      const payload = JSON.parse(cli.stdout) as { acceptance: NorthStarAcceptance; acceptancePath: string; decisionPacketPath: string };
      assert.equal(payload.acceptance.kind, "jispec-north-star-acceptance");
      assert.equal(payload.acceptance.summary.ready, true);
      assert.equal(fs.existsSync(payload.acceptancePath), true);
      assert.equal(fs.existsSync(payload.decisionPacketPath), true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("north-star docs and CLI help expose final acceptance without replacing existing gates", () => {
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    const plan = fs.readFileSync(path.join(repoRoot, "docs", "north-star-next-development-plan.md"), "utf-8");
    const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf-8");
    const stableContract = fs.readFileSync(path.join(repoRoot, "docs", "v1-mainline-stable-contract.md"), "utf-8");
    const consoleContract = fs.readFileSync(path.join(repoRoot, "docs", "console-read-model-contract.md"), "utf-8");
    const checklist = fs.readFileSync(path.join(repoRoot, "docs", "pilot-readiness-checklist.md"), "utf-8");
    const help = runCli(["--help"]);

    assert.match(plan, /M7-T5[\s\S]*状态：已完成/);
    assert.match(plan, /## V1\.1 \/ pilot-grade 周执行计划/);
    assert.match(plan, /状态：frozen，除非通过对应任务和回归门禁，否则不调整场景范围、任务顺序和矩阵口径。/);
    assert.match(plan, /\| W1-T1 \| W1 \| P0 \| Test Owner \+ Docs \/ Release Owner \|/);
    assert.match(plan, /\| W8-T2 \| W8 \| P0 \| Release \/ QA Owner \|/);
    assert.match(plan, /north-star acceptance/i);
    assert.match(readme, /north-star acceptance/i);
    assert.match(stableContract, /north-star acceptance/i);
    assert.match(consoleContract, /north-star acceptance/i);
    assert.match(checklist, /north-star acceptance/i);
    assert.match(help.stdout, /jispec-cli north-star acceptance \[--json\]/);
  }));

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

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function writeNorthStarFixture(root: string): void {
  writeText(root, "package.json", JSON.stringify({
    scripts: {
      jispec: "jispec",
      "ci:verify": "jispec verify",
      "post-release:gate": "jispec post-release:gate",
    },
  }, null, 2));
  writeText(root, ".spec/handoffs/bootstrap-takeover.json", JSON.stringify({ status: "committed" }, null, 2));
  writeText(root, ".spec/greenfield/initialization-summary.md", "# Greenfield summary\n");
  writeText(root, ".jispec/change-session.json", JSON.stringify({ id: "change-1", mode: "execute" }, null, 2));
  writeText(root, ".jispec/implement/change-1/patch-mediation.json", JSON.stringify({ externalPatchControlled: true }, null, 2));
  writeText(root, ".spec/waivers/W-1.json", JSON.stringify({ id: "W-1", status: "active" }, null, 2));
  writeText(root, ".spec/releases/drift-trend.json", JSON.stringify({ status: "stable", comparisons: 2 }, null, 2));
  writeText(root, ".spec/baselines/current.yaml", [
    "source_snapshot:",
    "  active_snapshot_id: snapshot-ordering-v2",
    "  lifecycle_registry_path: .spec/requirements/lifecycle.yaml",
    "  lifecycle_registry_version: 2",
    "  last_adopted_change_id: change-1",
    "requirement_lifecycle:",
    "  path: .spec/requirements/lifecycle.yaml",
    "  registry_version: 2",
    "  active_snapshot_id: snapshot-ordering-v2",
    "  last_adopted_change_id: change-1",
    "source_evolution:",
    "  source_evolution_path: .spec/deltas/change-1/source-evolution.json",
    "  source_review_path: .spec/deltas/change-1/source-review.yaml",
    "  last_adopted_change_id: change-1",
  ].join("\n"));
  writeText(root, ".spec/requirements/lifecycle.yaml", [
    "version: 1",
    "registry_version: 2",
    "generated_at: 2026-05-02T00:00:00.000Z",
    "active_snapshot_id: snapshot-ordering-v2",
    "last_adopted_change_id: change-1",
    "requirements:",
    "  - id: REQ-1",
    "    status: active",
    "    source_snapshot: snapshot-ordering-v2",
    "    introduced_by_change: null",
    "    modified_by_change: change-1",
    "    deprecated_by_change: null",
    "    supersedes: []",
    "    replaced_by: []",
    "    merged_from: []",
  ].join("\n"));
  writeText(root, ".spec/console/governance-snapshot.json", JSON.stringify({ kind: "jispec-console-governance-snapshot" }, null, 2));
  writeText(root, ".spec/console/multi-repo-governance.json", JSON.stringify({ kind: "jispec-multi-repo-governance-aggregate" }, null, 2));
  writeText(root, ".spec/privacy/privacy-report.json", JSON.stringify({
    kind: "jispec-privacy-report",
    summary: { highSeverityFindingCount: 0 },
  }, null, 2));
  writeText(root, ".spec/audit/events.jsonl", `${JSON.stringify({ type: "verify", actor: "ci" })}\n`);
  writeText(root, ".spec/replay/provenance-baseline.json", JSON.stringify({ replayable: true }, null, 2));
  writeText(root, ".jispec-ci/verify-report.json", JSON.stringify({ verdict: "PASS", ok: true }, null, 2));
  writeText(root, ".spec/pilot/package.json", JSON.stringify({ kind: "jispec-pilot-product-package" }, null, 2));
}

function writeText(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
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

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
