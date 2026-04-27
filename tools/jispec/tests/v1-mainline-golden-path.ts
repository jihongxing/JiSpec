import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runBootstrapAdopt } from "../bootstrap/adopt";
import { cleanupVerifyFixture, createVerifyFixture, getRepoRoot } from "./verify-test-helpers";

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
  console.log("=== V1 Mainline Golden Path E2E Test ===\n");

  const fixtureRoot = createVerifyFixture("v1-mainline-golden-path");
  const results: TestResult[] = [];

  try {
    seedRepository(fixtureRoot);
    initializeGitRepository(fixtureRoot);

    const discover = runCli(["bootstrap", "discover", "--root", fixtureRoot, "--json"]);
    assertCommandOk(discover, "bootstrap discover");
    const discoverPayload = JSON.parse(discover.stdout) as {
      summary?: { routeCount?: number };
    };

    const draft = runCli(["bootstrap", "draft", "--root", fixtureRoot, "--json"]);
    assertCommandOk(draft, "bootstrap draft");
    const draftPayload = JSON.parse(draft.stdout) as {
      sessionId: string;
      generationMode?: string;
      qualitySummary?: { evidenceStrength?: string };
    };

    const adoptResult = await runBootstrapAdopt({
      root: fixtureRoot,
      session: draftPayload.sessionId,
      decisions: [
        { artifactKind: "domain", kind: "accept" },
        { artifactKind: "api", kind: "accept" },
        { artifactKind: "feature", kind: "accept" },
      ],
    });

    const policyMigrate = runCli(["policy", "migrate", "--root", fixtureRoot, "--json"]);
    assertCommandOk(policyMigrate, "policy migrate");
    const policyPayload = JSON.parse(policyMigrate.stdout) as {
      policy?: {
        requires?: {
          facts_contract?: string;
        };
      };
    };

    const manifestPath = path.join(fixtureRoot, ".spec", "sessions", draftPayload.sessionId, "manifest.json");
    const takeoverPath = path.join(fixtureRoot, ".spec", "handoffs", "bootstrap-takeover.json");
    const evidenceGraphPath = path.join(fixtureRoot, ".spec", "facts", "bootstrap", "evidence-graph.json");
    const domainContractPath = path.join(fixtureRoot, ".spec", "contracts", "domain.yaml");
    const apiContractPath = path.join(fixtureRoot, ".spec", "contracts", "api_spec.json");
    const featureContractPath = path.join(fixtureRoot, ".spec", "contracts", "behaviors.feature");

    results.push({
      name: "bootstrap discover -> draft -> adopt writes the first takeover artifacts",
      passed:
        discoverPayload.summary?.routeCount === 2 &&
        typeof draftPayload.sessionId === "string" &&
        draftPayload.sessionId.length > 0 &&
        typeof draftPayload.generationMode === "string" &&
        draftPayload.qualitySummary?.evidenceStrength !== undefined &&
        adoptResult.status === "committed" &&
        adoptResult.takeoverReportPath === ".spec/handoffs/bootstrap-takeover.json" &&
        fs.existsSync(evidenceGraphPath) &&
        fs.existsSync(manifestPath) &&
        fs.existsSync(takeoverPath) &&
        fs.existsSync(domainContractPath) &&
        fs.existsSync(apiContractPath) &&
        fs.existsSync(featureContractPath) &&
        policyPayload.policy?.requires?.facts_contract === "1.0",
      error: "Expected bootstrap + adopt to materialize evidence, session, takeover, contracts, and a pinned policy surface.",
    });

    const verify = runCli([
      "verify",
      "--root",
      fixtureRoot,
      "--json",
      "--facts-out",
      ".spec/facts/verify/golden-path.json",
    ]);
    assertCommandOk(verify, "verify");
    const verifyPayload = JSON.parse(verify.stdout) as {
      verdict?: string;
      ok?: boolean;
      metadata?: {
        factsContractVersion?: string;
        matchedPolicyRules?: string[];
      };
    };

    const ciVerify = runCiVerify(fixtureRoot);
    assert.equal(ciVerify.status, 0, `ci:verify exited with ${ciVerify.status}. stderr: ${ciVerify.stderr}`);
    const ciReportPath = path.join(fixtureRoot, ".jispec-ci", "verify-report.json");
    const ciSummaryPath = path.join(fixtureRoot, ".jispec-ci", "ci-summary.md");
    const ciReport = JSON.parse(fs.readFileSync(ciReportPath, "utf-8")) as {
      verdict?: string;
      ok?: boolean;
      context?: { provider?: string };
      factsContractVersion?: string;
    };

    results.push({
      name: "verify and ci:verify produce stable pass artifacts after the first takeover",
      passed:
        verifyPayload.verdict === "PASS" &&
        verifyPayload.ok === true &&
        verifyPayload.metadata?.factsContractVersion === "1.0" &&
        Array.isArray(verifyPayload.metadata?.matchedPolicyRules) &&
        verifyPayload.metadata?.matchedPolicyRules.length === 0 &&
        fs.existsSync(path.join(fixtureRoot, ".spec", "facts", "verify", "golden-path.json")) &&
        ciReport.verdict === "PASS" &&
        ciReport.ok === true &&
        ciReport.context?.provider === "local" &&
        ciReport.factsContractVersion === "1.0" &&
        fs.existsSync(ciSummaryPath) &&
        ciVerify.stdout.includes("CI artifacts written to .jispec-ci"),
      error: "Expected verify and ci:verify to converge on PASS and persist stable report artifacts.",
    });

    fs.appendFileSync(path.join(fixtureRoot, "README.md"), "\nLocal docs-only tweak for fast lane.\n", "utf-8");

    const change = runCli([
      "change",
      "Document the first takeover flow",
      "--root",
      fixtureRoot,
      "--lane",
      "fast",
      "--json",
    ]);
    assertCommandOk(change, "change");
    const changePayload = JSON.parse(change.stdout) as {
      id?: string;
      laneDecision?: { lane?: string; autoPromoted?: boolean };
      changedPaths?: Array<{ path?: string; kind?: string }>;
      nextCommands?: Array<{ command?: string }>;
    };

    const activeSessionPath = path.join(fixtureRoot, ".jispec", "change-session.json");
    const activeSession = JSON.parse(fs.readFileSync(activeSessionPath, "utf-8")) as {
      id?: string;
    };

    results.push({
      name: "docs-only follow-up changes stay on fast lane and persist an active change session",
      passed:
        changePayload.laneDecision?.lane === "fast" &&
        changePayload.laneDecision?.autoPromoted === false &&
        changePayload.changedPaths?.length === 1 &&
        changePayload.changedPaths[0]?.path === "README.md" &&
        changePayload.changedPaths[0]?.kind === "docs_only" &&
        changePayload.nextCommands?.map((entry) => entry.command).join("|") ===
          "npm run jispec-cli -- implement --fast|npm run jispec-cli -- verify --fast" &&
        activeSession.id === changePayload.id,
      error: "Expected a docs-only diff to remain on fast lane and write the active change session.",
    });

    const implement = runCli([
      "implement",
      "--root",
      fixtureRoot,
      "--fast",
      "--test-command",
      'node -e "process.exit(0)"',
    ]);
    assert.equal(implement.status, 0, `implement exited with ${implement.status}. stderr: ${implement.stderr}`);

    const archivedDir = path.join(fixtureRoot, ".jispec", "change-sessions");
    const archivedFiles = fs.existsSync(archivedDir) ? fs.readdirSync(archivedDir) : [];

    const verifyFast = runCli(["verify", "--root", fixtureRoot, "--fast", "--json"]);
    assertCommandOk(verifyFast, "verify --fast");
    const verifyFastPayload = JSON.parse(verifyFast.stdout) as {
      verdict?: string;
      metadata?: {
        lane?: string;
        requestedFast?: boolean;
        fastAutoPromoted?: boolean;
      };
    };

    results.push({
      name: "implement --fast returns to verify --fast, archives the change session, and keeps the golden path green",
      passed:
        implement.stdout.includes("Post-implement verify:") &&
        implement.stdout.includes("Command: npm run jispec-cli -- verify --fast") &&
        implement.stdout.includes("Lane: fast") &&
        implement.stdout.includes("Verdict: PASS") &&
        !fs.existsSync(activeSessionPath) &&
        archivedFiles.length === 1 &&
        verifyFastPayload.verdict === "PASS" &&
        verifyFastPayload.metadata?.lane === "fast" &&
        verifyFastPayload.metadata?.requestedFast === true &&
        verifyFastPayload.metadata?.fastAutoPromoted === false,
      error: "Expected implement --fast to preserve fast-lane verify semantics and archive the successful change session.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "v1 mainline golden path execution",
      passed: false,
      error: message,
    });
  } finally {
    cleanupVerifyFixture(fixtureRoot);
  }

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

