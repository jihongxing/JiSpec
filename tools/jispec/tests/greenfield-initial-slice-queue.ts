import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { runGreenfieldInit } from "../greenfield/init";
import { validateRepository } from "../validator";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface ContextYaml {
  active_slices?: string[];
}

interface BaselineYaml {
  slices?: string[];
  assets?: string[];
}

interface SliceYaml {
  id?: string;
  context_id?: string;
  priority?: string;
  lifecycle?: { state?: string };
  source_refs?: {
    requirement_ids?: string[];
    design_refs?: string[];
  };
  dependencies?: Array<{ slice_id?: string; kind?: string; required_state?: string }>;
}

interface TestSpecYaml {
  tests?: Array<{ id?: string; verifies?: string[] }>;
}

interface TraceYaml {
  links?: Array<{
    from?: { type?: string; id?: string };
    to?: { type?: string; id?: string };
    relation?: string;
  }>;
}

async function main(): Promise<void> {
  console.log("=== Greenfield Initial Slice Queue Tests ===\n");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-slices-"));
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-slices-src-"));
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

    const orderingSliceRoot = path.join(root, "contexts", "ordering", "slices", "ordering-checkout-v1");
    const catalogSliceRoot = path.join(root, "contexts", "catalog", "slices", "catalog-product-availability-v1");
    const orderingContext = yaml.load(
      fs.readFileSync(path.join(root, "contexts", "ordering", "context.yaml"), "utf-8"),
    ) as ContextYaml;
    const catalogContext = yaml.load(
      fs.readFileSync(path.join(root, "contexts", "catalog", "context.yaml"), "utf-8"),
    ) as ContextYaml;
    const baseline = yaml.load(
      fs.readFileSync(path.join(root, ".spec", "baselines", "current.yaml"), "utf-8"),
    ) as BaselineYaml;
    const orderingSlice = yaml.load(fs.readFileSync(path.join(orderingSliceRoot, "slice.yaml"), "utf-8")) as SliceYaml;
    const orderingTestSpec = yaml.load(
      fs.readFileSync(path.join(orderingSliceRoot, "test-spec.yaml"), "utf-8"),
    ) as TestSpecYaml;
    const orderingTrace = yaml.load(
      fs.readFileSync(path.join(orderingSliceRoot, "trace.yaml"), "utf-8"),
    ) as TraceYaml;
    const orderingBehaviors = fs.readFileSync(path.join(orderingSliceRoot, "behaviors.feature"), "utf-8");
    const orderingRequirements = fs.readFileSync(path.join(orderingSliceRoot, "requirements.md"), "utf-8");

    results.push({
      name: "initializer writes initial slice asset sets",
      passed:
        initResult.status === "input_contract_ready" &&
        initResult.nextTask === "greenfield-initialization-mvp-complete" &&
        sliceAssetSetExists(orderingSliceRoot) &&
        sliceAssetSetExists(catalogSliceRoot) &&
        initResult.writtenFiles.some((filePath) => filePath.endsWith("contexts/ordering/slices/ordering-checkout-v1/slice.yaml")) &&
        initResult.writtenFiles.some((filePath) => filePath.endsWith("contexts/catalog/slices/catalog-product-availability-v1/slice.yaml")),
      error: `Expected generated slice files, got result=${JSON.stringify(initResult)}.`,
    });

    results.push({
      name: "contexts and baseline record active initial slices",
      passed:
        orderingContext.active_slices?.includes("ordering-checkout-v1") === true &&
        catalogContext.active_slices?.includes("catalog-product-availability-v1") === true &&
        baseline.slices?.includes("ordering-checkout-v1") === true &&
        baseline.slices?.includes("catalog-product-availability-v1") === true &&
        baseline.assets?.includes("contexts/ordering/slices/ordering-checkout-v1/slice.yaml") === true,
      error: `Expected contexts and baseline to reference slices, got ordering=${JSON.stringify(orderingContext)}, catalog=${JSON.stringify(catalogContext)}, baseline=${JSON.stringify(baseline)}.`,
    });

    results.push({
      name: "ordering checkout slice captures requirements, contracts, and dependency",
      passed:
        orderingSlice.id === "ordering-checkout-v1" &&
        orderingSlice.context_id === "ordering" &&
        orderingSlice.priority === "high" &&
        orderingSlice.lifecycle?.state === "test-defined" &&
        orderingSlice.source_refs?.requirement_ids?.includes("REQ-ORD-001") === true &&
        orderingSlice.source_refs?.requirement_ids?.includes("REQ-ORD-002") === true &&
        orderingSlice.source_refs?.requirement_ids?.includes("REQ-ORD-003") === true &&
        orderingSlice.source_refs?.requirement_ids?.includes("REQ-ORD-004") === true &&
        orderingSlice.source_refs?.design_refs?.includes("CTR-ORDERING-001") === true &&
        orderingSlice.source_refs?.design_refs?.includes("CTR-ORDERING-002") === true &&
        orderingSlice.source_refs?.design_refs?.includes("CTR-ORDERING-003") === true &&
        orderingSlice.dependencies?.some(
          (dependency) =>
            dependency.slice_id === "catalog-product-availability-v1" &&
            dependency.kind === "behavior" &&
            dependency.required_state === "test-defined",
        ) === true,
      error: `Expected ordering slice queue metadata, got ${JSON.stringify(orderingSlice)}.`,
    });

    results.push({
      name: "slice requirements, behaviors, tests, and trace stay connected",
      passed:
        orderingRequirements.includes("`REQ-ORD-001`") &&
        orderingBehaviors.includes("@SCN-ORDER-CHECKOUT-VALID") &&
        orderingBehaviors.includes("@SCN-ORDER-CHECKOUT-OUT-OF-STOCK") &&
        orderingTestSpec.tests?.some(
          (test) =>
            test.id === "TEST-ORDER-CHECKOUT-VALID-INTEGRATION" &&
            test.verifies?.includes("SCN-ORDER-CHECKOUT-VALID"),
        ) === true &&
        orderingTrace.links?.some(
          (link) =>
            link.from?.type === "requirement" &&
            link.from.id === "REQ-ORD-001" &&
            link.to?.type === "scenario" &&
            link.to.id === "SCN-ORDER-CHECKOUT-VALID",
        ) === true &&
        orderingTrace.links?.some(
          (link) =>
            link.from?.type === "scenario" &&
            link.from.id === "SCN-ORDER-CHECKOUT-VALID" &&
            link.to?.type === "test" &&
            link.to.id === "TEST-ORDER-CHECKOUT-VALID-INTEGRATION",
        ) === true,
      error: `Expected connected slice trace, got tests=${JSON.stringify(orderingTestSpec)}, trace=${JSON.stringify(orderingTrace)}.`,
    });

    copyDirectory(path.join(process.cwd(), "schemas"), path.join(root, "schemas"));
    const validation = validateRepository(root);
    results.push({
      name: "generated initial slices pass repository validation",
      passed: validation.ok,
      error: `Expected repository validation to pass, got ${JSON.stringify(validation.toDict())}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name: "greenfield initial slice queue execution",
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

function sliceAssetSetExists(sliceRoot: string): boolean {
  return [
    "slice.yaml",
    "requirements.md",
    "design.md",
    "behaviors.feature",
    "test-spec.yaml",
    "tasks.yaml",
    "trace.yaml",
  ].every((fileName) => fs.existsSync(path.join(sliceRoot, fileName)));
}

function copyDirectory(source: string, target: string): void {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
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
