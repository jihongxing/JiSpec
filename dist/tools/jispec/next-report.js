"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NextApplyResult = exports.ContextNextReport = exports.SliceNextReport = void 0;
exports.buildSliceNextReport = buildSliceNextReport;
exports.buildContextNextReport = buildContextNextReport;
exports.applySliceNext = applySliceNext;
exports.applyContextNext = applyContextNext;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const context_report_1 = require("./context-report");
const slice_report_1 = require("./slice-report");
const slice_ops_1 = require("./slice-ops");
const slice_plan_1 = require("./slice-plan");
const tasks_1 = require("./tasks");
const validator_1 = require("./validator");
class SliceNextReport {
    root;
    sliceId;
    contextId;
    title;
    priority;
    state;
    nextState;
    readyForNextState;
    taskCount;
    activeTaskCount;
    blockedTaskCount;
    actionableTaskCount;
    decisionKind;
    decisionSummary;
    reasons;
    commands;
    followUpCommands;
    score;
    applyInstruction;
    constructor(root, sliceId, contextId, title, priority, state, nextState, readyForNextState, taskCount, activeTaskCount, blockedTaskCount, actionableTaskCount, decisionKind, decisionSummary, reasons, commands, followUpCommands, score, applyInstruction) {
        this.root = root;
        this.sliceId = sliceId;
        this.contextId = contextId;
        this.title = title;
        this.priority = priority;
        this.state = state;
        this.nextState = nextState;
        this.readyForNextState = readyForNextState;
        this.taskCount = taskCount;
        this.activeTaskCount = activeTaskCount;
        this.blockedTaskCount = blockedTaskCount;
        this.actionableTaskCount = actionableTaskCount;
        this.decisionKind = decisionKind;
        this.decisionSummary = decisionSummary;
        this.reasons = reasons;
        this.commands = commands;
        this.followUpCommands = followUpCommands;
        this.score = score;
        this.applyInstruction = applyInstruction;
    }
    get applyReady() {
        return this.applyInstruction.safe;
    }
    get applyBlockedReason() {
        return this.applyInstruction.safe ? null : this.applyInstruction.reason;
    }
    toDict() {
        return {
            root: this.root,
            slice_id: this.sliceId,
            context_id: this.contextId,
            title: this.title,
            priority: this.priority,
            state: this.state,
            next_state: this.nextState,
            ready_for_next_state: this.readyForNextState,
            task_count: this.taskCount,
            active_task_count: this.activeTaskCount,
            blocked_task_count: this.blockedTaskCount,
            actionable_task_count: this.actionableTaskCount,
            decision_kind: this.decisionKind,
            decision_summary: this.decisionSummary,
            reasons: this.reasons,
            commands: this.commands,
            follow_up_commands: this.followUpCommands,
            score: this.score,
            apply_ready: this.applyReady,
            apply_blocked_reason: this.applyBlockedReason,
            apply_instruction: serializeApplyInstruction(this.applyInstruction),
        };
    }
    renderText() {
        const lines = [
            `Next action for slice \`${this.sliceId}\``,
            `Decision: ${this.decisionSummary}`,
            `Context: ${this.contextId}`,
            `Priority: ${this.priority}`,
            `State: ${this.state} -> ${this.nextState ?? "final"}`,
            `Tasks: total=${this.taskCount}, active=${this.activeTaskCount}, blocked=${this.blockedTaskCount}, actionable=${this.actionableTaskCount}`,
            `Apply ready: ${this.applyReady}`,
        ];
        if (this.applyBlockedReason) {
            lines.push(`Apply blocked: ${this.applyBlockedReason}`);
        }
        if (this.reasons.length > 0) {
            lines.push("Why:");
            lines.push(...this.reasons.map((reason) => `- ${reason}`));
        }
        if (this.commands.length > 0) {
            lines.push("Recommended commands:");
            lines.push(...this.commands.map((command) => `- ${command.command}`));
        }
        if (this.followUpCommands.length > 0) {
            lines.push("Follow-up commands:");
            lines.push(...this.followUpCommands.map((command) => `- ${command.command}`));
        }
        if (this.commands.length === 0 && this.followUpCommands.length === 0) {
            lines.push("Recommended commands:");
            lines.push("- none");
        }
        return lines.join("\n");
    }
}
exports.SliceNextReport = SliceNextReport;
class ContextNextReport {
    root;
    contextId;
    sliceCount;
    chosen;
    dispatchQueue;
    constructor(root, contextId, sliceCount, chosen, dispatchQueue) {
        this.root = root;
        this.contextId = contextId;
        this.sliceCount = sliceCount;
        this.chosen = chosen;
        this.dispatchQueue = dispatchQueue;
    }
    get applyReady() {
        return this.chosen?.applyReady ?? false;
    }
    get applyBlockedReason() {
        return this.chosen?.applyBlockedReason ?? null;
    }
    toDict() {
        return {
            root: this.root,
            context_id: this.contextId,
            slice_count: this.sliceCount,
            chosen: this.chosen ? this.chosen.toDict() : null,
            dispatch_queue: this.dispatchQueue.map((candidate) => candidate.toDict()),
            apply_ready: this.applyReady,
            apply_blocked_reason: this.applyBlockedReason,
        };
    }
    renderText() {
        const lines = [
            `Next action for context \`${this.contextId}\``,
            `Slices: ${this.sliceCount}`,
        ];
        if (!this.chosen) {
            lines.push("No slices found.");
            return lines.join("\n");
        }
        lines.push(`Chosen slice: ${this.chosen.sliceId}`);
        lines.push(`Decision: ${this.chosen.decisionSummary}`);
        lines.push(`Apply ready: ${this.chosen.applyReady}`);
        if (this.chosen.applyBlockedReason) {
            lines.push(`Apply blocked: ${this.chosen.applyBlockedReason}`);
        }
        if (this.chosen.reasons.length > 0) {
            lines.push("Why:");
            lines.push(...this.chosen.reasons.map((reason) => `- ${reason}`));
        }
        if (this.chosen.commands.length > 0) {
            lines.push("Recommended commands:");
            lines.push(...this.chosen.commands.map((command) => `- ${command.command}`));
        }
        if (this.chosen.followUpCommands.length > 0) {
            lines.push("Follow-up commands:");
            lines.push(...this.chosen.followUpCommands.map((command) => `- ${command.command}`));
        }
        lines.push("Dispatch queue:");
        lines.push(...this.dispatchQueue.slice(0, 5).map((candidate, index) => {
            const firstCommand = candidate.commands[0]?.command ?? "manual";
            return `- #${index + 1} ${candidate.sliceId} | priority=${candidate.priority} | decision=${candidate.decisionKind} | apply=${candidate.applyReady} | next=${firstCommand}`;
        }));
        return lines.join("\n");
    }
}
exports.ContextNextReport = ContextNextReport;
class NextApplyResult {
    scope;
    root;
    targetId;
    applied;
    summary;
    executedCommands;
    before;
    after;
    constructor(scope, root, targetId, applied, summary, executedCommands, before, after) {
        this.scope = scope;
        this.root = root;
        this.targetId = targetId;
        this.applied = applied;
        this.summary = summary;
        this.executedCommands = executedCommands;
        this.before = before;
        this.after = after;
    }
    toDict() {
        return {
            scope: this.scope,
            root: this.root,
            target_id: this.targetId,
            applied: this.applied,
            summary: this.summary,
            executed_commands: this.executedCommands,
            before: this.before.toDict(),
            after: this.after?.toDict() ?? null,
        };
    }
    renderText() {
        const lines = [
            `${this.applied ? "Applied" : "Did not apply"} next action for ${this.scope} \`${this.targetId}\``,
            `Summary: ${this.summary}`,
        ];
        if (this.executedCommands.length > 0) {
            lines.push("Executed commands:");
            lines.push(...this.executedCommands.map((command) => `- ${command}`));
        }
        if (this.after) {
            if (this.scope === "slice") {
                lines.push(`Next recommendation: ${this.after.decisionSummary}`);
            }
            else {
                lines.push(`Next recommendation: ${this.after.chosen?.decisionSummary ?? "none"}`);
            }
        }
        return lines.join("\n");
    }
}
exports.NextApplyResult = NextApplyResult;
function buildSliceNextReport(root, sliceId) {
    const show = (0, slice_report_1.buildSliceShowReport)(root, sliceId);
    const status = (0, slice_report_1.buildSliceStatusReport)(root, sliceId);
    const taskContext = (0, tasks_1.loadSliceTasks)(root, sliceId);
    const taskSummary = (0, tasks_1.summarizeTasks)(taskContext.tasks);
    const tasksPathExists = node_fs_1.default.existsSync(taskContext.tasksPath);
    const decision = decideSliceNext(root, show, status, taskSummary, tasksPathExists, taskContext.tasks);
    return new SliceNextReport(root, sliceId, show.contextId, show.title, show.priority, show.state, show.nextState ?? null, status.readyForNextState, taskSummary.taskCount, taskSummary.activeTaskCount, taskSummary.blockedTaskCount, taskSummary.actionableTaskCount, decision.kind, decision.summary, decision.reasons, decision.commands, decision.followUpCommands, decision.score, decision.applyInstruction);
}
function buildContextNextReport(root, contextId) {
    const context = (0, context_report_1.buildContextShowReport)(root, contextId);
    const dispatchQueue = context.sliceEntries
        .map((entry) => buildSliceNextReport(root, entry.sliceId))
        .sort(compareSliceNextReports);
    return new ContextNextReport(root, contextId, context.sliceEntries.length, dispatchQueue[0] ?? null, dispatchQueue);
}
function applySliceNext(root, sliceId) {
    const before = buildSliceNextReport(root, sliceId);
    if (!before.applyReady) {
        return new NextApplyResult("slice", root, sliceId, false, before.applyBlockedReason ?? "The recommended action is not safe to auto-apply.", [], before, null);
    }
    const executedCommands = executeApplyInstruction(root, before.applyInstruction);
    const after = buildSliceNextReport(root, sliceId);
    return new NextApplyResult("slice", root, sliceId, true, before.decisionSummary, executedCommands, before, after);
}
function applyContextNext(root, contextId) {
    const before = buildContextNextReport(root, contextId);
    if (!before.chosen) {
        return new NextApplyResult("context", root, contextId, false, "No slices found in this context.", [], before, null);
    }
    if (!before.chosen.applyReady) {
        return new NextApplyResult("context", root, contextId, false, before.chosen.applyBlockedReason ?? "The top dispatch candidate is not safe to auto-apply.", [], before, null);
    }
    const executedCommands = executeApplyInstruction(root, before.chosen.applyInstruction);
    const after = buildContextNextReport(root, contextId);
    return new NextApplyResult("context", root, contextId, true, `Applied \`${before.chosen.sliceId}\`: ${before.chosen.decisionSummary}`, executedCommands, before, after);
}
function decideSliceNext(root, show, status, taskSummary, tasksPathExists, tasks) {
    const derivableArtifacts = unique([...status.missingArtifactsForCurrent, ...status.missingArtifactsForNext].filter((artifact) => DERIVABLE_ARTIFACTS.has(artifact)));
    const manualArtifacts = unique([...status.missingArtifactsForCurrent, ...status.missingArtifactsForNext].filter((artifact) => !DERIVABLE_ARTIFACTS.has(artifact) && artifact !== "tasks.yaml"));
    const activeTasks = tasks.filter((task) => task.status === "in_progress");
    const blockedTasks = tasks.filter((task) => task.status === "blocked");
    const nextActionableTask = taskSummary.actionableTasks[0];
    if (derivableArtifacts.length > 0) {
        return {
            kind: "derive_artifacts",
            summary: "Refresh the derived slice artifacts",
            reasons: [
                `Derived artifacts are missing: ${derivableArtifacts.join(", ")}.`,
                "Refreshing the artifact chain is the fastest way to unblock the next lifecycle step.",
            ],
            commands: [command(root, "derive-all", ["artifact", "derive-all", show.sliceId, "--force"])],
            followUpCommands: [command(root, "slice-next", ["slice", "next", show.sliceId])],
            score: 30,
            applyInstruction: {
                kind: "none",
                safe: false,
                reason: "This recommendation may overwrite derived files, so it is left as a manual step.",
            },
        };
    }
    if (!tasksPathExists && needsTaskPlan(show.state, show.nextState ?? null, status.readyForNextState)) {
        return {
            kind: "plan_tasks",
            summary: "Generate the execution task graph before entering delivery",
            reasons: [
                "This slice is at or near execution, but `tasks.yaml` is missing.",
                "Planning tasks first keeps the board and task updates aligned with lifecycle state.",
            ],
            commands: [command(root, "slice-plan", ["slice", "plan", show.sliceId])],
            followUpCommands: status.readyForNextState && show.nextState === "implementing"
                ? [command(root, "advance", ["slice", "advance", show.sliceId, "--to", "implementing"])]
                : [command(root, "slice-next", ["slice", "next", show.sliceId])],
            score: 20,
            applyInstruction: {
                kind: "plan_tasks",
                safe: true,
                sliceId: show.sliceId,
            },
        };
    }
    if (manualArtifacts.length > 0) {
        return {
            kind: "manual_artifacts",
            summary: "Add the remaining manual artifacts before advancing",
            reasons: [
                `The next lifecycle step still needs manual artifacts: ${manualArtifacts.join(", ")}.`,
                "These files are not safely derivable by the current protocol helpers.",
            ],
            commands: [command(root, "slice-show", ["slice", "show", show.sliceId])],
            followUpCommands: [],
            score: 50,
            applyInstruction: {
                kind: "none",
                safe: false,
                reason: "Manual artifacts still need human input before the protocol can continue.",
            },
        };
    }
    if (status.readyForNextState && show.nextState) {
        return {
            kind: "advance",
            summary: `Advance the slice to \`${show.nextState}\``,
            reasons: [
                `All required artifacts and gates for \`${show.nextState}\` are satisfied.`,
                "The highest leverage move now is to progress the slice lifecycle itself.",
            ],
            commands: [command(root, "advance", ["slice", "advance", show.sliceId, "--to", show.nextState])],
            followUpCommands: [command(root, "slice-next", ["slice", "next", show.sliceId])],
            score: 0,
            applyInstruction: {
                kind: "advance",
                safe: true,
                sliceId: show.sliceId,
                toState: show.nextState,
            },
        };
    }
    if (show.validationIssueCount > 0) {
        return {
            kind: "resolve_validation",
            summary: "Resolve protocol validation issues before making more state changes",
            reasons: [
                `This slice currently has ${show.validationIssueCount} validation issue(s).`,
                "Cleaning those up first keeps later task and gate decisions trustworthy.",
            ],
            commands: [command(root, "slice-check", ["slice", "check", show.sliceId])],
            followUpCommands: [],
            score: 40,
            applyInstruction: {
                kind: "none",
                safe: false,
                reason: "Validation issues need inspection and are not safe to auto-resolve.",
            },
        };
    }
    if (taskSummary.blockedTaskCount > 0) {
        return {
            kind: "unblock_tasks",
            summary: "Unblock the stalled execution tasks",
            reasons: [
                `${taskSummary.blockedTaskCount} task(s) are blocked in the execution graph.`,
                `Blocked task IDs: ${blockedTasks.map((task) => task.id).join(", ")}.`,
            ],
            commands: [command(root, "slice-show", ["slice", "show", show.sliceId])],
            followUpCommands: [],
            score: 70,
            applyInstruction: {
                kind: "none",
                safe: false,
                reason: "Blocked execution tasks still need human judgment to unblock safely.",
            },
        };
    }
    if (taskSummary.activeTaskCount > 0) {
        return {
            kind: "continue_active_tasks",
            summary: "Continue the task that is already in progress",
            reasons: [
                `${taskSummary.activeTaskCount} task(s) are already in progress.`,
                `Active task IDs: ${activeTasks.map((task) => task.id).join(", ")}.`,
            ],
            commands: [],
            followUpCommands: [],
            score: 80,
            applyInstruction: {
                kind: "none",
                safe: false,
                reason: "A task is already in progress, so there is no additional safe protocol mutation to apply.",
            },
        };
    }
    if (nextActionableTask && lifecycleRank(show.state) >= lifecycleRank("implementing")) {
        return {
            kind: "start_task",
            summary: `Start the next actionable task \`${nextActionableTask.id}\``,
            reasons: [
                "The slice is in execution and there is at least one pending task with all dependencies satisfied.",
                `Recommended task: ${nextActionableTask.title}.`,
            ],
            commands: [
                command(root, "update-tasks", [
                    "slice",
                    "update-tasks",
                    show.sliceId,
                    "--set-status",
                    `${nextActionableTask.id}=in_progress`,
                ]),
            ],
            followUpCommands: [command(root, "slice-next", ["slice", "next", show.sliceId])],
            score: 25,
            applyInstruction: {
                kind: "start_task",
                safe: true,
                sliceId: show.sliceId,
                statusUpdates: [`${nextActionableTask.id}=in_progress`],
            },
        };
    }
    if (status.missingGatesForNext.length > 0 && show.nextState) {
        const gateAssignments = status.missingGatesForNext.map((gate) => `${gate}=true`);
        return {
            kind: "update_gates",
            summary: `Satisfy the remaining gates for \`${show.nextState}\``,
            reasons: [
                `Only gates are blocking \`${show.nextState}\`: ${status.missingGatesForNext.join(", ")}.`,
                "Once those gates are confirmed, the slice can advance immediately.",
            ],
            commands: [
                command(root, "update-gates", ["slice", "update-gates", show.sliceId, "--set-gate", ...gateAssignments]),
            ],
            followUpCommands: [command(root, "advance", ["slice", "advance", show.sliceId, "--to", show.nextState])],
            score: 10,
            applyInstruction: {
                kind: "update_gates",
                safe: true,
                sliceId: show.sliceId,
                gateUpdates: gateAssignments,
            },
        };
    }
    return {
        kind: "noop",
        summary: "No higher-leverage protocol move was detected right now",
        reasons: [
            "The slice is not ready to advance, and there is no immediately startable protocol task to flip.",
            "The best next step is to inspect the slice details and continue the underlying delivery work.",
        ],
        commands: [command(root, "slice-status", ["slice", "status", show.sliceId])],
        followUpCommands: [],
        score: 90,
        applyInstruction: {
            kind: "none",
            safe: false,
            reason: "There is no safe protocol action to apply right now.",
        },
    };
}
function executeApplyInstruction(root, instruction) {
    if (!instruction.safe) {
        return [];
    }
    if (instruction.kind === "advance") {
        (0, slice_ops_1.advanceSlice)({
            root,
            sliceId: instruction.sliceId,
            toState: instruction.toState,
        });
        return [command(root, "advance", ["slice", "advance", instruction.sliceId, "--to", instruction.toState]).command];
    }
    if (instruction.kind === "update_gates") {
        (0, slice_ops_1.updateSliceGates)({
            root,
            sliceId: instruction.sliceId,
            gateUpdates: instruction.gateUpdates,
        });
        return [
            command(root, "update-gates", ["slice", "update-gates", instruction.sliceId, "--set-gate", ...instruction.gateUpdates]).command,
        ];
    }
    if (instruction.kind === "plan_tasks") {
        (0, slice_plan_1.planSlice)(root, instruction.sliceId, false);
        return [command(root, "slice-plan", ["slice", "plan", instruction.sliceId]).command];
    }
    if (instruction.kind === "start_task") {
        (0, tasks_1.updateSliceTasks)({
            root,
            sliceId: instruction.sliceId,
            statusUpdates: instruction.statusUpdates,
        });
        return [
            command(root, "update-tasks", ["slice", "update-tasks", instruction.sliceId, "--set-status", ...instruction.statusUpdates]).command,
        ];
    }
    return [];
}
function serializeApplyInstruction(instruction) {
    if (!instruction.safe) {
        return {
            kind: instruction.kind,
            safe: false,
            reason: instruction.reason,
        };
    }
    if (instruction.kind === "advance") {
        return {
            kind: instruction.kind,
            safe: true,
            slice_id: instruction.sliceId,
            to_state: instruction.toState,
        };
    }
    if (instruction.kind === "update_gates") {
        return {
            kind: instruction.kind,
            safe: true,
            slice_id: instruction.sliceId,
            gate_updates: instruction.gateUpdates,
        };
    }
    if (instruction.kind === "plan_tasks") {
        return {
            kind: instruction.kind,
            safe: true,
            slice_id: instruction.sliceId,
        };
    }
    return {
        kind: instruction.kind,
        safe: true,
        slice_id: instruction.sliceId,
        status_updates: instruction.statusUpdates,
    };
}
function needsTaskPlan(state, nextState, readyForNextState) {
    return lifecycleRank(state) >= lifecycleRank("implementing") ||
        (readyForNextState && nextState === "implementing");
}
function compareSliceNextReports(a, b) {
    return (a.score - b.score ||
        priorityRank(a.priority) - priorityRank(b.priority) ||
        lifecycleRank(b.state) - lifecycleRank(a.state) ||
        a.sliceId.localeCompare(b.sliceId));
}
function command(root, label, args) {
    const fullArgs = ["npm", "run", "jispec", "--", ...args, ...rootArgs(root)];
    return {
        label,
        command: fullArgs.map(quoteArg).join(" "),
    };
}
function rootArgs(root) {
    return node_path_1.default.resolve(root) === node_path_1.default.resolve(process.cwd()) ? [] : ["--root", root];
}
function quoteArg(value) {
    return /\s/.test(value) ? `"${value}"` : value;
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
function unique(values) {
    return Array.from(new Set(values));
}
const DERIVABLE_ARTIFACTS = new Set(["design.md", "behaviors.feature", "test-spec.yaml", "trace.yaml"]);
