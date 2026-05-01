import path from "node:path";
import { Doctor } from "../tools/jispec/doctor";

interface GateArgs {
  root: string;
  json: boolean;
  help: boolean;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return 0;
  }

  const startedAt = Date.now();
  const report = await new Doctor(args.root).checkCommercialPilotReadiness();

  if (args.json) {
    console.log(Doctor.formatJSON(report));
    return report.ready ? 0 : 1;
  }

  console.log("=== JiSpec Pilot Ready Gate ===\n");
  console.log(`Root: ${args.root}`);
  console.log(`Checks: ${report.passedChecks}/${report.totalChecks} passed`);
  console.log(`Ready: ${report.ready ? "YES" : "NO"}`);

  if (report.ready) {
    const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`\nPilot ready gate passed in ${durationSeconds}s.`);
    return 0;
  }

  const blockers = report.checks.filter((check) => check.status === "fail");
  console.error(`\nPilot ready gate failed with ${blockers.length} blocker(s):\n`);

  for (const [index, blocker] of blockers.entries()) {
    console.error(`${index + 1}. ${blocker.name}: ${blocker.summary}`);
    if (blocker.ownerAction) {
      console.error(`   Owner action: ${blocker.ownerAction}`);
    }
    if (blocker.nextCommand) {
      console.error(`   Next command: ${blocker.nextCommand}`);
    }
    if (blocker.sourceArtifacts?.length) {
      console.error(`   Source artifacts: ${blocker.sourceArtifacts.join(", ")}`);
    }
    console.error("");
  }

  console.error("Run `npm run jispec -- doctor pilot --json` for the full machine-readable report.");
  return 1;
}

function parseArgs(argv: string[]): GateArgs {
  let root = process.env.JISPEC_PILOT_ROOT ? path.resolve(process.env.JISPEC_PILOT_ROOT) : path.resolve(__dirname, "..");
  let json = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--root") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--root requires a value.");
      }
      root = path.resolve(value);
      index += 1;
    } else if (arg.startsWith("--root=")) {
      root = path.resolve(arg.slice("--root=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { root, json, help };
}

function printHelp(): void {
  console.log(`Usage: npm run pilot:ready -- [--root <path>] [--json]

Runs the commercial pilot readiness gate over local JiSpec artifacts.

Options:
  --root <path>  Repository root. Defaults to this workspace or JISPEC_PILOT_ROOT.
  --json         Print the underlying doctor pilot report as JSON.
  -h, --help     Show this help.
`);
}

void main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
