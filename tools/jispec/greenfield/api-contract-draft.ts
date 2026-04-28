import type { GreenfieldContextDraft, GreenfieldDomainDraft, GreenfieldTermDraft } from "./domain-draft";

export interface GreenfieldContractFieldDraft {
  name: string;
  type: string;
  required: boolean;
}

export interface GreenfieldContractDraft {
  id: string;
  name: string;
  direction: string;
  sourceContext?: string;
  sourceConfidence: "requirements" | "technical_solution" | "inferred";
  sourceRequirementIds: string[];
  openQuestions: string[];
  fields: GreenfieldContractFieldDraft[];
}

export interface GreenfieldContextContractDraft {
  contextId: string;
  contracts: GreenfieldContractDraft[];
}

export interface GreenfieldApiContractDraft {
  contextContracts: GreenfieldContextContractDraft[];
  openQuestions: string[];
}

export interface GreenfieldApiContractDraftInput {
  requirementsContent: string;
  technicalSolutionContent: string;
  technicalSolutionMissing: boolean;
  domainDraft: GreenfieldDomainDraft;
}

export function draftGreenfieldApiContracts(input: GreenfieldApiContractDraftInput): GreenfieldApiContractDraft {
  const contextContracts = input.domainDraft.contexts.map((context) => ({
    contextId: context.id,
    contracts: inferContractsForContext(context, input),
  }));
  const openQuestions = collectOpenQuestions(contextContracts);

  return {
    contextContracts,
    openQuestions,
  };
}

function inferContractsForContext(
  context: GreenfieldContextDraft,
  input: GreenfieldApiContractDraftInput,
): GreenfieldContractDraft[] {
  const contracts: GreenfieldContractDraft[] = [];
  const terms = input.domainDraft.terms.filter((term) => term.contexts.includes(context.id));

  if (context.id === "ordering") {
    contracts.push(...inferOrderingContracts(context, input));
  } else if (context.id === "catalog") {
    contracts.push(...inferCatalogContracts(context, input, terms));
  } else if (context.sourceRequirementIds.length > 0) {
    contracts.push(createGenericCommandContract(context));
  }

  return contracts;
}

function inferOrderingContracts(
  context: GreenfieldContextDraft,
  input: GreenfieldApiContractDraftInput,
): GreenfieldContractDraft[] {
  const contracts: GreenfieldContractDraft[] = [];
  const lowerRequirements = input.requirementsContent.toLowerCase();
  const lowerTechnical = input.technicalSolutionContent.toLowerCase();
  const checkoutRequirementIds = context.sourceRequirementIds.filter((requirementId) => requirementId.startsWith("REQ-ORD-"));

  if (lowerRequirements.includes("checkout") || lowerRequirements.includes("submit an order")) {
    contracts.push({
      id: "CTR-ORDERING-001",
      name: "CheckoutRequest",
      direction: "inbound",
      sourceConfidence: "requirements",
      sourceRequirementIds: checkoutRequirementIds,
      openQuestions: [
        "Confirm whether checkout request uses cartId, cart snapshot, or explicit line items.",
      ],
      fields: [
        { name: "cartId", type: "string", required: true },
      ],
    });
  }

  const needsAvailability =
    lowerRequirements.includes("available") ||
    lowerRequirements.includes("unavailable") ||
    lowerRequirements.includes("stock") ||
    lowerTechnical.includes("availability");

  if (needsAvailability) {
    contracts.push({
      id: "CTR-ORDERING-002",
      name: "AvailabilitySnapshot",
      direction: "upstream-read",
      sourceContext: "catalog",
      sourceConfidence: input.technicalSolutionMissing ? "requirements" : "technical_solution",
      sourceRequirementIds: checkoutRequirementIds.filter((requirementId) =>
        requirementId === "REQ-ORD-002" || requirementId === "REQ-ORD-003",
      ),
      openQuestions: [
        "Confirm whether availability is read synchronously, cached, or event-sourced.",
      ],
      fields: [
        { name: "productId", type: "string", required: true },
        { name: "sellable", type: "boolean", required: true },
      ],
    });
  }

  if (lowerRequirements.includes("domain event") || lowerRequirements.includes("ordercreated")) {
    contracts.push({
      id: "CTR-ORDERING-003",
      name: "OrderCreatedEvent",
      direction: "outbound-event",
      sourceConfidence: "requirements",
      sourceRequirementIds: checkoutRequirementIds.filter((requirementId) => requirementId === "REQ-ORD-004"),
      openQuestions: [
        "Confirm event transport, topic name, and exactly-once or at-least-once delivery expectations.",
      ],
      fields: [
        { name: "orderId", type: "string", required: true },
        { name: "occurredAt", type: "datetime", required: true },
      ],
    });
  }

  return contracts;
}

function inferCatalogContracts(
  context: GreenfieldContextDraft,
  input: GreenfieldApiContractDraftInput,
  terms: GreenfieldTermDraft[],
): GreenfieldContractDraft[] {
  const lowerRequirements = input.requirementsContent.toLowerCase();
  const hasProduct = terms.some((term) => term.term === "Product") || lowerRequirements.includes("product");
  const hasAvailability = terms.some((term) => term.term === "Availability") || lowerRequirements.includes("available");

  if (!hasProduct && !hasAvailability) {
    return [];
  }

  return [
    {
      id: "CTR-CATALOG-001",
      name: "ProductAvailabilityView",
      direction: "outbound-read-model",
      sourceConfidence: input.technicalSolutionMissing ? "requirements" : "technical_solution",
      sourceRequirementIds: context.sourceRequirementIds,
      openQuestions: [
        "Confirm product identifier shape and whether price belongs in the same read model.",
      ],
      fields: [
        { name: "productId", type: "string", required: true },
        { name: "sellable", type: "boolean", required: true },
      ],
    },
  ];
}

function createGenericCommandContract(context: GreenfieldContextDraft): GreenfieldContractDraft {
  return {
    id: `CTR-${context.id.toUpperCase()}-001`,
    name: `${context.name.replace(/\s+/g, "")}Command`,
    direction: "inbound",
    sourceConfidence: "inferred",
    sourceRequirementIds: context.sourceRequirementIds,
    openQuestions: [
      "Confirm externally visible API shape for this context.",
      "Confirm field names and validation rules.",
    ],
    fields: [
      { name: "requestId", type: "string", required: true },
    ],
  };
}

function collectOpenQuestions(contextContracts: GreenfieldContextContractDraft[]): string[] {
  return Array.from(
    new Set(
      contextContracts.flatMap((contextContract) =>
        contextContract.contracts.flatMap((contract) => contract.openQuestions),
      ),
    ),
  );
}
