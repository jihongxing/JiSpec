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

interface ContractsYaml {
  contracts?: Array<{
    id?: string;
    name?: string;
    direction?: string;
    source_context?: string;
    source_confidence?: string;
    source_requirement_ids?: string[];
    open_questions?: string[];
    fields?: Array<{ name?: string; type?: string; required?: boolean }>;
  }>;
}

async function main(): Promise<void> {
  console.log("=== Greenfield API Contract Draft Tests ===\n");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-api-"));
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-api-src-"));
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

    const orderingContractsPath = path.join(root, "contexts", "ordering", "design", "contracts.yaml");
    const catalogContractsPath = path.join(root, "contexts", "catalog", "design", "contracts.yaml");
    const orderingContracts = yaml.load(fs.readFileSync(orderingContractsPath, "utf-8")) as ContractsYaml;
    const catalogContracts = yaml.load(fs.readFileSync(catalogContractsPath, "utf-8")) as ContractsYaml;
    const checkoutRequest = orderingContracts.contracts?.find((contract) => contract.name === "CheckoutRequest");
    const availabilitySnapshot = orderingContracts.contracts?.find((contract) => contract.name === "AvailabilitySnapshot");
    const orderCreated = orderingContracts.contracts?.find((contract) => contract.name === "OrderCreatedEvent");
    const productAvailability = catalogContracts.contracts?.find((contract) => contract.name === "ProductAvailabilityView");

    results.push({
      name: "initializer writes contracts.yaml for generated contexts",
      passed:
        initResult.status === "input_contract_ready" &&
        initResult.nextTask === "greenfield-initialization-mvp-complete" &&
        initResult.writtenFiles.some((filePath) => filePath.endsWith("contexts/ordering/design/contracts.yaml")) &&
        initResult.writtenFiles.some((filePath) => filePath.endsWith("contexts/catalog/design/contracts.yaml")) &&
        Array.isArray(orderingContracts.contracts) &&
        Array.isArray(catalogContracts.contracts),
      error: `Expected contracts.yaml files, got result=${JSON.stringify(initResult)}, ordering=${JSON.stringify(orderingContracts)}, catalog=${JSON.stringify(catalogContracts)}.`,
    });

    results.push({
      name: "initializer drafts inbound checkout request contract from requirements",
      passed:
        checkoutRequest?.id === "CTR-ORDERING-001" &&
        checkoutRequest.direction === "inbound" &&
        checkoutRequest.source_confidence === "requirements" &&
        checkoutRequest.source_requirement_ids?.includes("REQ-ORD-001") === true &&
        checkoutRequest.fields?.some((field) => field.name === "cartId" && field.type === "string" && field.required === true) === true &&
        checkoutRequest.open_questions?.some((question) => question.includes("cartId")) === true,
      error: `Expected CheckoutRequest contract with requirement trace, got ${JSON.stringify(checkoutRequest)}.`,
    });

    results.push({
      name: "initializer drafts upstream availability contract from technical solution",
      passed:
        availabilitySnapshot?.id === "CTR-ORDERING-002" &&
        availabilitySnapshot.direction === "upstream-read" &&
        availabilitySnapshot.source_context === "catalog" &&
        availabilitySnapshot.source_confidence === "technical_solution" &&
        availabilitySnapshot.source_requirement_ids?.includes("REQ-ORD-002") === true &&
        availabilitySnapshot.fields?.some((field) => field.name === "sellable" && field.type === "boolean") === true,
      error: `Expected AvailabilitySnapshot contract with source context, got ${JSON.stringify(availabilitySnapshot)}.`,
    });

    results.push({
      name: "initializer drafts outbound domain event contract",
      passed:
        orderCreated?.id === "CTR-ORDERING-003" &&
        orderCreated.direction === "outbound-event" &&
        orderCreated.source_confidence === "requirements" &&
        orderCreated.source_requirement_ids?.includes("REQ-ORD-004") === true &&
        orderCreated.fields?.some((field) => field.name === "orderId" && field.required === true) === true,
      error: `Expected OrderCreatedEvent contract, got ${JSON.stringify(orderCreated)}.`,
    });

    results.push({
      name: "initializer drafts catalog read model contract",
      passed:
        productAvailability?.id === "CTR-CATALOG-001" &&
        productAvailability.direction === "outbound-read-model" &&
        productAvailability.source_confidence === "technical_solution" &&
        productAvailability.source_requirement_ids?.includes("REQ-CAT-001") === true &&
        productAvailability.fields?.some((field) => field.name === "productId" && field.type === "string") === true,
      error: `Expected ProductAvailabilityView contract, got ${JSON.stringify(productAvailability)}.`,
    });

    const requirementsOnlyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-api-req-only-"));
    const requirementsOnlyResult = runGreenfieldInit({
      root: requirementsOnlyRoot,
      requirements: requirementsPath,
    });
    const requirementsOnlyOrdering = yaml.load(
      fs.readFileSync(path.join(requirementsOnlyRoot, "contexts", "ordering", "design", "contracts.yaml"), "utf-8"),
    ) as ContractsYaml;
    const requirementsOnlyAvailability = requirementsOnlyOrdering.contracts?.find((contract) => contract.name === "AvailabilitySnapshot");

    results.push({
      name: "requirements-only contracts mark technical gaps as requirements-sourced",
      passed:
        requirementsOnlyResult.status === "input_contract_ready" &&
        requirementsOnlyAvailability?.source_confidence === "requirements" &&
        requirementsOnlyAvailability.open_questions?.some((question) => question.includes("synchronously")) === true,
      error: `Expected requirements-only availability contract to avoid technical_solution confidence, got ${JSON.stringify(requirementsOnlyAvailability)}.`,
    });
    fs.rmSync(requirementsOnlyRoot, { recursive: true, force: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "greenfield API contract draft execution",
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
