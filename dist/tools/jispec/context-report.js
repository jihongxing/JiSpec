"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextStatusReport = exports.ContextListReport = exports.ContextShowReport = exports.SliceListReport = void 0;
exports.buildSliceListReport = buildSliceListReport;
exports.buildContextListReport = buildContextListReport;
exports.buildContextShowReport = buildContextShowReport;
exports.buildContextStatusReport = buildContextStatusReport;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const slice_report_1 = require("./slice-report");
class SliceListReport {
    root;
    entries;
    contextFilter;
    constructor(root, entries, contextFilter) {
        this.root = root;
        this.entries = entries;
        this.contextFilter = contextFilter;
    }
    toDict() {
        return {
            root: this.root,
            context_filter: this.contextFilter ?? null,
            count: this.entries.length,
            slices: this.entries,
        };
    }
    renderText() {
        const lines = [
            this.contextFilter ? `Slices in context \`${this.contextFilter}\`` : "Slices",
            `Count: ${this.entries.length}`,
        ];
        if (this.entries.length === 0) {
            lines.push("No slices found.");
            return lines.join("\n");
        }
        lines.push(...this.entries.map((entry) => `- ${entry.sliceId} | context=${entry.contextId} | priority=${entry.priority} | state=${entry.state} | next=${entry.nextState ?? "final"} | ready=${entry.readyForNextState} | issues=${entry.validationIssueCount}`));
        return lines.join("\n");
    }
}
exports.SliceListReport = SliceListReport;
class ContextShowReport {
    root;
    contextId;
    name;
    owner;
    purpose;
    upstreamContexts;
    downstreamContexts;
    activeSliceIds;
    sliceEntries;
    stateCounts;
    readySliceCount;
    constructor(root, contextId, name, owner, purpose, upstreamContexts, downstreamContexts, activeSliceIds, sliceEntries, stateCounts, readySliceCount) {
        this.root = root;
        this.contextId = contextId;
        this.name = name;
        this.owner = owner;
        this.purpose = purpose;
        this.upstreamContexts = upstreamContexts;
        this.downstreamContexts = downstreamContexts;
        this.activeSliceIds = activeSliceIds;
        this.sliceEntries = sliceEntries;
        this.stateCounts = stateCounts;
        this.readySliceCount = readySliceCount;
    }
    toDict() {
        return {
            root: this.root,
            context_id: this.contextId,
            name: this.name,
            owner: this.owner,
            purpose: this.purpose,
            upstream_contexts: this.upstreamContexts,
            downstream_contexts: this.downstreamContexts,
            active_slice_ids: this.activeSliceIds,
            slice_count: this.sliceEntries.length,
            ready_slice_count: this.readySliceCount,
            state_counts: this.stateCounts,
            slices: this.sliceEntries,
        };
    }
    renderText() {
        const lines = [
            `Context \`${this.contextId}\``,
            `Name: ${this.name}`,
            `Owner: ${this.owner}`,
            `Purpose: ${this.purpose}`,
            `Upstream: ${this.upstreamContexts.length > 0 ? this.upstreamContexts.join(", ") : "-"}`,
            `Downstream: ${this.downstreamContexts.length > 0 ? this.downstreamContexts.join(", ") : "-"}`,
            `Active slices: ${this.activeSliceIds.length}`,
            `Ready slices: ${this.readySliceCount}/${this.sliceEntries.length}`,
        ];
        const stateNames = Object.keys(this.stateCounts).sort();
        if (stateNames.length > 0) {
            lines.push("State counts:");
            lines.push(...stateNames.map((state) => `- ${state}: ${this.stateCounts[state]}`));
        }
        if (this.sliceEntries.length > 0) {
            lines.push("Slices:");
            lines.push(...this.sliceEntries.map((entry) => `- ${entry.sliceId} | priority=${entry.priority} | state=${entry.state} | next=${entry.nextState ?? "final"} | ready=${entry.readyForNextState} | issues=${entry.validationIssueCount}`));
        }
        return lines.join("\n");
    }
}
exports.ContextShowReport = ContextShowReport;
class ContextListReport {
    root;
    entries;
    constructor(root, entries) {
        this.root = root;
        this.entries = entries;
    }
    toDict() {
        return {
            root: this.root,
            count: this.entries.length,
            contexts: this.entries,
        };
    }
    renderText() {
        const lines = ["Contexts", `Count: ${this.entries.length}`];
        if (this.entries.length === 0) {
            lines.push("No contexts found.");
            return lines.join("\n");
        }
        lines.push(...this.entries.map((entry) => `- ${entry.contextId} | owner=${entry.owner} | slices=${entry.sliceCount} | ready=${entry.readySliceCount} | blocked=${entry.blockedSliceCount} | issues=${entry.validationIssueCount}`));
        return lines.join("\n");
    }
}
exports.ContextListReport = ContextListReport;
class ContextStatusReport {
    root;
    contextId;
    sliceCount;
    readySliceCount;
    blockedSliceIds;
    slicesReadyToAdvance;
    slicesWithIssues;
    suggestedNextActions;
    constructor(root, contextId, sliceCount, readySliceCount, blockedSliceIds, slicesReadyToAdvance, slicesWithIssues, suggestedNextActions) {
        this.root = root;
        this.contextId = contextId;
        this.sliceCount = sliceCount;
        this.readySliceCount = readySliceCount;
        this.blockedSliceIds = blockedSliceIds;
        this.slicesReadyToAdvance = slicesReadyToAdvance;
        this.slicesWithIssues = slicesWithIssues;
        this.suggestedNextActions = suggestedNextActions;
    }
    get healthy() {
        return this.blockedSliceIds.length === 0 && this.slicesWithIssues.length === 0;
    }
    toDict() {
        return {
            root: this.root,
            context_id: this.contextId,
            healthy: this.healthy,
            slice_count: this.sliceCount,
            ready_slice_count: this.readySliceCount,
            blocked_slice_ids: this.blockedSliceIds,
            slices_ready_to_advance: this.slicesReadyToAdvance,
            slices_with_issues: this.slicesWithIssues,
            suggested_next_actions: this.suggestedNextActions,
        };
    }
    renderText() {
        const lines = [
            `Context status for \`${this.contextId}\``,
            `Healthy: ${this.healthy}`,
            `Slices: ${this.sliceCount}`,
            `Ready slices: ${this.readySliceCount}`,
        ];
        if (this.blockedSliceIds.length > 0) {
            lines.push("Blocked slices:");
            lines.push(...this.blockedSliceIds.map((sliceId) => `- ${sliceId}`));
        }
        if (this.slicesReadyToAdvance.length > 0) {
            lines.push("Slices ready to advance:");
            lines.push(...this.slicesReadyToAdvance.map((sliceId) => `- ${sliceId}`));
        }
        if (this.slicesWithIssues.length > 0) {
            lines.push("Slices with validation issues:");
            lines.push(...this.slicesWithIssues.map((sliceId) => `- ${sliceId}`));
        }
        if (this.suggestedNextActions.length > 0) {
            lines.push("Suggested next actions:");
            lines.push(...this.suggestedNextActions.map((action) => `- ${action}`));
        }
        return lines.join("\n");
    }
}
exports.ContextStatusReport = ContextStatusReport;
function buildSliceListReport(root, contextFilter) {
    const entries = discoverSliceIds(root)
        .filter((entry) => !contextFilter || entry.contextId === contextFilter)
        .map((entry) => buildSliceEntry(root, entry.sliceId))
        .sort((a, b) => a.contextId.localeCompare(b.contextId) || a.sliceId.localeCompare(b.sliceId));
    return new SliceListReport(root, entries, contextFilter);
}
function buildContextListReport(root) {
    const entries = discoverContextIds(root)
        .map((contextId) => {
        const report = buildContextShowReport(root, contextId);
        const validationIssueCount = report.sliceEntries.reduce((sum, entry) => sum + entry.validationIssueCount, 0);
        const blockedSliceCount = report.sliceEntries.filter((entry) => !entry.readyForNextState).length;
        return {
            contextId,
            name: report.name,
            owner: report.owner,
            sliceCount: report.sliceEntries.length,
            readySliceCount: report.readySliceCount,
            validationIssueCount,
            blockedSliceCount,
        };
    })
        .sort((a, b) => a.contextId.localeCompare(b.contextId));
    return new ContextListReport(root, entries);
}
function buildContextShowReport(root, contextId) {
    const contextFile = node_path_1.default.join(root, "contexts", contextId, "context.yaml");
    if (!node_fs_1.default.existsSync(contextFile)) {
        throw new Error(`Context \`${contextId}\` does not exist.`);
    }
    const raw = js_yaml_1.default.load(node_fs_1.default.readFileSync(contextFile, "utf-8"));
    if (!isPlainObject(raw)) {
        throw new Error(`Context file \`${contextFile}\` is not valid YAML.`);
    }
    const activeSliceIds = Array.isArray(raw.active_slices)
        ? raw.active_slices.filter((value) => typeof value === "string")
        : [];
    const sliceEntries = discoverSliceIds(root)
        .filter((entry) => entry.contextId === contextId)
        .map((entry) => buildSliceEntry(root, entry.sliceId))
        .sort((a, b) => a.sliceId.localeCompare(b.sliceId));
    const stateCounts = {};
    let readySliceCount = 0;
    for (const entry of sliceEntries) {
        stateCounts[entry.state] = (stateCounts[entry.state] ?? 0) + 1;
        if (entry.readyForNextState) {
            readySliceCount += 1;
        }
    }
    return new ContextShowReport(root, contextId, typeof raw.name === "string" ? raw.name : contextId, typeof raw.owner === "string" ? raw.owner : "unknown", typeof raw.purpose === "string" ? raw.purpose : "", Array.isArray(raw.upstream_contexts)
        ? raw.upstream_contexts.filter((value) => typeof value === "string")
        : [], Array.isArray(raw.downstream_contexts)
        ? raw.downstream_contexts.filter((value) => typeof value === "string")
        : [], activeSliceIds, sliceEntries, stateCounts, readySliceCount);
}
function buildContextStatusReport(root, contextId) {
    const report = buildContextShowReport(root, contextId);
    const blockedSliceIds = report.sliceEntries
        .filter((entry) => !entry.readyForNextState)
        .map((entry) => entry.sliceId);
    const slicesReadyToAdvance = report.sliceEntries
        .filter((entry) => entry.readyForNextState)
        .map((entry) => entry.sliceId);
    const slicesWithIssues = report.sliceEntries
        .filter((entry) => entry.validationIssueCount > 0)
        .map((entry) => entry.sliceId);
    const suggestedNextActions = new Set();
    if (slicesReadyToAdvance.length > 0) {
        suggestedNextActions.add(`Advance the next ready slice, for example \`${slicesReadyToAdvance[0]}\`, through its lifecycle.`);
    }
    if (blockedSliceIds.length > 0) {
        suggestedNextActions.add(`Inspect blocked slices with \`slice status <slice-id>\`, starting with \`${blockedSliceIds[0]}\`.`);
    }
    if (slicesWithIssues.length > 0) {
        suggestedNextActions.add(`Run \`slice check <slice-id>\` for slices with issues, starting with \`${slicesWithIssues[0]}\`.`);
    }
    if (suggestedNextActions.size === 0) {
        suggestedNextActions.add("No blocked slices detected. Continue advancing the next planned slice.");
    }
    return new ContextStatusReport(root, contextId, report.sliceEntries.length, report.readySliceCount, blockedSliceIds, slicesReadyToAdvance, slicesWithIssues, Array.from(suggestedNextActions));
}
function buildSliceEntry(root, sliceId) {
    const show = (0, slice_report_1.buildSliceShowReport)(root, sliceId);
    const status = (0, slice_report_1.buildSliceStatusReport)(root, sliceId);
    return {
        sliceId,
        contextId: show.contextId,
        title: show.title,
        priority: show.priority,
        state: show.state,
        nextState: show.nextState ?? null,
        readyForNextState: status.readyForNextState,
        validationIssueCount: show.validationIssueCount,
        missingArtifactsCount: status.missingArtifactsForCurrent.length + status.missingArtifactsForNext.length,
        missingGatesCount: status.missingGatesForNext.length,
    };
}
function discoverSliceIds(root) {
    const contextsRoot = node_path_1.default.join(root, "contexts");
    if (!node_fs_1.default.existsSync(contextsRoot)) {
        return [];
    }
    const entries = [];
    for (const contextEntry of node_fs_1.default.readdirSync(contextsRoot, { withFileTypes: true })) {
        if (!contextEntry.isDirectory()) {
            continue;
        }
        const slicesRoot = node_path_1.default.join(contextsRoot, contextEntry.name, "slices");
        if (!node_fs_1.default.existsSync(slicesRoot)) {
            continue;
        }
        for (const sliceEntry of node_fs_1.default.readdirSync(slicesRoot, { withFileTypes: true })) {
            if (!sliceEntry.isDirectory()) {
                continue;
            }
            const sliceFile = node_path_1.default.join(slicesRoot, sliceEntry.name, "slice.yaml");
            if (node_fs_1.default.existsSync(sliceFile)) {
                entries.push({ contextId: contextEntry.name, sliceId: sliceEntry.name });
            }
        }
    }
    return entries;
}
function discoverContextIds(root) {
    const contextsRoot = node_path_1.default.join(root, "contexts");
    if (!node_fs_1.default.existsSync(contextsRoot)) {
        return [];
    }
    return node_fs_1.default
        .readdirSync(contextsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
