import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { computeImplementExitCode, runImplement } from "../implement/implement-runner";
import { writeChangeSession, type ChangeSession } from "../change/change-session";
import { cleanupVerifyFixture, createVerifyFixture, getRepoRoot } from "./verify-test-helpers";

function buildSession(
  id: string,
  lane: "fast" | "strict",
  changedPath: string,
  kind: ChangeSession["changedPaths"][number]["kind"],
): ChangeSession {
  return {
    id,
    createdAt: "2026-05-02T00:00:00.000Z",
    summary: `Implement CLI parity session ${id}`,
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

function spawnImplementCli(root: string, args: string[]): ReturnType<typeof spawnSync> {
  const repoRoot = getRepoRoot();
  const cliEntry = path.join(repoRoot, "tools", "jispec", "cli.ts");
  return spawnSync(
    process.execPath,
    ["--import", "tsx", cliEntry, "implement", "--root", root, ...args],
    {
      cwd: repoRoot,
      encoding: "utf-8",
    },
  );
}

function writePatch(root: string, name: string, lines: string[]): string {
  const patchDir = path.join(root, ".jispec", "patches");
  fs.mkdirSync(patchDir, { recursive: true });
  const patchPath = path.join(patchDir, name);
  fs.writeFileSync(patchPath, `${lines.join("\n")}\n`, "utf-8");
  return patchPath;
}

async function main(): Promise<void> {
  console.log("=== Implement CLI Parity Tests ===\n");

  let passed = 0;
  let failed = 0;

  const preflightDirect = createVerifyFixture("implement-cli-preflight-direct");
  const preflightCli = createVerifyFixture("implement-cli-preflight-cli");
  try {
    const sessionId = "change-cli-preflight";
    const testCommand = 'node -e "process.exit(0)"';
    writeChangeSession(preflightDirect, buildSession(sessionId, "fast", "docs/cli-preflight.md", "docs_only"));
    writeChangeSession(preflightCli, buildSession(sessionId, "fast", "docs/cli-preflight.md", "docs_only"));

    const directResult = await runImplement({
      root: preflightDirect,
      fast: true,
      testCommand,
    });
    const cli = spawnImplementCli(preflightCli, ["--fast", "--test-command", testCommand, "--json"]);
    const cliOutput = typeof cli.stdout === "string" ? cli.stdout : cli.stdout.toString("utf-8");

    assert.equal(cli.status, computeImplementExitCode(directResult));
    assert.equal(cliOutput.includes("Implement lane:"), false);
    const cliResult = JSON.parse(cliOutput) as Record<string, any>;
    assert.equal(cliResult.outcome, directResult.outcome);
    assert.equal(cliResult.decisionPacket.state, directResult.decisionPacket?.state);
    assert.equal(cliResult.decisionPacket.stopPoint, directResult.decisionPacket?.stopPoint);
    assert.equal(cliResult.decisionPacket.nextActionDetail.owner, directResult.decisionPacket?.nextActionDetail.owner);
    assert.equal(cliResult.postVerify.command, directResult.postVerify?.command);
    assert.equal(cliResult.postVerify.verdict, directResult.postVerify?.verdict);
    assert.equal(cliResult.metadata.testCommand, directResult.metadata.testCommand);
    assert.equal(cliResult.metadata.sessionArchived, true);
    console.log("✓ Test 1: JSON output stays machine clean for a successful preflight implement");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(preflightDirect);
    cleanupVerifyFixture(preflightCli);
  }

  const verifyDirect = createVerifyFixture("implement-cli-verify-direct");
  const verifyCli = createVerifyFixture("implement-cli-verify-cli");
  try {
    const sessionId = "change-cli-verify-blocked";
    const testCommand = 'node -e "process.exit(0)"';
    fs.rmSync(path.join(verifyDirect, "contexts", "ordering", "slices", "ordering-checkout-v1", "evidence.md"), { force: true });
    fs.rmSync(path.join(verifyCli, "contexts", "ordering", "slices", "ordering-checkout-v1", "evidence.md"), { force: true });
    writeChangeSession(verifyDirect, buildSession(sessionId, "strict", "src/domain/order.ts", "domain_core"));
    writeChangeSession(verifyCli, buildSession(sessionId, "strict", "src/domain/order.ts", "domain_core"));

    const directResult = await runImplement({
      root: verifyDirect,
      testCommand,
    });
    const cli = spawnImplementCli(verifyCli, ["--test-command", testCommand]);
    const cliOutput = typeof cli.stdout === "string" ? cli.stdout : cli.stdout.toString("utf-8");

    assert.equal(cli.status, computeImplementExitCode(directResult));
    assert.ok(cliOutput.includes("Outcome: verify_blocked"));
    assert.ok(cliOutput.includes("State: blocked_by_verify"));
    assert.ok(cliOutput.includes("Stop point: post_verify"));
    assert.ok(cliOutput.includes("Mergeable: false"));
    assert.ok(cliOutput.includes("Failed check: verify"));
    assert.ok(cliOutput.includes("Next action owner: verify_gate"));
    assert.ok(cliOutput.includes("Post-implement verify:"));
    assert.ok(cliOutput.includes("Command: npm run verify"));
    assert.ok(cliOutput.includes("Verdict: FAIL_BLOCKING"));
    assert.ok(cliOutput.includes("Handoff packet:"));
    assert.equal(directResult.outcome, "verify_blocked");
    assert.equal(directResult.decisionPacket?.state, "blocked_by_verify");
    assert.equal(directResult.decisionPacket?.stopPoint, "post_verify");
    assert.equal(directResult.decisionPacket?.mergeable, false);
    assert.equal(directResult.postVerify?.verdict, "FAIL_BLOCKING");
    console.log("✓ Test 2: text output stays aligned with the verify-blocked decision summary");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? messageFromError(error) : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(verifyDirect);
    cleanupVerifyFixture(verifyCli);
  }

  const patchDirect = createVerifyFixture("implement-cli-patch-direct");
  const patchCli = createVerifyFixture("implement-cli-patch-cli");
  try {
    const sessionId = "change-cli-patch";
    const testCommand = 'node -e "const fs=require(\'fs\');process.exit(fs.readFileSync(\'docs/cli-parity.md\',\'utf8\').includes(\'cli parity verified\')?0:1)"';
    writeChangeSession(patchDirect, buildSession(sessionId, "fast", "docs/cli-parity.md", "docs_only"));
    writeChangeSession(patchCli, buildSession(sessionId, "fast", "docs/cli-parity.md", "docs_only"));
    const directPatchPath = writePatch(patchDirect, "cli-parity.patch", [
      "diff --git a/docs/cli-parity.md b/docs/cli-parity.md",
      "new file mode 100644",
      "index 0000000..e69de29",
      "--- /dev/null",
      "+++ b/docs/cli-parity.md",
      "@@ -0,0 +1,2 @@",
      "+# CLI parity",
      "+cli parity verified",
    ]);
    const cliPatchPath = writePatch(patchCli, "cli-parity.patch", [
      "diff --git a/docs/cli-parity.md b/docs/cli-parity.md",
      "new file mode 100644",
      "index 0000000..e69de29",
      "--- /dev/null",
      "+++ b/docs/cli-parity.md",
      "@@ -0,0 +1,2 @@",
      "+# CLI parity",
      "+cli parity verified",
    ]);

    const directResult = await runImplement({
      root: patchDirect,
      fast: true,
      externalPatchPath: directPatchPath,
      testCommand,
    });
    const cli = spawnImplementCli(patchCli, ["--fast", "--external-patch", cliPatchPath, "--test-command", testCommand, "--json"]);
    const cliOutput = typeof cli.stdout === "string" ? cli.stdout : cli.stdout.toString("utf-8");

    assert.equal(cli.status, computeImplementExitCode(directResult));
    assert.equal(cliOutput.includes("Implement lane:"), false);
    const cliResult = JSON.parse(cliOutput) as Record<string, any>;
    assert.equal(cliResult.outcome, "patch_verified");
    assert.equal(cliResult.decisionPacket.state, "ready_to_merge");
    assert.equal(cliResult.decisionPacket.stopPoint, "post_verify");
    assert.equal(cliResult.patchMediation.status, "accepted");
    assert.equal(cliResult.postVerify.verdict, "PASS");
    assert.equal(cliResult.metadata.sessionArchived, true);
    assert.equal(directResult.outcome, "patch_verified");
    assert.equal(directResult.decisionPacket?.state, "ready_to_merge");
    assert.equal(directResult.postVerify?.verdict, "PASS");
    console.log("✓ Test 3: JSON output and exit code stay aligned for a mediated patch that verifies cleanly");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? String(error) : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    cleanupVerifyFixture(patchDirect);
    cleanupVerifyFixture(patchCli);
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

function messageFromError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
