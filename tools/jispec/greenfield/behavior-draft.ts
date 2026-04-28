import type { GreenfieldDomainDraft } from "./domain-draft";

export interface GreenfieldScenarioDraft {
  id: string;
  contextId: string;
  feature: string;
  scenario: string;
  requirementIds: string[];
  given: string[];
  when: string;
  then: string[];
  sourceConfidence: "requirements" | "inferred";
}

export interface GreenfieldContextBehaviorDraft {
  contextId: string;
  journeysMarkdown: string;
  scenarios: GreenfieldScenarioDraft[];
}

export interface GreenfieldBehaviorDraft {
  contextBehaviors: GreenfieldContextBehaviorDraft[];
  scenarioIds: string[];
  openDecisions: string[];
}

export interface GreenfieldBehaviorDraftInput {
  requirementsContent: string;
  requirementIds: string[];
  domainDraft: GreenfieldDomainDraft;
}

interface RequirementBlock {
  id: string;
  text: string;
  contextId: string;
}

const REQUIREMENT_CONTEXT_MAP: Record<string, string> = {
  CAT: "catalog",
  ORD: "ordering",
  ORDER: "ordering",
  AUTH: "auth",
  USER: "identity",
  PAY: "payment",
  PMT: "payment",
  SHIP: "shipping",
  INV: "billing",
  BILL: "billing",
  REF: "refunds",
};

export function draftGreenfieldBehavior(input: GreenfieldBehaviorDraftInput): GreenfieldBehaviorDraft {
  const requirementBlocks = extractRequirementBlocks(input.requirementsContent, input.requirementIds);
  const contextBehaviors = input.domainDraft.contexts.map((context) => {
    const scenarios = inferScenariosForContext(context.id, requirementBlocks);
    return {
      contextId: context.id,
      journeysMarkdown: renderJourneysMarkdown(context.id, scenarios),
      scenarios,
    };
  });
  const scenarioIds = contextBehaviors.flatMap((contextBehavior) =>
    contextBehavior.scenarios.map((scenario) => scenario.id),
  );

  return {
    contextBehaviors,
    scenarioIds,
    openDecisions: collectOpenDecisions(input.requirementIds, contextBehaviors),
  };
}

export function renderScenarioFeature(scenario: GreenfieldScenarioDraft): string {
  return [
    `@${scenario.id}`,
    ...scenario.requirementIds.map((requirementId) => `@${requirementId}`),
    `Feature: ${scenario.feature}`,
    "",
    `  Scenario: ${scenario.scenario}`,
    ...scenario.given.map((step, index) => `    ${index === 0 ? "Given" : "And"} ${step}`),
    `    When ${scenario.when}`,
    ...scenario.then.map((step, index) => `    ${index === 0 ? "Then" : "And"} ${step}`),
    "",
  ].join("\n");
}

function inferScenariosForContext(contextId: string, requirementBlocks: RequirementBlock[]): GreenfieldScenarioDraft[] {
  if (contextId === "ordering") {
    return inferOrderingScenarios(requirementBlocks.filter((block) => block.contextId === "ordering"));
  }

  if (contextId === "catalog") {
    return inferCatalogScenarios(requirementBlocks.filter((block) => block.contextId === "catalog"));
  }

  return inferGenericScenarios(contextId, requirementBlocks.filter((block) => block.contextId === contextId));
}

function inferOrderingScenarios(blocks: RequirementBlock[]): GreenfieldScenarioDraft[] {
  const requirementIds = blocks.map((block) => block.id);
  const scenarios: GreenfieldScenarioDraft[] = [];

  if (containsAnyBlock(blocks, ["checkout", "submit an order", "valid cart"])) {
    scenarios.push({
      id: "SCN-ORDER-CHECKOUT-VALID",
      contextId: "ordering",
      feature: "Valid checkout",
      scenario: "Checkout succeeds for a valid cart",
      requirementIds: requirementIds.filter((id) => id === "REQ-ORD-001" || id === "REQ-ORD-003" || id === "REQ-ORD-004"),
      given: [
        "a cart with all items marked sellable",
        "the cart total can be calculated",
      ],
      when: "the user submits checkout",
      then: [
        "an order is created",
        "an OrderCreated event is emitted",
      ],
      sourceConfidence: "requirements",
    });
  }

  if (containsAnyBlock(blocks, ["unavailable", "stock", "reject"])) {
    scenarios.push({
      id: "SCN-ORDER-CHECKOUT-OUT-OF-STOCK",
      contextId: "ordering",
      feature: "Reject invalid checkout",
      scenario: "Checkout fails when a cart contains unavailable items",
      requirementIds: requirementIds.filter((id) => id === "REQ-ORD-002" || id === "REQ-ORD-003"),
      given: [
        "a cart with at least one item marked not sellable",
      ],
      when: "the user submits checkout",
      then: [
        "checkout is rejected",
        "no order is created",
      ],
      sourceConfidence: "requirements",
    });
  }

  return scenarios;
}

