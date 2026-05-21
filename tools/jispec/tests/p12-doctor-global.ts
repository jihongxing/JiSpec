import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { appendAuditEvent } from "../audit/event-ledger";
import { Doctor, type DoctorReport } from "../doctor";
import { writeGlobalOperationsPacket } from "../operations/global-operations-packet";
import { writeOrgResponsibilityGraph } from "../operations/org-responsibility-graph";
import { writeAsyncReviewInbox } from "../operations/async-review-inbox";
import { writeOpsAgingLedger } from "../operations/ops-aging-ledger";
import { writeReleaseTrainPacket } from "../operations/release-train-packet";
import { collectConsoleLocalSnapshot } from "../console/read-model-snapshot";
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
    const report = await new Doctor(repoRoot).checkGlobalReadiness();
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
      "Absolute Terminal Boundary",
      "North Star Acceptance Artifact Readiness",
      "Global Operations Packet Readiness",
      "Org Responsibility Graph Readiness",
      "Async Review Inbox Readiness",
      "Ops Aging Ledger Readiness",
      "Release Train Packet Readiness",
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
      assert.equal(report.checks.length, 14);
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

  await runCase(results, "CLI can write a reusable doctor global readiness artifact for Console", async () => {
    const root = createDoctorFixture("jispec-doctor-global-out-");
    try {
      writeGlobalReadyArtifacts(root);
      const outputPath = ".spec/doctor/global-readiness.json";
      const run = runCli(root, ["doctor", "global", "--root", root, "--out", outputPath, "--json"]);
      assert.equal(run.status, 0, run.stderr);
      assert.ok(fs.existsSync(path.join(root, outputPath)));

      const report = JSON.parse(fs.readFileSync(path.join(root, outputPath), "utf-8")) as DoctorReport;
      assert.equal(report.profile, "global");
      assert.equal(report.ready, true);
      assert.equal(report.readinessSummary?.blockerCount, 0);

      const snapshot = collectConsoleLocalSnapshot(root);
      const readiness = snapshot.governance.objects.find((object) => object.id === "doctor_global_readiness");
      assert.ok(readiness);
      assert.equal(readiness?.status, "available");
      assert.equal(readiness?.summary.ready, true);
      assert.equal(readiness?.summary.blockerCount, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await runCase(results, "P12-T3 suite is registered in runtime-extended", async () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "p12-doctor-global.ts");
    assert.ok(suite);
    assert.equal(suite.area, "runtime-extended");
    assert.equal(suite.expectedTests, 6);
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
    fs.cpSync(path.join(repoRoot, entry), path.join(fixtureRoot, entry), { recursive: true, dereference: true });
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
    globalContext: {
      kind: "release_compare_global_context",
      status: "available",
      summary: "Release compare consumed aggregate governance context.",
      details: {
        aggregatePath: ".spec/console/multi-repo-governance.json",
        lifecycleRegistryDelta: {
          toPath: ".spec/requirements/lifecycle.yaml",
          toVersion: 4,
          changed: false,
        },
        sourceEvolutionArtifacts: {
          toSourceEvolutionPath: ".spec/deltas/chg-source-1/source-evolution.json",
          toSourceReviewPath: ".spec/deltas/chg-source-1/source-review.yaml",
          toLastAdoptedChangeId: "chg-source-0",
        },
        relevantContractDriftHints: [{ id: "hint:1" }],
        relevantOwnerActions: [{ id: "owner-action:1" }],
        ownerReviewRecommendations: [{ id: "owner-review:1" }],
      },
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
      contractDriftHintCount: 1,
      ownerActionCount: 1,
      latestAuditActors: ["reviewer"],
    },
    promotionReadiness: readyPromotionReadiness(),
    repoGroup: {
      status: "available",
      sourcePath: ".spec/console/repo-group.yaml",
      repos: [
        {
          id: "orders",
          role: "downstream",
          owner: "platform",
          snapshotStatus: "available",
          upstreamContractRefs: [".spec/contracts/orders.yaml"],
          downstreamContractRefs: [],
        },
        {
          id: "payments",
          role: "upstream",
          owner: "payments-team",
          snapshotStatus: "available",
          upstreamContractRefs: [],
          downstreamContractRefs: [".spec/contracts/orders.yaml"],
        },
      ],
      warnings: [],
    },
    repos: [],
    missingSnapshots: [],
    contractDriftHints: [
      {
        upstreamRepoId: "payments",
        downstreamRepoId: "orders",
        contractRef: ".spec/contracts/orders.yaml",
        ownerActionId: "owner-action:orders:.spec/contracts/orders.yaml",
        evidence: { downstreamSourceEvolutionChangeId: "chg-source-1" },
      },
    ],
    ownerActions: [
      {
        id: "owner-action:orders:.spec/contracts/orders.yaml",
        status: "ready",
        owner: "platform",
        repoId: "orders",
        primaryCommand: { command: "npm run jispec-cli -- change --root ." },
        followupCommands: [{ command: "npm run ci:verify" }],
        affectedContracts: [".spec/contracts/orders.yaml"],
      },
    ],
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
  writeJson(root, ".spec/privacy/privacy-report.json", {
    kind: "jispec-privacy-report",
    summary: { highSeverityFindingCount: 0, findingCount: 0 },
  });
  fs.rmSync(path.join(root, ".spec", "audit", "events.jsonl"), { force: true });
  writeReadyAuditLedger(root);
  writeGlobalOperationsPacket(root, ".spec/operations/global-operations-packet.json", {
    doctorGlobalReport: {
      profile: "global",
      ready: true,
      readinessSummary: { profile: "global", ready: true, blockerCount: 0, blockers: [] },
      checks: [],
    },
  });
  writeOrgTopology(root);
  writeOrgResponsibilityGraph(root);
  writeAsyncReviewInbox(root);
  writeOpsAgingLedger(root);
  writeReleaseTrainPacket(root);
}

function writeOrgTopology(root: string): void {
  writeJson(root, ".spec/operations/org-topology.json", {
    kind: "jispec-org-topology",
    orgId: "acme-platform",
    teams: [
      { id: "platform", name: "Platform", owner: "platform-lead", reviewers: ["alice", "bob"], escalation: ["director-eng"] },
      { id: "payments-team", name: "Payments", owner: "payments-lead", reviewers: ["pay-reviewer"], escalation: ["director-eng"] },
    ],
    repoAssignments: [
      { repoId: "orders", teamId: "platform" },
      { repoId: "payments", teamId: "payments-team" },
    ],
  });
}

function writeReadyAuditLedger(root: string): void {
  for (const event of [
    ["policy_approval_decision", ".spec/approvals/policy.json", ".spec/policy.yaml"],
    ["waiver_renew", ".spec/waivers/W-1.json", ".spec/policy.yaml"],
    ["spec_debt_repay", ".spec/spec-debt/ledger.yaml", ".spec/requirements/lifecycle.yaml"],
    ["release_compare", ".spec/releases/compare/v1-to-current/compare-report.json", ".spec/contracts/orders.yaml"],
    ["source_adopt", ".spec/deltas/chg-source-1/source-review.yaml", ".spec/requirements/lifecycle.yaml"],
  ] as const) {
    appendAuditEvent(root, {
      type: event[0],
      actor: "p12-doctor-global",
      sourceArtifact: { kind: path.extname(event[1]).slice(1) || "artifact", path: event[1] },
      affectedContracts: [event[2]],
    });
  }
}

function readyPromotionReadiness(): Record<string, unknown> {
  return {
    phase: "north-star-score-optimization-phase-2",
    ready: true,
    target: "multi-repo-promotion",
    requiredNorthStarScenarios: [
      "multi_repo_owner_action",
      "release_compare_global_context",
      "doctor_global_health",
    ],
    checklist: [
      {
        id: "repo_group_configured",
        status: "pass",
        summary: "Explicit repo group topology is available and all configured repos have exported snapshots.",
        evidence: ["2 configured repo(s)", "2/2 configured snapshot(s) available"],
        blockers: [],
      },
      {
        id: "cross_repo_contract_refs",
        status: "pass",
        summary: "Configured cross-repo refs resolve against exported snapshot contract refs and produce drift hints.",
        evidence: ["2 repo-group contract ref(s)", "2 exported snapshot contract ref(s)", "1 cross-repo drift hint(s)"],
        blockers: [],
      },
      {
        id: "owner_action_lifecycle",
        status: "pass",
        summary: "Every drift hint has a linked owner action, primary command, local write contract, and follow-up export command.",
        evidence: ["1 hint(s)", "1 owner action(s)", "linked hints=true", "action lifecycle=true"],
        blockers: [],
      },
      {
        id: "promotion_candidate_boundary",
        status: "pass",
        summary: "The aggregate remains a local support surface and cannot replace single-repo verify or CI gates.",
        evidence: ["local aggregate consumes exported snapshots only"],
        blockers: [],
      },
      {
        id: "north_star_acceptance_coverage",
        status: "pass",
        summary: "The promotion target is covered by dedicated North Star global-closure scenarios.",
        evidence: ["multi_repo_owner_action", "release_compare_global_context", "doctor_global_health"],
        blockers: [],
      },
    ],
    blockers: [],
    scoreImpact: {
      dimension: "terminal-control-plane",
      currentTarget: "9.0+",
      evidence: [
        "2/2 configured repo snapshot(s) available",
        "1 cross-repo drift hint(s)",
        "1 owner action lifecycle packet(s)",
        "promotion readiness ready",
      ],
    },
  };
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
