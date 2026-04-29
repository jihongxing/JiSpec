import fs from "node:fs";
import path from "node:path";

interface PackageJson {
  description?: string;
  scripts?: Record<string, string>;
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
    assertEqual(scripts["jispec-cli"], "node --import tsx ./tools/jispec/cli.ts", "primary script `jispec-cli`");
    assertEqual(scripts.verify, "node --import tsx ./tools/jispec/cli.ts verify", "primary script `verify`");
    assertEqual(
      scripts["post-release:gate"],
      "node --import tsx ./scripts/post-release-gate.ts",
      "primary script `post-release:gate`",
    );
    assertEqual(scripts["ci:verify"], "node --import tsx ./scripts/check-jispec.ts", "primary script `ci:verify`");
    console.log("✓ Test 2: primary scripts point at the current first-class entry points");
    passed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ Test ${passed + failed + 1} failed: ${message}`);
    failed++;
  }

  try {
    assertDefined(scripts.jispec, "compatibility script `jispec`");
    assertEqual(scripts["validate:repo"], "node --import tsx ./tools/jispec/cli.ts verify", "compatibility script `validate:repo`");
    assertEqual(scripts["check:jispec"], "node --import tsx ./scripts/check-jispec.ts", "compatibility script `check:jispec`");

    if ("bootstrap" in scripts || "change" in scripts || "implement" in scripts) {
      throw new Error("roadmap-only commands should not exist as package scripts yet.");
    }

    console.log("✓ Test 3: compatibility scripts remain available and roadmap-only scripts are absent");
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