function inferCatalogScenarios(blocks: RequirementBlock[]): GreenfieldScenarioDraft[] {
  if (!containsAnyBlock(blocks, ["product", "available", "sale"])) {
    return [];
  }

  return [
    {
      id: "SCN-CATALOG-PRODUCT-AVAILABLE",
      contextId: "catalog",
      feature: "Expose available products",
      scenario: "Catalog exposes products that are available for sale",
      requirementIds: blocks.map((block) => block.id),
      given: [
        "a product is available for sale",
      ],
      when: "the catalog is queried for sellable products",
      then: [
        "the product is included in the available product result",
      ],
      sourceConfidence: "requirements",
    },
  ];
}

function inferGenericScenarios(contextId: string, blocks: RequirementBlock[]): GreenfieldScenarioDraft[] {
  return blocks.map((block, index) => ({
    id: `SCN-${contextId.toUpperCase()}-${String(index + 1).padStart(3, "0")}`,
    contextId,
    feature: `${titleCase(contextId)} behavior`,
    scenario: `Requirement ${block.id} is satisfied`,
    requirementIds: [block.id],
    given: [`the ${titleCase(contextId)} context is ready`],
    when: "the required behavior is requested",
    then: [`requirement ${block.id} is satisfied`],
    sourceConfidence: "inferred",
  }));
}

function renderJourneysMarkdown(contextId: string, scenarios: GreenfieldScenarioDraft[]): string {
  const title = `${titleCase(contextId)} User Journeys`;
  if (scenarios.length === 0) {
    return [
      `# ${title}`,
      "",
      "No behavior scenarios were generated for this context during Greenfield initialization.",
      "",
      "Add or clarify requirements, then rerun initialization or create scenarios manually.",
      "",
    ].join("\n");
  }

  return [
    `# ${title}`,
    "",
    ...scenarios.flatMap((scenario) => [
      `## ${scenario.scenario}`,
      "",
      `- Scenario ID: \`${scenario.id}\``,
      `- Requirements: ${scenario.requirementIds.map((id) => `\`${id}\``).join(", ") || "none"}`,
      `- Source confidence: \`${scenario.sourceConfidence}\``,
      "",
    ]),
  ].join("\n");
}

function collectOpenDecisions(requirementIds: string[], contextBehaviors: GreenfieldContextBehaviorDraft[]): string[] {
  const coveredRequirementIds = new Set(
    contextBehaviors.flatMap((contextBehavior) =>
      contextBehavior.scenarios.flatMap((scenario) => scenario.requirementIds),
    ),
  );
  const uncoveredRequirementIds = requirementIds.filter((requirementId) => !coveredRequirementIds.has(requirementId));

  return uncoveredRequirementIds.map((requirementId) =>
    `Requirement ${requirementId} does not yet map to a generated behavior scenario.`,
  );
}

function extractRequirementBlocks(content: string, requirementIds: string[]): RequirementBlock[] {
  if (requirementIds.length === 0) {
    return [];
  }

  const blocks: RequirementBlock[] = [];
  const pattern = new RegExp(`(^|\\n)#+\\s*(${requirementIds.map(escapeRegExp).join("|")})\\b([\\s\\S]*?)(?=\\n#+\\s*REQ-|\\n##\\s+|$)`, "g");

  for (const match of content.matchAll(pattern)) {
    const id = match[2];
    if (!id) {
      continue;
    }
    blocks.push({
      id,
      text: (match[3] ?? "").trim(),
      contextId: contextIdFromRequirementId(id) ?? "core",
    });
  }

  if (blocks.length === 0) {
    return requirementIds.map((id) => ({
      id,
      text: "",
      contextId: contextIdFromRequirementId(id) ?? "core",
    }));
  }

  return blocks;
}

function contextIdFromRequirementId(requirementId: string): string | undefined {
  const parts = requirementId.split("-");
  const key = parts[1];
  if (!key) {
    return undefined;
  }
  return REQUIREMENT_CONTEXT_MAP[key] ?? key.toLowerCase();
}

function containsAnyBlock(blocks: RequirementBlock[], terms: string[]): boolean {
  return blocks.some((block) =>
    terms.some((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(block.text)),
  );
}

function titleCase(value: string): string {
  return value
    .replace(/[-_.]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
