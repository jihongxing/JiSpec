import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { normalizeInstallableCliArgv } from "../cli";

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[]): CliResult {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const cliEntry = path.join(repoRoot, "tools", "jispec", "cli.ts");
  const result = spawnSync(process.execPath, ["--import", "tsx", cliEntry, ...args], {
    cwd: repoRoot,
    encoding: "utf-8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function assertHelp(args: string[], snippets: string[]): void {
  const result = runCli(args);
  assert.equal(result.status, 0, result.stderr);
  for (const snippet of snippets) {
    assert.ok(
      result.stdout.includes(snippet),
      `Expected '${args.join(" ")}' help to include '${snippet}'. Output:\n${result.stdout}`,
    );
  }
}

function runNpm(args: string[]): CliResult {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const result = spawnSync("npm", args, {
    cwd: repoRoot,
    encoding: "utf-8",
    maxBuffer: 1024 * 1024 * 10,
    shell: process.platform === "win32",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function main(): void {
  console.log("=== Installable CLI Surface Tests ===\n");

  let passed = 0;
  let failed = 0;

  const runCase = (name: string, run: () => void): void => {
    try {
      run();
      console.log(`✓ Test ${passed + failed + 1}: ${name}`);
      passed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
      failed++;
    }
  };

  runCase("friendly bootstrap aliases normalize to stable command chains", () => {
    assert.deepEqual(
      normalizeInstallableCliArgv(["node", "jispec", "discover", "--json"]),
      ["node", "jispec", "bootstrap", "discover", "--json"],
    );
    assert.deepEqual(
      normalizeInstallableCliArgv(["node", "jispec", "draft", "--root", "."]),
      ["node", "jispec", "bootstrap", "draft", "--root", "."],
    );
    assert.deepEqual(
      normalizeInstallableCliArgv(["node", "jispec", "new-project", "--requirements", "req.md"]),
      ["node", "jispec", "bootstrap", "new-project", "--requirements", "req.md"],
    );
  });

  runCase("friendly governance aliases normalize to stable command chains", () => {
    assert.deepEqual(
      normalizeInstallableCliArgv(["node", "jispec", "dashboard", "--json"]),
      ["node", "jispec", "console", "dashboard", "--json"],
    );
    assert.deepEqual(
      normalizeInstallableCliArgv(["node", "jispec", "value-report"]),
      ["node", "jispec", "metrics", "value-report"],
    );
    assert.deepEqual(
      normalizeInstallableCliArgv(["node", "jispec", "privacy-report"]),
      ["node", "jispec", "privacy", "report"],
    );
    assert.deepEqual(
      normalizeInstallableCliArgv(["node", "jispec", "acceptance"]),
      ["node", "jispec", "north-star", "acceptance"],
    );
  });

  runCase("friendly lifecycle aliases normalize to stable command chains", () => {
    assert.deepEqual(
      normalizeInstallableCliArgv(["node", "jispec", "migrate-policy"]),
      ["node", "jispec", "policy", "migrate"],
    );
    assert.deepEqual(
      normalizeInstallableCliArgv(["node", "jispec", "waivers"]),
      ["node", "jispec", "waiver", "list"],
    );
    assert.deepEqual(
      normalizeInstallableCliArgv(["node", "jispec", "review-debt", "debt-1"]),
      ["node", "jispec", "spec-debt", "owner-review", "debt-1"],
    );
    assert.deepEqual(
      normalizeInstallableCliArgv(["node", "jispec", "refresh-source"]),
      ["node", "jispec", "source", "refresh"],
    );
    assert.deepEqual(
      normalizeInstallableCliArgv(["node", "jispec", "ci-verify"]),
      ["node", "jispec", "ci"],
    );
  });

  runCase("root help advertises installable product shortcuts", () => {
    const result = runCli(["--help"]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes("Installable CLI shortcuts:"));
    assert.ok(result.stdout.includes("jispec discover [--init-project] [--json]"));
    assert.ok(result.stdout.includes("jispec ci"));
    assert.ok(result.stdout.includes("jispec dashboard [--json]"));
    assert.ok(result.stdout.includes("jispec pilot-package [--json]"));
    assert.ok(result.stdout.includes("jispec acceptance [--json]"));
  });

  runCase("friendly bootstrap help routes through the stable implementation", () => {
    assertHelp(["discover", "--help"], ["Discover repository evidence", "--init-project"]);
    assertHelp(["draft", "--help"], ["Draft the first contract bundle", "--session <id|latest>"]);
  });

  runCase("friendly governance and lifecycle help routes through stable implementations", () => {
    assertHelp(["dashboard", "--help"], ["governance dashboard shell"]);
    assertHelp(["pilot-package", "--help"], ["pilot product package"]);
    assertHelp(["migrate-policy", "--help"], [".spec/policy.yaml"]);
    assertHelp(["review-debt", "--help"], ["owner review"]);
  });

  runCase("npm package dry-run includes the installable bin surface", () => {
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8")) as { files?: string[] };
    assert.ok(packageJson.files?.includes("bin/"));
    assert.ok(packageJson.files?.includes("tools/jispec/"));
    assert.ok(packageJson.files?.includes("!tools/jispec/tests/"));

    const result = runNpm(["pack", "--dry-run", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const [pack] = JSON.parse(result.stdout) as Array<{ name: string; files: Array<{ path: string }> }>;
    const packedPaths = new Set(pack.files.map((file) => file.path));
    assert.equal(pack.name, "jispec");
    const binDir = path.join(repoRoot, "bin");
    const isRuntimeJunction = fs.existsSync(binDir) && fs.realpathSync(binDir) !== binDir;
    if (fs.existsSync(path.join(binDir, "jispec.js")) && !isRuntimeJunction) {
      assert.ok(packedPaths.has("bin/jispec.js"), result.stdout);
    }
    assert.ok(packedPaths.has("tools/jispec/cli.ts") || packedPaths.has("tools/jispec/cli.js"), result.stdout);
    assert.ok(!packedPaths.has("tools/jispec/tests/installable-cli-surface.ts"), result.stdout);
  });

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
