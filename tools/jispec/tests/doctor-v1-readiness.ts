import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

interface DoctorReport {
  checks?: Array<{ name?: string; status?: string; details?: string[] }>;
  profile?: string;
  ready?: boolean;
}

async function main(): Promise<void> {
  console.log("=== Doctor V1 Readiness Tests ===\n");

  let passed = 0;
  let failed = 0;

  try {
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    const cliEntry = path.join(repoRoot, "tools", "jispec", "cli.ts");
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", cliEntry, "doctor", "v1", "--root", repoRoot, "--json"],
      {
        cwd: repoRoot,
        encoding: "utf-8",
      },
    );

    if (![0, 1].includes(result.status ?? -1)) {
      throw new Error(`doctor v1 exited with unexpected status ${result.status}. stderr: ${result.stderr}`);
    }

    const report = JSON.parse(result.stdout) as DoctorReport;
    assert.equal(report.profile, "v1");
    assert.ok(Array.isArray(report.checks));
    assert.ok((report.checks?.length ?? 0) > 0);
    console.log("✓ Test 1: doctor v1 returns a machine-readable V1-scoped report");
    passed++;

    const checkNames = new Set((report.checks ?? []).map((check) => check.name));
    for (const requiredName of [
      "Bootstrap Mainline Surface",
      "Verify Runtime Surface",
      "Verify Mitigation Surface",
      "Facts & Policy Surface",
      "CI Verify Surface",
      "Change / Implement Mainline Surface",
      "Execute-Default Mediation Readiness",
      "V1 Regression Coverage",
    ]) {
      assert.ok(checkNames.has(requiredName), `Missing V1 readiness check: ${requiredName}`);
    }
    console.log("✓ Test 2: doctor v1 focuses on the bootstrap/verify/ci/change/implement mainline surfaces");
    passed++;

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
      assert.ok(!checkNames.has(deferredName), `Deferred surface leaked into doctor v1: ${deferredName}`);
    }
    console.log("✓ Test 3: doctor v1 does not let deferred collaboration/distributed surfaces participate in V1 readiness");
    passed++;

    const executeDefaultCheck = (report.checks ?? []).find((check) => check.name === "Execute-Default Mediation Readiness");
    assert.equal(executeDefaultCheck?.status, "pass");
    assert.ok(executeDefaultCheck?.details?.some((detail) => detail.includes("Default change mode:")));
    assert.ok(executeDefaultCheck?.details?.some((detail) => detail.includes("Strict-lane changes still stop at the adopt boundary") || detail.includes("change defaults to prompt mode")));
    console.log("✓ Test 4: doctor v1 reports execute-default mediation readiness without changing deferred readiness scope");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
