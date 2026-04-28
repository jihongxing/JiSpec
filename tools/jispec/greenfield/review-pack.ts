import * as yaml from "js-yaml";
import type { GreenfieldApiContractDraft, GreenfieldContractDraft } from "./api-contract-draft";
import type { GreenfieldBehaviorDraft, GreenfieldScenarioDraft } from "./behavior-draft";
import type { GreenfieldContextDraft, GreenfieldDomainDraft } from "./domain-draft";
import type { GreenfieldSliceDraft, GreenfieldSliceQueueDraft } from "./slice-queue";
import type { GreenfieldInputContract } from "./source-documents";

export type GreenfieldReviewDecisionType =
  | "product_framing"
  | "domain_context"
  | "contract"
  | "behavior"
  | "slice_plan"
  | "open_decision";

export type GreenfieldReviewConfidence = "high" | "medium" | "low";
export type GreenfieldReviewStatus = "proposed" | "adopted" | "rejected" | "deferred" | "waived";

export interface GreenfieldReviewEvidenceRef {
  source: "requirements" | "technical_solution" | "requirement" | "generated_asset";
  ref: string;
  excerpt?: string;
  path?: string;
  line?: number;
  paragraph_id?: string;
  checksum?: string;
}

export interface GreenfieldReviewDecision {
  decision_id: string;
  decision_type: GreenfieldReviewDecisionType;
  summary: string;
  recommended_action: string;
  confidence: GreenfieldReviewConfidence;
  evidence_refs: GreenfieldReviewEvidenceRef[];
  rejected_alternatives: string[];
  risks: string[];
  conflicts: string[];
  status: GreenfieldReviewStatus;
  blocking: boolean;
  affected_assets: string[];
}

export interface GreenfieldReviewPackDraft {
  decisions: GreenfieldReviewDecision[];
  executiveSummaryMarkdown: string;
  domainReviewMarkdown: string;
  contractReviewMarkdown: string;
  behaviorReviewMarkdown: string;
  slicePlanReviewMarkdown: string;
  openDecisionsMarkdown: string;
  reviewRecordYaml: string;
  summary: {
    total: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    blockingProposed: number;
    conflicts: number;
  };
}

export interface GreenfieldReviewPackDraftInput {
  identity: {
    id: string;
    name: string;
  };
  inputContract: GreenfieldInputContract;
  requirementsContent: string;
  technicalSolutionContent: string;
  domainDraft: GreenfieldDomainDraft;
  apiContractDraft: GreenfieldApiContractDraft;
  behaviorDraft: GreenfieldBehaviorDraft;
  sliceQueueDraft: GreenfieldSliceQueueDraft;
  generatedAt?: string;
}

const REVIEW_PACK_VERSION = 1;

export function draftGreenfieldReviewPack(input: GreenfieldReviewPackDraftInput): GreenfieldReviewPackDraft {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const decisions = [
    createProductFramingDecision(input),
    ...input.domainDraft.contexts.map((context) => createContextDecision(context, input)),
    ...createExcludedCandidateDecisions(input),
    ...input.apiContractDraft.contextContracts.flatMap((contextContract) =>
      contextContract.contracts.map((contract) => createContractDecision(contextContract.contextId, contract, input)),
    ),
    ...input.behaviorDraft.contextBehaviors.flatMap((contextBehavior) =>
      contextBehavior.scenarios.map((scenario) => createScenarioDecision(scenario, input)),
    ),
    ...input.sliceQueueDraft.slices.map((slice) => createSliceDecision(slice, input)),
    ...createOpenDecisionItems(input),
  ].sort((left, right) => left.decision_id.localeCompare(right.decision_id));
  const summary = summarizeDecisions(decisions);

  return {
    decisions,
    executiveSummaryMarkdown: renderExecutiveSummary(input, decisions, summary),
    domainReviewMarkdown: renderDomainReview(input, decisions),
    contractReviewMarkdown: renderContractReview(input, decisions),
    behaviorReviewMarkdown: renderBehaviorReview(input, decisions),
    slicePlanReviewMarkdown: renderSlicePlanReview(input, decisions),
    openDecisionsMarkdown: renderReviewOpenDecisions(input, decisions),
    reviewRecordYaml: renderReviewRecordYaml(input, decisions, generatedAt),
    summary,
  };
}

