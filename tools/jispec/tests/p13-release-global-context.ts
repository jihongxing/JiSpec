import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { buildVerifyReport } from "../ci/verify-report";
import { compareReleaseBaselines, type ReleaseCompareResult } from "../release/baseline-snapshot";
import { createVerifyRunResult } from "../verify/verdict";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== P13 Release Global Context Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("release compare consumes aggregate context and emits owner-review recommendations", () => {
    const root = createFixtureRoot();
    try {
      writeReleaseFixture(root);
      writeAggregateFixture(root);

      const result = compareReleaseBaselines({
        root,
        from: "v1",
        to: "v2",
        comparedAt: "2026-05-04T01:00:00.000Z",
      });

      assert.equal(result.globalContext.status, "available");
      assert.equal(result.globalContext.boundary.declaredArtifactConsumer, true);
      assert.equal(result.globalContext.boundary.consumesMultiRepoAggregateArtifact, true);
      assert.equal(result.globalContext.boundary.scansSourceCode, false);
      assert.equal(result.globalContext.details.aggregatePath, ".spec/console/multi-repo-governance.json");
      assert.equal(result.globalContext.details.lifecycleRegistryDelta.fromVersion, 1);
      assert.equal(result.globalContext.details.lifecycleRegistryDelta.toVersion, 2);
      assert.equal(
        result.globalContext.details.sourceEvolutionArtifacts.toSourceEvolutionPath,
        ".spec/deltas/change-2/source-evolution.json",
      );
      assert.equal(result.globalContext.details.repoPosture?.sourceEvolutionChangeId, "change-2");
      assert.equal(result.globalContext.details.repoPosture?.sourceEvolutionBlockingOpenItems, 2);
      assert.equal(result.globalContext.details.representativeArtifacts[0], ".spec/contracts/payment.yaml");
      assert.equal(result.globalContext.details.relevantContractDriftHints.length, 2);
      assert.equal(result.globalContext.details.relevantContractDriftHints[0]?.contractRef, ".spec/contracts/payment.yaml");
      assert.equal(result.globalContext.details.relevantOwnerActions.length, 1);
      assert.equal(result.globalContext.details.relevantOwnerActions[0]?.contractRef, ".spec/contracts/payment.yaml");
      assert.equal(result.globalContext.details.ownerReviewRecommendations.length, 4);
      assert.deepEqual(
        result.globalContext.details.ownerReviewRecommendations.map((entry) => entry.reason),
        [
          "source_evolution_blocking_open_items",
          "source_evolution_expired_exceptions",
          "cross_repo_contract_drift",
          "owner_action_ready",
        ],
      );
      assert.match(fs.readFileSync(result.compareReportMarkdownPath, "utf-8"), /## Global Closure Context/);
      assert.match(fs.readFileSync(result.compareReportMarkdownPath, "utf-8"), /Owner-review recommendations:/);
    } finally {
      removeFixtureRoot(root);
    }
  }));

  results.push(record("release compare stays a local artifact consumer when aggregate is missing", () => {
    const root = createFixtureRoot();
    try {
      writeReleaseFixture(root);
      const result = compareReleaseBaselines({
        root,
        from: "v1",
        to: "v2",
        comparedAt: "2026-05-04T02:00:00.000Z",
      });

      assert.equal(result.globalContext.status, "not_available_yet");
      assert.equal(result.globalContext.boundary.consumesMultiRepoAggregateArtifact, false);
      assert.equal(result.globalContext.details.relevantContractDriftHints.length, 0);
      assert.equal(result.globalContext.details.ownerReviewRecommendations.length, 0);
      assert.match(result.globalContext.summary, /local artifact consumer/i);
      assert.match(fs.readFileSync(result.compareReportMarkdownPath, "utf-8"), /Consumes aggregate artifact: no/);
    } finally {
      removeFixtureRoot(root);
    }
  }));

  results.push(record("CLI release compare exposes global context in JSON output", () => {
    const root = createFixtureRoot();
    try {
      writeReleaseFixture(root);
      writeAggregateFixture(root);
      const cli = runCli(["release", "compare", "--root", root, "--from", "v1", "--to", "v2", "--json"]);
      assert.equal(cli.status, 0, cli.stderr);
      const payload = JSON.parse(cli.stdout) as ReleaseCompareResult;
      assert.equal(payload.globalContext.status, "available");
      assert.equal(payload.globalContext.details.relevantContractDriftHints[0]?.contractRef, ".spec/contracts/payment.yaml");
      assert.equal(payload.globalContext.details.ownerReviewRecommendations[0]?.reason, "source_evolution_blocking_open_items");
    } finally {
      removeFixtureRoot(root);
    }
  }));

  results.push(record("verify report ingests latest release compare global context from declared artifacts", () => {
    const root = createFixtureRoot();
    try {
      writeReleaseFixture(root);
      writeAggregateFixture(root);
      compareReleaseBaselines({
        root,
        from: "v1",
        to: "v2",
        comparedAt: "2026-05-04T03:00:00.000Z",
      });

      const verifyResult = createVerifyRunResult(root, [], {
        generatedAt: "2026-05-04T03:10:00.000Z",
      });
      const report = buildVerifyReport(verifyResult, {
        repoRoot: root,
        provider: "local",
      });

      assert.equal(report.modes?.releaseCompareReportPath, ".spec/releases/compare/v1-to-v2/compare-report.json");
      assert.equal(report.modes?.releaseCompareOverallStatus, "changed");
      assert.equal(report.modes?.releaseCompareGlobalContextStatus, "available");
      assert.equal(report.modes?.releaseCompareAggregatePath, ".spec/console/multi-repo-governance.json");
      assert.equal(report.modes?.releaseCompareOwnerReviewRecommendationCount, 4);
      assert.equal(report.modes?.releaseCompareRelevantContractDriftHintCount, 2);
      assert.equal(report.modes?.releaseCompareRelevantOwnerActionCount, 1);
      assert.equal(report.modes?.releaseCompareRepresentativeArtifact, ".spec/contracts/payment.yaml");
      assert.equal(report.modes?.releaseCompareSourceEvolutionChangeId, "change-2");
      assert.equal(report.modes?.releaseCompareReplayCommand, "npm run jispec-cli -- release compare --from \"v1\" --to \"v2\"");
    } finally {
      removeFixtureRoot(root);
    }
  }));

  printResults(results);
}

