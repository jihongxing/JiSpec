import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CONSOLE_GOVERNANCE_OBJECTS,
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
    assert.equal(contract.governanceObjects.length, 10);
  });

  record("contract includes required machine-readable read model artifacts and governance sources", () => {
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
      ".spec/releases/drift-trend.json",
      ".spec/console/governance-snapshot.json",
      ".spec/handoffs/retakeover-metrics.json",
      ".spec/handoffs/retakeover-pool-metrics.json",
      ".jispec/handoff/*.json",
      ".jispec/implement/<session-id>/patch-mediation.json",
      ".spec/audit/events.jsonl",
    ]) {
      assert.ok(machinePaths.includes(expected), `Missing ${expected}`);
    }
  });

  record("contract defines governance objects with declared artifact sources", () => {
    const ids = CONSOLE_GOVERNANCE_OBJECTS.map((object) => object.id);
    assert.deepEqual(ids, [
      "policy_posture",
      "waiver_lifecycle",
      "spec_debt_ledger",
      "contract_drift",
      "release_baseline",
      "verify_trend",
      "takeover_quality_trend",
      "implementation_mediation_outcomes",
      "audit_events",
      "multi_repo_export",
    ]);
    for (const object of CONSOLE_GOVERNANCE_OBJECTS) {
      assert.equal(object.missingState, "not_available_yet");
      assert.equal(object.automationInputs, "json_yaml_jsonl_only");
      assert.equal(object.markdownDisplayOnly, true);
      assert.ok(object.sourceArtifactIds.length > 0);
      for (const sourceId of object.sourceArtifactIds) {
        assert.ok(CONSOLE_READ_MODEL_ARTIFACTS.some((artifact) => artifact.id === sourceId), `${object.id} references missing artifact ${sourceId}`);
      }
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
      assert.equal(snapshot.governance.summary.totalObjects, CONSOLE_GOVERNANCE_OBJECTS.length);
      assert.equal(snapshot.governance.summary.missingObjects, CONSOLE_GOVERNANCE_OBJECTS.length);
      assert.ok(snapshot.governance.objects.every((object) => object.status === "not_available_yet"));
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
      writeText(fixtureRoot, ".spec/console/governance-snapshot.json", JSON.stringify({ kind: "jispec-multi-repo-governance-snapshot" }, null, 2));
      writeText(fixtureRoot, ".spec/handoffs/retakeover-metrics.json", JSON.stringify({ qualityScorecard: { score: 82 } }, null, 2));
      writeText(fixtureRoot, ".jispec/handoff/change-1.json", JSON.stringify({ outcome: "budget_exhausted", decisionPacket: { stopPoint: "budget" }, replay: { replayable: true } }, null, 2));
      writeText(fixtureRoot, ".jispec/implement/change-1/patch-mediation.json", JSON.stringify({ status: "accepted", applied: true }, null, 2));
      writeText(fixtureRoot, ".spec/audit/events.jsonl", `${JSON.stringify({ type: "policy_migrate", actor: "tester" })}\n`);

      const snapshot = collectConsoleLocalSnapshot(fixtureRoot);
      const availablePaths = snapshot.artifacts.flatMap((artifact) => artifact.instances.map((instance) => instance.relativePath));
      assert.ok(!availablePaths.includes("src/app.ts"));
      assert.ok(availablePaths.every((relativePath) => relativePath.startsWith(".spec/") || relativePath.startsWith(".jispec-ci/") || relativePath.startsWith(".jispec/")));
      assert.equal(snapshot.artifacts.find((artifact) => artifact.id === "ci-verify-report")?.status, "available");
      assert.equal(snapshot.artifacts.find((artifact) => artifact.id === "verify-policy")?.instances[0]?.data && true, true);
      assert.equal(snapshot.artifacts.find((artifact) => artifact.id === "release-compare-report")?.instances[0]?.relativePath, ".spec/releases/compare/v1-to-v2/compare-report.json");
      assert.equal(snapshot.artifacts.find((artifact) => artifact.id === "multi-repo-governance-snapshot")?.instances[0]?.relativePath, ".spec/console/governance-snapshot.json");
      assert.equal(snapshot.artifacts.find((artifact) => artifact.id === "implementation-handoff-packets")?.instances[0]?.relativePath, ".jispec/handoff/change-1.json");
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  record("local snapshot aggregates governance domain objects without source scanning", () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-console-governance-"));
    try {
      writeText(fixtureRoot, "src/ignored.ts", "export const ignored = true;\n");
      writeText(fixtureRoot, ".spec/policy.yaml", [
        "version: 1",
        "requires:",
        "  facts_contract: '1.0'",
        "team:",
        "  profile: platform",
        "  owner: console-team",
        "  reviewers: [alice, bob]",
        "rules:",
        "  - id: no-blocking",
        "",
      ].join("\n"));
      writeText(fixtureRoot, ".spec/waivers/active.json", JSON.stringify({ id: "active", status: "active" }, null, 2));
      writeText(fixtureRoot, ".spec/spec-debt/bootstrap/feature.json", JSON.stringify({ id: "feature-debt" }, null, 2));
      writeText(fixtureRoot, ".spec/releases/compare/v1-to-v2/compare-report.json", JSON.stringify({ driftSummary: { overallStatus: "changed" } }, null, 2));
      writeText(fixtureRoot, ".spec/baselines/releases/v1.yaml", "version: v1\n");
      writeText(fixtureRoot, ".spec/console/governance-snapshot.json", JSON.stringify({
        schemaVersion: 1,
        kind: "jispec-multi-repo-governance-snapshot",
        exportedAt: "2026-05-01T00:00:00.000Z",
        repo: { id: "repo-1", name: "Console Repo", root: fixtureRoot.replace(/\\/g, "/") },
        boundary: {
          localOnly: true,
          readOnlySnapshot: true,
          sourceUploadRequired: false,
          scansSourceCode: false,
          runsVerify: false,
          replacesCliGate: false,
          markdownIsMachineApi: false,
        },
        sourceSnapshot: {
          createdAt: "2026-05-01T00:00:00.000Z",
          artifactSummary: { totalArtifacts: 1 },
          governanceSummary: { totalObjects: 1 },
          hash: "abc123",
        },
        aggregateHints: {
          verifyVerdict: "PASS",
          policyProfile: "regulated",
          policyOwner: "console-team",
          activeWaivers: 0,
          unmatchedActiveWaivers: [],
          openSpecDebt: 0,
          bootstrapSpecDebt: 0,
          releaseDriftStatus: "changed",
          releaseDriftTrendComparisons: 1,
          latestAuditActor: "codex",
        },
        governanceObjects: [],
      }, null, 2));
      writeText(fixtureRoot, ".jispec-ci/verify-report.json", JSON.stringify({ verdict: "WARN_ADVISORY", issueCount: 3, blockingIssueCount: 0 }, null, 2));
      writeText(fixtureRoot, ".spec/handoffs/retakeover-pool-metrics.json", JSON.stringify({ fixtures: [{ id: "legacy", qualityScorecard: { score: 76 } }] }, null, 2));
      writeText(fixtureRoot, ".jispec/handoff/change-replay.json", JSON.stringify({ outcome: "verify_blocked", decisionPacket: { stopPoint: "post_verify" }, replay: { replayable: true } }, null, 2));
      writeText(fixtureRoot, ".spec/audit/events.jsonl", `${JSON.stringify({ event: "default_mode_set", actor: "codex" })}\n`);

      const snapshot = collectConsoleLocalSnapshot(fixtureRoot);
      const policy = governanceObject(snapshot, "policy_posture");
      assert.equal(policy.status, "available");
      assert.equal(policy.summary.owner, "console-team");
      assert.equal(policy.summary.ruleCount, 1);

      const multiRepo = governanceObject(snapshot, "multi_repo_export");
      assert.equal(multiRepo.status, "available");
      assert.equal(multiRepo.summary.repoId, "repo-1");
      assert.equal(multiRepo.summary.releaseDriftStatus, "changed");

      const implementation = governanceObject(snapshot, "implementation_mediation_outcomes");
      assert.equal(implementation.status, "partial");
      assert.equal(implementation.summary.latestOutcome, "verify_blocked");
      assert.equal(implementation.summary.latestReplayable, true);

      const audit = governanceObject(snapshot, "audit_events");
      assert.equal(audit.status, "available");
      assert.equal(audit.summary.eventCount, 1);
      assert.equal(audit.summary.latestActor, "codex");

      assert.ok(!snapshot.artifacts.flatMap((artifact) => artifact.instances.map((instance) => instance.relativePath)).includes("src/ignored.ts"));
      assert.equal(snapshot.boundary.synthesizesGateResults, false);
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

function governanceObject(
  snapshot: ReturnType<typeof collectConsoleLocalSnapshot>,
  id: string,
) {
  const object = snapshot.governance.objects.find((entry) => entry.id === id);
  assert.ok(object, `Missing governance object ${id}`);
  return object;
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
