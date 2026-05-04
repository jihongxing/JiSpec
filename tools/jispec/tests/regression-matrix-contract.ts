import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  buildRegressionMatrixManifest,
  REGRESSION_AREA_ORDER,
  TEST_SUITES,
} from "./regression-runner";
import {
  getDeferredRegressionSuites,
  getDeferredSurfaceContracts,
} from "../runtime/deferred-surface-contract";

interface RegressionMatrixCliManifest {
  schemaVersion: number;
  source: string;
  totalSuites: number;
  totalExpectedTests: number;
  areas: Array<{ area: string; suiteCount: number; expectedTests: number }>;
  suites: Array<{ file: string; area: string; expectedTests: number }>;
  boundaries: {
    v1MainlineAreas: string[];
    runtimeExtendedArea: string;
    pilotReadiness: { suiteFile: string; regressionArea: string; doctorProfile: string; runtimeDiagnosticOnly: boolean };
    deferredSurfaces: {
      contractVersion: number;
      suiteCount: number;
      expectedTests: number;
      allowedRegressionArea: string;
      allowedDoctorProfiles: string[];
      forbiddenDoctorProfiles: string[];
      diagnosticsOnly: boolean;
      suites: string[];
    };
  };
  consistency: { valid: boolean; issues: string[] };
}

interface DoctorReport {
  profile?: string;
  ready?: boolean;
  checks?: Array<{
    name?: string;
    status?: string;
    details?: string[];
  }>;
  readinessSummary?: {
    profile?: string;
    ready?: boolean;
    blockerCount?: number;
  };
}

