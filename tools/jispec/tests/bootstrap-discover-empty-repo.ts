import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBootstrapDiscover } from "../bootstrap/discover";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== Bootstrap Discover Empty Repo Test ===\n");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-bootstrap-empty-"));
  const results: TestResult[] = [];

  try {
    const discoverResult = runBootstrapDiscover({ root: tempRoot, writeFile: false });

    results.push({
      name: "empty repo returns empty inventories",
      passed:
        discoverResult.summary.routeCount === 0 &&
        discoverResult.summary.testCount === 0 &&
        discoverResult.summary.schemaCount === 0 &&
        discoverResult.summary.migrationCount === 0 &&
        discoverResult.summary.sourceFileCount === 0,
      error: `Expected all counts to be 0, got ${JSON.stringify(discoverResult.summary)}.`,
    });

    results.push({
      name: "empty repo produces warnings instead of failing",
      passed: discoverResult.warningCount > 0,
      error: "Expected at least one warning for an empty repository.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "empty repo discovery execution",
      passed: false,
      error: message,
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    if (result.passed) {
      console.log(`✓ ${result.name}`);
      passed++;
    } else {
      console.log(`✗ ${result.name}`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
      failed++;
    }
  }

  console.log(`\n${passed}/${results.length} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
