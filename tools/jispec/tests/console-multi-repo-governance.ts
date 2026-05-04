import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  aggregateMultiRepoGovernance,
  renderMultiRepoGovernanceAggregateText,
} from "../console/multi-repo";
import type { MultiRepoGovernanceSnapshot } from "../console/governance-export";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Console Multi-Repo Governance Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("aggregate consumes explicit exported snapshots and writes local JSON plus Markdown", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-multi-repo-explicit-"));
    try {
      const alphaPath = writeSnapshot(root, "alpha", snapshot({
        id: "alpha",
        name: "Alpha",
        verifyVerdict: "PASS",
        activeWaivers: 1,
        expiringSoonWaivers: ["waiver-alpha"],
        openSpecDebt: 0,
        releaseDriftStatus: "unchanged",
      }));
      const betaPath = writeSnapshot(root, "beta", snapshot({
        id: "beta",
        name: "Beta",
        verifyVerdict: "FAIL_BLOCKING",
        activeWaivers: 2,
        unmatchedActiveWaivers: ["waiver-beta-stale"],
        openSpecDebt: 3,
        bootstrapSpecDebt: 1,
        releaseDriftStatus: "changed",
        releaseDriftTrendComparisons: 4,
        latestAuditActor: "reviewer",
      }));

      const result = aggregateMultiRepoGovernance({
        root,
        snapshotPaths: [alphaPath, betaPath],
        generatedAt: "2026-05-01T00:00:00.000Z",
      });

      assert.ok(fs.existsSync(result.aggregatePath));
      assert.ok(fs.existsSync(result.summaryPath));
      assert.equal(result.aggregate.boundary.consumesExportedSnapshotsOnly, true);
      assert.equal(result.aggregate.boundary.scansSourceCode, false);
      assert.equal(result.aggregate.boundary.runsVerify, false);
      assert.equal(result.aggregate.summary.repoCount, 2);
      assert.equal(result.aggregate.summary.missingSnapshotCount, 0);
      assert.equal(result.aggregate.summary.totalExpiringSoonWaivers, 1);
      assert.equal(result.aggregate.summary.totalOpenSpecDebt, 3);
      assert.equal(result.aggregate.summary.releaseDriftHotspotCount, 1);
      assert.equal(result.aggregate.hotspots.highestRiskRepos[0]?.repoId, "beta");
      assert.equal(result.aggregate.hotspots.expiringSoonWaivers[0]?.waiverId, "waiver-alpha");
      assert.equal(result.aggregate.hotspots.specDebt[0]?.openSpecDebt, 3);
      assert.deepEqual(result.aggregate.missingSnapshots, []);
      assert.match(renderMultiRepoGovernanceAggregateText(result.aggregate), /Consumes exported `\.spec\/console\/governance-snapshot\.json` files only/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("aggregate preserves missing explicit snapshots as reviewable inputs", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-multi-repo-missing-"));
    try {
      const alphaPath = writeSnapshot(root, "alpha", snapshot({
        id: "alpha",
        name: "Alpha",
        verifyVerdict: "PASS",
        activeWaivers: 0,
        openSpecDebt: 0,
        releaseDriftStatus: "unchanged",
      }));
      const missingPath = path.join(root, "missing-repo", ".spec", "console", "governance-snapshot.json");

      const result = aggregateMultiRepoGovernance({
        root,
        snapshotPaths: [alphaPath, missingPath],
        generatedAt: "2026-05-01T00:00:00.000Z",
      });
      const text = renderMultiRepoGovernanceAggregateText(result.aggregate);

      assert.equal(result.aggregate.inputs.loadedSnapshots, 1);
      assert.equal(result.aggregate.summary.repoCount, 1);
      assert.equal(result.aggregate.summary.missingSnapshotCount, 1);
      assert.equal(result.aggregate.missingSnapshots[0]?.inputPath, missingPath.replace(/\\/g, "/"));
      assert.equal(result.aggregate.missingSnapshots[0]?.reason, "snapshot_not_found");
      assert.match(text, /Missing Snapshots/);
      assert.match(text, /missing-repo/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("exported snapshot declares stable multi-repo contract compatibility", () => {
    const value = snapshot({
      id: "contracted",
      name: "Contracted",
      verifyVerdict: "PASS",
      activeWaivers: 0,
      openSpecDebt: 0,
      releaseDriftStatus: "unchanged",
    });

    assert.equal(value.contract?.snapshotContractVersion, 1);
    assert.equal(value.contract?.compatibleAggregateVersion, 1);
    assert.deepEqual(value.contract?.missingSemantics, {
      unavailableValue: "not_available_yet",
      missingSnapshotReason: "snapshot_not_found",
    });
  }));

  results.push(record("aggregate discovers snapshots from a local directory without source artifacts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-multi-repo-dir-"));
    try {
      writeSnapshot(root, "repo-one", snapshot({
        id: "repo-one",
        name: "Repo One",
        verifyVerdict: "WARN_ADVISORY",
        activeWaivers: 0,
        openSpecDebt: 0,
        releaseDriftStatus: "unchanged",
      }));
      writeSnapshot(root, "repo-two", snapshot({
        id: "repo-two",
        name: "Repo Two",
        verifyVerdict: "PASS",
        activeWaivers: 0,
        openSpecDebt: 2,
        releaseDriftStatus: "not_available_yet",
      }));
      writeText(root, "repo-two/src/should-not-be-read.ts", "throw new Error('source');\n");

      const result = aggregateMultiRepoGovernance({ root, directoryPaths: [root] });

      assert.equal(result.aggregate.inputs.loadedSnapshots, 2);
      assert.equal(result.aggregate.summary.verifyVerdicts.WARN_ADVISORY, 1);
      assert.equal(result.aggregate.summary.totalOpenSpecDebt, 2);
      assert.equal(result.aggregate.hotspots.verify[0]?.repoId, "repo-one");
      assert.equal(result.aggregate.hotspots.specDebt[0]?.repoId, "repo-two");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("CLI aggregate-governance emits JSON and preserves single-repo verify authority", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-multi-repo-cli-"));
    try {
      const alphaPath = writeSnapshot(root, "alpha", snapshot({
        id: "alpha",
        name: "Alpha",
        verifyVerdict: "FAIL_BLOCKING",
        activeWaivers: 0,
        openSpecDebt: 1,
        releaseDriftStatus: "changed",
      }));
      const cli = runCli(["console", "aggregate-governance", "--root", root, "--snapshot", alphaPath, "--json"]);
      assert.equal(cli.status, 0, cli.stderr);
      const payload = JSON.parse(cli.stdout) as ReturnType<typeof aggregateMultiRepoGovernance>;

      assert.equal(payload.aggregate.boundary.replacesCliGate, false);
      assert.equal(payload.aggregate.boundary.runsVerify, false);
      assert.equal(payload.aggregate.hotspots.verify[0]?.verdict, "FAIL_BLOCKING");
      assert.ok(fs.existsSync(payload.aggregatePath));
      assert.ok(fs.existsSync(payload.summaryPath));
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

function snapshot(input: {
  id: string;
  name: string;
  verifyVerdict: string;
  activeWaivers: number;
  expiringSoonWaivers?: string[];
  expiredWaivers?: string[];
  unmatchedActiveWaivers?: string[];
  openSpecDebt: number;
  bootstrapSpecDebt?: number;
  releaseDriftStatus: string;
  releaseDriftTrendComparisons?: number;
  approvalWorkflowStatus?: string;
  latestAuditActor?: string;
}): MultiRepoGovernanceSnapshot {
  return {
    schemaVersion: 1,
    kind: "jispec-multi-repo-governance-snapshot",
    exportedAt: "2026-05-01T00:00:00.000Z",
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
      createdAt: "2026-05-01T00:00:00.000Z",
      artifactSummary: { totalArtifacts: 5 },
      governanceSummary: { totalObjects: 10 },
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
      verifyVerdict: input.verifyVerdict,
      policyProfile: "small_team",
      policyOwner: "platform",
      activeWaivers: input.activeWaivers,
      expiringSoonWaivers: input.expiringSoonWaivers ?? [],
      expiredWaivers: input.expiredWaivers ?? [],
      unmatchedActiveWaivers: input.unmatchedActiveWaivers ?? [],
      openSpecDebt: input.openSpecDebt,
      bootstrapSpecDebt: input.bootstrapSpecDebt ?? 0,
      sourceEvolutionChangeId: "not_available_yet",
      sourceEvolutionBlockingOpenItems: "not_available_yet",
      sourceEvolutionExpiredExceptions: 0,
      sourceEvolutionRepresentativeArtifact: "not_available_yet",
      lastAdoptedSourceChange: "not_available_yet",
      lifecycleDeltaCounts: {},
      releaseDriftStatus: input.releaseDriftStatus,
      releaseDriftTrendComparisons: input.releaseDriftTrendComparisons ?? 0,
      approvalWorkflowStatus: input.approvalWorkflowStatus ?? "not_available_yet",
      latestAuditActor: input.latestAuditActor ?? "not_available_yet",
    },
    governanceObjects: [],
  };
}

function writeSnapshot(root: string, repoId: string, value: MultiRepoGovernanceSnapshot): string {
  const relativePath = `${repoId}/.spec/console/governance-snapshot.json`;
  writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
  return path.join(root, relativePath);
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