async function main(): Promise<void> {
  console.log("=== Regression Matrix Contract Tests ===\n");

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
  const manifest = buildRegressionMatrixManifest();
  const testDir = path.join(repoRoot, "tools", "jispec", "tests");
  const excludedFiles = new Set(["regression-runner.ts", "verify-test-helpers.ts"]);
  const filesystemSuiteFiles = fs
    .readdirSync(testDir)
    .filter((file) => file.endsWith(".ts") && !excludedFiles.has(file))
    .sort();
  const matrixSuiteFiles = TEST_SUITES.map((suite) => suite.file).sort();

  record("manifest freezes the matrix totals and source contract", () => {
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.source, "tools/jispec/tests/regression-runner.ts");
    assert.equal(manifest.totalSuites, 143);
    assert.equal(manifest.totalExpectedTests, 648);
    assert.equal(manifest.areas.length, REGRESSION_AREA_ORDER.length);
  });

  record("matrix suite files cover every substantive test file exactly once", () => {
    assert.deepEqual(matrixSuiteFiles, filesystemSuiteFiles);
  });

  record("area summaries stay partitioned by product boundary", () => {
    const areaMap = new Map(manifest.areas.map((area) => [area.area, area]));
    assert.deepEqual([...areaMap.keys()], REGRESSION_AREA_ORDER);
    assert.equal(areaMap.get("core-mainline")?.suiteCount, 40);
    assert.equal(areaMap.get("bootstrap-takeover-hardening")?.suiteCount, 29);
    assert.equal(areaMap.get("retakeover-regression-pool")?.suiteCount, 2);
    assert.equal(areaMap.get("verify-ci-gates")?.suiteCount, 13);
    assert.equal(areaMap.get("verify-ci-gates")?.expectedTests, 56);
    assert.equal(areaMap.get("change-implement")?.suiteCount, 13);
    assert.equal(areaMap.get("change-implement")?.expectedTests, 58);
    assert.equal(areaMap.get("core-mainline")?.expectedTests, 190);
    assert.equal(areaMap.get("bootstrap-takeover-hardening")?.expectedTests, 118);
    assert.equal(areaMap.get("runtime-extended")?.suiteCount, 46);
    assert.equal(areaMap.get("runtime-extended")?.expectedTests, 206);
    assert.ok(manifest.boundaries.v1MainlineAreas.every((area) => area !== "runtime-extended"));
    assert.equal(manifest.boundaries.runtimeExtendedArea, "runtime-extended");
    assert.equal(manifest.boundaries.pilotReadiness.doctorProfile, "pilot");
    assert.equal(manifest.boundaries.pilotReadiness.regressionArea, "runtime-extended");
  });

  record("deferred surface contracts stay diagnostic-only and pilot-forbidden", () => {
    const deferredSuites = getDeferredRegressionSuites();
    const contracts = getDeferredSurfaceContracts();
    assert.equal(deferredSuites.length, 10);
    assert.deepEqual(manifest.boundaries.deferredSurfaces.suites, deferredSuites);
    assert.equal(manifest.boundaries.deferredSurfaces.suiteCount, deferredSuites.length);
    assert.equal(manifest.boundaries.deferredSurfaces.expectedTests, 34);
    assert.equal(manifest.boundaries.deferredSurfaces.allowedRegressionArea, "runtime-extended");
    assert.deepEqual(manifest.boundaries.deferredSurfaces.allowedDoctorProfiles, ["runtime"]);
    assert.deepEqual(manifest.boundaries.deferredSurfaces.forbiddenDoctorProfiles, ["v1", "pilot"]);
    for (const contract of contracts) {
      assert.deepEqual(contract.allowedDoctorProfiles, ["runtime"]);
      assert.deepEqual(contract.forbiddenDoctorProfiles, ["v1", "pilot"]);
      for (const suite of contract.regressionSuites) {
        const registered = TEST_SUITES.find((candidate) => candidate.file === suite);
        assert.ok(registered, `Deferred suite not registered: ${suite}`);
        assert.equal(registered?.area, "runtime-extended", `Deferred suite escaped runtime-extended: ${suite}`);
      }
    }
  });

  record("manifest consistency is valid and every suite file exists", () => {
    assert.equal(manifest.consistency.valid, true);
    assert.deepEqual(manifest.consistency.issues, []);
    const files = new Set(TEST_SUITES.map((suite) => suite.file));
    assert.equal(files.size, TEST_SUITES.length);
    for (const suite of TEST_SUITES) {
      assert.ok(fs.existsSync(path.join(repoRoot, "tools", "jispec", "tests", suite.file)));
    }
  });

  record("CLI manifest-json and doctor runtime both read the same boundary contract", () => {
    const cli = spawnSync(
      process.execPath,
      ["--import", "tsx", path.join(repoRoot, "tools", "jispec", "tests", "regression-runner.ts"), "--manifest-json"],
      {
        cwd: repoRoot,
        encoding: "utf-8",
      },
    );

    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(cli.stdout.includes("Running ["), false);

    const cliManifest = JSON.parse(cli.stdout) as RegressionMatrixCliManifest;
    assert.equal(cliManifest.totalSuites, manifest.totalSuites);
    assert.equal(cliManifest.totalExpectedTests, manifest.totalExpectedTests);
    assert.deepEqual(cliManifest.boundaries, manifest.boundaries);
    assert.deepEqual(cliManifest.areas, manifest.areas);

    const doctor = spawnSync(
      process.execPath,
      ["--import", "tsx", path.join(repoRoot, "tools", "jispec", "cli.ts"), "doctor", "runtime", "--root", repoRoot, "--json"],
      {
        cwd: repoRoot,
        encoding: "utf-8",
      },
    );

    const report = JSON.parse(doctor.stdout) as DoctorReport;
    assert.equal(report.profile, "runtime");
    assert.equal(report.readinessSummary?.profile, "runtime");
    assert.equal(doctor.status, report.ready ? 0 : 1);
    const regressionCheck = report.checks?.find((check) => check.name === "Regression Environment");
    const transactionCheck = report.checks?.find((check) => check.name === "Transaction Mode");
    assert.ok(regressionCheck);
    assert.ok(transactionCheck);
    assert.ok(regressionCheck?.details?.some((detail) => detail.includes("Regression manifest v1")));
    assert.ok(regressionCheck?.details?.some((detail) => detail.includes("runtime-extended")));
    assert.ok(regressionCheck?.details?.some((detail) => detail.includes("diagnostic-only")));
    assert.ok(transactionCheck?.details?.some((detail) => detail.includes("stable-snapshot-gates.ts passed")));
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
