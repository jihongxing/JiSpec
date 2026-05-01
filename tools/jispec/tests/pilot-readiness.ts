import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { Doctor, type DoctorReport } from "../doctor";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Commercial Pilot Readiness Tests ===\n");

  const results: TestResult[] = [];

  await runCase(results, "doctor pilot is a separate commercial readiness profile", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-pilot-ready-"));
    try {
      writePilotReadyFixture(root);
      const report = await new Doctor(root).checkCommercialPilotReadiness();
      assert.equal(report.profile, "pilot");
      assert.equal(report.ready, true);
      assert.equal(report.readinessSummary?.profile, "pilot");
      assert.equal(report.checks.length, 7);
      assert.ok(report.checks.some((check) => check.name === "Pilot First Takeover"));
      assert.ok(report.checks.every((check) => check.status === "pass"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await runCase(results, "pilot blockers include owner action and next command", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-pilot-missing-"));
    try {
      writeJson(root, "package.json", { scripts: { jispec: "jispec" } });
      const report = await new Doctor(root).checkCommercialPilotReadiness();

      assert.equal(report.profile, "pilot");
      assert.equal(report.ready, false);
      assert.ok((report.readinessSummary?.blockerCount ?? 0) >= 5);
      for (const blocker of report.readinessSummary?.blockers ?? []) {
        assert.ok(blocker.ownerAction, `missing owner action for ${blocker.check}`);
        assert.ok(blocker.nextCommand, `missing next command for ${blocker.check}`);
      }
      assert.ok(report.checks.some((check) =>
        check.name === "Pilot First Takeover" &&
        check.details.some((detail) => detail.includes("does not promise automatic full understanding"))
      ));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await runCase(results, "pilot readiness fails expired waiver and expired spec debt with governance command", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-pilot-debt-"));
    try {
      writePilotReadyFixture(root);
      writeJson(root, ".spec/waivers/expired.json", {
        id: "expired",
        status: "active",
        owner: "platform",
        reason: "expired",
        expiresAt: "2026-01-01T00:00:00.000Z",
      });
      writeYaml(root, ".spec/spec-debt/ledger.yaml", {
        version: 1,
        debts: [{
          id: "expired-debt",
          status: "open",
          owner: "domain-owner",
          reason: "expired",
          created_at: "2026-01-01T00:00:00.000Z",
          expires_at: "2026-01-02T00:00:00.000Z",
        }],
      });

      const report = await new Doctor(root).checkCommercialPilotReadiness();
      const debt = requiredCheck(report, "Pilot Waiver And Spec Debt");
      assert.equal(debt.status, "fail");
      assert.match(debt.ownerAction ?? "", /Repay\/cancel expired spec debt/);
      assert.equal(debt.nextCommand, "npm run jispec -- console actions --root .");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await runCase(results, "CLI exposes doctor pilot as JSON and text", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-pilot-cli-"));
    try {
      writePilotReadyFixture(root);
      const json = runCli(["doctor", "pilot", "--root", root, "--json"]);
      assert.equal(json.status, 0, json.stderr);
      const report = JSON.parse(json.stdout) as DoctorReport;
      assert.equal(report.profile, "pilot");
      assert.equal(report.ready, true);
      assert.equal(report.readinessSummary?.blockerCount, 0);

      const text = runCli(["doctor", "pilot", "--root", root]);
      assert.equal(text.status, 0, text.stderr);
      assert.match(text.stdout, /Commercial Pilot Readiness/);
      assert.match(text.stdout, /Commercial Pilot Ready: YES/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await runCase(results, "pilot checklist doc states boundary and blocker requirements", async () => {
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    const doc = fs.readFileSync(path.join(repoRoot, "docs", "pilot-readiness-checklist.md"), "utf-8");
    const cliHelp = runCli(["doctor", "--help"]);

    assert.match(doc, /does not promise automatic understanding of an old repository/i);
    assert.match(doc, /owner action/i);
    assert.match(doc, /next local command/i);
    assert.match(doc, /privacy report/i);
    assert.match(doc, /Console governance/i);
    assert.match(cliHelp.stdout, /pilot/);
  });

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

function writePilotReadyFixture(root: string): void {
  writeJson(root, "package.json", {
    scripts: {
      jispec: "jispec",
      "ci:verify": "jispec verify",
    },
  });
  writeJson(root, ".spec/handoffs/bootstrap-takeover.json", {
    status: "committed",
    adoptedArtifactPaths: ["contexts/orders/domain.yaml"],
    specDebtPaths: [],
  });
  writeJson(root, ".jispec-ci/verify-report.json", {
    verdict: "PASS",
    issueCount: 0,
    blockingIssueCount: 0,
    counts: {
      blocking: 0,
      advisory: 0,
    },
  });
  writeYaml(root, ".spec/policy.yaml", {
    version: 1,
    team: {
      profile: "small_team",
      owner: "platform",
      reviewers: ["reviewer"],
    },
    rules: [],
  });
  writeJson(root, ".spec/waivers/active.json", {
    id: "active",
    status: "active",
    owner: "platform",
    reason: "temporary",
    expiresAt: "2099-01-01T00:00:00.000Z",
  });
  writeYaml(root, ".spec/spec-debt/ledger.yaml", {
    version: 1,
    debts: [],
  });
  writeJson(root, ".spec/console/governance-snapshot.json", {
    exportedAt: "2026-05-02T00:00:00.000Z",
    boundary: {
      sourceUploadRequired: false,
      scansSourceCode: false,
      replacesCliGate: false,
    },
  });
  writeJson(root, ".spec/privacy/privacy-report.json", {
    kind: "jispec-privacy-report",
    summary: {
      scannedArtifactCount: 8,
      findingCount: 0,
      highSeverityFindingCount: 0,
    },
  });
}

function requiredCheck(report: DoctorReport, name: string) {
  const check = report.checks.find((entry) => entry.name === name);
  assert.ok(check, `Missing check ${name}`);
  return check;
}

async function runCase(results: TestResult[], name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeYaml(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, yaml.dump(value, { lineWidth: 100, noRefs: true, sortKeys: false }));
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
