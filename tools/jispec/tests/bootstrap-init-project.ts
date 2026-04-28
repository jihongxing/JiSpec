import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { runBootstrapDiscover } from "../bootstrap/discover";
import { runBootstrapInitProject } from "../bootstrap/init-project";
import { main as runCliMain } from "../cli";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface ProjectYaml {
  id?: string;
  name?: string;
  version?: string;
  delivery_model?: string;
  domain_taxonomy?: {
    packs?: string[];
  };
  source_documents?: {
    requirements?: string;
    technical_solution?: string;
  };
  global_gates?: string[];
}

async function main(): Promise<void> {
  console.log("=== Bootstrap Init Project Test ===\n");

  const scaffoldRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-init-project-"));
  const discoverRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-init-discover-"));
  const cliRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-init-cli-"));
  const results: TestResult[] = [];

  try {
    seedPackageRepository(scaffoldRoot, "@acme/payment-gateway");
    const scaffoldResult = runBootstrapInitProject({ root: scaffoldRoot });
    const projectPath = path.join(scaffoldRoot, "jiproject", "project.yaml");
    const project = yaml.load(fs.readFileSync(projectPath, "utf-8")) as ProjectYaml;

    results.push({
      name: "init-project creates a minimal schema-shaped project scaffold",
      passed:
        scaffoldResult.created === true &&
        scaffoldResult.overwritten === false &&
        scaffoldResult.writtenFiles.some((filePath) => filePath.endsWith("jiproject/project.yaml")) &&
        project.id === "acme-payment-gateway" &&
        project.name === "Payment Gateway" &&
        project.version === "0.1.0" &&
        project.delivery_model === "bootstrap-takeover" &&
        Array.isArray(project.domain_taxonomy?.packs) &&
        project.domain_taxonomy.packs.length === 0 &&
        project.source_documents?.requirements === "README.md" &&
        project.source_documents?.technical_solution === "README.md" &&
        Array.isArray(project.global_gates) &&
        project.global_gates.includes("contracts_validated"),
      error: `Expected minimal project.yaml from package metadata, got ${JSON.stringify(project)}.`,
    });

    const originalContent = fs.readFileSync(projectPath, "utf-8");
    const protectedResult = runBootstrapInitProject({ root: scaffoldRoot });
    const protectedContent = fs.readFileSync(projectPath, "utf-8");
    fs.writeFileSync(projectPath, "id: custom\nname: Custom\nversion: 9.9.9\ndelivery_model: custom\nsource_documents:\n  requirements: jiproject/project.yaml\n  technical_solution: jiproject/project.yaml\nglobal_gates: []\n", "utf-8");
    const forcedResult = runBootstrapInitProject({ root: scaffoldRoot, force: true });
    const forcedProject = yaml.load(fs.readFileSync(projectPath, "utf-8")) as ProjectYaml;

    results.push({
      name: "init-project protects existing files unless force is passed",
      passed:
        protectedResult.created === false &&
        protectedResult.overwritten === false &&
        protectedResult.writtenFiles.length === 0 &&
        protectedContent === originalContent &&
        forcedResult.overwritten === true &&
        forcedProject.id === "acme-payment-gateway",
      error: "Expected existing project.yaml to be preserved without --force and overwritten with force.",
    });

    seedPackageRepository(discoverRoot, "discover-init");
    const missingProjectDiscover = runBootstrapDiscover({ root: discoverRoot, writeFile: false });
    const initializedDiscover = runBootstrapDiscover({ root: discoverRoot, initProject: true, writeFile: false });

    results.push({
      name: "discover suggests explicit scaffold and --init-project creates it",
      passed:
        fs.existsSync(path.join(discoverRoot, "jiproject", "project.yaml")) &&
        missingProjectDiscover.graph.warnings.some((warning) => warning.includes("bootstrap init-project")) &&
        !missingProjectDiscover.graph.warnings.some((warning) => warning.includes("[FILE_MISSING] jiproject/project.yaml")) &&
        initializedDiscover.writtenFiles.some((filePath) => filePath.endsWith("jiproject/project.yaml")) &&
        !initializedDiscover.graph.warnings.some((warning) => warning.includes("Project scaffold is missing")) &&
        !initializedDiscover.graph.warnings.some((warning) => warning.includes("[FILE_MISSING] jiproject/project.yaml")),
      error: `Expected discover scaffold hint before init and no project missing warning after init. Before=${JSON.stringify(missingProjectDiscover.graph.warnings)}, after=${JSON.stringify(initializedDiscover.graph.warnings)}.`,
    });

    seedPackageRepository(cliRoot, "cli-init");
    const previousLog = console.log;
    const captured: string[] = [];
    console.log = (message?: unknown, ...optional: unknown[]) => {
      captured.push([message, ...optional].map(String).join(" "));
    };
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;
    const cliCode = await runCliMain(["node", "jispec-cli", "bootstrap", "init-project", "--root", cliRoot]);
    console.log = previousLog;
    process.exitCode = previousExitCode;

    results.push({
      name: "CLI exposes bootstrap init-project command",
      passed:
        cliCode === 0 &&
        fs.existsSync(path.join(cliRoot, "jiproject", "project.yaml")) &&
        captured.join("\n").includes("Bootstrap project scaffold created"),
      error: `Expected CLI init-project to create scaffold and print summary, got code=${cliCode}, output=${captured.join("\n")}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap init-project execution",
      passed: false,
      error: message,
    });
  } finally {
    fs.rmSync(scaffoldRoot, { recursive: true, force: true });
    fs.rmSync(discoverRoot, { recursive: true, force: true });
    fs.rmSync(cliRoot, { recursive: true, force: true });
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

function seedPackageRepository(root: string, packageName: string): void {
  fs.writeFileSync(path.join(root, "README.md"), `# ${packageName}\n`, "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: packageName, private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes.ts"),
    'const app = { get: () => undefined };\napp.get("/health", () => "ok");\n',
    "utf-8",
  );
}

void main();
