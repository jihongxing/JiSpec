import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { TEST_SUITES, buildRegressionMatrixManifest } from "./regression-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== P9 Baseline Contract Tests ===\n");

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const results: TestResult[] = [];

  results.push(record("stable contract documents P9 impact source-of-truth paths", () => {
    const doc = readDoc(repoRoot, "docs/v1-mainline-stable-contract.md");
    assert.match(doc, /\.spec\/deltas\/<changeId>\/impact-graph\.json/);
    assert.match(doc, /\.spec\/deltas\/<changeId>\/impact-report\.md/);
    assert.match(doc, /\.spec\/deltas\/<changeId>\/verify-focus\.yaml/);
    assert.match(doc, /Markdown companion/i);
    assert.match(doc, /not a machine API/i);
  }));

  results.push(record("console read model documents multi-repo source of truth", () => {
    const doc = readDoc(repoRoot, "docs/console-read-model-contract.md");
    assert.match(doc, /\.spec\/console\/multi-repo-governance\.json/);
    assert.match(doc, /source of truth/i);
    assert.match(doc, /\.spec\/console\/multi-repo-governance\.md/);
    assert.match(doc, /human-readable companion/i);
  }));

  results.push(record("upgrade plan keeps GitNexus and Graphify as references, not runtime dependencies", () => {
    const doc = readDoc(repoRoot, "docs/gitnexus-graphify-capability-upgrade-plan.md");
    assert.match(doc, /GitNexus \/ Graphify 是参考来源/);
    assert.match(doc, /不是运行时依赖/);
    assert.match(doc, /import-only/);
    assert.match(doc, /run-external-tool/);
  }));

  results.push(record("spec-delta implementation keeps existing P9 artifact names stable", () => {
    const source = readDoc(repoRoot, "tools/jispec/change/spec-delta.ts");
    assert.match(source, /impact-graph\.json/);
    assert.match(source, /impact-report\.md/);
    assert.match(source, /verify-focus\.yaml/);
    assert.match(source, /ai-implement-handoff\.md/);
    assert.match(source, /adoption-record\.yaml/);
  }));

  results.push(record("regression matrix registers the P9 baseline suite in runtime-extended", () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "p9-baseline-contract.ts");
    assert.ok(suite);
    assert.equal(suite.area, "runtime-extended");
    assert.equal(suite.expectedTests, 5);
    assert.equal(suite.task, "P9-T1");

    const manifest = buildRegressionMatrixManifest();
    assert.equal(manifest.totalSuites, 125);
    assert.equal(manifest.totalExpectedTests, 544);
    const runtime = manifest.areas.find((area) => area.area === "runtime-extended");
    assert.equal(runtime?.suiteCount, 40);
    assert.equal(runtime?.expectedTests, 169);
  }));

  printResults(results);
}

function readDoc(repoRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
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
      console.log(`  Error: ${result.error ?? "unknown error"}`);
      failed++;
    }
  }

  console.log(`\n${passed}/${results.length} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
