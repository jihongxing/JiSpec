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
  console.log("=== Bootstrap Discover Signal Filtering Test ===\n");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-bootstrap-signal-"));
  const results: TestResult[] = [];

  try {
    seedRepository(tempRoot);
    const discoverResult = runBootstrapDiscover({ root: tempRoot, writeFile: false });

    const discoveredRoutes = discoverResult.graph.routes.map((route) => route.path);
    const discoveredTests = discoverResult.graph.tests.map((test) => test.path);
    const discoveredManifestKinds = discoverResult.graph.manifests.map((manifest) => manifest.kind);
    const discoveredDocumentKinds = discoverResult.graph.documents.map((document) => document.kind);

    results.push({
      name: "route discovery keeps production HTTP signatures and ignores test/template fixtures",
      passed:
        discoverResult.summary.routeCount === 2 &&
        discoveredRoutes.includes("/health") &&
        discoveredRoutes.includes("/orders") &&
        !discoveredRoutes.includes("/fake-test-only") &&
        !discoveredRoutes.includes("/template-only") &&
        discoverResult.summary.highConfidenceRouteCount === 2,
      error: `Expected only production routes to survive filtering, got ${JSON.stringify(discoveredRoutes)}.`,
    });

    results.push({
      name: "test discovery keeps real regression assets and drops implementation helpers",
      passed:
        discoveredTests.includes("tests/orders.test.ts") &&
        discoveredTests.includes("scripts/test-bootstrap.ts") &&
        !discoveredTests.includes("tools/test-runner.ts") &&
        !discoveredTests.includes("docs/test-agent.md"),
      error: `Expected only real test assets, got ${JSON.stringify(discoveredTests)}.`,
    });

    results.push({
      name: "discover surfaces repo manifests and docs for later bootstrap drafting",
      passed:
        discoveredManifestKinds.includes("package-json") &&
        discoveredManifestKinds.includes("tsconfig") &&
        discoveredDocumentKinds.includes("readme"),
      error: `Expected package/tsconfig manifests and README docs, got manifests=${JSON.stringify(discoveredManifestKinds)}, documents=${JSON.stringify(discoveredDocumentKinds)}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap discover signal filtering execution",
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

function seedRepository(root: string): void {
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "signal-repo", private: true }, null, 2), "utf-8");
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true } }, null, 2), "utf-8");
  fs.writeFileSync(path.join(root, "README.md"), "# Signal Repo\n", "utf-8");

  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes.ts"),
    'const app = { get: () => undefined, post: () => undefined };\napp.get("/health", () => "ok");\napp.post("/orders", () => "created");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "tests", "orders.test.ts"),
    'const app = { get: () => undefined };\napp.get("/fake-test-only", () => "ignore");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(root, "scripts", "test-bootstrap.ts"), "console.log('bootstrap test');\n", "utf-8");

  fs.mkdirSync(path.join(root, "tools"), { recursive: true });
  fs.writeFileSync(path.join(root, "tools", "test-runner.ts"), "export class TestRunner {}\n", "utf-8");

  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "test-agent.md"), "# not a test asset\n", "utf-8");

  fs.mkdirSync(path.join(root, "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "templates", "routes.ts"),
    'const app = { get: () => undefined };\napp.get("/template-only", () => "ignore");\n',
    "utf-8",
  );
}

main();
