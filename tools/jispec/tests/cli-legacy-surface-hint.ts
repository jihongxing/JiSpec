import { spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const cliEntry = path.join(repoRoot, "tools", "jispec", "cli.ts");

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", cliEntry, ...args],
    {
      cwd: repoRoot,
      encoding: "utf-8",
    },
  );

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function main(): void {
  console.log("=== CLI Legacy Surface Hint Tests ===\n");

  let passed = 0;
  let failed = 0;

  try {
    const result = runCli(["slice", "list"]);
    if (result.status === 0) {
      throw new Error("slice list should no longer be a valid CLI command.");
    }

    if (result.stdout.includes("legacy compatibility surface") || result.stderr.includes("legacy compatibility surface")) {
      throw new Error("Retired legacy hint should not appear anywhere in CLI output.");
    }

    console.log("✓ Test 1: retired legacy commands are rejected without emitting a compatibility hint");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  }

  try {
    const result = runCli(["slice", "list", "--json"]);
    if (result.status === 0) {
      throw new Error("slice list --json should no longer be a valid CLI command.");
    }

    if (result.stdout.includes("[JiSpec]") || result.stderr.includes("[JiSpec]")) {
      throw new Error("Legacy hint should not appear in any output mode.");
    }
    console.log("✓ Test 2: retired legacy commands stay absent in JSON mode too");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