function createProductFramingDecision(input: GreenfieldReviewPackDraftInput): GreenfieldReviewDecision {
  const missingTechnicalSolution = input.inputContract.technicalSolution.status === "missing";
  return {
    decision_id: "REV-FRAMING-001",
    decision_type: "product_framing",
    summary: `Initialize ${input.identity.name} from ${input.inputContract.mode} source documents.`,
    recommended_action: missingTechnicalSolution
      ? "Review product framing and provide a technical solution before implementation starts."
      : "Review product framing against the PRD and technical solution before implementation starts.",
    confidence: missingTechnicalSolution ? "medium" : "high",
    evidence_refs: [
      { source: "requirements", ref: "docs/input/requirements.md", excerpt: firstHeading(input.requirementsContent) },
      { source: "technical_solution", ref: "docs/input/technical-solution.md", excerpt: firstHeading(input.technicalSolutionContent) },
    ],
    rejected_alternatives: [
      "Start implementation from a one-line product idea without a PRD.",
      "Treat generated assets as final architecture without human review.",
    ],
    risks: missingTechnicalSolution
      ? ["Architecture assumptions are weaker because no technical solution was provided."]
      : ["Product framing can still be wrong if source documents are stale or incomplete."],
    conflicts: detectDecisionConflicts(input.requirementsContent, input.technicalSolutionContent),
    status: "proposed",
    blocking: missingTechnicalSolution,
    affected_assets: [
      "jiproject/project.yaml",
      ".spec/greenfield/initialization-summary.md",
    ],
  };
}

function createContextDecision(
  context: GreenfieldContextDraft,
  input: GreenfieldReviewPackDraftInput,
): GreenfieldReviewDecision {
  const confidence = confidenceFromSource(context.sourceConfidence, context.sourceRequirementIds);
  const sourceRefs = context.sourceRequirementIds.length > 0
    ? context.sourceRequirementIds.map((requirementId) => requirementEvidence(requirementId, input))
    : [{ source: context.sourceConfidence === "technical_solution" ? "technical_solution" : "requirements", ref: "inferred-context" } satisfies GreenfieldReviewEvidenceRef];

  return {
    decision_id: `REV-DOMAIN-${context.id.toUpperCase()}`,
    decision_type: "domain_context",
    summary: `Create ${context.name} as a ${context.type} bounded context.`,
    recommended_action: `Review whether ${context.name} owns the described language and data boundary.`,
    confidence,
    evidence_refs: sourceRefs,
    rejected_alternatives: [
      `Model ${context.name} as a technical module instead of a bounded context.`,
      "Merge all Greenfield capabilities into a single generic application context.",
    ],
    risks: [
      context.sourceRequirementIds.length === 0
        ? "No requirement ID directly supports this context; review before assigning implementation work."
        : "Context boundary may need revision as implementation learns more domain detail.",
    ],
    conflicts: [],
    status: "proposed",
    blocking: confidence === "low",
    affected_assets: [
      "jiproject/context-map.yaml",
      `contexts/${context.id}/context.yaml`,
    ],
  };
}

function createExcludedCandidateDecisions(input: GreenfieldReviewPackDraftInput): GreenfieldReviewDecision[] {
  return inferExcludedCandidates(input.requirementsContent, input.technicalSolutionContent)
    .filter((candidate) => !input.domainDraft.contexts.some((context) => context.id === candidate))
    .map((candidate) => ({
      decision_id: `REV-DOMAIN-EXCLUDED-${candidate.toUpperCase()}`,
      decision_type: "domain_context",
      summary: `Exclude ${titleCase(candidate)} from the initial bounded context map.`,
      recommended_action: `Confirm ${titleCase(candidate)} is truly outside the first implementation baseline.`,
      confidence: "medium",
      evidence_refs: [
        { source: "requirements", ref: "out-of-scope-or-deferred-section" },
        { source: "technical_solution", ref: "risks-or-open-decisions-section" },
      ],
      rejected_alternatives: [
        `Create a first-day ${titleCase(candidate)} bounded context.`,
      ],
      risks: [
        "A deferred capability can become hidden scope if later requirements depend on it without a Spec Delta.",
      ],
      conflicts: [],
      status: "proposed",
      blocking: false,
      affected_assets: [
        "jiproject/context-map.yaml",
        ".spec/greenfield/open-decisions.md",
      ],
    }));
}

