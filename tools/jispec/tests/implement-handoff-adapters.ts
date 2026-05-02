import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildExternalToolHandoffRequest,
  parseExternalCodingTool,
  writeExternalToolHandoffRequest,
  type ExternalCodingTool,
} from "../implement/adapters/handoff-adapter";
import type { HandoffPacket } from "../implement/handoff-packet";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Implement Handoff Adapter Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("adapter contract supports named external coding tools", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-handoff-adapters-tools-"));
    try {
      writeFixtureHandoff(root);
      const tools: ExternalCodingTool[] = ["codex", "claude_code", "cursor", "copilot", "devin"];
      for (const tool of tools) {
        const request = buildExternalToolHandoffRequest(root, ".jispec/handoff/change-adapter.json", tool, "2026-05-02T00:00:00.000Z");
        assert.equal(request.version, 1);
        assert.equal(request.kind, "jispec-external-coding-tool-handoff");
        assert.equal(request.tool.id, tool);
        assert.equal(request.tool.adapterVersion, 1);
        assert.equal(request.sourceHandoff.replayable, true);
        assert.equal(request.request.stopPoint, "budget");
        assert.equal(request.request.failedCheck, "budget");
      }
      assert.equal(parseExternalCodingTool("claude-code"), "claude_code");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("request packet carries focused paths, contracts, checks, and return command", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-handoff-adapters-request-"));
    try {
      writeFixtureHandoff(root);
      const request = buildExternalToolHandoffRequest(root, "change-adapter", "codex", "2026-05-02T00:00:00.000Z");
      assert.deepEqual(request.request.allowedPaths, ["src/domain/order.ts"]);
      assert.deepEqual(request.request.filesNeedingAttention, ["src/domain/order.ts"]);
      assert.ok(request.request.contractFocus.includes(".spec/contracts/domain.yaml"));
      assert.ok(request.request.contractFocus.includes(".spec/spec-debt/bootstrap/feature.json"));
      assert.ok(request.request.contractFocus.includes("path_kind:domain_core"));
      assert.equal(request.request.testCommand, "npm test -- order");
      assert.equal(request.request.verifyCommand, "npm run verify");
      assert.equal(
        request.request.returnPatchCommand,
        "npm run jispec-cli -- implement --from-handoff .jispec/handoff/change-adapter.json --external-patch <path>",
      );
      assert.match(request.prompt, /Produce a unified diff patch only for the allowed paths/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("adapter boundary prevents external tool bypass of scope, tests, and verify", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-handoff-adapters-boundary-"));
    try {
      writeFixtureHandoff(root);
      const request = buildExternalToolHandoffRequest(root, "change-adapter", "devin", "2026-05-02T00:00:00.000Z");
      assert.equal(request.contract.integrationContractVersion, 1);
      assert.equal(request.contract.payloadRole, "external_coding_tool_request");
      assert.equal(request.contract.localArtifactsRemainSourceOfTruth, true);
      assert.equal(request.contract.previewOnly, true);
      assert.equal(request.contract.requiredReturnPath, "implement_external_patch");
      assert.deepEqual(request.contract.mediatedChecks, ["scope_check", "tests", "verify"]);
      assert.equal(request.constraints.patchFormat, "unified_diff");
      assert.equal(request.constraints.allowedPathsOnly, true);
      assert.equal(request.constraints.doNotRunAsFinalAuthority, true);
      assert.equal(request.constraints.doNotUploadSourceRequiredByJiSpec, true);
      assert.equal(request.authorityBoundary.adapterOnlyChangesRequestFormat, true);
      assert.equal(request.authorityBoundary.patchMustReturnThroughImplementExternalPatch, true);
      assert.equal(request.authorityBoundary.scopeCheckRequired, true);
      assert.equal(request.authorityBoundary.testsRequired, true);
      assert.equal(request.authorityBoundary.verifyRequired, true);
      assert.equal(request.authorityBoundary.llmIsNotBlockingJudge, true);
      assert.match(request.replay.retryWithExternalPatchCommand, /implement .*--external-patch <path>/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("writer emits JSON and Markdown companion without mutating source handoff", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-handoff-adapters-write-"));
    try {
      const handoffPath = writeFixtureHandoff(root);
      const before = fs.readFileSync(handoffPath, "utf-8");
      const result = writeExternalToolHandoffRequest({
        root,
        fromHandoff: "change-adapter",
        tool: "cursor",
        createdAt: "2026-05-02T00:00:00.000Z",
      });
      assert.equal(fs.existsSync(result.requestPath), true);
      assert.equal(fs.existsSync(result.summaryPath), true);
      assert.equal(JSON.parse(fs.readFileSync(result.requestPath, "utf-8")).tool.id, "cursor");
      assert.match(fs.readFileSync(result.summaryPath, "utf-8"), /JiSpec External Coding Tool Handoff/);
      assert.equal(fs.readFileSync(handoffPath, "utf-8"), before);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("CLI exports adapter request JSON and schema documents boundary fields", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-handoff-adapters-cli-"));
    try {
      writeFixtureHandoff(root);
      const result = runCli([
        "handoff",
        "adapter",
        "--root",
        root,
        "--from-handoff",
        "change-adapter",
        "--tool",
        "copilot",
        "--json",
      ]);
      assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout) as { request: { tool: { id: string }; authorityBoundary: Record<string, unknown> }; requestPath: string };
      assert.equal(payload.request.tool.id, "copilot");
      assert.equal(payload.request.authorityBoundary.patchMustReturnThroughImplementExternalPatch, true);
      assert.equal(fs.existsSync(payload.requestPath), true);

      const schema = fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "schemas", "implementation-handoff.schema.json"), "utf-8");
      assert.match(schema, /codex/);
      assert.match(schema, /claude_code/);
      assert.match(schema, /integrationContractVersion/);
      assert.match(schema, /requiredReturnPath/);
      assert.match(schema, /patchMustReturnThroughImplementExternalPatch/);
      assert.match(schema, /scopeCheckRequired/);
      assert.match(schema, /verifyRequired/);
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

function writeFixtureHandoff(root: string): string {
  const packet: HandoffPacket = {
    sessionId: "change-adapter",
    changeIntent: "Tighten refund handling",
    outcome: "budget_exhausted",
    iterations: 1,
    tokensUsed: 0,
    costUSD: 0,
    contractContext: {
      lane: "strict",
      changedPaths: ["src/domain/order.ts"],
      changedPathKinds: ["domain_core"],
      bootstrapTakeoverPresent: true,
      adoptedContractPaths: [".spec/contracts/domain.yaml"],
      deferredSpecDebtPaths: [".spec/spec-debt/bootstrap/feature.json"],
    },
    decisionPacket: {
      state: "needs_external_patch",
      stopPoint: "budget",
      mergeable: false,
      summary: "Implementation mediation stopped because budget was exhausted.",
      nextAction: "Use the handoff packet as the request for an external coding tool patch.",
      nextActionDetail: {
        type: "submit_external_patch",
        owner: "human_or_external_tool",
        failedCheck: "budget",
        command: "npm run jispec-cli -- implement --session-id change-adapter --external-patch <path>",
        externalToolHandoff: {
          required: true,
          request: "Implement the refund handling change and return a scoped patch.",
          allowedPaths: ["src/domain/order.ts"],
          filesNeedingAttention: ["src/domain/order.ts"],
          testCommand: "npm test -- order",
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
        note: "JiSpec constrains, records, tests, and verifies implementation work.",
      },
      scope: {
        status: "not_applicable",
        touchedPaths: [],
        allowedPaths: ["src/domain/order.ts"],
        violations: [],
      },
      test: {
        command: "npm test -- order",
        passed: false,
        status: "failed",
      },
      verify: {
        status: "not_run",
      },
      suggestedActions: ["Run tests manually: npm test -- order"],
    },
    summary: {
      whatWorked: ["Contract context was narrowed"],
      whatFailed: ["Iteration 1: test still failed"],
      lastError: "Expected mediated refund status.",
    },
    nextSteps: {
      suggestedActions: ["Run tests manually: npm test -- order"],
      filesNeedingAttention: ["src/domain/order.ts"],
      externalToolHandoff: {
        required: true,
        request: "Implement the refund handling change and return a scoped patch.",
        allowedPaths: ["src/domain/order.ts"],
        filesNeedingAttention: ["src/domain/order.ts"],
        testCommand: "npm test -- order",
        verifyCommand: "npm run verify",
      },
      testCommand: "npm test -- order",
      verifyCommand: "npm run verify",
      verifyRecommendation: "Run the full verify gate next.",
    },
    episodeMemory: {
      attemptedHypotheses: ["external patch request"],
      rejectedPaths: [],
    },
    replay: {
      version: 1,
      replayable: true,
      source: "handoff_packet",
      sourceSession: {
        id: "change-adapter",
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
        outcome: "budget_exhausted",
        stopPoint: "budget",
        failedCheck: "budget",
        summary: "Budget exhausted.",
        lastError: "Expected mediated refund status.",
      },
      inputs: {
        testCommand: "npm test -- order",
        verifyCommand: "npm run verify",
        lane: "strict",
        changedPaths: ["src/domain/order.ts"],
        allowedPatchPaths: ["src/domain/order.ts"],
      },
      commands: {
        restore: "npm run jispec-cli -- implement --from-handoff .jispec/handoff/change-adapter.json",
        retryWithExternalPatch: "npm run jispec-cli -- implement --from-handoff .jispec/handoff/change-adapter.json --external-patch <path>",
        rerunVerify: "npm run verify",
      },
    },
    metadata: {
      createdAt: "2026-05-02T00:00:00.000Z",
      startedAt: "2026-05-02T00:00:00.000Z",
      completedAt: "2026-05-02T00:01:00.000Z",
    },
  };
  const handoffPath = path.join(root, ".jispec", "handoff", "change-adapter.json");
  fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
  fs.writeFileSync(handoffPath, `${JSON.stringify(packet, null, 2)}\n`, "utf-8");
  return handoffPath;
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
