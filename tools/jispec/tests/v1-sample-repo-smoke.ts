import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getRepoRoot } from "./verify-test-helpers";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface SampleDemoReport {
  workspaceRoot: string;
  sessionId: string;
  discover: {
    routeCount: number;
    highConfidenceRouteCount: number;
    schemaCount: number;
    testCount: number;
    outputPaths: string[];
  };
  adopt: {
    status: string;
    adoptedArtifactPaths: string[];
    specDebtFiles: string[];
    rejectedArtifactKinds: string[];
    takeoverReportPath?: string;
  };
  verify: {
    verdict: string;
    ok: boolean;
    issueCodes: string[];
    specDebtPaths: string[];
    factsPath: string;
  };
  ciVerify: {
    exitCode: number | null;
    verdict: string;
    reportPath: string;
    summaryPath: string;
  };
  keyPaths: {
    evidenceGraphPath: string;
    sessionManifestPath: string;
    policyPath: string;
    contractsRoot: string;
    specDebtRoot: string;
  };
}

function main(): void {
  console.log("=== V1 Sample Repo Smoke Test ===\n");

  const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-v1-sample-smoke-"));
  const workspaceRoot = path.join(tempParent, "workspace");
  const results: TestResult[] = [];

  try {
    const report = runSampleDemo(workspaceRoot);

    results.push({
      name: "sample repo demo prepares bootstrap evidence, session state, and takeover artifacts",
      passed:
        report.discover.routeCount === 2 &&
        report.discover.highConfidenceRouteCount === 2 &&
        report.discover.schemaCount >= 1 &&
        report.discover.testCount >= 1 &&
        report.adopt.status === "committed" &&
        report.adopt.adoptedArtifactPaths.includes(".spec/contracts/domain.yaml") &&
        report.adopt.specDebtFiles.includes(`.spec/spec-debt/${report.sessionId}/api.json`) &&
        report.adopt.rejectedArtifactKinds.includes("feature") &&
        report.adopt.takeoverReportPath === ".spec/handoffs/bootstrap-takeover.json" &&
        fs.existsSync(path.join(report.workspaceRoot, report.keyPaths.evidenceGraphPath)) &&
        fs.existsSync(path.join(report.workspaceRoot, report.keyPaths.sessionManifestPath)),
      error: "Expected the sample repo demo to materialize the first takeover artifacts.",
    });

    results.push({
      name: "sample verify output distinguishes adopted contracts from deferred bootstrap debt",
      passed:
        report.verify.verdict === "WARN_ADVISORY" &&
        report.verify.ok === true &&
        report.verify.issueCodes.includes("BOOTSTRAP_SPEC_DEBT_PENDING") &&
        report.verify.specDebtPaths.includes(`.spec/spec-debt/${report.sessionId}/api.json`) &&
        fs.existsSync(path.join(report.workspaceRoot, report.keyPaths.policyPath)) &&
        fs.existsSync(path.join(report.workspaceRoot, report.keyPaths.contractsRoot, "domain.yaml")) &&
        fs.existsSync(path.join(report.workspaceRoot, report.keyPaths.specDebtRoot, "api.json")),
      error: "Expected verify to keep adopted contracts enforced while surfacing deferred bootstrap debt as advisory.",
    });

    results.push({
      name: "sample ci:verify leaves stable CI artifacts for demo and onboarding reuse",
      passed:
        report.ciVerify.exitCode === 0 &&
        report.ciVerify.verdict === "WARN_ADVISORY" &&
        fs.existsSync(path.join(report.workspaceRoot, report.ciVerify.reportPath)) &&
        fs.existsSync(path.join(report.workspaceRoot, report.ciVerify.summaryPath)),
      error: "Expected ci:verify to succeed for the advisory sample and write both report artifacts.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "v1 sample repo execution",
      passed: false,
      error: message,
    });
  } finally {
    fs.rmSync(tempParent, { recursive: true, force: true });
  }

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

function runSampleDemo(workspaceRoot: string): SampleDemoReport {
  const repoRoot = getRepoRoot();
  const scriptPath = path.join(repoRoot, "scripts", "run-v1-sample-repo.ts");
  const result = spawnSync(process.execPath, ["--import", "tsx", scriptPath, "--workspace", workspaceRoot, "--json"], {
    cwd: repoRoot,
    encoding: "utf-8",
  });

  assert.equal(result.status, 0, `sample demo exited with ${result.status}. stderr: ${result.stderr}`);
  return JSON.parse(result.stdout) as SampleDemoReport;
}

main();