function runCli(args: string[]): CommandExecution {
  const repoRoot = getRepoRoot();
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

function runCiVerify(root: string): CommandExecution {
  const repoRoot = getRepoRoot();
  const scriptPath = path.join(repoRoot, "scripts", "check-jispec.ts");
  const result = spawnSync(process.execPath, ["--import", "tsx", scriptPath, "--root", root], {
    cwd: repoRoot,
    encoding: "utf-8",
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function assertCommandOk(result: CommandExecution, label: string): void {
  assert.equal(result.status, 0, `${label} exited with ${result.status}. stderr: ${result.stderr}`);
}

function seedRepository(root: string): void {
  fs.writeFileSync(
    path.join(root, "README.md"),
    "# Golden Path Fixture\n\nThis fixture proves the JiSpec V1 bootstrap-to-fast-lane workflow.\n",
    "utf-8",
  );

  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify(
      {
        name: "jispec-golden-path-fixture",
        private: true,
        scripts: {
          test: 'node -e "process.exit(0)"',
        },
      },
      null,
      2,
    ),
    "utf-8",
  );

  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true, target: "ES2022" } }, null, 2),
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes.ts"),
    [
      'const app = { get: () => undefined, post: () => undefined };',
      'app.get("/health", () => "ok");',
      'app.post("/orders", () => "created");',
      "",
    ].join("\n"),
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "schemas"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "schemas", "order.schema.json"),
    JSON.stringify(
      {
        type: "object",
        properties: {
          orderId: { type: "string" },
        },
      },
      null,
      2,
    ),
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(path.join(root, "tests", "orders.test.ts"), "describe('orders', () => {});\n", "utf-8");

  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "architecture.md"),
    "# Architecture\n\nThe ordering context exposes order creation and health endpoints.\n",
    "utf-8",
  );
}

function initializeGitRepository(root: string): void {
  const commands: Array<{ program: string; args: string[]; label: string }> = [
    { program: "git", args: ["init"], label: "git init" },
    { program: "git", args: ["config", "user.email", "golden-path@example.com"], label: "git config user.email" },
    { program: "git", args: ["config", "user.name", "JiSpec Golden Path"], label: "git config user.name" },
    { program: "git", args: ["add", "."], label: "git add ." },
    { program: "git", args: ["commit", "-m", "Initial golden path fixture"], label: "git commit" },
  ];

  for (const command of commands) {
    const result = spawnSync(command.program, command.args, {
      cwd: root,
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      throw new Error(`Failed to initialize git repository at step '${command.label}': ${result.stderr}`);
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
