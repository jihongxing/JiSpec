import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as yaml from "js-yaml";
import { renderHumanDecisionSnapshotText } from "../human-decision-packet";
import { runChangeCommand } from "../change/change-command";
import { buildConsoleGovernanceActionPlan, renderConsoleGovernanceActionPlanText } from "../console/governance-actions";
import { formatHandoffPacket, type HandoffPacket } from "../implement/handoff-packet";
import { renderGreenfieldSourceReviewTransitionText, runGreenfieldSourceReviewTransition } from "../greenfield/source-governance";
import { runGreenfieldSourceRefresh } from "../greenfield/source-refresh";
import {
  createFixtureRoot,
  findEvolutionItemId,
  initializeGreenfieldProject,
  writeWorkspaceRequirements,
} from "./p11-source-lifecycle-helpers";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== P11 Decision Packet Language Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("human decision snapshot renders the shared core and optional vocabulary", () => {
    const lines = renderHumanDecisionSnapshotText({
      currentState: "waiver waiver-1 renewed and active",
      risk: "the matching verify issue stays downgraded until the waiver is revisited.",
      evidence: [".spec/waivers/waiver-1.json", "matcher: API_CONTRACT_INVALID_JSON at .spec/contracts/api.yaml"],
      owner: "api-owner",
      nextCommand: "npm run jispec-cli -- verify --root D:/repo",
      affectedArtifact: ".spec/contracts/api.yaml",
      expiration: "2026-06-01T00:00:00.000Z",
      replayCommand: "npm run jispec-cli -- waiver revoke waiver-1 --root D:/repo --actor <actor> --reason \"<reason>\"",
    });
    assert.ok(lines.includes("Current state: waiver waiver-1 renewed and active"));
    assert.ok(lines.includes("Risk: the matching verify issue stays downgraded until the waiver is revisited."));
    assert.ok(lines.includes("Evidence: .spec/waivers/waiver-1.json, matcher: API_CONTRACT_INVALID_JSON at .spec/contracts/api.yaml"));
    assert.ok(lines.includes("Owner: api-owner"));
    assert.ok(lines.includes("Next command: npm run jispec-cli -- verify --root D:/repo"));
    assert.ok(lines.includes("Affected artifact: .spec/contracts/api.yaml"));
    assert.ok(lines.includes("Expiration: 2026-06-01T00:00:00.000Z"));
    assert.ok(lines.includes("Replay command: npm run jispec-cli -- waiver revoke waiver-1 --root D:/repo --actor <actor> --reason \"<reason>\""));
  }));

  results.push(await recordAsync("source review transition text emits the same decision packet labels", async () => {
    const root = createFixtureRoot("jispec-p11-decision-packet-source-");
    try {
      initializeGreenfieldProject(root, [
        { id: "REQ-ORD-001", statement: "A shopper must submit an order." },
        { id: "REQ-ORD-002", statement: "Checkout must reject unavailable items." },
      ]);

      const change = await runChangeCommand({
        root,
        summary: "Refine source requirement wording",
        mode: "prompt",
        changeType: "modify",
        contextId: "ordering",
      });

      writeWorkspaceRequirements(root, [
        { id: "REQ-ORD-001", statement: "A shopper must submit an order." },
        { id: "REQ-ORD-002", statement: "Checkout must reject unavailable or recalled items." },
      ]);

      const refresh = runGreenfieldSourceRefresh({
        root,
        change: change.session.specDelta?.changeId,
      });
      const itemId = findEvolutionItemId(root, refresh.changeId, (item) => item.anchor_id === "REQ-ORD-002");
      const transition = runGreenfieldSourceReviewTransition({
        root,
        change: refresh.changeId,
        itemId,
        action: "defer",
        actor: "architect",
        owner: "domain-owner",
        reason: "Need domain owner to confirm the rewritten boundary.",
        expiresAt: "2026-06-15T00:00:00.000Z",
        now: "2026-05-04T00:00:00.000Z",
      });
      const text = renderGreenfieldSourceReviewTransitionText(transition);

      assert.match(text, /Decision packet:/);
      assert.match(text, /Current state:/);
      assert.match(text, /Risk:/);
      assert.match(text, /Evidence:/);
      assert.match(text, /Owner:/);
      assert.match(text, /Next command:/);
      assert.match(text, /Affected artifact:/);
      assert.match(text, /Expiration: 2026-06-15T00:00:00.000Z/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("waiver create CLI output uses the unified decision packet vocabulary", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p11-waiver-create-"));
    try {
      const output = runCli([
        "waiver",
        "create",
        "--root",
        root,
        "--code",
        "API_CONTRACT_INVALID_JSON",
        "--path",
        ".spec/contracts/api.yaml",
        "--owner",
        "api-owner",
        "--reason",
        "Temporary mismatch while contract is being reconciled",
      ]);

      assert.equal(output.status, 0, output.stderr);
      assert.match(output.stdout, /Decision packet:/);
      assert.match(output.stdout, /Current state: waiver .* recorded and active/);
      assert.match(output.stdout, /Affected artifact: \.spec\/contracts\/api\.yaml/);
      assert.match(output.stdout, /Next command: npm run jispec-cli -- verify --root /);
      assert.match(output.stdout, /Replay command: npm run jispec-cli -- waiver revoke /);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("waiver renew and revoke CLI outputs stay on the same decision packet contract", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p11-waiver-lifecycle-"));
    try {
      const created = runCli([
        "waiver",
        "create",
        "--root",
        root,
        "--code",
        "DOMAIN_CONTRACT_SECTION_MISSING",
        "--path",
        ".spec/contracts/domain.yaml",
        "--owner",
        "domain-owner",
        "--reason",
        "Temporary gap",
      ]);
      assert.equal(created.status, 0, created.stderr);
      const waiverId = created.stdout.match(/ID: (waiver-[\w-]+)/)?.[1];
      assert.ok(waiverId);

      const renewed = runCli([
        "waiver",
        "renew",
        waiverId!,
        "--root",
        root,
        "--actor",
        "reviewer",
        "--reason",
        "Need one more review cycle",
        "--expires-at",
        "2026-06-01T00:00:00.000Z",
      ]);
      assert.equal(renewed.status, 0, renewed.stderr);
      assert.match(renewed.stdout, /Decision packet:/);
      assert.match(renewed.stdout, /Current state: waiver .* renewed and active/);
      assert.match(renewed.stdout, /Expiration: 2026-06-01T00:00:00.000Z/);
      assert.match(renewed.stdout, /Replay command: npm run jispec-cli -- waiver revoke /);

      const revoked = runCli([
        "waiver",
        "revoke",
        waiverId!,
        "--root",
        root,
        "--actor",
        "reviewer",
        "--reason",
        "Issue no longer needs an exception",
      ]);
      assert.equal(revoked.status, 0, revoked.stderr);
      assert.match(revoked.stdout, /Decision packet:/);
      assert.match(revoked.stdout, /Current state: waiver .* revoked/);
      assert.match(revoked.stdout, /Affected artifact: \.spec\/contracts\/domain\.yaml/);
      assert.match(revoked.stdout, /Next command: npm run jispec-cli -- verify --root /);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("spec debt CLI outputs share the same packet vocabulary across owner-review, repay, and cancel", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p11-spec-debt-"));
    try {
      writeYaml(root, ".spec/spec-debt/ledger.yaml", {
        version: 1,
        debts: [
          {
            id: "debt-owner",
            kind: "defer",
            status: "open",
            owner: "domain-owner",
            reason: "Needs owner input",
            created_at: "2026-05-01T00:00:00.000Z",
            expires_at: "2026-06-01T00:00:00.000Z",
            affected_assets: [".spec/contracts/domain.yaml"],
            affected_contracts: ["CTR-DOMAIN-001"],
            repayment_hint: "Confirm the domain contract boundary.",
          },
          {
            id: "debt-repay",
            kind: "waiver",
            status: "open",
            owner: "api-owner",
            reason: "Waiver should be closed",
            created_at: "2026-05-01T00:00:00.000Z",
            affected_assets: [".spec/contracts/api.yaml"],
            repayment_hint: "Repay once the contract is updated.",
          },
          {
            id: "debt-cancel",
            kind: "classified_drift",
            status: "open",
            owner: "ux-owner",
            reason: "Out of scope now",
            created_at: "2026-05-01T00:00:00.000Z",
            affected_assets: [".spec/contracts/ux.md"],
            repayment_hint: "Cancel only if scope really changed.",
          },
        ],
      });

      const ownerReview = runCli([
        "spec-debt",
        "owner-review",
        "debt-owner",
        "--root",
        root,
        "--actor",
        "reviewer",
        "--reason",
        "Escalate to owner for a closure decision",
      ]);
      assert.equal(ownerReview.status, 0, ownerReview.stderr);
      assert.match(ownerReview.stdout, /Decision packet:/);
      assert.match(ownerReview.stdout, /Current state: owner review requested for open spec debt debt-owner/);
      assert.match(ownerReview.stdout, /Affected artifact: \.spec\/contracts\/domain\.yaml/);
      assert.match(ownerReview.stdout, /Expiration: 2026-06-01T00:00:00.000Z/);
      assert.match(ownerReview.stdout, /Replay command: npm run jispec-cli -- spec-debt cancel debt-owner/);

      const repaid = runCli([
        "spec-debt",
        "repay",
        "debt-repay",
        "--root",
        root,
        "--actor",
        "reviewer",
        "--reason",
        "Debt is resolved",
      ]);
      assert.equal(repaid.status, 0, repaid.stderr);
      assert.match(repaid.stdout, /Decision packet:/);
      assert.match(repaid.stdout, /Current state: spec debt debt-repay marked repaid/);
      assert.match(repaid.stdout, /Next command: npm run jispec-cli -- verify --root /);

      const cancelled = runCli([
        "spec-debt",
        "cancel",
        "debt-cancel",
        "--root",
        root,
        "--actor",
        "reviewer",
        "--reason",
        "Workstream is no longer in scope",
      ]);
      assert.equal(cancelled.status, 0, cancelled.stderr);
      assert.match(cancelled.stdout, /Decision packet:/);
      assert.match(cancelled.stdout, /Current state: spec debt debt-cancel marked cancelled/);
      assert.match(cancelled.stdout, /Affected artifact: \.spec\/contracts\/ux\.md/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("handoff and console governance text surfaces expose the enriched packet vocabulary", () => {
    const handoffPacket: HandoffPacket = {
      sessionId: "change-handoff",
      changeIntent: "Tighten refund flow",
      outcome: "budget_exhausted",
      iterations: 1,
      tokensUsed: 1200,
      costUSD: 0.12,
      contractContext: {
        lane: "strict",
        changedPaths: ["src/domain/order.ts"],
        changedPathKinds: ["domain_core"],
        bootstrapTakeoverPresent: false,
        adoptedContractPaths: [],
        deferredSpecDebtPaths: [],
      },
      decisionPacket: {
        state: "needs_external_patch",
        stopPoint: "budget",
        mergeable: false,
        summary: "Implementation mediation stopped because the configured budget was exhausted.",
        nextAction: "Use the handoff packet as the request for a human or external coding tool patch.",
        nextActionDetail: {
          type: "submit_external_patch",
          owner: "human_or_external_tool",
          failedCheck: "budget",
          command: "npm run jispec-cli -- implement --session-id change-handoff --external-patch <path>",
          externalToolHandoff: {
            required: true,
            request: "Use this focused handoff as the implementation request.",
            allowedPaths: ["src/domain/order.ts"],
            filesNeedingAttention: ["src/domain/order.ts"],
            testCommand: "npm test",
            verifyCommand: "npm run verify",
          },
        },
        executionStatus: {
          stoppedAt: "budget",
          scopeCheck: "not_applicable",
          patchApply: "not_applicable",
          tests: "failed",
          verify: "not_run",
          nextActionOwner: "human_or_external_tool",
        },
        implementationBoundary: {
          jispecRole: "mediation_and_verification",
          businessCodeGeneratedByJiSpec: false,
          implementationOwner: "human_or_external_tool",
          note: "JiSpec constrains, records, tests, and verifies implementation work; it does not generate or own business-code implementation.",
        },
        scope: {
          status: "not_applicable",
          touchedPaths: [],
          allowedPaths: ["src/domain/order.ts"],
          violations: [],
        },
        test: {
          command: "npm test",
          passed: false,
          status: "failed",
        },
        verify: {
          status: "not_run",
        },
        suggestedActions: ["Review the focused handoff."],
      },
      summary: {
        whatWorked: ["No successful iterations"],
        whatFailed: ["No failed iterations"],
        lastError: "budget exhausted",
      },
      nextSteps: {
        suggestedActions: ["Run verify next: npm run verify"],
        filesNeedingAttention: ["src/domain/order.ts"],
        externalToolHandoff: {
          required: true,
          request: "Use this focused handoff as the implementation request.",
          allowedPaths: ["src/domain/order.ts"],
          filesNeedingAttention: ["src/domain/order.ts"],
          testCommand: "npm test",
          verifyCommand: "npm run verify",
        },
        testCommand: "npm test",
        verifyCommand: "npm run verify",
        verifyRecommendation: "Run the full verify gate next.",
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
          id: "change-handoff",
          createdAt: "2026-05-04T00:00:00.000Z",
          summary: "Tighten refund flow",
          laneDecision: {
            lane: "strict",
            reasons: ["domain core changed"],
            autoPromoted: false,
          },
          changedPaths: [{ path: "src/domain/order.ts", kind: "domain_core" }],
          baseRef: "HEAD",
          nextCommands: [{ command: "npm run verify", description: "Run full verify" }],
        },
        previousAttempt: {
          outcome: "budget_exhausted",
          stopPoint: "budget",
          failedCheck: "budget",
          summary: "Implementation mediation stopped because the configured budget was exhausted.",
          lastError: "budget exhausted",
        },
        inputs: {
          testCommand: "npm test",
          verifyCommand: "npm run verify",
          lane: "strict",
          changedPaths: ["src/domain/order.ts"],
          allowedPatchPaths: ["src/domain/order.ts"],
        },
        commands: {
          restore: "npm run jispec-cli -- implement --from-handoff .jispec/handoff/change-handoff.json",
          retryWithExternalPatch: "npm run jispec-cli -- implement --from-handoff .jispec/handoff/change-handoff.json --external-patch <path>",
          rerunVerify: "npm run verify",
        },
      },
      metadata: {
        createdAt: "2026-05-04T00:00:00.000Z",
        startedAt: "2026-05-04T00:00:00.000Z",
        completedAt: "2026-05-04T00:05:00.000Z",
      },
    };
    const handoffText = formatHandoffPacket(handoffPacket);
    assert.match(handoffText, /Affected artifact: src\/domain\/order\.ts/);
    assert.match(handoffText, /Replay command: npm run jispec-cli -- implement --from-handoff \.jispec\/handoff\/change-handoff\.json/);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p11-console-actions-"));
    try {
      writeJson(root, ".spec/policy.yaml", { version: 1, rules: [] });
      writeJson(root, ".jispec-ci/verify-report.json", {
        verdict: "PASS",
        counts: { total: 0, blocking: 0, advisory: 0 },
        modes: { unmatchedActiveWaiverIds: ["waiver-stale"] },
      });
      writeJson(root, ".spec/waivers/waiver-stale.json", {
        id: "waiver-stale",
        status: "active",
        owner: "team",
        reason: "stale",
        issueCode: "STALE",
        issuePath: ".spec/contracts/domain.yaml",
        createdAt: "2026-05-01T00:00:00.000Z",
      });

      const text = renderConsoleGovernanceActionPlanText(buildConsoleGovernanceActionPlan(root));
      assert.match(text, /Decision packet:/);
      assert.match(text, /Affected artifact: waiver:waiver-stale/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  summarize(results);
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

async function recordAsync(name: string, run: () => Promise<void>): Promise<TestResult> {
  try {
    await run();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarize(results: TestResult[]): void {
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

function getRepoRoot(): string {
  return path.resolve(__dirname, "..", "..", "..");
}

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", path.join(getRepoRoot(), "tools", "jispec", "cli.ts"), ...args], {
    cwd: getRepoRoot(),
    encoding: "utf-8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeYaml(root: string, relativePath: string, value: unknown): void {
  writeText(root, relativePath, yaml.dump(value, { lineWidth: 100, noRefs: true, sortKeys: false }));
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
