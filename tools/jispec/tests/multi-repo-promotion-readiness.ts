import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import type { MultiRepoGovernanceSnapshot } from "../console/governance-export";
import {
  aggregateMultiRepoGovernance,
  renderMultiRepoGovernanceAggregateText,
} from "../console/multi-repo";
import { Doctor } from "../doctor";
import { TEST_SUITES } from "./regression-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Multi-Repo Promotion Readiness Tests ===\n");

  const results: TestResult[] = [];

  results.push(await record("aggregate emits a ready phase-2 promotion contract for explicit repo groups", async () => {
    withFixture((root) => {
      const result = writeReadyAggregate(root);
      const readiness = result.aggregate.promotionReadiness;
      const text = renderMultiRepoGovernanceAggregateText(result.aggregate);

      assert.equal(readiness.phase, "north-star-score-optimization-phase-2");
      assert.equal(readiness.ready, true);
      assert.equal(readiness.target, "multi-repo-promotion");
      assert.deepEqual(
        readiness.requiredNorthStarScenarios,
        ["multi_repo_owner_action", "release_compare_global_context", "doctor_global_health"],
      );
      assert.deepEqual(readiness.checklist.map((item) => item.status), ["pass", "pass", "pass", "pass", "pass"]);
      assert.equal(readiness.blockers.length, 0);
      assert.ok(readiness.scoreImpact.evidence.some((entry) => entry.includes("1 cross-repo drift hint")));
      assert.match(text, /## Promotion Readiness/);
      assert.match(text, /repo_group_configured: pass/);
      assert.match(text, /owner_action_lifecycle: pass/);
    });
  }));

  results.push(await record("aggregate reports promotion blockers when repo group topology is not explicit", async () => {
    withFixture((root) => {
      const snapshotPath = writeSnapshot(root, "repos/web", snapshot({
        id: "web",
        name: "Checkout Web",
        sourceEvolutionChangeId: "chg-web-42",
        contractRefs: [{ ref: "contracts/payment.yaml", hash: "hash-web-v1" }],
      }));

      const result = aggregateMultiRepoGovernance({
        root,
        snapshotPaths: [snapshotPath],
        generatedAt: "2026-05-21T00:00:00.000Z",
      });
      const readiness = result.aggregate.promotionReadiness;

      assert.equal(readiness.ready, false);
      assert.ok(readiness.blockers.includes("repo_group_config_missing"));
      assert.ok(readiness.blockers.includes("repo_group_requires_at_least_two_repos"));
      assert.ok(readiness.checklist.some((item) => item.id === "repo_group_configured" && item.status === "fail"));
      assert.equal(result.aggregate.contractDriftHints.length, 1);
      assert.equal(result.aggregate.ownerActions.length, 1);
    });
  }));

  results.push(await record("doctor global reads phase-2 promotion readiness from the aggregate contract", async () => {
    await withFixtureAsync(async (root) => {
      writeReadyAggregate(root);
      const report = await new Doctor(root).checkGlobalReadiness();
      const check = requiredCheck(report, "Multi-Repo Aggregate Contract Readiness");

      assert.equal(check.status, "pass");
      assert.ok(check.details.some((detail) => detail.includes("Promotion phase: north-star-score-optimization-phase-2")));
      assert.ok(check.details.some((detail) => detail.includes("Promotion ready: yes")));
    });
  }));

  results.push(await record("doctor global blocks legacy aggregates without phase-2 promotion readiness", async () => {
    await withFixtureAsync(async (root) => {
      writeLegacyAggregate(root);
      const report = await new Doctor(root).checkGlobalReadiness();
      const check = requiredCheck(report, "Multi-Repo Aggregate Contract Readiness");

      assert.equal(check.status, "fail");
      assert.match(check.summary, /promotion readiness/i);
      assert.match(check.ownerAction ?? "", /explicit repo group/i);
      assert.match(check.nextCommand ?? "", /console aggregate-governance/);
    });
  }));

  results.push(await record("phase-2 promotion suite is registered in runtime-extended", async () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "multi-repo-promotion-readiness.ts");
    assert.ok(suite);
    assert.equal(suite.area, "runtime-extended");
    assert.equal(suite.expectedTests, 5);
    assert.equal(suite.task, "North-Star-Score-Phase-2");
  }));

  printResults(results);
}

