"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SliceUpdateGatesResult = exports.SliceAdvanceResult = exports.SliceCreateResult = void 0;
exports.createSlice = createSlice;
exports.advanceSlice = advanceSlice;
exports.updateSliceGates = updateSliceGates;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const validator_1 = require("./validator");
class SliceCreateResult {
    root;
    contextId;
    sliceId;
    createdFiles;
    constructor(root, contextId, sliceId, createdFiles) {
        this.root = root;
        this.contextId = contextId;
        this.sliceId = sliceId;
        this.createdFiles = createdFiles;
    }
    renderText() {
        const lines = [
            `Created slice \`${this.sliceId}\` in context \`${this.contextId}\`.`,
            "Generated files:",
        ];
        lines.push(...this.createdFiles.map((filePath) => `- ${filePath}`));
        return lines.join("\n");
    }
}
exports.SliceCreateResult = SliceCreateResult;
class SliceAdvanceResult {
    root;
    sliceId;
    fromState;
    toState;
    updatedGates;
    constructor(root, sliceId, fromState, toState, updatedGates) {
        this.root = root;
        this.sliceId = sliceId;
        this.fromState = fromState;
        this.toState = toState;
        this.updatedGates = updatedGates;
    }
    renderText() {
        const lines = [
            `Advanced slice \`${this.sliceId}\` from \`${this.fromState}\` to \`${this.toState}\`.`,
        ];
        const gateNames = Object.keys(this.updatedGates);
        if (gateNames.length > 0) {
            lines.push("Updated gates:");
            lines.push(...gateNames.sort().map((name) => `- ${name}=${this.updatedGates[name]}`));
        }
        return lines.join("\n");
    }
}
exports.SliceAdvanceResult = SliceAdvanceResult;
class SliceUpdateGatesResult {
    root;
    sliceId;
    updatedGates;
    currentGates;
    constructor(root, sliceId, updatedGates, currentGates) {
        this.root = root;
        this.sliceId = sliceId;
        this.updatedGates = updatedGates;
        this.currentGates = currentGates;
    }
    renderText() {
        const lines = [`Updated gates for slice \`${this.sliceId}\`.`];
        const updatedNames = Object.keys(this.updatedGates);
        if (updatedNames.length > 0) {
            lines.push("Changed gates:");
            lines.push(...updatedNames.sort().map((name) => `- ${name}=${this.updatedGates[name]}`));
        }
        lines.push("Current gates:");
        lines.push(...Object.keys(this.currentGates).sort().map((name) => `- ${name}=${this.currentGates[name]}`));
        return lines.join("\n");
    }
}
exports.SliceUpdateGatesResult = SliceUpdateGatesResult;
function createSlice(options) {
    const { root, contextId, sliceId } = options;
    const contextDir = node_path_1.default.join(root, "contexts", contextId);
    const contextFile = node_path_1.default.join(contextDir, "context.yaml");
    if (!node_fs_1.default.existsSync(contextFile)) {
        throw new Error(`Context \`${contextId}\` does not exist.`);
    }
    const sliceDir = node_path_1.default.join(contextDir, "slices", sliceId);
    if (node_fs_1.default.existsSync(sliceDir)) {
        throw new Error(`Slice \`${sliceId}\` already exists in context \`${contextId}\`.`);
    }
    const title = options.title ?? humanizeIdentifier(sliceId);
    const goal = options.goal ?? `Deliver ${title}.`;
    const requirementValue = (options.requirementIds ?? ["REQ-TBD-001"])[0];
    const scenarioValue = `SCN-${tokenize(sliceId)}-001`;
    const testValue = `TEST-${tokenize(sliceId)}-001`;
    const taskValue = `TASK-${tokenize(sliceId)}-001`;
    node_fs_1.default.mkdirSync(sliceDir, { recursive: false });
    const createdFiles = [];
    const slicePayload = {
        id: sliceId,
        title,
        context_id: contextId,
        status: validator_1.LIFECYCLE_ORDER[0],
        priority: options.priority,
        goal,
        scope: {
            includes: [],
            excludes: [],
        },
        source_refs: {
            requirement_ids: options.requirementIds ?? [],
            design_refs: [],
        },
        owners: {
            product: options.productOwner,
            engineering: options.engineeringOwner,
        },
        gates: {
            design_ready: false,
            behavior_ready: false,
            test_ready: false,
            implementation_ready: false,
            accepted: false,
        },
    };
    const sliceYamlPath = node_path_1.default.join(sliceDir, "slice.yaml");
    node_fs_1.default.writeFileSync(sliceYamlPath, js_yaml_1.default.dump(slicePayload, { sortKeys: false, lineWidth: 120 }), "utf-8");
    createdFiles.push(sliceYamlPath);
    const replacements = {
        "<slice-id>": sliceId,
        "<Slice Title>": title,
        "<context-id>": contextId,
        "<Business goal>": goal,
        "<Describe the slice goal>": goal,
        "<REQ-ID>": requirementValue,
        "<product-owner>": options.productOwner,
        "<engineering-owner>": options.engineeringOwner,
        "<Feature Name>": title,
        "<Scenario Name>": `${title} scenario`,
        "<precondition>": "the slice prerequisites are defined",
        "<action>": "the flow is executed",
        "<expected outcome>": "the expected result is produced",
        "<module-name>": `${contextId}-module`,
        "<TEST-ID>": testValue,
        "<SCENARIO-ID>": scenarioValue,
        "<module-or-service>": `${contextId}-service`,
        "<TASK-ID>": taskValue,
        "<Task title>": `Implement ${title}`,
        "<Scope note>": "Refine the scope before advancing the slice state.",
        "<Describe the design intent>": `Describe how ${title} should be implemented.`,
        "<Describe the key tradeoff or design decision>": "Record the main design decision for this slice.",
    };
    const templateRoot = node_path_1.default.join(root, "templates", "slice");
    for (const entry of node_fs_1.default.readdirSync(templateRoot, { withFileTypes: true })) {
        if (!entry.isFile() || entry.name === "slice.yaml") {
            continue;
        }
        const templatePath = node_path_1.default.join(templateRoot, entry.name);
        const targetPath = node_path_1.default.join(sliceDir, entry.name);
        let content = node_fs_1.default.readFileSync(templatePath, "utf-8");
        for (const [source, target] of Object.entries(replacements)) {
            content = content.replaceAll(source, target);
        }
        node_fs_1.default.writeFileSync(targetPath, content, "utf-8");
        createdFiles.push(targetPath);
    }
    appendActiveSlice(contextFile, sliceId);
    createdFiles.push(contextFile);
    return new SliceCreateResult(root, contextId, sliceId, createdFiles);
}
function advanceSlice(options) {
    const sliceFile = (0, validator_1.findSliceFile)(options.root, options.sliceId);
    if (!sliceFile) {
        throw new Error(`Slice \`${options.sliceId}\` does not exist.`);
    }
    const originalContent = node_fs_1.default.readFileSync(sliceFile, "utf-8");
    const sliceData = js_yaml_1.default.load(originalContent);
    if (!isPlainObject(sliceData)) {
        throw new Error(`Slice file \`${sliceFile}\` is not valid YAML.`);
    }
    const currentState = sliceData.status;
    if (typeof currentState !== "string" || !(0, validator_1.isLifecycleState)(currentState)) {
        throw new Error(`Slice \`${options.sliceId}\` has an invalid current status.`);
    }
    if (!(0, validator_1.isLifecycleState)(options.toState)) {
        throw new Error(`Target state must be one of ${validator_1.LIFECYCLE_ORDER.join(", ")}.`);
    }
    if (currentState === options.toState) {
        throw new Error(`Slice \`${options.sliceId}\` is already in \`${options.toState}\`.`);
    }
    const expectedNextState = (0, validator_1.getNextLifecycleState)(currentState);
    if (options.toState !== expectedNextState) {
        throw new Error(expectedNextState
            ? `Slice \`${options.sliceId}\` can only advance from \`${currentState}\` to \`${expectedNextState}\`.`
            : `Slice \`${options.sliceId}\` is already at the final state.`);
    }
    const gates = ensureGatesRecord(sliceData, sliceFile);
    const updatedGates = applyGateUpdates(gates, options.gateUpdates ?? []);
    enforceArtifactRequirements(sliceFile, options.toState);
    enforceGateRequirements(options.toState, gates, options.sliceId);
    sliceData.status = options.toState;
    sliceData.gates = gates;
    const nextContent = js_yaml_1.default.dump(sliceData, { sortKeys: false, lineWidth: 120 });
    node_fs_1.default.writeFileSync(sliceFile, nextContent, "utf-8");
    const validation = (0, validator_1.validateSlice)(options.root, options.sliceId);
    if (!validation.ok) {
        node_fs_1.default.writeFileSync(sliceFile, originalContent, "utf-8");
        throw new Error(validation.renderText());
    }
    return new SliceAdvanceResult(options.root, options.sliceId, currentState, options.toState, updatedGates);
}
function updateSliceGates(options) {
    if (options.gateUpdates.length === 0) {
        throw new Error("At least one gate update is required. Use --set-gate gate_name=true|false.");
    }
    const sliceFile = (0, validator_1.findSliceFile)(options.root, options.sliceId);
    if (!sliceFile) {
        throw new Error(`Slice \`${options.sliceId}\` does not exist.`);
    }
    const originalContent = node_fs_1.default.readFileSync(sliceFile, "utf-8");
    const sliceData = js_yaml_1.default.load(originalContent);
    if (!isPlainObject(sliceData)) {
        throw new Error(`Slice file \`${sliceFile}\` is not valid YAML.`);
    }
    const gates = ensureGatesRecord(sliceData, sliceFile);
    const updatedGates = applyGateUpdates(gates, options.gateUpdates);
    sliceData.gates = gates;
    const nextContent = js_yaml_1.default.dump(sliceData, { sortKeys: false, lineWidth: 120 });
    node_fs_1.default.writeFileSync(sliceFile, nextContent, "utf-8");
    const validation = (0, validator_1.validateSlice)(options.root, options.sliceId);
    if (!validation.ok) {
        node_fs_1.default.writeFileSync(sliceFile, originalContent, "utf-8");
        throw new Error(validation.renderText());
    }
    return new SliceUpdateGatesResult(options.root, options.sliceId, updatedGates, gates);
}
function appendActiveSlice(contextFile, sliceId) {
    const data = js_yaml_1.default.load(node_fs_1.default.readFileSync(contextFile, "utf-8"));
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
        throw new Error(`Context file \`${contextFile}\` is not valid YAML.`);
    }
    const contextData = data;
    const activeSlices = contextData.active_slices;
    if (!Array.isArray(activeSlices)) {
        throw new Error(`Context file \`${contextFile}\` must contain an \`active_slices\` list.`);
    }
    if (!activeSlices.includes(sliceId)) {
        activeSlices.push(sliceId);
    }
    contextData.active_slices = activeSlices;
    node_fs_1.default.writeFileSync(contextFile, js_yaml_1.default.dump(contextData, { sortKeys: false, lineWidth: 120 }), "utf-8");
}
function ensureGatesRecord(sliceData, sliceFile) {
    const gates = sliceData.gates;
    if (!isPlainObject(gates)) {
        throw new Error(`Slice file \`${sliceFile}\` must contain a \`gates\` object.`);
    }
    const gateRecord = {};
    for (const [name, value] of Object.entries(gates)) {
        if (typeof value !== "boolean") {
            throw new Error(`Gate \`${name}\` in \`${sliceFile}\` must be a boolean.`);
        }
        gateRecord[name] = value;
    }
    return gateRecord;
}
function applyGateUpdates(gates, updates) {
    const applied = {};
    for (const update of updates) {
        const [rawName, rawValue] = update.split("=", 2);
        const name = rawName?.trim();
        const value = rawValue?.trim().toLowerCase();
        if (!name || (value !== "true" && value !== "false")) {
            throw new Error(`Invalid gate update \`${update}\`. Use the form gate_name=true|false.`);
        }
        const parsedValue = value === "true";
        gates[name] = parsedValue;
        applied[name] = parsedValue;
    }
    return applied;
}
function enforceArtifactRequirements(sliceFile, targetState) {
    const sliceDir = node_path_1.default.dirname(sliceFile);
    for (const artifact of (0, validator_1.getRequiredArtifactsForState)(targetState)) {
        const artifactPath = artifact === "slice.yaml" ? sliceFile : node_path_1.default.join(sliceDir, artifact);
        if (!node_fs_1.default.existsSync(artifactPath)) {
            throw new Error(`State \`${targetState}\` requires \`${artifact}\` before advancing.`);
        }
    }
}
function enforceGateRequirements(targetState, gates, sliceId) {
    const missing = (0, validator_1.getRequiredGatesForState)(targetState).filter((gate) => gates[gate] !== true);
    if (missing.length > 0) {
        throw new Error(`Slice \`${sliceId}\` cannot advance to \`${targetState}\` until these gates are true: ${missing.join(", ")}.`);
    }
}
function humanizeIdentifier(value) {
    return value
        .replaceAll("_", "-")
        .split("-")
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}
function tokenize(value) {
    return value
        .toUpperCase()
        .replaceAll("_", "-")
        .split("")
        .filter((char) => /[A-Z0-9-]/.test(char))
        .join("");
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
