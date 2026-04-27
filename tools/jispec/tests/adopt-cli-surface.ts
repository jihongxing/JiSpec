import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runBootstrapDiscover } from "../bootstrap/discover";
import { runBootstrapDraft } from "../bootstrap/draft";
import { getRepoRoot } from "./verify-test-helpers";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface CommandExecution {
  status: number | null;
  stdout: string;
  stderr: string;
}

async function main(): Promise<void> {
  console.log("=== Adopt CLI Surface Tests ===\n");

  let passed = 0;
  let failed = 0;

  const latestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-adopt-cli-latest-"));
  try {
    seedRepository(latestRoot);
    runBootstrapDiscover({ root: latestRoot });
    const draftResult = await runBootstrapDraft({ root: latestRoot });

    const adopt = runCli(
      [
        "adopt",
        "--root",
        latestRoot,
        "--session",
        "latest",
        "--interactive",
      ],
      [
        "accept",
        "",
        "skip_as_spec_debt",
        "api needs endpoint review",
        "reject",
        "feature language can wait",
        "",
      ].join("\n"),
    );

    assert.equal(adopt.status, 0, `adopt latest exited with ${adopt.status}. stderr: ${adopt.stderr}`);

    const manifestPath = path.join(latestRoot, ".spec", "sessions", draftResult.sessionId, "manifest.json");
    const reportPath = path.join(latestRoot, ".spec", "handoffs", "bootstrap-takeover.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      status?: string;
      takeoverReportPath?: string;
      decisionLog?: Array<{ artifactKind?: string; decision?: string; targetPath?: string }>;
    };
    const report = JSON.parse(fs.readFileSync(reportPath, "utf-8")) as {
      sessionId?: string;
      adoptedArtifactPaths?: string[];
      specDebtPaths?: string[];
      rejectedArtifactKinds?: string[];
    };

    assert.equal(manifest.status, "committed");
    assert.equal(manifest.takeoverReportPath, ".spec/handoffs/bootstrap-takeover.json");
    assert.equal(report.sessionId, draftResult.sessionId);
    assert.ok(report.adoptedArtifactPaths?.includes(".spec/contracts/domain.yaml"));
    assert.ok(report.specDebtPaths?.includes(`.spec/spec-debt/${draftResult.sessionId}/api.json`));
    assert.ok(report.rejectedArtifactKinds?.includes("feature"));
    assert.ok(
      manifest.decisionLog?.some((entry) => entry.artifactKind === "api" && entry.decision === "skip_as_spec_debt"),
    );
    assert.match(adopt.stdout, /Bootstrap adopt finished for session/);
    assert.match(adopt.stdout, /Takeover report: \.spec\/handoffs\/bootstrap-takeover\.json/);
    console.log("✓ Test 1: adopt CLI resolves --session latest, applies interactive decisions, and writes the takeover report");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    fs.rmSync(latestRoot, { recursive: true, force: true });
  }

  const explicitRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-adopt-cli-explicit-"));
  try {
    seedRepository(explicitRoot);
    runBootstrapDiscover({ root: explicitRoot });
    const draftResult = await runBootstrapDraft({ root: explicitRoot });

    const adopt = runCli(
      [
        "adopt",
        "--root",
        explicitRoot,
        "--session",
        draftResult.sessionId,
        "--interactive",
      ],
      [
        "accept",
        "",
        "reject",
        "api stays deferred for later",
        "edit",
        "Feature: CLI Edited",
        "",
        "  Scenario: CLI Edited",
        "    Given edited content",
        "    When adopted through the CLI",
        "    Then it is saved",
        "EOF",
        "feature rewritten in cli test",
        "",
      ].join("\n"),
    );

    assert.equal(adopt.status, 0, `adopt explicit exited with ${adopt.status}. stderr: ${adopt.stderr}`);

    const featurePath = path.join(explicitRoot, ".spec", "contracts", "behaviors.feature");
    const manifestPath = path.join(explicitRoot, ".spec", "sessions", draftResult.sessionId, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      decisionLog?: Array<{ artifactKind?: string; decision?: string; edited?: boolean }>;
    };

    assert.match(fs.readFileSync(featurePath, "utf-8"), /Feature: CLI Edited/);
    assert.ok(
      manifest.decisionLog?.some((entry) => entry.artifactKind === "feature" && entry.decision === "edit" && entry.edited === true),
    );
    console.log("✓ Test 2: adopt CLI accepts an explicit session id and persists edited interactive content into visible contracts");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    fs.rmSync(explicitRoot, { recursive: true, force: true });
  }

  const failureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-adopt-cli-failure-"));
  try {
    seedRepository(failureRoot);
    runBootstrapDiscover({ root: failureRoot });
    const draftResult = await runBootstrapDraft({ root: failureRoot });

    const adopt = runCli(
      [
        "adopt",
        "--root",
        failureRoot,
        "--session",
        "latest",
      ],
    );

    assert.equal(adopt.status, 1, `adopt failure exited with ${adopt.status}. stderr: ${adopt.stderr}`);
    assert.match(adopt.stderr, /requires either --interactive or explicit decisions/);

    const manifestPath = path.join(failureRoot, ".spec", "sessions", draftResult.sessionId, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      status?: string;
    };
    assert.equal(manifest.status, "abandoned");
    assert.equal(fs.existsSync(path.join(failureRoot, ".spec", "handoffs", "bootstrap-takeover.json")), false);
    console.log("✓ Test 3: adopt CLI exits non-zero on invalid invocation and leaves the draft session abandoned instead of half-committed");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  } finally {
    fs.rmSync(failureRoot, { recursive: true, force: true });
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

function runCli(args: string[], input?: string): CommandExecution {
  const repoRoot = getRepoRoot();
  const cliPath = path.join(repoRoot, "tools", "jispec", "cli.ts");
  const result = spawnSync(process.execPath, ["--import", "tsx", cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf-8",
    input,
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function seedRepository(root: string): void {
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "jiproject", "project.yaml"),
    "id: adopt-cli-repo\nname: Adopt CLI Repo\nai:\n  provider: mock\n",
    "utf-8",
  );

  fs.writeFileSync(path.join(root, "README.md"), "# Adopt CLI Repo\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "adopt-cli-repo", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes.ts"),
    'const app = { post: () => undefined };\napp.post("/orders", () => "created");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "schemas"), { recursive: true });
  fs.writeFileSync(path.join(root, "schemas", "order.schema.json"), JSON.stringify({ type: "object" }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(path.join(root, "tests", "orders.test.ts"), "describe('orders', () => {});\n", "utf-8");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
