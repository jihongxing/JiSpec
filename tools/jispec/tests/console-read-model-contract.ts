import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CONSOLE_READ_MODEL_ARTIFACTS,
  getConsoleMachineReadableArtifacts,
  getConsoleReadModelContract,
} from "../console/read-model-contract";

async function main(): Promise<void> {
  console.log("=== Console Read Model Contract Tests ===\n");

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
  const docPath = path.join(repoRoot, "docs", "console-read-model-contract.md");
  const stableContractPath = path.join(repoRoot, "docs", "v1-mainline-stable-contract.md");
  const planPath = path.join(repoRoot, "docs", "post-v1-north-star-plan.md");
  const readmePath = path.join(repoRoot, "README.md");
  const zhReadmePath = path.join(repoRoot, "README.zh-CN.md");
  const doc = fs.readFileSync(docPath, "utf-8");
  const stableContract = fs.readFileSync(stableContractPath, "utf-8");
  const plan = fs.readFileSync(planPath, "utf-8");
  const readme = fs.readFileSync(readmePath, "utf-8");
  const zhReadme = fs.readFileSync(zhReadmePath, "utf-8");

  record("contract keeps Console read-only and local-artifact based", () => {
    const contract = getConsoleReadModelContract();
    assert.equal(contract.version, 1);
    assert.equal(contract.boundary.readOnly, true);
    assert.equal(contract.boundary.replacesCliGate, false);
    assert.equal(contract.boundary.sourceUploadRequired, false);
    assert.equal(contract.boundary.localArtifactsAreSourceOfTruth, true);
  });

  record("contract includes required machine-readable read model artifacts", () => {
    const machinePaths = getConsoleMachineReadableArtifacts().map((artifact) => artifact.pathPattern);
    for (const expected of [
      ".jispec-ci/verify-report.json",
      ".spec/policy.yaml",
      ".spec/waivers/*.json",
      ".spec/baselines/verify-baseline.json",
      ".spec/baselines/current.yaml",
      ".spec/spec-debt/ledger.yaml",
      ".spec/spec-debt/<session-id>/*.json",
      ".spec/baselines/releases/<version>.yaml",
      ".spec/releases/compare/<from>-to-<to>/compare-report.json",
    ]) {
      assert.ok(machinePaths.includes(expected), `Missing ${expected}`);
    }
  });

  record("Markdown artifacts are display-only companions, not machine APIs", () => {
    const markdownArtifacts = CONSOLE_READ_MODEL_ARTIFACTS.filter((artifact) => artifact.format === "markdown");
    assert.ok(markdownArtifacts.length >= 3);
    for (const artifact of markdownArtifacts) {
      assert.equal(artifact.machineReadable, false, artifact.id);
      assert.equal(artifact.parseMarkdown, false, artifact.id);
      assert.equal(artifact.sourceUploadRequired, false, artifact.id);
    }
  });

  record("docs and README expose the Console read model boundary", () => {
    for (const artifact of CONSOLE_READ_MODEL_ARTIFACTS) {
      assert.ok(doc.includes(artifact.pathPattern), `Doc missing ${artifact.pathPattern}`);
    }
    assert.ok(doc.includes("must not replace `verify`, `ci:verify`, policy evaluation, release compare, or any CLI gate"));
    assert.ok(doc.includes("must not require source upload"));
    assert.ok(stableContract.includes("Console Read Model Contract"));
    assert.ok(stableContract.includes("docs/console-read-model-contract.md"));
    assert.ok(plan.includes("状态：已实现"));
    assert.ok(plan.includes("console-read-model-contract.ts"));
    assert.ok(readme.includes("Console read model contract"));
    assert.ok(zhReadme.includes("Console read model contract"));
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
