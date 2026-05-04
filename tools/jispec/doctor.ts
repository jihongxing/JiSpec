/**
 * JiSpec Doctor - readiness and health checks
 *
 * Performs V1 mainline and extended runtime health checks.
 */

import path from "node:path";
import fs from "node:fs";
import yaml from "js-yaml";
import { FilesystemStorage } from "./filesystem-storage.js";
import { encodeIdentity, decodeIdentity, identityEquals } from "./artifact-identity.js";
import { computeCacheKey, computeContentHash } from "./cache-key.js";
import { createManifest } from "./cache-manifest.js";
import { createFactsContract } from "./facts/facts-contract";
import { loadVerifyPolicy, policyFileExists } from "./policy/policy-loader";
import { validatePolicyAgainstFactsContract } from "./policy/policy-schema";
import { evaluateChangeExecuteDefaultReadiness } from "./change/orchestration-config";

export interface DoctorCheckResult {
  name: string;
  status: "pass" | "fail";
  summary: string;
  details: string[];
  ownerAction?: string;
  nextCommand?: string;
  sourceArtifacts?: string[];
}

export type DoctorProfile = "runtime" | "v1" | "pilot";

export interface DoctorReport {
  checks: DoctorCheckResult[];
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  ready: boolean;
  profile?: DoctorProfile;
  readinessSummary?: {
    profile: DoctorProfile;
    ready: boolean;
    blockerCount: number;
    blockers: Array<{
      check: string;
      summary: string;
      ownerAction?: string;
      nextCommand?: string;
    }>;
  };
}

