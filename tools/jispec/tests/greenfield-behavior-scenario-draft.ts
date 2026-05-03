import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { runGreenfieldInit } from "../greenfield/init";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Greenfield Behavior Scenario Draft Tests ===\n");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-behavior-"));
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-behavior-src-"));
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

    const orderingJourneyPath = path.join(root, "contexts", "ordering", "behavior", "journeys.md");
    const catalogJourneyPath = path.join(root, "contexts", "catalog", "behavior", "journeys.md");
    const validCheckoutPath = path.join(root, "contexts", "ordering", "behavior", "scenarios", "SCN-ORDER-CHECKOUT-VALID.feature");
    const outOfStockPath = path.join(root, "contexts", "ordering", "behavior", "scenarios", "SCN-ORDER-CHECKOUT-OUT-OF-STOCK.feature");
    const technicalBoundaryPath = path.join(root, "contexts", "ordering", "behavior", "scenarios", "SCN-ORDER-TECHNICAL-BOUNDARY.feature");
    const catalogTechnicalBoundaryPath = path.join(root, "contexts", "catalog", "behavior", "scenarios", "SCN-CATALOG-TECHNICAL-OWNERSHIP.feature");
    const catalogAvailablePath = path.join(root, "contexts", "catalog", "behavior", "scenarios", "SCN-CATALOG-PRODUCT-AVAILABLE.feature");
    const orderingJourney = fs.readFileSync(orderingJourneyPath, "utf-8");
    const catalogJourney = fs.readFileSync(catalogJourneyPath, "utf-8");
    const validCheckout = fs.readFileSync(validCheckoutPath, "utf-8");
    const outOfStock = fs.readFileSync(outOfStockPath, "utf-8");
    const technicalBoundary = fs.readFileSync(technicalBoundaryPath, "utf-8");
    const catalogTechnicalBoundary = fs.readFileSync(catalogTechnicalBoundaryPath, "utf-8");
    const catalogAvailable = fs.readFileSync(catalogAvailablePath, "utf-8");
    const baseline = yaml.load(fs.readFileSync(path.join(root, ".spec", "baselines", "current.yaml"), "utf-8")) as { scenarios?: string[] };

    results.push({
      name: "initializer writes journeys and Gherkin scenario files",
      passed:
        initResult.status === "input_contract_ready" &&
        initResult.nextTask === "greenfield-initialization-mvp-complete" &&
        initResult.writtenFiles.some((filePath) => filePath.endsWith("contexts/ordering/behavior/journeys.md")) &&
        initResult.writtenFiles.some((filePath) => filePath.endsWith("SCN-ORDER-CHECKOUT-VALID.feature")) &&
        initResult.writtenFiles.some((filePath) => filePath.endsWith("SCN-ORDER-TECHNICAL-BOUNDARY.feature")) &&
        initResult.writtenFiles.some((filePath) => filePath.endsWith("SCN-CATALOG-TECHNICAL-OWNERSHIP.feature")) &&
        fs.existsSync(orderingJourneyPath) &&
        fs.existsSync(catalogJourneyPath) &&
        fs.existsSync(validCheckoutPath) &&
        fs.existsSync(outOfStockPath) &&
        fs.existsSync(technicalBoundaryPath) &&
        fs.existsSync(catalogTechnicalBoundaryPath) &&
        fs.existsSync(catalogAvailablePath) &&
        orderingJourney.includes("Source confidence: `technical_solution`") &&
        catalogJourney.includes("Source confidence: `technical_solution`") &&
        technicalBoundary.includes("@SCN-ORDER-TECHNICAL-BOUNDARY") &&
        catalogTechnicalBoundary.includes("@SCN-CATALOG-TECHNICAL-OWNERSHIP"),
      error: `Expected journeys and feature files, got result=${JSON.stringify(initResult)}.`,
    });

    results.push({
      name: "valid checkout scenario maps happy path requirements",
      passed:
        validCheckout.includes("@SCN-ORDER-CHECKOUT-VALID") &&
        validCheckout.includes("@REQ-ORD-001") &&
        validCheckout.includes("@REQ-ORD-003") &&
        validCheckout.includes("@REQ-ORD-004") &&
        validCheckout.includes("Feature: Valid checkout") &&
        validCheckout.includes("Given a cart with all items marked sellable") &&
        validCheckout.includes("Then an order is created") &&
        validCheckout.includes("And an OrderCreated event is emitted"),
      error: `Expected valid checkout Gherkin with requirement tags, got ${validCheckout}.`,
    });

    results.push({
      name: "rejection scenario maps unavailable item requirements",
      passed:
        outOfStock.includes("@SCN-ORDER-CHECKOUT-OUT-OF-STOCK") &&
        outOfStock.includes("@REQ-ORD-002") &&
        outOfStock.includes("@REQ-ORD-003") &&
        outOfStock.includes("checkout is rejected") &&
        outOfStock.includes("no order is created"),
      error: `Expected rejection Gherkin with requirement tags, got ${outOfStock}.`,
    });

    results.push({
      name: "catalog scenario maps product availability requirement",
      passed:
        catalogAvailable.includes("@SCN-CATALOG-PRODUCT-AVAILABLE") &&
        catalogAvailable.includes("@REQ-CAT-001") &&
        catalogAvailable.includes("Feature: Expose available products") &&
        catalogAvailable.includes("the product is included in the available product result"),
      error: `Expected catalog Gherkin with requirement tag, got ${catalogAvailable}.`,
    });

    results.push({
      name: "baseline records generated scenario IDs",
      passed:
        baseline.scenarios?.includes("SCN-ORDER-CHECKOUT-VALID") === true &&
        baseline.scenarios?.includes("SCN-ORDER-CHECKOUT-OUT-OF-STOCK") === true &&
        baseline.scenarios?.includes("SCN-ORDER-TECHNICAL-BOUNDARY") === true &&
        baseline.scenarios?.includes("SCN-CATALOG-TECHNICAL-OWNERSHIP") === true &&
        baseline.scenarios?.includes("SCN-CATALOG-PRODUCT-AVAILABLE") === true,
      error: `Expected baseline scenario IDs, got ${JSON.stringify(baseline)}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "greenfield behavior scenario draft execution",
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