function createContractDecision(
  contextId: string,
  contract: GreenfieldContractDraft,
  input: GreenfieldReviewPackDraftInput,
): GreenfieldReviewDecision {
  const confidence = confidenceFromSource(contract.sourceConfidence, contract.sourceRequirementIds);
  return {
    decision_id: `REV-CONTRACT-${contract.id}`,
    decision_type: "contract",
    summary: `Draft ${contract.name} as a ${contract.direction} contract for ${titleCase(contextId)}.`,
    recommended_action: "Review whether this contract carries product intent and has enough fields for the first slice.",
    confidence,
    evidence_refs: contract.sourceRequirementIds.length > 0
      ? contract.sourceRequirementIds.map((requirementId) => requirementEvidence(requirementId, input))
      : [{ source: "generated_asset", ref: `contexts/${contextId}/design/contracts.yaml` }],
    rejected_alternatives: [
      "Expose only generic CRUD endpoints without behavior trace.",
      "Start implementation without a contract draft.",
    ],
    risks: contract.openQuestions,
    conflicts: [],
    status: "proposed",
    blocking: confidence === "low",
    affected_assets: [
      `contexts/${contextId}/design/contracts.yaml`,
    ],
  };
}

function createScenarioDecision(
  scenario: GreenfieldScenarioDraft,
  input: GreenfieldReviewPackDraftInput,
): GreenfieldReviewDecision {
  return {
    decision_id: `REV-BEHAVIOR-${scenario.id}`,
    decision_type: "behavior",
    summary: `Use ${scenario.id} to prove: ${scenario.scenario}.`,
    recommended_action: "Review whether the scenario expresses a real acceptance behavior and not only a generated happy path.",
    confidence: scenario.sourceConfidence === "requirements" ? "high" : "low",
    evidence_refs: scenario.requirementIds.length > 0
      ? scenario.requirementIds.map((requirementId) => requirementEvidence(requirementId, input))
      : [{ source: "generated_asset", ref: `contexts/${scenario.contextId}/behavior/scenarios/${scenario.id}.feature` }],
    rejected_alternatives: [
      "Treat unit tests alone as acceptance evidence.",
      "Defer behavior scenarios until after implementation.",
    ],
    risks: scenario.requirementIds.length === 0
      ? ["Scenario has no direct requirement trace."]
      : [],
    conflicts: [],
    status: "proposed",
    blocking: scenario.sourceConfidence !== "requirements",
    affected_assets: [
      `contexts/${scenario.contextId}/behavior/scenarios/${scenario.id}.feature`,
    ],
  };
}

function createSliceDecision(
  slice: GreenfieldSliceDraft,
  input: GreenfieldReviewPackDraftInput,
): GreenfieldReviewDecision {
  return {
    decision_id: `REV-SLICE-${slice.id.toUpperCase()}`,
    decision_type: "slice_plan",
    summary: `Use ${slice.title} as an initial ${slice.priority} implementation slice.`,
    recommended_action: "Review whether the slice is thin, valuable, and correctly ordered before AI implementation starts.",
    confidence: slice.requirementIds.length > 0 && slice.scenarioIds.length > 0 ? "medium" : "low",
    evidence_refs: [
      ...slice.requirementIds.map((requirementId) => requirementEvidence(requirementId, input)),
      ...slice.scenarioIds.map((scenarioId) => ({ source: "generated_asset" as const, ref: `scenario:${scenarioId}` })),
    ],
    rejected_alternatives: [
      "Start with a broad platform foundation slice that delivers no user behavior.",
      "Let each implementation agent choose its own first slice.",
    ],
    risks: slice.dependencies.length > 0
      ? [`Depends on ${slice.dependencies.map((dependency) => dependency.slice_id).join(", ")}.`]
      : [],
    conflicts: [],
    status: "proposed",
    blocking: slice.requirementIds.length === 0 || slice.scenarioIds.length === 0,
    affected_assets: [
      `contexts/${slice.contextId}/slices/${slice.id}/slice.yaml`,
      `contexts/${slice.contextId}/slices/${slice.id}/tasks.yaml`,
    ],
  };
}

