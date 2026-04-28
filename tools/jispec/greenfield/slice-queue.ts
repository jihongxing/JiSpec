import * as yaml from "js-yaml";
import type { GreenfieldApiContractDraft } from "./api-contract-draft";
import type { GreenfieldBehaviorDraft, GreenfieldScenarioDraft } from "./behavior-draft";
import type { GreenfieldDomainDraft } from "./domain-draft";

export interface GreenfieldSliceDraft {
  id: string;
  title: string;
  contextId: string;
  priority: "high" | "medium";
  goal: string;
  includes: string[];
  excludes: string[];
  requirementIds: string[];
  scenarioIds: string[];
  contractIds: string[];
  testIds: string[];
  dependencies: Array<{
    slice_id: string;
    kind: "requirements" | "design" | "behavior" | "test" | "code" | "evidence";
    required_state: string;
  }>;
  scenarios: GreenfieldScenarioDraft[];
}

export interface GreenfieldSliceQueueDraft {
  slices: GreenfieldSliceDraft[];
  openDecisions: string[];
}

export interface GreenfieldSliceQueueDraftInput {
  domainDraft: GreenfieldDomainDraft;
  apiContractDraft: GreenfieldApiContractDraft;
  behaviorDraft: GreenfieldBehaviorDraft;
}

export function draftGreenfieldSliceQueue(input: GreenfieldSliceQueueDraftInput): GreenfieldSliceQueueDraft {
  const slices = input.behaviorDraft.contextBehaviors
    .filter((contextBehavior) => contextBehavior.scenarios.length > 0)
    .map((contextBehavior) => buildSliceForContext(contextBehavior.contextId, contextBehavior.scenarios, input));

  applyCatalogDependency(slices);

  return {
    slices,
    openDecisions: [
      "Review generated slice boundaries before assigning implementation agents.",
      "Confirm test targets before implementation starts.",
    ],
  };
}

export function renderSliceRequirements(slice: GreenfieldSliceDraft): string {
  return [
    "# Slice Requirements",
    "",
    "## Objective",
    "",
    slice.goal,
    "",
    "## Included Requirement Links",
    "",
    ...slice.requirementIds.map((requirementId) => `- \`${requirementId}\``),
    "",
    "## Scope Notes",
    "",
    ...slice.includes.map((item) => `- Include: ${item}`),
    ...slice.excludes.map((item) => `- Exclude: ${item}`),
    "",
  ].join("\n");
}

export function renderSliceDesign(slice: GreenfieldSliceDraft): string {
  return [
    "# Slice Design",
    "",
    "## Summary",
    "",
    slice.goal,
    "",
    "## Contract References",
    "",
    ...(slice.contractIds.length > 0 ? slice.contractIds.map((contractId) => `- \`${contractId}\``) : ["- No contract references generated."]),
    "",
    "## Key Decisions",
    "",
    "- Keep the slice thin enough for one AI implementation handoff.",
    "- Preserve trace from requirements to scenarios and tests.",
    "",
  ].join("\n");
}

export function renderSliceBehaviorsFeature(slice: GreenfieldSliceDraft): string {
  const lines = [`Feature: ${slice.title}`, ""];

  for (const scenario of slice.scenarios) {
    lines.push(`  @${scenario.id}`);
    for (const requirementId of scenario.requirementIds) {
      lines.push(`  @${requirementId}`);
    }
    lines.push(`  Scenario: ${scenario.scenario}`);
    scenario.given.forEach((step, index) => {
      lines.push(`    ${index === 0 ? "Given" : "And"} ${step}`);
    });
    lines.push(`    When ${scenario.when}`);
    scenario.then.forEach((step, index) => {
      lines.push(`    ${index === 0 ? "Then" : "And"} ${step}`);
    });
    lines.push("");
  }

  return lines.join("\n");
}

export function renderSliceYaml(slice: GreenfieldSliceDraft, now: string): string {
  return dumpYaml({
    id: slice.id,
    title: slice.title,
    context_id: slice.contextId,
    priority: slice.priority,
    lifecycle: {
      state: "test-defined",
      created_at: now,
      updated_at: now,
    },
    goal: slice.goal,
    scope: {
      includes: slice.includes,
      excludes: slice.excludes,
    },
    source_refs: {
      requirement_ids: slice.requirementIds,
      design_refs: slice.contractIds,
    },
    owners: {
      product: `pm-${slice.contextId}`,
      engineering: `tl-${slice.contextId}`,
    },
    gates: {
      requirements_ready: true,
      design_ready: true,
      behavior_ready: true,
      test_ready: true,
      implementation_ready: false,
      verification_ready: false,
      accepted: false,
    },
    dependencies: slice.dependencies,
  });
}

export function renderSliceTasks(slice: GreenfieldSliceDraft, now: string): string {
  const prefix = `TASK-${slice.id.toUpperCase()}`;
  return dumpYaml({
    tasks: [
      {
        id: `${prefix}-001`,
        title: `Implement ${slice.title} application flow`,
        owner: "build-agent",
        status: "pending",
        updated_at: now,
      },
      {
        id: `${prefix}-002`,
        title: `Implement ${slice.title} domain rules`,
        owner: "build-agent",
        status: "pending",
        depends_on: [`${prefix}-001`],
        updated_at: now,
      },
      {
        id: `${prefix}-003`,
        title: `Add tests for ${slice.title}`,
        owner: "test-agent",
        status: "pending",
        depends_on: [`${prefix}-001`, `${prefix}-002`],
        updated_at: now,
      },
      {
        id: `${prefix}-004`,
        title: `Review trace and acceptance evidence for ${slice.title}`,
        owner: "review-agent",
        status: "pending",
        depends_on: [`${prefix}-003`],
        updated_at: now,
      },
    ],
  });
}

