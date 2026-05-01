import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildIntegrationPayload,
  writeIntegrationPayload,
  type IntegrationPayload,
} from "../integrations/scm/payload";
import { inferNextAction, type VerifyReport } from "../ci/verify-report";
import { renderVerifySummaryMarkdown } from "../ci/verify-summary";
import type { HandoffPacket } from "../implement/handoff-packet";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Integration Payload Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("GitHub and GitLab SCM comments cite verify, waiver, spec debt, and handoff state", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-integration-scm-"));
    try {
      const report = writeIntegrationFixture(root);
      const github = buildIntegrationPayload({
        root,
        provider: "github",
        kind: "scm_comment",
        createdAt: "2026-05-02T00:00:00.000Z",
      });
      assert.equal(github.scm?.target, "pull_request_comment");
      assert.equal(github.summary.verifyVerdict, "FAIL_BLOCKING");
      assert.equal(github.summary.blockingIssues, 2);
      assert.match(github.scm?.markdown ?? "", /JiSpec Verify: FAIL_BLOCKING/);
      assert.match(github.scm?.markdown ?? "", /Waivers: 1 active, 0 expired, 0 revoked/);
      assert.match(github.scm?.markdown ?? "", /Spec debt: 2 Greenfield item\(s\), 1 bootstrap record\(s\)/);
      assert.match(github.scm?.markdown ?? "", /Handoff next action: Fix blocking verify issues before merging/);
      assert.equal(github.summary.nextAction, inferNextAction(report));

      const gitlab = buildIntegrationPayload({
        root,
        provider: "gitlab",
        kind: "scm_comment",
        createdAt: "2026-05-02T00:00:00.000Z",
      });
      assert.equal(gitlab.scm?.target, "merge_request_note");
      assert.match(gitlab.scm?.markdown ?? "", /Target: GitLab MR/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("Jira and Linear issue-link previews backfill change intent without cloud tokens", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-integration-issues-"));
    try {
      writeIntegrationFixture(root);
      for (const provider of ["jira", "linear"] as const) {
        const payload = buildIntegrationPayload({
          root,
          provider,
          kind: "issue_link",
          createdAt: "2026-05-02T00:00:00.000Z",
        });
        assert.equal(payload.issue?.target, "issue_link_preview");
        assert.match(payload.issue?.title ?? "", /FAIL_BLOCKING/);
        assert.equal(payload.issue?.changeIntentBackfill, "Tighten refund handling");
        assert.equal(payload.boundary.cloudTokenRequired, false);
        assert.equal(payload.boundary.cloudApiWriteRequired, false);
        assert.equal(payload.boundary.sourceUploadRequired, false);
        assert.match(payload.issue?.bodyMarkdown ?? "", /Preview only; no cloud API write is performed/);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("payloads remain previews and keep local artifacts as source of truth", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-integration-boundary-"));
    try {
      writeIntegrationFixture(root);
      const payload = buildIntegrationPayload({
        root,
        provider: "github",
        kind: "scm_comment",
        createdAt: "2026-05-02T00:00:00.000Z",
      });
      assert.equal(payload.boundary.localOnly, true);
      assert.equal(payload.boundary.previewOnly, true);
      assert.equal(payload.boundary.localArtifactsRemainSourceOfTruth, true);
      assert.equal(payload.boundary.doesNotReplaceVerify, true);
      assert.ok(payload.sourceArtifacts.includes(".jispec-ci/verify-report.json"));
      assert.ok(payload.sourceArtifacts.includes(".spec/waivers/waiver-1.json"));
      assert.ok(payload.sourceArtifacts.includes(".spec/spec-debt/ledger.yaml"));
      assert.ok(payload.sourceArtifacts.includes(".jispec/handoff/change-integration.json"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("SCM comment next-action language stays aligned with local verify summary", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-integration-language-"));
    try {
      const report = writeIntegrationFixture(root);
      const verifySummary = renderVerifySummaryMarkdown(report);
      const payload = buildIntegrationPayload({
        root,
        provider: "github",
        kind: "scm_comment",
        createdAt: "2026-05-02T00:00:00.000Z",
      });
      const nextAction = inferNextAction(report);
      assert.ok(verifySummary.includes(nextAction));
      assert.ok(payload.scm?.markdown.includes(nextAction));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("writer and CLI emit JSON plus Markdown payload previews", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-integration-cli-"));
    try {
      writeIntegrationFixture(root);
      const written = writeIntegrationPayload({
        root,
        provider: "linear",
        kind: "issue_link",
        createdAt: "2026-05-02T00:00:00.000Z",
      });
      assert.equal(fs.existsSync(written.payloadPath), true);
      assert.equal(fs.existsSync(written.markdownPath), true);
      assert.equal((JSON.parse(fs.readFileSync(written.payloadPath, "utf-8")) as IntegrationPayload).provider, "linear");

      const cli = runCli([
        "integrations",
        "payload",
        "--root",
        root,
        "--provider",
        "github",
        "--kind",
        "scm_comment",
        "--json",
      ]);
      assert.equal(cli.status, 0, cli.stderr);
      const result = JSON.parse(cli.stdout) as { payload: IntegrationPayload; payloadPath: string; markdownPath: string };
      assert.equal(result.payload.provider, "github");
      assert.equal(result.payload.kind, "scm_comment");
      assert.equal(fs.existsSync(result.payloadPath), true);
      assert.equal(fs.existsSync(result.markdownPath), true);
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

function writeIntegrationFixture(root: string): VerifyReport {
  const report: VerifyReport = {
    version: 1,
    generatedAt: "2026-05-02T00:00:00.000Z",
    verdict: "FAIL_BLOCKING",
    ok: false,
    counts: {
      total: 3,
      blocking: 2,
      advisory: 1,
      nonblockingError: 0,
    },
    issues: [
      {
        code: "DOMAIN_CONTRACT_DRIFT",
        severity: "blocking",
        path: "src/domain/order.ts",
        message: "Domain behavior changed without contract update.",
      },
      {
        code: "API_CONTRACT_MISSING",
        severity: "blocking",
        path: ".spec/contracts/api_spec.json",
        message: "API contract missing for changed endpoint.",
      },
      {
        code: "SPEC_DEBT_OPEN",
        severity: "advisory",
        path: ".spec/spec-debt/ledger.yaml",
        message: "Open spec debt should be reviewed.",
      },
    ],
    factsContractVersion: "1.0",
    matchedPolicyRules: ["no-blocking-issues"],
    modes: {
      waiverLifecycle: {
        active: 1,
        expired: 0,
        revoked: 0,
        invalid: 0,
      },
    },
    context: {
      repoRoot: root,
      provider: "github",
      repoSlug: "acme/orders",
      pullRequestNumber: "42",
    },
  };
  writeText(root, ".jispec-ci/verify-report.json", `${JSON.stringify(report, null, 2)}\n`);
  writeText(root, ".spec/waivers/waiver-1.json", JSON.stringify({ id: "waiver-1", status: "active" }, null, 2));
  writeText(root, ".spec/spec-debt/ledger.yaml", [
    "version: 1",
    "debts:",
    "  - id: debt-a",
    "    status: open",
    "  - id: debt-b",
    "    status: open",
    "",
  ].join("\n"));
  writeText(root, ".spec/spec-debt/bootstrap/feature.json", JSON.stringify({ id: "bootstrap-debt" }, null, 2));
  writeHandoff(root);
  return report;
}

function writeHandoff(root: string): void {
  const packet: HandoffPacket = {
    sessionId: "change-integration",
    changeIntent: "Tighten refund handling",
    outcome: "verify_blocked",
    iterations: 1,
    tokensUsed: 0,
    costUSD: 0,
    contractContext: {
      lane: "strict",
      changedPaths: ["src/domain/order.ts"],
      changedPathKinds: ["domain_core"],
      bootstrapTakeoverPresent: false,
      adoptedContractPaths: [],
      deferredSpecDebtPaths: [],
    },
    decisionPacket: {
      state: "blocked_by_verify",
      stopPoint: "post_verify",
      mergeable: false,
      summary: "Tests passed, but verify blocked the change.",
      nextAction: "Fix blocking verify issues before merging.",
      nextActionDetail: {
        type: "fix_verify_blockers",
        owner: "verify_gate",
        failedCheck: "verify",
        command: "npm run verify",
      },
      executionStatus: {
        stoppedAt: "post_verify",
        scopeCheck: "not_applicable",
        patchApply: "not_applicable",
        tests: "passed",
        verify: "failed",
        nextActionOwner: "verify_gate",
      },
      implementationBoundary: {
        jispecRole: "mediation_and_verification",
        businessCodeGeneratedByJiSpec: false,
        implementationOwner: "external_patch_author",
        note: "JiSpec mediates and verifies.",
      },
      scope: {
        status: "not_applicable",
        touchedPaths: [],
        allowedPaths: ["src/domain/order.ts"],
        violations: [],
      },
      test: {
        command: "npm test",
        passed: true,
        status: "passed",
      },
      verify: {
        command: "npm run verify",
        verdict: "FAIL_BLOCKING",
        ok: false,
        status: "blocking",
      },
      suggestedActions: ["Fix blocking verify issues before merging."],
    },
    summary: {
      whatWorked: ["Tests passed"],
      whatFailed: ["Verify blocked"],
      lastError: "Blocking verify issues remain.",
    },
    nextSteps: {
      suggestedActions: ["Fix blocking verify issues before merging."],
      filesNeedingAttention: ["src/domain/order.ts"],
      testCommand: "npm test",
      verifyCommand: "npm run verify",
      verifyRecommendation: "Run verify after fixing blockers.",
    },
    episodeMemory: {
      attemptedHypotheses: [],
      rejectedPaths: [],
    },
    replay: {
      version: 1,
      replayable: true,
      source: "handoff_packet",
      sourceSession: {
        id: "change-integration",
        createdAt: "2026-05-02T00:00:00.000Z",
        summary: "Tighten refund handling",
        laneDecision: {
          lane: "strict",
          reasons: ["domain path changed"],
          autoPromoted: false,
        },
        changedPaths: [{ path: "src/domain/order.ts", kind: "domain_core" }],
        baseRef: "HEAD",
        nextCommands: [{ command: "npm run verify", description: "Run verify" }],
      },
      previousAttempt: {
        outcome: "verify_blocked",
        stopPoint: "post_verify",
        failedCheck: "verify",
        summary: "Verify blocked.",
        lastError: "Blocking verify issues remain.",
      },
      inputs: {
        testCommand: "npm test",
        verifyCommand: "npm run verify",
        lane: "strict",
        changedPaths: ["src/domain/order.ts"],
        allowedPatchPaths: ["src/domain/order.ts"],
      },
      commands: {
        restore: "npm run jispec-cli -- implement --from-handoff .jispec/handoff/change-integration.json",
        retryWithExternalPatch: "npm run jispec-cli -- implement --from-handoff .jispec/handoff/change-integration.json --external-patch <path>",
        rerunVerify: "npm run verify",
      },
    },
    metadata: {
      createdAt: "2026-05-02T00:00:00.000Z",
      startedAt: "2026-05-02T00:00:00.000Z",
      completedAt: "2026-05-02T00:01:00.000Z",
    },
  };
  writeText(root, ".jispec/handoff/change-integration.json", `${JSON.stringify(packet, null, 2)}\n`);
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
