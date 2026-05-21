import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { appendAuditEvent } from "../audit/event-ledger";
import { Doctor, type DoctorReport } from "../doctor";
import { writeGlobalOperationsPacket } from "../operations/global-operations-packet";
import { writeOrgResponsibilityGraph } from "../operations/org-responsibility-graph";
import { writeAsyncReviewInbox } from "../operations/async-review-inbox";
import { writeOpsAgingLedger } from "../operations/ops-aging-ledger";
import { writeReleaseTrainPacket } from "../operations/release-train-packet";
import { writeLocalConsoleUi } from "../console/ui/static-dashboard";
import { compareReleaseBaselines, type ReleaseCompareResult } from "../release/baseline-snapshot";
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
  console.log("=== P1 Global Closure Regression Tests ===\n");

  const results: TestResult[] = [];

  await runCase(results, "source evolution closure resolves adopted, deferred-repaid, console, and owner-action evidence together", async () => {
    withFixture((root) => {
      seedGlobalClosureFixture(root);
      const acceptance = buildNorthStarAcceptance({
        root,
        generatedAt: "2026-05-06T00:00:00.000Z",
      });
      assert.equal(acceptance.summary.ready, true);
      assert.equal(acceptance.summary.blockingScenarioCount, 0);

      const adopted = requiredScenario(acceptance, "source_evolution_adopted");
      const deferredRepaid = requiredScenario(acceptance, "source_evolution_deferred_repaid");
      const consoleEvolution = requiredScenario(acceptance, "console_source_evolution");
      const ownerAction = requiredScenario(acceptance, "multi_repo_owner_action");

      assert.equal(adopted.status, "passed");
      assert.equal(deferredRepaid.status, "passed");
      assert.equal(consoleEvolution.status, "passed");
      assert.equal(ownerAction.status, "passed");
      assert.match(adopted.evidence?.summary ?? "", /fully adopted/i);
      assert.match(deferredRepaid.evidence?.summary ?? "", /repayment history/i);
      assert.equal(consoleEvolution.evidence?.governedRequirementEvolution, true);
      assert.equal(ownerAction.evidence?.aggregateOwnerActionCount, 1);
    });
  });

  await runCase(results, "north-star acceptance keeps the 22-scenario closeout and key closure scenario order", async () => {
    withFixture((root) => {
      seedGlobalClosureFixture(root);
      const written = writeNorthStarAcceptance({
        root,
        generatedAt: "2026-05-06T00:00:00.000Z",
      });

      const acceptance = written.acceptance as NorthStarAcceptance;
      assert.equal(acceptance.summary.ready, true);
      assert.equal(acceptance.summary.scenarioCount, 22);
      assert.equal(acceptance.summary.passedScenarioCount, 22);
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
      assert.equal(fs.existsSync(path.join(root, ".spec", "north-star", "acceptance.json")), true);
      assert.equal(fs.existsSync(path.join(root, ".spec", "north-star", "scenarios", "doctor_global_health.json")), true);
      assert.equal(fs.existsSync(path.join(root, ".spec", "north-star", "scenarios", "global_operations_packet.json")), true);
      assert.equal(fs.existsSync(path.join(root, ".spec", "north-star", "scenarios", "org_responsibility_graph.json")), true);
      assert.equal(fs.existsSync(path.join(root, ".spec", "north-star", "scenarios", "async_review_inbox.json")), true);
      assert.equal(fs.existsSync(path.join(root, ".spec", "north-star", "scenarios", "ops_aging_ledger.json")), true);
      assert.equal(fs.existsSync(path.join(root, ".spec", "north-star", "scenarios", "release_train_packet.json")), true);
      assert.equal(fs.existsSync(path.join(root, ".spec", "north-star", "scenarios", "org_operations_console.json")), true);
      assert.equal(fs.existsSync(path.join(root, ".spec", "north-star", "scenarios", "release_compare_global_context-decision.md")), true);
    });
  });

  await runCase(results, "release compare global context stays available and points back to source evolution plus aggregate artifacts", async () => {
    withFixture((root) => {
      seedGlobalClosureFixture(root);
      const result = compareReleaseBaselines({
        root,
        from: "v1",
        to: "v2",
        comparedAt: "2026-05-06T00:00:00.000Z",
      });

      assert.equal(result.globalContext.status, "available");
      assert.equal(result.globalContext.details.aggregatePath, ".spec/console/multi-repo-governance.json");
      assert.equal(result.globalContext.details.lifecycleRegistryDelta.toVersion, 2);
      assert.equal(result.globalContext.details.sourceEvolutionArtifacts.toSourceEvolutionPath, ".spec/deltas/change-2/source-evolution.json");
      assert.equal(result.globalContext.details.sourceEvolutionArtifacts.toSourceReviewPath, ".spec/deltas/change-2/source-review.yaml");
      assert.equal(result.globalContext.details.relevantContractDriftHints.length, 2);
      assert.equal(result.globalContext.details.relevantOwnerActions.length, 1);
      assert.equal(result.globalContext.details.ownerReviewRecommendations.length, 2);
      assert.match(fs.readFileSync(result.compareReportMarkdownPath, "utf-8"), /## Global Closure Context/);
      assert.match(fs.readFileSync(result.compareReportMarkdownPath, "utf-8"), /Owner-review recommendations:/);
    });
  });

  await runCase(results, "doctor global exposes broader closure checks without pulling deferred runtime checks", async () => {
    const root = createFixtureRoot("jispec-p1-global-closure-doctor-", { parentDir: repoRoot() });
    try {
      seedGlobalDoctorReadyFixture(root);
      const report = await new Doctor(root).checkGlobalReadiness();

      assert.equal(report.profile, "global");
      assert.ok(typeof report.ready === "boolean");
      assert.ok(report.checks.some((check) => check.name === "Source Evolution Governance Artifact Health"));
      assert.ok(report.checks.some((check) => check.name === "Release Compare Contract Readiness"));
      assert.ok(report.checks.some((check) => check.name === "Absolute Terminal Boundary"));
      assert.ok(report.checks.some((check) => check.name === "North Star Acceptance Artifact Readiness"));
      assert.ok(report.checks.some((check) => check.name === "Multi-Repo Aggregate Contract Readiness"));
      assert.ok(report.checks.some((check) => check.name === "Global Operations Packet Readiness"));
      assert.ok(report.checks.some((check) => check.name === "Org Responsibility Graph Readiness"));
      assert.ok(report.checks.some((check) => check.name === "Async Review Inbox Readiness"));
      assert.ok(report.checks.some((check) => check.name === "Ops Aging Ledger Readiness"));
      assert.ok(report.checks.some((check) => check.name === "Release Train Packet Readiness"));
      assert.ok(!report.checks.some((check) => check.name === "Collaboration Engine"));
      assert.match(Doctor.formatText(report), /Global Operations Packet Readiness/);
      assert.match(Doctor.formatText(report), /Org Responsibility Graph Readiness/);
      assert.match(Doctor.formatText(report), /Async Review Inbox Readiness/);
      assert.match(Doctor.formatText(report), /Ops Aging Ledger Readiness/);
      assert.match(Doctor.formatText(report), /Release Train Packet Readiness/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  summarize(results);
}

function seedGlobalClosureFixture(root: string): void {
  writeText(root, ".jispec-ci/verify-report.json", JSON.stringify({
    verdict: "PASS",
    issueCount: 0,
    blockingIssueCount: 0,
    counts: {
      total: 0,
      blocking: 0,
      advisory: 0,
    },
  }, null, 2));
  writeText(root, ".spec/handoffs/bootstrap-takeover.json", JSON.stringify({
    status: "committed",
    adoptedArtifactPaths: [".spec/baselines/current.yaml"],
  }, null, 2));
  writeText(root, ".spec/greenfield/initialization-summary.md", "# Greenfield summary\n");
  writeText(root, ".jispec/change-session.json", JSON.stringify({
    id: "change-1",
    summary: "Refresh cross-repo contract",
    orchestrationMode: "execute",
    laneDecision: { lane: "strict", reasons: ["contract drift"], autoPromoted: false },
    changedPaths: [{ path: ".spec/contracts/orders.yaml", kind: "contract" }],
    nextCommands: [{ command: "npm run jispec-cli -- verify", description: "Verify the change." }],
  }, null, 2));
  writeText(root, ".jispec/recovery/mainline-drill.json", JSON.stringify({
    schemaVersion: 1,
    kind: "jispec-mainline-recovery-drill",
    generatedAt: "2026-05-06T00:00:00.000Z",
    root: normalize(root),
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
      ownerAction: "Follow the current session next command.",
      nextCommand: "npm run jispec-cli -- verify",
      sourceArtifacts: [".jispec/change-session.json"],
      sessionId: "change-1",
    },
    steps: [{
      order: 1,
      id: "mainline-recovery:continue_active_session:change-1",
      currentState: "continue_active_session",
      sourceArtifact: ".jispec/change-session.json",
      ownerAction: "Follow the current session next command.",
      command: "npm run jispec-cli -- verify",
      expectedNextState: "The active session either reaches verify, writes a handoff packet, or reports a fresh mainline blocker.",
      verificationCommand: "npm run ci:verify",
      risk: "medium",
      evidenceArtifacts: [".jispec/change-session.json"],
    }],
  }, null, 2));
  writeText(root, ".jispec/recovery/mainline-drill.md", "# JiSpec Mainline Recovery Drill\n");
  writeText(root, ".jispec/implement/change-1/patch-mediation.json", JSON.stringify({ externalPatchControlled: true }, null, 2));
  writeText(root, ".spec/waivers/W-1.json", JSON.stringify({ id: "W-1", status: "active" }, null, 2));
  writeText(root, ".spec/privacy/privacy-report.json", JSON.stringify({
    kind: "jispec-privacy-report",
    summary: { highSeverityFindingCount: 0 },
  }, null, 2));
  writeText(root, ".spec/pilot/package.json", JSON.stringify({ kind: "jispec-pilot-product-package" }, null, 2));

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
    source_snapshot: {
      active_snapshot_id: "snapshot-ordering-v2",
      lifecycle_registry_path: ".spec/requirements/lifecycle.yaml",
      lifecycle_registry_version: 2,
      last_adopted_change_id: "change-1",
    },
    requirement_lifecycle: {
      path: ".spec/requirements/lifecycle.yaml",
      registry_version: 2,
      active_snapshot_id: "snapshot-ordering-v2",
      last_adopted_change_id: "change-1",
    },
    source_evolution: {
      source_evolution_path: ".spec/deltas/change-1/source-evolution.json",
      source_review_path: ".spec/deltas/change-1/source-review.yaml",
      last_adopted_change_id: "change-1",
    },
  });

  writeYaml(root, ".spec/requirements/lifecycle.yaml", {
    version: 1,
    registry_version: 2,
    generated_at: "2026-05-06T00:00:00.000Z",
    active_snapshot_id: "snapshot-ordering-v2",
    last_adopted_change_id: "change-1",
    requirements: [
      {
        id: "REQ-1",
        status: "active",
        source_snapshot: "snapshot-ordering-v2",
        introduced_by_change: null,
        modified_by_change: "change-1",
        deprecated_by_change: null,
        supersedes: [],
        replaced_by: [],
        merged_from: [],
      },
    ],
  });

  writeText(root, ".spec/deltas/change-1/source-evolution.json", JSON.stringify({
    version: 1,
    generated_at: "2026-05-06T00:00:00.000Z",
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
        evolution_id: "modified:req-1",
        evolution_kind: "modified",
        source_document: "requirements",
        severity: "blocking",
        path: "docs/input/requirements.md",
        anchor_id: "REQ-1",
        summary: "Requirement REQ-1 changed semantic content.",
      },
    ],
  }, null, 2));

  writeText(root, ".spec/deltas/change-1/source-review.yaml", yaml.dump({
    version: 1,
    change_id: "change-1",
    generated_at: "2026-05-06T00:00:00.000Z",
    updated_at: "2026-05-06T00:00:00.000Z",
    source_evolution_path: ".spec/deltas/change-1/source-evolution.json",
    items: [
      {
        item_id: "modified:req-1",
        evolution_id: "modified:req-1",
        anchor_id: "REQ-1",
        evolution_kind: "modified",
        source_document: "requirements",
        severity: "blocking",
        status: "adopted",
        summary: "Requirement REQ-1 changed semantic content.",
        review_history: [
          {
            action: "defer",
            actor: "architect",
            reason: "wait for sync",
            timestamp: "2026-05-05T00:00:00.000Z",
          },
          {
            action: "adopt",
            actor: "architect",
            reason: "repaid",
            timestamp: "2026-05-06T00:00:00.000Z",
          },
        ],
      },
    ],
  }, { lineWidth: 100, noRefs: true, sortKeys: false }));

  writeText(root, ".spec/console/governance-snapshot.json", JSON.stringify({
    schemaVersion: 1,
    kind: "jispec-multi-repo-governance-snapshot",
    exportedAt: "2026-05-06T00:00:00.000Z",
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
      createdAt: "2026-05-06T00:00:00.000Z",
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
      lifecycleDeltaCounts: { modified: 1 },
      releaseDriftStatus: "changed",
      releaseDriftTrendComparisons: 1,
      approvalWorkflowStatus: "not_available_yet",
      latestAuditActor: "reviewer",
      contractRefs: [{ ref: ".spec/contracts/orders.yaml", hash: "hash-orders" }],
    },
    governanceObjects: [
      {
        id: "source_evolution_governance",
        status: "available",
        summary: {
          lifecyclePath: ".spec/requirements/lifecycle.yaml",
          sourceEvolutionPath: ".spec/deltas/change-1/source-evolution.json",
          sourceReviewPath: ".spec/deltas/change-1/source-review.yaml",
          currentChangeState: "adopted",
          openReviewItems: 0,
          blockingOpenReviewItems: 0,
          deferredItems: 0,
          expiredDeferredItems: 0,
          reviewedBlockingItems: 1,
          activeSnapshotId: "snapshot-ordering-v2",
          lastAdoptedSourceChange: "change-1",
          activeRepresentativeItem: "REQ-1",
          sourceReviewCoverage: {
            totalItems: 1,
            open: 0,
            adopted: 1,
            deferred: 0,
            waived: 0,
            rejected: 0,
          },
          pendingChanges: [],
        },
      },
    ],
  }, null, 2));

  writeText(root, ".spec/console/multi-repo-governance.json", JSON.stringify({
    schemaVersion: 1,
    kind: "jispec-multi-repo-governance-aggregate",
    generatedAt: "2026-05-06T00:00:00.000Z",
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
      contractDriftHintCount: 2,
      ownerActionCount: 1,
      latestAuditActors: ["reviewer"],
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
          downstreamRepoPath: normalize(root),
          downstreamSourceEvolutionChangeId: "change-1",
          downstreamReleaseDriftStatus: "changed",
        },
        blockingGateReplacement: false,
      },
      {
        kind: "cross_repo_contract_drift",
        id: "hint:cart:.spec/contracts/cart.yaml->orders",
        upstreamRepoId: "cart",
        downstreamRepoId: "orders",
        contractRef: ".spec/contracts/cart.yaml",
        upstreamHash: "hash-upstream-cart",
        downstreamHash: "hash-orders-cart",
        severity: "owner_action",
        suggestedCommand: "npm run jispec-cli -- change --root . --contract cart",
        ownerActionId: "owner-action:orders:.spec/contracts/cart.yaml",
        evidence: {
          upstreamSnapshotPath: "/workspace/cart/.spec/console/governance-snapshot.json",
          downstreamSnapshotPath: ".spec/console/governance-snapshot.json",
          downstreamRepoPath: normalize(root),
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
        repoPath: normalize(root),
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
      releaseDrift: [{ repoId: "orders", repoName: "Orders", status: "changed", comparisons: 1 }],
      verify: [],
    },
  }, null, 2));

  writeText(root, ".spec/releases/drift-trend.json", JSON.stringify({
    latest: {
      reportPath: ".spec/releases/compare/v1-to-v2/compare-report.json",
      overallStatus: "changed",
    },
    compareCount: 1,
    changedCompareCount: 1,
  }, null, 2));

  writeText(root, ".spec/contracts/payment.yaml", "contract: payment\n");
  writeText(root, ".spec/contracts/cart.yaml", "contract: cart\n");
  writeText(root, ".spec/deltas/change-2/source-evolution.json", JSON.stringify({
    version: 1,
    generated_at: "2026-05-06T00:00:00.000Z",
    summary: {
      changed: true,
      total: 2,
      added: 0,
      modified: 1,
      deprecated: 1,
      split: 0,
      merged: 0,
      reanchored: 0,
    },
    items: [
      {
        evolution_id: "evo-2",
        evolution_kind: "modified",
        source_document: "requirements",
        severity: "blocking",
        path: "docs/input/requirements.md",
        anchor_id: "REQ-PAYMENT",
        summary: "Requirement REQ-PAYMENT changed semantic content.",
      },
      {
        evolution_id: "evo-3",
        evolution_kind: "deprecated",
        source_document: "requirements",
        severity: "blocking",
        path: "docs/input/requirements.md",
        anchor_id: "REQ-PAYMENT-LEGACY",
        successor_ids: ["REQ-PAYMENT"],
        summary: "Requirement REQ-PAYMENT-LEGACY is deprecated.",
      },
    ],
  }, null, 2));

  writeText(root, ".spec/deltas/change-2/source-review.yaml", yaml.dump({
    version: 1,
    change_id: "change-2",
    generated_at: "2026-05-06T00:00:00.000Z",
    updated_at: "2026-05-06T00:00:00.000Z",
    source_evolution_path: ".spec/deltas/change-2/source-evolution.json",
    items: [
      {
        evolution_id: "evo-2",
        maps_to: ["REQ-PAYMENT"],
      },
      {
        evolution_id: "evo-3",
        maps_to: ["REQ-PAYMENT"],
      },
    ],
  }, { lineWidth: 100, noRefs: true, sortKeys: false }));

  writeText(root, ".spec/baselines/releases/v1.yaml", yaml.dump({
    release_version: "v1",
    frozen_at: "2026-05-06T00:00:00.000Z",
    requirement_ids: ["REQ-PAYMENT-LEGACY"],
    contexts: ["checkout"],
    contracts: ["CTR-PAYMENT"],
    scenarios: ["SCN-PAYMENT"],
    slices: [],
    assets: [],
    source_snapshot: {
      active_snapshot_id: "snapshot-payment-v1",
      lifecycle_registry_path: ".spec/requirements/lifecycle.yaml",
      lifecycle_registry_version: 1,
      last_adopted_change_id: "change-1",
    },
    requirement_lifecycle: {
      path: ".spec/requirements/lifecycle.yaml",
      registry_version: 1,
      active_snapshot_id: "snapshot-payment-v1",
      last_adopted_change_id: "change-1",
    },
    source_evolution: {
      source_evolution_path: ".spec/deltas/change-1/source-evolution.json",
      source_review_path: ".spec/deltas/change-1/source-review.yaml",
      last_adopted_change_id: "change-1",
    },
    applied_deltas: ["change-1"],
  }, { lineWidth: 100, noRefs: true, sortKeys: false }));

  writeText(root, ".spec/baselines/releases/v2.yaml", yaml.dump({
    release_version: "v2",
    frozen_at: "2026-05-06T00:00:00.000Z",
    requirement_ids: ["REQ-PAYMENT"],
    contexts: ["checkout"],
    contracts: ["CTR-PAYMENT"],
    scenarios: ["SCN-PAYMENT"],
    slices: [],
    assets: [],
    source_snapshot: {
      active_snapshot_id: "snapshot-payment-v2",
      lifecycle_registry_path: ".spec/requirements/lifecycle.yaml",
      lifecycle_registry_version: 2,
      last_adopted_change_id: "change-2",
    },
    requirement_lifecycle: {
      path: ".spec/requirements/lifecycle.yaml",
      registry_version: 2,
      active_snapshot_id: "snapshot-payment-v2",
      last_adopted_change_id: "change-2",
    },
    source_evolution: {
      source_evolution_path: ".spec/deltas/change-2/source-evolution.json",
      source_review_path: ".spec/deltas/change-2/source-review.yaml",
      last_adopted_change_id: "change-2",
    },
    applied_deltas: ["change-1", "change-2"],
  }, { lineWidth: 100, noRefs: true, sortKeys: false }));

  compareReleaseBaselines({
    root,
    from: "v1",
    to: "v2",
    comparedAt: "2026-05-06T00:00:00.000Z",
  });

  fs.rmSync(path.join(root, ".spec", "audit", "events.jsonl"), { force: true });
  writeReadyAuditLedger(root);
  writeText(root, ".spec/doctor/global-readiness.json", JSON.stringify({
    profile: "global",
    ready: true,
    readinessSummary: { profile: "global", ready: true, blockerCount: 0, blockers: [] },
    checks: [],
  }, null, 2));
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
  writeLocalConsoleUi({ root });
  writeNorthStarAcceptance({
    root,
    generatedAt: "2026-05-06T00:00:00.000Z",
  });
}

