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
  console.log("=== Bootstrap Discover Unknown Layout Test ===\n");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-bootstrap-unknown-"));
  const weirdDir = path.join(tempRoot, "custom-layout", "deep", "nest");
  fs.mkdirSync(weirdDir, { recursive: true });
  fs.writeFileSync(path.join(weirdDir, "random-notes.txt"), "hello world\n", "utf-8");
  fs.writeFileSync(path.join(weirdDir, "engine.bin"), "not text", "utf-8");

  const results: TestResult[] = [];

  try {
    const discoverResult = runBootstrapDiscover({ root: tempRoot, writeFile: false });

    results.push({
      name: "unknown layout still inventories source files",
      passed: discoverResult.summary.sourceFileCount >= 2,
      error: `Expected at least 2 inventoried files, got ${discoverResult.summary.sourceFileCount}.`,
    });

    results.push({
      name: "unknown layout emits warnings but succeeds",
      passed: discoverResult.warningCount > 0,
      error: "Expected warnings for unrecognized repository layout.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "unknown layout discovery execution",
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
