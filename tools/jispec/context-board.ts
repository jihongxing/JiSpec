import path from "node:path";
import { readTasksFile, summarizeTasks } from "./tasks";
import { buildContextShowReport } from "./context-report";
import { LIFECYCLE_ORDER } from "./validator";

type ExecutionLane =
  | "blocked"
  | "in_progress"
  | "ready_to_start"
  | "queued"
  | "completed_waiting"
  | "ready_to_advance"
  | "unplanned";

interface ContextBoardCard {
  sliceId: string;
  title: string;
  priority: string;
  state: string;
  nextState: string | null;
  readyForNextState: boolean;
  validationIssueCount: number;
  taskCount: number;
  completedTaskCount: number;
  activeTaskCount: number;
  blockedTaskCount: number;
  pendingTaskCount: number;
  actionableTaskCount: number;
  waitingTaskCount: number;
  executionLane: ExecutionLane;
  nextActionableTaskIds: string[];
  nextActionableTaskTitles: string[];
}

interface ContextBoardColumn {
  key: string;
  label: string;
  cards: ContextBoardCard[];
}

export class ContextBoardReport {
  constructor(
    public readonly root: string,
    public readonly contextId: string,
    public readonly columns: ContextBoardColumn[],
    public readonly lifecycleColumns: ContextBoardColumn[],
    public readonly priorityCounts: Record<string, number>,
  ) {}

  toDict(): Record<string, unknown> {
    return {
      root: this.root,
      context_id: this.contextId,
      slice_count: this.columns.reduce((sum, column) => sum + column.cards.length, 0),
      priority_counts: this.priorityCounts,
      columns: this.columns.map((column) => ({
        key: column.key,
        label: column.label,
        count: column.cards.length,
        slice_ids: column.cards.map((card) => card.sliceId),
        cards: column.cards,
      })),
      lifecycle_columns: this.lifecycleColumns.map((column) => ({
        key: column.key,
        label: column.label,
        count: column.cards.length,
        slice_ids: column.cards.map((card) => card.sliceId),
        cards: column.cards,
      })),
    };
  }

  renderText(): string {
    const totalSlices = this.columns.reduce((sum, column) => sum + column.cards.length, 0);
    const blockedSlices = this.columns.find((column) => column.key === "blocked")?.cards.length ?? 0;
    const activeSlices = this.columns.find((column) => column.key === "in_progress")?.cards.length ?? 0;
    const readySlices = this.columns.find((column) => column.key === "ready_to_start")?.cards.length ?? 0;
    const advanceSlices = this.columns.find((column) => column.key === "ready_to_advance")?.cards.length ?? 0;

    const lines = [
      `Context board for \`${this.contextId}\``,
      `Slices: ${totalSlices}`,
      `Active: ${activeSlices}`,
      `Ready to start: ${readySlices}`,
      `Ready to advance: ${advanceSlices}`,
      `Blocked: ${blockedSlices}`,
    ];

    const priorityMix = formatPriorityCounts(this.priorityCounts);
    if (priorityMix) {
      lines.push(`Priority mix: ${priorityMix}`);
    }

    for (const column of this.columns) {
      lines.push(`${column.label} (${column.cards.length})`);
      if (column.cards.length === 0) {
        lines.push("- none");
        continue;
      }

      lines.push(
        ...column.cards.map((card) => {
          const nextAction =
            card.nextActionableTaskTitles.length > 0
              ? card.nextActionableTaskTitles.join("; ")
              : card.readyForNextState
                ? `Advance to ${card.nextState ?? "final"}`
                : "Waiting on upstream work";
          return `- ${card.sliceId} | priority=${card.priority} | state=${card.state} | tasks=${card.completedTaskCount}/${card.taskCount} done | active=${card.activeTaskCount} | blocked=${card.blockedTaskCount} | actionable=${card.actionableTaskCount} | issues=${card.validationIssueCount} | next=${nextAction}`;
        }),
      );
    }

    return lines.join("\n");
  }
}

