import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { main as runCliMain } from "../cli";
import { renderGreenfieldInitText } from "../greenfield/init";
import { loadGreenfieldSourceDocuments } from "../greenfield/source-documents";
import { runGreenfieldInit } from "../greenfield/init";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Greenfield Source Document Loader Tests ===\n");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-source-docs-"));
  const results: TestResult[] = [];

  try {
    const requirementsPath = path.join(root, "requirements.md");
    const technicalSolutionPath = path.join(root, "technical-solution.md");
    fs.writeFileSync(requirementsPath, buildStrongRequirements(), "utf-8");
    fs.writeFileSync(technicalSolutionPath, buildStrongTechnicalSolution(), "utf-8");

    const strictContract = loadGreenfieldSourceDocuments({
      requirements: requirementsPath,
      technicalSolution: technicalSolutionPath,
    });

    results.push({
      name: "loader accepts strict PRD plus technical solution input",
      passed:
        strictContract.status === "passed" &&
        strictContract.mode === "strict" &&
        strictContract.contractVersion === 1 &&
        strictContract.guidance.supportedModes.includes("strict") &&
        strictContract.guidance.supportedModes.includes("requirements-only") &&
        strictContract.guidance.supportedModes.length === 2 &&
        strictContract.guidance.requirements.required === true &&
        strictContract.guidance.technicalSolution.optional === true &&
        strictContract.guidance.jiSpecResponsibilities.some((item) => item.includes("anchors")) &&
        strictContract.requirements.status === "strong" &&
        strictContract.technicalSolution.status === "strong" &&
        strictContract.requirements.requirementIds?.includes("REQ-ORD-001") === true &&
        strictContract.requirements.anchors?.some((anchor) =>
          anchor.id === "REQ-ORD-001" &&
          anchor.kind === "requirement" &&
          anchor.contractLevel === "required" &&
          anchor.line > 0 &&
          anchor.paragraphId === "req-req-ord-001" &&
          anchor.excerpt.includes("REQ-ORD-001") &&
          typeof anchor.checksum === "string"
        ) === true &&
        strictContract.technicalSolution.anchors?.some((anchor) =>
          anchor.kind === "heading" &&
          anchor.paragraphId === "architecture-direction" &&
          anchor.contractLevel === "supporting"
        ) === true &&
        typeof strictContract.requirements.checksum === "string" &&
        strictContract.blockingIssues.length === 0,
      error: `Expected strict input contract to pass, got ${JSON.stringify(strictContract)}.`,
    });

    const requirementsOnly = runGreenfieldInit({
      root,
      requirements: requirementsPath,
    });

    results.push({
      name: "requirements-only mode allows missing technical solution with warnings",
      passed:
        requirementsOnly.status === "input_contract_ready" &&
        requirementsOnly.inputContract.status === "warning" &&
        requirementsOnly.inputContract.mode === "requirements-only" &&
        requirementsOnly.inputContract.contractVersion === 1 &&
        requirementsOnly.inputContract.guidance.supportedModes.includes("requirements-only") &&
        requirementsOnly.inputContract.technicalSolution.status === "missing" &&
        requirementsOnly.writtenFiles.some((filePath) => filePath.endsWith("jiproject/project.yaml")) &&
        requirementsOnly.inputContract.warnings.some((warning) => warning.includes("technical solution is missing")) &&
        requirementsOnly.inputContract.openDecisions.length > 0 &&
        renderGreenfieldInitText(requirementsOnly).includes("Next command: npm run jispec-cli -- bootstrap draft --root"),
      error: `Expected requirements-only warning contract, got ${JSON.stringify(requirementsOnly)}.`,
    });

    const missingRequirements = runGreenfieldInit({
      root,
      technicalSolution: technicalSolutionPath,
    });

    results.push({
      name: "missing requirements blocks Greenfield initialization",
      passed:
        missingRequirements.status === "input_contract_failed" &&
        missingRequirements.inputContract.status === "failed" &&
        missingRequirements.inputContract.mode === "idea-only" &&
        missingRequirements.inputContract.requirements.status === "missing" &&
        missingRequirements.inputContract.blockingIssues.some((issue) => issue.includes("requirements file is missing")),
      error: `Expected missing requirements to fail, got ${JSON.stringify(missingRequirements)}.`,
    });

    const weakRequirementsPath = path.join(root, "weak-requirements.md");
    fs.writeFileSync(weakRequirementsPath, "# Neat App\n\nA small idea.\n", "utf-8");
    const weakContract = loadGreenfieldSourceDocuments({
      requirements: weakRequirementsPath,
      technicalSolution: technicalSolutionPath,
    });

    results.push({
      name: "weak requirements without objective or functional requirements are blocked",
      passed:
        weakContract.status === "failed" &&
        weakContract.requirements.status === "weak" &&
        weakContract.blockingIssues.some((issue) => issue.includes("product objective")) &&
        weakContract.blockingIssues.some((issue) => issue.includes("functional requirements")),
      error: `Expected weak requirements to fail, got ${JSON.stringify(weakContract)}.`,
    });

    const cliOutput = await runCliAndCapture([
      "node",
      "jispec-cli",
      "init",
      "--technical-solution",
      technicalSolutionPath,
      "--json",
    ]);

    results.push({
      name: "CLI returns non-zero for input_contract_failed",
      passed:
        cliOutput.code === 1 &&
        cliOutput.stdout.includes('"status": "input_contract_failed"') &&
        cliOutput.stdout.includes('"status": "failed"'),
      error: `Expected CLI failure for missing requirements, got code=${cliOutput.code}, stdout=${cliOutput.stdout}, stderr=${cliOutput.stderr}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "greenfield source document loader execution",
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

function buildStrongRequirements(): string {
  return [
    "# Commerce Platform Requirements",
    "",
    "## Objective",
    "",
    "Build a commerce platform for product browsing, checkout, and order creation.",
    "",
    "## Users / Actors",
    "",
    "- Shopper",
    "- Catalog manager",
    "",
    "## Core Journeys",
    "",
    "- Shopper checks out a valid cart.",
    "",
    "## Functional Requirements",
    "",
    "### REQ-ORD-001",
    "",
    "A shopper must be able to submit an order from a valid cart.",
    "",
    "### REQ-ORD-002",
    "",
    "Checkout must reject unavailable items.",
    "",
    "## Non-Functional Requirements",
    "",
    "- Checkout should respond fast enough for synchronous interaction.",
    "",
    "## Out Of Scope",
    "",
    "- Refunds are not included in V1.",
    "",
    "## Acceptance Signals",
    "",
    "- Valid checkout creates an order.",
  ].join("\n");
}

function buildStrongTechnicalSolution(): string {
  return [
    "# Commerce Platform Technical Solution",
    "",
    "## Architecture Direction",
    "",
    "Use bounded contexts for catalog and ordering.",
    "",
    "## Bounded Context Hypothesis",
    "",
    "- catalog owns availability",
    "- ordering owns checkout",
    "",
    "## Integration Boundaries",
    "",
    "ordering consumes catalog availability but does not write catalog data.",
    "",
    "## Data Ownership",
    "",
    "Each bounded context owns its data model.",
    "",
    "## Testing Strategy",
    "",
    "Use unit, integration, and contract tests.",
    "",
    "## Operational Constraints",
    "",
    "No direct table sharing across bounded contexts.",
    "",
    "## Risks And Open Decisions",
    "",
    "Payment provider is not selected yet.",
  ].join("\n");
}

void main();
