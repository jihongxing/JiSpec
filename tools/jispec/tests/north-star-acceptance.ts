import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendAuditEvent } from "../audit/event-ledger";
import {
  buildNorthStarAcceptance,
  writeNorthStarAcceptance,
  type NorthStarAcceptance,
} from "../north-star/acceptance";
import { writeOpsAgingLedger } from "../operations/ops-aging-ledger";
import { writeReleaseTrainPacket } from "../operations/release-train-packet";
import { writeLocalConsoleUi } from "../console/ui/static-dashboard";

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
      assert.equal(acceptance.summary.scenarioCount, 22);
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
        "mainline_recovery_drill",
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
        "global_operations_packet",
        "org_responsibility_graph",
        "async_review_inbox",
        "ops_aging_ledger",
        "release_train_packet",
        "org_operations_console",
      ]);
      const releaseDrift = acceptance.scenarios.find((scenario) => scenario.id === "release_drift");
      const sourceAdopted = acceptance.scenarios.find((scenario) => scenario.id === "source_evolution_adopted");
      const deferredRepaid = acceptance.scenarios.find((scenario) => scenario.id === "source_evolution_deferred_repaid");
      const releaseCompareContext = acceptance.scenarios.find((scenario) => scenario.id === "release_compare_global_context");
      const doctorGlobal = acceptance.scenarios.find((scenario) => scenario.id === "doctor_global_health");
      const operationsPacket = acceptance.scenarios.find((scenario) => scenario.id === "global_operations_packet");
      const orgGraph = acceptance.scenarios.find((scenario) => scenario.id === "org_responsibility_graph");
      const asyncInbox = acceptance.scenarios.find((scenario) => scenario.id === "async_review_inbox");
      const opsAgingLedger = acceptance.scenarios.find((scenario) => scenario.id === "ops_aging_ledger");
      const releaseTrain = acceptance.scenarios.find((scenario) => scenario.id === "release_train_packet");
      const orgOperationsConsole = acceptance.scenarios.find((scenario) => scenario.id === "org_operations_console");
      assert.equal(releaseDrift?.evidence?.governedRequirementEvolution, true);
      assert.match(releaseDrift?.evidence?.summary ?? "", /lifecycle\.yaml/);
      assert.match(releaseDrift?.evidence?.summary ?? "", /last adopted change change-1/);
      assert.match(sourceAdopted?.evidence?.summary ?? "", /fully adopted/i);
      assert.match(deferredRepaid?.evidence?.summary ?? "", /defer\s*->\s*adopt/i);
      assert.equal(releaseCompareContext?.evidence?.releaseCompareGlobalContextStatus, "available");
      assert.equal(doctorGlobal?.evidence?.doctorGlobalReady, true);
      assert.equal(operationsPacket?.evidence?.globalOperationsPacketStatus, "ready");
      assert.equal(operationsPacket?.evidence?.globalOperationsAsyncEvidenceAvailable, 5);
      assert.equal(operationsPacket?.evidence?.globalOperationsDeferredSurfacesDiagnosticOnly, true);
      assert.equal(operationsPacket?.evidence?.globalOperationsSourceUploadRequired, false);
      assert.equal(orgGraph?.evidence?.orgResponsibilityGraphStatus, "ready");
      assert.equal(orgGraph?.evidence?.orgResponsibilityReviewerCoverage, 1);
      assert.equal(orgGraph?.evidence?.orgResponsibilityEscalationCoverage, 1);
      assert.equal(asyncInbox?.evidence?.asyncReviewInboxStatus, "ready");
      assert.equal(asyncInbox?.evidence?.asyncReviewReviewerCount, 2);
      assert.equal(asyncInbox?.evidence?.asyncReviewRealtimeCollaborationRequired, false);
      assert.equal(opsAgingLedger?.evidence?.opsAgingLedgerStatus, "ready");
      assert.equal(opsAgingLedger?.evidence?.opsAgingTotalItems, 2);
      assert.equal(opsAgingLedger?.evidence?.opsAgingRealtimeCollaborationRequired, false);
      assert.equal(releaseTrain?.evidence?.releaseTrainPacketStatus, "ready");
      assert.equal(releaseTrain?.evidence?.releaseTrainRequiredReviewCount, 2);
      assert.equal(releaseTrain?.evidence?.releaseTrainBoundaryReplacesPostReleaseGate, false);
      assert.equal(orgOperationsConsole?.evidence?.orgOperationsConsoleStatus, "ready");
      assert.equal(orgOperationsConsole?.evidence?.orgOperationsAvailableObjectCount, 4);
      assert.equal(orgOperationsConsole?.evidence?.orgOperationsRealtimeCollaborationRequired, false);
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
              "global_operations_packet",
              "org_responsibility_graph",
              "async_review_inbox",
              "ops_aging_ledger",
              "release_train_packet",
              "org_operations_console",
            ].includes(blocker.scenarioId),
          )
          .map((blocker) => blocker.task?.id),
        ["W2-T1", "W2-T2", "W3-T1", "W3-T2", "W4-T1", "W4-T2", "W5-T1", "North-Star-Score-Phase-10", "North-Star-Score-Phase-11", "North-Star-Score-Phase-12", "North-Star-Score-Phase-13", "North-Star-Score-Phase-14", "North-Star-Score-Phase-15"],
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
              "global_operations_packet",
              "org_responsibility_graph",
              "async_review_inbox",
              "ops_aging_ledger",
              "release_train_packet",
              "org_operations_console",
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
      const operationsScenario = saved.scenarios.find((scenario) => scenario.id === "global_operations_packet");
      const orgGraphScenario = saved.scenarios.find((scenario) => scenario.id === "org_responsibility_graph");
      const asyncInboxScenario = saved.scenarios.find((scenario) => scenario.id === "async_review_inbox");
      const opsAgingScenario = saved.scenarios.find((scenario) => scenario.id === "ops_aging_ledger");
      const releaseTrainScenario = saved.scenarios.find((scenario) => scenario.id === "release_train_packet");
      const orgOperationsScenario = saved.scenarios.find((scenario) => scenario.id === "org_operations_console");
      assert.equal(greenfieldScenario?.task?.id, "W2-T1");
      assert.equal(dailyChangeScenario?.task?.id, "W2-T2");
      assert.equal(releaseDriftScenario?.evidence?.lifecycleRegistryPath, ".spec/requirements/lifecycle.yaml");
      assert.equal(releaseDriftScenario?.evidence?.lifecycleRegistryVersion, 2);
      assert.equal(operationsScenario?.task?.id, "North-Star-Score-Phase-10");
      assert.equal(operationsScenario?.evidence?.globalOperationsPacketStatus, "ready");
      assert.equal(orgGraphScenario?.task?.id, "North-Star-Score-Phase-11");
      assert.equal(orgGraphScenario?.evidence?.orgResponsibilityGraphStatus, "ready");
      assert.equal(asyncInboxScenario?.task?.id, "North-Star-Score-Phase-12");
      assert.equal(asyncInboxScenario?.evidence?.asyncReviewInboxStatus, "ready");
      assert.equal(opsAgingScenario?.task?.id, "North-Star-Score-Phase-13");
      assert.equal(opsAgingScenario?.evidence?.opsAgingLedgerStatus, "ready");
      assert.equal(releaseTrainScenario?.task?.id, "North-Star-Score-Phase-14");
      assert.equal(releaseTrainScenario?.evidence?.releaseTrainPacketStatus, "ready");
      assert.equal(orgOperationsScenario?.task?.id, "North-Star-Score-Phase-15");
      assert.equal(orgOperationsScenario?.evidence?.orgOperationsConsoleStatus, "ready");
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
      assert.match(
        fs.readFileSync(path.join(root, ".spec/north-star/scenarios/global_operations_packet-decision.md"), "utf-8"),
        /Global operations deferred surfaces diagnostic-only: true/,
      );
      assert.match(
        fs.readFileSync(path.join(root, ".spec/north-star/scenarios/org_responsibility_graph-decision.md"), "utf-8"),
        /Org responsibility graph: ready/,
      );
      assert.match(
        fs.readFileSync(path.join(root, ".spec/north-star/scenarios/async_review_inbox-decision.md"), "utf-8"),
        /Async review inbox: ready/,
      );
      assert.match(
        fs.readFileSync(path.join(root, ".spec/north-star/scenarios/ops_aging_ledger-decision.md"), "utf-8"),
        /Ops aging ledger: ready/,
      );
      assert.match(
        fs.readFileSync(path.join(root, ".spec/north-star/scenarios/release_train_packet-decision.md"), "utf-8"),
        /Release train packet: ready/,
      );
      assert.match(
        fs.readFileSync(path.join(root, ".spec/north-star/scenarios/org_operations_console-decision.md"), "utf-8"),
        /Org operations console: ready/,
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
      const operationsScenario = saved.scenarios.find((scenario) => scenario.id === "global_operations_packet");
      const orgGraphScenario = saved.scenarios.find((scenario) => scenario.id === "org_responsibility_graph");
      const asyncInboxScenario = saved.scenarios.find((scenario) => scenario.id === "async_review_inbox");
      const opsAgingScenario = saved.scenarios.find((scenario) => scenario.id === "ops_aging_ledger");
      const releaseTrainScenario = saved.scenarios.find((scenario) => scenario.id === "release_train_packet");
      const orgOperationsScenario = saved.scenarios.find((scenario) => scenario.id === "org_operations_console");

      assert.equal(consoleSourceEvolution?.status, "passed");
      assert.equal(consoleSourceEvolution?.evidence?.currentChangeState, "adopted");
      assert.equal(consoleSourceEvolution?.evidence?.sourceReviewCoverage?.adopted, 2);
      assert.equal(ownerActionScenario?.evidence?.aggregateOwnerActionCount, 1);
      assert.equal(ownerActionScenario?.evidence?.aggregateContractDriftHintCount, 1);
      assert.equal(releaseCompareScenario?.evidence?.releaseCompareGlobalContextStatus, "available");
      assert.equal(releaseCompareScenario?.evidence?.releaseCompareOwnerReviewRecommendationCount, 1);
      assert.equal(releaseCompareScenario?.evidence?.releaseCompareRelevantHintCount, 1);
      assert.equal(releaseCompareScenario?.evidence?.releaseCompareRelevantOwnerActionCount, 1);
      assert.equal(doctorGlobalScenario?.evidence?.doctorGlobalReady, true);
      assert.equal(doctorGlobalScenario?.evidence?.doctorGlobalBlockerCount, 0);
      assert.equal(operationsScenario?.status, "passed");
      assert.equal(operationsScenario?.evidence?.globalOperationsSupportSurfaceCount, 4);
      assert.equal(operationsScenario?.evidence?.globalOperationsBoundaryReplacesVerify, false);
      assert.equal(orgGraphScenario?.status, "passed");
      assert.equal(orgGraphScenario?.evidence?.orgResponsibilityTeamCount, 2);
      assert.equal(orgGraphScenario?.evidence?.orgResponsibilityBoundaryReplacesVerify, false);
      assert.equal(asyncInboxScenario?.status, "passed");
      assert.equal(asyncInboxScenario?.evidence?.asyncReviewTotalItems, 2);
      assert.equal(asyncInboxScenario?.evidence?.asyncReviewRealtimeCollaborationRequired, false);
      assert.equal(opsAgingScenario?.status, "passed");
      assert.equal(opsAgingScenario?.evidence?.opsAgingTotalItems, 2);
      assert.equal(opsAgingScenario?.evidence?.opsAgingBoundaryReplacesVerify, false);
      assert.equal(releaseTrainScenario?.status, "passed");
      assert.equal(releaseTrainScenario?.evidence?.releaseTrainReady, true);
      assert.equal(releaseTrainScenario?.evidence?.releaseTrainBoundaryReplacesPostReleaseGate, false);
      assert.equal(orgOperationsScenario?.status, "passed");
      assert.equal(orgOperationsScenario?.evidence?.orgOperationsReady, true);
      assert.equal(orgOperationsScenario?.evidence?.orgOperationsBoundaryReplacesVerify, false);

      assert.match(fs.readFileSync(path.join(root, ".spec/north-star/scenarios/console_source_evolution-decision.md"), "utf-8"), /Current change state: adopted/);
      assert.match(fs.readFileSync(path.join(root, ".spec/north-star/scenarios/multi_repo_owner_action-decision.md"), "utf-8"), /Aggregate owner actions: 1/);
      assert.match(fs.readFileSync(path.join(root, ".spec/north-star/scenarios/release_compare_global_context-decision.md"), "utf-8"), /Release compare global context: available/);
      assert.match(fs.readFileSync(path.join(root, ".spec/north-star/scenarios/doctor_global_health-decision.md"), "utf-8"), /Doctor global prerequisites healthy: true/);
      assert.match(fs.readFileSync(path.join(root, ".spec/north-star/scenarios/global_operations_packet-decision.md"), "utf-8"), /Global operations packet: ready/);
      assert.match(fs.readFileSync(path.join(root, ".spec/north-star/scenarios/org_responsibility_graph-decision.md"), "utf-8"), /Org responsibility graph: ready/);
      assert.match(fs.readFileSync(path.join(root, ".spec/north-star/scenarios/async_review_inbox-decision.md"), "utf-8"), /Async review inbox: ready/);
      assert.match(fs.readFileSync(path.join(root, ".spec/north-star/scenarios/ops_aging_ledger-decision.md"), "utf-8"), /Ops aging ledger: ready/);
      assert.match(fs.readFileSync(path.join(root, ".spec/north-star/scenarios/release_train_packet-decision.md"), "utf-8"), /Release train packet: ready/);
      assert.match(fs.readFileSync(path.join(root, ".spec/north-star/scenarios/org_operations_console-decision.md"), "utf-8"), /Org operations console: ready/);

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
  writeText(root, ".jispec/recovery/mainline-drill.json", JSON.stringify({
    schemaVersion: 1,
    kind: "jispec-mainline-recovery-drill",
    generatedAt: "2026-05-02T00:00:00.000Z",
    root,
    status: "ready",
    summary: "One recovery drill step is ready.",
    boundary: {
      localOnly: true,
      sourceUploadRequired: false,
      executesCommands: false,
      writesOnlyDeclaredArtifacts: true,
      replacesVerify: false,
      replacesDoctorMainline: false,
    },
    sourceDiagnosis: {
      state: "continue_active_session",
      status: "pass",
      summary: "Active change session has a direct continuation path.",
      details: [],
      ownerAction: "Follow the current session's next command.",
      nextCommand: "npm run jispec-cli -- verify --fast",
      sourceArtifacts: [".jispec/change-session.json"],
      sessionId: "change-1",
    },
    steps: [{
      order: 1,
      id: "mainline-recovery:continue_active_session:change-1",
      currentState: "continue_active_session",
      sourceArtifact: ".jispec/change-session.json",
      ownerAction: "Follow the current session's next command.",
      command: "npm run jispec-cli -- verify --fast",
      expectedNextState: "The active session either reaches verify, writes a handoff packet, or reports a fresh mainline blocker.",
      verificationCommand: "npm run ci:verify",
      risk: "medium",
      evidenceArtifacts: [".jispec/change-session.json"],
    }],
  }, null, 2));
  writeText(root, ".jispec/recovery/mainline-drill.md", "# JiSpec Mainline Recovery Drill\n");
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
    promotionReadiness: readyPromotionReadiness(),
    repoGroup: {
      status: "available",
      sourcePath: ".spec/console/repo-group.yaml",
      repos: [
        {
          id: "payments",
          role: "upstream",
          owner: "payments-team",
          snapshotStatus: "available",
          upstreamContractRefs: [],
          downstreamContractRefs: [".spec/contracts/orders.yaml"],
        },
        {
          id: "orders",
          role: "downstream",
          owner: "platform",
          snapshotStatus: "available",
          upstreamContractRefs: [".spec/contracts/orders.yaml"],
          downstreamContractRefs: [],
        },
      ],
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
  writeReadyAuditLedger(root);
  writeText(root, ".spec/doctor/global-readiness.json", JSON.stringify({
    profile: "global",
    ready: true,
    readinessSummary: {
      profile: "global",
      ready: true,
      blockerCount: 0,
      blockers: [],
    },
    checks: [],
  }, null, 2));
  writeText(root, ".spec/operations/global-operations-packet.json", JSON.stringify({
    schemaVersion: 1,
    kind: "jispec-global-operations-packet",
    generatedAt: "2026-05-02T00:00:00.000Z",
    root: root.replace(/\\/g, "/"),
    status: "ready",
    boundary: {
      localOnly: true,
      sourceUploadRequired: false,
      realtimeCollaborationRequired: false,
      executesCommands: false,
      replacesVerify: false,
      replacesDoctorGlobal: false,
      deferredSurfacesDiagnosticOnly: true,
    },
    repoGroupTopology: {
      status: "available",
      sourcePath: ".spec/console/repo-group.yaml",
      repoCount: 2,
      repos: [
        {
          id: "payments",
          role: "upstream",
          owner: "payments-team",
          snapshotStatus: "available",
          upstreamContractRefs: [],
          downstreamContractRefs: [".spec/contracts/orders.yaml"],
        },
        {
          id: "orders",
          role: "downstream",
          owner: "platform",
          snapshotStatus: "available",
          upstreamContractRefs: [".spec/contracts/orders.yaml"],
          downstreamContractRefs: [],
        },
      ],
    },
    crossRepoContractRefs: [
      {
        upstreamRepoId: "payments",
        downstreamRepoId: "orders",
        contractRef: ".spec/contracts/orders.yaml",
        ownerActionId: "owner-action:orders:.spec/contracts/orders.yaml",
        evidence: { downstreamSourceEvolutionChangeId: "change-1" },
      },
    ],
    ownerActionLifecycle: [
      {
        id: "owner-action:orders:.spec/contracts/orders.yaml",
        status: "ready",
        owner: "platform",
        repoId: "orders",
        command: "npm run jispec-cli -- change --root .",
        followupCommands: [],
        affectedContracts: [".spec/contracts/orders.yaml"],
      },
    ],
    promotionReadiness: {
      ready: true,
      phase: "north-star-score-optimization-phase-2",
      checklistPassed: 5,
      checklistTotal: 5,
      blockers: [],
      referencedSupportSurfaces: [
        "audit_event_ledger",
        "doctor_global_readiness",
        "multi_repo_governance_aggregate",
        "privacy_redaction_posture",
      ],
    },
    privacyPosture: {
      status: "available",
      highSeverityFindingCount: 0,
      sourceArtifact: ".spec/privacy/privacy-report.json",
    },
    auditEvidenceRefs: [
      { type: "policy_approval_decision", actor: "platform", sourceArtifact: ".spec/approvals/policy.json", affectedContracts: [".spec/policy.yaml"] },
      { type: "waiver_renew", actor: "platform", sourceArtifact: ".spec/waivers/W-1.json", affectedContracts: [".spec/policy.yaml"] },
      { type: "spec_debt_repay", actor: "architect", sourceArtifact: ".spec/spec-debt/ledger.yaml", affectedContracts: [".spec/requirements/lifecycle.yaml"] },
      { type: "release_compare", actor: "release", sourceArtifact: ".spec/releases/compare/v1-to-current/compare-report.json", affectedContracts: [".spec/contracts/orders.yaml"] },
      { type: "source_adopt", actor: "architect", sourceArtifact: ".spec/deltas/change-1/source-review.yaml", affectedContracts: [".spec/requirements/lifecycle.yaml"] },
    ],
    asyncCollaborationEvents: [
      { kind: "reviewer_acknowledged", status: "available", evidenceArtifact: ".spec/audit/events.jsonl" },
      { kind: "waiver_approved", status: "available", evidenceArtifact: ".spec/audit/events.jsonl" },
      { kind: "debt_repaid", status: "available", evidenceArtifact: ".spec/audit/events.jsonl" },
      { kind: "drift_owner_assigned", status: "available", evidenceArtifact: ".spec/audit/events.jsonl" },
      { kind: "promotion_accepted", status: "available", evidenceArtifact: ".spec/audit/events.jsonl" },
      { kind: "promotion_rejected", status: "missing", evidenceArtifact: ".spec/audit/events.jsonl" },
    ],
    verifyBoundaryStatement: "Global operations packet is local read-only evidence. It does not run verify, replace ci:verify, override doctor global, upload source, or promote deferred collaboration surfaces into global gates.",
    doctorGlobalReadiness: {
      ready: true,
      blockerCount: 0,
      sourceArtifact: ".spec/doctor/global-readiness.json",
    },
    blockers: [],
  }, null, 2));
  writeText(root, ".spec/operations/global-operations-packet.md", "# JiSpec Global Operations Packet\n");
  writeText(root, ".spec/operations/org-responsibility-graph.json", JSON.stringify({
    schemaVersion: 1,
    kind: "jispec-org-responsibility-graph",
    generatedAt: "2026-05-02T00:00:00.000Z",
    root: root.replace(/\\/g, "/"),
    status: "ready",
    boundary: {
      localOnly: true,
      sourceUploadRequired: false,
      realtimeCollaborationRequired: false,
      executesCommands: false,
      replacesVerify: false,
      replacesDoctorGlobal: false,
      deferredSurfacesDiagnosticOnly: true,
    },
    orgTopology: {
      orgId: "acme-platform",
      sourcePath: ".spec/operations/org-topology.json",
      teamCount: 2,
      repoCount: 2,
      teams: [
        { id: "platform", name: "Platform", owner: "platform-lead", reviewers: ["alice", "bob"], escalation: ["director-eng"] },
        { id: "payments-team", name: "Payments", owner: "payments-lead", reviewers: ["pay-reviewer"], escalation: ["director-eng"] },
      ],
      repos: [
        { id: "orders", ownerTeamId: "platform", owner: "platform", role: "downstream" },
        { id: "payments", ownerTeamId: "payments-team", owner: "payments-team", role: "upstream" },
      ],
    },
    responsibilityEdges: [
      { repoId: "orders", teamId: "platform", owner: "platform-lead", reviewers: ["alice", "bob"], escalationPath: ["director-eng"], source: "org-topology" },
      { repoId: "payments", teamId: "payments-team", owner: "payments-lead", reviewers: ["pay-reviewer"], escalationPath: ["director-eng"], source: "org-topology" },
    ],
    ownerActionAssignments: [
      {
        actionId: "owner-action:orders:.spec/contracts/orders.yaml",
        repoId: "orders",
        teamId: "platform",
        owner: "platform",
        reviewers: ["alice", "bob"],
        escalationPath: ["director-eng"],
        command: "npm run jispec-cli -- change --root .",
        affectedContracts: [".spec/contracts/orders.yaml"],
      },
    ],
    reviewerCoverage: {
      totalOwnerActions: 1,
      actionsWithOwner: 1,
      actionsWithReviewer: 1,
      actionsWithEscalation: 1,
    },
    auditEvidenceRefs: [
      { type: "release_compare", actor: "release", sourceArtifact: ".spec/releases/compare/v1-to-current/compare-report.json", affectedContracts: [".spec/contracts/orders.yaml"] },
    ],
    verifyBoundaryStatement: "Org responsibility graph is local read-only evidence. It does not execute owner action commands, upload source, replace verify, override doctor global, or require real-time collaboration.",
    blockers: [],
  }, null, 2));
  writeText(root, ".spec/operations/org-responsibility-graph.md", "# JiSpec Org Responsibility Graph\n");
  writeText(root, ".spec/operations/async-review-inbox.json", JSON.stringify({
    schemaVersion: 1,
    kind: "jispec-async-review-inbox",
    generatedAt: "2026-05-02T00:00:00.000Z",
    root: root.replace(/\\/g, "/"),
    status: "ready",
    boundary: {
      localOnly: true,
      sourceUploadRequired: false,
      realtimeCollaborationRequired: false,
      executesCommands: false,
      replacesVerify: false,
      replacesDoctorGlobal: false,
      deferredSurfacesDiagnosticOnly: true,
    },
    sourceGraph: {
      status: "ready",
      sourcePath: ".spec/operations/org-responsibility-graph.json",
      teamCount: 2,
      repoCount: 2,
      ownerActionAssignmentCount: 1,
    },
    summary: {
      reviewerCount: 2,
      totalItems: 2,
      pending: 2,
      accepted: 0,
      blocked: 0,
      expired: 0,
      reviewersMissing: 0,
      escalationReadyItems: 2,
    },
    reviewers: [
      { reviewer: "alice", ownerTeams: ["platform"], pending: ["review:alice:owner-action:orders:.spec/contracts/orders.yaml"], accepted: [], blocked: [], expired: [], escalationPath: ["director-eng"] },
      { reviewer: "bob", ownerTeams: ["platform"], pending: ["review:bob:owner-action:orders:.spec/contracts/orders.yaml"], accepted: [], blocked: [], expired: [], escalationPath: ["director-eng"] },
    ],
    items: [
      {
        requestId: "review:alice:owner-action:orders:.spec/contracts/orders.yaml",
        kind: "owner_action_review",
        status: "pending",
        reviewer: "alice",
        owner: "platform",
        teamId: "platform",
        repoId: "orders",
        openedAt: "2026-05-02T00:00:00.000Z",
        dueAt: "2099-01-01T00:00:00.000Z",
        actionId: "owner-action:orders:.spec/contracts/orders.yaml",
        command: "npm run jispec-cli -- change --root .",
        affectedContracts: [".spec/contracts/orders.yaml"],
        escalationPath: ["director-eng"],
        sourceArtifact: ".spec/operations/org-responsibility-graph.json",
      },
      {
        requestId: "review:bob:owner-action:orders:.spec/contracts/orders.yaml",
        kind: "owner_action_review",
        status: "pending",
        reviewer: "bob",
        owner: "platform",
        teamId: "platform",
        repoId: "orders",
        openedAt: "2026-05-02T00:00:00.000Z",
        dueAt: "2099-01-01T00:00:00.000Z",
        actionId: "owner-action:orders:.spec/contracts/orders.yaml",
        command: "npm run jispec-cli -- change --root .",
        affectedContracts: [".spec/contracts/orders.yaml"],
        escalationPath: ["director-eng"],
        sourceArtifact: ".spec/operations/org-responsibility-graph.json",
      },
    ],
    auditEvidenceRefs: [
      { type: "release_compare", actor: "release", sourceArtifact: ".spec/releases/compare/v1-to-current/compare-report.json", affectedContracts: [".spec/contracts/orders.yaml"] },
    ],
    verifyBoundaryStatement: "Async review inbox is local read-only evidence. It does not notify remote services, require real-time collaboration, execute review commands, upload source, replace verify, or override doctor global.",
    blockers: [],
  }, null, 2));
  writeText(root, ".spec/operations/async-review-inbox.md", "# JiSpec Async Review Inbox\n");
  writeOpsAgingLedger(root);
  writeReleaseTrainPacket(root);
  writeLocalConsoleUi({ root });
  writeText(root, ".spec/replay/provenance-baseline.json", JSON.stringify({ replayable: true }, null, 2));
  writeText(root, ".jispec-ci/verify-report.json", JSON.stringify({ verdict: "PASS", ok: true }, null, 2));
  writeText(root, ".spec/pilot/package.json", JSON.stringify({ kind: "jispec-pilot-product-package" }, null, 2));
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
      { id: "repo_group_configured", status: "pass", summary: "Explicit repo group topology is available.", evidence: ["2 configured repo(s)"], blockers: [] },
      { id: "cross_repo_contract_refs", status: "pass", summary: "Cross-repo refs produce drift hints.", evidence: ["1 cross-repo drift hint(s)"], blockers: [] },
      { id: "owner_action_lifecycle", status: "pass", summary: "Owner actions include commands and local artifact writes.", evidence: ["1 owner action lifecycle packet(s)"], blockers: [] },
      { id: "promotion_candidate_boundary", status: "pass", summary: "The aggregate cannot replace verify.", evidence: ["blockingGateReplacement=false"], blockers: [] },
      { id: "north_star_acceptance_coverage", status: "pass", summary: "Dedicated global closure scenarios cover the promotion.", evidence: ["multi_repo_owner_action", "release_compare_global_context", "doctor_global_health"], blockers: [] },
    ],
    blockers: [],
    scoreImpact: {
      dimension: "terminal-control-plane",
      currentTarget: "9.0+",
      evidence: ["promotion readiness ready"],
    },
  };
}

