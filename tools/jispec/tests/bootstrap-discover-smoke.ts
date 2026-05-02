import fs from "node:fs";
import path from "node:path";
import { runBootstrapDiscover } from "../bootstrap/discover";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== Bootstrap Discover Smoke Test ===\n");

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const graphPath = path.join(repoRoot, ".spec", "facts", "bootstrap", "evidence-graph.json");
  const summaryPath = path.join(repoRoot, ".spec", "facts", "bootstrap", "evidence-summary.txt");
  const bootstrapSummaryPath = path.join(repoRoot, ".spec", "facts", "bootstrap", "bootstrap-summary.md");
  const results: TestResult[] = [];

  try {
    const discoverResult = runBootstrapDiscover({ root: repoRoot });

    results.push({
      name: "writes bootstrap evidence files",
      passed: fs.existsSync(graphPath) && fs.existsSync(summaryPath) && fs.existsSync(bootstrapSummaryPath),
      error: fs.existsSync(graphPath) && fs.existsSync(summaryPath) && fs.existsSync(bootstrapSummaryPath) ? undefined : "Expected bootstrap output files to exist.",
    });

    const graph = JSON.parse(fs.readFileSync(graphPath, "utf-8")) as {
      repoRoot?: string;
      generatedAt?: string;
      warnings?: unknown[];
      schemas?: unknown[];
      tests?: unknown[];
      sourceFiles?: unknown[];
    };

    results.push({
      name: "graph contains required top-level fields",
      passed:
        typeof graph.repoRoot === "string" &&
        typeof graph.generatedAt === "string" &&
        Array.isArray(graph.warnings),
      error: "Expected repoRoot, generatedAt, and warnings in evidence graph.",
    });

    results.push({
      name: "current repo yields non-empty schema, test, and source inventories",
      passed:
        discoverResult.summary.schemaCount > 0 &&
        discoverResult.summary.testCount > 0 &&
        discoverResult.summary.sourceFileCount > 0,
      error: `Expected non-empty summary counts, got schemas=${discoverResult.summary.schemaCount}, tests=${discoverResult.summary.testCount}, sourceFiles=${discoverResult.summary.sourceFileCount}.`,
    });

    results.push({
      name: "bootstrap summary md is the preferred human-readable companion path",
      passed:
        discoverResult.writtenFiles.some((filePath) => filePath.endsWith(".spec/facts/bootstrap/bootstrap-summary.md")) &&
        discoverResult.writtenFiles.some((filePath) => filePath.endsWith(".spec/facts/bootstrap/evidence-summary.txt")) &&
        fs.readFileSync(bootstrapSummaryPath, "utf-8").includes("# Bootstrap Summary") &&
        fs.readFileSync(bootstrapSummaryPath, "utf-8").includes("## Decision Snapshot") &&
        fs.readFileSync(bootstrapSummaryPath, "utf-8").includes("Current state:") &&
        fs.readFileSync(bootstrapSummaryPath, "utf-8").includes("Next command: `npm run jispec-cli -- bootstrap draft --root .`") &&
        fs.readFileSync(bootstrapSummaryPath, "utf-8").includes("Machine consumers should use `evidence-graph.json`"),
      error: "Expected discover to write bootstrap-summary.md while preserving evidence-summary.txt compatibility.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap discover smoke execution",
      passed: false,
      error: message,
    });
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
