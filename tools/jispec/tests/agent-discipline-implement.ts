import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readAuditEvents } from "../audit/event-ledger";
import { writeChangeSession, type ChangeSession } from "../change/change-session";
import { renderImplementText, runImplement } from "../implement/implement-runner";
import { formatHandoffPacket } from "../implement/handoff-packet";
import { cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

function buildSession(
  id: string,
  lane: "fast" | "strict",
  changedPath: string,
  kind: ChangeSession["changedPaths"][number]["kind"],
): ChangeSession {
  return {
    id,
    createdAt: "2026-05-02T00:00:00.000Z",
    summary: `Agent discipline session ${id}`,
    laneDecision: {
      lane,
      reasons: lane === "fast" ? ["all changes are safe for fast lane"] : [`changed path hits governed scope: ${changedPath}`],
      autoPromoted: false,
    },
    changedPaths: [{ path: changedPath, kind }],
    baseRef: "HEAD",
    nextCommands: lane === "fast"
      ? [{ command: "npm run jispec-cli -- verify --fast", description: "Run fast verify" }]
      : [{ command: "npm run verify", description: "Run full verify" }],
  };
}

async function main(): Promise<void> {
  console.log("=== Agent Discipline Implement Tests ===\n");

  let passed = 0;
  let failed = 0;

  const docsFixture = createVerifyFixture("agent-discipline-docs-patch");
  try {
    const sessionId = "change-docs-discipline";
    writeChangeSession(docsFixture, buildSession(sessionId, "fast", "docs/discipline.md", "docs_only"));
    const patchPath = writePatch(docsFixture, "docs.patch", [
      "diff --git a/docs/discipline.md b/docs/discipline.md",
      "new file mode 100644",
      "index 0000000..e69de29",
      "--- /dev/null",
      "+++ b/docs/discipline.md",
      "@@ -0,0 +1 @@",
      "+# Agent discipline docs",
    ]);

    const result = await runImplement({
      root: docsFixture,
      fast: true,
      externalPatchPath: patchPath,
      testCommand: 'node -e "const fs=require(\'fs\');process.exit(fs.existsSync(\'docs/discipline.md\')?0:1)"',
    });

    assert.equal(result.outcome, "patch_verified");
    assertAgentArtifacts(docsFixture, sessionId);
    assert.ok(renderImplementText(result).includes("Agent discipline:"));
    assert.equal(result.metadata.agentDiscipline?.disciplineReportPath, `.jispec/agent-run/${sessionId}/discipline-report.json`);
    const report = readJson(docsFixture, sessionId, "discipline-report.json");
    assert.equal(report.mode, "fast_advisory");
    assert.equal(report.completion.status, "verified");
    assert.equal(report.testStrategy.command, result.metadata.testCommand);
    assert.equal(readJson(docsFixture, sessionId, "completion-evidence.json").status, "verified");
    assertDisciplineAudit(docsFixture, sessionId, "verified");
    console.log("✓ Test 1: docs-only verified patch writes discipline artifacts and audit event");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(docsFixture);
  }

  const failingFixture = createVerifyFixture("agent-discipline-failing-patch");
  try {
    const sessionId = "change-failing-discipline";
    writeChangeSession(failingFixture, buildSession(sessionId, "fast", "docs/failing.md", "docs_only"));
    const patchPath = writePatch(failingFixture, "failing.patch", [
      "diff --git a/docs/failing.md b/docs/failing.md",
      "new file mode 100644",
      "index 0000000..e69de29",
      "--- /dev/null",
      "+++ b/docs/failing.md",
      "@@ -0,0 +1 @@",
      "+# Failing discipline patch",
    ]);

    const result = await runImplement({
      root: failingFixture,
      fast: true,
      externalPatchPath: patchPath,
      testCommand: 'node -e "console.error(\'mediated test failed\');process.exit(1)"',
    });

    assert.equal(result.outcome, "external_patch_received");
    assertAgentArtifacts(failingFixture, sessionId);
    assert.equal(readJson(failingFixture, sessionId, "completion-evidence.json").status, "blocked");
    assert.equal(readJson(failingFixture, sessionId, "discipline-report.json").completion.status, "blocked");
    const debugPacket = readJson(failingFixture, sessionId, "debug-packet.json");
    assert.equal(debugPacket.kind, "jispec-agent-debug-packet");
    assert.equal(debugPacket.stopPoint, "test");
    assert.equal(debugPacket.failingCheck, "tests");
    assert.match(debugPacket.minimalReproductionCommand, /node -e/);
    assert.ok(debugPacket.observedEvidence.some((entry: string) => entry.includes("mediated test")));
    assert.ok(result.handoffPacket?.discipline);
    assert.ok(result.handoffPacket?.reviewDiscipline);
    assert.match(formatHandoffPacket(result.handoffPacket!), /Agent discipline:/);
    assert.match(formatHandoffPacket(result.handoffPacket!), /Review discipline:/);
    assertDisciplineAudit(failingFixture, sessionId, "blocked");
    console.log("✓ Test 2: failing mediated test writes blocked completion discipline evidence");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(failingFixture);
  }

  const rejectedFixture = createVerifyFixture("agent-discipline-rejected-patch");
  try {
    const sessionId = "change-rejected-discipline";
    writeChangeSession(rejectedFixture, buildSession(sessionId, "fast", "docs/allowed.md", "docs_only"));
    const patchPath = writePatch(rejectedFixture, "rejected.patch", [
      "diff --git a/src/domain/order.ts b/src/domain/order.ts",
      "new file mode 100644",
      "index 0000000..e69de29",
      "--- /dev/null",
      "+++ b/src/domain/order.ts",
      "@@ -0,0 +1 @@",
      "+export const outOfScope = true;",
    ]);

    const result = await runImplement({
      root: rejectedFixture,
      fast: true,
      externalPatchPath: patchPath,
      testCommand: 'node -e "process.exit(0)"',
    });

    assert.equal(result.outcome, "patch_rejected_out_of_scope");
    assertAgentArtifacts(rejectedFixture, sessionId);
    const report = readJson(rejectedFixture, sessionId, "discipline-report.json");
    assert.deepEqual(report.isolation.unexpectedPaths, ["src/domain/order.ts"]);
    assert.equal(report.completion.status, "blocked");
    assertDisciplineAudit(rejectedFixture, sessionId, "blocked");
    console.log("✓ Test 3: out-of-scope patch records unexpected discipline paths");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(rejectedFixture);
  }

  const strictFixture = createVerifyFixture("agent-discipline-strict-patch");
  try {
    const sessionId = "change-strict-discipline";
    const sourcePath = path.join(strictFixture, "src", "domain", "order.ts");
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, 'export const status = "pending";\n', "utf-8");
    writeChangeSession(strictFixture, buildSession(sessionId, "strict", "src/domain/order.ts", "domain_core"));
    const patchPath = writePatch(strictFixture, "strict.patch", [
      "diff --git a/src/domain/order.ts b/src/domain/order.ts",
      "index 62dbef8..9c8d4af 100644",
      "--- a/src/domain/order.ts",
      "+++ b/src/domain/order.ts",
      "@@ -1 +1 @@",
      '-export const status = "pending";',
      '+export const status = "mediated";',
    ]);

    const result = await runImplement({
      root: strictFixture,
      externalPatchPath: patchPath,
      testCommand: 'node -e "const fs=require(\'fs\');process.exit(fs.readFileSync(\'src/domain/order.ts\',\'utf8\').includes(\'mediated\')?0:1)"',
    });

    assert.equal(result.outcome, "patch_verified");
    assertAgentArtifacts(strictFixture, sessionId);
    const report = readJson(strictFixture, sessionId, "discipline-report.json");
    assert.equal(report.mode, "strict_gate");
    assert.equal(report.testStrategy.status, "passed");
    assert.equal(report.testStrategy.ownerReviewRequired, false);
    assert.equal(report.completion.status, "verified");
    assertDisciplineAudit(strictFixture, sessionId, "verified");
    console.log("✓ Test 4: strict code patch records strict deterministic test strategy");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(strictFixture);
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

function assertAgentArtifacts(root: string, sessionId: string): void {
  assert.ok(fs.existsSync(path.join(root, ".jispec", "agent-run", sessionId, "session.json")));
  assert.ok(fs.existsSync(path.join(root, ".jispec", "agent-run", sessionId, "completion-evidence.json")));
  assert.ok(fs.existsSync(path.join(root, ".jispec", "agent-run", sessionId, "discipline-report.json")));
  assert.ok(fs.existsSync(path.join(root, ".jispec", "agent-run", sessionId, "discipline-summary.md")));
}

function assertDisciplineAudit(root: string, sessionId: string, completionStatus: string): void {
  const disciplineEvents = readAuditEvents(root).filter((event) => event.type === "agent_discipline_recorded");
  assert.equal(disciplineEvents.length, 1);
  assert.equal(disciplineEvents[0]?.sourceArtifact.kind, "agent-discipline-report");
  assert.equal(disciplineEvents[0]?.sourceArtifact.path, `.jispec/agent-run/${sessionId}/discipline-report.json`);
  assert.equal(disciplineEvents[0]?.details?.sessionId, sessionId);
  assert.equal(disciplineEvents[0]?.details?.completionStatus, completionStatus);
}

function readJson(root: string, sessionId: string, name: string): any {
  return JSON.parse(fs.readFileSync(path.join(root, ".jispec", "agent-run", sessionId, name), "utf-8"));
}

function writePatch(root: string, name: string, lines: string[]): string {
  const patchDir = path.join(root, ".jispec", "patches");
  fs.mkdirSync(patchDir, { recursive: true });
  const patchPath = path.join(patchDir, name);
  fs.writeFileSync(patchPath, `${lines.join("\n")}\n`, "utf-8");
  return patchPath;
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
