import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildNorthStarAcceptance, writeNorthStarAcceptance } from "../north-star/acceptance";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== P13 Global Closure Acceptance Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("north-star acceptance answers whether the global closure loop is operational", () => {
    withFixture((root) => {
      writeFixture(root, {
        reviewStatus: "adopted",
        includeDeferredRepaymentHistory: true,
        includeOwnerActions: true,
        includeReleaseGlobalContext: true,
      });
      const acceptance = buildNorthStarAcceptance({
        root,
        generatedAt: "2026-05-04T00:00:00.000Z",
      });

      assert.equal(acceptance.summary.ready, true);
      assert.equal(acceptance.summary.scenarioCount, 15);
      assert.equal(acceptance.scenarios.find((scenario) => scenario.id === "source_evolution_adopted")?.status, "passed");
      assert.equal(acceptance.scenarios.find((scenario) => scenario.id === "source_evolution_deferred_repaid")?.status, "passed");
      assert.equal(acceptance.scenarios.find((scenario) => scenario.id === "console_source_evolution")?.status, "passed");
      assert.equal(acceptance.scenarios.find((scenario) => scenario.id === "multi_repo_owner_action")?.status, "passed");
      assert.equal(acceptance.scenarios.find((scenario) => scenario.id === "release_compare_global_context")?.status, "passed");
      assert.equal(acceptance.scenarios.find((scenario) => scenario.id === "doctor_global_health")?.status, "passed");
      assert.equal(
        acceptance.scenarios.find((scenario) => scenario.id === "multi_repo_owner_action")?.evidence?.aggregateOwnerActionCount,
        1,
      );
      assert.equal(
        acceptance.scenarios.find((scenario) => scenario.id === "release_compare_global_context")?.evidence?.releaseCompareGlobalContextStatus,
        "available",
      );
      assert.equal(
        acceptance.scenarios.find((scenario) => scenario.id === "doctor_global_health")?.evidence?.doctorGlobalReady,
        true,
      );
    });
  }));

  results.push(record("global closure scenarios block when semantic loop signals are incomplete", () => {
    withFixture((root) => {
      writeFixture(root, {
        reviewStatus: "proposed",
        includeDeferredRepaymentHistory: false,
        includeOwnerActions: false,
        includeReleaseGlobalContext: false,
      });
      const acceptance = buildNorthStarAcceptance({
        root,
        generatedAt: "2026-05-04T00:00:00.000Z",
      });

      const adopted = requiredScenario(acceptance, "source_evolution_adopted");
      const deferredRepaid = requiredScenario(acceptance, "source_evolution_deferred_repaid");
      const ownerAction = requiredScenario(acceptance, "multi_repo_owner_action");
      const releaseCompare = requiredScenario(acceptance, "release_compare_global_context");
      const doctorGlobal = requiredScenario(acceptance, "doctor_global_health");

      assert.equal(adopted.status, "blocking");
      assert.ok(adopted.blockingReasons.some((reason) => reason.includes("Not every source review item is adopted yet")));
      assert.equal(deferredRepaid.status, "blocking");
      assert.ok(deferredRepaid.blockingReasons.some((reason) => reason.includes("defer -> adopt")));
      assert.equal(ownerAction.status, "blocking");
      assert.ok(ownerAction.blockingReasons.some((reason) => reason.includes("owner action")));
      assert.equal(releaseCompare.status, "blocking");
      assert.ok(releaseCompare.blockingReasons.some((reason) => reason.includes("globalContext")));
      assert.equal(doctorGlobal.status, "blocking");
      assert.ok(doctorGlobal.blockingReasons.length >= 3);
    });
  }));

  results.push(record("writer and docs surface the global closure layer while staying local-first", () => {
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    withFixture((root) => {
      writeFixture(root, {
        reviewStatus: "adopted",
        includeDeferredRepaymentHistory: true,
        includeOwnerActions: true,
        includeReleaseGlobalContext: true,
      });
      const written = writeNorthStarAcceptance({
        root,
        generatedAt: "2026-05-04T00:00:00.000Z",
      });
      const doc = fs.readFileSync(path.join(repoRoot, "docs", "north-star-acceptance.md"), "utf-8");

      assert.match(fs.readFileSync(written.decisionPacketPath, "utf-8"), /Global Closure/);
      assert.match(
        fs.readFileSync(path.join(root, ".spec/north-star/scenarios/doctor_global_health-decision.md"), "utf-8"),
        /Doctor global prerequisites healthy: true/,
      );
      assert.match(
        fs.readFileSync(path.join(root, ".spec/north-star/scenarios/source_evolution_deferred_repaid-decision.md"), "utf-8"),
        /defer.*adopt/i,
      );
      assert.match(doc, /source evolution reviewed and adopted/i);
      assert.match(doc, /doctor global artifact health/i);
      assert.match(doc, /acceptance complements but does not replace verify/i);
    });
  }));

  printResults(results);
}

function requiredScenario(
  acceptance: ReturnType<typeof buildNorthStarAcceptance>,
  id: string,
) {
  const scenario = acceptance.scenarios.find((entry) => entry.id === id);
  assert.ok(scenario, `Missing scenario ${id}`);
  return scenario!;
}