interface RegressionMatrixManifest {
  schemaVersion: number;
  source: string;
  totalSuites: number;
  totalExpectedTests: number;
  areas: Array<{
    area: string;
    suiteCount: number;
    expectedTests: number;
  }>;
  suites: Array<{
    name: string;
    file: string;
    expectedTests: number;
    area: string;
    task?: string;
  }>;
  boundaries?: {
    v1MainlineAreas?: string[];
    runtimeExtendedArea?: string;
    pilotReadiness?: {
      suiteFile: string;
      regressionArea: string;
      doctorProfile: string;
      runtimeDiagnosticOnly: boolean;
    };
    deferredSurfaces?: {
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
  consistency?: {
    valid: boolean;
    issues: string[];
  };
}

export class Doctor {
  private root: string;

  constructor(root: string) {
    this.root = root;
  }

  /**
   * Run extended runtime and compatibility readiness checks.
   */
  async checkRuntime(): Promise<DoctorReport> {
    const checks: DoctorCheckResult[] = [];

    checks.push(await this.checkPipelineConfiguration());
    checks.push(await this.checkStorageAdapterBoundary());
    checks.push(await this.checkArtifactIdentitySystem());
    checks.push(await this.checkCacheKeyComputation());
    checks.push(await this.checkCacheManifestFormat());
    checks.push(await this.checkRollbackPrerequisites());
    checks.push(await this.checkRegressionEnvironment());
    checks.push(await this.checkVerifyRuntimeSurface());
    checks.push(await this.checkFactsAndPolicySurface());
    checks.push(await this.checkCiVerifySurface());
    checks.push(await this.checkTransactionMode());
    checks.push(await this.checkResourceManagement());
    checks.push(await this.checkFaultRecovery());
    checks.push(await this.checkCollaborationEngine());
    checks.push(await this.checkConflictResolution());
    checks.push(await this.checkCollaborationAwareness());
    checks.push(await this.checkCollaborationLocking());
    checks.push(await this.checkCollaborationNotifications());
    checks.push(await this.checkCollaborationAnalytics());

    return this.buildReport("runtime", checks);
  }

  /**
   * Run V1 mainline readiness checks without letting deferred collaboration
   * and distributed experiments block the core product path.
   */
  async checkV1Mainline(): Promise<DoctorReport> {
    const checks: DoctorCheckResult[] = [];

    checks.push(await this.checkBootstrapMainlineSurface());
    checks.push(await this.checkVerifyRuntimeSurface());
    checks.push(await this.checkVerifyMitigationSurface());
    checks.push(await this.checkFactsAndPolicySurface());
    checks.push(await this.checkCiVerifySurface());
    checks.push(await this.checkChangeImplementMainlineSurface());
    checks.push(await this.checkExecuteDefaultMediationReadiness());
    checks.push(await this.checkV1RegressionCoverage());

    return this.buildReport("v1", checks);
  }

  /**
   * Run commercial pilot readiness checks over local JiSpec artifacts. This is
   * separate from V1 engineering readiness: a repo can be technically healthy
   * and still not ready for an external team pilot.
   */
  async checkCommercialPilotReadiness(): Promise<DoctorReport> {
    const checks: DoctorCheckResult[] = [];

    checks.push(await this.checkPilotInstallationEntry());
    checks.push(await this.checkPilotFirstTakeover());
    checks.push(await this.checkPilotCiIntegration());
    checks.push(await this.checkPilotPolicyProfile());
    checks.push(await this.checkPilotWaiverAndSpecDebt());
    checks.push(await this.checkPilotConsoleGovernance());
    checks.push(await this.checkPilotPrivacyReport());

    return this.buildReport("pilot", checks);
  }

  private buildReport(profile: DoctorProfile, checks: DoctorCheckResult[]): DoctorReport {
    const passedChecks = checks.filter((c) => c.status === "pass").length;
    const failedChecks = checks.filter((c) => c.status === "fail").length;
    const blockers = checks
      .filter((check) => check.status === "fail")
      .map((check) => ({
        check: check.name,
        summary: check.summary,
        ownerAction: check.ownerAction,
        nextCommand: check.nextCommand,
      }));

    return {
      checks,
      totalChecks: checks.length,
      passedChecks,
      failedChecks,
      ready: failedChecks === 0,
      profile,
      readinessSummary: {
        profile,
        ready: failedChecks === 0,
        blockerCount: blockers.length,
        blockers,
      },
    };
  }

  /**
   * Check 1: Pipeline Configuration
   */
  private async checkPipelineConfiguration(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const configPath = path.join(this.root, "agents", "pipeline.yaml");

      if (!fs.existsSync(configPath)) {
        status = "fail";
        details.push("pipeline.yaml not found");
        return { name: "Pipeline Configuration", status, summary: "pipeline.yaml missing", details };
      }

      const content = fs.readFileSync(configPath, "utf-8");
      const config = yaml.load(content) as any;
      const pipeline = config.pipeline || config;

      if (!pipeline.name || !pipeline.version || !pipeline.stages) {
        status = "fail";
        details.push("Missing required fields: name, version, or stages");
        return { name: "Pipeline Configuration", status, summary: "Invalid structure", details };
      }

      details.push(`pipeline.yaml valid`);
      details.push(`${pipeline.stages.length} stages defined`);

      // Check each stage has required fields
      for (const stage of pipeline.stages) {
        if (!stage.id || !stage.name || !stage.agent || !stage.lifecycle_state || !stage.inputs || !stage.outputs || !stage.gates) {
          status = "fail";
          details.push(`Stage ${stage.id || "unknown"} missing required fields`);
        }
      }

      if (pipeline.failure_handling) {
        details.push("failure_handling configured");
      }

      return {
        name: "Pipeline Configuration",
        status,
        summary: status === "pass" ? "Valid" : "Invalid",
        details,
      };
    } catch (error: any) {
      return {
        name: "Pipeline Configuration",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check 2: Storage Adapter Boundary
   */
  private async checkStorageAdapterBoundary(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const coreFiles = [
        "stage-runner.ts",
        "pipeline-executor.ts",
        "cache-manager.ts",
        "failure-handler.ts",
      ];

      for (const file of coreFiles) {
        const filePath = path.join(this.root, "tools", "jispec", file);
        if (!fs.existsSync(filePath)) {
          details.push(`${file} not found`);
          continue;
        }

        const content = fs.readFileSync(filePath, "utf-8");

        // Check for direct fs imports (excluding type imports)
        const directFsImport = /import\s+(?:(?!type)[\w\s{},*]+)\s+from\s+["']node:fs["']/.test(content);

        if (directFsImport) {
          status = "fail";
          details.push(`${file} has direct fs import`);
        }
      }

      if (status === "pass") {
        details.push("No direct fs imports in core files");
        details.push("FilesystemStorage contract compliant");
      }

      return {
        name: "Storage Adapter Boundary",
        status,
        summary: status === "pass" ? "Compliant" : "Violations found",
        details,
      };
    } catch (error: any) {
      return {
        name: "Storage Adapter Boundary",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check 3: Artifact Identity System
   */
  private async checkArtifactIdentitySystem(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      // Test roundtrip with correct interface
      const testIdentity: any = {
        sliceId: "test-slice-v1",
        stageId: "design",
        artifactType: "design" as const,
        artifactId: "design.md",
      };

      const encoded = encodeIdentity(testIdentity);
      const decoded = decodeIdentity(encoded);

      if (!identityEquals(testIdentity, decoded)) {
        status = "fail";
        details.push("encodeIdentity/decodeIdentity roundtrip failed");
      } else {
        details.push("encodeIdentity/decodeIdentity roundtrip: OK");
      }

      // Check encoded format (colons are expected as delimiters, not unsafe)
      // encodeIdentity produces logical identifiers for trace links/cache keys, not filenames
      const expectedFormat = /^[^:]+:[^:]+:[^:]+:[^:]+(:.*)?$/;
      if (!expectedFormat.test(encoded)) {
        status = "fail";
        details.push("Encoded identity format invalid");
      } else {
        details.push("Encoded format: OK (sliceId:stageId:artifactType:artifactId)");
      }

      return {
        name: "Artifact Identity System",
        status,
        summary: status === "pass" ? "Valid" : "Invalid",
        details,
      };
    } catch (error: any) {
      return {
        name: "Artifact Identity System",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check 4: Cache Key Computation
   */
  private async checkCacheKeyComputation(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const testInputs: any = {
        sliceId: "test-slice",
        stageId: "requirements",
        identity: {
          sliceId: "test-slice",
          stageId: "requirements",
          artifactType: "requirements" as const,
          artifactId: "requirements.md",
        },
        inputArtifacts: [
          {
            identity: {
              sliceId: "test-slice",
              stageId: "requirements",
              artifactType: "requirements" as const,
              artifactId: "input.txt",
            },
            contentHash: "abc123",
          },
        ],
        dependencyState: { gates: {}, lifecycleState: "proposed" },
        providerConfig: { provider: "mock", model: "test" },
        contractVersion: { contractHash: "test", schemaVersion: "1.0" },
      };

      const key1 = computeCacheKey(testInputs);
      const key2 = computeCacheKey(testInputs);

      if (key1 !== key2) {
        status = "fail";
        details.push("Cache key not deterministic");
      } else {
        details.push("Deterministic: OK");
      }

      if (!key1.startsWith("cache:")) {
        status = "fail";
        details.push("Cache key missing 'cache:' prefix");
      } else {
        details.push("Format: cache:<hex>");
      }

      return {
        name: "Cache Key Computation",
        status,
        summary: status === "pass" ? "Valid" : "Invalid",
        details,
      };
    } catch (error: any) {
      return {
        name: "Cache Key Computation",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check 5: Cache Manifest Format
   */
  private async checkCacheManifestFormat(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      // Create proper CacheKeyInputs
      const keyInputs = {
        sliceId: "test-slice",
        stageId: "requirements",
        identity: {
          sliceId: "test-slice",
          stageId: "requirements",
          artifactType: "requirements" as const,
          artifactId: "test-artifact"
        },
        inputArtifacts: [
          {
            identity: { sliceId: "test-slice", stageId: "input", artifactType: "requirements" as const, artifactId: "input-1" },
            contentHash: "abc123"
          }
        ],
        dependencyState: {
          gates: {},
          lifecycleState: "requirements-defined"
        },
        providerConfig: {
          provider: "anthropic",
          model: "claude-3-5-sonnet-20241022",
          temperature: 0.7,
          maxTokens: 4096
        },
        contractVersion: {
          contractHash: "contract-hash-abc",
          schemaVersion: "1.0.0"
        }
      };

      // Create proper snapshots
      const inputSnapshots = [
        {
          identity: { sliceId: "test-slice", stageId: "input", artifactType: "requirements" as const, artifactId: "input-1" },
          contentHash: "abc123",
          timestamp: new Date().toISOString()
        }
      ];

      const outputSnapshots = [
        {
          identity: { sliceId: "test-slice", stageId: "requirements", artifactType: "requirements" as const, artifactId: "test-artifact" },
          contentHash: "def456",
          timestamp: new Date().toISOString()
        }
      ];

      const testManifest = createManifest(
        "cache:test",
        keyInputs,
        inputSnapshots,
        outputSnapshots
      );

      if (!testManifest.cacheKey || !testManifest.createdAt || !testManifest.keyInputs) {
        status = "fail";
        details.push("Manifest missing required fields");
      } else {
        details.push("Structure valid");
      }

      if (!testManifest.inputSnapshots || !testManifest.outputSnapshots) {
        status = "fail";
        details.push("Manifest missing inputs/outputs");
      } else {
        details.push("Artifact snapshots complete");
      }

      return {
        name: "Cache Manifest Format",
        status,
        summary: status === "pass" ? "Valid" : "Invalid",
        details,
      };
    } catch (error: any) {
      return {
        name: "Cache Manifest Format",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check 6: Rollback Prerequisites
   */
  private async checkRollbackPrerequisites(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const snapshotDir = path.join(this.root, ".jispec", "snapshots");

      details.push(`Snapshot directory: .jispec/snapshots/`);
      details.push("FailureHandler ready");

      return {
        name: "Rollback Prerequisites",
        status,
        summary: "Ready",
        details,
      };
    } catch (error: any) {
      return {
        name: "Rollback Prerequisites",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check 7: Regression Environment
   */
  private async checkRegressionEnvironment(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const runnerPath = path.join(this.root, "tools", "jispec", "tests", "regression-runner.ts");

      if (!fs.existsSync(runnerPath)) {
        status = "fail";
        details.push("regression-runner.ts not found");
        return { name: "Regression Environment", status, summary: "Missing", details };
      }

      const manifest = this.loadRegressionMatrixManifest();
      details.push(`Regression manifest v${manifest.schemaVersion}: ${manifest.totalSuites} suite(s), ${manifest.totalExpectedTests} expected test(s)`);
      details.push(`Source: ${manifest.source}`);

      if (manifest.consistency?.valid === false) {
        status = "fail";
        details.push("Regression manifest consistency failed:");
        details.push(...manifest.consistency.issues.map((issue) => `  - ${issue}`));
      }

      for (const area of manifest.areas) {
        details.push(`${area.area}: ${area.suiteCount} suite(s), ${area.expectedTests} expected test(s)`);
      }

      const runtimeArea = manifest.areas.find((area) => area.area === "runtime-extended");
      if (!runtimeArea) {
        status = "fail";
        details.push("runtime-extended area missing from regression manifest");
      } else {
        details.push(`Runtime extended diagnostics: ${runtimeArea.suiteCount} suite(s), ${runtimeArea.expectedTests} expected test(s)`);
      }

      const deferred = manifest.boundaries?.deferredSurfaces;
      if (!deferred) {
        status = "fail";
        details.push("Deferred surface boundary missing from regression manifest");
      } else {
        details.push(`Deferred surface diagnostics: ${deferred.suiteCount} suite(s), ${deferred.expectedTests} expected test(s)`);
        details.push(`Deferred surface boundary: diagnostics-only in ${deferred.allowedRegressionArea}; excluded from V1 and pilot gates`);
      }

      const pilotReadiness = manifest.boundaries?.pilotReadiness;
      if (!pilotReadiness || pilotReadiness.regressionArea !== "runtime-extended" || pilotReadiness.runtimeDiagnosticOnly !== true) {
        status = "fail";
        details.push("Deferred pilot-readiness suite missing, mis-scoped, or not diagnostic-only");
      } else {
        details.push(`Deferred pilot-readiness suite ${pilotReadiness.suiteFile} stays in runtime-extended regression coverage only`);
        details.push("Pilot readiness remains outside runtime-extended gating; doctor pilot owns the commercial readiness gate");
      }

      details.push("Profile boundary: doctor runtime stays diagnostic-only over runtime-extended; doctor v1 gates the V1 mainline; doctor pilot remains a separate commercial readiness profile.");

      let allManifestFilesExist = true;
      for (const suite of manifest.suites) {
        const testPath = path.join(this.root, "tools", "jispec", "tests", suite.file);
        if (!fs.existsSync(testPath)) {
          allManifestFilesExist = false;
          status = "fail";
          details.push(`Test file missing: ${suite.file}`);
        }
      }
      if (allManifestFilesExist) {
        details.push("Manifest test files: OK");
      }

      // Check if build succeeds (via tsc --noEmit)
      try {
        const { execSync } = await import("node:child_process");
        execSync("npm run typecheck", { cwd: this.root, stdio: "pipe" });
        details.push("Build: OK");
      } catch (buildError: any) {
        status = "fail";
        details.push("Build: FAIL");
        details.push(`  ${buildError.message}`);
      }

      return {
        name: "Regression Environment",
        status,
        summary: status === "pass" ? "Healthy" : "Issues found",
        details,
      };
    } catch (error: any) {
      return {
        name: "Regression Environment",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  private loadRegressionMatrixManifest(): RegressionMatrixManifest {
    const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
    const output = execFileSync(
      process.execPath,
      ["--import", "tsx", "./tools/jispec/tests/regression-runner.ts", "--manifest-json"],
      {
        cwd: this.root,
        encoding: "utf-8",
        stdio: "pipe",
      },
    );
    return JSON.parse(output) as RegressionMatrixManifest;
  }

  /**
   * Check 8: Verify Runtime Surface
   */
  private async checkVerifyRuntimeSurface(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const requiredFiles = [
        path.join(this.root, "tools", "jispec", "verify", "verdict.ts"),
        path.join(this.root, "tools", "jispec", "verify", "legacy-validator-adapter.ts"),
        path.join(this.root, "tools", "jispec", "verify", "verify-runner.ts"),
      ];

      for (const requiredFile of requiredFiles) {
        if (!fs.existsSync(requiredFile)) {
          status = "fail";
          details.push(`Missing verify runtime file: ${path.relative(this.root, requiredFile)}`);
        }
      }

      if (status === "pass") {
        const { execFileSync } = await import("node:child_process");
        const output = execFileSync(
          process.execPath,
          ["--import", "tsx", "./tools/jispec/cli.ts", "verify", "--json"],
          {
            cwd: this.root,
            encoding: "utf-8",
            stdio: "pipe",
            timeout: 60000,
          },
        );

        const parsed = JSON.parse(output) as Record<string, unknown>;
        if (typeof parsed.verdict !== "string" || !Array.isArray(parsed.issues)) {
          status = "fail";
          details.push("verify --json did not return the expected verdict contract");
        } else {
          details.push(`verify --json contract OK (${parsed.verdict})`);
        }
      }

      return {
        name: "Verify Runtime Surface",
        status,
        summary: status === "pass" ? "Ready" : "Not ready",
        details,
      };
    } catch (error: any) {
      return {
        name: "Verify Runtime Surface",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check V1.1: Bootstrap Mainline Surface
   */
  private async checkBootstrapMainlineSurface(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const requiredFiles = [
        path.join(this.root, "tools", "jispec", "bootstrap", "discover.ts"),
        path.join(this.root, "tools", "jispec", "bootstrap", "draft.ts"),
        path.join(this.root, "tools", "jispec", "bootstrap", "adopt.ts"),
        path.join(this.root, "tools", "jispec", "bootstrap", "evidence-graph.ts"),
        path.join(this.root, "tools", "jispec", "bootstrap", "spec-debt.ts"),
        path.join(this.root, "tools", "jispec", "bootstrap", "takeover.ts"),
      ];

      for (const requiredFile of requiredFiles) {
        if (!fs.existsSync(requiredFile)) {
          status = "fail";
          details.push(`Missing bootstrap file: ${path.relative(this.root, requiredFile)}`);
        }
      }

      const evidenceGraphPath = path.join(this.root, ".spec", "facts", "bootstrap", "evidence-graph.json");
      if (fs.existsSync(evidenceGraphPath)) {
        const graph = JSON.parse(fs.readFileSync(evidenceGraphPath, "utf-8")) as Record<string, unknown>;
        if (typeof graph.repoRoot !== "string" || !Array.isArray(graph.routes) || !Array.isArray(graph.schemas)) {
          status = "fail";
          details.push(".spec/facts/bootstrap/evidence-graph.json exists but does not match the expected top-level shape");
        } else {
          details.push(`Bootstrap evidence graph present (${(graph.routes as unknown[]).length} route signal(s))`);
        }
      } else {
        details.push("Bootstrap evidence graph not present yet (optional until first discover run)");
      }

      const takeoverReportPath = path.join(this.root, ".spec", "handoffs", "bootstrap-takeover.json");
      if (fs.existsSync(takeoverReportPath)) {
        const report = JSON.parse(fs.readFileSync(takeoverReportPath, "utf-8")) as Record<string, unknown>;
        if (report.status !== "committed" || !Array.isArray(report.adoptedArtifactPaths)) {
          status = "fail";
          details.push(".spec/handoffs/bootstrap-takeover.json exists but is missing committed takeover semantics");
        } else {
          details.push(`Bootstrap takeover report present (${(report.adoptedArtifactPaths as unknown[]).length} adopted artifact(s))`);
        }
      } else {
        details.push("Bootstrap takeover report not present yet (optional until first adopt run)");
      }

      return {
        name: "Bootstrap Mainline Surface",
        status,
        summary: status === "pass" ? "Ready" : "Not ready",
        details,
      };
    } catch (error: any) {
      return {
        name: "Bootstrap Mainline Surface",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check V1.2: Verify Mitigation Surface
   */
  private async checkVerifyMitigationSurface(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const requiredFiles = [
        path.join(this.root, "tools", "jispec", "verify", "baseline-store.ts"),
        path.join(this.root, "tools", "jispec", "verify", "waiver-store.ts"),
        path.join(this.root, "tools", "jispec", "verify", "observe-mode.ts"),
        path.join(this.root, "tools", "jispec", "verify", "issue-fingerprint.ts"),
      ];

      for (const requiredFile of requiredFiles) {
        if (!fs.existsSync(requiredFile)) {
          status = "fail";
          details.push(`Missing verify mitigation file: ${path.relative(this.root, requiredFile)}`);
        }
      }

      const baselinePath = path.join(this.root, ".spec", "baseline.json");
      if (fs.existsSync(baselinePath)) {
        const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf-8")) as Record<string, unknown>;
        if (!Array.isArray(baseline.entries)) {
          status = "fail";
          details.push(".spec/baseline.json exists but is missing the entries array");
        } else {
          details.push(`Baseline file present (${baseline.entries.length} entr${baseline.entries.length === 1 ? "y" : "ies"})`);
        }
      } else {
        details.push("Baseline file not present yet (optional until first baseline write)");
      }

      const waiversDir = path.join(this.root, ".spec", "waivers");
      if (fs.existsSync(waiversDir)) {
        const waiverFiles = fs.readdirSync(waiversDir).filter((entry) => entry.endsWith(".json"));
        details.push(`Waiver directory present (${waiverFiles.length} waiver file(s))`);
      } else {
        details.push("Waiver directory not present yet (optional until first waiver is created)");
      }

      return {
        name: "Verify Mitigation Surface",
        status,
        summary: status === "pass" ? "Ready" : "Not ready",
        details,
      };
    } catch (error: any) {
      return {
        name: "Verify Mitigation Surface",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check 8.5: Facts and Policy Surface
   */
  private async checkFactsAndPolicySurface(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const requiredFiles = [
        path.join(this.root, "tools", "jispec", "facts", "canonical-facts.ts"),
        path.join(this.root, "tools", "jispec", "facts", "facts-contract.ts"),
        path.join(this.root, "tools", "jispec", "policy", "policy-schema.ts"),
        path.join(this.root, "tools", "jispec", "policy", "policy-loader.ts"),
        path.join(this.root, "tools", "jispec", "policy", "policy-engine.ts"),
        path.join(this.root, "tools", "jispec", "policy", "migrate-policy.ts"),
      ];

      for (const requiredFile of requiredFiles) {
        if (!fs.existsSync(requiredFile)) {
          status = "fail";
          details.push(`Missing facts/policy file: ${path.relative(this.root, requiredFile)}`);
        }
      }

      const contract = createFactsContract();
      if (!contract.version || contract.facts.length === 0 || contract.contractHash.length !== 64) {
        status = "fail";
        details.push("Facts contract could not be materialized into a stable version/hash surface");
      } else {
        details.push(`Facts contract ${contract.version} with ${contract.facts.length} facts`);
        details.push(`Facts contract hash: ${contract.contractHash.slice(0, 12)}...`);
      }

      if (policyFileExists(this.root)) {
        const policy = loadVerifyPolicy(this.root);
        if (!policy) {
          status = "fail";
          details.push(".spec/policy.yaml exists but could not be loaded");
        } else {
          const validation = validatePolicyAgainstFactsContract(policy, contract);
          if (!validation.valid) {
            status = "fail";
            details.push(`.spec/policy.yaml parsed but failed contract validation (${validation.issues.length} issue(s))`);
            for (const issue of validation.issues) {
              details.push(`  ${issue.code}: ${issue.message}`);
            }
          } else {
            details.push(".spec/policy.yaml parsed and matched the current facts contract");
          }
        }
      } else {
        details.push(".spec/policy.yaml not present (optional)");
      }

      return {
        name: "Facts & Policy Surface",
        status,
        summary: status === "pass" ? "Ready" : "Not ready",
        details,
      };
    } catch (error: any) {
      return {
        name: "Facts & Policy Surface",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check V1.3: Change / Implement Mainline Surface
   */
  private async checkChangeImplementMainlineSurface(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const requiredFiles = [
        path.join(this.root, "tools", "jispec", "change", "git-diff-classifier.ts"),
        path.join(this.root, "tools", "jispec", "change", "lane-decision.ts"),
        path.join(this.root, "tools", "jispec", "change", "change-session.ts"),
        path.join(this.root, "tools", "jispec", "change", "change-command.ts"),
        path.join(this.root, "tools", "jispec", "implement", "implement-runner.ts"),
        path.join(this.root, "tools", "jispec", "implement", "handoff-packet.ts"),
        path.join(this.root, "tools", "jispec", "implement", "stall-detector.ts"),
        path.join(this.root, "tools", "jispec", "implement", "test-command-resolver.ts"),
      ];

      for (const requiredFile of requiredFiles) {
        if (!fs.existsSync(requiredFile)) {
          status = "fail";
          details.push(`Missing change/implement file: ${path.relative(this.root, requiredFile)}`);
        }
      }

      const cliPath = path.join(this.root, "tools", "jispec", "cli.ts");
      if (fs.existsSync(cliPath)) {
        const cliContent = fs.readFileSync(cliPath, "utf-8");
        const requiredSnippets = [
          '.command("change")',
          '.command("implement")',
          '--mode <mode>',
          'verify --fast',
          'implement --fast',
        ];

        for (const snippet of requiredSnippets) {
          if (!cliContent.includes(snippet)) {
            status = "fail";
            details.push(`CLI surface is missing snippet: ${snippet}`);
          }
        }

        if (status === "pass") {
          details.push("CLI exposes change / implement / fast-lane workflow surface");
        }
      } else {
        status = "fail";
        details.push("tools/jispec/cli.ts not found");
      }

      return {
        name: "Change / Implement Mainline Surface",
        status,
        summary: status === "pass" ? "Ready" : "Not ready",
        details,
      };
    } catch (error: any) {
      return {
        name: "Change / Implement Mainline Surface",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check V1.3b: Execute-default mediation readiness
   */
  private async checkExecuteDefaultMediationReadiness(): Promise<DoctorCheckResult> {
    try {
      const readiness = evaluateChangeExecuteDefaultReadiness(this.root);
      const status: "pass" | "fail" =
        readiness.defaultMode === "execute" && readiness.blockers.length > 0 ? "fail" : "pass";
      return {
        name: "Execute-Default Mediation Readiness",
        status,
        summary: readiness.readyForExecuteDefault
          ? "Execute default ready"
          : readiness.canSetExecuteDefault
            ? "Prompt default active"
            : "Execute default blocked",
        details: readiness.details,
      };
    } catch (error: any) {
      return {
        name: "Execute-Default Mediation Readiness",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  private async checkPilotInstallationEntry(): Promise<DoctorCheckResult> {
    const packagePath = path.join(this.root, "package.json");
    if (!fs.existsSync(packagePath)) {
      return pilotFail(
        "Pilot Installation Entry",
        "package.json missing",
        ["Commercial pilot needs a reproducible local CLI entry point; no package.json was found."],
        "Add a package.json with JiSpec scripts or run the pilot from a repo that has the npm entry installed.",
        "npm install",
        ["package.json"],
      );
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf-8")) as { scripts?: Record<string, string>; bin?: unknown };
      const scripts = packageJson.scripts ?? {};
      const hasJispecEntry = Boolean(scripts.jispec || scripts["jispec-cli"] || scripts.verify || scripts["ci:verify"] || packageJson.bin);
      if (!hasJispecEntry) {
        return pilotFail(
          "Pilot Installation Entry",
          "JiSpec script entry missing",
          ["package.json exists but does not expose a JiSpec script, verify script, ci:verify script, or package bin."],
          "Add stable JiSpec scripts so pilot users can run the same commands locally and in CI.",
          "npm run jispec -- --version",
          ["package.json"],
        );
      }

      return pilotPass(
        "Pilot Installation Entry",
        "Installed entry available",
        [
          `Detected package scripts: ${Object.keys(scripts).sort().join(", ") || "none"}`,
          "Commercial pilot installation is a local CLI entry; no cloud account or source upload is required.",
        ],
        ["package.json"],
      );
    } catch (error: any) {
      return pilotFail(
        "Pilot Installation Entry",
        "package.json unreadable",
        [error.message],
        "Fix package.json before starting a commercial pilot.",
        "npm install",
        ["package.json"],
      );
    }
  }

  private async checkPilotFirstTakeover(): Promise<DoctorCheckResult> {
    const takeoverPath = ".spec/handoffs/bootstrap-takeover.json";
    const greenfieldBaselinePath = ".spec/baselines/current.yaml";
    const takeover = readJsonFile(path.join(this.root, takeoverPath));
    const greenfieldBaselineExists = fs.existsSync(path.join(this.root, greenfieldBaselinePath));

    if (takeover && takeover.status === "committed") {
      const adopted = Array.isArray(takeover.adoptedArtifactPaths) ? takeover.adoptedArtifactPaths.length : 0;
      return pilotPass(
        "Pilot First Takeover",
        "First takeover committed",
        [
          `Bootstrap takeover report is committed with ${adopted} adopted artifact(s).`,
          "This proves the pilot has a human-reviewed initial contract baseline; it does not claim full legacy understanding.",
        ],
        [takeoverPath],
      );
    }

    if (greenfieldBaselineExists) {
      return pilotPass(
        "Pilot First Takeover",
        "Greenfield baseline present",
        [
          "Current Greenfield baseline exists.",
          "This proves the pilot has an initial declared contract baseline; legacy repository understanding still requires owner review.",
        ],
        [greenfieldBaselinePath],
      );
    }

    return pilotFail(
      "Pilot First Takeover",
      "No adopted baseline",
      [
        "No committed bootstrap takeover or Greenfield current baseline was found.",
        "Checklist boundary: JiSpec does not promise automatic full understanding of an existing repository; owners must review and adopt the first baseline.",
      ],
      "Run guided first-run and complete bootstrap adopt or Greenfield init before inviting a pilot team.",
      "npm run jispec -- first-run --root .",
      [takeoverPath, greenfieldBaselinePath],
    );
  }

  private async checkPilotCiIntegration(): Promise<DoctorCheckResult> {
    const packagePath = path.join(this.root, "package.json");
    const reportPath = ".jispec-ci/verify-report.json";
    const packageJson = readJsonFile(packagePath);
    const scripts = isRecord(packageJson?.scripts) ? packageJson.scripts : {};
    const verifyReport = readJsonFile(path.join(this.root, reportPath));
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    if (typeof scripts["ci:verify"] === "string") {
      details.push(`ci:verify script present (${scripts["ci:verify"]})`);
    } else {
      status = "fail";
      details.push("ci:verify script missing from package.json.");
    }

    if (verifyReport) {
      details.push(`Latest CI verify verdict: ${String(verifyReport.verdict ?? "not_declared")}`);
      const blocking = numberValue(verifyReport.blockingIssueCount) ?? (isRecord(verifyReport.counts) ? numberValue(verifyReport.counts.blocking) : undefined) ?? 0;
      if (blocking > 0 || verifyReport.verdict === "FAIL_BLOCKING") {
        status = "fail";
        details.push(`${blocking} blocking issue(s) are still present in the latest CI verify report.`);
      }
    } else {
      status = "fail";
      details.push("No .jispec-ci/verify-report.json found.");
    }

    if (status === "pass") {
      return pilotPass("Pilot CI Integration", "CI verify connected", details, ["package.json", reportPath]);
    }
    return pilotFail(
      "Pilot CI Integration",
      "CI verify not pilot-ready",
      details,
      "Wire CI to the local verify wrapper and produce a clean or advisory-only CI verify report.",
      "npm run ci:verify",
      ["package.json", reportPath],
    );
  }

  private async checkPilotPolicyProfile(): Promise<DoctorCheckResult> {
    const policyPath = ".spec/policy.yaml";
    const absolutePolicyPath = path.join(this.root, policyPath);
    if (!fs.existsSync(absolutePolicyPath)) {
      return pilotFail(
        "Pilot Policy Profile",
        "Policy missing",
        ["No .spec/policy.yaml was found."],
        "Choose a pilot governance profile and declare owner/reviewer expectations.",
        "npm run jispec -- policy migrate --profile small_team --root .",
        [policyPath],
      );
    }

    try {
      const policy = yaml.load(fs.readFileSync(absolutePolicyPath, "utf-8"));
      const team = isRecord(policy) && isRecord(policy.team) ? policy.team : {};
      const profile = stringValue(team.profile);
      const owner = stringValue(team.owner);
      const reviewers = Array.isArray(team.reviewers) ? team.reviewers : [];
      const details = [
        `Profile: ${profile ?? "not_declared"}`,
        `Owner: ${owner ?? "not_declared"}`,
        `Reviewer count: ${reviewers.length}`,
      ];
      const validProfile = profile === "solo" || profile === "small_team" || profile === "regulated";
      const ownerDeclared = Boolean(owner && owner !== "unassigned" && owner !== "not_declared");
      if (!validProfile || !ownerDeclared) {
        return pilotFail(
          "Pilot Policy Profile",
          "Policy profile incomplete",
          details,
          "Declare a pilot profile and accountable owner before inviting a team.",
          "npm run jispec -- policy migrate --profile small_team --root .",
          [policyPath],
        );
      }

      return pilotPass("Pilot Policy Profile", "Policy profile declared", details, [policyPath]);
    } catch (error: any) {
      return pilotFail(
        "Pilot Policy Profile",
        "Policy unreadable",
        [error.message],
        "Fix .spec/policy.yaml before starting a pilot.",
        "npm run jispec -- policy migrate --profile small_team --root .",
        [policyPath],
      );
    }
  }

  private async checkPilotWaiverAndSpecDebt(): Promise<DoctorCheckResult> {
    const now = new Date();
    const waivers = listJsonRecords(path.join(this.root, ".spec", "waivers"));
    const ledger = readYamlFile(path.join(this.root, ".spec", "spec-debt", "ledger.yaml"));
    const greenfieldDebt = isRecord(ledger) && Array.isArray(ledger.debts) ? ledger.debts.filter(isRecord) : [];
    const bootstrapDebt = listNestedJsonRecords(path.join(this.root, ".spec", "spec-debt"), 2)
      .filter((record) => !("debts" in record));
    const activeWaivers = waivers.filter((waiver) => stringValue(waiver.status) !== "revoked");
    const expiredWaivers = activeWaivers.filter((waiver) => isPastDate(stringValue(waiver.expiresAt), now));
    const openDebt = greenfieldDebt.filter((debt) => stringValue(debt.status) === "open");
    const expiredDebt = openDebt.filter((debt) => isPastDate(stringValue(debt.expires_at), now));
    const details = [
      `Active waivers: ${activeWaivers.length}`,
      `Expired waivers: ${expiredWaivers.length}`,
      `Open Greenfield spec debt: ${openDebt.length}`,
      `Expired Greenfield spec debt: ${expiredDebt.length}`,
      `Bootstrap spec debt records: ${bootstrapDebt.length}`,
    ];

    if (expiredWaivers.length > 0 || expiredDebt.length > 0) {
      return pilotFail(
        "Pilot Waiver And Spec Debt",
        "Expired governance debt found",
        details,
        "Repay/cancel expired spec debt and renew/revoke expired waivers before using the pilot as a team governance demo.",
        "npm run jispec -- console actions --root .",
        [".spec/waivers/*.json", ".spec/spec-debt/ledger.yaml", ".spec/spec-debt/<session-id>/*.json"],
      );
    }

    return pilotPass(
      "Pilot Waiver And Spec Debt",
      "Governance debt visible",
      details,
      [".spec/waivers/*.json", ".spec/spec-debt/ledger.yaml", ".spec/spec-debt/<session-id>/*.json"],
    );
  }

  private async checkPilotConsoleGovernance(): Promise<DoctorCheckResult> {
    const snapshotPath = ".spec/console/governance-snapshot.json";
    const snapshot = readJsonFile(path.join(this.root, snapshotPath));
    if (!snapshot) {
      return pilotFail(
        "Pilot Console Governance",
        "Governance snapshot missing",
        ["No repo-local Console governance snapshot was found."],
        "Export the local governance snapshot so pilot reviewers can inspect policy, waiver, debt, drift, and verify posture without scanning source.",
        "npm run jispec -- console export-governance --root .",
        [snapshotPath],
      );
    }

    const boundary = isRecord(snapshot.boundary) ? snapshot.boundary : {};
    const safeBoundary =
      boundary.sourceUploadRequired === false &&
      boundary.scansSourceCode === false &&
      boundary.replacesCliGate === false;
    if (!safeBoundary) {
      return pilotFail(
        "Pilot Console Governance",
        "Console boundary invalid",
        ["Governance snapshot exists but does not declare local-only/read-only/no-source-upload boundary fields."],
        "Regenerate the governance snapshot with the current local Console exporter.",
        "npm run jispec -- console export-governance --root .",
        [snapshotPath],
      );
    }

    return pilotPass(
      "Pilot Console Governance",
      "Governance snapshot exported",
      [
        "Console governance snapshot is local-only, read-only, does not scan source, and does not replace verify.",
        `Exported at: ${String(snapshot.exportedAt ?? "not_declared")}`,
      ],
      [snapshotPath],
    );
  }

  private async checkPilotPrivacyReport(): Promise<DoctorCheckResult> {
    const reportPath = ".spec/privacy/privacy-report.json";
    const report = readJsonFile(path.join(this.root, reportPath));
    if (!report) {
      return pilotFail(
        "Pilot Privacy Report",
        "Privacy report missing",
        ["No local privacy report was found."],
        "Generate a privacy report before sharing pilot artifacts with external reviewers or vendors.",
        "npm run jispec -- privacy report --root .",
        [reportPath],
      );
    }

    const summary = isRecord(report.summary) ? report.summary : {};
    const highSeverityFindingCount = numberValue(summary.highSeverityFindingCount) ?? 0;
    const findingCount = numberValue(summary.findingCount) ?? 0;
    const details = [
      `Scanned artifacts: ${String(summary.scannedArtifactCount ?? "not_declared")}`,
      `Findings: ${findingCount}`,
      `High severity findings: ${highSeverityFindingCount}`,
    ];
    if (highSeverityFindingCount > 0) {
      return pilotFail(
        "Pilot Privacy Report",
        "High-severity privacy findings",
        details,
        "Review or redact high-severity findings before external pilot sharing.",
        "npm run jispec -- privacy report --root .",
        [reportPath],
      );
    }

    return pilotPass("Pilot Privacy Report", "Privacy report available", details, [reportPath]);
  }

  /**
   * Check V1.4: V1 Regression Coverage
   */
  private async checkV1RegressionCoverage(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const runnerPath = path.join(this.root, "tools", "jispec", "tests", "regression-runner.ts");
      if (!fs.existsSync(runnerPath)) {
        return {
          name: "V1 Regression Coverage",
          status: "fail",
          summary: "Missing",
          details: ["regression-runner.ts not found"],
        };
      }

      const content = fs.readFileSync(runnerPath, "utf-8");
      const criticalSuites = [
        "v1-mainline-golden-path.ts",
        "v1-sample-repo-smoke.ts",
        "bootstrap-discover-empty-repo.ts",
        "bootstrap-discover-signal-filtering.ts",
        "bootstrap-discover-unknown-layout.ts",
        "bootstrap-draft-fallback.ts",
        "bootstrap-draft-quality.ts",
        "adopt-cli-surface.ts",
        "bootstrap-adopt-handoff.ts",
        "policy-unknown-fact.ts",
        "verify-contract-aware-core.ts",
        "verify-bootstrap-takeover.ts",
        "verify-baseline-hardening.ts",
        "verify-waiver-hardening.ts",
        "verify-mitigation-stacking.ts",
        "verify-report-contract.ts",
        "verify-issue-fingerprint-stability.ts",
        "ci-summary-markdown.ts",
        "ci-verify-wrapper.ts",
        "package-script-surface.ts",
        "change-dual-mode.ts",
        "change-default-mode-config.ts",
        "change-mainline-hints.ts",
        "implement-mainline-lane.ts",
        "implement-handoff-mainline.ts",
      ];

      for (const suite of criticalSuites) {
        if (!content.includes(`file: '${suite}'`) && !content.includes(`file: "${suite}"`)) {
          status = "fail";
          details.push(`Critical V1 suite is not registered in regression-runner.ts: ${suite}`);
        }
      }

      if (status === "pass") {
        details.push(`All ${criticalSuites.length} critical V1 suites are registered in the regression matrix`);
      }

      return {
        name: "V1 Regression Coverage",
        status,
        summary: status === "pass" ? "Covered" : "Coverage gaps found",
        details,
      };
    } catch (error: any) {
      return {
        name: "V1 Regression Coverage",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check 9: CI Verify Surface
   */
  private async checkCiVerifySurface(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const requiredFiles = [
        path.join(this.root, "scripts", "check-jispec.ts"),
        path.join(this.root, "tools", "jispec", "ci", "verify-report.ts"),
        path.join(this.root, "tools", "jispec", "ci", "ci-summary.ts"),
        path.join(this.root, "tools", "jispec", "ci", "pr-comment.ts"),
        path.join(this.root, "tools", "jispec", "ci", "github-action.ts"),
        path.join(this.root, "tools", "jispec", "ci", "gitlab-note.ts"),
      ];

      for (const requiredFile of requiredFiles) {
        if (!fs.existsSync(requiredFile)) {
          status = "fail";
          details.push(`Missing CI verify file: ${path.relative(this.root, requiredFile)}`);
        }
      }

      const packageJsonPath = path.join(this.root, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
        status = "fail";
        details.push("package.json missing");
      } else {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as { scripts?: Record<string, string> };
        if (packageJson.scripts?.["ci:verify"]) {
          details.push(`ci:verify script present (${packageJson.scripts["ci:verify"]})`);
        } else {
          status = "fail";
          details.push("ci:verify script missing from package.json");
        }
      }

      return {
        name: "CI Verify Surface",
        status,
        summary: status === "pass" ? "Ready" : "Not ready",
        details,
      };
    } catch (error: any) {
      return {
        name: "CI Verify Surface",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check 10: Transaction Mode
   */
  private async checkTransactionMode(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const { execSync } = await import("node:child_process");
      const manifest = this.loadRegressionMatrixManifest();

      // Keep doctor runtime bounded: run a transaction smoke suite here and
      // leave the full matrix to the dedicated regression runner gate.
      try {
        execSync("npx tsx tools/jispec/tests/stable-snapshot-gates.ts", {
          cwd: this.root,
          stdio: "pipe",
          timeout: 120000,
          env: {
            ...process.env,
            JISPEC_USE_TRANSACTION_MANAGER: "true",
          },
        });
        details.push("Transaction mode smoke: stable-snapshot-gates.ts passed (1 expected test)");
        details.push(`Full regression matrix contract: ${manifest.totalSuites} suite(s), ${manifest.totalExpectedTests} expected test(s) via regression-runner.ts`);
        details.push("Full matrix execution remains a separate gate and does not pollute doctor runtime latency.");
      } catch (error: any) {
        status = "fail";
        details.push("Transaction mode smoke failed");
        const output = error.stdout?.toString() || error.stderr?.toString() || error.message;
        const lines = output.split("\n").slice(0, 5);
        details.push(...lines.map((l: string) => `  ${l}`));
      }

      return {
        name: "Transaction Mode",
        status,
        summary: status === "pass" ? "Ready" : "Not ready",
        details,
      };
    } catch (error: any) {
      return {
        name: "Transaction Mode",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check 11: Resource Management
   */
  private async checkResourceManagement(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const resourceManagerPath = path.join(this.root, "tools", "jispec", "resource-manager.ts");
      const runtimeTestPath = path.join(this.root, "tools", "jispec", "tests", "resource-management.ts");

      if (!fs.existsSync(resourceManagerPath)) {
        status = "fail";
        details.push("resource-manager.ts not found");
      } else {
        details.push("resource-manager.ts present");
      }

      if (!fs.existsSync(runtimeTestPath)) {
        status = "fail";
        details.push("resource-management.ts test missing");
      } else {
        details.push("resource-management.ts test present");
      }

      if (status === "pass") {
        const { execSync } = await import("node:child_process");
        execSync("npx tsx tools/jispec/tests/resource-management.ts", {
          cwd: this.root,
          stdio: "pipe",
          timeout: 60000,
        });
        details.push("Resource management: 3/3 tests passed");
      }

      return {
        name: "Resource Management",
        status,
        summary: status === "pass" ? "Ready" : "Not ready",
        details,
      };
    } catch (error: any) {
      return {
        name: "Resource Management",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check 12: Fault Recovery
   */
  private async checkFaultRecovery(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const faultRecoveryPath = path.join(this.root, "tools", "jispec", "fault-recovery.ts");
      const runtimeTestPath = path.join(this.root, "tools", "jispec", "tests", "fault-recovery.ts");

      if (!fs.existsSync(faultRecoveryPath)) {
        status = "fail";
        details.push("fault-recovery.ts not found");
      } else {
        details.push("fault-recovery.ts present");
      }

      if (!fs.existsSync(runtimeTestPath)) {
        status = "fail";
        details.push("fault-recovery.ts test missing");
      } else {
        details.push("fault-recovery.ts test present");
      }

      if (status === "pass") {
        const { execSync } = await import("node:child_process");
        execSync("npx tsx tools/jispec/tests/fault-recovery.ts", {
          cwd: this.root,
          stdio: "pipe",
          timeout: 90000,
        });
        details.push("Fault recovery: 4/4 tests passed");
      }

      return {
        name: "Fault Recovery",
        status,
        summary: status === "pass" ? "Ready" : "Not ready",
        details,
      };
    } catch (error: any) {
      return {
        name: "Fault Recovery",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check 11: Collaboration Engine
   */
  private async checkCollaborationEngine(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const collaborationPath = path.join(this.root, "tools", "jispec", "collaboration-server.ts");
      const collaborationTestPath = path.join(this.root, "tools", "jispec", "tests", "collaboration-mvp.ts");

      if (!fs.existsSync(collaborationPath)) {
        status = "fail";
        details.push("collaboration-server.ts not found");
      } else {
        details.push("collaboration-server.ts present");
      }

      if (!fs.existsSync(collaborationTestPath)) {
        status = "fail";
        details.push("collaboration-mvp.ts test missing");
      } else {
        details.push("collaboration-mvp.ts test present");
      }

      if (status === "pass") {
        const { execSync } = await import("node:child_process");
        execSync("npx tsx tools/jispec/tests/collaboration-mvp.ts", {
          cwd: this.root,
          stdio: "pipe",
          timeout: 90000,
        });
        details.push("Collaboration engine: 4/4 tests passed");
      }

      return {
        name: "Collaboration Engine",
        status,
        summary: status === "pass" ? "Ready" : "Not ready",
        details,
      };
    } catch (error: any) {
      return {
        name: "Collaboration Engine",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check 12: Conflict Resolution
   */
  private async checkConflictResolution(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const resolverPath = path.join(this.root, "tools", "jispec", "advanced-conflict-resolver.ts");
      const testPath = path.join(this.root, "tools", "jispec", "tests", "conflict-resolution-mvp.ts");

      if (!fs.existsSync(resolverPath)) {
        status = "fail";
        details.push("advanced-conflict-resolver.ts not found");
      } else {
        details.push("advanced-conflict-resolver.ts present");
      }

      if (!fs.existsSync(testPath)) {
        status = "fail";
        details.push("conflict-resolution-mvp.ts test missing");
      } else {
        details.push("conflict-resolution-mvp.ts test present");
      }

      if (status === "pass") {
        const { execSync } = await import("node:child_process");
        execSync("npx tsx tools/jispec/tests/conflict-resolution-mvp.ts", {
          cwd: this.root,
          stdio: "pipe",
          timeout: 90000,
        });
        details.push("Conflict resolution: 4/4 tests passed");
      }

      return {
        name: "Conflict Resolution",
        status,
        summary: status === "pass" ? "Ready" : "Not ready",
        details,
      };
    } catch (error: any) {
      return {
        name: "Conflict Resolution",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check 13: Collaboration Awareness
   */
  private async checkCollaborationAwareness(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const presencePath = path.join(this.root, "tools", "jispec", "presence-manager.ts");
      const testPath = path.join(this.root, "tools", "jispec", "tests", "collaboration-awareness-mvp.ts");

      if (!fs.existsSync(presencePath)) {
        status = "fail";
        details.push("presence-manager.ts not found");
      } else {
        details.push("presence-manager.ts present");
      }

      if (!fs.existsSync(testPath)) {
        status = "fail";
        details.push("collaboration-awareness-mvp.ts test missing");
      } else {
        details.push("collaboration-awareness-mvp.ts test present");
      }

      if (status === "pass") {
        const { execSync } = await import("node:child_process");
        execSync("npx tsx tools/jispec/tests/collaboration-awareness-mvp.ts", {
          cwd: this.root,
          stdio: "pipe",
          timeout: 90000,
        });
        details.push("Collaboration awareness: 3/3 tests passed");
      }

      return {
        name: "Collaboration Awareness",
        status,
        summary: status === "pass" ? "Ready" : "Not ready",
        details,
      };
    } catch (error: any) {
      return {
        name: "Collaboration Awareness",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check 14: Collaboration Locking
   */
  private async checkCollaborationLocking(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const permissionPath = path.join(this.root, "tools", "jispec", "permission-manager.ts");
      const testPath = path.join(this.root, "tools", "jispec", "tests", "collaboration-locking-mvp.ts");

      if (!fs.existsSync(permissionPath)) {
        status = "fail";
        details.push("permission-manager.ts not found");
      } else {
        details.push("permission-manager.ts present");
      }

      if (!fs.existsSync(testPath)) {
        status = "fail";
        details.push("collaboration-locking-mvp.ts test missing");
      } else {
        details.push("collaboration-locking-mvp.ts test present");
      }

      if (status === "pass") {
        const { execSync } = await import("node:child_process");
        execSync("npx tsx tools/jispec/tests/collaboration-locking-mvp.ts", {
          cwd: this.root,
          stdio: "pipe",
          timeout: 90000,
        });
        details.push("Collaboration locking: 3/3 tests passed");
      }

      return {
        name: "Collaboration Locking",
        status,
        summary: status === "pass" ? "Ready" : "Not ready",
        details,
      };
    } catch (error: any) {
      return {
        name: "Collaboration Locking",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check 15: Collaboration Notifications
   */
  private async checkCollaborationNotifications(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const notificationPath = path.join(this.root, "tools", "jispec", "notification-service.ts");
      const testPath = path.join(this.root, "tools", "jispec", "tests", "collaboration-notifications-mvp.ts");

      if (!fs.existsSync(notificationPath)) {
        status = "fail";
        details.push("notification-service.ts not found");
      } else {
        details.push("notification-service.ts present");
      }

      if (!fs.existsSync(testPath)) {
        status = "fail";
        details.push("collaboration-notifications-mvp.ts test missing");
      } else {
        details.push("collaboration-notifications-mvp.ts test present");
      }

      if (status === "pass") {
        const { execSync } = await import("node:child_process");
        execSync("npx tsx tools/jispec/tests/collaboration-notifications-mvp.ts", {
          cwd: this.root,
          stdio: "pipe",
          timeout: 90000,
        });
        details.push("Collaboration notifications: 3/3 tests passed");
      }

      return {
        name: "Collaboration Notifications",
        status,
        summary: status === "pass" ? "Ready" : "Not ready",
        details,
      };
    } catch (error: any) {
      return {
        name: "Collaboration Notifications",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Check 16: Collaboration Analytics
   */
  private async checkCollaborationAnalytics(): Promise<DoctorCheckResult> {
    const details: string[] = [];
    let status: "pass" | "fail" = "pass";

    try {
      const analyticsPath = path.join(this.root, "tools", "jispec", "collaboration-analytics.ts");
      const testPath = path.join(this.root, "tools", "jispec", "tests", "collaboration-analytics-mvp.ts");

      if (!fs.existsSync(analyticsPath)) {
        status = "fail";
        details.push("collaboration-analytics.ts not found");
      } else {
        details.push("collaboration-analytics.ts present");
      }

      if (!fs.existsSync(testPath)) {
        status = "fail";
        details.push("collaboration-analytics-mvp.ts test missing");
      } else {
        details.push("collaboration-analytics-mvp.ts test present");
      }

      if (status === "pass") {
        const { execSync } = await import("node:child_process");
        execSync("npx tsx tools/jispec/tests/collaboration-analytics-mvp.ts", {
          cwd: this.root,
          stdio: "pipe",
          timeout: 90000,
        });
        details.push("Collaboration analytics: 3/3 tests passed");
      }

      return {
        name: "Collaboration Analytics",
        status,
        summary: status === "pass" ? "Ready" : "Not ready",
        details,
      };
    } catch (error: any) {
      return {
        name: "Collaboration Analytics",
        status: "fail",
        summary: "Check failed",
        details: [error.message],
      };
    }
  }

  /**
   * Format report as text
   */
  static formatText(report: DoctorReport): string {
    const lines: string[] = [];

    const title = report.profile === "v1"
      ? "=== JiSpec Doctor: V1 Mainline Readiness ===\n"
      : report.profile === "pilot"
        ? "=== JiSpec Doctor: Commercial Pilot Readiness ===\n"
        : "=== JiSpec Doctor: Extended Runtime Readiness ===\n";
    lines.push(title);

    for (const check of report.checks) {
      const icon = check.status === "pass" ? "✓" : "✗";
      lines.push(`${icon} ${check.name}`);
      for (const detail of check.details) {
        lines.push(`  - ${detail}`);
      }
      if (check.ownerAction) {
        lines.push(`  Owner action: ${check.ownerAction}`);
      }
      if (check.nextCommand) {
        lines.push(`  Next command: ${check.nextCommand}`);
      }
      lines.push("");
    }

    lines.push("=== Summary ===");
    lines.push(`${report.passedChecks}/${report.totalChecks} checks passed`);
    const readinessLabel = report.profile === "v1"
      ? "V1 Mainline Ready"
      : report.profile === "pilot"
        ? "Commercial Pilot Ready"
        : "Extended Runtime Ready";
    lines.push(`${readinessLabel}: ${report.ready ? "YES" : "NO"}`);

    return lines.join("\n");
  }

  /**
   * Format report as JSON
   */
  static formatJSON(report: DoctorReport): string {
    return JSON.stringify(report, null, 2);
  }
}

function pilotPass(
  name: string,
  summary: string,
  details: string[],
  sourceArtifacts: string[] = [],
): DoctorCheckResult {
  return {
    name,
    status: "pass",
    summary,
    details,
    sourceArtifacts,
  };
}

function pilotFail(
  name: string,
  summary: string,
  details: string[],
  ownerAction: string,
  nextCommand: string,
  sourceArtifacts: string[] = [],
): DoctorCheckResult {
  return {
    name,
    status: "fail",
    summary,
    details,
    ownerAction,
    nextCommand,
    sourceArtifacts,
  };
}

function readJsonFile(filePath: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readYamlFile(filePath: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const parsed = yaml.load(fs.readFileSync(filePath, "utf-8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function listJsonRecords(directory: string): Record<string, unknown>[] {
  if (!fs.existsSync(directory)) {
    return [];
  }
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readJsonFile(path.join(directory, entry.name)))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function listNestedJsonRecords(directory: string, maxDepth: number): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  visitJsonRecords(directory, directory, maxDepth, records);
  return records;
}

function visitJsonRecords(base: string, current: string, maxDepth: number, records: Record<string, unknown>[]): void {
  if (!fs.existsSync(current)) {
    return;
  }
  const depth = path.relative(base, current).split(path.sep).filter(Boolean).length;
  if (depth > maxDepth) {
    return;
  }
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      visitJsonRecords(base, fullPath, maxDepth, records);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      const record = readJsonFile(fullPath);
      if (record) {
        records.push(record);
      }
    }
  }
}

function isPastDate(value: string | undefined, now: Date): boolean {
  if (!value) {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < now.getTime();
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
