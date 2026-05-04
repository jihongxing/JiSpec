import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { loadRepoGroupConfig } from "../console/repo-group";
import {
  aggregateMultiRepoGovernance,
  renderMultiRepoGovernanceAggregateText,
} from "../console/multi-repo";
import {
  buildCrossRepoDriftActions,
} from "../console/governance-actions";
import { buildCrossRepoDriftDashboardSummary } from "../console/governance-dashboard";
import { TEST_SUITES } from "./regression-runner";
import type { MultiRepoGovernanceSnapshot } from "../console/governance-export";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== P9 Multi-Repo Contract Drift Hints Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("repo group config declares repo id, role, upstream refs, and downstream refs", () => {
    const root = createFixtureRoot();
    try {
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

      const config = loadRepoGroupConfig(root);
      assert.equal(config.status, "available");
      assert.equal(config.repos.length, 2);
      assert.equal(config.repos[0].repoName, "Billing API");
      assert.equal(config.repos[0].owner, "contracts-team");
      assert.equal(config.repos[1].upstreamContractRefs[0], "api:contracts/payment.yaml");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("missing repo group config returns not_available_yet", () => {
    const root = createFixtureRoot();
    try {
      const config = loadRepoGroupConfig(root);
      assert.equal(config.status, "not_available_yet");
      assert.deepEqual(config.repos, []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("repo group repository with no exported snapshot is not_available_yet", () => {
    const root = createFixtureRoot();
    try {
      writeRepoGroup(root, {
        repos: [
          {
            id: "api",
            role: "upstream",
            path: "repos/api",
            upstreamContractRefs: [],
            downstreamContractRefs: ["web:contracts/payment.yaml"],
          },
        ],
      });

      const result = aggregateMultiRepoGovernance({
        root,
        generatedAt: "2026-05-02T00:00:00.000Z",
      });

      assert.equal(result.aggregate.repoGroup.status, "available");
      assert.equal(result.aggregate.repoGroup.repos[0].snapshotStatus, "not_available_yet");
      assert.equal(result.aggregate.summary.missingSnapshotCount, 1);
      assert.match(renderMultiRepoGovernanceAggregateText(result.aggregate), /not_available_yet/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("cross-repo contract drift produces linked owner action packets and repo-local commands only", () => {
    const root = createFixtureRoot();
    try {
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
        name: "API",
        contractRefs: [{ ref: "contracts/payment.yaml", hash: "hash-api-v2" }],
      }));
      const webPath = writeSnapshot(root, "repos/web", snapshot({
        id: "web",
        name: "Web",
        contractRefs: [{ ref: "contracts/payment.yaml", hash: "hash-api-v1" }],
      }));

      const result = aggregateMultiRepoGovernance({
        root,
        snapshotPaths: [apiPath, webPath],
        generatedAt: "2026-05-02T00:00:00.000Z",
      });

      assert.equal(result.aggregate.contractDriftHints.length, 1);
      assert.equal(result.aggregate.ownerActions.length, 1);
      assert.equal(result.aggregate.summary.ownerActionCount, 1);
      assert.equal(result.aggregate.contractDriftHints[0].severity, "owner_action");
      assert.match(
        result.aggregate.contractDriftHints[0].suggestedCommand,
        /npm run jispec-cli -- change "Reconcile contracts\/payment\.yaml from api" --root repos\/web --mode prompt/,
      );
      assert.equal(result.aggregate.contractDriftHints[0].ownerActionId, result.aggregate.ownerActions[0].id);
      assert.equal(result.aggregate.contractDriftHints[0].blockingGateReplacement, false);
      assert.equal(result.aggregate.ownerActions[0].repoName, "Checkout Web");
      assert.equal(result.aggregate.ownerActions[0].owner, "frontend-team");
      assert.equal(result.aggregate.ownerActions[0].primaryCommand.kind, "change");
      assert.match(result.aggregate.ownerActions[0].primaryCommand.command, /npm run jispec-cli -- change/);
      assert.equal(result.aggregate.ownerActions[0].followupCommands[0]?.kind, "export_governance");
      assert.match(result.aggregate.ownerActions[0].followupCommands[0]?.command ?? "", /console export-governance/);
      assert.equal(result.aggregate.singleRepoGateReplacement, false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("governance actions expose cross-repo drift without changing single-repo gates", () => {
    const root = createFixtureRoot();
    try {
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
        name: "API",
        contractRefs: [{ ref: "contracts/payment.yaml", hash: "hash-api-v2" }],
      }));
      const webPath = writeSnapshot(root, "repos/web", snapshot({
        id: "web",
        name: "Web",
        contractRefs: [{ ref: "contracts/payment.yaml", hash: "hash-api-v1" }],
      }));
      const result = aggregateMultiRepoGovernance({
        root,
        snapshotPaths: [apiPath, webPath],
        generatedAt: "2026-05-02T00:00:00.000Z",
      });

      const actions = buildCrossRepoDriftActions(result.aggregate);
      const dashboardSummary = buildCrossRepoDriftDashboardSummary(result.aggregate);
      assert.equal(actions.length, 1);
      assert.equal(actions[0].kind, "review_cross_repo_contract_drift");
      assert.equal(actions[0].replacesCliGate, false);
      assert.match(actions[0].recommendedCommand, /npm run jispec-cli -- change/);
      assert.ok(actions[0].decisionPacket.reviewerInstructions.some((instruction) => instruction.includes("re-export governance")));
      assert.ok(actions[0].commandWrites.includes(".jispec/change-session.json"));
      assert.equal(dashboardSummary.status, "attention");
      assert.match(dashboardSummary.answer, /cross-repo contract drift/);
      assert.equal(dashboardSummary.nextActions[0], actions[0].recommendedCommand);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("P9-T5 suite is registered in runtime-extended", () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "p9-multi-repo-contract-drift-hints.ts");
    assert.ok(suite);
    assert.equal(suite.area, "runtime-extended");
    assert.equal(suite.expectedTests, 6);
    assert.equal(suite.task, "P9-T5");
  }));

  printResults(results);
}

function createFixtureRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-multi-repo-"));
}

function writeRepoGroup(root: string, value: unknown): void {
  const dir = path.join(root, ".spec", "console");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "repo-group.yaml"), yaml.dump(value), "utf-8");
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
  contractRefs: Array<{ ref: string; hash: string }>;
}): MultiRepoGovernanceSnapshot {
  return {
    schemaVersion: 1,
    kind: "jispec-multi-repo-governance-snapshot",
    exportedAt: "2026-05-02T00:00:00.000Z",
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
      createdAt: "2026-05-02T00:00:00.000Z",
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
      sourceEvolutionChangeId: "not_available_yet",
      sourceEvolutionBlockingOpenItems: "not_available_yet",
      sourceEvolutionExpiredExceptions: 0,
      sourceEvolutionRepresentativeArtifact: "not_available_yet",
      lastAdoptedSourceChange: "not_available_yet",
      lifecycleDeltaCounts: {},
      releaseDriftStatus: "unchanged",
      releaseDriftTrendComparisons: 0,
      approvalWorkflowStatus: "not_available_yet",
      latestAuditActor: "not_available_yet",
      contractRefs: input.contractRefs,
    },
    governanceObjects: [],
  };
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

main();