function writeReleaseFixture(root: string): void {
  writeText(root, ".spec/contracts/payment.yaml", "contract: payment\n");
  writeText(root, ".spec/contracts/cart.yaml", "contract: cart\n");
  writeSourceEvolutionArtifact(root, "change-1", [
    {
      evolution_id: "evo-1",
      evolution_kind: "added",
      anchor_id: "REQ-PAYMENT-LEGACY",
    },
  ]);
  writeSourceReview(root, "change-1", [{ evolution_id: "evo-1", maps_to: ["REQ-PAYMENT-LEGACY"] }]);
  writeSourceEvolutionArtifact(root, "change-2", [
    {
      evolution_id: "evo-2",
      evolution_kind: "modified",
      anchor_id: "REQ-PAYMENT",
    },
    {
      evolution_id: "evo-3",
      evolution_kind: "deprecated",
      anchor_id: "REQ-PAYMENT-LEGACY",
      successor_ids: ["REQ-PAYMENT"],
    },
  ]);
  writeSourceReview(root, "change-2", [{ evolution_id: "evo-3", maps_to: ["REQ-PAYMENT"] }]);
  writeReleaseBaseline(root, "v1", {
    lifecycleRegistryVersion: 1,
    activeSnapshotId: "snapshot-payment-v1",
    lastAdoptedChangeId: "change-1",
    sourceEvolutionPath: ".spec/deltas/change-1/source-evolution.json",
    sourceReviewPath: ".spec/deltas/change-1/source-review.yaml",
    requirementIds: ["REQ-PAYMENT-LEGACY"],
    appliedDeltas: ["change-1"],
  });
  writeReleaseBaseline(root, "v2", {
    lifecycleRegistryVersion: 2,
    activeSnapshotId: "snapshot-payment-v2",
    lastAdoptedChangeId: "change-2",
    sourceEvolutionPath: ".spec/deltas/change-2/source-evolution.json",
    sourceReviewPath: ".spec/deltas/change-2/source-review.yaml",
    requirementIds: ["REQ-PAYMENT"],
    appliedDeltas: ["change-1", "change-2"],
  });
}

