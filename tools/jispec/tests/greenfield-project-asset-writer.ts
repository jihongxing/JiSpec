import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as yaml from "js-yaml";
import { main as runCliMain } from "../cli";
import { renderGreenfieldInitText, runGreenfieldInit } from "../greenfield/init";
import { runGreenfieldReviewTransition } from "../greenfield/review-workflow";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface ProjectYaml {
  id?: string;
  name?: string;
  delivery_model?: string;
  input_mode?: string;
  input_contract?: {
    version?: number;
    supported_modes?: string[];
    requirements?: {
      required?: boolean;
      description?: string;
    };
    technical_solution?: {
      optional?: boolean;
      description?: string;
    };
    ji_spec_responsibilities?: string[];
    user_responsibilities?: string[];
  };
  open_questions?: {
    path?: string;
    total?: number;
    blocking?: number;
  };
  source_documents?: {
    requirements?: string;
    technical_solution?: string;
  };
  source_quality?: {
    requirements?: string;
    technical_solution?: string;
  };
  global_gates?: string[];
}

async function main(): Promise<void> {
  console.log("=== Greenfield Project Asset Writer Tests ===\n");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-assets-"));
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-sources-"));
  const results: TestResult[] = [];

  try {
    const requirementsPath = path.join(sourceRoot, "requirements.md");
    const technicalSolutionPath = path.join(sourceRoot, "technical-solution.md");
    fs.writeFileSync(requirementsPath, buildStrongRequirements(), "utf-8");
    fs.writeFileSync(technicalSolutionPath, buildStrongTechnicalSolution(), "utf-8");

    const initResult = runGreenfieldInit({
      root,
      requirements: requirementsPath,
      technicalSolution: technicalSolutionPath,
    });
    const projectPath = path.join(root, "jiproject", "project.yaml");
    const project = yaml.load(fs.readFileSync(projectPath, "utf-8")) as ProjectYaml;
    const manifestPath = path.join(root, ".spec", "greenfield", "source-documents.yaml");
    const manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8")) as {
      input_contract?: {
        version?: number;
        supported_modes?: string[];
      };
      input_mode?: string;
      input_status?: string;
      open_questions?: {
        path?: string;
        total?: number;
        blocking?: number;
      };
    };

    results.push({
      name: "initializer writes project-level Greenfield assets",
      passed:
        initResult.status === "input_contract_ready" &&
        initResult.writtenFiles.some((filePath) => filePath.endsWith("jiproject/project.yaml")) &&
        initResult.writtenFiles.some((filePath) => filePath.endsWith(".spec/greenfield/source-documents.yaml")) &&
        fs.existsSync(path.join(root, "jiproject", "glossary.yaml")) &&
        fs.existsSync(path.join(root, "jiproject", "context-map.yaml")) &&
        fs.existsSync(path.join(root, "jiproject", "constraints.yaml")) &&
        fs.existsSync(path.join(root, ".spec", "baselines", "current.yaml")) &&
        fs.existsSync(manifestPath) &&
        fs.existsSync(path.join(root, ".spec", "greenfield", "open-questions.yaml")) &&
        project.id === "commerce-platform" &&
        project.name === "Commerce Platform" &&
        project.delivery_model === "greenfield-initialization" &&
        project.input_mode === "strict" &&
        project.input_contract?.version === 1 &&
        project.input_contract?.supported_modes?.includes("strict") === true &&
        project.input_contract?.requirements?.required === true &&
        project.input_contract?.technical_solution?.optional === true &&
        manifest.input_contract?.version === 1 &&
        manifest.input_contract?.supported_modes?.includes("strict") === true &&
        manifest.input_mode === "strict" &&
        manifest.input_status === "passed" &&
        manifest.open_questions?.path === ".spec/greenfield/open-questions.yaml" &&
        manifest.open_questions?.total !== undefined &&
        manifest.open_questions?.total > 0 &&
        project.source_documents?.requirements === "docs/input/requirements.md" &&
        project.source_documents?.technical_solution === "docs/input/technical-solution.md" &&
        project.source_quality?.requirements === "strong" &&
        project.source_quality?.technical_solution === "strong" &&
        project.global_gates?.includes("source_documents_loaded") === true,
      error: `Expected project-level assets and schema-shaped project.yaml, got result=${JSON.stringify(initResult)}, project=${JSON.stringify(project)}.`,
    });

    const originalProjectContent = fs.readFileSync(projectPath, "utf-8");
    fs.writeFileSync(projectPath, "id: custom\nname: Custom\nversion: 9.9.9\n", "utf-8");
    const protectedResult = runGreenfieldInit({
      root,
      requirements: requirementsPath,
      technicalSolution: technicalSolutionPath,
    });
    const protectedProjectContent = fs.readFileSync(projectPath, "utf-8");

    results.push({
      name: "initializer skips existing assets unless force is passed",
      passed:
        protectedResult.skippedFiles.some((filePath) => filePath.endsWith("jiproject/project.yaml")) &&
        protectedProjectContent.includes("id: custom") &&
        protectedProjectContent !== originalProjectContent,
      error: `Expected project.yaml to be skipped without force, got result=${JSON.stringify(protectedResult)}, content=${protectedProjectContent}.`,
    });

    const forcedResult = runGreenfieldInit({
      root,
      requirements: requirementsPath,
      technicalSolution: technicalSolutionPath,
      force: true,
    });
    const forcedProject = yaml.load(fs.readFileSync(projectPath, "utf-8")) as ProjectYaml;

    results.push({
      name: "initializer overwrites existing assets with force",
      passed:
        forcedResult.writtenFiles.some((filePath) => filePath.endsWith("jiproject/project.yaml")) &&
        forcedProject.id === "commerce-platform" &&
        forcedProject.name === "Commerce Platform",
      error: `Expected project.yaml to be overwritten with force, got result=${JSON.stringify(forcedResult)}, project=${JSON.stringify(forcedProject)}.`,
    });

    const requirementsOnlyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-requirements-only-"));
    const requirementsOnlyResult = runGreenfieldInit({
      root: requirementsOnlyRoot,
      requirements: requirementsPath,
    });
    const placeholderPath = path.join(requirementsOnlyRoot, "docs", "input", "technical-solution.md");
    const requirementsOnlyProject = yaml.load(
      fs.readFileSync(path.join(requirementsOnlyRoot, "jiproject", "project.yaml"), "utf-8"),
    ) as ProjectYaml;
    const requirementsOnlyManifest = yaml.load(
      fs.readFileSync(path.join(requirementsOnlyRoot, ".spec", "greenfield", "source-documents.yaml"), "utf-8"),
    ) as ProjectYaml;

    results.push({
      name: "requirements-only mode writes a technical solution placeholder",
      passed:
        requirementsOnlyResult.status === "input_contract_ready" &&
        requirementsOnlyProject.input_mode === "requirements-only" &&
        requirementsOnlyProject.input_contract?.version === 1 &&
        requirementsOnlyProject.source_quality?.technical_solution === "missing" &&
        fs.existsSync(placeholderPath) &&
        fs.readFileSync(placeholderPath, "utf-8").includes("Technical Solution Placeholder") &&
        requirementsOnlyManifest.open_questions?.path === ".spec/greenfield/open-questions.yaml" &&
        requirementsOnlyManifest.open_questions?.total !== undefined,
      error: `Expected placeholder technical solution for requirements-only mode, got result=${JSON.stringify(requirementsOnlyResult)}, project=${JSON.stringify(requirementsOnlyProject)}.`,
    });
    fs.rmSync(requirementsOnlyRoot, { recursive: true, force: true });

    const cliRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-cli-assets-"));
    const cliOutput = await runCliAndCapture([
      "node",
      "jispec-cli",
      "init",
      "--root",
      cliRoot,
      "--requirements",
      requirementsPath,
      "--technical-solution",
      technicalSolutionPath,
      "--json",
    ]);

    results.push({
      name: "CLI writes Greenfield project assets",
      passed:
        cliOutput.code === 0 &&
        cliOutput.stdout.includes('"writtenFiles"') &&
        fs.existsSync(path.join(cliRoot, "jiproject", "project.yaml")) &&
        fs.existsSync(path.join(cliRoot, ".spec", "greenfield", "source-documents.yaml")) &&
        renderGreenfieldInitText(initResult).includes("Next command: npm run jispec-cli -- bootstrap draft --root") &&
        await verifyGuidedBootstrapFlow(root),
      error: `Expected CLI to write project assets, got code=${cliOutput.code}, stdout=${cliOutput.stdout}, stderr=${cliOutput.stderr}.`,
    });
    fs.rmSync(cliRoot, { recursive: true, force: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "greenfield project asset writer execution",
      passed: false,
      error: message,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(sourceRoot, { recursive: true, force: true });
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

function runCliProcess(args: string[], input?: string): { status: number | null; stdout: string; stderr: string } {
  const repoRoot = process.cwd();
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

async function verifyGuidedBootstrapFlow(guidedRoot: string): Promise<boolean> {
  const discover = await runCliAndCapture([
      "node",
      "jispec-cli",
      "bootstrap",
      "discover",
      "--root",
      guidedRoot,
      "--json",
    ]);
  if (discover.code !== 0) {
    return false;
  }

  const draft = await runCliAndCapture([
      "node",
      "jispec-cli",
      "bootstrap",
      "draft",
      "--root",
      guidedRoot,
      "--json",
    ]);
    if (draft.code !== 0) {
      return false;
    }

    const draftPayload = JSON.parse(draft.stdout) as { sessionId?: string };
    if (!draftPayload.sessionId) {
      return false;
    }

    const adopt = runCliProcess([
      "adopt",
      "--root",
      guidedRoot,
      "--session",
      draftPayload.sessionId,
      "--interactive",
    ], "accept\n\nskip_as_spec_debt\n\nreject\n\n");
    if (adopt.status !== 0) {
      return false;
    }

    resolveBlockingReviewItems(guidedRoot);

    const verify = await runCliAndCapture([
      "node",
      "jispec-cli",
      "verify",
      "--root",
      guidedRoot,
      "--json",
    ]);
    if (verify.code !== 0) {
      return false;
    }

    const verifyPayload = JSON.parse(verify.stdout) as { verdict?: string };
    return (
      adopt.stdout.includes("npm run jispec-cli -- verify") &&
      verifyPayload.verdict !== "FAIL_BLOCKING" &&
      fs.existsSync(path.join(guidedRoot, ".spec", "sessions", draftPayload.sessionId, "manifest.json")) &&
      fs.existsSync(path.join(guidedRoot, ".spec", "handoffs", "adopt-summary.md")) &&
      fs.existsSync(path.join(guidedRoot, ".spec", "handoffs", "verify-summary.md"))
    );
}

function resolveBlockingReviewItems(root: string): void {
  const recordPath = path.join(root, ".spec", "greenfield", "review-pack", "review-record.yaml");
  if (!fs.existsSync(recordPath)) {
    return;
  }

  const record = yaml.load(fs.readFileSync(recordPath, "utf-8")) as {
    decisions?: Array<{ decision_id?: string; status?: string; blocking?: boolean }>;
  };

  for (const decision of record.decisions ?? []) {
    if (decision.blocking === true && decision.status === "proposed" && decision.decision_id) {
      runGreenfieldReviewTransition({
        root,
        decisionId: decision.decision_id,
        action: "adopt",
        actor: "reviewer",
        reason: "Resolve blocking review item before verify.",
        now: new Date().toISOString(),
      });
    }
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
