import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runVerify } from "../verify/verify-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface DemoJson {
  root?: string;
  initStatus?: string;
  verifyVerdict?: string;
  verifyOk?: boolean;
  firstSliceId?: string;
  acceptanceSummaryPath?: string;
  nextCommands?: string[];
  generatedAssets?: {
    project?: string;
    policy?: string;
    ciWorkflow?: string;
    baseline?: string;
  };
  writtenFileCount?: number;
  verifyIssueCount?: number;
}

async function main(): Promise<void> {
  console.log("=== Greenfield Empty Directory Acceptance Demo Tests ===\n");

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-empty-demo-"));
  const targetRoot = path.join(parent, "greenfield-empty-project");
  const results: TestResult[] = [];

  try {
    const demoOutput = runDemo(repoRoot, targetRoot);
    const parsed = JSON.parse(demoOutput.stdout) as DemoJson;
    const summaryPath = path.join(targetRoot, ".spec", "greenfield", "initialization-summary.md");
    const summary = fs.readFileSync(summaryPath, "utf-8");

    results.push(record("demo starts from an empty target and exits with verify pass", () => {
      assert.equal(demoOutput.status, 0);
      assert.equal(parsed.initStatus, "input_contract_ready");
      assert.equal(parsed.verifyVerdict, "PASS");
      assert.equal(parsed.verifyOk, true);
      assert.equal(parsed.verifyIssueCount, 0);
      assert.ok((parsed.writtenFileCount ?? 0) > 20);
    }));

    results.push(record("demo creates the expected Greenfield asset spine", () => {
      assert.equal(parsed.generatedAssets?.project, "jiproject/project.yaml");
      assert.equal(parsed.generatedAssets?.policy, ".spec/policy.yaml");
      assert.equal(parsed.generatedAssets?.ciWorkflow, ".github/workflows/jispec-verify.yml");
      assert.equal(parsed.generatedAssets?.baseline, ".spec/baselines/current.yaml");
      assert.ok(fs.existsSync(path.join(targetRoot, "jiproject", "project.yaml")));
      assert.ok(fs.existsSync(path.join(targetRoot, ".spec", "policy.yaml")));
      assert.ok(fs.existsSync(path.join(targetRoot, ".github", "workflows", "jispec-verify.yml")));
      assert.ok(fs.existsSync(path.join(targetRoot, "schemas", "trace.schema.json")));
      assert.ok(fs.existsSync(path.join(targetRoot, "agents", "pipeline.yaml")));
    }));

    results.push(record("acceptance summary explains assumptions, open decisions, first slice, and next commands", () => {
      assert.equal(parsed.acceptanceSummaryPath, ".spec/greenfield/initialization-summary.md");
      assert.match(summary, /## Assumptions/);
      assert.match(summary, /## Behavior Open Decisions/);
      assert.match(summary, /## First Slice/);
      assert.match(summary, /## Verify Gate/);
      assert.match(summary, /## Next Commands/);
      assert.match(summary, /jispec-cli verify --root \. --policy \.spec\/policy\.yaml/);
    }));

    results.push(record("demo reports a first implementation slice backed by generated files", () => {
      assert.equal(parsed.firstSliceId, "catalog-product-availability-v1");
      assert.ok(fs.existsSync(path.join(targetRoot, "contexts", "catalog", "slices", "catalog-product-availability-v1", "slice.yaml")));
      assert.ok(fs.existsSync(path.join(targetRoot, "contexts", "ordering", "slices", "ordering-checkout-v1", "slice.yaml")));
      assert.ok(parsed.nextCommands?.some((command) => command.includes("jispec-cli change")));
    }));

    const verifyResult = await runVerify({
      root: targetRoot,
      policyPath: ".spec/policy.yaml",
      useBaseline: true,
      generatedAt: "2026-04-29T00:00:00.000Z",
    });
    results.push(record("generated empty-directory project remains independently verifiable", () => {
      assert.equal(verifyResult.verdict, "PASS");
      assert.equal(verifyResult.issueCount, 0);
      assert.equal(verifyResult.metadata?.policyPath, ".spec/policy.yaml");
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "greenfield empty directory acceptance demo execution",
      passed: false,
      error: message,
    });
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
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

function runDemo(repoRoot: string, targetRoot: string): { status: number | null; stdout: string; stderr: string } {
  assert.equal(fs.existsSync(targetRoot), false);
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      path.join(repoRoot, "scripts", "run-greenfield-empty-directory-demo.ts"),
      "--root",
      targetRoot,
      "--json",
    ],
    {
      cwd: repoRoot,
      encoding: "utf-8",
    },
  );

  if (result.status !== 0) {
    throw new Error(`Demo exited with ${result.status}. stdout=${result.stdout} stderr=${result.stderr}`);
  }

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function record(name: string, run: () => void): TestResult {
  try {
    run();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

void main();