function writeReleaseBaseline(
  root: string,
  version: string,
  input: {
    lifecycleRegistryVersion: number;
    activeSnapshotId: string;
    lastAdoptedChangeId: string;
    sourceEvolutionPath: string;
    sourceReviewPath: string;
    requirementIds: string[];
    appliedDeltas: string[];
  },
): void {
  const baselinePath = path.join(root, ".spec", "baselines", "releases", `${version}.yaml`);
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(
    baselinePath,
    yaml.dump({
      release_version: version,
      frozen_at: "2026-05-04T00:00:00.000Z",
      requirement_ids: input.requirementIds,
      contexts: ["checkout"],
      contracts: ["CTR-PAYMENT"],
      scenarios: ["SCN-PAYMENT"],
      slices: [],
      assets: [],
      source_snapshot: {
        active_snapshot_id: input.activeSnapshotId,
        lifecycle_registry_path: ".spec/requirements/lifecycle.yaml",
        lifecycle_registry_version: input.lifecycleRegistryVersion,
        last_adopted_change_id: input.lastAdoptedChangeId,
      },
      requirement_lifecycle: {
        path: ".spec/requirements/lifecycle.yaml",
        registry_version: input.lifecycleRegistryVersion,
        active_snapshot_id: input.activeSnapshotId,
        last_adopted_change_id: input.lastAdoptedChangeId,
      },
      source_evolution: {
        source_evolution_path: input.sourceEvolutionPath,
        source_review_path: input.sourceReviewPath,
        last_adopted_change_id: input.lastAdoptedChangeId,
      },
      applied_deltas: input.appliedDeltas,
    }, { lineWidth: 100, noRefs: true, sortKeys: false }),
    "utf-8",
  );
}

function writeSourceEvolutionArtifact(root: string, changeId: string, items: Array<Record<string, unknown>>): void {
  writeText(root, `.spec/deltas/${changeId}/source-evolution.json`, `${JSON.stringify({ items }, null, 2)}\n`);
}

function writeSourceReview(
  root: string,
  changeId: string,
  items: Array<{ evolution_id: string; maps_to: string[] }>,
): void {
  writeText(root, `.spec/deltas/${changeId}/source-review.yaml`, yaml.dump({ items }, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  }));
}

