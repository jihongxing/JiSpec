import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { Doctor, type DoctorReport } from "../doctor";
import { TEST_SUITES } from "./regression-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== P12 Doctor Global Profile Tests ===\n");

  const results: TestResult[] = [];

  await runCase(results, "doctor global is a separate broader-closure profile", async () => {
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    const cliEntry = path.join(repoRoot, "tools", "jispec", "cli.ts");
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", cliEntry, "doctor", "global", "--root", repoRoot, "--json"],
      {
        cwd: repoRoot,
        encoding: "utf-8",
      },
    );

    assert.ok([0, 1].includes(result.status ?? -1), `Unexpected doctor global status: ${result.status}`);
    const report = JSON.parse(result.stdout) as DoctorReport;
    assert.equal(report.profile, "global");
    const checkNames = new Set((report.checks ?? []).map((check) => check.name));
    for (const requiredName of [
      "Single-Repo Mainline Readiness",
      "Source Evolution Governance Artifact Health",
      "Console Snapshot Availability",
      "Governance Export Readiness",
      "Multi-Repo Aggregate Contract Readiness",
      "Release Compare Contract Readiness",
      "Deferred Surface Promotion Contract",
      "North Star Acceptance Artifact Readiness",
    ]) {
      assert.ok(checkNames.has(requiredName), `Missing global readiness check: ${requiredName}`);
    }
    for (const deferredName of [
      "Collaboration Engine",
      "Conflict Resolution",
      "Collaboration Awareness",
      "Collaboration Locking",
      "Collaboration Notifications",
      "Collaboration Analytics",
    ]) {
      assert.ok(!checkNames.has(deferredName), `Deferred runtime check leaked into doctor global: ${deferredName}`);
    }
  });

  await runCase(results, "global blockers expose owner action and next command without redefining V1 blockers", async () => {
    const root = createDoctorFixture("jispec-doctor-global-missing-");
    try {
      const report = await new Doctor(root).checkGlobalReadiness();
      assert.equal(report.profile, "global");
      assert.equal(report.ready, false);
      assert.ok((report.readinessSummary?.blockerCount ?? 0) >= 4);
      for (const blocker of report.readinessSummary?.blockers ?? []) {
        assert.ok(blocker.ownerAction, `missing owner action for ${blocker.check}`);
        assert.ok(blocker.nextCommand, `missing next command for ${blocker.check}`);
      }
      const exportCheck = requiredCheck(report, "Governance Export Readiness");
      assert.equal(exportCheck.status, "fail");
      assert.match(exportCheck.nextCommand ?? "", /console export-governance/);
      const aggregateCheck = requiredCheck(report, "Multi-Repo Aggregate Contract Readiness");
      assert.match(aggregateCheck.nextCommand ?? "", /console aggregate-governance/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await runCase(results, "doctor global passes when source governance, console export, aggregate, release compare, and north-star artifacts are healthy", async () => {
    const root = createDoctorFixture("jispec-doctor-global-ready-");
    try {
      writeGlobalReadyArtifacts(root);
      const report = await new Doctor(root).checkGlobalReadiness();

      assert.equal(report.profile, "global");
      assert.equal(report.ready, true);
      assert.equal(report.readinessSummary?.blockerCount, 0);
      assert.equal(report.checks.length, 8);
      assert.ok(report.checks.every((check) => check.status === "pass"));
      assert.match(Doctor.formatText(report), /Global Closure Readiness/);
      assert.match(Doctor.formatText(report), /Global Closure Ready: YES/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await runCase(results, "CLI exposes doctor global as JSON and text", async () => {
    const root = createDoctorFixture("jispec-doctor-global-cli-");
    try {
      writeGlobalReadyArtifacts(root);
      const json = runCli(root, ["doctor", "global", "--root", root, "--json"]);
      assert.equal(json.status, 0, json.stderr);
      const report = JSON.parse(json.stdout) as DoctorReport;
      assert.equal(report.profile, "global");
      assert.equal(report.ready, true);

      const text = runCli(root, ["doctor", "global", "--root", root]);
      assert.equal(text.status, 0, text.stderr);
      assert.match(text.stdout, /JiSpec Doctor: Global Closure Readiness/);
      assert.match(text.stdout, /Global Closure Ready: YES/);

      const help = runCli(root, ["doctor", "--help"]);
      assert.equal(help.status, 0, help.stderr);
      assert.match(help.stdout, /global/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await runCase(results, "P12-T3 suite is registered in runtime-extended", async () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "p12-doctor-global.ts");
    assert.ok(suite);
    assert.equal(suite.area, "runtime-extended");
    assert.equal(suite.expectedTests, 5);
    assert.equal(suite.task, "P12-T3");
  });

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

async function runCase(results: TestResult[], name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function createDoctorFixture(prefix: string): string {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const fixtureRoot = fs.mkdtempSync(path.join(repoRoot, prefix));
  for (const entry of ["tools", "scripts", "agents", "contexts", "docs", "jiproject", "schemas"] as const) {
    fs.cpSync(path.join(repoRoot, entry), path.join(fixtureRoot, entry), { recursive: true });
  }
  fs.copyFileSync(path.join(repoRoot, "package.json"), path.join(fixtureRoot, "package.json"));
  return fixtureRoot;
}

function requiredCheck(report: DoctorReport, name: string) {
  const check = report.checks.find((entry) => entry.name === name);
  assert.ok(check, `Missing check ${name}`);
  return check;
}

function writeGlobalReadyArtifacts(root: string): void {
  writeJson(root, ".jispec-ci/verify-report.json", {
    verdict: "PASS",
    issueCount: 0,
    blockingIssueCount: 0,
    counts: {
      total: 0,
      blocking: 0,
      advisory: 0,
    },
  });
  writeYaml(root, ".spec/policy.yaml", {
    version: 1,
    team: {
      profile: "small_team",
      owner: "platform",
      reviewers: ["reviewer"],
      required_reviewers: 1,
    },
    rules: [],
  });
  writeYaml(root, ".spec/baselines/current.yaml", {
    version: 1,
    source_evolution: {
      source_evolution_path: ".spec/deltas/chg-source-0/source-evolution.json",
      source_review_path: ".spec/deltas/chg-source-0/source-review.yaml",
      last_adopted_change_id: "chg-source-0",
    },
    requirement_lifecycle: {
      path: ".spec/requirements/lifecycle.yaml",
      registry_version: 4,
      last_adopted_change_id: "chg-source-0",
    },
  });
  writeYaml(root, ".spec/requirements/lifecycle.yaml", {
    version: 1,
    registry_version: 4,
    generated_at: "2026-05-04T00:00:00.000Z",
    last_adopted_change_id: "chg-source-0",
    requirements: [
      {
        id: "REQ-ORDER-001",
        status: "modified",
        supersedes: [],
        replaced_by: [],
        merged_from: [],
      },
    ],
  });
  writeJson(root, ".spec/deltas/chg-source-1/source-evolution.json", {
    version: 1,
    generated_at: "2026-05-04T00:00:00.000Z",
    summary: {
      changed: true,
      total: 1,
      added: 0,
      modified: 1,
      deprecated: 0,
      split: 0,
      merged: 0,
      reanchored: 0,
    },
    items: [
      {
        evolution_id: "modified:req-order-1",
        evolution_kind: "modified",
        source_document: "requirements",
        severity: "blocking",
        path: "docs/input/requirements.md",
        anchor_id: "REQ-ORDER-001",
        summary: "Requirement REQ-ORDER-001 changed semantic content.",
      },
    ],
  });
  writeYaml(root, ".spec/deltas/chg-source-1/source-review.yaml", {
    version: 1,
    change_id: "chg-source-1",
    generated_at: "2026-05-04T00:00:00.000Z",
    updated_at: "2026-05-04T00:00:00.000Z",
    source_evolution_path: ".spec/deltas/chg-source-1/source-evolution.json",
    items: [
      {
        item_id: "modified:req-order-1",
        evolution_id: "modified:req-order-1",
        anchor_id: "REQ-ORDER-001",
        evolution_kind: "modified",
        source_document: "requirements",
        severity: "blocking",
        status: "adopted",
        summary: "Requirement REQ-ORDER-001 changed semantic content.",
      },
    ],
  });
  writeJson(root, ".spec/releases/compare/v1-to-current/compare-report.json", {
    driftSummary: {
      overallStatus: "unchanged",
    },
  });
  writeJson(root, ".spec/releases/drift-trend.json", {
    latest: {
      reportPath: ".spec/releases/compare/v1-to-current/compare-report.json",
      overallStatus: "unchanged",
    },
  });
  writeText(root, ".spec/audit/events.jsonl", `${JSON.stringify({
    type: "console_export_governance",
    generatedAt: "2026-05-04T00:00:00.000Z",
    sourceArtifact: ".spec/console/governance-snapshot.json",
  })}\n`);
  writeJson(root, ".spec/console/governance-snapshot.json", {
    schemaVersion: 1,
    kind: "jispec-multi-repo-governance-snapshot",
    exportedAt: "2026-05-04T00:00:00.000Z",
    repo: {
      id: "orders",
      name: "Orders",
      root,
    },
    boundary: {
      localOnly: true,
      readOnlySnapshot: true,
      sourceUploadRequired: false,
      scansSourceCode: false,
      runsVerify: false,
      replacesCliGate: false,
      markdownIsMachineApi: false,
    },
    sourceSnapshot: {
      createdAt: "2026-05-04T00:00:00.000Z",
      artifactSummary: { totalArtifacts: 4 },
      governanceSummary: { totalObjects: 4 },
      hash: "hash-orders",
    },
    contract: {
      snapshotContractVersion: 1,
      compatibleAggregateVersion: 1,
      missingSemantics: {
        unavailableValue: "not_available_yet",
        missingSnapshotReason: "snapshot_not_found",
      },
    },
    aggregateHints: {
      verifyVerdict: "PASS",
      policyProfile: "small_team",
      policyOwner: "platform",
      activeWaivers: 0,
      expiringSoonWaivers: [],
      expiredWaivers: [],
      unmatchedActiveWaivers: [],
      openSpecDebt: 0,
      bootstrapSpecDebt: 0,
      sourceEvolutionChangeId: "chg-source-1",
      sourceEvolutionBlockingOpenItems: 0,
      sourceEvolutionExpiredExceptions: 0,
      sourceEvolutionRepresentativeArtifact: "REQ-ORDER-001",
      lastAdoptedSourceChange: "chg-source-0",
      lifecycleDeltaCounts: { modified: 1 },
      releaseDriftStatus: "unchanged",
      releaseDriftTrendComparisons: 1,
      approvalWorkflowStatus: "not_available_yet",
      latestAuditActor: "reviewer",
      contractRefs: [],
    },
    governanceObjects: [],
  });
  writeJson(root, ".spec/console/multi-repo-governance.json", {
    schemaVersion: 1,
    kind: "jispec-multi-repo-governance-aggregate",
    generatedAt: "2026-05-04T00:00:00.000Z",
    root,
    boundary: {
      localOnly: true,
      readOnlyAggregate: true,
      consumesExportedSnapshotsOnly: true,
      sourceUploadRequired: false,
      scansSourceCode: false,
      runsVerify: false,
      replacesCliGate: false,
      markdownIsMachineApi: false,
    },
    inputs: {
      snapshotPaths: [".spec/console/governance-snapshot.json"],
      directoryPaths: [],
      loadedSnapshots: 1,
      missingSnapshots: 0,
    },
    summary: {
      repoCount: 1,
      missingSnapshotCount: 0,
      verifyVerdicts: { PASS: 1 },
      policyProfiles: { small_team: 1 },
      totalActiveWaivers: 0,
      totalExpiringSoonWaivers: 0,
      totalExpiredWaivers: 0,
      totalUnmatchedActiveWaivers: 0,
      totalOpenSpecDebt: 0,
      totalBootstrapSpecDebt: 0,
      releaseDriftHotspotCount: 0,
      totalReleaseDriftComparisons: 1,
      contractDriftHintCount: 0,
      ownerActionCount: 0,
      latestAuditActors: ["reviewer"],
    },
    repoGroup: {
      status: "not_available_yet",
      sourcePath: ".spec/console/repo-group.yaml",
      repos: [],
      warnings: [],
    },
    repos: [],
    missingSnapshots: [],
    contractDriftHints: [],
    ownerActions: [],
    singleRepoGateReplacement: false,
    hotspots: {
      highestRiskRepos: [],
      expiringSoonWaivers: [],
      unmatchedActiveWaivers: [],
      specDebt: [],
      releaseDrift: [],
      verify: [],
    },
  });
  writeJson(root, ".spec/north-star/acceptance.json", {
    schemaVersion: 1,
    kind: "jispec-north-star-acceptance",
    generatedAt: "2026-05-04T00:00:00.000Z",
    root,
    contract: {
      version: 1,
      scenarioSuite: "north-star-acceptance",
      sourcePlan: "docs/north-star-next-development-plan.md#M7-T5",
    },
    boundary: {
      localOnly: true,
      sourceUploadRequired: false,
      llmBlockingDecisionSource: false,
      deterministicLocalArtifactsOnly: true,
      replacesVerify: false,
      replacesDoctorV1: false,
      replacesDoctorRuntime: false,
      replacesDoctorPilot: false,
      replacesPostReleaseGate: false,
    },
    summary: {
      ready: true,
      scenarioCount: 9,
      passedScenarioCount: 9,
      blockingScenarioCount: 0,
    },
    proofClaims: {
      verifiable: true,
      auditable: true,
      blockable: true,
      replayable: true,
      localFirst: true,
      externalToolsControlled: true,
    },
    scenarios: [],
    blockers: [],
    requiredExternalGates: [
      { id: "doctor_mainline", command: "npm run jispec -- doctor mainline", authority: "blocking_gate" },
      { id: "doctor_runtime", command: "npm run jispec -- doctor runtime", authority: "blocking_gate" },
      { id: "doctor_pilot", command: "npm run jispec -- doctor pilot", authority: "blocking_gate" },
      { id: "post_release_gate", command: "npm run post-release:gate", authority: "blocking_gate" },
    ],
  });
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeYaml(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, yaml.dump(value, { lineWidth: 100, noRefs: true, sortKeys: false }));
}

function writeText(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
}

function runCli(root: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const cliPath = path.join(root, "tools", "jispec", "cli.ts");
  const result = spawnSync(process.execPath, ["--import", "tsx", cliPath, ...args], {
    cwd: root,
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
