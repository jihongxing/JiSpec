import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { writeAgentRunSession, writeCompletionEvidence, writeDisciplineReport, writeDisciplineSummary } from "../discipline/artifacts";
import { buildCompletionEvidence } from "../discipline/completion-evidence";
import { resolveAgentRunDir, resolveCompletionEvidencePath, resolveDisciplineReportPath } from "../discipline/paths";
import { validatePhaseGate } from "../discipline/phase-gate";
import { buildTestStrategy, validateTestStrategy } from "../discipline/test-strategy";
import type { AgentRunSession, CompletionEvidence, DisciplineReport } from "../discipline/types";
import type { ChangeSession } from "../change/change-session";
import type { ImplementRunResult } from "../implement/implement-runner";
import { cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

async function main(): Promise<void> {
  console.log("=== Agent Discipline Artifact Tests ===\n");
  let passed = 0;
  let failed = 0;

  const root = createVerifyFixture("agent-discipline-artifacts");
  try {
    assert.equal(resolveAgentRunDir(root, "change-1"), path.join(root, ".jispec", "agent-run", "change-1"));
    assert.equal(resolveCompletionEvidencePath(root, "change-1"), path.join(root, ".jispec", "agent-run", "change-1", "completion-evidence.json"));
    assert.equal(resolveDisciplineReportPath(root, "change-1"), path.join(root, ".jispec", "agent-run", "change-1", "discipline-report.json"));
    assert.equal(fs.existsSync(path.join(root, ".jispec", "agent-run")), false);
    console.log("✓ Test 1: path helpers resolve stable agent-run artifact paths without creating directories");
    passed++;
  } catch (error) {
    console.error(`✗ Test 1 failed: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  } finally {
    cleanupVerifyFixture(root);
  }

  const artifactRoot = createVerifyFixture("agent-discipline-artifact-writers");
  try {
    const generatedAt = "2026-05-02T00:00:00.000Z";
    const truthSources = [
      { path: "docs/change.md", provenance: "EXTRACTED" as const, note: "Change intent source." },
    ];
    const session: AgentRunSession = {
      schemaVersion: 1,
      kind: "jispec-agent-discipline-session",
      sessionId: "change-1",
      generatedAt,
      mode: "strict_gate",
      currentPhase: "verify",
      transitions: [
        {
          phase: "implement",
          status: "passed",
          actor: "jispec",
          timestamp: generatedAt,
          sourceCommand: "jispec implement",
          truthSources,
        },
      ],
      allowedPaths: ["src/order.ts"],
      touchedPaths: ["src/order.ts"],
      unexpectedPaths: [],
      truthSources,
    };
    const completionEvidence: CompletionEvidence = {
      schemaVersion: 1,
      kind: "jispec-agent-completion-evidence",
      sessionId: "change-1",
      generatedAt,
      status: "verified",
      commands: [
        {
          command: "npm test",
          exitCode: 0,
          ranAt: generatedAt,
          evidenceKind: "test",
          summary: "Targeted tests passed.",
        },
      ],
      verifyCommand: "npm run verify",
      verifyVerdict: "PASS",
      missingEvidence: [],
      truthSources,
    };
    const report: DisciplineReport = {
      schemaVersion: 1,
      kind: "jispec-agent-discipline-report",
      sessionId: "change-1",
      generatedAt,
      mode: "strict_gate",
      phaseGate: {
        status: "passed",
        issues: [],
      },
      testStrategy: {
        status: "passed",
        ownerReviewRequired: false,
        command: "npm test",
      },
      completion: {
        status: "verified",
        missingEvidence: [],
      },
      isolation: {
        allowedPaths: ["src/order.ts"],
        touchedPaths: ["src/order.ts"],
        unexpectedPaths: [],
      },
      artifacts: {
        sessionPath: ".jispec/agent-run/change-1/session.json",
        completionEvidencePath: ".jispec/agent-run/change-1/completion-evidence.json",
        summaryPath: ".jispec/agent-run/change-1/discipline-summary.md",
      },
      truthSources,
    };

    assert.equal(writeAgentRunSession(artifactRoot, session), ".jispec/agent-run/change-1/session.json");
    assert.equal(writeCompletionEvidence(artifactRoot, completionEvidence), ".jispec/agent-run/change-1/completion-evidence.json");
    assert.equal(writeDisciplineReport(artifactRoot, report), ".jispec/agent-run/change-1/discipline-report.json");
    assert.equal(writeDisciplineSummary(artifactRoot, report), ".jispec/agent-run/change-1/discipline-summary.md");
    assert.equal(fs.existsSync(path.join(artifactRoot, ".jispec", "agent-run", "change-1", "session.json")), true);
    assert.equal(fs.existsSync(path.join(artifactRoot, ".jispec", "agent-run", "change-1", "completion-evidence.json")), true);
    assert.equal(fs.existsSync(path.join(artifactRoot, ".jispec", "agent-run", "change-1", "discipline-report.json")), true);
    assert.equal(fs.existsSync(path.join(artifactRoot, ".jispec", "agent-run", "change-1", "discipline-summary.md")), true);
    const summary = fs.readFileSync(path.join(artifactRoot, ".jispec", "agent-run", "change-1", "discipline-summary.md"), "utf-8");
    assert.match(summary, /Agent Discipline Summary/);
    assert.match(summary, /Completion: verified/);
    assert.match(summary, /This Markdown file is a human-readable companion/);
    console.log("✓ Test 2: artifact writers persist JSON contracts and human-readable summary");
    passed++;
  } catch (error) {
    console.error(`✗ Test 2 failed: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  } finally {
    cleanupVerifyFixture(artifactRoot);
  }

  try {
    const baseResult = {
      sessionId: "change-1",
      testsPassed: true,
      metadata: {
        startedAt: "2026-05-02T00:00:00.000Z",
        completedAt: "2026-05-02T00:01:00.000Z",
        testCommand: "npm test",
        verifyCommand: "npm run verify",
      },
    };
    const evidence = buildCompletionEvidence({
      ...baseResult,
      outcome: "patch_verified",
      postVerify: {
        command: "npm run verify",
        requestedLane: "strict",
        effectiveLane: "strict",
        autoPromoted: false,
        verdict: "PASS",
        ok: true,
        exitCode: 0,
        issueCount: 0,
        blockingIssueCount: 0,
        advisoryIssueCount: 0,
        nonBlockingErrorCount: 0,
      },
    } as ImplementRunResult, "2026-05-02T00:02:00.000Z");

    assert.equal(evidence.status, "verified");
    assert.equal(evidence.verifyVerdict, "PASS");
    assert.equal(evidence.commands.some((command) => command.evidenceKind === "test"), true);
    assert.equal(evidence.commands.some((command) => command.evidenceKind === "verify"), true);
    console.log("✓ Test 3: completion evidence marks passing post-verify as verified");
    passed++;
  } catch (error) {
    console.error(`✗ Test 3 failed: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }

  try {
    const evidence = buildCompletionEvidence({
      outcome: "patch_verified",
      sessionId: "change-1",
      testsPassed: true,
      metadata: {
        startedAt: "2026-05-02T00:00:00.000Z",
        completedAt: "2026-05-02T00:01:00.000Z",
        testCommand: "npm test",
        verifyCommand: "npm run verify",
      },
      postVerify: {
        command: "npm run verify",
        requestedLane: "strict",
        effectiveLane: "strict",
        autoPromoted: false,
        verdict: "WARN_ADVISORY",
        ok: true,
        exitCode: 0,
        issueCount: 1,
        blockingIssueCount: 0,
        advisoryIssueCount: 1,
        nonBlockingErrorCount: 0,
      },
    } as ImplementRunResult, "2026-05-02T00:02:00.000Z");

    assert.equal(evidence.status, "verified_with_advisory");
    assert.equal(evidence.verifyVerdict, "WARN_ADVISORY");
    console.log("✓ Test 4: completion evidence preserves advisory post-verify status");
    passed++;
  } catch (error) {
    console.error(`✗ Test 4 failed: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }

  try {
    const evidence = buildCompletionEvidence({
      outcome: "verify_blocked",
      sessionId: "change-1",
      testsPassed: true,
      metadata: {
        startedAt: "2026-05-02T00:00:00.000Z",
        completedAt: "2026-05-02T00:01:00.000Z",
        testCommand: "npm test",
        verifyCommand: "npm run verify",
      },
      postVerify: {
        command: "npm run verify",
        requestedLane: "strict",
        effectiveLane: "strict",
        autoPromoted: false,
        verdict: "FAIL_BLOCKING",
        ok: false,
        exitCode: 1,
        issueCount: 1,
        blockingIssueCount: 1,
        advisoryIssueCount: 0,
        nonBlockingErrorCount: 0,
      },
    } as ImplementRunResult, "2026-05-02T00:02:00.000Z");

    assert.equal(evidence.status, "blocked");
    assert.equal(evidence.verifyVerdict, "FAIL_BLOCKING");
    console.log("✓ Test 5: completion evidence marks verify-blocked outcomes as blocked");
    passed++;
  } catch (error) {
    console.error(`✗ Test 5 failed: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }

  try {
    const evidence = buildCompletionEvidence({
      outcome: "patch_verified",
      sessionId: "change-1",
      testsPassed: true,
      metadata: {
        startedAt: "2026-05-02T00:00:00.000Z",
        completedAt: "2026-05-02T00:01:00.000Z",
        testCommand: "npm test",
        verifyCommand: "npm run verify",
      },
    } as ImplementRunResult, "2026-05-02T00:02:00.000Z");

    assert.equal(evidence.status, "ready_for_verify");
    assert.deepEqual(evidence.missingEvidence, ["verify result missing"]);
    assert.equal(evidence.verifyCommand, "npm run verify");
    console.log("✓ Test 6: completion evidence records missing post-verify as ready for verify");
    passed++;
  } catch (error) {
    console.error(`✗ Test 6 failed: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }

  try {
    const session: AgentRunSession = {
      schemaVersion: 1,
      kind: "jispec-agent-discipline-session",
      sessionId: "change-1",
      generatedAt: "2026-05-02T00:00:00.000Z",
      mode: "strict_gate",
      currentPhase: "handoff",
      transitions: [
        {
          phase: "intent",
          status: "passed",
          actor: "jispec",
          timestamp: "2026-05-02T00:00:00.000Z",
          sourceCommand: "jispec change",
          truthSources: [],
        },
        {
          phase: "implement",
          status: "passed",
          actor: "jispec",
          timestamp: "2026-05-02T00:01:00.000Z",
          sourceCommand: "jispec implement",
          truthSources: [],
        },
        {
          phase: "handoff",
          status: "passed",
          actor: "jispec",
          timestamp: "2026-05-02T00:02:00.000Z",
          sourceCommand: "jispec handoff",
          truthSources: [],
        },
      ],
      allowedPaths: ["src/order.ts"],
      touchedPaths: ["src/order.ts"],
      unexpectedPaths: [],
      truthSources: [],
    };
    const result = validatePhaseGate(session);

    assert.equal(result.status, "failed");
    assert.deepEqual(result.issues, [
      "strict implementation requires plan phase evidence",
      "handoff phase requires verify phase evidence",
    ]);
    console.log("✓ Test 7: strict phase gate requires plan and verify evidence before handoff");
    passed++;
  } catch (error) {
    console.error(`✗ Test 7 failed: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }

  try {
    const session: AgentRunSession = {
      schemaVersion: 1,
      kind: "jispec-agent-discipline-session",
      sessionId: "change-1",
      generatedAt: "2026-05-02T00:00:00.000Z",
      mode: "fast_advisory",
      currentPhase: "implement",
      transitions: [
        {
          phase: "intent",
          status: "passed",
          actor: "jispec",
          timestamp: "2026-05-02T00:00:00.000Z",
          sourceCommand: "jispec change --fast",
          truthSources: [],
        },
        {
          phase: "implement",
          status: "passed",
          actor: "jispec",
          timestamp: "2026-05-02T00:01:00.000Z",
          sourceCommand: "jispec implement --fast",
          truthSources: [],
        },
      ],
      allowedPaths: ["docs/guide.md"],
      touchedPaths: ["docs/guide.md"],
      unexpectedPaths: [],
      truthSources: [],
    };
    const result = validatePhaseGate(session);

    assert.equal(session.mode, "fast_advisory");
    assert.equal(result.status, "passed");
    assert.deepEqual(result.issues, []);
    console.log("✓ Test 8: fast advisory phase gate allows implementation without plan evidence");
    passed++;
  } catch (error) {
    console.error(`✗ Test 8 failed: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }

  try {
    const session = buildChangeSession("change-docs", "fast", [{ path: "docs/guide.md", kind: "docs_only" }]);
    const strategy = buildTestStrategy(session, undefined, true);
    const result = validateTestStrategy(strategy);

    assert.equal(strategy.scope, "docs_only");
    assert.equal(strategy.command, "npm run jispec-cli -- verify --fast");
    assert.equal(strategy.ownerReviewRequired, false);
    assert.equal(result.status, "passed");
    assert.deepEqual(result.issues, []);
    console.log("✓ Test 9: docs-only test strategy can use fast verify");
    passed++;
  } catch (error) {
    console.error(`✗ Test 9 failed: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }

  try {
    const session = buildChangeSession("change-contract", "strict", [{ path: "src/domain/order.ts", kind: "domain_core" }]);
    const strategy = buildTestStrategy(session, "", false);
    const result = validateTestStrategy(strategy);

    assert.equal(strategy.scope, "contract_critical");
    assert.equal(strategy.deterministic, false);
    assert.equal(strategy.ownerReviewRequired, true);
    assert.equal(result.status, "failed");
    assert.ok(result.issues.includes("contract-critical change requires deterministic verification"));
    console.log("✓ Test 10: contract-critical test strategy requires deterministic verification");
    passed++;
  } catch (error) {
    console.error(`✗ Test 10 failed: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);
  if (failed > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

function buildChangeSession(id: string, lane: "fast" | "strict", changedPaths: ChangeSession["changedPaths"]): ChangeSession {
  return {
    id,
    createdAt: "2026-05-02T00:00:00.000Z",
    summary: `Session ${id}`,
    laneDecision: {
      lane,
      reasons: [],
      autoPromoted: false,
    },
    changedPaths,
    nextCommands: [],
  };
}
