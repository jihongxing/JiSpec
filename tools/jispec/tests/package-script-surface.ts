import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

interface PackageJson {
  version: string;
  description?: string;
  bin?: Record<string, string>;
  files?: string[];
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function assertEqual(actual: string | undefined, expected: string, context: string): void {
  if (actual !== expected) {
    throw new Error(`${context} expected '${expected}' but got '${actual ?? "undefined"}'.`);
  }
}

function assertDefined(value: string | undefined, context: string): void {
  if (!value) {
    throw new Error(`${context} is missing.`);
  }
}

function assertArrayIncludes(values: string[] | undefined, expected: string, context: string): void {
  if (!values?.includes(expected)) {
    throw new Error(`${context} is missing '${expected}'.`);
  }
}

function runNode(args: string[], cwd: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf-8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function main(): void {
  console.log("=== Package Script Surface Tests ===\n");

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const packageJsonPath = path.join(repoRoot, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as PackageJson;
  const scripts = packageJson.scripts ?? {};

  let passed = 0;
  let failed = 0;

  try {
    assertEqual(
      packageJson.description,
      "JiSpec-CLI: contract-driven AI delivery gate and protocol validators",
      "package description",
    );
    console.log("✓ Test 1: package description stays aligned to JiSpec-CLI");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  }

  try {
    assertEqual(packageJson.bin?.jispec, "./bin/jispec.js", "package bin `jispec`");
    assertEqual(packageJson.bin?.["jispec-cli"], "./bin/jispec.js", "package bin `jispec-cli`");
    assertArrayIncludes(packageJson.files, "bin/", "package files");
    assertArrayIncludes(packageJson.files, "tools/jispec/", "package files");
    assertArrayIncludes(packageJson.files, "!tools/jispec/tests/", "package files");
    assertArrayIncludes(packageJson.files, "schemas/", "package files");
    assertEqual(packageJson.engines?.node, ">=20", "package node engine");
    console.log("✓ Test 2: package exposes stable npm bin and publish file surface");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  }

  try {
    assertEqual(scripts["jispec-cli"], "node --import tsx ./tools/jispec/cli.ts", "primary script `jispec-cli`");
    assertEqual(scripts.jispec, "node ./bin/jispec.js", "primary package-bin script `jispec`");
    assertEqual(scripts.verify, "node --import tsx ./tools/jispec/cli.ts verify", "primary script `verify`");
    assertEqual(
      scripts["post-release:gate"],
      "node --import tsx ./scripts/post-release-gate.ts",
      "primary script `post-release:gate`",
    );
    assertEqual(scripts["ci:verify"], "node --import tsx ./scripts/check-jispec.ts", "primary script `ci:verify`");
    console.log("✓ Test 3: primary scripts point at the current first-class entry points");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  }

  try {
    assertEqual(scripts["validate:repo"], "node --import tsx ./tools/jispec/cli.ts verify", "compatibility script `validate:repo`");
    assertEqual(scripts["check:jispec"], "node --import tsx ./scripts/check-jispec.ts", "compatibility script `check:jispec`");
    assertDefined(packageJson.dependencies?.tsx, "runtime dependency `tsx` for npm bin");
    if (packageJson.devDependencies?.tsx) {
      throw new Error("tsx must stay in dependencies so the npm bin can execute the TypeScript CLI after install.");
    }

    if ("bootstrap" in scripts || "change" in scripts || "implement" in scripts) {
      throw new Error("roadmap-only commands should not exist as package scripts yet.");
    }

    console.log("✓ Test 4: compatibility scripts remain available and runtime bin dependency is packaged");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  }

  try {
    const cliEntry = path.join(repoRoot, "tools", "jispec", "cli.ts");
    const result = runNode(["--import", "tsx", cliEntry, "--version"], repoRoot);
    if (result.status !== 0) {
      throw new Error(`CLI --version exited with ${result.status}. stderr: ${result.stderr}`);
    }
    assertEqual(result.stdout.trim(), packageJson.version, "CLI --version output");
    console.log("✓ Test 5: CLI --version reports package.json version");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  }

  try {
    const binEntry = path.join(repoRoot, "bin", "jispec.js");
    const result = runNode([binEntry, "--version"], repoRoot);
    if (result.status !== 0) {
      throw new Error(`bin --version exited with ${result.status}. stderr: ${result.stderr}`);
    }
    assertEqual(result.stdout.trim(), packageJson.version, "bin `jispec` --version output");
    console.log("✓ Test 6: npm bin shim dispatches to the same CLI version surface");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  }

  try {
    const cliEntry = path.join(repoRoot, "tools", "jispec", "cli.ts");
    const result = runNode(["--import", "tsx", cliEntry, "release", "snapshot", "--help"], repoRoot);
    if (result.status !== 0) {
      throw new Error(`release snapshot --help exited with ${result.status}. stderr: ${result.stderr}`);
    }
    if (!result.stdout.includes("--version <version>")) {
      throw new Error("release snapshot help must keep its release --version option instead of being captured by root CLI version.");
    }
    console.log("✓ Test 7: root CLI version handling does not shadow subcommand --version options");
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
