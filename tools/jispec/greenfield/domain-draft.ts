export interface GreenfieldDomainDraftInput {
  requirementsContent: string;
  technicalSolutionContent: string;
  requirementIds: string[];
  technicalSolutionMissing: boolean;
}

export interface GreenfieldContextDraft {
  id: string;
  name: string;
  type: "core" | "supporting";
  owner: string;
  purpose: string;
  upstreamContexts: string[];
  downstreamContexts: string[];
  sourceConfidence: "requirements" | "technical_solution" | "inferred";
  sourceRequirementIds: string[];
}

export interface GreenfieldTermDraft {
  id: string;
  term: string;
  definition: string;
  contexts: string[];
  source: "requirements" | "technical_solution" | "inferred";
  sourceRequirementIds: string[];
}

export interface GreenfieldEntityDraft {
  id: string;
  name: string;
  description: string;
  sourceRequirementIds: string[];
}

export interface GreenfieldEventDraft {
  id: string;
  name: string;
  description: string;
  sourceRequirementIds: string[];
}

export interface GreenfieldInvariantDraft {
  id: string;
  statement: string;
  sourceRequirementId?: string;
}

export interface GreenfieldValueObjectDraft {
  id: string;
  name: string;
  description: string;
  sourceRequirementIds: string[];
}

export interface GreenfieldContextDomainDraft {
  context: GreenfieldContextDraft;
  terms: GreenfieldTermDraft[];
  entities: GreenfieldEntityDraft[];
  events: GreenfieldEventDraft[];
  invariants: GreenfieldInvariantDraft[];
  valueObjects: GreenfieldValueObjectDraft[];
}

