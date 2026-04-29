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
  console.log("=== Bootstrap Discover Exclusion Policy Test ===\n");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-bootstrap-exclusion-"));
  const results: TestResult[] = [];

  try {
    seedRepository(tempRoot);
    const discoverResult = runBootstrapDiscover({ root: tempRoot, writeFile: false });
    const includeNoiseResult = runBootstrapDiscover({ root: tempRoot, writeFile: false, includeNoise: true });
    const allEvidencePaths = collectEvidencePaths(discoverResult.graph);
    const includedNoisePaths = collectEvidencePaths(includeNoiseResult.graph);
    const exclusionRules = new Set((discoverResult.graph.excludedSummary?.rules ?? []).map((rule) => rule.ruleId));

    results.push({
      name: "exclusion policy keeps production evidence and drops cache/vendor/audit paths",
      passed:
        discoverResult.graph.routes.some((route) => route.path === "/orders") &&
        discoverResult.graph.documents.some((document) => document.path === "README.md") &&
        !allEvidencePaths.some((entry) => entry.includes(".pytest_cache")) &&
        !allEvidencePaths.some((entry) => entry.includes("artifacts/dpi-audit")) &&
        !allEvidencePaths.some((entry) => entry.includes("node_modules")) &&
        !allEvidencePaths.some((entry) => entry.includes("vendor/")) &&
        !allEvidencePaths.some((entry) => entry.includes("dist/")) &&
        !allEvidencePaths.some((entry) => entry.includes(".gradle/")) &&
        !allEvidencePaths.some((entry) => entry.includes("reports/security-audit/")) &&
        !allEvidencePaths.some((entry) => entry.includes("src/generated/")),
      error: `Expected noisy paths to be excluded, got evidence paths ${JSON.stringify(allEvidencePaths)}.`,
    });

    results.push({
      name: "excluded summary records second-round rule counts and opt-in guidance without polluting evidence",
      passed:
        (discoverResult.graph.excludedSummary?.totalExcludedFileCount ?? 0) >= 10 &&
        exclusionRules.has("python-cache-or-env") &&
        exclusionRules.has("audit-artifact") &&
        exclusionRules.has("dependency-bundle") &&
        exclusionRules.has("build-output") &&
        exclusionRules.has("generated-bundle") &&
        exclusionRules.has("tool-mirror") &&
        (discoverResult.graph.excludedSummary?.rules ?? []).every((rule) => typeof rule.reason === "string" && rule.reason.length > 0) &&
        (discoverResult.graph.excludedSummary?.rules ?? []).some((rule) => rule.optInHint?.includes("--include-noise")),
      error: `Expected exclusion summary to include cache/audit/dependency/build rules, got ${JSON.stringify(discoverResult.graph.excludedSummary)}.`,
    });

    results.push({
      name: "excluded README and manifests do not become document or manifest signals",
      passed:
        !discoverResult.graph.documents.some((document) => document.path === ".pytest_cache/README.md") &&
        !discoverResult.graph.manifests.some((manifest) => manifest.path === "artifacts/dpi-audit/.pydeps/pandas/pyproject.toml") &&
        !discoverResult.graph.manifests.some((manifest) => manifest.path === "node_modules/example/package.json"),
      error: `Expected cache/audit/dependency documents and manifests to be absent, got documents=${JSON.stringify(discoverResult.graph.documents)}, manifests=${JSON.stringify(discoverResult.graph.manifests)}.`,
    });

    results.push({
      name: "include-noise opt-in restores excluded assets for explicit forensic scans",
      passed:
        (includeNoiseResult.graph.excludedSummary?.totalExcludedFileCount ?? 0) === 0 &&
        includedNoisePaths.some((entry) => entry.includes("vendor/example/routes.ts")) &&
        includedNoisePaths.some((entry) => entry.includes("node_modules/example/package.json")) &&
        includedNoisePaths.some((entry) => entry.includes("src/generated/client.gen.ts")) &&
        includedNoisePaths.some((entry) => entry.includes(".gradle/caches/modules-2/files-2.1/example.pom")),
      error: `Expected --include-noise scan to include previously excluded assets, got ${JSON.stringify(includedNoisePaths)}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap discover exclusion policy execution",
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
  fs.writeFileSync(path.join(root, "README.md"), "# Exclusion Repo\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "exclusion-repo", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes.ts"),
    'const app = { post: () => undefined };\napp.post("/orders", () => "created");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, ".pytest_cache"), { recursive: true });
  fs.writeFileSync(path.join(root, ".pytest_cache", "README.md"), "# pytest cache docs\n", "utf-8");

  fs.mkdirSync(path.join(root, "artifacts", "dpi-audit", ".pydeps", "pandas"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "artifacts", "dpi-audit", ".pydeps", "pandas", "pyproject.toml"),
    "[project]\nname = 'pandas'\n",
    "utf-8",
  );
  fs.mkdirSync(path.join(root, "artifacts", "dpi-audit", ".pydeps", "sklearn", "tests"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "artifacts", "dpi-audit", ".pydeps", "sklearn", "tests", "test_vendor.py"),
    "def test_vendor(): pass\n",
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "vendor", "example"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "vendor", "example", "routes.ts"),
    'const app = { get: () => undefined };\napp.get("/vendor-only", () => "ignore");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "node_modules", "example"), { recursive: true });
  fs.writeFileSync(path.join(root, "node_modules", "example", "package.json"), JSON.stringify({ name: "example" }), "utf-8");

  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.writeFileSync(path.join(root, "dist", "app.bundle.js"), "console.log('generated');\n", "utf-8");

  fs.mkdirSync(path.join(root, ".gradle", "caches", "modules-2", "files-2.1"), { recursive: true });
  fs.writeFileSync(path.join(root, ".gradle", "caches", "modules-2", "files-2.1", "example.pom"), "<project />\n", "utf-8");

  fs.mkdirSync(path.join(root, "reports", "security-audit", "mirror"), { recursive: true });
  fs.writeFileSync(path.join(root, "reports", "security-audit", "mirror", "package.json"), JSON.stringify({ name: "audit-mirror" }), "utf-8");

  fs.mkdirSync(path.join(root, "src", "generated"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "generated", "client.gen.ts"), "export const generated = true;\n", "utf-8");

  fs.mkdirSync(path.join(root, "coverage"), { recursive: true });
  fs.writeFileSync(path.join(root, "coverage", "lcov.info"), "TN:\n", "utf-8");
}

function collectEvidencePaths(graph: ReturnType<typeof runBootstrapDiscover>["graph"]): string[] {
  return [
    ...graph.routes.flatMap((route) => [route.path, ...route.sourceFiles]),
    ...graph.tests.map((test) => test.path),
    ...graph.schemas.map((schema) => schema.path),
    ...graph.migrations.map((migration) => migration.path),
    ...graph.documents.map((document) => document.path),
    ...graph.manifests.map((manifest) => manifest.path),
    ...graph.sourceFiles.map((sourceFile) => sourceFile.path),
  ].sort((left, right) => left.localeCompare(right));
}

main();
