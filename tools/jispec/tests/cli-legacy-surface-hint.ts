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
    if (result.status !== 0) {
      throw new Error(`Expected slice list to succeed, got status ${result.status}. stderr: ${result.stderr}`);
    }

    if (!result.stdout.includes("[JiSpec] `slice` is part of the legacy compatibility surface.")) {
      throw new Error("Legacy hint did not appear for non-JSON slice command.");
    }

    console.log("✓ Test 1: legacy commands print a compatibility hint in text mode");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  }

  try {
    const result = runCli(["slice", "list", "--json"]);
    if (result.status !== 0) {
      throw new Error(`Expected slice list --json to succeed, got status ${result.status}. stderr: ${result.stderr}`);
    }

    if (result.stdout.includes("[JiSpec]")) {
      throw new Error("Legacy hint should not appear in JSON mode.");
    }

    const parsed = JSON.parse(result.stdout);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("JSON mode did not produce an object payload.");
    }

    console.log("✓ Test 2: legacy hints do not pollute JSON output");
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
