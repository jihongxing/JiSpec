import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { runGreenfieldInit } from "../tools/jispec/greenfield/init";
import { runVerify } from "../tools/jispec/verify/verify-runner";
import type { VerifyRunResult } from "../tools/jispec/verify/verdict";
import { runChangeCommand, type ChangeCommandResult } from "../tools/jispec/change/change-command";

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

interface ChangeMainlineHandoffJson {
  change_intent?: {
    summary?: string;
    context_id?: string;
    slice_id?: string;
  };
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
  changeHandoffPath: string;
  nextCommands: string[];
  changeSmoke?: {
    sessionId: string;
    mode: string;
    state: string;
    lane: string;
    outcome?: string;
    archived: boolean;
    postVerifyVerdict?: string;
  };
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
    const changeSmoke = verifyResult.ok ? await runGreenfieldChangeSmoke(options.root) : undefined;
    const result = buildDemoResult(options, initResult.status, verifyResult, initResult.writtenFiles.length, changeSmoke);
    printResult(result, options.json);
    return verifyResult.ok && (!changeSmoke || changeSmoke.execution.state === "implemented") ? 0 : 1;
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
  changeSmoke?: ChangeCommandResult,
): DemoResult {
  const root = path.resolve(options.root);
  const firstSliceId = readFirstSliceId(root);
  const changeIntent = readChangeHandoff(root)?.change_intent;

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
    changeHandoffPath: ".spec/greenfield/change-mainline-handoff.json",
    nextCommands: [
      "jispec-cli verify --root . --policy .spec/policy.yaml",
      changeIntent?.summary && changeIntent.slice_id && changeIntent.context_id
        ? `jispec-cli change "${changeIntent.summary}" --root . --slice ${changeIntent.slice_id} --context ${changeIntent.context_id} --change-type add --mode prompt`
        : 'jispec-cli change "V2: describe the next requirement change" --root .',
    ],
    changeSmoke: changeSmoke
      ? {
          sessionId: changeSmoke.session.id,
          mode: changeSmoke.mode,
          state: changeSmoke.execution.state,
          lane: changeSmoke.session.laneDecision.lane,
          outcome: changeSmoke.execution.implement?.outcome,
          archived: changeSmoke.execution.implement?.sessionArchived === true,
          postVerifyVerdict: changeSmoke.execution.implement?.postVerifyVerdict,
        }
      : undefined,
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

async function runGreenfieldChangeSmoke(rootInput: string): Promise<ChangeCommandResult | undefined> {
  const root = path.resolve(rootInput);
  const handoff = readChangeHandoff(root);
  const intent = handoff?.change_intent;
  if (!intent?.summary || !intent.slice_id || !intent.context_id) {
    return undefined;
  }

  return runChangeCommand({
    root,
    summary: intent.summary,
    sliceId: intent.slice_id,
    contextId: intent.context_id,
    changeType: "add",
    mode: "execute",
    json: true,
    testCommand: buildVerifySmokeCommand(),
  });
}

function buildVerifySmokeCommand(): string {
  return `"${process.execPath}" -e "process.exit(0)"`;
}

function readChangeHandoff(root: string): ChangeMainlineHandoffJson | undefined {
  const handoffPath = path.join(root, ".spec", "greenfield", "change-mainline-handoff.json");
  if (!fs.existsSync(handoffPath)) {
    return undefined;
  }
  return JSON.parse(fs.readFileSync(handoffPath, "utf-8")) as ChangeMainlineHandoffJson;
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
    `Change handoff: ${result.changeHandoffPath}`,
    `Change smoke: ${result.changeSmoke?.state ?? "not run"}`,
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
