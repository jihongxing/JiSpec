import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { main as runCliMain } from "../cli";
import { runGreenfieldInit } from "../greenfield/init";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Greenfield Command Surface Tests ===\n");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-command-"));
  const results: TestResult[] = [];

  try {
    const requirementsPath = path.join(root, "requirements.md");
    const technicalSolutionPath = path.join(root, "technical-solution.md");
    fs.writeFileSync(requirementsPath, buildRequirements(), "utf-8");
    fs.writeFileSync(technicalSolutionPath, buildTechnicalSolution(), "utf-8");

    const result = runGreenfieldInit({
      root,
      requirements: requirementsPath,
      technicalSolution: technicalSolutionPath,
      force: true,
    });

    results.push({
      name: "greenfield initializer exposes a command-surface-ready result",
      passed:
        result.status === "input_contract_ready" &&
        result.force === true &&
        result.requirements?.endsWith("requirements.md") === true &&
        result.technicalSolution?.endsWith("technical-solution.md") === true &&
        result.inputContract.mode === "strict" &&
        result.writtenFiles.some((filePath) => filePath.endsWith("jiproject/project.yaml")) &&
        result.nextTask === "greenfield-initialization-mvp-complete",
      error: `Expected command-surface-ready result, got ${JSON.stringify(result)}.`,
    });

    const initOutput = await runCliAndCapture([
      "node",
      "jispec-cli",
      "init",
      "--root",
      root,
      "--requirements",
      requirementsPath,
      "--technical-solution",
      technicalSolutionPath,
      "--json",
      "--force",
    ]);

    results.push({
      name: "CLI exposes jispec-cli init command",
      passed:
        initOutput.code === 0 &&
        initOutput.stdout.includes('"status": "input_contract_ready"') &&
        initOutput.stdout.includes('"mode": "strict"') &&
        initOutput.stdout.includes('"nextTask": "greenfield-initialization-mvp-complete"'),
      error: `Expected init CLI to route to Greenfield initializer, got code=${initOutput.code}, stdout=${initOutput.stdout}, stderr=${initOutput.stderr}.`,
    });

    const aliasOutput = await runCliAndCapture([
      "node",
      "jispec-cli",
      "bootstrap",
      "new-project",
      "--root",
      root,
      "--requirements",
      requirementsPath,
      "--technical-solution",
      technicalSolutionPath,
      "--json",
      "--force",
    ]);

    results.push({
      name: "CLI exposes bootstrap new-project alias",
      passed:
        aliasOutput.code === 0 &&
        aliasOutput.stdout.includes('"status": "input_contract_ready"') &&
        aliasOutput.stdout.includes('"mode": "strict"') &&
        aliasOutput.stdout.includes('"nextTask": "greenfield-initialization-mvp-complete"'),
      error: `Expected bootstrap new-project to route to Greenfield initializer, got code=${aliasOutput.code}, stdout=${aliasOutput.stdout}, stderr=${aliasOutput.stderr}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "greenfield command surface execution",
      passed: false,
      error: message,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
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

function buildRequirements(): string {
  return [
    "# Commerce Platform Requirements",
    "",
    "## Objective",
    "",
    "Build a commerce platform.",
    "",
    "## Users / Actors",
    "",
    "- Shopper",
    "",
    "## Core Journeys",
    "",
    "- Shopper checks out a cart.",
    "",
    "## Functional Requirements",
    "",
    "### REQ-ORD-001",
    "",
    "A shopper must submit an order.",
    "",
    "## Non-Functional Requirements",
    "",
    "- Checkout should be responsive.",
    "",
    "## Out Of Scope",
    "",
    "- Refunds.",
    "",
    "## Acceptance Signals",
    "",
    "- Order created.",
  ].join("\n");
}

function buildTechnicalSolution(): string {
  return [
    "# Commerce Platform Technical Solution",
    "",
    "## Architecture Direction",
    "",
    "Use bounded contexts.",
    "",
    "## Bounded Context Hypothesis",
    "",
    "- ordering",
    "",
    "## Integration Boundaries",
    "",
    "No direct writes across boundaries.",
    "",
    "## Data Ownership",
    "",
    "Ordering owns orders.",
    "",
    "## Testing Strategy",
    "",
    "Use unit and contract tests.",
    "",
    "## Operational Constraints",
    "",
    "Keep synchronous checkout responsive.",
    "",
    "## Risks And Open Decisions",
    "",
    "Payment provider is open.",
  ].join("\n");
}

async function runCliAndCapture(argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const previousLog = console.log;
  const previousError = console.error;
  const previousExitCode = process.exitCode;
  const stdout: string[] = [];
  const stderr: string[] = [];

  console.log = (message?: unknown, ...optional: unknown[]) => {
    stdout.push([message, ...optional].map(String).join(" "));
  };
  console.error = (message?: unknown, ...optional: unknown[]) => {
    stderr.push([message, ...optional].map(String).join(" "));
  };
  process.exitCode = undefined;

  try {
    const code = await runCliMain(argv);
    return {
      code,
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
    };
  } finally {
    console.log = previousLog;
    console.error = previousError;
    process.exitCode = previousExitCode;
  }
}

void main();
