import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  getDeferredRegressionSuites,
  getDeferredSurfaceContracts,
} from "../runtime/deferred-surface-contract";

interface DoctorReport {
  checks?: Array<{ name?: string }>;
  profile?: string;
}

async function main(): Promise<void> {
  console.log("=== Collaboration Surface Freeze Tests ===\n");

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

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const runnerPath = path.join(repoRoot, "tools", "jispec", "tests", "regression-runner.ts");
  const doctorTestPath = path.join(repoRoot, "tools", "jispec", "tests", "doctor-mainline-readiness.ts");
  const stableContractPath = path.join(repoRoot, "docs", "v1-mainline-stable-contract.md");
  const planPath = path.join(repoRoot, "docs", "post-v1-north-star-plan.md");
  const freezeDocPath = path.join(repoRoot, "docs", "collaboration-surface-freeze.md");
  const readmePath = path.join(repoRoot, "README.md");
  const zhReadmePath = path.join(repoRoot, "README.zh-CN.md");

  const runner = fs.readFileSync(runnerPath, "utf-8");
  const doctorTest = fs.readFileSync(doctorTestPath, "utf-8");
  const stableContract = fs.readFileSync(stableContractPath, "utf-8");
  const plan = fs.readFileSync(planPath, "utf-8");
  const freezeDoc = fs.readFileSync(freezeDocPath, "utf-8");
  const readme = fs.readFileSync(readmePath, "utf-8");
  const zhReadme = fs.readFileSync(zhReadmePath, "utf-8");

  record("deferred surface contract freezes collaboration, presence, and distributed as non-V1 surfaces", () => {
    const contracts = getDeferredSurfaceContracts();
    assert.deepEqual(contracts.map((contract) => contract.kind).sort(), ["collaboration", "distributed", "presence"]);
    for (const contract of contracts) {
      assert.equal(contract.status, "deferred");
      assert.equal(contract.allowedRegressionArea, "runtime-extended");
      assert.deepEqual(contract.allowedDoctorProfiles, ["runtime"]);
      assert.deepEqual(contract.forbiddenDoctorProfiles, ["v1", "pilot", "global"]);
      assert.equal(contract.doesBlockV1Readiness, false);
      assert.equal(contract.canOverrideVerify, false);
      assert.equal(contract.productizedInV1, false);
    }
  });

  record("deferred regression suites stay in runtime-extended and are not promoted into mainline areas", () => {
    for (const suite of getDeferredRegressionSuites()) {
      assert.ok(runner.includes(`runtime({ name:`) && runner.includes(`file: '${suite}'`), `Deferred suite is not registered as runtime: ${suite}`);
      assert.ok(!runner.includes(`core({ name: '${suite}'`), `Deferred suite leaked to core: ${suite}`);
      assert.ok(!runner.includes(`gates({ name: '${suite}'`), `Deferred suite leaked to verify gates: ${suite}`);
      assert.ok(!runner.includes(`changeImplement({ name: '${suite}'`), `Deferred suite leaked to change/implement: ${suite}`);
    }
  });

  record("doctor mainline excludes deferred runtime checks", () => {
    const cliEntry = path.join(repoRoot, "tools", "jispec", "cli.ts");
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", cliEntry, "doctor", "mainline", "--root", repoRoot, "--json"],
      { cwd: repoRoot, encoding: "utf-8" },
    );

    assert.ok([0, 1].includes(result.status ?? -1), `Unexpected doctor mainline status: ${result.status}`);
    const report = JSON.parse(result.stdout) as DoctorReport;
    assert.equal(report.profile, "mainline");
    const checkNames = new Set((report.checks ?? []).map((check) => check.name));

    for (const deferredName of [
      "Collaboration Engine",
      "Conflict Resolution",
      "Collaboration Awareness",
      "Collaboration Locking",
      "Collaboration Notifications",
      "Collaboration Analytics",
      "Resource Management",
      "Fault Recovery",
    ]) {
      assert.ok(!checkNames.has(deferredName), `Deferred check leaked into doctor mainline: ${deferredName}`);
      assert.ok(doctorTest.includes(deferredName), `doctor-mainline-readiness.ts no longer guards ${deferredName}`);
    }
  });

  record("docs expose the frozen boundary and promotion rule", () => {
    for (const suite of getDeferredRegressionSuites()) {
      assert.ok(freezeDoc.includes(suite), `Freeze doc missing ${suite}`);
    }
    assert.ok(freezeDoc.includes("Promoting any deferred surface into V1"));
    assert.ok(stableContract.includes("Collaboration Surface Freeze"));
    assert.ok(stableContract.includes("docs/collaboration-surface-freeze.md"));
    assert.ok(plan.includes("状态：已实现"));
    assert.ok(plan.includes("collaboration-surface-freeze.ts"));
    assert.ok(readme.includes("Collaboration surface freeze"));
    assert.ok(zhReadme.includes("Collaboration surface freeze"));
  });

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