function writeReadyAggregate(root: string): ReturnType<typeof aggregateMultiRepoGovernance> {
  writeRepoGroup(root, {
    repos: [
      {
        id: "api",
        role: "upstream",
        repoName: "Billing API",
        owner: "contracts-team",
        path: "repos/api",
        upstreamContractRefs: [],
        downstreamContractRefs: ["web:contracts/payment.yaml"],
      },
      {
        id: "web",
        role: "downstream",
        repoName: "Checkout Web",
        owner: "frontend-team",
        path: "repos/web",
        upstreamContractRefs: ["api:contracts/payment.yaml"],
        downstreamContractRefs: [],
      },
    ],
  });
  const apiPath = writeSnapshot(root, "repos/api", snapshot({
    id: "api",
    name: "Billing API",
    contractRefs: [{ ref: "contracts/payment.yaml", hash: "hash-api-v2" }],
  }));
  const webPath = writeSnapshot(root, "repos/web", snapshot({
    id: "web",
    name: "Checkout Web",
    sourceEvolutionChangeId: "chg-web-42",
    contractRefs: [{ ref: "contracts/payment.yaml", hash: "hash-api-v1" }],
  }));

  return aggregateMultiRepoGovernance({
    root,
    snapshotPaths: [apiPath, webPath],
    generatedAt: "2026-05-21T00:00:00.000Z",
  });
}

function writeLegacyAggregate(root: string): void {
  writeJson(root, ".spec/console/multi-repo-governance.json", {
    schemaVersion: 1,
    kind: "jispec-multi-repo-governance-aggregate",
    generatedAt: "2026-05-21T00:00:00.000Z",
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
      snapshotPaths: [],
      directoryPaths: [],
      loadedSnapshots: 0,
      missingSnapshots: 0,
    },
    summary: {
      repoCount: 0,
      missingSnapshotCount: 0,
      verifyVerdicts: {},
      policyProfiles: {},
      totalActiveWaivers: 0,
      totalExpiringSoonWaivers: 0,
      totalExpiredWaivers: 0,
      totalUnmatchedActiveWaivers: 0,
      totalOpenSpecDebt: 0,
      totalBootstrapSpecDebt: 0,
      releaseDriftHotspotCount: 0,
      totalReleaseDriftComparisons: 0,
      contractDriftHintCount: 0,
      ownerActionCount: 0,
      latestAuditActors: [],
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
}

function requiredCheck(report: Awaited<ReturnType<Doctor["checkGlobalReadiness"]>>, name: string) {
  const check = report.checks.find((entry) => entry.name === name);
  assert.ok(check, `Missing check ${name}`);
  return check;
}

function writeRepoGroup(root: string, value: unknown): void {
  writeText(root, ".spec/console/repo-group.yaml", yaml.dump(value));
}

function writeSnapshot(root: string, relativeDir: string, value: MultiRepoGovernanceSnapshot): string {
  const target = path.join(root, relativeDir, ".spec", "console", "governance-snapshot.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  return target;
}

function snapshot(input: {
  id: string;
  name: string;
  sourceEvolutionChangeId?: string;
  contractRefs: Array<{ ref: string; hash: string }>;
}): MultiRepoGovernanceSnapshot {
  return {
    schemaVersion: 1,
    kind: "jispec-multi-repo-governance-snapshot",
    exportedAt: "2026-05-21T00:00:00.000Z",
    repo: {
      id: input.id,
      name: input.name,
      root: `/workspace/${input.id}`,
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
      createdAt: "2026-05-21T00:00:00.000Z",
      artifactSummary: { totalArtifacts: 1 },
      governanceSummary: { totalObjects: 1 },
      hash: `hash-${input.id}`,
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
      sourceEvolutionChangeId: input.sourceEvolutionChangeId ?? "not_available_yet",
      sourceEvolutionBlockingOpenItems: 0,
      sourceEvolutionExpiredExceptions: 0,
      sourceEvolutionRepresentativeArtifact: "contracts/payment.yaml",
      lastAdoptedSourceChange: "not_available_yet",
      lifecycleDeltaCounts: {},
      releaseDriftStatus: "unchanged",
      releaseDriftTrendComparisons: 0,
      approvalWorkflowStatus: "not_available_yet",
      latestAuditActor: "reviewer",
      contractRefs: input.contractRefs,
    },
    governanceObjects: [],
  };
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
}

function withFixture(run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-phase2-multi-repo-"));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function withFixtureAsync(run: (root: string) => Promise<void>): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-phase2-multi-repo-"));
  try {
    await run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function record(name: string, fn: () => void | Promise<void>): Promise<TestResult> {
  try {
    await fn();
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
