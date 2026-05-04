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

function npmStepArgs(args: string[]): string[] {
  if (!npmExecPath) {
    return args;
  }
  return [npmExecPath, ...args];
}

function npmStepCommand(): { command: string; args: string[] } {
  if (npmExecPath) {
    return { command: nodeCommand, args: [] };
  }
  if (process.platform === "win32") {
    return { command: "cmd.exe", args: ["/d", "/s", "/c", "npm"] };
  }
  return { command: "npm", args: [] };
}

const gateSteps: GateStep[] = [
  {
    name: "TypeScript typecheck",
    ...npmStepCommand(),
    args: [...npmStepCommand().args, ...npmStepArgs(["run", "typecheck"])],
  },
  {
    name: "V1 mainline golden path",
    command: nodeCommand,
    args: ["--import", "tsx", "./tools/jispec/tests/v1-mainline-golden-path.ts"],
  },
  {
    name: "Doctor V1 readiness",
    command: nodeCommand,
    args: ["--import", "tsx", "./tools/jispec/tests/doctor-mainline-readiness.ts"],
  },
  {
    name: "Unified regression runner",
    command: nodeCommand,
    args: ["--import", "tsx", "./tools/jispec/tests/regression-runner.ts"],
  },
  {
    name: "CI verify wrapper",
    ...npmStepCommand(),
    args: [...npmStepCommand().args, ...npmStepArgs(["run", "ci:verify"])],
  },
];

function main(): number {
  console.log("=== JiSpec Post-Release Gate ===\n");

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
      console.error(`\nPost-release gate failed while starting '${step.name}': ${result.error.message}`);
      return 1;
    }

    if (result.status !== 0) {
      console.error(`\nPost-release gate failed at '${step.name}' after ${durationSeconds}s.`);
      return result.status ?? 1;
    }

    console.log(`\n✓ ${step.name} passed in ${durationSeconds}s\n`);
  }

  const totalSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Post-release gate passed in ${totalSeconds}s.`);
  return 0;
}

function formatCommandForDisplay(command: string, args: string[]): string {
  if (command === process.execPath && npmExecPath && args[0] === npmExecPath) {
    return ["npm", ...args.slice(1)].join(" ");
  }
  if (command === process.execPath) {
    return ["node", ...args].join(" ");
  }
  if (command === "cmd.exe") {
    return ["npm", ...args.slice(4)].join(" ");
  }
  return [command, ...args].join(" ");
}

process.exitCode = main();