export function buildContextBoardReport(root: string, contextId: string): ContextBoardReport {
  const report = buildContextShowReport(root, contextId);
  const cards = report.sliceEntries.map((entry) => {
    const taskSummary = loadTaskSummary(root, entry.contextId, entry.sliceId);
    return {
      sliceId: entry.sliceId,
      title: entry.title,
      priority: entry.priority,
      state: entry.state,
      nextState: entry.nextState,
      readyForNextState: entry.readyForNextState,
      validationIssueCount: entry.validationIssueCount,
      taskCount: taskSummary.taskCount,
      completedTaskCount: taskSummary.completedTaskCount,
      activeTaskCount: taskSummary.activeTaskCount,
      blockedTaskCount: taskSummary.blockedTaskCount,
      pendingTaskCount: taskSummary.pendingTaskCount,
      actionableTaskCount: taskSummary.actionableTaskCount,
      waitingTaskCount: taskSummary.waitingTaskCount,
      executionLane: determineExecutionLane(taskSummary, entry.state, entry.nextState, entry.readyForNextState),
      nextActionableTaskIds: taskSummary.actionableTasks.map((task) => task.id),
      nextActionableTaskTitles: taskSummary.actionableTasks.map((task) => task.title).slice(0, 3),
    };
  });

  const columns = laneDefinitions().map((lane) => ({
    key: lane.key,
    label: lane.label,
    cards: cards
      .filter((card) => card.executionLane === lane.key)
      .sort(compareBoardCards),
  }));

  const lifecycleColumns = LIFECYCLE_ORDER.flatMap((state) => {
    const stateCards = cards.filter((card) => card.state === state).sort(compareBoardCards);
    return stateCards.length > 0
      ? [
          {
            key: state,
            label: `State: ${state}`,
            cards: stateCards,
          },
        ]
      : [];
  });

  const priorityCounts: Record<string, number> = {};
  for (const card of cards) {
    priorityCounts[card.priority] = (priorityCounts[card.priority] ?? 0) + 1;
  }

  return new ContextBoardReport(root, contextId, columns, lifecycleColumns, priorityCounts);
}

function determineExecutionLane(
  taskSummary: ReturnType<typeof summarizeTasks>,
  state: string,
  nextState: string | null,
  readyForNextState: boolean,
): ExecutionLane {
  if (taskSummary.taskCount === 0) {
    return readyForNextState ? "ready_to_advance" : "unplanned";
  }
  if (taskSummary.blockedTaskCount > 0) {
    return "blocked";
  }
  if (taskSummary.activeTaskCount > 0) {
    return "in_progress";
  }
  if (taskSummary.completedTaskCount === taskSummary.taskCount) {
    return readyForNextState ? "ready_to_advance" : "completed_waiting";
  }
  if (lifecycleRank(state) < lifecycleRank("implementing")) {
    return readyForNextState && nextState === "implementing" ? "ready_to_advance" : "queued";
  }
  if (taskSummary.actionableTaskCount > 0) {
    return "ready_to_start";
  }
  return "queued";
}

function loadTaskSummary(root: string, contextId: string, sliceId: string): ReturnType<typeof summarizeTasks> {
  const tasksPath = path.join(root, "contexts", contextId, "slices", sliceId, "tasks.yaml");
  try {
    return summarizeTasks(readTasksFile(tasksPath));
  } catch {
    return summarizeTasks([]);
  }
}

function compareBoardCards(a: ContextBoardCard, b: ContextBoardCard): number {
  return (
    priorityRank(a.priority) - priorityRank(b.priority) ||
    Number(b.readyForNextState) - Number(a.readyForNextState) ||
    b.actionableTaskCount - a.actionableTaskCount ||
    b.activeTaskCount - a.activeTaskCount ||
    a.validationIssueCount - b.validationIssueCount ||
    lifecycleRank(b.state) - lifecycleRank(a.state) ||
    a.sliceId.localeCompare(b.sliceId)
  );
}

function priorityRank(priority: string): number {
  const normalized = priority.trim().toLowerCase();
  if (["critical", "urgent", "highest", "p0"].includes(normalized)) {
    return 0;
  }
  if (["high", "p1"].includes(normalized)) {
    return 1;
  }
  if (["medium", "normal", "p2"].includes(normalized)) {
    return 2;
  }
  if (["low", "p3"].includes(normalized)) {
    return 3;
  }
  return 4;
}

function lifecycleRank(state: string): number {
  const index = LIFECYCLE_ORDER.indexOf(state as (typeof LIFECYCLE_ORDER)[number]);
  return index >= 0 ? index : -1;
}

function laneDefinitions(): Array<{ key: ExecutionLane; label: string }> {
  return [
    { key: "blocked", label: "Blocked" },
    { key: "in_progress", label: "In Progress" },
    { key: "ready_to_start", label: "Ready To Start" },
    { key: "queued", label: "Queued" },
    { key: "completed_waiting", label: "Completed, Awaiting Gates" },
    { key: "ready_to_advance", label: "Ready To Advance" },
    { key: "unplanned", label: "Unplanned" },
  ];
}

function formatPriorityCounts(priorityCounts: Record<string, number>): string {
  const parts = Object.entries(priorityCounts)
    .sort((a, b) => priorityRank(a[0]) - priorityRank(b[0]) || a[0].localeCompare(b[0]))
    .map(([priority, count]) => `${priority}=${count}`);
  return parts.join(", ");
}
