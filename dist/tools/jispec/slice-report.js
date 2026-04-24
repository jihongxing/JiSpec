"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SliceStatusReport = exports.SliceShowReport = void 0;
exports.buildSliceShowReport = buildSliceShowReport;
exports.buildSliceStatusReport = buildSliceStatusReport;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const validator_1 = require("./validator");
class SliceShowReport {
    root;
    sliceId;
    contextId;
    title;
    goal;
    priority;
    state;
    nextState;
    owners;
    requirementIds;
    designRefs;
    gates;
    artifacts;
    validationIssueCount;
    traceLinkCount;
    constructor(root, sliceId, contextId, title, goal, priority, state, nextState, owners, requirementIds, designRefs, gates, artifacts, validationIssueCount, traceLinkCount) {
        this.root = root;
        this.sliceId = sliceId;
        this.contextId = contextId;
        this.title = title;
        this.goal = goal;
        this.priority = priority;
        this.state = state;
        this.nextState = nextState;
        this.owners = owners;
        this.requirementIds = requirementIds;
        this.designRefs = designRefs;
        this.gates = gates;
        this.artifacts = artifacts;
        this.validationIssueCount = validationIssueCount;
        this.traceLinkCount = traceLinkCount;
    }
    toDict() {
        return {
            root: this.root,
            slice_id: this.sliceId,
            context_id: this.contextId,
            title: this.title,
            goal: this.goal,
            priority: this.priority,
            state: this.state,
            next_state: this.nextState,
            owners: this.owners,
            requirement_ids: this.requirementIds,
            design_refs: this.designRefs,
            gates: this.gates,
            artifacts: this.artifacts.map((artifact) => ({
                name: artifact.name,
                path: displayPath(this.root, artifact.path),
                exists: artifact.exists,
                required_for_current: artifact.requiredForCurrent,
                required_for_next: artifact.requiredForNext,
            })),
            validation_issue_count: this.validationIssueCount,
            trace_link_count: this.traceLinkCount,
        };
    }
    renderText() {
        const lines = [
            `Slice \`${this.sliceId}\``,
            `Title: ${this.title}`,
            `Context: ${this.contextId}`,
            `State: ${this.state}`,
            `Next state: ${this.nextState ?? "final"}`,
            `Priority: ${this.priority}`,
            `Goal: ${this.goal}`,
            `Validation issues: ${this.validationIssueCount}`,
            `Trace links: ${this.traceLinkCount}`,
        ];
        const owners = Object.entries(this.owners).filter(([, value]) => value);
        if (owners.length > 0) {
            lines.push("Owners:");
            lines.push(...owners.map(([role, owner]) => `- ${role}: ${owner}`));
        }
        if (this.requirementIds.length > 0) {
            lines.push("Requirements:");
            lines.push(...this.requirementIds.map((id) => `- ${id}`));
        }
        if (this.designRefs.length > 0) {
            lines.push("Design refs:");
            lines.push(...this.designRefs.map((ref) => `- ${ref}`));
        }
        lines.push("Gates:");
        lines.push(...Object.keys(this.gates).sort().map((gate) => `- ${gate}: ${this.gates[gate]}`));
        lines.push("Artifacts:");
        lines.push(...this.artifacts.map((artifact) => {
            const tags = [];
            if (artifact.requiredForCurrent) {
                tags.push("current");
            }
            if (artifact.requiredForNext) {
                tags.push("next");
            }
            const tagText = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
            return `- ${artifact.name}: ${artifact.exists ? "present" : "missing"}${tagText}`;
        }));
        return lines.join("\n");
    }
}
exports.SliceShowReport = SliceShowReport;
class SliceStatusReport {
    root;
    sliceId;
    state;
    nextState;
    readyForNextState;
    missingArtifactsForCurrent;
    missingArtifactsForNext;
    missingGatesForNext;
    validationIssues;
    suggestedNextActions;
    constructor(root, sliceId, state, nextState, readyForNextState, missingArtifactsForCurrent, missingArtifactsForNext, missingGatesForNext, validationIssues, suggestedNextActions) {
        this.root = root;
        this.sliceId = sliceId;
        this.state = state;
        this.nextState = nextState;
        this.readyForNextState = readyForNextState;
        this.missingArtifactsForCurrent = missingArtifactsForCurrent;
        this.missingArtifactsForNext = missingArtifactsForNext;
        this.missingGatesForNext = missingGatesForNext;
        this.validationIssues = validationIssues;
        this.suggestedNextActions = suggestedNextActions;
    }
    toDict() {
        return {
            root: this.root,
            slice_id: this.sliceId,
            state: this.state,
            next_state: this.nextState,
            ready_for_next_state: this.readyForNextState,
            missing_artifacts_for_current: this.missingArtifactsForCurrent,
            missing_artifacts_for_next: this.missingArtifactsForNext,
            missing_gates_for_next: this.missingGatesForNext,
            validation_issues: this.validationIssues,
            suggested_next_actions: this.suggestedNextActions,
        };
    }
    renderText() {
        const lines = [
            `Slice status for \`${this.sliceId}\``,
            `Current state: ${this.state}`,
            `Next state: ${this.nextState ?? "final"}`,
            `Ready for next state: ${this.readyForNextState}`,
        ];
        if (this.missingArtifactsForCurrent.length > 0) {
            lines.push("Missing artifacts for current state:");
            lines.push(...this.missingArtifactsForCurrent.map((artifact) => `- ${artifact}`));
        }
        if (this.missingArtifactsForNext.length > 0) {
            lines.push("Missing artifacts for next state:");
            lines.push(...this.missingArtifactsForNext.map((artifact) => `- ${artifact}`));
        }
        if (this.missingGatesForNext.length > 0) {
            lines.push("Missing gates for next state:");
            lines.push(...this.missingGatesForNext.map((gate) => `- ${gate}`));
        }
        if (this.validationIssues.length > 0) {
            lines.push("Validation issues:");
            lines.push(...this.validationIssues.map((issue) => `- ${issue}`));
        }
        if (this.suggestedNextActions.length > 0) {
            lines.push("Suggested next actions:");
            lines.push(...this.suggestedNextActions.map((action) => `- ${action}`));
        }
        return lines.join("\n");
    }
}
exports.SliceStatusReport = SliceStatusReport;
function buildSliceShowReport(root, sliceId) {
    const context = loadSliceContext(root, sliceId);
    const validation = (0, validator_1.validateSlice)(root, sliceId);
    const nextState = (0, validator_1.getNextLifecycleState)(context.state);
    const currentRequired = new Set((0, validator_1.getRequiredArtifactsForState)(context.state));
    const nextRequired = new Set(nextState ? (0, validator_1.getRequiredArtifactsForState)(nextState) : []);
    const artifacts = standardArtifactPaths(context).map(([name, artifactPath]) => ({
        name,
        path: artifactPath,
        exists: node_fs_1.default.existsSync(artifactPath),
        requiredForCurrent: currentRequired.has(name),
        requiredForNext: nextRequired.has(name),
    }));
    let traceLinkCount = 0;
    try {
        traceLinkCount = (0, validator_1.buildTraceReport)(root, sliceId).links.length;
    }
    catch {
        traceLinkCount = 0;
    }
    return new SliceShowReport(root, sliceId, context.contextId, context.title, context.goal, context.priority, context.state, nextState, context.owners, context.requirementIds, context.designRefs, context.gates, artifacts, validation.issues.length, traceLinkCount);
}
function buildSliceStatusReport(root, sliceId) {
    const context = loadSliceContext(root, sliceId);
    const validation = (0, validator_1.validateSlice)(root, sliceId);
    const nextState = (0, validator_1.getNextLifecycleState)(context.state);
    const currentArtifacts = (0, validator_1.getRequiredArtifactsForState)(context.state);
    const nextArtifacts = nextState ? (0, validator_1.getRequiredArtifactsForState)(nextState) : [];
    const missingArtifactsForCurrent = currentArtifacts.filter((artifact) => !node_fs_1.default.existsSync(node_path_1.default.join(context.sliceDir, artifact)));
    const missingArtifactsForNext = nextArtifacts.filter((artifact) => !node_fs_1.default.existsSync(node_path_1.default.join(context.sliceDir, artifact)));
    const missingGatesForNext = nextState
        ? (0, validator_1.getRequiredGatesForState)(nextState).filter((gate) => context.gates[gate] !== true)
        : [];
    const validationIssues = validation.issues.map((issue) => `[${issue.code}] ${issue.message}`);
    const suggestedNextActions = new Set();
    const derivableArtifacts = new Set(["design.md", "behaviors.feature", "test-spec.yaml", "trace.yaml"]);
    const shouldSuggestDeriveAll = missingArtifactsForCurrent.some((artifact) => derivableArtifacts.has(artifact)) ||
        missingArtifactsForNext.some((artifact) => derivableArtifacts.has(artifact));
    if (shouldSuggestDeriveAll) {
        suggestedNextActions.add("Run `artifact derive-all <slice-id> --force` to refresh the full slice pipeline.");
    }
    if (missingArtifactsForCurrent.includes("trace.yaml")) {
        suggestedNextActions.add("Run `artifact sync-trace <slice-id>` to create or refresh the trace chain.");
    }
    if (missingArtifactsForNext.includes("design.md")) {
        suggestedNextActions.add("Run `artifact derive-design <slice-id> --force` to generate the slice design.");
    }
    if (missingArtifactsForNext.includes("behaviors.feature")) {
        suggestedNextActions.add("Run `artifact derive-behavior <slice-id> --force` after refining context scenarios.");
    }
    if (missingArtifactsForNext.includes("test-spec.yaml")) {
        suggestedNextActions.add("Run `artifact derive-tests <slice-id> --force` to generate slice tests.");
    }
    if (missingGatesForNext.length > 0 && nextState) {
        suggestedNextActions.add(`Set the required gates and rerun \`slice advance <slice-id> --to ${nextState}\` when ready.`);
    }
    if (validation.issues.length > 0) {
        suggestedNextActions.add("Run `slice check <slice-id>` and resolve the reported protocol issues.");
    }
    if (suggestedNextActions.size === 0 && nextState) {
        suggestedNextActions.add(`Advance the slice with \`slice advance <slice-id> --to ${nextState}\`.`);
    }
    return new SliceStatusReport(root, sliceId, context.state, nextState, missingArtifactsForCurrent.length === 0 &&
        missingArtifactsForNext.length === 0 &&
        missingGatesForNext.length === 0 &&
        validation.ok, missingArtifactsForCurrent, missingArtifactsForNext, missingGatesForNext, validationIssues, Array.from(suggestedNextActions));
}
function loadSliceContext(root, sliceId) {
    const sliceFile = (0, validator_1.findSliceFile)(root, sliceId);
    if (!sliceFile) {
        throw new Error(`Slice \`${sliceId}\` does not exist.`);
    }
    const raw = js_yaml_1.default.load(node_fs_1.default.readFileSync(sliceFile, "utf-8"));
    if (!isPlainObject(raw)) {
        throw new Error(`Slice file \`${sliceFile}\` is not valid YAML.`);
    }
    const contextId = typeof raw.context_id === "string" ? raw.context_id : undefined;
    const state = typeof raw.status === "string" && (0, validator_1.isLifecycleState)(raw.status) ? raw.status : undefined;
    if (!contextId || !state) {
        throw new Error(`Slice file \`${sliceFile}\` is missing required status metadata.`);
    }
    const owners = isPlainObject(raw.owners)
        ? Object.fromEntries(Object.entries(raw.owners).filter(([, value]) => typeof value === "string"))
        : {};
    const requirementIds = isPlainObject(raw.source_refs) && Array.isArray(raw.source_refs.requirement_ids)
        ? raw.source_refs.requirement_ids.filter((value) => typeof value === "string")
        : [];
    const designRefs = isPlainObject(raw.source_refs) && Array.isArray(raw.source_refs.design_refs)
        ? raw.source_refs.design_refs.filter((value) => typeof value === "string")
        : [];
    const gates = isPlainObject(raw.gates)
        ? Object.fromEntries(Object.entries(raw.gates).filter(([, value]) => typeof value === "boolean"))
        : {};
    return {
        sliceFile,
        sliceDir: node_path_1.default.dirname(sliceFile),
        contextId,
        state,
        title: typeof raw.title === "string" ? raw.title : sliceId,
        goal: typeof raw.goal === "string" ? raw.goal : "",
        priority: typeof raw.priority === "string" ? raw.priority : "unknown",
        owners,
        requirementIds,
        designRefs,
        gates,
    };
}
function standardArtifactPaths(context) {
    return [
        ["slice.yaml", context.sliceFile],
        ["requirements.md", node_path_1.default.join(context.sliceDir, "requirements.md")],
        ["design.md", node_path_1.default.join(context.sliceDir, "design.md")],
        ["behaviors.feature", node_path_1.default.join(context.sliceDir, "behaviors.feature")],
        ["test-spec.yaml", node_path_1.default.join(context.sliceDir, "test-spec.yaml")],
        ["tasks.yaml", node_path_1.default.join(context.sliceDir, "tasks.yaml")],
        ["trace.yaml", node_path_1.default.join(context.sliceDir, "trace.yaml")],
        ["evidence.md", node_path_1.default.join(context.sliceDir, "evidence.md")],
    ];
}
function displayPath(root, filePath) {
    return node_path_1.default.relative(root, filePath) || filePath;
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
