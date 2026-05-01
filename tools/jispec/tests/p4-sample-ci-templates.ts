import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runBootstrapAdopt } from "../bootstrap/adopt";
import { getRepoRoot } from "./verify-test-helpers";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface CliJson {
  sessionId?: string;
  verdict?: string;
  ok?: boolean;
  writtenFiles?: string[];
  generatedAssets?: Record<string, string>;
}

async function main(): Promise<void> {
  console.log("=== P4 Sample Repo And CI Template Tests ===\n");

  const repoRoot = getRepoRoot();
  const results: TestResult[] = [];

  await runCase(results, "minimal legacy sample runs discover, draft, adopt, verify, and ci:verify", async () => {
    const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p4-legacy-"));
    const workspace = path.join(tempParent, "minimal-legacy-takeover");
    try {
      fs.cpSync(path.join(repoRoot, "examples", "minimal-legacy-takeover"), workspace, { recursive: true });

      const discover = runCli(repoRoot, ["bootstrap", "discover", "--root", workspace, "--init-project", "--json"]);
      assert.equal(discover.status, 0, discover.stderr);
      const discoverPayload = JSON.parse(discover.stdout) as CliJson;
      assert.ok(discoverPayload.writtenFiles?.some((file) => file.endsWith("evidence-graph.json")));
      assert.ok(fs.existsSync(path.join(workspace, ".spec", "facts", "bootstrap", "evidence-graph.json")));
      assert.ok(fs.existsSync(path.join(workspace, "jiproject", "project.yaml")));

      const draft = runCli(repoRoot, ["bootstrap", "draft", "--root", workspace, "--json"]);
      assert.equal(draft.status, 0, draft.stderr);
      const draftPayload = JSON.parse(draft.stdout) as CliJson;
      assert.ok(draftPayload.sessionId);

      const adopt = await runBootstrapAdopt({
        root: workspace,
        session: draftPayload.sessionId,
        decisions: [
          { artifactKind: "domain", kind: "accept" },
          { artifactKind: "api", kind: "skip_as_spec_debt", note: "Billing owner review pending." },
          { artifactKind: "feature", kind: "reject", note: "Weak route-name behavior evidence." },
        ],
        actor: "p4-sample-smoke",
        reason: "P4-T2 sample takeover smoke",
      });
      assert.equal(adopt.status, "committed");
      assert.ok(adopt.adoptedArtifactPaths.includes(".spec/contracts/domain.yaml"));
      assert.ok(adopt.specDebtFiles.length >= 1);
      assert.ok(fs.existsSync(path.join(workspace, ".spec", "handoffs", "bootstrap-takeover.json")));

      const policy = runCli(repoRoot, ["policy", "migrate", "--root", workspace, "--json"]);
      assert.equal(policy.status, 0, policy.stderr);

      const verify = runCli(repoRoot, ["verify", "--root", workspace, "--json"]);
      assert.equal(verify.status, 0, verify.stderr);
      const verifyPayload = JSON.parse(verify.stdout) as CliJson;
      assert.equal(verifyPayload.ok, true);
      assert.match(verifyPayload.verdict ?? "", /PASS|WARN_ADVISORY/);

      const ci = runCiVerify(repoRoot, workspace);
      assert.equal(ci.status, 0, ci.stderr);
      assert.ok(fs.existsSync(path.join(workspace, ".jispec-ci", "verify-report.json")));
      assert.ok(fs.existsSync(path.join(workspace, ".jispec-ci", "ci-summary.md")));
      assert.ok(fs.existsSync(path.join(workspace, ".jispec-ci", "verify-summary.md")));
    } finally {
      fs.rmSync(tempParent, { recursive: true, force: true });
    }
  });

  await runCase(results, "minimal greenfield sample initializes and verifies from input documents", async () => {
    const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p4-greenfield-"));
    const workspace = path.join(tempParent, "minimal-greenfield");
    try {
      const init = runCli(repoRoot, [
        "init",
        "--root",
        workspace,
        "--requirements",
        path.join(repoRoot, "examples", "minimal-greenfield", "requirements.md"),
        "--technical-solution",
        path.join(repoRoot, "examples", "minimal-greenfield", "technical-solution.md"),
        "--force",
        "--json",
      ]);
      assert.equal(init.status, 0, init.stderr);
      const initPayload = JSON.parse(init.stdout) as CliJson;
      assert.ok(initPayload.writtenFiles?.some((file) => normalizePath(file).endsWith("jiproject/project.yaml")));
      assert.ok(initPayload.writtenFiles?.some((file) => normalizePath(file).endsWith(".spec/policy.yaml")));
      assert.ok(fs.existsSync(path.join(workspace, ".spec", "greenfield", "initialization-summary.md")));
      assert.ok(fs.existsSync(path.join(workspace, ".github", "workflows", "jispec-verify.yml")));

      const verify = runCli(repoRoot, ["verify", "--root", workspace, "--policy", ".spec/policy.yaml", "--json"]);
      assert.equal(verify.status, 0, verify.stderr);
      const verifyPayload = JSON.parse(verify.stdout) as CliJson;
      assert.equal(verifyPayload.ok, true);
      assert.equal(verifyPayload.verdict, "PASS");
    } finally {
      fs.rmSync(tempParent, { recursive: true, force: true });
    }
  });

  await runCase(results, "CI templates and walkthrough document local deterministic gates", async () => {
    const githubTemplate = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "jispec-verify-template.yml"), "utf-8");
    const gitlabTemplate = fs.readFileSync(path.join(repoRoot, ".gitlab-ci.jispec-template.yml"), "utf-8");
    const ciDocs = fs.readFileSync(path.join(repoRoot, "docs", "ci-templates.md"), "utf-8");
    const walkthrough = fs.readFileSync(path.join(repoRoot, "docs", "first-takeover-walkthrough.md"), "utf-8");
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8")) as { files?: string[] };

    assert.match(githubTemplate, /npm run ci:verify/);
    assert.match(githubTemplate, /actions\/upload-artifact@v4/);
    assert.match(gitlabTemplate, /npm run ci:verify/);
    assert.match(gitlabTemplate, /\.jispec-ci\//);
    assert.match(ciDocs, /do not upload source code/i);
    assert.match(ciDocs, /local verify report remains the machine-readable gate result/i);
    assert.match(walkthrough, /bootstrap discover/);
    assert.match(walkthrough, /bootstrap draft/);
    assert.match(walkthrough, /adopt/);
    assert.match(walkthrough, /spec debt/i);
    assert.match(walkthrough, /handoff packet/i);
    assert.ok(packageJson.files?.includes("examples/"));
    assert.ok(packageJson.files?.includes(".github/workflows/jispec-verify-template.yml"));
    assert.ok(packageJson.files?.includes(".gitlab-ci.jispec-template.yml"));
  });

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

async function runCase(results: TestResult[], name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function runCli(repoRoot: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", path.join(repoRoot, "tools", "jispec", "cli.ts"), ...args], {
    cwd: repoRoot,
    encoding: "utf-8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function runCiVerify(repoRoot: string, root: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", path.join(repoRoot, "scripts", "check-jispec.ts"), "--root", root], {
    cwd: repoRoot,
    encoding: "utf-8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

void main();
