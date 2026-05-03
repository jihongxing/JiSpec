import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { runChangeCommand } from "../change/change-command";
import { runGreenfieldInit } from "../greenfield/init";
import { runVerify } from "../verify/verify-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface ContractGraphJson {
  graph_kind?: string;
  nodes?: Array<{ id?: string; kind?: string; path?: string; context_id?: string }>;
  edges?: Array<{ from?: string; to?: string; relation?: string }>;
}

interface DirtyGraphJson {
  change_id?: string;
  seeds?: string[];
  dirty_nodes?: Array<{ id?: string; kind?: string; path?: string }>;
  dirty_edges?: Array<{ from?: string; to?: string; relation?: string }>;
  dirty_asset_paths?: string[];
  required_updates?: Array<{ node_id?: string; kind?: string; path?: string; status?: string }>;
}

interface VerifyFocusYaml {
  dirty_propagation?: {
    change_id?: string;
    seeds?: string[];
    dirty_nodes?: string[];
    dirty_asset_paths?: string[];
    required_updates?: unknown[];
  };
}

interface AdoptionRecordYaml {
  status?: string;
}

async function main(): Promise<void> {
  console.log("=== Greenfield Deterministic Contract Graph Tests ===\n");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-contract-graph-"));
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-contract-graph-src-"));
  const results: TestResult[] = [];

  try {
    const requirementsPath = path.join(sourceRoot, "requirements.md");
    const technicalSolutionPath = path.join(sourceRoot, "technical-solution.md");
    fs.writeFileSync(requirementsPath, buildCommerceRequirements(), "utf-8");
    fs.writeFileSync(technicalSolutionPath, buildCommerceTechnicalSolution(), "utf-8");

    const init = runGreenfieldInit({
      root,
      requirements: requirementsPath,
      technicalSolution: technicalSolutionPath,
    });
    const graphPath = path.join(root, ".spec", "evidence", "contract-graph.json");
    const graph = JSON.parse(fs.readFileSync(graphPath, "utf-8")) as ContractGraphJson;

    results.push(record("initializer writes a deterministic contract graph", () => {
      assert.equal(init.status, "input_contract_ready");
      assert.ok(fs.existsSync(graphPath));
      assert.equal(graph.graph_kind, "deterministic-contract-graph");
      assert.ok(hasNode(graph, "@req:REQ-ORD-002", "requirement"));
      assert.ok(hasNode(graph, "@context:ordering", "bounded_context"));
      assert.ok(hasNode(graph, "@api:CTR-ORDERING-002", "api_contract"));
      assert.ok(hasNode(graph, "@bdd:SCN-ORDER-CHECKOUT-OUT-OF-STOCK", "bdd_scenario"));
      assert.ok(hasNode(graph, "@slice:ordering-checkout-v1", "slice"));
      assert.ok(hasNode(graph, "@test:TEST-ORDER-CHECKOUT-OUT-OF-STOCK-INTEGRATION", "test"));
    }));

    results.push(record("contract graph links requirements, contexts, contracts, scenarios, slices, and tests", () => {
      assert.ok(hasEdge(graph, "@req:REQ-ORD-002", "@api:CTR-ORDERING-002", "derived_from"));
      assert.ok(hasEdge(graph, "@req:REQ-ORD-002", "@bdd:SCN-ORDER-CHECKOUT-OUT-OF-STOCK", "derived_from"));
      assert.ok(hasEdge(graph, "@context:ordering", "@api:CTR-ORDERING-002", "owns"));
      assert.ok(hasEdge(graph, "@api:CTR-ORDERING-002", "@bdd:SCN-ORDER-CHECKOUT-OUT-OF-STOCK", "verifies"));
      assert.ok(hasEdge(graph, "@bdd:SCN-ORDER-CHECKOUT-OUT-OF-STOCK", "@test:TEST-ORDER-CHECKOUT-OUT-OF-STOCK-INTEGRATION", "covered_by"));
      assert.ok(hasEdge(graph, "@api:CTR-ORDERING-002", "@slice:ordering-checkout-v1", "implements"));
    }));

    const change = await runChangeCommand({
      root,
      summary: "Fix REQ-ORD-002 unavailable item rejection",
      mode: "prompt",
      changeType: "fix",
    });
    const specDelta = change.session.specDelta;
    assert.ok(specDelta);

    const dirtyGraph = JSON.parse(fs.readFileSync(specDelta.dirtyGraphPath, "utf-8")) as DirtyGraphJson;
    const dirtyReport = fs.readFileSync(specDelta.dirtyReportPath, "utf-8");
    const impactReport = fs.readFileSync(specDelta.impactReportPath, "utf-8");
    const verifyFocus = yaml.load(fs.readFileSync(specDelta.verifyFocusPath, "utf-8")) as VerifyFocusYaml;

    results.push(record("change writes dirty graph, dirty report, and verify focus from requirement seed", () => {
      assert.equal(dirtyGraph.change_id, specDelta.changeId);
      assert.ok(fs.existsSync(specDelta.dirtyGraphPath));
      assert.ok(fs.existsSync(specDelta.dirtyReportPath));
      assert.ok(dirtyGraph.seeds?.includes("@req:REQ-ORD-002"));
      assert.ok(dirtyGraph.dirty_nodes?.some((node) => node.id === "@api:CTR-ORDERING-002"));
      assert.ok(dirtyGraph.dirty_nodes?.some((node) => node.id === "@bdd:SCN-ORDER-CHECKOUT-OUT-OF-STOCK"));
      assert.ok(dirtyGraph.dirty_nodes?.some((node) => node.id === "@slice:ordering-checkout-v1"));
      assert.ok(dirtyGraph.dirty_asset_paths?.includes("contexts/ordering/behavior/scenarios/SCN-ORDER-CHECKOUT-OUT-OF-STOCK.feature"));
      assert.ok(dirtyGraph.required_updates?.some((update) => update.node_id === "@api:CTR-ORDERING-002" && update.status === "pending"));
      assert.match(dirtyReport, /# Dirty Propagation Report:/);
      assert.match(impactReport, /## Dirty Propagation/);
      assert.ok(verifyFocus.dirty_propagation?.dirty_nodes?.includes("@api:CTR-ORDERING-002"));
      const impactSummary = change.session.impactSummary;
      assert.ok(impactSummary && !Array.isArray(impactSummary));
      assert.ok(impactSummary.missingVerificationHints.length >= 0);
      assert.ok(impactSummary.impactedFiles.includes("contexts/ordering/behavior/scenarios/SCN-ORDER-CHECKOUT-OUT-OF-STOCK.feature"));
    }));

    const verifyWithDirtyDelta = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });
    results.push(record("verify blocks unresolved dirty required updates", () => {
      assert.equal(verifyWithDirtyDelta.verdict, "FAIL_BLOCKING");
      assert.ok(verifyWithDirtyDelta.issues.some((issue) =>
        issue.code === "GREENFIELD_DIRTY_CHAIN_UNRECONCILED" &&
        issue.path === "contexts/ordering/design/contracts.yaml",
      ));
      assert.ok(verifyWithDirtyDelta.issues.some((issue) =>
        issue.code === "POLICY_GREENFIELD_NO_BLOCKING_VERIFY_ISSUES" ||
        issue.code === "GREENFIELD_DIRTY_CHAIN_UNRECONCILED",
      ));
    }));

    const adoptionRecordPath = path.join(specDelta.deltaDir, "adoption-record.yaml");
    const adoption = yaml.load(fs.readFileSync(adoptionRecordPath, "utf-8")) as AdoptionRecordYaml;
    adoption.status = "adopted";
    fs.writeFileSync(adoptionRecordPath, yaml.dump(adoption, { lineWidth: 100, noRefs: true, sortKeys: false }), "utf-8");
    const verifyAfterAdoption = await runVerify({ root, generatedAt: "2026-04-29T00:00:00.000Z" });

    results.push(record("adopted delta no longer leaves the dirty chain open", () => {
      assert.equal(verifyAfterAdoption.verdict, "PASS");
      assert.ok(!verifyAfterAdoption.issues.some((issue) => issue.code === "GREENFIELD_DIRTY_CHAIN_UNRECONCILED"));
    }));
  } catch (error) {
    results.push({
      name: "greenfield deterministic contract graph execution",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
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

function hasNode(graph: ContractGraphJson, id: string, kind: string): boolean {
  return graph.nodes?.some((node) => node.id === id && node.kind === kind) === true;
}

function hasEdge(graph: ContractGraphJson, from: string, to: string, relation: string): boolean {
  return graph.edges?.some((edge) => edge.from === from && edge.to === to && edge.relation === relation) === true;
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
