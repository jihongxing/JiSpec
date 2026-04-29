import type { GreenfieldAiImplementHandoff } from "./ai-implement-handoff";
import type { GreenfieldReviewPackDraft } from "./review-pack";
import type { GreenfieldSliceDraft, GreenfieldSliceQueueDraft } from "./slice-queue";

export interface GreenfieldChangeMainlineHandoff {
  schema_version: 1;
  handoff_kind: "greenfield-change-mainline-handoff";
  generated_at: string;
  status: "ready" | "blocked";
  source: {
    review_record_path: string;
    ai_implement_handoff_path: string;
    baseline_path: string;
  };
  first_slice?: GreenfieldChangeSliceHandoff;
  slice_queue: GreenfieldChangeSliceHandoff[];
  review_gate: {
    blocking_review_decision_ids: string[];
    open_decision_count: number;
  };
  change_intent?: {
    summary: string;
    change_type: "add";
    mode: "prompt";
    context_id: string;
    slice_id: string;
  };
  next_commands: string[];
  notes: string[];
}

export interface GreenfieldChangeSliceHandoff {
  slice_id: string;
  context_id: string;
  title: string;
  priority: GreenfieldSliceDraft["priority"];
  goal: string;
  requirement_ids: string[];
  contract_ids: string[];
  scenario_ids: string[];
  test_ids: string[];
  dependencies: GreenfieldSliceDraft["dependencies"];
}

export function buildGreenfieldChangeMainlineHandoff(input: {
  sliceQueueDraft: GreenfieldSliceQueueDraft;
  reviewPackDraft: GreenfieldReviewPackDraft;
  aiImplementHandoff: GreenfieldAiImplementHandoff;
  generatedAt?: string;
}): GreenfieldChangeMainlineHandoff {
  const sliceQueue = input.sliceQueueDraft.slices.map(sliceToHandoff);
  const firstSlice = input.aiImplementHandoff.firstSliceId
    ? sliceQueue.find((slice) => slice.slice_id === input.aiImplementHandoff.firstSliceId)
    : sliceQueue[0];
  const blockingReviewDecisionIds = input.aiImplementHandoff.blockingReviewDecisionIds;
  const status = firstSlice && blockingReviewDecisionIds.length === 0 ? "ready" : "blocked";
  const changeIntent = firstSlice
    ? {
        summary: `Implement first Greenfield slice: ${firstSlice.slice_id}`,
        change_type: "add" as const,
        mode: "prompt" as const,
        context_id: firstSlice.context_id,
        slice_id: firstSlice.slice_id,
      }
    : undefined;

  return {
    schema_version: 1,
    handoff_kind: "greenfield-change-mainline-handoff",
    generated_at: input.generatedAt ?? new Date().toISOString(),
    status,
    source: {
      review_record_path: ".spec/greenfield/review-pack/review-record.yaml",
      ai_implement_handoff_path: ".spec/greenfield/ai-implement-handoff.md",
      baseline_path: ".spec/baselines/current.yaml",
    },
    first_slice: firstSlice,
    slice_queue: sliceQueue,
    review_gate: {
      blocking_review_decision_ids: blockingReviewDecisionIds,
      open_decision_count: input.reviewPackDraft.decisions.filter((decision) => decision.status === "proposed").length,
    },
    change_intent: changeIntent,
    next_commands: changeIntent
      ? [
          "jispec-cli verify --root . --policy .spec/policy.yaml",
          `jispec-cli change "${changeIntent.summary}" --root . --slice ${changeIntent.slice_id} --context ${changeIntent.context_id} --change-type add --mode prompt`,
          "jispec-cli implement",
          "jispec-cli verify --root . --policy .spec/policy.yaml",
        ]
      : [
          "jispec-cli verify --root . --policy .spec/policy.yaml",
          "Review .spec/greenfield/review-pack/review-record.yaml before creating a change session.",
        ],
    notes: [
      "This handoff only prepares a traceable change session for an external implementer.",
      "JiSpec mediates scope, artifacts, tests, and verify; it does not implement business code.",
      "Review or resolve blocking review decisions before implementation mediation.",
    ],
  };
}

export function renderGreenfieldChangeMainlineHandoffMarkdown(handoff: GreenfieldChangeMainlineHandoff): string {
  return [
    "# Greenfield Change Mainline Handoff",
    "",
    `Status: \`${handoff.status}\``,
    `Generated at: \`${handoff.generated_at}\``,
    "",
    "## First Slice",
    "",
    ...(handoff.first_slice
      ? [
          `- Slice: \`${handoff.first_slice.slice_id}\``,
          `- Context: \`${handoff.first_slice.context_id}\``,
          `- Goal: ${handoff.first_slice.goal}`,
          `- Requirements: ${renderInlineIds(handoff.first_slice.requirement_ids)}`,
          `- Contracts: ${renderInlineIds(handoff.first_slice.contract_ids)}`,
          `- Scenarios: ${renderInlineIds(handoff.first_slice.scenario_ids)}`,
          `- Tests: ${renderInlineIds(handoff.first_slice.test_ids)}`,
        ]
      : ["- No first slice is available."]),
    "",
    "## Review Gate",
    "",
    `- Open proposed decisions: ${handoff.review_gate.open_decision_count}`,
    `- Blocking review decisions: ${renderInlineIds(handoff.review_gate.blocking_review_decision_ids)}`,
    "",
    "## Change Intent",
    "",
    ...(handoff.change_intent
      ? [
          `- Summary: ${handoff.change_intent.summary}`,
          `- Change type: \`${handoff.change_intent.change_type}\``,
          `- Mode: \`${handoff.change_intent.mode}\``,
        ]
      : ["- Change intent is blocked until a first slice exists."]),
    "",
    "## Next Commands",
    "",
    "```bash",
    ...handoff.next_commands,
    "```",
    "",
    "## Notes",
    "",
    ...handoff.notes.map((note) => `- ${note}`),
    "",
  ].join("\n");
}

function sliceToHandoff(slice: GreenfieldSliceDraft): GreenfieldChangeSliceHandoff {
  return {
    slice_id: slice.id,
    context_id: slice.contextId,
    title: slice.title,
    priority: slice.priority,
    goal: slice.goal,
    requirement_ids: slice.requirementIds,
    contract_ids: slice.contractIds,
    scenario_ids: slice.scenarioIds,
    test_ids: slice.testIds,
    dependencies: slice.dependencies,
  };
}

function renderInlineIds(values: string[]): string {
  return values.length > 0 ? values.map((value) => `\`${value}\``).join(", ") : "none";
}
