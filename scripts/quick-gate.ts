import { spawnSync } from "node:child_process";
import path from "node:path";

interface GateStep {
  name: string;
  command: string;
  args: string[];
}

const repoRoot = path.resolve(__dirname, "..");
const nodeCommand = process.execPath;
const npmExecPath = process.env.npm_execpath;
const passthroughArgs = process.argv.slice(2);

function npmStep(name: string, args: string[]): GateStep {
  if (npmExecPath) {
    return {
      name,
      command: nodeCommand,
      args: [npmExecPath, ...args],
    };
  }
  return {
    name,
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args,
  };
}

function buildGateSteps(extraTestFiles: string[]): GateStep[] {
  return [
    npmStep("TypeScript typecheck", ["run", "typecheck"]),
    {
      name: "Regression matrix contract",
      command: nodeCommand,
      args: ["--import", "tsx", "./tools/jispec/tests/regression-matrix-contract.ts"],
    },
    ...extraTestFiles.map((testFile) => ({
      name: `Focused test: ${testFile}`,
      command: nodeCommand,
      args: ["--import", "tsx", normalizeTestPath(testFile)],
    })),
  ];
}

function main(): number {
  const listOnly = passthroughArgs.includes("--list");
  const extraTestFiles = passthroughArgs.filter((arg) => arg !== "--list");
  const gateSteps = buildGateSteps(extraTestFiles);

  if (listOnly) {
    printStepList(gateSteps);
    return 0;
  }

  console.log("=== JiSpec Quick Gate ===\n");
  if (extraTestFiles.length === 0) {
    console.log("Optional focused tests: pass test file paths after `--` to run them after the quick contract checks.\n");
  }

  const startedAt = Date.now();
  for (const [index, step] of gateSteps.entries()) {
    const stepNumber = `${index + 1}/${gateSteps.length}`;
    const displayCommand = formatCommandForDisplay(step.command, step.args);
    const stepStartedAt = Date.now();

    console.log(`[${stepNumber}] ${step.name}`);
    console.log(`$ ${displayCommand}\n`);

    const result = spawnSync(step.command, step.args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: false,
    });

    const durationSeconds = ((Date.now() - stepStartedAt) / 1000).toFixed(1);
    if (result.error) {
      console.error(`\nQuick gate failed while starting '${step.name}': ${result.error.message}`);
      return 1;
    }
    if (result.status !== 0) {
      console.error(`\nQuick gate failed at '${step.name}' after ${durationSeconds}s.`);
      return result.status ?? 1;
    }

    console.log(`\n✓ ${step.name} passed in ${durationSeconds}s\n`);
  }

  const totalSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Quick gate passed in ${totalSeconds}s.`);
  return 0;
}

function printStepList(gateSteps: GateStep[]): void {
  console.log("JiSpec Quick Gate steps:");
  for (const step of gateSteps) {
    console.log(`- ${step.name}: ${formatCommandForDisplay(step.command, step.args)}`);
  }
  console.log("- Optional focused tests: npm run gate:quick -- tools/jispec/tests/<suite>.ts");
}

function normalizeTestPath(testFile: string): string {
  return testFile.replace(/\\/g, "/");
}

function formatCommandForDisplay(command: string, args: string[]): string {
  if (command === process.execPath && npmExecPath && args[0] === npmExecPath) {
    return ["npm", ...args.slice(1)].join(" ");
  }
  if (command === process.execPath) {
    return ["node", ...args].join(" ");
  }
  return [command, ...args].join(" ");
}

process.exitCode = main();
