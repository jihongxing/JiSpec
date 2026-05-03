import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildVerifyReport } from "../ci/verify-report";
import { renderVerifySummaryMarkdown } from "../ci/verify-summary";
import { clearChangeSession, writeChangeSession, type ChangeSession } from "../change/change-session";
import { findLatestDisciplineReport } from "../discipline/artifacts";
import type { DisciplineReport } from "../discipline/types";
import { runVerify } from "../verify/verify-runner";
import { cleanupVerifyFixture, createVerifyFixture, FIXED_GENERATED_AT } from "./verify-test-helpers";

async function main(): Promise<void> {
  console.log("=== Agent Discipline Verify CI Tests ===\n");

  let passed = 0;
  let failed = 0;

  const strictRoot = createVerifyFixture("agent-discipline-verify-strict");
  try {
    writeDisciplineReport(strictRoot, buildReport("change-1", "strict_gate", "blocked", "2026-05-02T00:00:00.000Z"));
    writeDisciplineReport(strictRoot, buildReport("change-2", "strict_gate", "verified", "2026-05-03T00:00:00.000Z"));
    writeChangeSession(strictRoot, buildSession("change-1"));

    const activeLatest = findLatestDisciplineReport(strictRoot);
    assert.equal(activeLatest?.report.sessionId, "change-1");

    clearChangeSession(strictRoot);
    const fallbackLatest = findLatestDisciplineReport(strictRoot);
    assert.equal(fallbackLatest?.report.sessionId, "change-2");

    writeChangeSession(strictRoot, buildSession("change-1"));
    const result = await runVerify({ root: strictRoot, generatedAt: FIXED_GENERATED_AT });
    assert.equal(result.verdict, "FAIL_BLOCKING");
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === "AGENT_DISCIPLINE_INCOMPLETE" && issue.severity === "blocking"));
    console.log("✓ Test 1: strict discipline report blocks verify and active session report wins latest lookup");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(strictRoot);
  }

  const fastRoot = createVerifyFixture("agent-discipline-verify-fast");
  try {
    writeDisciplineReport(fastRoot, buildReport("change-fast", "fast_advisory", "blocked", "2026-05-02T00:00:00.000Z"));
    const result = await runVerify({ root: fastRoot, generatedAt: FIXED_GENERATED_AT });

    assert.equal(result.verdict, "WARN_ADVISORY");
    assert.equal(result.ok, true);
    assert.ok(result.issues.some((issue) => issue.code === "AGENT_DISCIPLINE_INCOMPLETE" && issue.severity === "advisory"));
    console.log("✓ Test 2: fast advisory discipline findings stay advisory");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(fastRoot);
  }

  const ciRoot = createVerifyFixture("agent-discipline-ci-report");
  try {
    writeDisciplineReport(ciRoot, buildReport("change-ci", "fast_advisory", "blocked", "2026-05-02T00:00:00.000Z"));
    const result = await runVerify({ root: ciRoot, generatedAt: FIXED_GENERATED_AT });
    const report = buildVerifyReport(result, {
      repoRoot: ciRoot,
      provider: "local",
    });
    const agentDiscipline = report.modes?.agentDiscipline as { latestReportPath?: string; completionStatus?: string; mode?: string } | undefined;

    assert.equal(agentDiscipline?.latestReportPath, ".jispec/agent-run/change-ci/discipline-report.json");
    assert.equal(agentDiscipline?.completionStatus, "blocked");
    assert.equal(agentDiscipline?.mode, "fast_advisory");

    const summary = renderVerifySummaryMarkdown(report);
    assert.ok(summary.includes("Agent discipline: `.jispec/agent-run/change-ci/discipline-report.json` (blocked)"));
    console.log("✓ Test 3: CI verify report and summary link latest discipline evidence");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(ciRoot);
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

function buildSession(id: string): ChangeSession {
  return {
    id,
    createdAt: "2026-05-02T00:00:00.000Z",
    summary: `Change ${id}`,
    laneDecision: {
      lane: "strict",
      reasons: ["agent discipline verify test"],
      autoPromoted: false,
    },
    changedPaths: [{ path: "docs/discipline.md", kind: "docs_only" }],
    nextCommands: [{ command: "npm run verify", description: "Run verify" }],
  };
}

function buildReport(
  sessionId: string,
  mode: DisciplineReport["mode"],
  completionStatus: DisciplineReport["completion"]["status"],
  generatedAt: string,
): DisciplineReport {
  return {
    schemaVersion: 1,
    kind: "jispec-agent-discipline-report",
    sessionId,
    generatedAt,
    mode,
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
      status: completionStatus,
      missingEvidence: completionStatus === "verified" ? [] : ["verify result missing"],
    },
    isolation: {
      allowedPaths: ["docs/discipline.md"],
      touchedPaths: ["docs/discipline.md"],
      unexpectedPaths: [],
    },
    artifacts: {
      sessionPath: `.jispec/agent-run/${sessionId}/session.json`,
      completionEvidencePath: `.jispec/agent-run/${sessionId}/completion-evidence.json`,
      summaryPath: `.jispec/agent-run/${sessionId}/discipline-summary.md`,
    },
    truthSources: [
      { path: ".jispec/change-session.json", provenance: "EXTRACTED", note: "Change session fixture." },
    ],
  };
}

function writeDisciplineReport(root: string, report: DisciplineReport): void {
  const reportPath = path.join(root, ".jispec", "agent-run", report.sessionId, "discipline-report.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
