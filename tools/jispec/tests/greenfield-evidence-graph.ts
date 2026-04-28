import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import {
  absorbGreenfieldImplementationFacts,
  findGreenfieldEvidenceImpact,
  type GreenfieldEvidenceGraph,
} from "../greenfield/evidence-graph";
import { runGreenfieldInit } from "../greenfield/init";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface BaselineYaml {
  assets?: string[];
}

async function main(): Promise<void> {
  console.log("=== Greenfield Evidence Graph Tests ===\n");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-evidence-"));
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-evidence-src-"));
  const results: TestResult[] = [];

  try {
    const requirementsPath = path.join(sourceRoot, "requirements.md");
    const technicalSolutionPath = path.join(sourceRoot, "technical-solution.md");
    fs.writeFileSync(requirementsPath, buildCommerceRequirements(), "utf-8");
    fs.writeFileSync(technicalSolutionPath, buildCommerceTechnicalSolution(), "utf-8");

    const initResult = runGreenfieldInit({
      root,
      requirements: requirementsPath,
      technicalSolution: technicalSolutionPath,
    });
    const graphPath = path.join(root, ".spec", "evidence", "evidence-graph.json");
    const summaryPath = path.join(root, ".spec", "evidence", "evidence-graph-summary.md");
    const graph = JSON.parse(fs.readFileSync(graphPath, "utf-8")) as GreenfieldEvidenceGraph;
    const baseline = yaml.load(
      fs.readFileSync(path.join(root, ".spec", "baselines", "current.yaml"), "utf-8"),
    ) as BaselineYaml;
    const summary = fs.readFileSync(summaryPath, "utf-8");

    results.push(record("initializer writes Greenfield evidence graph assets", () => {
      assert.equal(initResult.status, "input_contract_ready");
      assert.equal(initResult.nextTask, "greenfield-initialization-mvp-complete");
      assert.ok(fs.existsSync(graphPath));
      assert.ok(fs.existsSync(summaryPath));
      assert.ok(initResult.writtenFiles.some((filePath) => filePath.endsWith(".spec/evidence/evidence-graph.json")));
      assert.ok(baseline.assets?.includes(".spec/evidence/evidence-graph.json"));
    }));

    results.push(record("graph contains core requirement, scenario, contract, slice, and test nodes", () => {
      assertNode(graph, "requirement:REQ-ORD-001", "requirement");
      assertNode(graph, "scenario:SCN-ORDER-CHECKOUT-VALID", "scenario");
      assertNode(graph, "contract:CTR-ORDERING-001", "contract");
      assertNode(graph, "slice:ordering-checkout-v1", "slice");
      assertNode(graph, "test:TEST-ORDER-CHECKOUT-VALID-INTEGRATION", "test");
    }));

    results.push(record("graph connects requirement to scenario, contract, slice, and test evidence", () => {
      assertEdge(graph, "requirement:REQ-ORD-001", "scenario:SCN-ORDER-CHECKOUT-VALID", "verified_by");
      assertEdge(graph, "requirement:REQ-ORD-001", "contract:CTR-ORDERING-001", "maps_to");
      assertEdge(graph, "scenario:SCN-ORDER-CHECKOUT-VALID", "slice:ordering-checkout-v1", "implemented_by");
      assertEdge(graph, "scenario:SCN-ORDER-CHECKOUT-VALID", "test:TEST-ORDER-CHECKOUT-VALID-INTEGRATION", "covered_by");
      assertEdge(graph, "slice:ordering-checkout-v1", "test:TEST-ORDER-CHECKOUT-VALID-INTEGRATION", "verified_by");
    }));

    results.push(record("graph records cross-slice dependency and coverage summary", () => {
      assertEdge(graph, "slice:ordering-checkout-v1", "slice:catalog-product-availability-v1", "depends_on");
      assert.equal(graph.summary.requirementCoverage.total, 5);
      assert.equal(graph.summary.requirementCoverage.withScenario, 5);
      assert.equal(graph.summary.requirementCoverage.withSlice, 5);
      assert.equal(graph.summary.requirementCoverage.withTest, 5);
      assert.deepEqual(graph.summary.requirementCoverage.uncovered, []);
      assert.match(summary, /Requirements with tests: 5/);
    }));

    results.push(record("graph can report impacted assets from a requirement seed", () => {
      const impact = findGreenfieldEvidenceImpact(graph, ["REQ-ORD-001"]);

      assert.ok(impact.affectedNodes.some((node) => node.id === "scenario:SCN-ORDER-CHECKOUT-VALID"));
      assert.ok(impact.affectedNodes.some((node) => node.id === "contract:CTR-ORDERING-001"));
      assert.ok(impact.affectedNodes.some((node) => node.id === "slice:ordering-checkout-v1"));
      assert.ok(impact.affectedNodes.some((node) => node.id === "test:TEST-ORDER-CHECKOUT-VALID-INTEGRATION"));
      assert.ok(impact.affectedAssetPaths.includes("contexts/ordering/behavior/scenarios/SCN-ORDER-CHECKOUT-VALID.feature"));
      assert.deepEqual(impact.warnings, []);
    }));

    results.push(record("graph can absorb later implementation facts without changing the initialization model", () => {
      const evolved = absorbGreenfieldImplementationFacts(graph, [
        {
          id: "route-post-checkout",
          kind: "route",
          label: "POST /checkout",
          path: "src/routes/checkout.ts",
          contextId: "ordering",
          requirementIds: ["REQ-ORD-001"],
          contractIds: ["CTR-ORDERING-001"],
          scenarioIds: ["SCN-ORDER-CHECKOUT-VALID"],
          testIds: ["TEST-ORDER-CHECKOUT-VALID-INTEGRATION"],
          sliceIds: ["ordering-checkout-v1"],
        },
      ]);

      assertNode(evolved, "implementation:route-post-checkout", "implementation_fact");
      assertEdge(evolved, "contract:CTR-ORDERING-001", "implementation:route-post-checkout", "absorbs");
      assertEdge(evolved, "scenario:SCN-ORDER-CHECKOUT-VALID", "implementation:route-post-checkout", "absorbs");
      assert.equal(evolved.summary.nodeCounts.implementation_fact, 1);
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "greenfield evidence graph execution",
      passed: false,
      error: message,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(sourceRoot, { recursive: true, force: true });
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

function assertNode(graph: GreenfieldEvidenceGraph, id: string, type: string): void {
  assert.ok(
    graph.nodes.some((node) => node.id === id && node.type === type),
    `Expected node ${id} with type ${type}`,
  );
}

function assertEdge(graph: GreenfieldEvidenceGraph, from: string, to: string, relation: string): void {
  assert.ok(
    graph.edges.some((edge) => edge.from === from && edge.to === to && edge.relation === relation),
    `Expected edge ${from} -[${relation}]-> ${to}`,
  );
}

function record(name: string, run: () => void): TestResult {
  try {
    run();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildCommerceRequirements(): string {
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
    "### REQ-ORD-003",
    "",
    "An order must not be created unless the cart total is calculable and stock validation passes.",
    "",
    "### REQ-ORD-004",
    "",
    "The system must emit a domain event when an order is created successfully.",
    "",
    "## Non-Functional Requirements",
    "",
    "- Validation logic must be testable in isolation.",
    "",
    "## Out Of Scope",
    "",
    "- Refunds.",
    "",
    "## Acceptance Signals",
    "",
    "- Valid checkout creates an order.",
  ].join("\n");
}

function buildCommerceTechnicalSolution(): string {
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
    "## Data Ownership",
    "",
    "Each bounded context owns persistence.",
    "",
    "## Testing Strategy",
    "",
    "Use unit, integration, and contract tests.",
    "",
    "## Operational Constraints",
    "",
    "No direct table sharing between bounded contexts.",
    "",
    "## Risks And Open Decisions",
    "",
    "Payment is deferred.",
  ].join("\n");
}

void main();
