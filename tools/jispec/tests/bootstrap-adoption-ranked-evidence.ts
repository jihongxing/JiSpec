import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { runBootstrapDiscover } from "../bootstrap/discover";
import type { AdoptionRankedEvidence, BootstrapFullInventory } from "../bootstrap/evidence-ranking";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== Bootstrap Adoption Ranked Evidence Test ===\n");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-bootstrap-ranked-"));
  const results: TestResult[] = [];

  try {
    seedRepository(tempRoot);
    const discoverResult = runBootstrapDiscover({ root: tempRoot });
    const bootstrapDir = path.join(tempRoot, ".spec", "facts", "bootstrap");
    const fullInventoryPath = path.join(bootstrapDir, "full-inventory.json");
    const rankedEvidencePath = path.join(bootstrapDir, "adoption-ranked-evidence.json");
    const summaryPath = path.join(bootstrapDir, "evidence-summary.txt");

    const fullInventory = JSON.parse(fs.readFileSync(fullInventoryPath, "utf-8")) as BootstrapFullInventory;
    const rankedEvidence = JSON.parse(fs.readFileSync(rankedEvidencePath, "utf-8")) as AdoptionRankedEvidence;
    const summaryText = fs.readFileSync(summaryPath, "utf-8");
    const rankedPaths = rankedEvidence.evidence.map((entry) => entry.path);
    const rankedSourceFiles = rankedEvidence.evidence.flatMap((entry) => entry.sourceFiles);

    results.push({
      name: "discover writes full inventory and adoption-ranked evidence artifacts",
      passed:
        fs.existsSync(fullInventoryPath) &&
        fs.existsSync(rankedEvidencePath) &&
        discoverResult.writtenFiles.some((filePath) => filePath.endsWith(".spec/facts/bootstrap/full-inventory.json")) &&
        discoverResult.writtenFiles.some((filePath) => filePath.endsWith(".spec/facts/bootstrap/adoption-ranked-evidence.json")),
      error: `Expected discover written files to include new artifacts, got ${JSON.stringify(discoverResult.writtenFiles)}.`,
    });

    results.push({
      name: "full inventory preserves non-excluded source files and exclusion summary",
      passed:
        fullInventory.version === 1 &&
        fullInventory.files.some((file) => file.path === "src/controllers/orders-controller.ts") &&
        !fullInventory.files.some((file) => file.path.includes("artifacts/dpi-audit")) &&
        fullInventory.excludedSummary.totalExcludedFileCount > 0,
      error: `Expected full inventory to include only non-excluded files and summary, got ${JSON.stringify(fullInventory)}.`,
    });

    results.push({
      name: "adoption-ranked evidence favors docs, protocol schemas, and controllers over weak noise",
      passed:
        rankedEvidence.version === 1 &&
        rankedEvidence.summary.selectedCount > 0 &&
        rankedPaths.slice(0, 2).includes("docs/protocols/README.md") &&
        rankedPaths.slice(0, 2).includes("api/proto/gateway.proto") &&
        rankedPaths.includes("api/proto/gateway.proto") &&
        rankedSourceFiles.includes("src/controllers/orders-controller.ts") &&
        !rankedPaths.some((entry) => entry.includes("artifacts/dpi-audit")) &&
        !rankedPaths.some((entry) => entry.includes("vendor/")),
      error: `Expected ranked evidence to prioritize product assets, got ${JSON.stringify(rankedEvidence.evidence)}`,
    });

    results.push({
      name: "evidence summary includes top adoption-ranked evidence",
      passed:
        summaryText.includes("Top adoption-ranked evidence:") &&
        summaryText.includes("docs/protocols/README.md") &&
        summaryText.includes("api/proto/gateway.proto"),
      error: `Expected summary to include ranked evidence, got:\n${summaryText}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap adoption ranked evidence execution",
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
  writeProject(root, ["network-gateway"]);
  fs.writeFileSync(path.join(root, "README.md"), "# Ranked Evidence Repo\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "ranked-evidence-repo", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "docs", "protocols"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "protocols", "README.md"), "# Protocols\n\nGateway contract truth source.\n", "utf-8");

  fs.mkdirSync(path.join(root, "api", "proto"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "api", "proto", "gateway.proto"),
    'syntax = "proto3";\nservice GatewayService { rpc Open (OpenRequest) returns (OpenResponse); }\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "src", "controllers"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "controllers", "orders-controller.ts"),
    'const app = { post: () => undefined };\napp.post("/orders", () => "created");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(path.join(root, "tests", "orders.test.ts"), "describe('orders', () => {});\n", "utf-8");

  fs.mkdirSync(path.join(root, "artifacts", "dpi-audit", ".pydeps", "pandas"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "artifacts", "dpi-audit", ".pydeps", "pandas", "pyproject.toml"),
    "[project]\nname = 'pandas'\n",
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "vendor", "mirrored"), { recursive: true });
  fs.writeFileSync(path.join(root, "vendor", "mirrored", "README.md"), "# Vendored docs\n", "utf-8");
}

function writeProject(root: string, packs: string[]): void {
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "jiproject", "project.yaml"),
    yaml.dump({
      id: "ranked-evidence-repo",
      name: "Ranked Evidence Repo",
      version: "0.1.0",
      delivery_model: "bootstrap-takeover",
      domain_taxonomy: { packs },
      source_documents: {
        requirements: "README.md",
        technical_solution: "README.md",
      },
      global_gates: ["contracts_validated"],
    }),
    "utf-8",
  );
}

main();
