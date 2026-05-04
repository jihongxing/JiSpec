import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBootstrapDiscover } from "../bootstrap/discover";
import type { AdoptionRankedEvidence } from "../bootstrap/evidence-ranking";
import type { ContractSourceAdapterReport } from "../bootstrap/contract-source-adapters";
import { runGreenfieldInit } from "../greenfield/init";
import { inferEvidenceProvenance, normalizeEvidenceProvenanceLabel } from "../provenance/evidence-provenance";
import { TEST_SUITES, buildRegressionMatrixManifest } from "./regression-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== P9 Evidence Provenance Label Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("taxonomy normalizes known labels and downgrades unknown values", () => {
    assert.equal(normalizeEvidenceProvenanceLabel("EXTRACTED"), "EXTRACTED");
    assert.equal(normalizeEvidenceProvenanceLabel("INFERRED"), "INFERRED");
    assert.equal(normalizeEvidenceProvenanceLabel("AMBIGUOUS"), "AMBIGUOUS");
    assert.equal(normalizeEvidenceProvenanceLabel("OWNER_REVIEW"), "OWNER_REVIEW");
    assert.equal(normalizeEvidenceProvenanceLabel("missing"), "UNKNOWN");
    assert.equal(normalizeEvidenceProvenanceLabel(undefined), "UNKNOWN");
  }));

  results.push(record("helper maps confidence and adoption posture to deterministic labels", () => {
    assert.equal(inferEvidenceProvenance({ confidence: 0.96, evidenceKind: "schema", sourcePath: "api/openapi.yaml" }).label, "EXTRACTED");
    assert.equal(inferEvidenceProvenance({ confidence: 0.72, evidenceKind: "source", sourcePath: "src/routes/orders.ts" }).label, "INFERRED");
    assert.equal(inferEvidenceProvenance({ confidence: 0.34, evidenceKind: "route", sourcePath: "src/routes/weak.ts" }).label, "AMBIGUOUS");
    assert.equal(inferEvidenceProvenance({ confidence: 0.88, evidenceKind: "test", sourcePath: "tests/orders.feature", ownerReviewRequired: true }).label, "OWNER_REVIEW");
    assert.equal(inferEvidenceProvenance({ evidenceKind: "unknown", sourcePath: "" }).label, "UNKNOWN");
  }));

  results.push(record("bootstrap ranked evidence carries provenance descriptor fields", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-provenance-bootstrap-"));
    try {
      writeBootstrapFixture(root);
      runBootstrapDiscover({ root });
      const rankedPath = path.join(root, ".spec", "facts", "bootstrap", "adoption-ranked-evidence.json");
      const graphPath = path.join(root, ".spec", "facts", "bootstrap", "evidence-graph.json");
      const ranked = JSON.parse(fs.readFileSync(rankedPath, "utf-8")) as AdoptionRankedEvidence;
      const graph = JSON.parse(fs.readFileSync(graphPath, "utf-8")) as { sourceFiles?: Array<Record<string, unknown>> };
      const openapi = ranked.evidence.find((entry) => entry.path === "api/openapi.yaml");
      const weakRoute = ranked.evidence.find((entry) => entry.path === "src/routes/weak-route.ts");
      const sourceFile = graph.sourceFiles?.find((entry) => entry.path === "src/routes/weak-route.ts");

      assert.equal(openapi?.provenanceLabel, "EXTRACTED");
      assert.equal(openapi?.evidenceKind, "schema");
      assert.equal(openapi?.sourcePath, "api/openapi.yaml");
      assert.equal(openapi?.ownerReviewPosture, "not_required");
      assert.equal(weakRoute?.provenanceLabel, "AMBIGUOUS");
      assert.equal(weakRoute?.ownerReviewPosture, "required");
      assert.equal(sourceFile?.provenanceLabel, "INFERRED");
      assert.equal(sourceFile?.ownerReviewPosture, "recommended");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("contract source adapters expose owner-review provenance without promoting weak evidence", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-provenance-adapters-"));
    try {
      writeBootstrapFixture(root);
      runBootstrapDiscover({ root });
      const adapterPath = path.join(root, ".spec", "facts", "bootstrap", "contract-source-adapters.json");
      const report = JSON.parse(fs.readFileSync(adapterPath, "utf-8")) as ContractSourceAdapterReport;
      const graphql = report.evidence.find((entry) => entry.path === "api/graphql/schema.graphql");

      assert.equal(graphql?.provenanceLabel, "EXTRACTED");
      assert.equal(graphql?.evidenceKind, "graphql");
      assert.equal(graphql?.sourcePath, "api/graphql/schema.graphql");
      assert.equal(graphql?.ownerReviewPosture, "not_required");
      assert.equal(graphql?.llm_blocking_gate, false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("Greenfield evidence graph nodes carry provenance labels", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-provenance-greenfield-"));
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-provenance-source-"));
    try {
      const requirementsPath = path.join(sourceRoot, "requirements.md");
      const solutionPath = path.join(sourceRoot, "technical-solution.md");
      fs.writeFileSync(requirementsPath, buildRequirements(), "utf-8");
      fs.writeFileSync(solutionPath, buildTechnicalSolution(), "utf-8");
      runGreenfieldInit({ root, requirements: requirementsPath, technicalSolution: solutionPath });
      const graphPath = path.join(root, ".spec", "evidence", "evidence-graph.json");
      const graph = JSON.parse(fs.readFileSync(graphPath, "utf-8")) as { nodes: Array<Record<string, unknown>> };
      const requirement = graph.nodes.find((node) => node.id === "requirement:REQ-ORD-001");
      const context = graph.nodes.find((node) => node.id === "context:ordering");

      assert.equal(requirement?.provenanceLabel, "EXTRACTED");
      assert.equal(requirement?.evidenceKind, "requirement");
      assert.equal(requirement?.sourcePath, "docs/input/requirements.md");
      assert.equal(context?.provenanceLabel, "INFERRED");
      assert.equal(context?.ownerReviewPosture, "required");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(sourceRoot, { recursive: true, force: true });
    }
  }));

  results.push(record("regression matrix registers P9 provenance suite in bootstrap hardening", () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "p9-evidence-provenance-labels.ts");
    assert.ok(suite);
    assert.equal(suite.area, "bootstrap-takeover-hardening");
    assert.equal(suite.expectedTests, 6);
    assert.equal(suite.task, "P9-T2");

    const manifest = buildRegressionMatrixManifest();
    assert.equal(manifest.totalSuites, 143);
    assert.equal(manifest.totalExpectedTests, 648);
  }));

  printResults(results);
}

function writeBootstrapFixture(root: string): void {
  writeFile(root, "api/openapi.yaml", "openapi: 3.0.0\npaths:\n  /orders:\n    post:\n      responses:\n        '202':\n          description: accepted\n");
  writeFile(root, "api/graphql/schema.graphql", "type Query { order(id: ID!): Order }\ntype Order { id: ID! }\n");
  writeFile(root, "src/routes/weak-route.ts", "export const routeName = 'orders';\n");
}

function buildRequirements(): string {
  return [
    "# Commerce Platform Requirements",
    "",
    "## Objective",
    "",
    "Build a commerce platform that supports product browsing, cart validation, checkout, and order creation.",
    "",
    "## Users / Actors",
    "",
    "- Shopper",
    "",
    "## Core Journeys",
    "",
    "- Shopper checks out a valid cart.",
    "",
    "## Functional Requirements",
    "",
    "### REQ-CAT-001",
    "",
    "The system must expose products that are available for sale.",
    "",
    "### REQ-ORD-001",
    "",
    "A user must be able to submit an order from a valid cart.",
    "",
    "### REQ-ORD-002",
    "",
    "Checkout must reject carts with unavailable items.",
    "",
    "## Acceptance Signals",
    "",
    "- Valid checkout creates an order.",
  ].join("\n");
}

function buildTechnicalSolution(): string {
  return [
    "# Commerce Platform Technical Solution",
    "",
    "## Architecture Direction",
    "",
    "Use bounded contexts for `catalog` and `ordering`.",
    "",
    "- `catalog` owns product availability and price read models",
    "- `ordering` owns cart validation, checkout orchestration, and order persistence",
    "",
    "## Integration Boundaries",
    "",
    "`ordering` may consume published product availability information from `catalog`, but it may not write to catalog-owned models.",
    "",
    "## Testing Strategy",
    "",
    "Use unit, integration, and contract tests.",
  ].join("\n");
}

function writeFile(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function printResults(results: TestResult[]): void {
  let passed = 0;
  let failed = 0;
  for (const result of results) {
    if (result.passed) {
      console.log(`✓ ${result.name}`);
      passed++;
    } else {
      console.log(`✗ ${result.name}`);
      console.log(`  Error: ${result.error ?? "unknown error"}`);
      failed++;
    }
  }
  console.log(`\n${passed}/${results.length} tests passed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