export interface GreenfieldDomainDraft {
  contexts: GreenfieldContextDraft[];
  relations: Array<{
    id: string;
    from: string;
    to: string;
    relationship: string;
    description: string;
  }>;
  terms: GreenfieldTermDraft[];
  contextDomains: GreenfieldContextDomainDraft[];
  openDecisions: string[];
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

const TECHNICAL_WORDS = new Set([
  "api",
  "app",
  "application",
  "client",
  "component",
  "config",
  "context",
  "contexts",
  "controller",
  "database",
  "db",
  "handler",
  "helper",
  "http",
  "infra",
  "infrastructure",
  "lib",
  "module",
  "repository",
  "route",
  "schema",
  "server",
  "service",
  "src",
  "test",
  "util",
  "utils",
]);

const TERM_PATTERNS: Array<{
  term: string;
  aliases: string[];
  definition: string;
  preferredContext?: string;
}> = [
  {
    term: "Product",
    aliases: ["product", "products"],
    definition: "A sellable item exposed by the product catalog.",
    preferredContext: "catalog",
  },
  {
    term: "Availability",
    aliases: ["availability", "available", "unavailable", "stock"],
    definition: "Whether a product can currently be purchased or used in checkout.",
    preferredContext: "catalog",
  },
  {
    term: "Price",
    aliases: ["price", "pricing"],
    definition: "The monetary value exposed for a product or order calculation.",
    preferredContext: "catalog",
  },
  {
    term: "Cart",
    aliases: ["cart", "carts"],
    definition: "A pending collection of items selected before checkout.",
    preferredContext: "ordering",
  },
  {
    term: "Checkout",
    aliases: ["checkout"],
    definition: "The flow that validates a cart and attempts to create an order.",
    preferredContext: "ordering",
  },
  {
    term: "Order",
    aliases: ["order", "orders"],
    definition: "A committed purchase record created after successful checkout.",
    preferredContext: "ordering",
  },
  {
    term: "Payment",
    aliases: ["payment", "payments"],
    definition: "The exchange or authorization step used to pay for an order.",
    preferredContext: "payment",
  },
  {
    term: "Shipment",
    aliases: ["shipment", "shipping", "ship"],
    definition: "The fulfillment movement of an accepted order.",
    preferredContext: "shipping",
  },
  {
    term: "Refund",
    aliases: ["refund", "refunds"],
    definition: "A reversal or return flow for a previous payment or order.",
    preferredContext: "refunds",
  },
  {
    term: "User",
    aliases: ["user", "users", "shopper", "actor", "actors"],
    definition: "A human actor interacting with the product.",
  },
];

export function draftGreenfieldDomain(input: GreenfieldDomainDraftInput): GreenfieldDomainDraft {
  const activeRequirementsContent = stripNonActiveSections(input.requirementsContent);
  const activeTechnicalSolutionContent = stripNonActiveSections(input.technicalSolutionContent);
  const activeContent = `${activeRequirementsContent}\n${activeTechnicalSolutionContent}`;
  const allContent = `${input.requirementsContent}\n${input.technicalSolutionContent}`;
  const requirementBlocks = extractRequirementBlocks(input.requirementsContent, input.requirementIds);
  const contextIds = inferContextIds({
    ...input,
    requirementsContent: activeRequirementsContent,
    technicalSolutionContent: activeTechnicalSolutionContent,
  }, requirementBlocks);
  const contexts = contextIds.map((contextId) => buildContextDraft(contextId, input, requirementBlocks));
  const terms = inferTerms(activeContent, contextIds, requirementBlocks);
  const relations = inferRelations(contextIds, activeContent);
  const contextDomains = contexts.map((context) => buildContextDomain(context, terms, requirementBlocks, allContent));

  applyRelationsToContexts(contexts, relations);

  return {
    contexts,
    relations,
    terms,
    contextDomains,
    openDecisions: [
      "Review generated bounded contexts before release baseline.",
      "Review generated domain terms before creating implementation slices.",
    ],
  };
}

function inferContextIds(input: GreenfieldDomainDraftInput, requirementBlocks: RequirementBlock[]): string[] {
  const contextIds = new Set<string>();

  for (const contextId of extractTechnicalContextCandidates(input.technicalSolutionContent)) {
    contextIds.add(contextId);
  }

  for (const requirementId of input.requirementIds) {
    const contextId = contextIdFromRequirementId(requirementId);
    if (contextId) {
      contextIds.add(contextId);
    }
  }

  for (const term of TERM_PATTERNS) {
    if (!term.preferredContext || !containsAnyRequirementBlock(requirementBlocks, term.aliases)) {
      continue;
    }
    contextIds.add(term.preferredContext);
  }

  if (contextIds.size === 0 && requirementBlocks.length > 0) {
    contextIds.add("core");
  }

  return Array.from(contextIds).filter((contextId) => !TECHNICAL_WORDS.has(contextId)).sort();
}

function extractTechnicalContextCandidates(content: string): string[] {
  const candidates = new Set<string>();
  const boundedContextMatches = content.matchAll(/\bbounded contexts?\s+(?:for|as|:)\s*([^\n.]+)/gi);

  for (const match of boundedContextMatches) {
    const segment = match[1] ?? "";
    for (const token of extractContextTokens(segment)) {
      candidates.add(token);
    }
  }

  const ownershipMatches = content.matchAll(/`?([a-z][a-z0-9-]*)`?\s+owns\s+/gi);
  for (const match of ownershipMatches) {
    const token = normalizeContextId(match[1] ?? "");
    if (token && !TECHNICAL_WORDS.has(token)) {
      candidates.add(token);
    }
  }

  return Array.from(candidates);
}

function stripNonActiveSections(content: string): string {
  const lines = content.split(/\r?\n/);
  const kept: string[] = [];
  let exclude = false;

  for (const line of lines) {
    const heading = line.match(/^#{2,6}\s+(.+?)\s*$/);
    if (heading) {
      exclude = isNonActiveHeading(heading[1] ?? "");
      if (!exclude) {
        kept.push(line);
      }
      continue;
    }

    if (!exclude) {
      kept.push(line);
    }
  }

  return kept.join("\n");
}

function isNonActiveHeading(heading: string): boolean {
  const normalized = heading
    .toLowerCase()
    .replace(/[`'"]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  return [
    "out of scope",
    "non goals",
    "not included",
    "excluded",
    "future scope",
    "future work",
    "deferred",
    "risks and open decisions",
    "risks open decisions",
    "open decisions",
  ].some((phrase) => normalized.includes(phrase));
}

function extractContextTokens(segment: string): string[] {
  const backtickTokens = Array.from(segment.matchAll(/`([^`]+)`/g)).map((match) => match[1] ?? "");
  const rawTokens = backtickTokens.length > 0
    ? backtickTokens
    : segment.split(/,|\band\b|，|、/i).map((part) => part.trim());

  return rawTokens
    .map(normalizeContextId)
    .filter((token) => token.length > 0 && !TECHNICAL_WORDS.has(token));
}

function buildContextDraft(
  contextId: string,
  input: GreenfieldDomainDraftInput,
  requirementBlocks: RequirementBlock[],
): GreenfieldContextDraft {
  const sourceRequirementIds = requirementBlocks
    .filter((block) => block.contextId === contextId)
    .map((block) => block.id);
  const sourceConfidence = input.technicalSolutionMissing ? "requirements" : "technical_solution";

  return {
    id: contextId,
    name: titleCase(contextId),
    type: contextId === "ordering" || contextId === "core" ? "core" : "supporting",
    owner: `team-${contextId}`,
    purpose: inferContextPurpose(contextId),
    upstreamContexts: [],
    downstreamContexts: [],
    sourceConfidence,
    sourceRequirementIds,
  };
}

function inferContextPurpose(contextId: string): string {
  const purposes: Record<string, string> = {
    catalog: "Own product availability, product read models, and saleability language.",
    ordering: "Own carts, checkout validation, order creation, and order lifecycle.",
    payment: "Own payment authorization, capture, and payment state language.",
    shipping: "Own shipment planning, fulfillment status, and delivery language.",
    billing: "Own invoice, billing, and financial document language.",
    identity: "Own user identity, access, and actor language.",
    auth: "Own authentication and authorization decisions.",
    refunds: "Own refund request, refund decision, and reversal language.",
    core: "Own the first core product capability inferred from requirements.",
  };

  return purposes[contextId] ?? `Own ${titleCase(contextId)} product capabilities inferred from source documents.`;
}

function inferTerms(
  content: string,
  contextIds: string[],
  requirementBlocks: RequirementBlock[],
): GreenfieldTermDraft[] {
  const terms: GreenfieldTermDraft[] = [];

  for (const pattern of TERM_PATTERNS) {
    const sourceRequirementIds = requirementBlocks
      .filter((block) => containsAny(block.text, pattern.aliases))
      .map((block) => block.id);

    if (!containsAny(content, pattern.aliases)) {
      continue;
    }
    if (pattern.preferredContext && !contextIds.includes(pattern.preferredContext) && sourceRequirementIds.length === 0) {
      continue;
    }

    const contexts = pattern.preferredContext && contextIds.includes(pattern.preferredContext)
      ? [pattern.preferredContext]
      : contextIds.length > 0
        ? [contextIds[0]]
        : ["core"];

    terms.push({
      id: `TERM-${slugifyToken(pattern.term).toUpperCase()}`,
      term: pattern.term,
      definition: pattern.definition,
      contexts,
      source: sourceRequirementIds.length > 0 ? "requirements" : "technical_solution",
      sourceRequirementIds,
    });
  }

  return terms.sort((left, right) => left.id.localeCompare(right.id));
}

function inferRelations(
  contextIds: string[],
  content: string,
): GreenfieldDomainDraft["relations"] {
  const relations: GreenfieldDomainDraft["relations"] = [];
  const lowerContent = content.toLowerCase();

  if (
    contextIds.includes("ordering") &&
    contextIds.includes("catalog") &&
    (lowerContent.includes("ordering may consume") ||
      lowerContent.includes("ordering depends") ||
      lowerContent.includes("availability"))
  ) {
    relations.push({
      id: "REL-001",
      from: "ordering",
      to: "catalog",
      relationship: "upstream-downstream",
      description: "Ordering depends on Catalog for product availability or saleability information.",
    });
  }

  return relations;
}

function applyRelationsToContexts(
  contexts: GreenfieldContextDraft[],
  relations: GreenfieldDomainDraft["relations"],
): void {
  for (const relation of relations) {
    const from = contexts.find((context) => context.id === relation.from);
    const to = contexts.find((context) => context.id === relation.to);
    if (from && !from.upstreamContexts.includes(relation.to)) {
      from.upstreamContexts.push(relation.to);
    }
    if (to && !to.downstreamContexts.includes(relation.from)) {
      to.downstreamContexts.push(relation.from);
    }
  }
}

function buildContextDomain(
  context: GreenfieldContextDraft,
  terms: GreenfieldTermDraft[],
  requirementBlocks: RequirementBlock[],
  content: string,
): GreenfieldContextDomainDraft {
  const contextTerms = terms.filter((term) => term.contexts.includes(context.id));
  const entities = buildEntities(context, contextTerms);
  const events = buildEvents(context, requirementBlocks, content);
  const invariants = buildInvariants(context, requirementBlocks);
  const valueObjects = buildValueObjects(context, contextTerms, requirementBlocks, content);

  return {
    context,
    terms: contextTerms,
    entities,
    events,
    invariants,
    valueObjects,
  };
}

function buildEntities(context: GreenfieldContextDraft, terms: GreenfieldTermDraft[]): GreenfieldEntityDraft[] {
  const entityTerms = terms.filter((term) => {
    const termName = term.term.toLowerCase();
    if (context.id === "catalog") {
      return termName === "product";
    }
    if (context.id === "ordering") {
      return termName === "cart" || termName === "order";
    }
    return term.sourceRequirementIds.length > 0 && !["availability", "price", "checkout"].includes(termName);
  });

  return entityTerms.map((term) => ({
    id: `ENT-${slugifyToken(term.term).toUpperCase()}`,
    name: term.term,
    description: `${term.term} entity inferred from ${term.sourceRequirementIds.join(", ") || "source documents"}.`,
    sourceRequirementIds: term.sourceRequirementIds,
  }));
}

function buildEvents(
  context: GreenfieldContextDraft,
  requirementBlocks: RequirementBlock[],
  content: string,
): GreenfieldEventDraft[] {
  const events: GreenfieldEventDraft[] = [];
  const contextRequirements = requirementBlocks.filter((block) => block.contextId === context.id);

  if (context.id === "ordering" && /OrderCreated|order is created|order created/i.test(content)) {
    events.push({
      id: "EVT-ORDER-CREATED",
      name: "OrderCreated",
      description: "Emitted when checkout successfully creates an order.",
      sourceRequirementIds: contextRequirements
        .filter((block) => /event|created|order/i.test(block.text))
        .map((block) => block.id),
    });
  }

  return events;
}

function buildInvariants(context: GreenfieldContextDraft, requirementBlocks: RequirementBlock[]): GreenfieldInvariantDraft[] {
  return requirementBlocks
    .filter((block) => block.contextId === context.id)
    .filter((block) => /\bmust not\b|\breject\b|\bunless\b|\bmust\b/i.test(block.text))
    .map((block, index) => ({
      id: `INV-${context.id.toUpperCase()}-${String(index + 1).padStart(3, "0")}`,
      statement: block.text.replace(/\s+/g, " ").trim(),
      sourceRequirementId: block.id,
    }));
}

function buildValueObjects(
  context: GreenfieldContextDraft,
  terms: GreenfieldTermDraft[],
  requirementBlocks: RequirementBlock[],
  content: string,
): GreenfieldValueObjectDraft[] {
  const valueObjects: GreenfieldValueObjectDraft[] = [];
  const contextRequirementIds = requirementBlocks
    .filter((block) => block.contextId === context.id)
    .map((block) => block.id);
  const termNames = new Set(terms.map((term) => term.term.toLowerCase()));

  if (context.id === "catalog" && termNames.has("price")) {
    valueObjects.push({
      id: "VO-PRICE",
      name: "Price",
      description: "Represents product price information exposed by Catalog.",
      sourceRequirementIds: contextRequirementIds,
    });
  }

  if (context.id === "ordering" && /total|calculable|money|amount/i.test(content)) {
    valueObjects.push({
      id: "VO-CART-TOTAL",
      name: "CartTotal",
      description: "Represents the calculated total for a cart before order creation.",
      sourceRequirementIds: contextRequirementIds,
    });
  }

  return valueObjects;
}

function extractRequirementBlocks(content: string, requirementIds: string[]): RequirementBlock[] {
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
    for (const id of requirementIds) {
      blocks.push({
        id,
        text: "",
        contextId: contextIdFromRequirementId(id) ?? "core",
      });
    }
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

function containsAny(content: string, aliases: string[]): boolean {
  return aliases.some((alias) => new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i").test(content));
}

function containsAnyRequirementBlock(requirementBlocks: RequirementBlock[], aliases: string[]): boolean {
  return requirementBlocks.some((block) => containsAny(block.text, aliases));
}

function normalizeContextId(value: string): string {
  return value
    .trim()
    .replace(/[`'"]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugifyToken(value: string): string {
  return normalizeContextId(value).replace(/-/g, "_");
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
