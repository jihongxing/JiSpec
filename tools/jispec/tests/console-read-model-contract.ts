import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CONSOLE_READ_MODEL_ARTIFACTS,
  getConsoleMachineReadableArtifacts,
  getConsoleReadModelContract,
} from "../console/read-model-contract";
import { collectConsoleLocalSnapshot } from "../console/read-model-snapshot";

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

  record("local snapshot represents missing artifacts as not_available_yet", () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-snapshot-missing-"));
    try {
      const snapshot = collectConsoleLocalSnapshot(fixtureRoot);
      assert.equal(snapshot.boundary.readOnly, true);
      assert.equal(snapshot.boundary.readsOnlyDeclaredJiSpecArtifacts, true);
      assert.equal(snapshot.boundary.evaluatesPolicy, false);
      assert.equal(snapshot.boundary.overridesVerify, false);
      assert.equal(snapshot.boundary.synthesizesGateResults, false);
      assert.equal(snapshot.boundary.markdownIsMachineApi, false);
      assert.equal(snapshot.summary.totalArtifacts, CONSOLE_READ_MODEL_ARTIFACTS.length);
      assert.equal(snapshot.summary.missingArtifacts, CONSOLE_READ_MODEL_ARTIFACTS.length);
      assert.ok(snapshot.artifacts.every((artifact) => artifact.status === "not_available_yet"));
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  record("local snapshot reads only declared JiSpec artifacts", () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-snapshot-artifacts-"));
    try {
      writeText(fixtureRoot, "src/app.ts", "export const sourceCode = true;\n");
      writeText(fixtureRoot, ".jispec-ci/verify-report.json", JSON.stringify({ verdict: "PASS", issueCount: 0 }, null, 2));
      writeText(fixtureRoot, ".jispec-ci/verify-summary.md", "# CI Verify Summary\n\nPASS\n");
      writeText(fixtureRoot, ".spec/handoffs/verify-summary.md", "# Local Verify Summary\n\nPASS\n");
      writeText(fixtureRoot, ".spec/policy.yaml", "version: 1\nrules: []\n");
      writeText(fixtureRoot, ".spec/waivers/waiver-1.json", JSON.stringify({ id: "waiver-1", status: "active" }, null, 2));
      writeText(fixtureRoot, ".spec/spec-debt/bootstrap-takeover/feature.json", JSON.stringify({ id: "feature-debt" }, null, 2));
      writeText(fixtureRoot, ".spec/baselines/releases/v1.yaml", "version: v1\n");
      writeText(fixtureRoot, ".spec/releases/compare/v1-to-v2/compare-report.json", JSON.stringify({ driftSummary: { changed: 1 } }, null, 2));

      const snapshot = collectConsoleLocalSnapshot(fixtureRoot);
      const availablePaths = snapshot.artifacts.flatMap((artifact) => artifact.instances.map((instance) => instance.relativePath));
      assert.ok(!availablePaths.includes("src/app.ts"));
      assert.ok(availablePaths.every((relativePath) => relativePath.startsWith(".spec/") || relativePath.startsWith(".jispec-ci/")));
      assert.equal(snapshot.artifacts.find((artifact) => artifact.id === "ci-verify-report")?.status, "available");
      assert.equal(snapshot.artifacts.find((artifact) => artifact.id === "verify-policy")?.instances[0]?.data && true, true);
      assert.equal(snapshot.artifacts.find((artifact) => artifact.id === "release-compare-report")?.instances[0]?.relativePath, ".spec/releases/compare/v1-to-v2/compare-report.json");
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  record("local snapshot keeps Markdown display-only", () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-snapshot-markdown-"));
    try {
      writeText(fixtureRoot, ".jispec-ci/ci-summary.md", "# CI\n\nDo not parse me as a gate.\n");
      const snapshot = collectConsoleLocalSnapshot(fixtureRoot);
      const summary = snapshot.artifacts.find((artifact) => artifact.id === "ci-summary");
      assert.equal(summary?.status, "available");
      assert.equal(summary?.machineReadable, false);
      assert.equal(summary?.parseMarkdown, false);
      assert.equal(summary?.instances[0]?.data, undefined);
      assert.ok(summary?.instances[0]?.displayOnlyText?.includes("Do not parse me"));
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  record("local snapshot marks malformed machine artifacts invalid without synthesizing gate results", () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-snapshot-invalid-"));
    try {
      writeText(fixtureRoot, ".jispec-ci/verify-report.json", "{not-json");
      const snapshot = collectConsoleLocalSnapshot(fixtureRoot);
      const report = snapshot.artifacts.find((artifact) => artifact.id === "ci-verify-report");
      assert.equal(report?.status, "invalid");
      assert.equal(report?.instances[0]?.status, "invalid");
      assert.equal(snapshot.boundary.synthesizesGateResults, false);
      assert.equal(snapshot.boundary.overridesVerify, false);
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

function writeText(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