function createOpenDecisionItems(input: GreenfieldReviewPackDraftInput): GreenfieldReviewDecision[] {
  const decisions = [
    ...input.inputContract.openDecisions.map((summary) => ({
      summary,
      source: "source_documents",
      blocking: input.inputContract.technicalSolution.status === "missing",
    })),
    ...input.apiContractDraft.openQuestions.map((summary) => ({
      summary,
      source: "contracts",
      blocking: false,
    })),
    ...input.behaviorDraft.openDecisions.map((summary) => ({
      summary,
      source: "behavior",
      blocking: false,
    })),
    ...input.sliceQueueDraft.openDecisions.map((summary) => ({
      summary,
      source: "slices",
      blocking: false,
    })),
  ];

  return uniqueBy(decisions, (decision) => `${decision.source}:${decision.summary}`)
    .map((decision, index) => ({
      decision_id: `REV-OPEN-${String(index + 1).padStart(3, "0")}`,
      decision_type: "open_decision",
      summary: decision.summary,
      recommended_action: decision.blocking
        ? "Close this decision or explicitly defer it before implementation starts."
        : "Review and either close, defer, or keep this advisory decision visible.",
      confidence: decision.blocking ? "low" : "medium",
      evidence_refs: [{ source: "generated_asset", ref: decision.source }],
      rejected_alternatives: [
        "Let this decision remain implicit in generated files.",
      ],
      risks: [
        "Unresolved decisions can cause implementation agents to optimize for the wrong boundary.",
      ],
      conflicts: [],
      status: "proposed",
      blocking: decision.blocking,
      affected_assets: [
        ".spec/greenfield/open-decisions.md",
        ".spec/greenfield/review-pack/open-decisions.md",
      ],
    }));
}

function renderExecutiveSummary(
  input: GreenfieldReviewPackDraftInput,
  decisions: GreenfieldReviewDecision[],
  summary: GreenfieldReviewPackDraft["summary"],
): string {
  return [
    `# ${input.identity.name} Initialization Review Pack`,
    "",
    "## Review Status",
    "",
    `- Decisions: ${summary.total}`,
    `- High confidence: ${summary.highConfidence}`,
    `- Medium confidence: ${summary.mediumConfidence}`,
    `- Low confidence: ${summary.lowConfidence}`,
    `- Proposed blocking items: ${summary.blockingProposed}`,
    `- Decision conflicts: ${summary.conflicts}`,
    "",
    "## Product Framing",
    "",
    `- Input mode: \`${input.inputContract.mode}\``,
    `- Requirements status: \`${input.inputContract.requirements.status}\``,
    `- Technical solution status: \`${input.inputContract.technicalSolution.status}\``,
    "",
    "## Human Review Gate",
    "",
    "- Review generated domain, contract, behavior, and slice decisions before implementation starts.",
    "- Mark blocking low-confidence or conflict items as adopted, rejected, deferred, or waived in `review-record.yaml`.",
    "- Rejected decisions should trigger regeneration or a correction delta before AI implementation handoff.",
    "",
    "## Decision Inventory",
    "",
    ...decisions.map((decision) => renderDecisionBullet(decision)),
    "",
  ].join("\n");
}

function renderDomainReview(
  input: GreenfieldReviewPackDraftInput,
  decisions: GreenfieldReviewDecision[],
): string {
  const domainDecisions = decisions.filter((decision) => decision.decision_type === "domain_context");
  return [
    `# ${input.identity.name} Domain Review`,
    "",
    "## Bounded Context Decisions",
    "",
    ...domainDecisions.flatMap(renderDecisionSection),
  ].join("\n");
}