export function renderSliceTestSpec(slice: GreenfieldSliceDraft): string {
  return dumpYaml({
    tests: slice.scenarioIds.map((scenarioId) => ({
      id: testIdForScenario(scenarioId),
      type: "integration",
      verifies: [scenarioId],
      target: `${slice.contextId}-${slugify(slice.title)}`,
    })),
  });
}

export function renderSliceTrace(slice: GreenfieldSliceDraft): string {
  const links = [];

  for (const scenario of slice.scenarios) {
    for (const requirementId of scenario.requirementIds) {
      links.push({
        from: { type: "requirement", id: requirementId },
        to: { type: "scenario", id: scenario.id },
        relation: "verified_by",
      });
    }
    links.push({
      from: { type: "scenario", id: scenario.id },
      to: { type: "test", id: testIdForScenario(scenario.id) },
      relation: "covered_by",
    });
  }

  return dumpYaml({ links });
}

function buildSliceForContext(
  contextId: string,
  scenarios: GreenfieldScenarioDraft[],
  input: GreenfieldSliceQueueDraftInput,
): GreenfieldSliceDraft {
  if (contextId === "ordering") {
    return buildOrderingCheckoutSlice(scenarios, input);
  }
  if (contextId === "catalog") {
    return buildCatalogAvailabilitySlice(scenarios, input);
  }

  const requirementIds = unique(scenarios.flatMap((scenario) => scenario.requirementIds));
  return {
    id: `${contextId}-initial-v1`,
    title: `${titleCase(contextId)} Initial Slice`,
    contextId,
    priority: "medium",
    goal: `Deliver the first ${titleCase(contextId)} behavior slice.`,
    includes: scenarios.map((scenario) => scenario.scenario),
    excludes: ["Non-essential integrations", "Operational hardening"],
    requirementIds,
    scenarioIds: scenarios.map((scenario) => scenario.id),
    contractIds: contractIdsForContext(contextId, input.apiContractDraft),
    testIds: scenarios.map((scenario) => testIdForScenario(scenario.id)),
    dependencies: [],
    scenarios,
  };
}

function buildOrderingCheckoutSlice(
  scenarios: GreenfieldScenarioDraft[],
  input: GreenfieldSliceQueueDraftInput,
): GreenfieldSliceDraft {
  return {
    id: "ordering-checkout-v1",
    title: "Checkout MVP",
    contextId: "ordering",
    priority: "high",
    goal: "Allow users to submit an order from a valid cart while rejecting unavailable items.",
    includes: [
      "cart availability validation",
      "cart total calculation",
      "order creation",
      "OrderCreated event emission",
    ],
    excludes: [
      "payment processing",
      "shipment creation",
    ],
    requirementIds: unique(scenarios.flatMap((scenario) => scenario.requirementIds)),
    scenarioIds: scenarios.map((scenario) => scenario.id),
    contractIds: contractIdsForContext("ordering", input.apiContractDraft),
    testIds: scenarios.map((scenario) => testIdForScenario(scenario.id)),
    dependencies: [],
    scenarios,
  };
}

function buildCatalogAvailabilitySlice(
  scenarios: GreenfieldScenarioDraft[],
  input: GreenfieldSliceQueueDraftInput,
): GreenfieldSliceDraft {
  return {
    id: "catalog-product-availability-v1",
    title: "Product Availability MVP",
    contextId: "catalog",
    priority: "medium",
    goal: "Expose products that are available for sale.",
    includes: [
      "available product read model",
      "product saleability contract",
    ],
    excludes: [
      "catalog administration UI",
      "pricing promotions",
    ],
    requirementIds: unique(scenarios.flatMap((scenario) => scenario.requirementIds)),
    scenarioIds: scenarios.map((scenario) => scenario.id),
    contractIds: contractIdsForContext("catalog", input.apiContractDraft),
    testIds: scenarios.map((scenario) => testIdForScenario(scenario.id)),
    dependencies: [],
    scenarios,
  };
}

function applyCatalogDependency(slices: GreenfieldSliceDraft[]): void {
  const ordering = slices.find((slice) => slice.id === "ordering-checkout-v1");
  const catalog = slices.find((slice) => slice.id === "catalog-product-availability-v1");

  if (!ordering || !catalog) {
    return;
  }

  ordering.dependencies.push({
    slice_id: catalog.id,
    kind: "behavior",
    required_state: "test-defined",
  });
}

function contractIdsForContext(contextId: string, apiContractDraft: GreenfieldApiContractDraft): string[] {
  return apiContractDraft.contextContracts
    .find((contextContract) => contextContract.contextId === contextId)
    ?.contracts.map((contract) => contract.id) ?? [];
}

function testIdForScenario(scenarioId: string): string {
  return `TEST-${scenarioId.replace(/^SCN-/, "")}-INTEGRATION`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(value: string): string {
  return value
    .replace(/[-_.]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function dumpYaml(value: unknown): string {
  return yaml.dump(value, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
}
