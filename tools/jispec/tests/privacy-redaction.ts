import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportConsoleGovernanceSnapshot } from "../console/governance-export";
import {
  buildPrivacyReport,
  redactJsonForSharing,
  redactTextForSharing,
} from "../privacy/redaction";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const OPENAI_KEY = "sk-testSecretValueForPrivacyReport1234567890";
const GITHUB_TOKEN = "ghp_testSecretValueForPrivacyReport1234567890";
const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";
const DB_URL = "postgres://user:supersecret@db.internal:5432/app";

async function main(): Promise<void> {
  console.log("=== Privacy Redaction Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("redaction removes common tokens, credentials, connection strings, and private keys", () => {
    const input = [
      `api_key=${OPENAI_KEY}`,
      `token: "${GITHUB_TOKEN}"`,
      `aws=${AWS_KEY}`,
      `database=${DB_URL}`,
      "-----BEGIN PRIVATE KEY-----",
      "abc123",
      "-----END PRIVATE KEY-----",
    ].join("\n");

    const redacted = redactTextForSharing(input);
    assert.equal(redacted.findings.length >= 5, true);
    assert.doesNotMatch(redacted.text, /sk-testSecretValue/);
    assert.doesNotMatch(redacted.text, /ghp_testSecretValue/);
    assert.doesNotMatch(redacted.text, /AKIAIOSFODNN7EXAMPLE/);
    assert.doesNotMatch(redacted.text, /supersecret/);
    assert.match(redacted.text, /\[REDACTED:/);
    assert.ok(redacted.findings.every((finding) => finding.matchHash.length === 64));
    assert.ok(redacted.findings.every((finding) => !finding.redactedPreview.includes("supersecret")));
  }));

  results.push(record("privacy report scans JiSpec share artifacts and writes redacted companions without changing facts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-privacy-report-"));
    try {
      writeText(root, ".spec/sessions/discover/manifest.json", JSON.stringify({
        note: `discovered token ${GITHUB_TOKEN}`,
      }, null, 2));
      writeText(root, ".jispec/handoff/change-1.json", JSON.stringify({
        outcome: "verify_blocked",
        error: `Failed command with OPENAI_API_KEY=${OPENAI_KEY}`,
      }, null, 2));
      writeText(root, ".spec/console/governance-snapshot.json", JSON.stringify({
        reason: `Temporary connection string ${DB_URL}`,
      }, null, 2));
      writeText(root, ".spec/north-star/acceptance.json", JSON.stringify({
        summary: {
          ready: true,
        },
        note: `Acceptance package with ${OPENAI_KEY}`,
      }, null, 2));

      const before = fs.readFileSync(path.join(root, ".jispec", "handoff", "change-1.json"), "utf-8");
      const result = buildPrivacyReport({
        root,
        generatedAt: "2026-05-01T00:00:00.000Z",
      });
      const after = fs.readFileSync(path.join(root, ".jispec", "handoff", "change-1.json"), "utf-8");

      assert.equal(before, after);
      assert.equal(result.report.boundary.changesMachineFacts, false);
      assert.equal(result.report.summary.artifactWithFindingCount, 4);
      assert.equal(result.report.summary.redactedViewCount, 4);
      const acceptanceArtifact = result.report.artifacts.find((artifact) => artifact.path === ".spec/north-star/acceptance.json");
      assert.equal(acceptanceArtifact?.category, "north_star_acceptance");
      const reportText = fs.readFileSync(result.reportPath, "utf-8");
      assert.doesNotMatch(reportText, /sk-testSecretValue/);
      assert.doesNotMatch(reportText, /ghp_testSecretValue/);
      assert.doesNotMatch(reportText, /supersecret/);
      for (const artifact of result.report.artifacts.filter((entry) => entry.redactedViewPath)) {
        const redactedView = fs.readFileSync(path.join(root, artifact.redactedViewPath ?? ""), "utf-8");
        assert.match(redactedView, /\[REDACTED:/);
        assert.doesNotMatch(redactedView, /sk-testSecretValue|ghp_testSecretValue|supersecret/);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("Console governance export redacts share snapshot fields and keeps privacy hints", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-privacy-export-"));
    try {
      writeText(root, ".spec/policy.yaml", [
        "version: 1",
        "team:",
        `  owner: "${OPENAI_KEY}"`,
        "rules: []",
        "",
      ].join("\n"));
      const result = exportConsoleGovernanceSnapshot({
        root,
        repoId: "privacy-export",
        repoName: "Privacy Export",
      });

      const snapshotText = fs.readFileSync(result.snapshotPath, "utf-8");
      const summaryText = fs.readFileSync(result.summaryPath, "utf-8");
      assert.doesNotMatch(snapshotText, /sk-testSecretValue/);
      assert.doesNotMatch(summaryText, /sk-testSecretValue/);
      assert.match(snapshotText, /\[REDACTED:/);
      assert.equal(result.snapshot.privacy?.redactionApplied, true);
      assert.ok((result.snapshot.privacy?.findingCount ?? 0) > 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("CLI privacy report emits JSON and keeps local-first boundaries", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-privacy-cli-"));
    try {
      writeText(root, ".spec/handoffs/verify-summary.md", `Token: ${GITHUB_TOKEN}\n`);
      const cli = runCli(["privacy", "report", "--root", root, "--json"]);
      assert.equal(cli.status, 0, cli.stderr);
      const payload = JSON.parse(cli.stdout) as ReturnType<typeof buildPrivacyReport>;
      assert.equal(payload.report.boundary.localOnly, true);
      assert.equal(payload.report.boundary.sourceUploadRequired, false);
      assert.equal(payload.report.boundary.replacesVerifyGate, false);
      assert.equal(payload.report.summary.findingCount, 1);
      assert.ok(fs.existsSync(payload.reportPath));
      assert.ok(fs.existsSync(payload.summaryPath));
      assert.doesNotMatch(cli.stdout, /ghp_testSecretValue/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("JSON redaction preserves structure while removing sensitive values", () => {
    const redacted = redactJsonForSharing({
      nested: {
        credential: DB_URL,
      },
      safe: "business context",
    });

    assert.equal(redacted.value.safe, "business context");
    assert.equal(redacted.value.nested.credential, "[REDACTED:connection_string]");
    assert.equal(redacted.findings[0]?.type, "connection_string");
  }));

  results.push(record("privacy report classifies pilot packages, SCM issue payloads, and adapter requests as share artifacts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-privacy-share-"));
    try {
      writeText(root, ".spec/pilot/package.json", JSON.stringify({
        reviewerNote: `pilot reviewer token ${GITHUB_TOKEN}`,
      }, null, 2));
      writeText(root, ".spec/integrations/scm/github-scm_comment.json", JSON.stringify({
        markdown: `SCM preview with api_key=${OPENAI_KEY}`,
      }, null, 2));
      writeText(root, ".spec/integrations/issues/jira-issue_link.json", JSON.stringify({
        bodyMarkdown: `Issue preview password=${DB_URL}`,
      }, null, 2));
      writeText(root, ".jispec/handoff/adapters/change-1/codex-request.json", JSON.stringify({
        prompt: `External request token=${AWS_KEY}`,
      }, null, 2));

      const result = buildPrivacyReport({
        root,
        generatedAt: "2026-05-02T00:00:00.000Z",
      });
      const byPath = new Map(result.report.artifacts.map((artifact) => [artifact.path, artifact]));

      assert.equal(byPath.get(".spec/pilot/package.json")?.category, "pilot_package");
      assert.equal(byPath.get(".spec/integrations/scm/github-scm_comment.json")?.category, "integration_payload");
      assert.equal(byPath.get(".spec/integrations/issues/jira-issue_link.json")?.category, "integration_payload");
      assert.equal(byPath.get(".jispec/handoff/adapters/change-1/codex-request.json")?.category, "handoff");
      assert.equal(byPath.get(".spec/pilot/package.json")?.shareDecision, "review_before_sharing");
      assert.equal(byPath.get(".spec/integrations/scm/github-scm_comment.json")?.shareDecision, "review_before_sharing");
      assert.ok(result.report.artifactCategories.pilot_package.mayContain.includes("pilot reviewer notes"));
      assert.ok(result.report.artifactCategories.integration_payload.mayContain.includes("SCM or issue markdown previews"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("privacy report treats agent discipline artifacts as review-gated handoff evidence", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-privacy-agent-run-"));
    try {
      const fakeSecret = "sk-test12345678901234567890";
      writeText(root, ".jispec/agent-run/change-1/debug-packet.md", [
        "# Debug Packet",
        "",
        `Failed command used token ${fakeSecret}`,
        "",
      ].join("\n"));
      writeText(root, ".jispec/agent-run/change-1/discipline-report.json", JSON.stringify({
        sessionId: "change-1",
        status: "blocked",
        note: `discipline evidence token ${fakeSecret}`,
      }, null, 2));

      const result = buildPrivacyReport({
        root,
        generatedAt: "2026-05-02T00:00:00.000Z",
      });
      const byPath = new Map(result.report.artifacts.map((artifact) => [artifact.path, artifact]));
      const debugPacket = byPath.get(".jispec/agent-run/change-1/debug-packet.md");
      const disciplineReport = byPath.get(".jispec/agent-run/change-1/discipline-report.json");

      assert.equal(debugPacket?.category, "handoff");
      assert.equal(disciplineReport?.category, "handoff");
      assert.equal(debugPacket?.shareDecision, "review_before_sharing");
      assert.equal(disciplineReport?.shareDecision, "review_before_sharing");
      assert.ok(debugPacket?.redactedViewPath);
      assert.ok(disciplineReport?.redactedViewPath);
      const redactedDebug = fs.readFileSync(path.join(root, debugPacket?.redactedViewPath ?? ""), "utf-8");
      const redactedReport = fs.readFileSync(path.join(root, disciplineReport?.redactedViewPath ?? ""), "utf-8");
      assert.doesNotMatch(redactedDebug, /sk-test12345678901234567890/);
      assert.doesNotMatch(redactedReport, /sk-test12345678901234567890/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
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
