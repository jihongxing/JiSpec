import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { runChangeCommand } from "../change/change-command";
import { analyzeGreenfieldBlastRadius } from "../change/blast-radius";
import { runGreenfieldInit } from "../greenfield/init";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface ImpactGraphJson {
  seeds?: string[];
  affected_nodes?: Array<{ id?: string; type?: string; path?: string }>;
  affected_asset_paths?: string[];
  references?: {
    requirement_ids?: string[];
    contracts?: string[];
    scenarios?: string[];
    slices?: string[];
    tests?: string[];
  };
  verification_focus?: {
    contracts?: string[];
    scenarios?: string[];
    slices?: string[];
    tests?: string[];
    asset_paths?: string[];
  };
}

interface VerifyFocusYaml {
  verification_focus?: {
    contracts?: string[];
    scenarios?: string[];
    slices?: string[];
    tests?: string[];
    asset_paths?: string[];
  };
}

interface DeltaYaml {
  verification_focus?: {
    contracts?: string[];
    scenarios?: string[];
    slices?: string[];
    tests?: string[];
    asset_paths?: string[];
  };
}

async function main(): Promise<void> {
  console.log("=== Greenfield Blast Radius Tracking Tests ===\n");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-blast-"));
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-blast-src-"));
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

    results.push(record("initializer advances to the spec debt ledger after blast radius is available", () => {
      assert.equal(init.status, "input_contract_ready");
      assert.equal(init.nextTask, "greenfield-initialization-mvp-complete");
    }));

    const directImpact = analyzeGreenfieldBlastRadius(root, {
      summary: "Fix REQ-ORD-002 unavailable item rejection",
    });

    results.push(record("blast radius analysis finds affected assets from a requirement seed", () => {
      assert.equal(directImpact.available, true);
      assert.ok(directImpact.seedIds.includes("requirement:REQ-ORD-002"));
      assert.ok(directImpact.references.contracts.includes("CTR-ORDERING-002"));
      assert.ok(directImpact.references.scenarios.includes("SCN-ORDER-CHECKOUT-OUT-OF-STOCK"));
      assert.ok(directImpact.references.slices.includes("ordering-checkout-v1"));
      assert.ok(directImpact.references.tests.includes("TEST-ORDER-CHECKOUT-OUT-OF-STOCK-INTEGRATION"));
      assert.ok(directImpact.affectedAssetPaths.includes("contexts/ordering/design/contracts.yaml"));
    }));

    const change = await runChangeCommand({
      root,
      summary: "Fix REQ-ORD-002 unavailable item rejection",
      mode: "prompt",
      changeType: "fix",
    });
    const specDelta = change.session.specDelta;
    assert.ok(specDelta);
    const impactGraph = JSON.parse(fs.readFileSync(specDelta.impactGraphPath, "utf-8")) as ImpactGraphJson;
    const verifyFocus = yaml.load(fs.readFileSync(specDelta.verifyFocusPath, "utf-8")) as VerifyFocusYaml;
    const delta = yaml.load(fs.readFileSync(specDelta.deltaPath, "utf-8")) as DeltaYaml;
    const impactReport = fs.readFileSync(specDelta.impactReportPath, "utf-8");

    results.push(record("change writes machine-readable impact graph and verify focus files", () => {
      assert.ok(fs.existsSync(specDelta.impactGraphPath));
      assert.ok(fs.existsSync(specDelta.verifyFocusPath));
      assert.ok(impactGraph.seeds?.includes("requirement:REQ-ORD-002"));
      assert.ok(impactGraph.affected_nodes?.some((node) => node.id === "contract:CTR-ORDERING-002"));
      assert.ok(impactGraph.affected_asset_paths?.includes("contexts/ordering/behavior/scenarios/SCN-ORDER-CHECKOUT-OUT-OF-STOCK.feature"));
      assert.ok(verifyFocus.verification_focus?.asset_paths?.includes("contexts/ordering/design/contracts.yaml"));
    }));

    results.push(record("delta references and verify focus pull affected old contracts into scope", () => {
      assert.ok(specDelta.references.contracts.includes("CTR-ORDERING-002"));
      assert.ok(specDelta.references.scenarios.includes("SCN-ORDER-CHECKOUT-OUT-OF-STOCK"));
      assert.ok(specDelta.references.slices.includes("ordering-checkout-v1"));
      assert.ok(specDelta.references.tests.includes("TEST-ORDER-CHECKOUT-OUT-OF-STOCK-INTEGRATION"));
      assert.ok(delta.verification_focus?.contracts?.includes("CTR-ORDERING-002"));
      assert.ok(delta.verification_focus?.scenarios?.includes("SCN-ORDER-CHECKOUT-OUT-OF-STOCK"));
      assert.ok(delta.verification_focus?.tests?.includes("TEST-ORDER-CHECKOUT-OUT-OF-STOCK-INTEGRATION"));
    }));

    results.push(record("human impact report and command output expose the blast radius", () => {
      assert.match(impactReport, /## Blast Radius/);
      assert.match(impactReport, /verify-focus\.yaml/);
      assert.match(impactReport, /CTR-ORDERING-002/);
      const impactSummary = change.session.impactSummary;
      assert.ok(impactSummary && !Array.isArray(impactSummary));
      assert.match(impactSummary.artifacts.impactGraphPath, /impact-graph\.json$/);
      assert.match(impactSummary.artifacts.verifyFocusPath, /verify-focus\.yaml$/);
      assert.ok(change.session.nextCommands.some((hint) => hint.command.includes("verify-focus.yaml")));
    }));
  } catch (error) {
    results.push({
      name: "greenfield blast radius tracking execution",
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
