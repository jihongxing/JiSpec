import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assessDeferredSurfacePromotionReadiness,
  getDeferredRegressionSuites,
  getDeferredSurfaceContracts,
  getDeferredSurfacePromotionCandidateIds,
  getDeferredSurfacePromotionContract,
} from "../runtime/deferred-surface-contract";
import { TEST_SUITES } from "./regression-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface DoctorReport {
  profile?: string;
  ready?: boolean;
  checks?: Array<{
    name?: string;
    status?: string;
    details?: string[];
    nextCommand?: string;
  }>;
}

async function main(): Promise<void> {
  console.log("=== P13 Deferred Surface Promotion Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("promotion contract freezes the six hard rules and only exposes the first two candidates", () => {
    const promotion = getDeferredSurfacePromotionContract();
    const deferred = getDeferredSurfaceContracts();

    assert.equal(promotion.schemaVersion, 1);
    assert.equal(promotion.contractVersion, 3);
    assert.equal(promotion.status, "explicit_promotion_required");
    assert.deepEqual(
      promotion.promotionRequirements.map((requirement) => requirement.id),
      [
        "stable_machine_artifacts",
        "audit_evidence",
        "owner_and_next_command",
        "cannot_override_verify",
        "dedicated_acceptance_scenarios",
        "deterministic_local_first_behavior",
      ],
    );
    assert.deepEqual(getDeferredSurfacePromotionCandidateIds(), [
      "console_governance_export",
      "multi_repo_governance_aggregate",
    ]);
    assert.deepEqual(
      promotion.initialPromotionCandidates.map((candidate) => candidate.acceptanceScenarios.length > 0),
      [true, true],
    );
    assert.ok(promotion.initialPromotionCandidates.every((candidate) => candidate.localFirst === true));
    assert.ok(promotion.initialPromotionCandidates.every((candidate) => candidate.cannotOverrideVerify === true));
    assert.ok(promotion.initialPromotionCandidates.every((candidate) => candidate.deterministicArtifactsOnly === true));
    assert.ok(deferred.every((contract) => contract.forbiddenDoctorProfiles.includes("global")));
    assert.deepEqual(
      promotion.explicitlyDeferredSurfaces.map((surface) => surface.id),
      [
        "collaboration-workspace",
        "presence-awareness",
        "distributed-execution",
        "notifications",
        "conflict-resolution",
      ],
    );

    const declaredOnlyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p13-promotion-declared-"));
    const missingAuditRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p13-promotion-missing-"));
    const unreadableRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p13-promotion-unreadable-"));
    const healthyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p13-promotion-healthy-"));
    try {
      writeJson(missingAuditRoot, ".spec/console/governance-snapshot.json", { schemaVersion: 1 });

      writeJson(unreadableRoot, ".spec/console/governance-snapshot.json", { schemaVersion: 1 });
      writeText(unreadableRoot, ".spec/audit/events.jsonl", "not-json\n");

      writeJson(healthyRoot, ".spec/console/governance-snapshot.json", { schemaVersion: 1 });
      writeJson(healthyRoot, ".spec/console/multi-repo-governance.json", { schemaVersion: 1 });
      writeText(healthyRoot, ".spec/audit/events.jsonl", `${JSON.stringify({ type: "governance_export" })}\n`);

      const declaredOnly = assessDeferredSurfacePromotionReadiness(declaredOnlyRoot);
      const missingAudit = assessDeferredSurfacePromotionReadiness(missingAuditRoot);
      const unreadable = assessDeferredSurfacePromotionReadiness(unreadableRoot);
      const healthy = assessDeferredSurfacePromotionReadiness(healthyRoot);

      assert.equal(declaredOnly.candidates[0]?.status, "declared_contract_only");
      assert.equal(missingAudit.candidates[0]?.status, "artifact_missing");
      assert.equal(unreadable.candidates[0]?.status, "artifact_unreadable");
      assert.equal(healthy.candidates.every((candidate) => candidate.status === "artifact_healthy"), true);
      assert.equal(healthy.ready, true);
    } finally {
      fs.rmSync(declaredOnlyRoot, { recursive: true, force: true });
      fs.rmSync(missingAuditRoot, { recursive: true, force: true });
      fs.rmSync(unreadableRoot, { recursive: true, force: true });
      fs.rmSync(healthyRoot, { recursive: true, force: true });
    }
  }));

  results.push(record("doctor global exposes the promotion contract as a distinct broader-closure check", () => {
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    const cliPath = path.join(repoRoot, "tools", "jispec", "cli.ts");
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", cliPath, "doctor", "global", "--root", repoRoot, "--json"],
      {
        cwd: repoRoot,
        encoding: "utf-8",
      },
    );

    assert.ok([0, 1].includes(result.status ?? -1), `Unexpected doctor global status: ${result.status}`);
    const report = JSON.parse(result.stdout) as DoctorReport;
    assert.equal(report.profile, "global");
    const check = report.checks?.find((entry) => entry.name === "Deferred Surface Promotion Contract");
    assert.ok(check, "Missing Deferred Surface Promotion Contract check");
    assert.match((check?.details ?? []).join("\n"), /Initial promotion candidates: console_governance_export, multi_repo_governance_aggregate/);
    assert.match((check?.details ?? []).join("\n"), /Explicitly deferred surfaces: collaboration-workspace, presence-awareness, distributed-execution, notifications, conflict-resolution/);
    assert.match((check?.details ?? []).join("\n"), /Promotion evidence health:/);
    assert.match((check?.details ?? []).join("\n"), /Candidate console_governance_export:/);
  }));

  results.push(record("docs and regression registration expose the explicit promotion boundary", () => {
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    const doc = fs.readFileSync(path.join(repoRoot, "docs", "collaboration-surface-freeze.md"), "utf-8");
    const doctor = fs.readFileSync(path.join(repoRoot, "tools", "jispec", "doctor.ts"), "utf-8");
    const suite = TEST_SUITES.find((candidate) => candidate.file === "p13-deferred-surface-promotion.ts");

    assert.ok(doc.includes("stable machine-readable artifacts"));
    assert.ok(doc.includes("Initial Promotion Candidates"));
    assert.ok(doc.includes("Console governance export"));
    assert.ok(doc.includes("multi-repo governance aggregate"));
    assert.ok(doc.includes("notifications"));
    assert.ok(doc.includes("conflict resolution"));
    assert.ok(doctor.includes("Deferred Surface Promotion Contract"));
    assert.ok(suite);
    assert.equal(suite?.area, "runtime-extended");
    assert.equal(suite?.expectedTests, 3);
    assert.equal(suite?.task, "P13-T3");
    for (const deferredSuite of getDeferredRegressionSuites()) {
      assert.ok(TEST_SUITES.some((candidate) => candidate.file === deferredSuite && candidate.area === "runtime-extended"));
    }
  }));

  printResults(results);
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
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
