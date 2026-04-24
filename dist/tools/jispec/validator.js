"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationResult = exports.TraceReport = exports.REQUIRED_GATES_BY_STATE = exports.REQUIRED_ARTIFACTS_BY_STATE = exports.LIFECYCLE_ORDER = exports.REQUIREMENT_ID_PATTERN = void 0;
exports.validateRepository = validateRepository;
exports.validateSlice = validateSlice;
exports.validateSliceTraceOnly = validateSliceTraceOnly;
exports.buildTraceReport = buildTraceReport;
exports.findSliceFile = findSliceFile;
exports.isLifecycleState = isLifecycleState;
exports.getNextLifecycleState = getNextLifecycleState;
exports.getRequiredArtifactsForState = getRequiredArtifactsForState;
exports.getRequiredGatesForState = getRequiredGatesForState;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const _2020_1 = __importDefault(require("ajv/dist/2020"));
const js_yaml_1 = __importDefault(require("js-yaml"));
exports.REQUIREMENT_ID_PATTERN = /\bREQ-[A-Z0-9-]+-\d+\b/g;
exports.LIFECYCLE_ORDER = [
    "proposed",
    "framed",
    "designed",
    "behavior-defined",
    "test-defined",
    "implementing",
    "reviewing",
    "accepted",
    "released",
];
exports.REQUIRED_ARTIFACTS_BY_STATE = {
    proposed: ["slice.yaml"],
    framed: ["slice.yaml", "requirements.md"],
    designed: ["slice.yaml", "requirements.md", "design.md"],
    "behavior-defined": ["slice.yaml", "requirements.md", "design.md", "behaviors.feature", "trace.yaml"],
    "test-defined": ["slice.yaml", "requirements.md", "design.md", "behaviors.feature", "trace.yaml", "test-spec.yaml"],
    implementing: [
        "slice.yaml",
        "requirements.md",
        "design.md",
        "behaviors.feature",
        "trace.yaml",
        "test-spec.yaml",
        "tasks.yaml",
    ],
    reviewing: [
        "slice.yaml",
        "requirements.md",
        "design.md",
        "behaviors.feature",
        "trace.yaml",
        "test-spec.yaml",
        "tasks.yaml",
        "evidence.md",
    ],
    accepted: [
        "slice.yaml",
        "requirements.md",
        "design.md",
        "behaviors.feature",
        "trace.yaml",
        "test-spec.yaml",
        "tasks.yaml",
        "evidence.md",
    ],
    released: [
        "slice.yaml",
        "requirements.md",
        "design.md",
        "behaviors.feature",
        "trace.yaml",
        "test-spec.yaml",
        "tasks.yaml",
        "evidence.md",
    ],
};
exports.REQUIRED_GATES_BY_STATE = {
    proposed: [],
    framed: [],
    designed: ["design_ready"],
    "behavior-defined": ["design_ready", "behavior_ready"],
    "test-defined": ["design_ready", "behavior_ready", "test_ready"],
    implementing: ["design_ready", "behavior_ready", "test_ready"],
    reviewing: ["design_ready", "behavior_ready", "test_ready", "implementation_ready"],
    accepted: ["design_ready", "behavior_ready", "test_ready", "implementation_ready", "accepted"],
    released: ["design_ready", "behavior_ready", "test_ready", "implementation_ready", "accepted"],
};
class TraceReport {
    root;
    sliceId;
    contextId;
    tracePath;
    links;
    nodeTypeCounts;
    relationCounts;
    validation;
    constructor(root, sliceId, contextId, tracePath, links, nodeTypeCounts, relationCounts, validation) {
        this.root = root;
        this.sliceId = sliceId;
        this.contextId = contextId;
        this.tracePath = tracePath;
        this.links = links;
        this.nodeTypeCounts = nodeTypeCounts;
        this.relationCounts = relationCounts;
        this.validation = validation;
    }
    toDict() {
        return {
            ok: this.validation.ok,
            root: this.root,
            slice_id: this.sliceId,
            context_id: this.contextId,
            trace_path: displayPath(this.root, this.tracePath),
            link_count: this.links.length,
            node_type_counts: this.nodeTypeCounts,
            relation_counts: this.relationCounts,
            links: this.links,
            issues: this.validation.issues,
        };
    }
    renderText() {
        const lines = [
            `Trace ${this.validation.ok ? "valid" : "invalid"} for slice \`${this.sliceId}\``,
            `Path: ${displayPath(this.root, this.tracePath)}`,
            `Links: ${this.links.length}`,
        ];
        const nodeTypes = Object.keys(this.nodeTypeCounts).sort();
        if (nodeTypes.length > 0) {
            lines.push("Node types:");
            lines.push(...nodeTypes.map((type) => `- ${type}: ${this.nodeTypeCounts[type]}`));
        }
        const relations = Object.keys(this.relationCounts).sort();
        if (relations.length > 0) {
            lines.push("Relations:");
            lines.push(...relations.map((relation) => `- ${relation}: ${this.relationCounts[relation]}`));
        }
        lines.push("Links:");
        lines.push(...this.links.map((link, index) => `- ${index + 1}. ${link.from.type}:${link.from.id} -[${link.relation}]-> ${link.to.type}:${link.to.id}`));
        if (!this.validation.ok) {
            lines.push("Issues:");
            lines.push(...this.validation.issues.map((issue) => `- [${issue.code}] ${issue.path}: ${issue.message}`));
        }
        return lines.join("\n");
    }
}
exports.TraceReport = TraceReport;
class ValidationResult {
    root;
    issues;
    constructor(root, issues = []) {
        this.root = root;
        this.issues = issues;
    }
    get ok() {
        return this.issues.length === 0;
    }
    add(code, issuePath, message) {
        this.issues.push({
            code,
            path: displayPath(this.root, issuePath),
            message,
        });
    }
    toDict() {
        return {
            ok: this.ok,
            root: this.root,
            issue_count: this.issues.length,
            issues: this.issues,
        };
    }
    renderText() {
        const header = `JiSpec validation ${this.ok ? "passed" : "failed"} for ${this.root}`;
        if (this.ok) {
            return `${header}\n0 issues found.`;
        }
        const lines = [header, `${this.issues.length} issue(s) found:`];
        for (const issue of this.issues) {
            lines.push(`- [${issue.code}] ${issue.path}: ${issue.message}`);
        }
        return lines.join("\n");
    }
}
exports.ValidationResult = ValidationResult;
function validateRepository(root) {
    const result = new ValidationResult(root);
    const { contextIndex, sliceIndex, schemas, agentIds } = buildIndexes(root, result);
    validateContextActiveSlices(root, contextIndex, sliceIndex, result);
    for (const sliceId of Object.keys(sliceIndex).sort()) {
        const sliceResult = validateSlice(root, sliceId, { contextIndex, sliceIndex, schemas, agentIds });
        result.issues.push(...sliceResult.issues);
    }
    return result;
}
function validateSlice(root, sliceId, cache) {
    const result = new ValidationResult(root);
    const { contextIndex, schemas, agentIds } = cache ?? buildIndexes(root, result);
    const sliceFile = findSliceFile(root, sliceId);
    if (!sliceFile) {
        result.add("SLICE_NOT_FOUND", node_path_1.default.join(root, "contexts"), `Slice \`${sliceId}\` does not exist.`);
        return result;
    }
    const sliceData = loadYaml(sliceFile, result);
    validateFileAgainstSchema(sliceFile, sliceData, schemas.slice, result);
    validateSliceSemantics(sliceFile, sliceData, contextIndex, result);
    validateSliceLifecycle(sliceFile, sliceData, result);
    if (!isObject(sliceData)) {
        return result;
    }
    const state = typeof sliceData.status === "string" ? sliceData.status : undefined;
    if (state && stateAtLeast(state, "behavior-defined")) {
        validateSliceTrace(root, sliceFile, sliceData, schemas.trace, result);
    }
    validateSliceTasks(root, sliceFile, agentIds, schemas.tasks, result);
    return result;
}
function validateSliceTraceOnly(root, sliceId) {
    const result = new ValidationResult(root);
    const { schemas } = buildIndexes(root, result);
    const sliceFile = findSliceFile(root, sliceId);
    if (!sliceFile) {
        result.add("SLICE_NOT_FOUND", node_path_1.default.join(root, "contexts"), `Slice \`${sliceId}\` does not exist.`);
        return result;
    }
    const sliceData = loadYaml(sliceFile, result);
    if (!isObject(sliceData)) {
        return result;
    }
    validateSliceTrace(root, sliceFile, sliceData, schemas.trace, result);
    return result;
}
function buildTraceReport(root, sliceId) {
    const validation = validateSliceTraceOnly(root, sliceId);
    const sliceFile = findSliceFile(root, sliceId);
    if (!sliceFile) {
        throw new Error(`Slice \`${sliceId}\` does not exist.`);
    }
    const sliceData = js_yaml_1.default.load(node_fs_1.default.readFileSync(sliceFile, "utf-8"));
    if (!isObject(sliceData)) {
        throw new Error(`Slice file \`${sliceFile}\` is not valid YAML.`);
    }
    const contextId = typeof sliceData.context_id === "string"
        ? sliceData.context_id
        : node_path_1.default.basename(node_path_1.default.dirname(node_path_1.default.dirname(node_path_1.default.dirname(sliceFile))));
    const tracePath = node_path_1.default.join(node_path_1.default.dirname(sliceFile), "trace.yaml");
    const traceData = node_fs_1.default.existsSync(tracePath) ? js_yaml_1.default.load(node_fs_1.default.readFileSync(tracePath, "utf-8")) : undefined;
    const links = isObject(traceData) && Array.isArray(traceData.links) ? normalizeTraceLinks(traceData.links) : [];
    const nodeTypeCounts = {};
    const relationCounts = {};
    for (const link of links) {
        nodeTypeCounts[link.from.type] = (nodeTypeCounts[link.from.type] ?? 0) + 1;
        nodeTypeCounts[link.to.type] = (nodeTypeCounts[link.to.type] ?? 0) + 1;
        relationCounts[link.relation] = (relationCounts[link.relation] ?? 0) + 1;
    }
    return new TraceReport(root, sliceId, contextId, tracePath, links, nodeTypeCounts, relationCounts, validation);
}
function findSliceFile(root, sliceId) {
    const contextsRoot = node_path_1.default.join(root, "contexts");
    if (!node_fs_1.default.existsSync(contextsRoot)) {
        return undefined;
    }
    for (const contextEntry of node_fs_1.default.readdirSync(contextsRoot, { withFileTypes: true })) {
        if (!contextEntry.isDirectory()) {
            continue;
        }
        const candidate = node_path_1.default.join(contextsRoot, contextEntry.name, "slices", sliceId, "slice.yaml");
        if (node_fs_1.default.existsSync(candidate)) {
            return candidate;
        }
    }
    return undefined;
}
function isLifecycleState(value) {
    return exports.LIFECYCLE_ORDER.includes(value);
}
function getNextLifecycleState(currentState) {
    const index = exports.LIFECYCLE_ORDER.indexOf(currentState);
    return index >= 0 ? exports.LIFECYCLE_ORDER[index + 1] : undefined;
}
function getRequiredArtifactsForState(state) {
    return exports.REQUIRED_ARTIFACTS_BY_STATE[state] ?? [];
}
function getRequiredGatesForState(state) {
    return exports.REQUIRED_GATES_BY_STATE[state] ?? [];
}
function buildIndexes(root, result) {
    if (!node_fs_1.default.existsSync(root)) {
        result.add("ROOT_NOT_FOUND", root, "Repository root does not exist.");
        return { contextIndex: {}, sliceIndex: {}, schemas: {}, agentIds: new Set() };
    }
    const projectPath = node_path_1.default.join(root, "jiproject", "project.yaml");
    const projectData = loadYaml(projectPath, result);
    const schemas = loadSchemas(root, result);
    const agentIds = loadAgentIds(root, result);
    validateFileAgainstSchema(projectPath, projectData, schemas.project, result);
    validateProjectSemantics(root, projectPath, projectData, result);
    const contextIndex = {};
    for (const contextFile of findFiles(node_path_1.default.join(root, "contexts"), "context.yaml")) {
        const data = loadYaml(contextFile, result);
        validateFileAgainstSchema(contextFile, data, schemas.context, result);
        if (isObject(data) && typeof data.id === "string") {
            contextIndex[data.id] = data;
        }
    }
    const sliceIndex = {};
    for (const sliceFile of findSliceFiles(root)) {
        const data = loadYaml(sliceFile, result);
        validateFileAgainstSchema(sliceFile, data, schemas.slice, result);
        if (isObject(data) && typeof data.id === "string") {
            sliceIndex[data.id] = data;
        }
    }
    for (const contractsFile of findFiles(node_path_1.default.join(root, "contexts"), "contracts.yaml")) {
        if (!contractsFile.includes(`${node_path_1.default.sep}design${node_path_1.default.sep}`)) {
            continue;
        }
        const data = loadYaml(contractsFile, result);
        validateFileAgainstSchema(contractsFile, data, schemas.contracts, result);
    }
    return { contextIndex, sliceIndex, schemas, agentIds };
}
function validateProjectSemantics(root, projectPath, projectData, result) {
    if (!isObject(projectData)) {
        return;
    }
    const sourceDocuments = projectData.source_documents;
    if (!isObject(sourceDocuments)) {
        result.add("PROJECT_SOURCE_DOCUMENTS_INVALID", projectPath, "`source_documents` must be an object mapping document names to paths.");
        return;
    }
    for (const [name, relativePath] of Object.entries(sourceDocuments)) {
        if (typeof relativePath !== "string") {
            result.add("PROJECT_SOURCE_DOCUMENT_PATH_INVALID", projectPath, `\`source_documents.${name}\` must be a string path.`);
            continue;
        }
        const target = node_path_1.default.join(root, relativePath);
        if (!node_fs_1.default.existsSync(target)) {
            result.add("PROJECT_SOURCE_DOCUMENT_MISSING", projectPath, `Referenced source document \`${relativePath}\` does not exist.`);
        }
    }
}
function validateSliceSemantics(sliceFile, sliceData, contextIndex, result) {
    if (!isObject(sliceData)) {
        return;
    }
    const contextId = typeof sliceData.context_id === "string" ? sliceData.context_id : undefined;
    const expectedContextId = node_path_1.default.basename(node_path_1.default.dirname(node_path_1.default.dirname(node_path_1.default.dirname(sliceFile))));
    if (contextId !== expectedContextId) {
        result.add("SLICE_CONTEXT_MISMATCH", sliceFile, `\`context_id\` is \`${contextId}\` but the slice lives under \`${expectedContextId}\`.`);
    }
    if (contextId && !(contextId in contextIndex)) {
        result.add("SLICE_CONTEXT_UNKNOWN", sliceFile, `Referenced context \`${contextId}\` does not exist.`);
    }
}
function validateSliceLifecycle(sliceFile, sliceData, result) {
    if (!isObject(sliceData)) {
        return;
    }
    const state = typeof sliceData.status === "string" ? sliceData.status : undefined;
    if (!state) {
        result.add("SLICE_STATUS_INVALID", sliceFile, "`status` must be a string.");
        return;
    }
    if (!isLifecycleState(state)) {
        result.add("SLICE_STATUS_UNKNOWN", sliceFile, `\`status\` must be one of ${exports.LIFECYCLE_ORDER.join(", ")}.`);
        return;
    }
    const sliceDir = node_path_1.default.dirname(sliceFile);
    for (const artifact of getRequiredArtifactsForState(state)) {
        const artifactPath = artifact === "slice.yaml" ? sliceFile : node_path_1.default.join(sliceDir, artifact);
        if (!node_fs_1.default.existsSync(artifactPath)) {
            result.add("SLICE_ARTIFACT_MISSING", artifactPath, `Slice state \`${state}\` requires \`${artifact}\`.`);
        }
    }
}
function validateContextActiveSlices(root, contextIndex, sliceIndex, result) {
    for (const contextId of Object.keys(contextIndex).sort()) {
        const contextFile = node_path_1.default.join(root, "contexts", contextId, "context.yaml");
        const data = contextIndex[contextId];
        const activeSlices = data.active_slices;
        if (!Array.isArray(activeSlices)) {
            result.add("CONTEXT_ACTIVE_SLICES_INVALID", contextFile, "`active_slices` must be a list.");
            continue;
        }
        for (const sliceId of activeSlices) {
            if (typeof sliceId === "string" && !(sliceId in sliceIndex)) {
                result.add("CONTEXT_ACTIVE_SLICE_MISSING", contextFile, `Active slice \`${sliceId}\` does not exist on disk.`);
            }
        }
    }
}
function validateSliceTrace(root, sliceFile, sliceData, traceSchema, result) {
    const sliceDir = node_path_1.default.dirname(sliceFile);
    const sliceId = typeof sliceData.id === "string" ? sliceData.id : node_path_1.default.basename(sliceDir);
    const contextId = typeof sliceData.context_id === "string" ? sliceData.context_id : node_path_1.default.basename(node_path_1.default.dirname(node_path_1.default.dirname(sliceDir)));
    const tracePath = node_path_1.default.join(sliceDir, "trace.yaml");
    if (!node_fs_1.default.existsSync(tracePath)) {
        result.add("TRACE_FILE_MISSING", sliceDir, `Slice \`${sliceId}\` is missing \`trace.yaml\`.`);
        return;
    }
    const traceData = loadYaml(tracePath, result);
    validateFileAgainstSchema(tracePath, traceData, traceSchema, result);
    if (!isObject(traceData)) {
        return;
    }
    const requirementIds = collectRequirementIds(node_path_1.default.join(root, "docs", "input", "requirements.md"));
    const testIds = collectTestIds(node_path_1.default.join(sliceDir, "test-spec.yaml"), result);
    const scenarioIds = collectScenarioIds(root, contextId, sliceDir);
    const invariantIds = collectInvariantIds(root, contextId, result);
    const links = traceData.links;
    if (!Array.isArray(links)) {
        result.add("TRACE_LINKS_INVALID", tracePath, "`links` must be a list.");
        return;
    }
    if (links.length === 0) {
        result.add("TRACE_LINKS_EMPTY", tracePath, "Trace must contain at least one link.");
        return;
    }
    const nodeTypes = new Set();
    links.forEach((link, index) => {
        if (!isObject(link)) {
            result.add("TRACE_LINK_INVALID", tracePath, `Trace link at index ${index} must be an object.`);
            return;
        }
        for (const side of ["from", "to"]) {
            const node = link[side];
            if (!isObject(node)) {
                result.add("TRACE_NODE_INVALID", tracePath, `Trace link at index ${index} has a non-object \`${side}\` node.`);
                continue;
            }
            const nodeType = typeof node.type === "string" ? node.type : undefined;
            const nodeId = typeof node.id === "string" ? node.id : undefined;
            if (nodeType) {
                nodeTypes.add(nodeType);
            }
            validateTraceNode(tracePath, index, side, nodeType, nodeId, requirementIds, scenarioIds, testIds, invariantIds, result);
        }
    });
    for (const requiredType of ["requirement", "scenario", "test"]) {
        if (!nodeTypes.has(requiredType)) {
            result.add("TRACE_CHAIN_INCOMPLETE", tracePath, `Trace for slice \`${sliceId}\` must include at least one \`${requiredType}\` node.`);
        }
    }
}
function validateSliceTasks(root, sliceFile, agentIds, tasksSchema, result) {
    const sliceDir = node_path_1.default.dirname(sliceFile);
    const tasksPath = node_path_1.default.join(sliceDir, "tasks.yaml");
    if (!node_fs_1.default.existsSync(tasksPath)) {
        return;
    }
    const tasksData = loadYaml(tasksPath, result);
    validateFileAgainstSchema(tasksPath, tasksData, tasksSchema, result);
    if (!isObject(tasksData) || !Array.isArray(tasksData.tasks)) {
        return;
    }
    const seenIds = new Set();
    const declaredIds = new Set();
    const dependenciesToCheck = [];
    const taskStatusById = new Map();
    for (const [index, task] of tasksData.tasks.entries()) {
        if (!isObject(task)) {
            result.add("TASK_INVALID", tasksPath, `Task at index ${index} must be an object.`);
            continue;
        }
        const taskId = typeof task.id === "string" ? task.id : undefined;
        const owner = typeof task.owner === "string" ? task.owner : undefined;
        if (taskId) {
            if (seenIds.has(taskId)) {
                result.add("TASK_ID_DUPLICATE", tasksPath, `Task id \`${taskId}\` is duplicated.`);
            }
            seenIds.add(taskId);
            declaredIds.add(taskId);
            if (typeof task.status === "string") {
                taskStatusById.set(taskId, task.status);
            }
        }
        if (owner && agentIds.size > 0 && !agentIds.has(owner)) {
            result.add("TASK_OWNER_UNKNOWN", tasksPath, `Task \`${taskId ?? `index ${index}`}\` references unknown agent owner \`${owner}\`.`);
        }
        const dependsOn = Array.isArray(task.depends_on)
            ? task.depends_on.filter((value) => typeof value === "string")
            : [];
        if (taskId && dependsOn.length > 0) {
            dependenciesToCheck.push({ taskId, dependsOn });
        }
    }
    for (const dependencyGroup of dependenciesToCheck) {
        for (const dependencyId of dependencyGroup.dependsOn) {
            if (dependencyId === dependencyGroup.taskId) {
                result.add("TASK_DEPENDENCY_SELF", tasksPath, `Task \`${dependencyGroup.taskId}\` cannot depend on itself.`);
                continue;
            }
            if (!declaredIds.has(dependencyId)) {
                result.add("TASK_DEPENDENCY_UNKNOWN", tasksPath, `Task \`${dependencyGroup.taskId}\` depends on unknown task \`${dependencyId}\`.`);
            }
        }
    }
    validateTaskDependencyCycles(tasksPath, dependenciesToCheck, result);
    validateTaskDependencyStatuses(tasksPath, dependenciesToCheck, taskStatusById, result);
}
function validateTaskDependencyCycles(tasksPath, dependenciesToCheck, result) {
    const dependencyMap = new Map();
    for (const dependencyGroup of dependenciesToCheck) {
        dependencyMap.set(dependencyGroup.taskId, dependencyGroup.dependsOn);
    }
    const visiting = new Set();
    const visited = new Set();
    for (const taskId of dependencyMap.keys()) {
        visitTaskDependency(taskId, dependencyMap, visiting, visited, result, tasksPath);
    }
}
function validateTaskDependencyStatuses(tasksPath, dependenciesToCheck, taskStatusById, result) {
    for (const dependencyGroup of dependenciesToCheck) {
        const taskStatus = taskStatusById.get(dependencyGroup.taskId);
        if (taskStatus !== "in_progress" && taskStatus !== "completed") {
            continue;
        }
        const unmetDependencies = dependencyGroup.dependsOn.filter((dependencyId) => taskStatusById.get(dependencyId) !== "completed");
        if (unmetDependencies.length > 0) {
            result.add("TASK_DEPENDENCY_UNSATISFIED", tasksPath, `Task \`${dependencyGroup.taskId}\` cannot be \`${taskStatus}\` until these dependencies are completed: ${unmetDependencies.join(", ")}.`);
        }
    }
}
function visitTaskDependency(taskId, dependencyMap, visiting, visited, result, tasksPath) {
    if (visited.has(taskId)) {
        return;
    }
    if (visiting.has(taskId)) {
        result.add("TASK_DEPENDENCY_CYCLE", tasksPath, `Task dependency graph contains a cycle involving \`${taskId}\`.`);
        return;
    }
    visiting.add(taskId);
    for (const dependencyId of dependencyMap.get(taskId) ?? []) {
        if (!dependencyMap.has(dependencyId)) {
            continue;
        }
        visitTaskDependency(dependencyId, dependencyMap, visiting, visited, result, tasksPath);
    }
    visiting.delete(taskId);
    visited.add(taskId);
}
function normalizeTraceLinks(rawLinks) {
    const links = [];
    for (const link of rawLinks) {
        if (!isObject(link) || !isObject(link.from) || !isObject(link.to)) {
            continue;
        }
        const fromType = typeof link.from.type === "string" ? link.from.type : undefined;
        const fromId = typeof link.from.id === "string" ? link.from.id : undefined;
        const toType = typeof link.to.type === "string" ? link.to.type : undefined;
        const toId = typeof link.to.id === "string" ? link.to.id : undefined;
        const relation = typeof link.relation === "string" ? link.relation : undefined;
        if (!fromType || !fromId || !toType || !toId || !relation) {
            continue;
        }
        links.push({
            from: { type: fromType, id: fromId },
            to: { type: toType, id: toId },
            relation,
        });
    }
    return links;
}
function validateTraceNode(tracePath, index, side, nodeType, nodeId, requirementIds, scenarioIds, testIds, invariantIds, result) {
    if (!nodeType || !nodeId) {
        return;
    }
    if (nodeType === "requirement" && !requirementIds.has(nodeId)) {
        result.add("TRACE_REQUIREMENT_UNKNOWN", tracePath, `Trace link at index ${index} references unknown requirement \`${nodeId}\` in \`${side}\`.`);
    }
    else if (nodeType === "scenario" && !scenarioIds.has(nodeId)) {
        result.add("TRACE_SCENARIO_UNKNOWN", tracePath, `Trace link at index ${index} references unknown scenario \`${nodeId}\` in \`${side}\`.`);
    }
    else if (nodeType === "test" && !testIds.has(nodeId)) {
        result.add("TRACE_TEST_UNKNOWN", tracePath, `Trace link at index ${index} references unknown test \`${nodeId}\` in \`${side}\`.`);
    }
    else if (nodeType === "invariant" && !invariantIds.has(nodeId)) {
        result.add("TRACE_INVARIANT_UNKNOWN", tracePath, `Trace link at index ${index} references unknown invariant \`${nodeId}\` in \`${side}\`.`);
    }
}
function collectRequirementIds(requirementsPath) {
    if (!node_fs_1.default.existsSync(requirementsPath)) {
        return new Set();
    }
    const content = node_fs_1.default.readFileSync(requirementsPath, "utf-8");
    return new Set(content.match(exports.REQUIREMENT_ID_PATTERN) ?? []);
}
function collectTestIds(testSpecPath, result) {
    if (!node_fs_1.default.existsSync(testSpecPath)) {
        result.add("TEST_SPEC_MISSING", testSpecPath, "Missing `test-spec.yaml` required for trace validation.");
        return new Set();
    }
    const data = loadYaml(testSpecPath, result);
    if (!isObject(data) || !Array.isArray(data.tests)) {
        result.add("TEST_SPEC_INVALID", testSpecPath, "`tests` must be a list.");
        return new Set();
    }
    return new Set(data.tests
        .filter(isObject)
        .map((test) => test.id)
        .filter((id) => typeof id === "string"));
}
function collectScenarioIds(root, contextId, sliceDir) {
    const scenarioIds = new Set();
    const scenarioDir = node_path_1.default.join(root, "contexts", contextId, "behavior", "scenarios");
    if (node_fs_1.default.existsSync(scenarioDir)) {
        for (const entry of node_fs_1.default.readdirSync(scenarioDir, { withFileTypes: true })) {
            if (entry.isFile() && entry.name.endsWith(".feature")) {
                scenarioIds.add(node_path_1.default.basename(entry.name, ".feature"));
            }
        }
    }
    const behaviorsPath = node_path_1.default.join(sliceDir, "behaviors.feature");
    if (node_fs_1.default.existsSync(behaviorsPath)) {
        const content = node_fs_1.default.readFileSync(behaviorsPath, "utf-8");
        for (const token of extractTokenIds(content, "SCN-")) {
            scenarioIds.add(token);
        }
    }
    return scenarioIds;
}
function collectInvariantIds(root, contextId, result) {
    const invariantsPath = node_path_1.default.join(root, "contexts", contextId, "domain", "invariants.yaml");
    if (!node_fs_1.default.existsSync(invariantsPath)) {
        return new Set();
    }
    const data = loadYaml(invariantsPath, result);
    if (!isObject(data) || !Array.isArray(data.invariants)) {
        result.add("INVARIANTS_INVALID", invariantsPath, "`invariants` must be a list.");
        return new Set();
    }
    return new Set(data.invariants
        .filter(isObject)
        .map((item) => item.id)
        .filter((id) => typeof id === "string"));
}
function extractTokenIds(content, prefix) {
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escapedPrefix}[A-Z0-9-]+\\b`, "g");
    return new Set(content.match(pattern) ?? []);
}
function loadSchemas(root, result) {
    const schemaDir = node_path_1.default.join(root, "schemas");
    const schemaNames = {
        project: "project.schema.json",
        context: "context.schema.json",
        slice: "slice.schema.json",
        trace: "trace.schema.json",
        contracts: "contracts.schema.json",
        tasks: "tasks.schema.json",
    };
    const schemas = {};
    for (const [key, filename] of Object.entries(schemaNames)) {
        const schemaPath = node_path_1.default.join(schemaDir, filename);
        if (!node_fs_1.default.existsSync(schemaPath)) {
            result.add("SCHEMA_MISSING", schemaPath, `Required schema \`${filename}\` does not exist.`);
            continue;
        }
        try {
            schemas[key] = JSON.parse(node_fs_1.default.readFileSync(schemaPath, "utf-8"));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            result.add("SCHEMA_INVALID_JSON", schemaPath, `Invalid JSON: ${message}`);
        }
    }
    return schemas;
}
function loadAgentIds(root, result) {
    const agentsPath = node_path_1.default.join(root, "agents", "agents.yaml");
    if (!node_fs_1.default.existsSync(agentsPath)) {
        return new Set();
    }
    const data = loadYaml(agentsPath, result);
    if (!isObject(data) || !Array.isArray(data.agents)) {
        result.add("AGENTS_INVALID", agentsPath, "`agents` must be a list.");
        return new Set();
    }
    return new Set(data.agents
        .filter(isObject)
        .map((agent) => agent.id)
        .filter((id) => typeof id === "string"));
}
function validateFileAgainstSchema(filePath, data, schema, result) {
    if (!schema || data === undefined || data === null) {
        return;
    }
    const ajv = new _2020_1.default({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const ok = validate(data);
    if (ok || !validate.errors) {
        return;
    }
    for (const error of validate.errors) {
        const location = error.instancePath ? error.instancePath.replace(/^\//, "").replace(/\//g, ".") : "";
        const suffix = location ? ` at \`${location}\`` : "";
        result.add("SCHEMA_VALIDATION_FAILED", filePath, `${error.message ?? "Schema validation failed"}${suffix}`);
    }
}
function loadYaml(filePath, result) {
    if (!node_fs_1.default.existsSync(filePath)) {
        result.add("FILE_MISSING", filePath, "Expected file does not exist.");
        return undefined;
    }
    try {
        return js_yaml_1.default.load(node_fs_1.default.readFileSync(filePath, "utf-8"));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.add("YAML_PARSE_FAILED", filePath, `Invalid YAML: ${message}`);
        return undefined;
    }
}
function stateAtLeast(currentState, minimumState) {
    return exports.LIFECYCLE_ORDER.indexOf(currentState) >=
        exports.LIFECYCLE_ORDER.indexOf(minimumState);
}
function displayPath(root, issuePath) {
    return node_path_1.default.relative(root, issuePath) || issuePath;
}
function findFiles(root, filename) {
    if (!node_fs_1.default.existsSync(root)) {
        return [];
    }
    const results = [];
    for (const entry of node_fs_1.default.readdirSync(root, { withFileTypes: true })) {
        const fullPath = node_path_1.default.join(root, entry.name);
        if (entry.isDirectory()) {
            results.push(...findFiles(fullPath, filename));
        }
        else if (entry.isFile() && entry.name === filename) {
            results.push(fullPath);
        }
    }
    return results;
}
function findSliceFiles(root) {
    const contextsRoot = node_path_1.default.join(root, "contexts");
    const results = [];
    if (!node_fs_1.default.existsSync(contextsRoot)) {
        return results;
    }
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
                results.push(sliceFile);
            }
        }
    }
    return results;
}
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
