import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { readAuditEvents } from "../audit/event-ledger";
import {
  appendExternalToolRunAudit,
  buildExternalToolRunArtifact,
  evaluateExternalToolRunRequest,
} from "../integrations/external-tool-run-boundary";
import {
  evaluatePolicyApprovalWorkflow,
  recordPolicyApproval,
} from "../policy/approval";
import { buildPrivacyReport } from "../privacy/redaction";
import { buildExternalToolRunReplayMetadata } from "../replay/replay-metadata";
import { buildRegressionMatrixManifest, TEST_SUITES } from "./regression-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== P9 External Tool Run Opt-In Boundary Tests ===\n");
  const results: TestResult[] = [];

  results.push(record("run-external-tool requires explicit provider, command, and source scope", () => {
    const base = {
      mode: "run-external-tool" as const,
      command: "graphify export --json",
      provider: "graphify",
      sourceScope: ["contracts/payment.yaml"],
      networkRequired: false,
      sourceUploadRisk: "none" as const,
      modelOrServiceProvider: "local",
      generatedAt: "2026-05-02T00:00:00.000Z",
    };

    assert.equal(evaluateExternalToolRunRequest({ ...base, provider: "" }).allowed, false);
    assert.equal(evaluateExternalToolRunRequest({ ...base, command: "" }).allowed, false);
    assert.equal(evaluateExternalToolRunRequest({ ...base, sourceScope: [] }).allowed, false);
  }));

  results.push(record("artifact records command, network, source upload risk, provider, scope, and generatedAt", () => {
    const artifact = buildExternalToolRunArtifact({
      mode: "run-external-tool",
      command: "graphify export --json .spec/integrations/graphify.json",
      provider: "graphify",
      sourceScope: ["contracts/payment.yaml", "src/payment.ts"],
      networkRequired: true,
      sourceUploadRisk: "summary_only",
      modelOrServiceProvider: "Graphify Cloud",
      generatedAt: "2026-05-02T00:00:00.000Z",
      ownerApprovalPresent: true,
    });

    assert.equal(artifact.command, "graphify export --json .spec/integrations/graphify.json");
    assert.equal(artifact.networkRequired, true);
    assert.equal(artifact.sourceUploadRisk, "summary_only");
    assert.equal(artifact.modelOrServiceProvider, "Graphify Cloud");
    assert.deepEqual(artifact.sourceScope, ["contracts/payment.yaml", "src/payment.ts"]);
    assert.equal(artifact.generatedAt, "2026-05-02T00:00:00.000Z");
  }));

  results.push(record("regulated profile requires owner approval before sharing external graph summary", () => {
    const root = createFixtureRoot();
    try {
      writePolicy(root, {
        profile: "regulated",
        owner: "owner-a",
        reviewers: ["alice", "bob"],
        required_reviewers: 2,
      });
      writeJson(root, ".spec/integrations/external-tool-run.json", buildExternalToolRunArtifact({
        mode: "run-external-tool",
        command: "gitnexus export --summary .spec/integrations/gitnexus.json",
        provider: "gitnexus",
        sourceScope: ["contracts/payment.yaml"],
        networkRequired: true,
        sourceUploadRisk: "summary_only",
        modelOrServiceProvider: "GitNexus Cloud",
        generatedAt: "2026-05-02T00:00:00.000Z",
        policyProfile: "regulated",
        ownerApprovalPresent: true,
      }));

      const evaluation = evaluateExternalToolRunRequest({
        mode: "run-external-tool",
        command: "gitnexus export --summary .spec/integrations/gitnexus.json",
        provider: "gitnexus",
        sourceScope: ["contracts/payment.yaml"],
        networkRequired: true,
        sourceUploadRisk: "summary_only",
        modelOrServiceProvider: "GitNexus Cloud",
        generatedAt: "2026-05-02T00:00:00.000Z",
        policyProfile: "regulated",
        ownerApprovalPresent: false,
      });
      assert.equal(evaluation.allowed, false);
      assert.equal(evaluation.requiredApproval?.role, "owner");
      assert.equal(evaluation.requiredApproval?.subject.kind, "external_graph_summary_sharing");

      recordPolicyApproval(root, {
        id: "approval-policy-owner",
        subjectKind: "policy_change",
        actor: "owner-a",
        role: "owner",
        reason: "Owner accepted the regulated policy baseline.",
      });
      let posture = evaluatePolicyApprovalWorkflow(root);
      const externalSubject = posture.subjects.find((subject) => subject.subject.kind === "external_graph_summary_sharing");
      assert.ok(externalSubject);
      assert.equal(externalSubject?.status, "approval_missing");

      recordPolicyApproval(root, {
        id: "approval-external-summary-owner",
        subjectKind: "external_graph_summary_sharing",
        actor: "owner-a",
        role: "owner",
        reason: "Owner approves sharing/adopting the external graph summary.",
      });
      posture = evaluatePolicyApprovalWorkflow(root);
      assert.equal(
        posture.subjects.find((subject) => subject.subject.kind === "external_graph_summary_sharing")?.ownerApprovedBy,
        "owner-a",
      );
    } finally {
      cleanupFixture(root);
    }
  }));

  results.push(record("external tool output remains advisory-only and privacy review is required for risky runs", () => {
    const root = createFixtureRoot();
    try {
      const artifact = buildExternalToolRunArtifact({
        mode: "run-external-tool",
        command: "graphify export --json .spec/integrations/graphify.json",
        provider: "graphify",
        sourceScope: ["src/payment.ts"],
        networkRequired: true,
        sourceUploadRisk: "source_snippets",
        modelOrServiceProvider: "Graphify Cloud",
        generatedAt: "2026-05-02T00:00:00.000Z",
        ownerApprovalPresent: true,
      });
      writeJson(root, ".spec/integrations/external-tool-run.json", artifact);

      assert.equal(artifact.outputBlockingEligible, false);
      assert.equal(artifact.advisoryOnly, true);

      const report = buildPrivacyReport({ root, generatedAt: "2026-05-02T00:00:00.000Z" });
      const externalArtifact = report.report.artifacts.find((candidate) => candidate.path === ".spec/integrations/external-tool-run.json");
      assert.equal(externalArtifact?.shareDecision, "review_before_sharing");
    } finally {
      cleanupFixture(root);
    }
  }));

  results.push(record("external tool run artifact includes audit and replay metadata", () => {
    const root = createFixtureRoot();
    try {
      const artifact = buildExternalToolRunArtifact({
        mode: "run-external-tool",
        command: "graphify export --json .spec/integrations/graphify.json",
        provider: "graphify",
        sourceScope: ["src/payment.ts"],
        networkRequired: false,
        sourceUploadRisk: "none",
        modelOrServiceProvider: "local",
        generatedAt: "2026-05-02T00:00:00.000Z",
      });
      const artifactPath = writeJson(root, ".spec/integrations/external-tool-run.json", artifact);
      const replay = buildExternalToolRunReplayMetadata(artifact);
      const audit = appendExternalToolRunAudit(root, artifact, artifactPath);

      assert.equal(artifact.audit.kind, "external_tool_run_requested");
      assert.equal(artifact.replay.kind, "external_tool_run_metadata");
      assert.equal(replay.kind, "external_tool_run_metadata");
      assert.equal(replay.command, artifact.command);
      assert.equal(audit.event.type, "external_tool_run_requested");
      assert.equal(readAuditEvents(root).some((event) => event.type === "external_tool_run_requested"), true);
    } finally {
      cleanupFixture(root);
    }
  }));

  results.push(record("P9-T7 suite is registered in runtime-extended", () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "p9-external-tool-run-opt-in-boundary.ts");
    assert.ok(suite);
    assert.equal(suite.area, "runtime-extended");
    assert.equal(suite.expectedTests, 6);
    assert.equal(suite.task, "P9-T7");

    const manifest = buildRegressionMatrixManifest();
    assert.equal(manifest.totalSuites, 150);
    assert.equal(manifest.totalExpectedTests, 669);
  }));

  report(results);
}

function createFixtureRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-external-tool-"));
}

function cleanupFixture(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

function writeJson(root: string, relativePath: string, value: unknown): string {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  return target;
}

function writePolicy(
  root: string,
  team: {
    profile: string;
    owner: string;
    reviewers: string[];
    required_reviewers: number;
  },
): void {
  const target = path.join(root, ".spec", "policy.yaml");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, yaml.dump({
    version: 1,
    team,
    rules: [
      {
        id: "p9-external-tool-approval-policy",
        enabled: true,
        action: "warn",
        message: "P9 external tool approval posture.",
        when: {
          fact: "verify.issue_count",
          op: ">",
          value: 0,
        },
      },
    ],
  }, { lineWidth: 100, noRefs: true, sortKeys: false }), "utf-8");
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    console.log(`✓ ${name}`);
    return { name, passed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ ${name}: ${message}`);
    return { name, passed: false, error: message };
  }
}

function report(results: TestResult[]): void {
  const passed = results.filter((result) => result.passed).length;
  console.log(`\n${passed}/${results.length} tests passed`);
  if (passed !== results.length) {
    process.exit(1);
  }
}

main();
