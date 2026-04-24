"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextBoardReport = void 0;
exports.buildContextBoardReport = buildContextBoardReport;
const node_path_1 = __importDefault(require("node:path"));
const tasks_1 = require("./tasks");
const context_report_1 = require("./context-report");
const validator_1 = require("./validator");
class ContextBoardReport {
    root;
    contextId;
    columns;
    lifecycleColumns;
    priorityCounts;
    constructor(root, contextId, columns, lifecycleColumns, priorityCounts) {
        this.root = root;
        this.contextId = contextId;
        this.columns = columns;
        this.lifecycleColumns = lifecycleColumns;
        this.priorityCounts = priorityCounts;
    }
    toDict() {
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
    renderText() {
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
            lines.push(...column.cards.map((card) => {
                const nextAction = card.nextActionableTaskTitles.length > 0
                    ? card.nextActionableTaskTitles.join("; ")
                    : card.readyForNextState
                        ? `Advance to ${card.nextState ?? "final"}`
                        : "Waiting on upstream work";
                return `- ${card.sliceId} | priority=${card.priority} | state=${card.state} | tasks=${card.completedTaskCount}/${card.taskCount} done | active=${card.activeTaskCount} | blocked=${card.blockedTaskCount} | actionable=${card.actionableTaskCount} | issues=${card.validationIssueCount} | next=${nextAction}`;
            }));
        }
        return lines.join("\n");
    }
}
exports.ContextBoardReport = ContextBoardReport;
function buildContextBoardReport(root, contextId) {
    const report = (0, context_report_1.buildContextShowReport)(root, contextId);
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
    const lifecycleColumns = validator_1.LIFECYCLE_ORDER.flatMap((state) => {
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
    const priorityCounts = {};
    for (const card of cards) {
        priorityCounts[card.priority] = (priorityCounts[card.priority] ?? 0) + 1;
    }
    return new ContextBoardReport(root, contextId, columns, lifecycleColumns, priorityCounts);
}
function determineExecutionLane(taskSummary, state, nextState, readyForNextState) {
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
function loadTaskSummary(root, contextId, sliceId) {
    const tasksPath = node_path_1.default.join(root, "contexts", contextId, "slices", sliceId, "tasks.yaml");
    try {
        return (0, tasks_1.summarizeTasks)((0, tasks_1.readTasksFile)(tasksPath));
    }
    catch {
        return (0, tasks_1.summarizeTasks)([]);
    }
}
function compareBoardCards(a, b) {
    return (priorityRank(a.priority) - priorityRank(b.priority) ||
        Number(b.readyForNextState) - Number(a.readyForNextState) ||
        b.actionableTaskCount - a.actionableTaskCount ||
        b.activeTaskCount - a.activeTaskCount ||
        a.validationIssueCount - b.validationIssueCount ||
        lifecycleRank(b.state) - lifecycleRank(a.state) ||
        a.sliceId.localeCompare(b.sliceId));
}
function priorityRank(priority) {
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
function lifecycleRank(state) {
    const index = validator_1.LIFECYCLE_ORDER.indexOf(state);
    return index >= 0 ? index : -1;
}
function laneDefinitions() {
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
function formatPriorityCounts(priorityCounts) {
    const parts = Object.entries(priorityCounts)
        .sort((a, b) => priorityRank(a[0]) - priorityRank(b[0]) || a[0].localeCompare(b[0]))
        .map(([priority, count]) => `${priority}=${count}`);
    return parts.join(", ");
}