function writeOrgTopology(root: string): void {
  writeText(root, ".spec/operations/org-topology.json", JSON.stringify({
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
  }, null, 2));
}

function writeReadyAuditLedger(root: string): void {
  for (const event of [
    ["policy_approval_decision", ".spec/approvals/policy.json", ".spec/policy.yaml"],
    ["waiver_renew", ".spec/waivers/W-1.json", ".spec/policy.yaml"],
    ["spec_debt_repay", ".spec/spec-debt/ledger.yaml", ".spec/requirements/lifecycle.yaml"],
    ["release_compare", ".spec/releases/compare/v1-to-v2/compare-report.json", ".spec/contracts/orders.yaml"],
    ["source_adopt", ".spec/deltas/change-1/source-review.yaml", ".spec/requirements/lifecycle.yaml"],
  ] as const) {
    appendAuditEvent(root, {
      type: event[0],
      actor: "p1-global-closure",
      sourceArtifact: { kind: path.extname(event[1]).slice(1) || "artifact", path: event[1] },
      affectedContracts: [event[2]],
    });
  }
}

function requiredScenario(
  acceptance: ReturnType<typeof buildNorthStarAcceptance>,
  id: string,
): ReturnType<typeof buildNorthStarAcceptance>["scenarios"][number] {
  const scenario = acceptance.scenarios.find((entry) => entry.id === id);
  assert.ok(scenario, `Missing scenario ${id}`);
  return scenario!;
}

