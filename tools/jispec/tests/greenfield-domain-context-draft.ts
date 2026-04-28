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

interface ContextMap {
  contexts?: Array<{ id?: string; source_requirement_ids?: string[] }>;
  relations?: Array<{ from?: string; to?: string }>;
}

interface Glossary {
  terms?: Array<{ term?: string; contexts?: string[]; source_requirement_ids?: string[] }>;
}

interface ContextYaml {
  id?: string;
  upstream_contexts?: string[];
  downstream_contexts?: string[];
  active_slices?: string[];
}

async function main(): Promise<void> {
  console.log("=== Greenfield Domain And Context Draft Tests ===\n");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-domain-"));
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-domain-src-"));
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

    const contextMap = yaml.load(fs.readFileSync(path.join(root, "jiproject", "context-map.yaml"), "utf-8")) as ContextMap;
    const glossary = yaml.load(fs.readFileSync(path.join(root, "jiproject", "glossary.yaml"), "utf-8")) as Glossary;
    const catalogContext = yaml.load(fs.readFileSync(path.join(root, "contexts", "catalog", "context.yaml"), "utf-8")) as ContextYaml;
    const orderingContext = yaml.load(fs.readFileSync(path.join(root, "contexts", "ordering", "context.yaml"), "utf-8")) as ContextYaml;
    const orderingEntities = yaml.load(fs.readFileSync(path.join(root, "contexts", "ordering", "domain", "entities.yaml"), "utf-8")) as { entities?: Array<{ id?: string; source_requirement_ids?: string[] }> };
    const orderingEvents = yaml.load(fs.readFileSync(path.join(root, "contexts", "ordering", "domain", "events.yaml"), "utf-8")) as { events?: Array<{ id?: string; source_requirement_ids?: string[] }> };
    const orderingInvariants = yaml.load(fs.readFileSync(path.join(root, "contexts", "ordering", "domain", "invariants.yaml"), "utf-8")) as { invariants?: Array<{ id?: string; source_requirement_id?: string }> };

    results.push({
      name: "initializer derives bounded contexts from PRD and technical solution",
      passed:
        initResult.status === "input_contract_ready" &&
        initResult.nextTask === "greenfield-initialization-mvp-complete" &&
        contextMap.contexts?.some((context) => context.id === "catalog") === true &&
        contextMap.contexts?.some((context) => context.id === "ordering") === true &&
        contextMap.contexts?.some((context) => context.id === "context") === false &&
        contextMap.contexts?.some((context) => context.id === "payment") === false &&
        contextMap.contexts?.some((context) => context.id === "refunds") === false &&
        contextMap.contexts?.some((context) => context.id === "shipping") === false &&
        contextMap.contexts?.find((context) => context.id === "ordering")?.source_requirement_ids?.includes("REQ-ORD-001") === true &&
        contextMap.relations?.some((relation) => relation.from === "ordering" && relation.to === "catalog") === true,
      error: `Expected catalog and ordering contexts with relation, got ${JSON.stringify(contextMap)}.`,
    });

    results.push({
      name: "initializer writes schema-shaped context files with active slices",
      passed:
        catalogContext.id === "catalog" &&
        orderingContext.id === "ordering" &&
        orderingContext.upstream_contexts?.includes("catalog") === true &&
        catalogContext.downstream_contexts?.includes("ordering") === true &&
        Array.isArray(orderingContext.active_slices) &&
        orderingContext.active_slices.includes("ordering-checkout-v1") &&
        catalogContext.active_slices?.includes("catalog-product-availability-v1") === true,
      error: `Expected context.yaml files with dependency direction, got catalog=${JSON.stringify(catalogContext)}, ordering=${JSON.stringify(orderingContext)}.`,
    });

    results.push({
      name: "initializer derives domain terms with source requirement trace",
      passed:
        glossary.terms?.some((term) => term.term === "Order" && term.contexts?.includes("ordering") && term.source_requirement_ids?.includes("REQ-ORD-001")) === true &&
        glossary.terms?.some((term) => term.term === "Product" && term.contexts?.includes("catalog") && term.source_requirement_ids?.includes("REQ-CAT-001")) === true,
      error: `Expected glossary terms to trace to requirements, got ${JSON.stringify(glossary)}.`,
    });

    results.push({
      name: "initializer writes domain entities, events, and invariants",
      passed:
        orderingEntities.entities?.some((entity) => entity.id === "ENT-ORDER" && entity.source_requirement_ids?.includes("REQ-ORD-001")) === true &&
        orderingEvents.events?.some((event) => event.id === "EVT-ORDER-CREATED" && event.source_requirement_ids?.includes("REQ-ORD-004")) === true &&
        orderingInvariants.invariants?.some((invariant) => invariant.source_requirement_id === "REQ-ORD-002") === true &&
        orderingInvariants.invariants?.some((invariant) => invariant.source_requirement_id === "REQ-ORD-003") === true,
      error: `Expected ordering domain artifacts, got entities=${JSON.stringify(orderingEntities)}, events=${JSON.stringify(orderingEvents)}, invariants=${JSON.stringify(orderingInvariants)}.`,
    });

    const technicalRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-technical-noise-"));
    const technicalRequirementsPath = path.join(technicalRoot, "requirements.md");
    fs.writeFileSync(
      technicalRequirementsPath,
      [
        "# Workflow Tool Requirements",
        "",
        "## Objective",
        "",
        "Build a workflow tool.",
        "",
        "## Functional Requirements",
        "",
        "### REQ-WF-001",
        "",
        "A user must submit a workflow request.",
      ].join("\n"),
      "utf-8",
    );
    const technicalInit = runGreenfieldInit({
      root: path.join(technicalRoot, "out"),
      requirements: technicalRequirementsPath,
    });
    const technicalContextMap = yaml.load(
      fs.readFileSync(path.join(technicalRoot, "out", "jiproject", "context-map.yaml"), "utf-8"),
    ) as ContextMap;

    results.push({
      name: "initializer does not promote technical module names into contexts",
      passed:
        technicalInit.status === "input_contract_ready" &&
        technicalContextMap.contexts?.some((context) => context.id === "service" || context.id === "repository" || context.id === "controller") === false,
      error: `Expected technical module names to be suppressed, got ${JSON.stringify(technicalContextMap)}.`,
    });
    fs.rmSync(technicalRoot, { recursive: true, force: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "greenfield domain and context draft execution",
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
    "- Checkout validation must be testable without external payment infrastructure.",
    "",
    "## Out Of Scope",
    "",
    "- Refunds.",
    "- Payment capture.",
    "- Shipment orchestration.",
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
    "Shipping provider is deferred.",
  ].join("\n");
}

void main();