function renderContractReview(
  input: GreenfieldReviewPackDraftInput,
  decisions: GreenfieldReviewDecision[],
): string {
  return [
    `# ${input.identity.name} Contract Review`,
    "",
    "## Contract Decisions",
    "",
    ...decisions.filter((decision) => decision.decision_type === "contract").flatMap(renderDecisionSection),
  ].join("\n");
}

function renderBehaviorReview(
  input: GreenfieldReviewPackDraftInput,
  decisions: GreenfieldReviewDecision[],
): string {
  return [
    `# ${input.identity.name} Behavior Review`,
    "",
    "## Scenario Decisions",
    "",
    ...decisions.filter((decision) => decision.decision_type === "behavior").flatMap(renderDecisionSection),
  ].join("\n");
}

function renderSlicePlanReview(
  input: GreenfieldReviewPackDraftInput,
  decisions: GreenfieldReviewDecision[],
): string {
  return [
    `# ${input.identity.name} Slice Plan Review`,
    "",
    "## Slice Decisions",
    "",
    ...decisions.filter((decision) => decision.decision_type === "slice_plan").flatMap(renderDecisionSection),
  ].join("\n");
}

function renderReviewOpenDecisions(
  input: GreenfieldReviewPackDraftInput,
  decisions: GreenfieldReviewDecision[],
): string {
  const openDecisions = decisions.filter((decision) =>
    decision.decision_type === "open_decision" ||
    decision.conflicts.length > 0 ||
    decision.confidence === "low" ||
    decision.blocking,
  );

  return [
    `# ${input.identity.name} Review Open Decisions`,
    "",
    ...(openDecisions.length > 0
      ? openDecisions.flatMap(renderDecisionSection)
      : ["No blocking or low-confidence review decisions were generated.", ""]),
  ].join("\n");
}

function renderReviewRecordYaml(
  input: GreenfieldReviewPackDraftInput,
  decisions: GreenfieldReviewDecision[],
  generatedAt: string,
): string {
  return dumpYaml({
    review_pack_version: REVIEW_PACK_VERSION,
    project_id: input.identity.id,
    project_name: input.identity.name,
    generated_at: generatedAt,
    gate: {
      status: "pending_human_review",
      policy_hint: "Blocking review items, low-confidence proposed items, conflicts, and rejected decisions prevent implementation.",
    },
    decisions,
  });
}

function renderDecisionSection(decision: GreenfieldReviewDecision): string[] {
  return [
    `### ${decision.decision_id}`,
    "",
    decision.summary,
    "",
    `- Type: \`${decision.decision_type}\``,
    `- Status: \`${decision.status}\``,
    `- Confidence: \`${decision.confidence}\``,
    `- Blocking: \`${decision.blocking}\``,
    `- Recommended action: ${decision.recommended_action}`,
    `- Evidence: ${renderEvidenceRefs(decision.evidence_refs)}`,
    `- Affected assets: ${decision.affected_assets.map((asset) => `\`${asset}\``).join(", ") || "none"}`,
    "",
    "Rejected alternatives:",
    ...renderList(decision.rejected_alternatives),
    "",
    "Risks:",
    ...renderList(decision.risks),
    "",
    "Conflicts:",
    ...renderList(decision.conflicts),
    "",
  ];
}

function renderDecisionBullet(decision: GreenfieldReviewDecision): string {
  const marker = decision.blocking ? "blocking" : "review";
  return `- \`${decision.decision_id}\` [${marker}, ${decision.confidence}, ${decision.status}]: ${decision.summary}`;
}

function renderEvidenceRefs(refs: GreenfieldReviewEvidenceRef[]): string {
  if (refs.length === 0) {
    return "none";
  }

  return refs.map((ref) => {
    const location = ref.path ? ` ${ref.path}${ref.line ? `:${ref.line}` : ""}` : "";
    const paragraph = ref.paragraph_id ? `#${ref.paragraph_id}` : "";
    const excerpt = ref.excerpt ? ` (${ref.excerpt.replace(/\s+/g, " ").slice(0, 96)})` : "";
    return `\`${ref.source}:${ref.ref}${paragraph}\`${location}${excerpt}`;
  }).join(", ");
}

function renderList(items: string[]): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : ["- None recorded."];
}