function writeAggregateFixture(root: string): void {
  writeJson(root, ".spec/console/multi-repo-governance.json", {
    schemaVersion: 1,
    kind: "jispec-multi-repo-governance-aggregate",
    generatedAt: "2026-05-04T00:30:00.000Z",
    root: normalize(root),
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
      snapshotPaths: [normalize(path.join(root, ".spec", "console", "governance-snapshot.json"))],
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
      totalReleaseDriftComparisons: 3,
      contractDriftHintCount: 2,
      ownerActionCount: 1,
      latestAuditActors: ["release-owner"],
    },
    repoGroup: {
      status: "available",
      sourcePath: ".spec/console/repo-group.yaml",
      repos: [],
      warnings: [],
    },
    repos: [
      {
        repoId: "checkout-web",
        repoName: "Checkout Web",
        repoRoot: normalize(root),
        snapshotPath: normalize(path.join(root, ".spec", "console", "governance-snapshot.json")),
        exportedAt: "2026-05-04T00:00:00.000Z",
        sourceHash: "hash-checkout-web",
        verifyVerdict: "PASS",
        policyProfile: "small_team",
        policyOwner: "frontend-team",
        activeWaivers: 0,
        expiringSoonWaivers: [],
        expiredWaivers: [],
        unmatchedActiveWaivers: [],
        openSpecDebt: 0,
        bootstrapSpecDebt: 0,
        sourceEvolutionChangeId: "change-2",
        sourceEvolutionBlockingOpenItems: 2,
        sourceEvolutionExpiredExceptions: 1,
        sourceEvolutionRepresentativeArtifact: ".spec/contracts/payment.yaml",
        lastAdoptedSourceChange: "change-1",
        lifecycleDeltaCounts: { modified: 1, deprecated: 1 },
        releaseDriftStatus: "changed",
        releaseDriftTrendComparisons: 3,
        approvalWorkflowStatus: "not_available_yet",
        latestAuditActor: "release-owner",
        contractRefs: [{ ref: ".spec/contracts/payment.yaml", hash: "hash-checkout-web" }],
        risk: {
          score: 3,
          level: "medium",
          reasons: ["source evolution open items"],
        },
      },
    ],
    missingSnapshots: [],
    contractDriftHints: [
      {
        kind: "cross_repo_contract_drift",
        id: "hint:payments:.spec/contracts/payment.yaml->checkout-web",
        upstreamRepoId: "payments",
        downstreamRepoId: "checkout-web",
        contractRef: ".spec/contracts/payment.yaml",
        upstreamHash: "hash-upstream-payment",
        downstreamHash: "hash-checkout-web",
        severity: "owner_action",
        suggestedCommand: "npm run jispec-cli -- change --root .",
        ownerActionId: "owner-action:checkout-web:.spec/contracts/payment.yaml",
        evidence: {
          upstreamSnapshotPath: "/workspace/payments/.spec/console/governance-snapshot.json",
          downstreamSnapshotPath: normalize(path.join(root, ".spec", "console", "governance-snapshot.json")),
          downstreamRepoPath: normalize(root),
          downstreamSourceEvolutionChangeId: "change-2",
          downstreamReleaseDriftStatus: "changed",
        },
        blockingGateReplacement: false,
      },
      {
        kind: "cross_repo_contract_drift",
        id: "hint:cart:.spec/contracts/cart.yaml->checkout-web",
        upstreamRepoId: "cart",
        downstreamRepoId: "checkout-web",
        contractRef: ".spec/contracts/cart.yaml",
        upstreamHash: "hash-upstream-cart",
        downstreamHash: "hash-checkout-cart",
        severity: "owner_action",
        suggestedCommand: "npm run jispec-cli -- change --root . --contract cart",
        ownerActionId: "owner-action:checkout-web:.spec/contracts/cart.yaml",
        evidence: {
          upstreamSnapshotPath: "/workspace/cart/.spec/console/governance-snapshot.json",
          downstreamSnapshotPath: normalize(path.join(root, ".spec", "console", "governance-snapshot.json")),
          downstreamRepoPath: normalize(root),
          downstreamSourceEvolutionChangeId: "change-2",
          downstreamReleaseDriftStatus: "changed",
        },
        blockingGateReplacement: false,
      },
    ],
    ownerActions: [
      {
        id: "owner-action:checkout-web:.spec/contracts/payment.yaml",
        kind: "cross_repo_contract_drift_owner_action",
        status: "ready",
        repoId: "checkout-web",
        repoName: "Checkout Web",
        owner: "frontend-team",
        repoPath: normalize(root),
        upstreamRepoId: "payments",
        downstreamRepoId: "checkout-web",
        contractRef: ".spec/contracts/payment.yaml",
        message: "Refresh downstream payment contract",
        summary: "Refresh payment contract after upstream drift",
        risk: "medium",
        primaryCommand: {
          kind: "change",
          command: "npm run jispec-cli -- change --root .",
          rationale: "Record downstream contract refresh",
          writesLocalArtifacts: [".jispec/change-session.json"],
        },
        followupCommands: [
          {
            kind: "export_governance",
            command: "npm run jispec-cli -- console export-governance --root .",
            rationale: "Refresh aggregate evidence",
            writesLocalArtifacts: [".spec/console/governance-snapshot.json"],
          },
        ],
        sourceArtifacts: [".spec/deltas/change-2/source-evolution.json"],
        affectedContracts: [".spec/contracts/payment.yaml"],
        relatedHintId: "hint:payments:.spec/contracts/payment.yaml->checkout-web",
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
      releaseDrift: [{ repoId: "checkout-web", repoName: "Checkout Web", status: "changed", comparisons: 3 }],
      verify: [],
    },
  });
}

function createFixtureRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p13-release-global-context-"));
}

function removeFixtureRoot(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
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

function normalize(filePath: string): string {
  return filePath.replace(/\\/g, "/");
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
