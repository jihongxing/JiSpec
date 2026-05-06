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
      assert.equal(acceptance.summary.scenarioCount, 15);
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
        "source_evolution_adopted",
        "source_evolution_deferred_repaid",
        "console_source_evolution",
        "multi_repo_owner_action",
        "release_compare_global_context",
        "doctor_global_health",
      ]);
      const releaseDrift = acceptance.scenarios.find((scenario) => scenario.id === "release_drift");
      const sourceAdopted = acceptance.scenarios.find((scenario) => scenario.id === "source_evolution_adopted");
      const deferredRepaid = acceptance.scenarios.find((scenario) => scenario.id === "source_evolution_deferred_repaid");
      const releaseCompareContext = acceptance.scenarios.find((scenario) => scenario.id === "release_compare_global_context");
      const doctorGlobal = acceptance.scenarios.find((scenario) => scenario.id === "doctor_global_health");
      assert.equal(releaseDrift?.evidence?.governedRequirementEvolution, true);
      assert.match(releaseDrift?.evidence?.summary ?? "", /lifecycle\.yaml/);
      assert.match(releaseDrift?.evidence?.summary ?? "", /last adopted change change-1/);
      assert.match(sourceAdopted?.evidence?.summary ?? "", /fully adopted/i);
      assert.match(deferredRepaid?.evidence?.summary ?? "", /defer\s*->\s*adopt/i);
      assert.equal(releaseCompareContext?.evidence?.releaseCompareGlobalContextStatus, "available");
      assert.equal(doctorGlobal?.evidence?.doctorGlobalReady, true);
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
      assert.ok(acceptance.summary.blockingScenarioCount >= 13);
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
      assert.match(fs.readFileSync(path.join(root, ".spec/north-star/scenarios/release_drift-decision.md"), "utf-8"), /Scenario Evidence/);
      assert.match(fs.readFileSync(path.join(root, ".spec/north-star/scenarios/release_drift-decision.md"), "utf-8"), /last adopted change change-1/i);
      assert.match(
        fs.readFileSync(path.join(root, ".spec/north-star/scenarios/source_evolution_deferred_repaid-decision.md"), "utf-8"),
        /defer.*adopt/i,
      );
      assert.match(
        fs.readFileSync(path.join(root, ".spec/north-star/scenarios/release_compare_global_context-decision.md"), "utf-8"),
        /Release compare global context: available/,
      );

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

  results.push(record("north-star acceptance and CLI help expose the global closure layer without docs dependency", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-north-star-global-closure-"));
    try {
      writeNorthStarFixture(root);
      const written = writeNorthStarAcceptance({
        root,
        generatedAt: "2026-05-02T00:00:00.000Z",
      });
      const saved = JSON.parse(fs.readFileSync(written.acceptancePath, "utf-8")) as NorthStarAcceptance;

      const consoleSourceEvolution = saved.scenarios.find((scenario) => scenario.id === "console_source_evolution");
      const ownerActionScenario = saved.scenarios.find((scenario) => scenario.id === "multi_repo_owner_action");
      const releaseCompareScenario = saved.scenarios.find((scenario) => scenario.id === "release_compare_global_context");
      const doctorGlobalScenario = saved.scenarios.find((scenario) => scenario.id === "doctor_global_health");

      assert.equal(consoleSourceEvolution?.status, "passed");
      assert.equal(consoleSourceEvolution?.evidence?.currentChangeState, "ready_for_source_adopt");
      assert.equal(consoleSourceEvolution?.evidence?.sourceReviewCoverage?.adopted, 2);
      assert.equal(ownerActionScenario?.evidence?.aggregateOwnerActionCount, 1);
      assert.equal(ownerActionScenario?.evidence?.aggregateContractDriftHintCount, 1);
      assert.equal(releaseCompareScenario?.evidence?.releaseCompareGlobalContextStatus, "available");
      assert.equal(releaseCompareScenario?.evidence?.releaseCompareOwnerReviewRecommendationCount, 1);
      assert.equal(releaseCompareScenario?.evidence?.releaseCompareRelevantHintCount, 1);
      assert.equal(releaseCompareScenario?.evidence?.releaseCompareRelevantOwnerActionCount, 1);
      assert.equal(doctorGlobalScenario?.evidence?.doctorGlobalReady, true);
      assert.equal(doctorGlobalScenario?.evidence?.doctorGlobalBlockerCount, 0);

      assert.match(fs.readFileSync(path.join(root, ".spec/north-star/scenarios/console_source_evolution-decision.md"), "utf-8"), /Current change state: ready_for_source_adopt/);
      assert.match(fs.readFileSync(path.join(root, ".spec/north-star/scenarios/multi_repo_owner_action-decision.md"), "utf-8"), /Aggregate owner actions: 1/);
      assert.match(fs.readFileSync(path.join(root, ".spec/north-star/scenarios/release_compare_global_context-decision.md"), "utf-8"), /Release compare global context: available/);
      assert.match(fs.readFileSync(path.join(root, ".spec/north-star/scenarios/doctor_global_health-decision.md"), "utf-8"), /Doctor global prerequisites healthy: true/);

      const help = runCli(["north-star", "acceptance", "--help"]);
      assert.match(help.stdout, /Usage:\s+jispec-cli\s+north-star\s+acceptance\s+\[options\]/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
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
  writeText(root, ".spec/releases/drift-trend.json", JSON.stringify({
    latest: {
      reportPath: ".spec/releases/compare/v1-to-current/compare-report.json",
      overallStatus: "changed",
    },
    compareCount: 1,
    changedCompareCount: 1,
  }, null, 2));
  writeText(root, ".spec/baselines/current.yaml", [
    "version: 1",
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
  writeText(root, ".spec/deltas/change-1/source-evolution.json", JSON.stringify({
    version: 1,
    generated_at: "2026-05-02T00:00:00.000Z",
    summary: {
      changed: true,
      total: 2,
      added: 0,
      modified: 2,
      deprecated: 0,
      split: 0,
      merged: 0,
      reanchored: 0,
    },
    items: [
      {
        evolution_id: "modified:req-1",
        evolution_kind: "modified",
        source_document: "requirements",
        severity: "blocking",
        path: "docs/input/requirements.md",
        anchor_id: "REQ-1",
        summary: "Requirement REQ-1 changed semantic content.",
      },
      {
        evolution_id: "modified:req-2",
        evolution_kind: "modified",
        source_document: "requirements",
        severity: "advisory",
        path: "docs/input/requirements.md",
        anchor_id: "REQ-2",
        summary: "Requirement REQ-2 changed semantic content.",
      },
    ],
  }, null, 2));
  writeText(root, ".spec/deltas/change-1/source-review.yaml", [
    "version: 1",
    "change_id: change-1",
    "generated_at: 2026-05-02T00:00:00.000Z",
    "updated_at: 2026-05-02T00:00:00.000Z",
    "source_evolution_path: .spec/deltas/change-1/source-evolution.json",
    "items:",
    "  - item_id: modified:req-1",
    "    evolution_id: modified:req-1",
    "    anchor_id: REQ-1",
    "    evolution_kind: modified",
    "    source_document: requirements",
    "    severity: blocking",
    "    status: adopted",
    "    summary: Requirement REQ-1 changed semantic content.",
    "    review_history:",
    "      - action: adopt",
    "        actor: architect",
    "        reason: accepted",
    "        timestamp: 2026-05-02T00:00:00.000Z",
    "  - item_id: modified:req-2",
    "    evolution_id: modified:req-2",
    "    anchor_id: REQ-2",
    "    evolution_kind: modified",
    "    source_document: requirements",
    "    severity: advisory",
    "    status: adopted",
    "    summary: Requirement REQ-2 changed semantic content.",
    "    review_history:",
    "      - action: defer",
    "        actor: architect",
    "        reason: wait for cross-team sync",
    "        timestamp: 2026-05-01T00:00:00.000Z",
    "      - action: adopt",
    "        actor: architect",
    "        reason: repaid after follow-up",
    "        timestamp: 2026-05-02T00:00:00.000Z",
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
    "  - id: REQ-2",
    "    status: active",
    "    source_snapshot: snapshot-ordering-v2",
    "    introduced_by_change: null",
    "    modified_by_change: change-1",
    "    deprecated_by_change: null",
    "    supersedes: []",
    "    replaced_by: []",
    "    merged_from: []",
  ].join("\n"));
  writeText(root, ".spec/console/governance-snapshot.json", JSON.stringify({
    schemaVersion: 1,
    kind: "jispec-multi-repo-governance-snapshot",
    exportedAt: "2026-05-02T00:00:00.000Z",
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
      createdAt: "2026-05-02T00:00:00.000Z",
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
      sourceEvolutionChangeId: "change-1",
      sourceEvolutionBlockingOpenItems: 0,
      sourceEvolutionExpiredExceptions: 0,
      sourceEvolutionRepresentativeArtifact: "REQ-1",
      lastAdoptedSourceChange: "change-1",
      lifecycleDeltaCounts: { modified: 2 },
      releaseDriftStatus: "changed",
      releaseDriftTrendComparisons: 1,
      approvalWorkflowStatus: "not_available_yet",
      latestAuditActor: "ci",
      contractRefs: [{ ref: ".spec/contracts/orders.yaml", hash: "hash-orders" }],
    },
    governanceObjects: [],
  }, null, 2));
  writeText(root, ".spec/console/multi-repo-governance.json", JSON.stringify({
    schemaVersion: 1,
    kind: "jispec-multi-repo-governance-aggregate",
    generatedAt: "2026-05-02T00:00:00.000Z",
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
      releaseDriftHotspotCount: 1,
      totalReleaseDriftComparisons: 1,
      contractDriftHintCount: 1,
      ownerActionCount: 1,
      latestAuditActors: ["ci"],
    },
    repoGroup: {
      status: "available",
      sourcePath: ".spec/console/repo-group.yaml",
      repos: [],
      warnings: [],
    },
    repos: [],
    missingSnapshots: [],
    contractDriftHints: [
      {
        kind: "cross_repo_contract_drift",
        id: "hint:payments:.spec/contracts/orders.yaml->orders",
        upstreamRepoId: "payments",
        downstreamRepoId: "orders",
        contractRef: ".spec/contracts/orders.yaml",
        upstreamHash: "hash-upstream",
        downstreamHash: "hash-orders",
        severity: "owner_action",
        suggestedCommand: "npm run jispec-cli -- change --root .",
        ownerActionId: "owner-action:orders:.spec/contracts/orders.yaml",
        evidence: {
          upstreamSnapshotPath: "/workspace/payments/.spec/console/governance-snapshot.json",
          downstreamSnapshotPath: ".spec/console/governance-snapshot.json",
          downstreamRepoPath: root.replace(/\\/g, "/"),
          downstreamSourceEvolutionChangeId: "change-1",
          downstreamReleaseDriftStatus: "changed",
        },
        blockingGateReplacement: false,
      },
    ],
    ownerActions: [
      {
        id: "owner-action:orders:.spec/contracts/orders.yaml",
        kind: "cross_repo_contract_drift_owner_action",
        status: "ready",
        repoId: "orders",
        repoName: "Orders",
        owner: "platform",
        repoPath: root.replace(/\\/g, "/"),
        upstreamRepoId: "payments",
        downstreamRepoId: "orders",
        contractRef: ".spec/contracts/orders.yaml",
        message: "Refresh downstream contract",
        summary: "Refresh downstream contract after upstream drift",
        risk: "medium",
        primaryCommand: {
          kind: "change",
          command: "npm run jispec-cli -- change --root .",
          rationale: "Refresh downstream contract",
          writesLocalArtifacts: [".jispec/change-session.json"],
        },
        followupCommands: [],
        sourceArtifacts: [".spec/deltas/change-1/source-evolution.json"],
        affectedContracts: [".spec/contracts/orders.yaml"],
        relatedHintId: "hint:payments:.spec/contracts/orders.yaml->orders",
        suggestedCommand: "npm run jispec-cli -- change --root .",
        blockingGateReplacement: false,
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
  }, null, 2));
  writeText(root, ".spec/releases/compare/v1-to-current/compare-report.json", JSON.stringify({
    driftSummary: {
      overallStatus: "changed",
      requirementEvolution: {
        status: "changed",
        details: {
          to_source_evolution_path: ".spec/deltas/change-1/source-evolution.json",
          to_source_review_path: ".spec/deltas/change-1/source-review.yaml",
        },
      },
    },
    globalContext: {
      kind: "release_compare_global_context",
      status: "available",
      summary: "Release compare consumed aggregate governance context.",
      details: {
        aggregatePath: ".spec/console/multi-repo-governance.json",
        lifecycleRegistryDelta: {
          toPath: ".spec/requirements/lifecycle.yaml",
          toVersion: 2,
          changed: true,
        },
        sourceEvolutionArtifacts: {
          toSourceEvolutionPath: ".spec/deltas/change-1/source-evolution.json",
          toSourceReviewPath: ".spec/deltas/change-1/source-review.yaml",
          toActiveSnapshotId: "snapshot-ordering-v2",
          toLastAdoptedChangeId: "change-1",
        },
        relevantContractDriftHints: [{ id: "hint:1" }],
        relevantOwnerActions: [{ id: "owner-action:1" }],
        ownerReviewRecommendations: [{ id: "owner-review:1" }],
      },
    },
  }, null, 2));
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