function summarizeDecisions(decisions: GreenfieldReviewDecision[]): GreenfieldReviewPackDraft["summary"] {
  return {
    total: decisions.length,
    highConfidence: decisions.filter((decision) => decision.confidence === "high").length,
    mediumConfidence: decisions.filter((decision) => decision.confidence === "medium").length,
    lowConfidence: decisions.filter((decision) => decision.confidence === "low").length,
    blockingProposed: decisions.filter((decision) => decision.status === "proposed" && decision.blocking).length,
    conflicts: decisions.reduce((count, decision) => count + decision.conflicts.length, 0),
  };
}

function confidenceFromSource(
  sourceConfidence: "requirements" | "technical_solution" | "inferred",
  requirementIds: string[],
): GreenfieldReviewConfidence {
  if (sourceConfidence === "inferred") {
    return "low";
  }
  if (sourceConfidence === "technical_solution" && requirementIds.length === 0) {
    return "medium";
  }
  return "high";
}

function requirementEvidence(
  requirementId: string,
  input: GreenfieldReviewPackDraftInput,
): GreenfieldReviewEvidenceRef {
  const anchor = input.inputContract.requirements.anchors?.find((entry) =>
    entry.kind === "requirement" && entry.id === requirementId,
  );
  return {
    source: "requirement",
    ref: requirementId,
    excerpt: anchor?.excerpt,
    path: anchor ? "docs/input/requirements.md" : undefined,
    line: anchor?.line,
    paragraph_id: anchor?.paragraphId,
    checksum: anchor?.checksum,
  };
}

function detectDecisionConflicts(requirementsContent: string, technicalSolutionContent: string): string[] {
  const conflicts: string[] = [];
  if (/\b(low latency|fast|real[-\s]?time|synchronous)\b/i.test(requirementsContent) &&
    /\b(high latency|batch|eventual|async only|asynchronous only)\b/i.test(technicalSolutionContent)) {
    conflicts.push("Requirements imply low-latency or synchronous behavior, while the technical solution describes high-latency, batch, or async-only behavior.");
  }
  if (/\b(compliance|privacy|pii|personal data|gdpr)\b/i.test(requirementsContent) &&
    /\b(shared database|direct table sharing|shared tables)\b/i.test(technicalSolutionContent)) {
    conflicts.push("Requirements mention compliance or privacy constraints, while the technical solution suggests shared data storage.");
  }
  return conflicts;
}

function inferExcludedCandidates(requirementsContent: string, technicalSolutionContent: string): string[] {
  const inactiveContent = extractInactiveSections(`${requirementsContent}\n${technicalSolutionContent}`);
  const candidates = [
    { id: "payment", aliases: ["payment", "payments"] },
    { id: "refunds", aliases: ["refund", "refunds"] },
    { id: "shipping", aliases: ["shipping", "shipment", "shipments"] },
    { id: "billing", aliases: ["billing", "invoice", "invoices"] },
  ];

  return candidates
    .filter((candidate) => candidate.aliases.some((alias) => new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i").test(inactiveContent)))
    .map((candidate) => candidate.id);
}

function extractInactiveSections(content: string): string {
  const lines = content.split(/\r?\n/);
  const inactive: string[] = [];
  let capture = false;

  for (const line of lines) {
    const heading = line.match(/^#{2,6}\s+(.+?)\s*$/);
    if (heading) {
      capture = isInactiveHeading(heading[1] ?? "");
      continue;
    }
    if (capture) {
      inactive.push(line);
    }
  }

  return inactive.join("\n");
}

function isInactiveHeading(heading: string): boolean {
  const normalized = heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  return [
    "out of scope",
    "non goals",
    "future scope",
    "future work",
    "deferred",
    "risks and open decisions",
    "open decisions",
  ].some((phrase) => normalized.includes(phrase));
}

function firstHeading(content: string): string | undefined {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "))
    ?.replace(/^#+\s*/, "");
}

function titleCase(value: string): string {
  return value
    .replace(/[-_.]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function uniqueBy<T>(values: T[], keyOf: (value: T) => string): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const value of values) {
    const key = keyOf(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(value);
  }
  return unique;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dumpYaml(value: unknown): string {
  return yaml.dump(value, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
}
