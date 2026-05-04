import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportConsoleGovernanceSnapshot, renderConsoleGovernanceExportText } from "../console/governance-export";
import { collectConsoleLocalSnapshot } from "../console/read-model-snapshot";

async function main(): Promise<void> {
  console.log("=== Console Governance Export Tests ===\n");

  let passed = 0;
  let failed = 0;

  function record(name: string, fn: () => void): void {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`✗ ${name}`);
      console.log(`  Error: ${message}`);
      failed++;
    }
  }

  record("export-governance writes a stable local snapshot and summary", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-export-"));
    try {
      writeJson(root, ".spec/policy.yaml", { version: 1, rules: [] });
      writeJson(root, ".jispec-ci/verify-report.json", { verdict: "PASS", issueCount: 0, blockingIssueCount: 0, modes: {} });
      writeJson(root, ".spec/releases/compare/v1-to-v2/compare-report.json", { driftSummary: { overallStatus: "changed" } });
      writeJson(root, ".spec/north-star/acceptance.json", {
        kind: "jispec-north-star-acceptance",
        summary: { ready: true, scenarioCount: 9, passedScenarioCount: 9, blockingScenarioCount: 0 },
        contract: { version: 1 },
        boundary: { localOnly: true, sourceUploadRequired: false, deterministicLocalArtifactsOnly: true },
      });
      writeText(root, ".spec/north-star/acceptance.md", "# North Star Acceptance\n\nLocal only.\n");
      writeJson(root, ".spec/console/governance-snapshot.json", {
        schemaVersion: 1,
        kind: "jispec-multi-repo-governance-snapshot",
        exportedAt: "2026-05-01T00:00:00.000Z",
        repo: { id: "repo-x", name: "Repo X", root: root.replace(/\\/g, "/") },
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
          artifactSummary: { totalArtifacts: 3 },
          governanceSummary: { totalObjects: 10 },
          hash: "hash-1",
        },
        aggregateHints: {
          verifyVerdict: "PASS",
          policyProfile: "small_team",
          policyOwner: "platform",
          activeWaivers: 0,
          unmatchedActiveWaivers: [],
          openSpecDebt: 0,
          bootstrapSpecDebt: 0,
          releaseDriftStatus: "changed",
          releaseDriftTrendComparisons: 1,
          latestAuditActor: "codex",
        },
        governanceObjects: [],
      });

      const result = exportConsoleGovernanceSnapshot({
        root,
        repoId: "repo-x",
        repoName: "Repo X",
      });

      assert.ok(fs.existsSync(result.snapshotPath));
      assert.ok(fs.existsSync(result.summaryPath));
      assert.equal(result.snapshot.repo.id, "repo-x");
      assert.equal(result.snapshot.boundary.localOnly, true);
      assert.equal(result.snapshot.contract?.snapshotContractVersion, 1);
      assert.equal(result.snapshot.contract?.compatibleAggregateVersion, 1);
      assert.equal(result.snapshot.contract?.missingSemantics.unavailableValue, "not_available_yet");
      assert.equal(result.snapshot.contract?.missingSemantics.missingSnapshotReason, "snapshot_not_found");
      assert.equal(result.snapshot.aggregateHints.releaseDriftStatus, "changed");
      assert.equal(result.snapshot.governanceObjects.some((object) => object.id === "north_star_acceptance"), true);
      assert.match(renderConsoleGovernanceExportText(result.snapshot), /Snapshot contract: 1/);
      assert.match(renderConsoleGovernanceExportText(result.snapshot), /JiSpec Multi-Repo Governance Snapshot/);

      const snapshot = collectConsoleLocalSnapshot(root);
      const exported = snapshot.governance.objects.find((object) => object.id === "multi_repo_export");
      assert.equal(exported?.status, "available");
      assert.equal(exported?.summary.repoId, "repo-x");
      assert.equal(exported?.summary.verifyVerdict, "PASS");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  record("CLI export-governance exposes JSON and writes the default path", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-export-cli-"));
    try {
      writeJson(root, ".spec/policy.yaml", { version: 1, rules: [] });
      const result = runCli(["console", "export-governance", "--root", root, "--repo-id", "repo-cli", "--repo-name", "Repo CLI", "--json"]);
      assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout) as { snapshotPath?: string; snapshot?: { repo?: { id?: string; name?: string } } };
      assert.equal(payload.snapshot?.repo?.id, "repo-cli");
      assert.equal(payload.snapshot?.repo?.name, "Repo CLI");
      assert.ok(fs.existsSync(payload.snapshotPath ?? ""));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
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