function withFixture(run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p13-global-closure-acceptance-"));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeFixture(
  root: string,
  options: {
    reviewStatus: "adopted" | "proposed";
    includeDeferredRepaymentHistory: boolean;
    includeOwnerActions: boolean;
    includeReleaseGlobalContext: boolean;
  },
): void {
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
  writeText(root, ".spec/audit/events.jsonl", `${JSON.stringify({ type: "verify", actor: "ci" })}\n`);
  writeText(root, ".spec/privacy/privacy-report.json", JSON.stringify({
    kind: "jispec-privacy-report",
    summary: { highSeverityFindingCount: 0 },
  }, null, 2));
  writeText(root, ".spec/pilot/package.json", JSON.stringify({ kind: "jispec-pilot-product-package" }, null, 2));
  writeText(root, ".jispec-ci/verify-report.json", JSON.stringify({ verdict: "PASS", ok: true }, null, 2));

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
  writeText(root, ".spec/requirements/lifecycle.yaml", [
    "version: 1",
    "registry_version: 2",
    "generated_at: 2026-05-04T00:00:00.000Z",
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
  writeText(root, ".spec/deltas/change-1/source-evolution.json", JSON.stringify({
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
  writeText(root, ".spec/deltas/change-1/source-review.yaml", [
    "version: 1",
    "change_id: change-1",
    "generated_at: 2026-05-04T00:00:00.000Z",
    "updated_at: 2026-05-04T00:00:00.000Z",
    "source_evolution_path: .spec/deltas/change-1/source-evolution.json",
    "items:",
    "  - item_id: modified:req-1",
    "    evolution_id: modified:req-1",
    "    anchor_id: REQ-1",
    "    evolution_kind: modified",
    "    source_document: requirements",
    "    severity: blocking",
    `    status: ${options.reviewStatus}`,
    "    summary: Requirement REQ-1 changed semantic content.",
    "    review_history:",
    ...(options.includeDeferredRepaymentHistory
      ? [
          "      - action: defer",
          "        actor: architect",
          "        reason: wait for sync",
          "        timestamp: 2026-05-03T00:00:00.000Z",
          "      - action: adopt",
          "        actor: architect",
          "        reason: repaid",
          "        timestamp: 2026-05-04T00:00:00.000Z",
        ]
      : [
          `      - action: ${options.reviewStatus === "adopted" ? "adopt" : "propose"}`,
          "        actor: architect",
          "        reason: initial review",
          "        timestamp: 2026-05-04T00:00:00.000Z",
        ]),
  ].join("\n"));

  writeText(root, ".spec/console/governance-snapshot.json", JSON.stringify({
    schemaVersion: 1,
    kind: "jispec-multi-repo-governance-snapshot",
    exportedAt: "2026-05-04T00:00:00.000Z",
    repo: { id: "orders", name: "Orders", root },
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
      sourceEvolutionChangeId: "change-1",
      sourceEvolutionBlockingOpenItems: options.reviewStatus === "adopted" ? 0 : 1,
      sourceEvolutionExpiredExceptions: 0,
      sourceEvolutionRepresentativeArtifact: "REQ-1",
      lastAdoptedSourceChange: "change-1",
      lifecycleDeltaCounts: { modified: 1 },
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
      releaseDriftHotspotCount: 1,
      totalReleaseDriftComparisons: 1,
      contractDriftHintCount: options.includeOwnerActions ? 1 : 0,
      ownerActionCount: options.includeOwnerActions ? 1 : 0,
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
    contractDriftHints: options.includeOwnerActions ? [{
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
    }] : [],
    ownerActions: options.includeOwnerActions ? [{
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
    }] : [],
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
  writeText(root, ".spec/releases/drift-trend.json", JSON.stringify({
    latest: {
      reportPath: ".spec/releases/compare/v1-to-current/compare-report.json",
      overallStatus: options.includeReleaseGlobalContext ? "changed" : "unchanged",
    },
    compareCount: 1,
    changedCompareCount: options.includeReleaseGlobalContext ? 1 : 0,
  }, null, 2));
  writeText(root, ".spec/releases/compare/v1-to-current/compare-report.json", JSON.stringify({
    driftSummary: {
      overallStatus: options.includeReleaseGlobalContext ? "changed" : "unchanged",
      requirementEvolution: {
        status: "changed",
        details: {
          to_source_evolution_path: ".spec/deltas/change-1/source-evolution.json",
          to_source_review_path: ".spec/deltas/change-1/source-review.yaml",
        },
      },
    },
    globalContext: options.includeReleaseGlobalContext
      ? {
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
            relevantContractDriftHints: options.includeOwnerActions ? [{ id: "hint:1" }] : [],
            relevantOwnerActions: options.includeOwnerActions ? [{ id: "owner-action:1" }] : [],
            ownerReviewRecommendations: options.includeOwnerActions ? [{ id: "owner-review:1" }] : [],
          },
        }
      : {
          status: "not_available_yet",
        },
  }, null, 2));
}

function normalize(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function writeText(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function printResults(results: TestResult[]): void {
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

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