function withFixture(run: (root: string) => void): void {
  const root = createFixtureRoot("jispec-p1-global-closure-");
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function createFixtureRoot(prefix: string, options?: { parentDir?: string }): string {
  const repoRootPath = repoRoot();
  const fixtureRoot = fs.mkdtempSync(path.join(options?.parentDir ?? os.tmpdir(), prefix));
  for (const entry of ["tools", "scripts", "agents", "contexts", "docs", "jiproject", "schemas"] as const) {
    fs.cpSync(path.join(repoRootPath, entry), path.join(fixtureRoot, entry), { recursive: true, dereference: true });
  }
  fs.copyFileSync(path.join(repoRootPath, "package.json"), path.join(fixtureRoot, "package.json"));
  return fixtureRoot;
}

function repoRoot(): string {
  return path.resolve(__dirname, "..", "..", "..");
}

function runCase(results: TestResult[], name: string, run: () => Promise<void>): Promise<void> {
  return (async () => {
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
  })();
}

function summarize(results: TestResult[]): void {
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

function writeYaml(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, yaml.dump(value, { lineWidth: 100, noRefs: true, sortKeys: false }));
}

function writeText(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
}

function normalize(filePath: string): string {
  return filePath.replace(/\\/g, "/");
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
      { id: "cross_repo_contract_refs", status: "pass", summary: "Cross-repo refs produce drift hints.", evidence: ["2 cross-repo drift hint(s)"], blockers: [] },
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

function seedGlobalDoctorReadyFixture(root: string): void {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  for (const entry of ["tools", "scripts", "agents", "contexts", "docs", "jiproject", "schemas"] as const) {
    const source = path.join(repoRoot, entry);
    const target = path.join(root, entry);
    if (!fs.existsSync(target)) {
      fs.cpSync(source, target, { recursive: true, dereference: true });
    }
  }
  for (const file of ["package.json", "tsconfig.json"] as const) {
    const source = path.join(repoRoot, file);
    const target = path.join(root, file);
    if (!fs.existsSync(target)) {
      fs.copyFileSync(source, target);
    }
  }
  seedGlobalClosureFixture(root);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
