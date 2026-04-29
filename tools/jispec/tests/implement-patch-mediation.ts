import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { renderImplementJSON, renderImplementText, runImplement } from "../implement/implement-runner";
import { readArchivedChangeSession, readChangeSession, writeChangeSession, type ChangeSession } from "../change/change-session";
import { cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

function buildSession(
  id: string,
  lane: "fast" | "strict",
  changedPath: string,
  kind: ChangeSession["changedPaths"][number]["kind"],
): ChangeSession {
  return {
    id,
    createdAt: "2026-04-29T00:00:00.000Z",
    summary: `Patch mediation session ${id}`,
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
  console.log("=== Implement Patch Mediation Tests ===\n");

  let passed = 0;
  let failed = 0;

  const docsFixture = createVerifyFixture("implement-patch-docs");
  try {
    writeChangeSession(docsFixture, buildSession("change-docs-patch", "fast", "docs/patch-mediated.md", "docs_only"));
    const patchPath = writePatch(docsFixture, "docs.patch", [
      "diff --git a/docs/patch-mediated.md b/docs/patch-mediated.md",
      "new file mode 100644",
      "index 0000000..e69de29",
      "--- /dev/null",
      "+++ b/docs/patch-mediated.md",
      "@@ -0,0 +1,2 @@",
      "+# Mediated Patch",
      "+accepted by external patch intake",
    ]);

    const result = await runImplement({
      root: docsFixture,
      fast: true,
      externalPatchPath: patchPath,
      testCommand: 'node -e "const fs=require(\'fs\');process.exit(fs.readFileSync(\'docs/patch-mediated.md\',\'utf8\').includes(\'external patch intake\')?0:1)"',
    });

    assert.equal(result.outcome, "patch_verified");
    assert.ok(renderImplementText(result).includes("Outcome: patch_verified"));
    assert.equal(JSON.parse(renderImplementJSON(result)).outcome, "patch_verified");
    assert.equal(result.patchMediation?.status, "accepted");
    assert.deepEqual(result.patchMediation?.touchedPaths, ["docs/patch-mediated.md"]);
    assert.equal(result.patchMediation?.test?.passed, true);
    assert.equal(result.postVerify?.verdict, "PASS");
    assert.equal(result.metadata.sessionArchived, true);
    assert.equal(readChangeSession(docsFixture), null);
    assert.ok(readArchivedChangeSession(docsFixture, "change-docs-patch"));
    console.log("✓ Test 1: docs-only external patch is scoped, applied, tested, verified, and archived");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(docsFixture);
  }

  const codeFixture = createVerifyFixture("implement-patch-code");
  try {
    const sourcePath = path.join(codeFixture, "src", "domain", "order.ts");
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, 'export const refundStatus = "pending";\n', "utf-8");
    writeChangeSession(codeFixture, buildSession("change-code-patch", "strict", "src/domain/order.ts", "domain_core"));
    const patchPath = writePatch(codeFixture, "code.patch", [
      "diff --git a/src/domain/order.ts b/src/domain/order.ts",
      "index 2ddc7cb..e07a8bd 100644",
      "--- a/src/domain/order.ts",
      "+++ b/src/domain/order.ts",
      "@@ -1 +1 @@",
      '-export const refundStatus = "pending";',
      '+export const refundStatus = "mediated";',
    ]);

    const result = await runImplement({
      root: codeFixture,
      externalPatchPath: patchPath,
      testCommand: 'node -e "const fs=require(\'fs\');process.exit(fs.readFileSync(\'src/domain/order.ts\',\'utf8\').includes(\'mediated\')?0:1)"',
    });

    assert.equal(result.outcome, "patch_verified");
    assert.equal(result.lane, "strict");
    assert.equal(result.patchMediation?.applied, true);
    assert.deepEqual(result.patchMediation?.allowedPaths, ["src/domain/order.ts"]);
    assert.equal(result.postVerify?.command, "npm run verify");
    console.log("✓ Test 2: small code external patch is mediated without JiSpec generating business code");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(codeFixture);
  }

  const rejectedFixture = createVerifyFixture("implement-patch-rejected");
  try {
    writeChangeSession(rejectedFixture, buildSession("change-rejected-patch", "fast", "docs/allowed.md", "docs_only"));
    const patchPath = writePatch(rejectedFixture, "rejected.patch", [
      "diff --git a/src/domain/order.ts b/src/domain/order.ts",
      "new file mode 100644",
      "index 0000000..e69de29",
      "--- /dev/null",
      "+++ b/src/domain/order.ts",
      "@@ -0,0 +1 @@",
      '+export const refundStatus = "out-of-scope";',
    ]);

    const result = await runImplement({
      root: rejectedFixture,
      fast: true,
      externalPatchPath: patchPath,
      testCommand: 'node -e "process.exit(0)"',
    });

    assert.equal(result.outcome, "patch_rejected_out_of_scope");
    assert.equal(result.patchMediation?.applied, false);
    assert.ok(result.patchMediation?.violations.includes("out-of-scope path: src/domain/order.ts"));
    assert.equal(fs.existsSync(path.join(rejectedFixture, "src", "domain", "order.ts")), false);
    assert.ok(result.metadata.patchMediationPath);
    console.log("✓ Test 3: out-of-scope external patch is rejected before apply and recorded");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(rejectedFixture);
  }

  const failingFixture = createVerifyFixture("implement-patch-test-failure");
  try {
    writeChangeSession(failingFixture, buildSession("change-failing-patch", "fast", "docs/failing-mediated.md", "docs_only"));
    const patchPath = writePatch(failingFixture, "failing.patch", [
      "diff --git a/docs/failing-mediated.md b/docs/failing-mediated.md",
      "new file mode 100644",
      "index 0000000..e69de29",
      "--- /dev/null",
      "+++ b/docs/failing-mediated.md",
      "@@ -0,0 +1 @@",
      "+# Failing mediated patch",
    ]);

    const result = await runImplement({
      root: failingFixture,
      fast: true,
      externalPatchPath: patchPath,
      testCommand: 'node -e "console.error(\'mediated test failed\');process.exit(1)"',
    });

    assert.equal(result.outcome, "external_patch_received");
    assert.ok(renderImplementText(result).includes("Outcome: external_patch_received"));
    assert.equal(JSON.parse(renderImplementJSON(result)).outcome, "external_patch_received");
    assert.equal(result.patchMediation?.status, "accepted");
    assert.equal(result.patchMediation?.test?.passed, false);
    assert.ok(result.handoffPacket);
    assert.equal(result.handoffPacket?.outcome, "external_patch_received");
    assert.ok(result.handoffPacket?.nextSteps.filesNeedingAttention.includes("docs/failing-mediated.md"));
    console.log("✓ Test 4: applied external patch with failing tests writes a handoff packet");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(failingFixture);
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
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
