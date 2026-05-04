import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import type { MultiRepoGovernanceSnapshot } from "../console/governance-export";
import { buildCrossRepoDriftActions } from "../console/governance-actions";
import { buildCrossRepoDriftDashboardSummary } from "../console/governance-dashboard";
import {
  aggregateMultiRepoGovernance,
  renderMultiRepoGovernanceAggregateText,
} from "../console/multi-repo";
import { TEST_SUITES } from "./regression-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== P12 Multi-Repo Owner Loop Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("aggregate links drift hints to source-refresh owner actions when downstream already has an active source change", () => {
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
        name: "Billing API",
        contractRefs: [{ ref: "contracts/payment.yaml", hash: "hash-api-v2" }],
      }));
      const webPath = writeSnapshot(root, "repos/web", snapshot({
        id: "web",
        name: "Checkout Web",
        sourceEvolutionChangeId: "chg-web-42",
        sourceEvolutionRepresentativeArtifact: ".spec/contracts/payment.yaml",
        contractRefs: [{ ref: "contracts/payment.yaml", hash: "hash-api-v1" }],
      }));

      const result = aggregateMultiRepoGovernance({
        root,
        snapshotPaths: [apiPath, webPath],
        generatedAt: "2026-05-04T00:00:00.000Z",
      });
      const hint = result.aggregate.contractDriftHints[0];
      const ownerAction = result.aggregate.ownerActions[0];
      const text = renderMultiRepoGovernanceAggregateText(result.aggregate);

      assert.equal(result.aggregate.contractDriftHints.length, 1);
      assert.equal(result.aggregate.ownerActions.length, 1);
      assert.equal(hint.ownerActionId, ownerAction.id);
      assert.equal(ownerAction.relatedHintId, hint.id);
      assert.equal(ownerAction.repoId, "web");
      assert.equal(ownerAction.repoName, "Checkout Web");
      assert.equal(ownerAction.owner, "frontend-team");
      assert.equal(ownerAction.status, "ready");
      assert.equal(ownerAction.primaryCommand.kind, "source_refresh");
      assert.match(ownerAction.primaryCommand.command, /source refresh --root repos\/web --change chg-web-42/);
      assert.equal(ownerAction.followupCommands[0]?.kind, "export_governance");
      assert.match(ownerAction.followupCommands[0]?.command ?? "", /console export-governance --root repos\/web --repo-id web --repo-name "Checkout Web"/);
      assert.equal(ownerAction.suggestedCommand, ownerAction.primaryCommand.command);
      assert.ok(ownerAction.sourceArtifacts.includes(".spec/console/repo-group.yaml"));
      assert.ok(ownerAction.sourceArtifacts.includes(hint.evidence.upstreamSnapshotPath));
      assert.ok(ownerAction.sourceArtifacts.includes(hint.evidence.downstreamSnapshotPath));
      assert.equal(hint.evidence.downstreamRepoPath, `${root.replace(/\\/g, "/")}/repos/web`);
      assert.equal(hint.evidence.downstreamSourceEvolutionChangeId, "chg-web-42");
      assert.deepEqual(ownerAction.affectedContracts, ["api:contracts/payment.yaml", "web:contracts/payment.yaml"]);
      assert.match(text, /## Owner Actions/);
      assert.match(text, /source_refresh/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("owner loop chooses release compare when downstream has release drift but no active source change", () => {
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
          {
            id: "web",
            role: "downstream",
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
        releaseDriftStatus: "changed",
        releaseDriftTrendComparisons: 3,
        contractRefs: [{ ref: "contracts/payment.yaml", hash: "hash-api-v1" }],
      }));

      const result = aggregateMultiRepoGovernance({ root, snapshotPaths: [apiPath, webPath] });
      const ownerAction = result.aggregate.ownerActions[0];

      assert.equal(ownerAction.primaryCommand.kind, "release_compare");
      assert.equal(ownerAction.status, "needs_input");
      assert.match(ownerAction.primaryCommand.command, /release compare --root repos\/web --from <ref> --to <ref>/);
      assert.equal(ownerAction.suggestedCommand, ownerAction.primaryCommand.command);
      assert.equal(ownerAction.followupCommands[0]?.kind, "export_governance");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("owner loop falls back to opening a downstream local change when no stronger downstream posture exists", () => {
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
          {
            id: "web",
            role: "downstream",
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

      const result = aggregateMultiRepoGovernance({ root, snapshotPaths: [apiPath, webPath] });
      const ownerAction = result.aggregate.ownerActions[0];

      assert.equal(ownerAction.primaryCommand.kind, "change");
      assert.equal(ownerAction.status, "ready");
      assert.match(
        ownerAction.primaryCommand.command,
        /npm run jispec-cli -- change "Reconcile contracts\/payment\.yaml from api" --root repos\/web --mode prompt/,
      );
      assert.ok(ownerAction.primaryCommand.writesLocalArtifacts.includes(".spec/deltas/<change-id>/impact-graph.json"));
      assert.ok(ownerAction.primaryCommand.writesLocalArtifacts.includes(".spec/deltas/<change-id>/verify-focus.yaml"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("missing repo snapshots stay explicit and never become synthetic owner-action gate state", () => {
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
          {
            id: "web",
            role: "downstream",
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

      const result = aggregateMultiRepoGovernance({
        root,
        snapshotPaths: [apiPath],
        generatedAt: "2026-05-04T00:00:00.000Z",
      });
      const text = renderMultiRepoGovernanceAggregateText(result.aggregate);

      assert.equal(result.aggregate.summary.missingSnapshotCount, 1);
      assert.equal(result.aggregate.repoGroup.repos.find((repo) => repo.id === "web")?.snapshotStatus, "not_available_yet");
      assert.equal(result.aggregate.contractDriftHints.length, 0);
      assert.equal(result.aggregate.ownerActions.length, 0);
      assert.equal(result.aggregate.singleRepoGateReplacement, false);
      assert.match(text, /## Missing Snapshots/);
      assert.match(text, /snapshot_not_found/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("governance action and dashboard surfaces reuse the richer owner-action loop without replacing repo gates", () => {
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
        name: "Billing API",
        contractRefs: [{ ref: "contracts/payment.yaml", hash: "hash-api-v2" }],
      }));
      const webPath = writeSnapshot(root, "repos/web", snapshot({
        id: "web",
        name: "Checkout Web",
        sourceEvolutionChangeId: "chg-web-42",
        contractRefs: [{ ref: "contracts/payment.yaml", hash: "hash-api-v1" }],
      }));

      const result = aggregateMultiRepoGovernance({ root, snapshotPaths: [apiPath, webPath] });
      const ownerAction = result.aggregate.ownerActions[0];
      const actions = buildCrossRepoDriftActions(result.aggregate);
      const dashboard = buildCrossRepoDriftDashboardSummary(result.aggregate);

      assert.equal(actions.length, 1);
      assert.equal(actions[0].recommendedCommand, ownerAction.suggestedCommand);
      assert.deepEqual(actions[0].commandWrites, ownerAction.primaryCommand.writesLocalArtifacts);
      assert.equal(actions[0].replacesCliGate, false);
      assert.ok(actions[0].decisionPacket.reviewerInstructions.some((instruction) => instruction.includes("re-export governance")));
      assert.equal(dashboard.status, "attention");
      assert.equal(dashboard.nextActions[0], ownerAction.suggestedCommand);
      assert.match(dashboard.evidence[0] ?? "", /api -> web: contracts\/payment\.yaml/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("P12-T2 suite is registered in runtime-extended", () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "p12-multi-repo-owner-loop.ts");
    assert.ok(suite);
    assert.equal(suite.area, "runtime-extended");
    assert.equal(suite.expectedTests, 6);
    assert.equal(suite.task, "P12-T2");
  }));

  printResults(results);
}

function createFixtureRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p12-owner-loop-"));
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
  sourceEvolutionChangeId?: string;
  sourceEvolutionRepresentativeArtifact?: string;
  releaseDriftStatus?: string;
  releaseDriftTrendComparisons?: number;
  contractRefs: Array<{ ref: string; hash: string }>;
}): MultiRepoGovernanceSnapshot {
  return {
    schemaVersion: 1,
    kind: "jispec-multi-repo-governance-snapshot",
    exportedAt: "2026-05-04T00:00:00.000Z",
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
      createdAt: "2026-05-04T00:00:00.000Z",
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
      sourceEvolutionRepresentativeArtifact: input.sourceEvolutionRepresentativeArtifact ?? "not_available_yet",
      lastAdoptedSourceChange: "not_available_yet",
      lifecycleDeltaCounts: {},
      releaseDriftStatus: input.releaseDriftStatus ?? "unchanged",
      releaseDriftTrendComparisons: input.releaseDriftTrendComparisons ?? 0,
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