function writeReadyAuditLedger(root: string): void {
  for (const event of [
    {
      type: "policy_approval_decision" as const,
      actor: "platform",
      sourceArtifact: { kind: "json", path: ".spec/approvals/policy.json" },
      affectedContracts: [".spec/policy.yaml"],
    },
    {
      type: "waiver_renew" as const,
      actor: "platform",
      sourceArtifact: { kind: "json", path: ".spec/waivers/W-1.json" },
      affectedContracts: [".spec/policy.yaml"],
    },
    {
      type: "spec_debt_repay" as const,
      actor: "architect",
      sourceArtifact: { kind: "yaml", path: ".spec/spec-debt/ledger.yaml" },
      affectedContracts: [".spec/requirements/lifecycle.yaml"],
    },
    {
      type: "release_compare" as const,
      actor: "release",
      sourceArtifact: { kind: "json", path: ".spec/releases/compare/v1-to-current/compare-report.json" },
      affectedContracts: [".spec/contracts/orders.yaml"],
    },
    {
      type: "source_adopt" as const,
      actor: "architect",
      sourceArtifact: { kind: "yaml", path: ".spec/deltas/change-1/source-review.yaml" },
      affectedContracts: [".spec/requirements/lifecycle.yaml"],
    },
  ]) {
    appendAuditEvent(root, event);
  }
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
