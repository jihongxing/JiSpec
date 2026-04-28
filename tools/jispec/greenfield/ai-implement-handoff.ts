import type { GreenfieldApiContractDraft } from "./api-contract-draft";
import type { ContractGraph } from "./contract-graph";
import type { GreenfieldEvidenceGraph } from "./evidence-graph";
import type { GreenfieldReviewPackDraft } from "./review-pack";
import type { GreenfieldSliceDraft, GreenfieldSliceQueueDraft } from "./slice-queue";

export interface GreenfieldAiImplementHandoffInput {
  identity: {
    id: string;
    name: string;
  };
  apiContractDraft: GreenfieldApiContractDraft;
  sliceQueueDraft: GreenfieldSliceQueueDraft;
  evidenceGraph: GreenfieldEvidenceGraph;
  contractGraph: ContractGraph;
  reviewPackDraft: GreenfieldReviewPackDraft;
}

export interface GreenfieldAiImplementHandoff {
  markdown: string;
  firstSliceId?: string;
  dirtySubgraphNodeIds: string[];
  contractIds: string[];
  scenarioIds: string[];
  testIds: string[];
  blockingReviewDecisionIds: string[];
}

export function draftGreenfieldAiImplementHandoff(
  input: GreenfieldAiImplementHandoffInput,
): GreenfieldAiImplementHandoff {
  const firstSlice = input.sliceQueueDraft.slices[0];
  const blockingReviewDecisionIds = input.reviewPackDraft.decisions
    .filter((decision) =>
      decision.status === "proposed" &&
      (decision.blocking || decision.confidence === "low" || decision.conflicts.length > 0),
    )
    .map((decision) => decision.decision_id)
    .sort((left, right) => left.localeCompare(right));
  const dirtySubgraphNodeIds = firstSlice ? buildDirtySubgraphNodeIds(input.contractGraph, firstSlice) : [];
  const markdown = firstSlice
    ? renderSliceHandoff(input, firstSlice, dirtySubgraphNodeIds, blockingReviewDecisionIds)
    : renderEmptyHandoff(input, blockingReviewDecisionIds);

  return {
    markdown,
    firstSliceId: firstSlice?.id,
    dirtySubgraphNodeIds,
    contractIds: firstSlice?.contractIds ?? [],
    scenarioIds: firstSlice?.scenarioIds ?? [],
    testIds: firstSlice?.testIds ?? [],
    blockingReviewDecisionIds,
  };
}

function renderSliceHandoff(
  input: GreenfieldAiImplementHandoffInput,
  slice: GreenfieldSliceDraft,
  dirtySubgraphNodeIds: string[],
  blockingReviewDecisionIds: string[],
): string {
  const contracts = input.apiContractDraft.contextContracts
    .find((contextContract) => contextContract.contextId === slice.contextId)
    ?.contracts.filter((contract) => slice.contractIds.includes(contract.id)) ?? [];

  return [
    `# ${input.identity.name} AI Implement Handoff`,
    "",
    "## Gate Status",
    "",
    ...(blockingReviewDecisionIds.length > 0
      ? [
          "Do not start implementation until these review decisions are adopted, rejected into correction, deferred, or waived:",
          "",
          ...blockingReviewDecisionIds.map((decisionId) => `- \`${decisionId}\``),
        ]
      : ["Review gate has no blocking or low-confidence proposed decisions for the first handoff."]),
    "",
    "## Target Slice",
    "",
    `- Slice: \`${slice.id}\``,
    `- Context: \`${slice.contextId}\``,
    `- Goal: ${slice.goal}`,
    `- Priority: \`${slice.priority}\``,
    "",
    "## Scope",
    "",
    ...slice.includes.map((item) => `- Include: ${item}`),
    ...slice.excludes.map((item) => `- Non-goal: ${item}`),
    "",
    "## Requirement And Behavior Focus",
    "",
    ...slice.requirementIds.map((requirementId) => `- Requirement: \`${requirementId}\``),
    ...slice.scenarioIds.map((scenarioId) => `- Scenario: \`${scenarioId}\``),
    ...slice.testIds.map((testId) => `- Test focus: \`${testId}\``),
    "",
    "## Contract Focus",
    "",
    ...(contracts.length > 0
      ? contracts.flatMap((contract) => [
          `- \`${contract.id}\` ${contract.name} (${contract.direction})`,
          `  Fields: ${contract.fields.map((field) => `${field.name}:${field.type}${field.required ? "!" : ""}`).join(", ") || "none"}`,
        ])
      : ["- No contract focus generated for this slice."]),
    "",
    "## Dirty Subgraph",
    "",
    "Use this repo-local deterministic subgraph as the implementation context budget:",
    "",
    ...dirtySubgraphNodeIds.map((nodeId) => `- \`${nodeId}\``),
    "",
    "## Required Files",
    "",
    `- \`contexts/${slice.contextId}/slices/${slice.id}/requirements.md\``,
    `- \`contexts/${slice.contextId}/slices/${slice.id}/design.md\``,
    `- \`contexts/${slice.contextId}/slices/${slice.id}/tasks.yaml\``,
    `- \`contexts/${slice.contextId}/slices/${slice.id}/test-spec.yaml\``,
    `- \`contexts/${slice.contextId}/slices/${slice.id}/trace.yaml\``,
    `- \`contexts/${slice.contextId}/design/contracts.yaml\``,
    "",
    "## Verify",
    "",
    "```bash",
    "jispec-cli verify --root . --policy .spec/policy.yaml",
    "```",
    "",
  ].join("\n");
}

function renderEmptyHandoff(
  input: GreenfieldAiImplementHandoffInput,
  blockingReviewDecisionIds: string[],
): string {
  return [
    `# ${input.identity.name} AI Implement Handoff`,
    "",
    "No initial implementation slice was generated.",
    "",
    "## Review Gate",
    "",
    ...(blockingReviewDecisionIds.length > 0
      ? blockingReviewDecisionIds.map((decisionId) => `- \`${decisionId}\``)
      : ["- No blocking review decisions recorded."]),
    "",
  ].join("\n");
}

function buildDirtySubgraphNodeIds(graph: ContractGraph, slice: GreenfieldSliceDraft): string[] {
  const seedIds = [
    ...slice.requirementIds.map((requirementId) => `@req:${requirementId}`),
    ...slice.contractIds.map((contractId) => `@api:${contractId}`),
    ...slice.scenarioIds.map((scenarioId) => `@bdd:${scenarioId}`),
    `@slice:${slice.id}`,
    ...slice.testIds.map((testId) => `@test:${testId}`),
  ];
  const selected = new Set(seedIds);

  for (const edge of graph.edges) {
    if (selected.has(edge.from) || selected.has(edge.to)) {
      selected.add(edge.from);
      selected.add(edge.to);
    }
  }

  return Array.from(selected)
    .filter((nodeId) => graph.nodes.some((node) => node.id === nodeId))
    .sort((left, right) => left.localeCompare(right));
}
