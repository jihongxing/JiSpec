import { spawnSync } from "node:child_process";
import path from "node:path";

function assertIncludes(haystack: string, needle: string, context: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${context} is missing '${needle}'.`);
  }
}

function main(): void {
  console.log("=== CLI Help Surface Tests ===\n");

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const cliEntry = path.join(repoRoot, "tools", "jispec", "cli.ts");
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", cliEntry, "--help"],
    {
      cwd: repoRoot,
      encoding: "utf-8",
    },
  );

  let passed = 0;
  let failed = 0;

  try {
    if (result.status !== 0) {
      throw new Error(`CLI help exited with status ${result.status}. stderr: ${result.stderr}`);
    }

    const help = result.stdout;

    assertIncludes(help, "Current primary surface:", "help text");
    assertIncludes(help, "Legacy compatibility surface:", "help text");
    assertIncludes(help, "Mainline workflow shortcuts:", "help text");
    console.log("✓ Test 1: help text is split into primary, compatibility, and workflow shortcut surfaces");
    passed++;

    assertIncludes(help, "jispec-cli verify [--json]", "primary surface");
    assertIncludes(help, "jispec-cli init --requirements <path> [--technical-solution <path>] [--json]", "primary surface");
    assertIncludes(help, "jispec-cli change <summary> [--mode prompt|execute] [--json]", "primary surface");
    assertIncludes(help, "jispec-cli release snapshot --version <version> [--json]", "primary surface");
    assertIncludes(help, "jispec-cli implement [--fast] [--json]", "primary surface");
    assertIncludes(help, "jispec-cli bootstrap new-project --requirements <path> [--technical-solution <path>] [--json]", "primary surface");
    assertIncludes(help, "jispec-cli bootstrap discover [--json]", "primary surface");
    assertIncludes(help, "jispec-cli bootstrap draft [--json]", "primary surface");
    assertIncludes(help, "jispec-cli adopt --interactive [--json]", "primary surface");
    assertIncludes(help, "jispec-cli doctor v1", "primary surface");
    assertIncludes(help, "jispec-cli doctor runtime", "primary surface");
    assertIncludes(help, "npm run ci:verify", "primary surface");
    console.log("✓ Test 2: primary surface lists init, verify, change, implement, bootstrap commands, adopt, doctor v1, doctor runtime, and ci:verify");
    passed++;

    assertIncludes(help, "jispec-cli slice ...", "legacy surface");
    assertIncludes(help, "jispec-cli template ...", "legacy surface");
    assertIncludes(help, "npm run validate:repo", "compatibility aliases");
    assertIncludes(help, "change --mode prompt -> follow next commands manually", "workflow shortcuts");
    assertIncludes(help, "change --mode execute -> orchestrate implement -> verify", "workflow shortcuts");
    assertIncludes(help, "implement --fast -> verify --fast", "workflow shortcuts");
    console.log("✓ Test 3: compatibility surface, aliases, and workflow shortcuts are explicitly listed");
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
