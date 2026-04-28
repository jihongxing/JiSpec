import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { runGreenfieldInit } from "../tools/jispec/greenfield/init";
import { runVerify } from "../tools/jispec/verify/verify-runner";
import type { VerifyRunResult } from "../tools/jispec/verify/verdict";

interface DemoOptions {
  root: string;
  requirements: string;
  technicalSolution: string;
  force: boolean;
  json: boolean;
}

interface BaselineYaml {
  slices?: string[];
}

interface DemoResult {
  root: string;
  requirements: string;
  technicalSolution: string;
  emptyDirectoryPrepared: boolean;
  initStatus: string;
  verifyVerdict: string;
  verifyOk: boolean;
  firstSliceId?: string;
  acceptanceSummaryPath: string;
  nextCommands: string[];
  generatedAssets: {
    project: string;
    policy: string;
    ciWorkflow: string;
    baseline: string;
  };
  writtenFileCount: number;
  verifyIssueCount: number;
}

async function main(): Promise<number> {
  try {
    const options = parseArgs(process.argv.slice(2));
    prepareEmptyDirectory(options.root, options.force);

    const initResult = runGreenfieldInit({
      root: options.root,
      requirements: options.requirements,
      technicalSolution: options.technicalSolution,
      force: options.force,
    });

    if (initResult.status !== "input_contract_ready") {
      const result = buildDemoResult(options, initResult.status, undefined, initResult.writtenFiles.length);
      printResult(result, options.json);
      return 1;
    }

    const verifyResult = await runVerify({
      root: options.root,
      policyPath: ".spec/policy.yaml",
      useBaseline: true,
    });
    const result = buildDemoResult(options, initResult.status, verifyResult, initResult.writtenFiles.length);
    printResult(result, options.json);
    return verifyResult.ok ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Greenfield empty directory demo failed: ${message}`);
    return 1;
  }
}

function parseArgs(argv: string[]): DemoOptions {
  const repoRoot = getRepoRoot();
  const exampleRoot = path.join(repoRoot, "examples", "greenfield-empty-directory");
  const options: DemoOptions = {
    root: path.join(repoRoot, ".tmp", "greenfield-empty-directory-demo"),
    requirements: path.join(exampleRoot, "requirements.md"),
    technicalSolution: path.join(exampleRoot, "technical-solution.md"),
    force: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--root" && next) {
      options.root = path.resolve(next);
      index++;
    } else if (arg.startsWith("--root=")) {
      options.root = path.resolve(arg.slice("--root=".length));
    } else if (arg === "--requirements" && next) {
      options.requirements = path.resolve(next);
      index++;
    } else if (arg.startsWith("--requirements=")) {
      options.requirements = path.resolve(arg.slice("--requirements=".length));
    } else if (arg === "--technical-solution" && next) {
      options.technicalSolution = path.resolve(next);
      index++;
    } else if (arg.startsWith("--technical-solution=")) {
      options.technicalSolution = path.resolve(arg.slice("--technical-solution=".length));
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--json") {
      options.json = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function prepareEmptyDirectory(rootInput: string, force: boolean): void {
  const root = path.resolve(rootInput);
  if (fs.existsSync(root)) {
    const entries = fs.readdirSync(root);
    if (entries.length > 0) {
      if (!force) {
        throw new Error(`Target directory is not empty: ${root}. Re-run with --force to reset this demo directory.`);
      }
      assertSafeDemoRoot(root);
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  fs.mkdirSync(root, { recursive: true });
}

function assertSafeDemoRoot(root: string): void {
  const repoTmp = path.join(getRepoRoot(), ".tmp");
  const tempRoot = path.resolve(process.env.TEMP ?? process.env.TMP ?? "");
  const isUnderRepoTmp = isPathInside(root, repoTmp);
  const isUnderTemp = tempRoot.length > 0 && isPathInside(root, tempRoot);
  const hasDemoName = path.basename(root).toLowerCase().includes("greenfield");

  if ((!isUnderRepoTmp && !isUnderTemp) || !hasDemoName) {
    throw new Error(`Refusing to reset non-demo directory: ${root}`);
  }
}

function buildDemoResult(
  options: DemoOptions,
  initStatus: string,
  verifyResult: VerifyRunResult | undefined,
  writtenFileCount: number,
): DemoResult {
  const root = path.resolve(options.root);
  const firstSliceId = readFirstSliceId(root);

  return {
    root: normalizePath(root),
    requirements: normalizePath(path.resolve(options.requirements)),
    technicalSolution: normalizePath(path.resolve(options.technicalSolution)),
    emptyDirectoryPrepared: true,
    initStatus,
    verifyVerdict: verifyResult?.verdict ?? "NOT_RUN",
    verifyOk: verifyResult?.ok ?? false,
    firstSliceId,
    acceptanceSummaryPath: ".spec/greenfield/initialization-summary.md",
    nextCommands: [
      "jispec-cli verify --root . --policy .spec/policy.yaml",
      'jispec-cli change "V2: describe the next requirement change" --root .',
    ],
    generatedAssets: {
      project: "jiproject/project.yaml",
      policy: ".spec/policy.yaml",
      ciWorkflow: ".github/workflows/jispec-verify.yml",
      baseline: ".spec/baselines/current.yaml",
    },
    writtenFileCount,
    verifyIssueCount: verifyResult?.issueCount ?? 0,
  };
}

function readFirstSliceId(root: string): string | undefined {
  const baselinePath = path.join(root, ".spec", "baselines", "current.yaml");
  if (!fs.existsSync(baselinePath)) {
    return undefined;
  }

  const baseline = yaml.load(fs.readFileSync(baselinePath, "utf-8")) as BaselineYaml | undefined;
  return baseline?.slices?.[0];
}

function printResult(result: DemoResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const lines = [
    "Greenfield empty directory acceptance demo",
    `Root: ${result.root}`,
    `Init: ${result.initStatus}`,
    `Verify: ${result.verifyVerdict}`,
    `First slice: ${result.firstSliceId ?? "none"}`,
    `Acceptance summary: ${result.acceptanceSummaryPath}`,
    "",
    "Next commands:",
    ...result.nextCommands.map((command) => `- ${command}`),
  ];
  console.log(lines.join("\n"));
}

function getRepoRoot(): string {
  return path.resolve(__dirname, "..");
}

function isPathInside(child: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

void main().then((code) => {
  process.exitCode = code;
});
