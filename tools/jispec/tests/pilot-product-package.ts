import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import {
  buildPilotProductPackage,
  writePilotProductPackage,
  type PilotProductPackage,
} from "../pilot/product-package";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Pilot Product Package Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("package contract ties install, first baseline, CI, Console, privacy, and doctor pilot into one local path", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-pilot-package-ready-"));
    try {
      writePilotFixture(root);
      const pack = buildPilotProductPackage({
        root,
        generatedAt: "2026-05-02T00:00:00.000Z",
      });

      assert.equal(pack.kind, "jispec-pilot-product-package");
      assert.equal(pack.contract.packageContractVersion, 1);
      assert.equal(pack.boundary.localOnly, true);
      assert.equal(pack.boundary.sourceUploadRequired, false);
      assert.equal(pack.boundary.replacesVerify, false);
      assert.equal(pack.summary.readyForPilot, true);
      assert.deepEqual(pack.adoptionPath.map((step) => step.id), [
        "install",
        "first_run",
        "first_baseline",
        "ci_verify",
        "console_governance",
        "privacy_report",
        "doctor_pilot",
      ]);
      assert.equal(pack.adoptionPath.find((step) => step.id === "ci_verify")?.kind, "mainline_gate");
      assert.equal(pack.adoptionPath.find((step) => step.id === "console_governance")?.kind, "governance_companion");
      assert.equal(pack.adoptionPath.find((step) => step.id === "doctor_pilot")?.command, "npm run pilot:ready");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("package reports missing adoption blockers without uploading source or replacing gates", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-pilot-package-missing-"));
    try {
      writeText(root, "package.json", JSON.stringify({ scripts: { jispec: "jispec" } }, null, 2));
      const pack = buildPilotProductPackage({
        root,
        generatedAt: "2026-05-02T00:00:00.000Z",
      });

      assert.equal(pack.summary.readyForPilot, false);
      assert.ok(pack.summary.blockerCount >= 4);
      assert.ok(pack.blockers.some((blocker) => blocker.stepId === "first_baseline"));
      assert.ok(pack.blockers.every((blocker) => blocker.ownerAction.length > 0));
      assert.ok(pack.blockers.every((blocker) => blocker.nextCommand.length > 0));
      assert.equal(pack.boundary.localOnly, true);
      assert.equal(pack.boundary.sourceUploadRequired, false);
      assert.equal(pack.boundary.replacesVerify, false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("writer and CLI emit JSON plus Markdown companion under .spec/pilot", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-pilot-package-cli-"));
    try {
      writePilotFixture(root);
      const written = writePilotProductPackage({
        root,
        generatedAt: "2026-05-02T00:00:00.000Z",
      });
      assert.equal(fs.existsSync(written.packagePath), true);
      assert.equal(fs.existsSync(written.markdownPath), true);
      const saved = JSON.parse(fs.readFileSync(written.packagePath, "utf-8")) as PilotProductPackage;
      assert.equal(saved.summary.readyForPilot, true);
      assert.match(fs.readFileSync(written.markdownPath, "utf-8"), /Pilot Product Package/);
      assert.match(fs.readFileSync(written.markdownPath, "utf-8"), /Mainline gate/);
      assert.match(fs.readFileSync(written.markdownPath, "utf-8"), /Governance companion/);

      const cli = runCli(["pilot", "package", "--root", root, "--json"]);
      assert.equal(cli.status, 0, cli.stderr);
      const payload = JSON.parse(cli.stdout) as { package: PilotProductPackage; packagePath: string; markdownPath: string };
      assert.equal(payload.package.kind, "jispec-pilot-product-package");
      assert.equal(fs.existsSync(payload.packagePath), true);
      assert.equal(fs.existsSync(payload.markdownPath), true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("pilot product docs separate mainline gates from governance companions", () => {
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    const doc = fs.readFileSync(path.join(repoRoot, "docs", "pilot-product-package.md"), "utf-8");
    const quickstart = fs.readFileSync(path.join(repoRoot, "docs", "quickstart.md"), "utf-8");
    const checklist = fs.readFileSync(path.join(repoRoot, "docs", "pilot-readiness-checklist.md"), "utf-8");

    assert.match(doc, /Mainline gates/i);
    assert.match(doc, /Governance companions/i);
    assert.match(doc, /npm run jispec -- pilot package/);
    assert.match(doc, /does not upload source/i);
    assert.match(quickstart, /pilot package/i);
    assert.match(checklist, /pilot:ready/i);
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

function writePilotFixture(root: string): void {
  writeText(root, "package.json", JSON.stringify({
    scripts: {
      jispec: "jispec",
      "ci:verify": "jispec verify",
    },
  }, null, 2));
  writeText(root, ".spec/handoffs/bootstrap-takeover.json", JSON.stringify({
    status: "committed",
    adoptedArtifactPaths: ["contexts/orders/domain.yaml"],
  }, null, 2));
  writeText(root, ".jispec-ci/verify-report.json", JSON.stringify({
    verdict: "PASS",
    ok: true,
    counts: {
      blocking: 0,
      advisory: 0,
    },
  }, null, 2));
  writeText(root, ".spec/policy.yaml", yaml.dump({
    version: 1,
    team: {
      profile: "small_team",
      owner: "platform",
      reviewers: ["reviewer"],
    },
    rules: [],
  }, { lineWidth: 100, noRefs: true, sortKeys: false }));
  writeText(root, ".spec/console/governance-snapshot.json", JSON.stringify({
    boundary: {
      localOnly: true,
      sourceUploadRequired: false,
      scansSourceCode: false,
      replacesCliGate: false,
    },
  }, null, 2));
  writeText(root, ".spec/privacy/privacy-report.json", JSON.stringify({
    kind: "jispec-privacy-report",
    summary: {
      scannedArtifactCount: 8,
      findingCount: 0,
      highSeverityFindingCount: 0,
    },
  }, null, 2));
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
