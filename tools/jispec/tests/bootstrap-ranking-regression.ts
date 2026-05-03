import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { runBootstrapDiscover } from "../bootstrap/discover";
import type { AdoptionRankedEvidence } from "../bootstrap/evidence-ranking";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== Bootstrap Ranking Regression Test ===\n");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-bootstrap-ranking-regression-"));
  const results: TestResult[] = [];

  try {
    seedRepository(tempRoot);
    const discoverResult = runBootstrapDiscover({ root: tempRoot });
    const bootstrapDir = path.join(tempRoot, ".spec", "facts", "bootstrap");
    const rankedPath = path.join(bootstrapDir, "adoption-ranked-evidence.json");
    const summaryPath = path.join(bootstrapDir, "evidence-summary.txt");
    const bootstrapSummaryPath = path.join(bootstrapDir, "bootstrap-summary.md");

    const ranked = JSON.parse(fs.readFileSync(rankedPath, "utf-8")) as AdoptionRankedEvidence;
    const summaryText = fs.readFileSync(summaryPath, "utf-8");
    const bootstrapSummary = fs.readFileSync(bootstrapSummaryPath, "utf-8");
    const topAdoptionReady = ranked.evidence.filter((entry) => entry.rankTier === "adoption_ready").slice(0, 5);
    const topOwnerReview = ranked.evidence.filter((entry) => entry.rankTier === "owner_review").slice(0, 5);
    const rankedPaths = ranked.evidence.map((entry) => entry.path);

    results.push({
      name: "ranked evidence artifact exposes takeover split and stable tier metadata",
      passed:
        ranked.summary.candidateCount > 0 &&
        ranked.summary.selectedCount > 0 &&
        ranked.summary.adoptionReadyCount > 0 &&
        ranked.summary.ownerReviewCount > 0 &&
        ranked.evidence.every((entry) => entry.rankTier === "adoption_ready" || entry.rankTier === "owner_review"),
      error: `Expected ranked evidence to expose adoption-ready and owner-review tiers, got ${JSON.stringify(ranked.summary)}.`,
    });

    results.push({
      name: "top adoption-ready evidence favors governance docs, protocol schemas, routes, and manifests",
      passed:
        topAdoptionReady.some((entry) => entry.path === "docs/governance/README.md") &&
        topAdoptionReady.some((entry) => entry.path === "docs/protocols/README.md") &&
        topAdoptionReady.some((entry) => entry.path === "api/proto/gateway.proto") &&
        topAdoptionReady.some((entry) => entry.path === "schemas/order.schema.json") &&
        topAdoptionReady.some((entry) => entry.path === "/orders"),
      error: `Expected adoption-ready evidence to prioritize strong boundary assets, got ${JSON.stringify(topAdoptionReady)}.`,
    });

    results.push({
      name: "owner-review evidence remains separated from adoption-ready evidence",
      passed:
        topOwnerReview.some((entry) => entry.path === "README.md") &&
        topOwnerReview.some((entry) => entry.path === "tests/orders.test.ts") &&
        topOwnerReview.some((entry) => entry.path === "src/controllers/orders-controller.ts") &&
        ranked.summary.ownerReviewCount >= 3,
      error: `Expected owner-review evidence to retain human-review candidates, got ${JSON.stringify(topOwnerReview)}.`,
    });

    results.push({
      name: "default discover output suppresses vendor/build/cache noise",
      passed:
        !rankedPaths.some((entry) => entry.includes("vendor/")) &&
        !rankedPaths.some((entry) => entry.includes("dist/")) &&
        !rankedPaths.some((entry) => entry.includes("coverage/")) &&
        !rankedPaths.some((entry) => entry.includes("node_modules/")) &&
        !rankedPaths.some((entry) => entry.includes("artifacts/dpi-audit")) &&
        (discoverResult.graph.excludedSummary?.totalExcludedFileCount ?? 0) > 0,
      error: `Expected noisy paths to be excluded from ranked evidence, got ${JSON.stringify(rankedPaths)}.`,
    });

    results.push({
      name: "human-readable discover summaries surface takeover priority split and compatibility text",
      passed:
        summaryText.includes("Takeover priority:") &&
        summaryText.includes("Top adoption-ready evidence:") &&
        summaryText.includes("Owner-review evidence:") &&
        summaryText.includes("Top adoption-ranked evidence:") &&
        bootstrapSummary.includes("Takeover priority:") &&
        bootstrapSummary.includes("Top adoption-ready evidence:") &&
        bootstrapSummary.includes("Owner-review evidence:") &&
        bootstrapSummary.includes("Top adoption-ranked evidence:") &&
        bootstrapSummary.includes("Machine consumers should use `evidence-graph.json`"),
      error: `Expected discover summaries to include takeover split sections, got:\n${summaryText}\n---\n${bootstrapSummary}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "bootstrap ranking regression execution",
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
  fs.mkdirSync(path.join(root, "jiproject"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "jiproject", "project.yaml"),
    yaml.dump({
      id: "ranking-regression",
      name: "Ranking Regression Repo",
      version: "0.1.0",
      delivery_model: "bootstrap-takeover",
      source_documents: {
        requirements: "README.md",
        technical_solution: "docs/protocols/README.md",
      },
      global_gates: ["contracts_validated"],
    }),
    "utf-8",
  );

  fs.writeFileSync(path.join(root, "README.md"), "# Ranking Regression Repo\n\nGovernance and boundary truth.\n", "utf-8");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "ranking-regression", private: true }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "docs", "governance"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "governance", "README.md"), "# Governance\n\nControl-plane policy and audit trail.\n", "utf-8");

  fs.mkdirSync(path.join(root, "docs", "protocols"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "protocols", "README.md"), "# Protocols\n\nExplicit contract boundary.\n", "utf-8");

  fs.mkdirSync(path.join(root, "api", "proto"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "api", "proto", "gateway.proto"),
    'syntax = "proto3";\nservice Gateway { rpc Open (OpenRequest) returns (OpenResponse); }\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "schemas"), { recursive: true });
  fs.writeFileSync(path.join(root, "schemas", "order.schema.json"), JSON.stringify({ title: "Order" }, null, 2), "utf-8");

  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "src", "routes"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "routes", "orders.ts"),
    'const app = { post: () => undefined };\napp.post("/orders", () => "created");\n',
    "utf-8",
  );

  fs.mkdirSync(path.join(root, "src", "controllers"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "controllers", "orders-controller.ts"), "export class OrdersController {}\n", "utf-8");

  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(path.join(root, "tests", "orders.test.ts"), "describe('orders', () => {});\n", "utf-8");

  fs.mkdirSync(path.join(root, "vendor", "mirrored"), { recursive: true });
  fs.writeFileSync(path.join(root, "vendor", "mirrored", "README.md"), "# vendored docs\n", "utf-8");

  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.writeFileSync(path.join(root, "dist", "bundle.js"), "console.log('generated');\n", "utf-8");

  fs.mkdirSync(path.join(root, "coverage"), { recursive: true });
  fs.writeFileSync(path.join(root, "coverage", "lcov.info"), "TN:\n", "utf-8");

  fs.mkdirSync(path.join(root, "node_modules", "example"), { recursive: true });
  fs.writeFileSync(path.join(root, "node_modules", "example", "package.json"), JSON.stringify({ name: "example" }, null, 2), "utf-8");
}

main();
