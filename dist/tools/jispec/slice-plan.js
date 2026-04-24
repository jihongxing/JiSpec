"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlicePlanResult = void 0;
exports.planSlice = planSlice;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const tasks_1 = require("./tasks");
const validator_1 = require("./validator");
class SlicePlanResult {
    root;
    sliceId;
    writtenFiles;
    taskCount;
    taskOwners;
    constructor(root, sliceId, writtenFiles, taskCount, taskOwners) {
        this.root = root;
        this.sliceId = sliceId;
        this.writtenFiles = writtenFiles;
        this.taskCount = taskCount;
        this.taskOwners = taskOwners;
    }
    renderText() {
        const lines = [
            `Planned tasks for slice \`${this.sliceId}\`.`,
            `Task count: ${this.taskCount}`,
            "Written files:",
            ...this.writtenFiles.map((filePath) => `- ${filePath}`),
        ];
        if (this.taskOwners.length > 0) {
            lines.push("Owners:");
            lines.push(...this.taskOwners.map((owner) => `- ${owner}`));
        }
        return lines.join("\n");
    }
}
exports.SlicePlanResult = SlicePlanResult;
function planSlice(root, sliceId, force = false) {
    const sliceFile = (0, validator_1.findSliceFile)(root, sliceId);
    if (!sliceFile) {
        throw new Error(`Slice \`${sliceId}\` does not exist.`);
    }
    const sliceDir = node_path_1.default.dirname(sliceFile);
    const sliceData = loadYamlObject(sliceFile);
    const contextId = readString(sliceData.context_id, `Slice \`${sliceId}\` is missing \`context_id\`.`);
    const tasksPath = node_path_1.default.join(sliceDir, "tasks.yaml");
    const originalTasks = node_fs_1.default.existsSync(tasksPath) ? node_fs_1.default.readFileSync(tasksPath, "utf-8") : null;
    try {
        const plannedTasks = buildPlannedTasks(root, sliceId, contextId, sliceDir, sliceData);
        const content = js_yaml_1.default.dump({
            tasks: plannedTasks.map((task) => {
                const record = {
                    id: task.id,
                    title: task.title,
                    owner: task.owner,
                    status: task.status,
                };
                if (task.dependsOn.length > 0) {
                    record.depends_on = task.dependsOn;
                }
                return record;
            }),
        }, { sortKeys: false, lineWidth: 120 });
        writePlannedTasks(tasksPath, content, plannedTasks, force);
        const validation = (0, validator_1.validateSlice)(root, sliceId);
        if (!validation.ok) {
            throw new Error(validation.renderText());
        }
        return new SlicePlanResult(root, sliceId, [tasksPath], plannedTasks.length, Array.from(new Set(plannedTasks.map((task) => task.owner))).sort());
    }
    catch (error) {
        if (originalTasks === null) {
            if (node_fs_1.default.existsSync(tasksPath)) {
                node_fs_1.default.rmSync(tasksPath, { force: true });
            }
        }
        else {
            node_fs_1.default.writeFileSync(tasksPath, originalTasks, "utf-8");
        }
        throw error;
    }
}
function buildPlannedTasks(root, sliceId, contextId, sliceDir, sliceData) {
    const taskDrafts = [];
    const artifactTaskKeys = [];
    const designPath = node_path_1.default.join(sliceDir, "design.md");
    const behaviorPath = node_path_1.default.join(sliceDir, "behaviors.feature");
    const testSpecPath = node_path_1.default.join(sliceDir, "test-spec.yaml");
    const tracePath = node_path_1.default.join(sliceDir, "trace.yaml");
    if (!node_fs_1.default.existsSync(designPath)) {
        const task = createTaskDraft("design", "Generate or refine the slice design document", "design-agent");
        taskDrafts.push(task);
        artifactTaskKeys.push(task.key);
    }
    if (!node_fs_1.default.existsSync(behaviorPath)) {
        const task = createTaskDraft("behavior", "Derive executable behavior scenarios for the slice", "behavior-agent", artifactTaskKeys);
        taskDrafts.push(task);
        artifactTaskKeys.push(task.key);
    }
    if (!node_fs_1.default.existsSync(testSpecPath)) {
        const task = createTaskDraft("test-spec", "Generate slice test specifications and coverage mapping", "test-agent", artifactTaskKeys);
        taskDrafts.push(task);
        artifactTaskKeys.push(task.key);
    }
    if (!node_fs_1.default.existsSync(tracePath)) {
        const task = createTaskDraft("trace", "Synchronize trace links for requirements, scenarios, and tests", "review-agent", artifactTaskKeys);
        taskDrafts.push(task);
        artifactTaskKeys.push(task.key);
    }
    const implementationDependencyKeys = artifactTaskKeys.slice(-1);
    const implementationTaskKeys = [];
    const modules = Array.from(new Set(loadDesignModules(root, contextId)));
    if (modules.length > 0) {
        for (const moduleName of modules) {
            const task = createTaskDraft(`implement:${moduleName}`, `Implement or update slice logic in ${moduleName}`, "build-agent", implementationDependencyKeys);
            taskDrafts.push(task);
            implementationTaskKeys.push(task.key);
        }
    }
    else {
        const task = createTaskDraft("implement:primary", "Implement the slice in the primary context modules", "build-agent", implementationDependencyKeys);
        taskDrafts.push(task);
        implementationTaskKeys.push(task.key);
    }
    const verificationDependencyKeys = implementationTaskKeys.length > 0 ? implementationTaskKeys : implementationDependencyKeys;
    const verificationTaskKeys = [];
    const testTargets = dedupeTestTargets(loadTestTargets(testSpecPath));
    if (testTargets.length > 0) {
        for (const testTarget of testTargets) {
            const task = createTaskDraft(`verify:${testTarget.type}:${testTarget.target}`, `Add or update ${testTarget.type} tests for ${testTarget.target}`, "test-agent", verificationDependencyKeys);
            taskDrafts.push(task);
            verificationTaskKeys.push(task.key);
        }
    }
    else {
        const task = createTaskDraft("verify:default", "Add slice verification tests", "test-agent", verificationDependencyKeys);
        taskDrafts.push(task);
        verificationTaskKeys.push(task.key);
    }
    if (Array.isArray(sliceData.source_refs)) {
        // no-op; placeholder to keep deterministic behavior if schema evolves
    }
    const reviewDependencyKeys = verificationTaskKeys.length > 0
        ? verificationTaskKeys
        : implementationTaskKeys.length > 0
            ? implementationTaskKeys
            : implementationDependencyKeys;
    const reviewTask = createTaskDraft("review:protocol", "Run slice check and resolve protocol issues", "review-agent", reviewDependencyKeys);
    taskDrafts.push(reviewTask);
    taskDrafts.push(createTaskDraft("review:evidence", "Collect acceptance evidence and prepare gate updates", "review-agent", [reviewTask.key]));
    return assignTaskIds(sliceId, taskDrafts);
}
function loadDesignModules(root, contextId) {
    const modulesPath = node_path_1.default.join(root, "contexts", contextId, "design", "modules.yaml");
    if (!node_fs_1.default.existsSync(modulesPath)) {
        return [];
    }
    const raw = js_yaml_1.default.load(node_fs_1.default.readFileSync(modulesPath, "utf-8"));
    if (!isPlainObject(raw) || !Array.isArray(raw.modules)) {
        return [];
    }
    return raw.modules
        .filter(isPlainObject)
        .map((moduleInfo) => moduleInfo.name)
        .filter((name) => typeof name === "string");
}
function loadTestTargets(testSpecPath) {
    if (!node_fs_1.default.existsSync(testSpecPath)) {
        return [];
    }
    const raw = js_yaml_1.default.load(node_fs_1.default.readFileSync(testSpecPath, "utf-8"));
    if (!isPlainObject(raw) || !Array.isArray(raw.tests)) {
        return [];
    }
    return raw.tests
        .filter(isPlainObject)
        .flatMap((testInfo) => {
        const type = typeof testInfo.type === "string" ? testInfo.type : undefined;
        const target = typeof testInfo.target === "string" ? testInfo.target : undefined;
        return type && target ? [{ type, target }] : [];
    });
}
function dedupeTestTargets(testTargets) {
    const seen = new Set();
    const deduped = [];
    for (const testTarget of testTargets) {
        const key = `${testTarget.type}|${testTarget.target}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        deduped.push(testTarget);
    }
    return deduped;
}
function createTaskDraft(key, title, owner, dependsOnKeys = []) {
    return {
        key,
        title,
        owner,
        dependsOnKeys: Array.from(new Set(dependsOnKeys)),
    };
}
function assignTaskIds(sliceId, taskDrafts) {
    const taskPrefix = makeTaskPrefix(sliceId);
    const idByKey = new Map();
    taskDrafts.forEach((task, index) => {
        idByKey.set(task.key, `${taskPrefix}-${String(index + 1).padStart(3, "0")}`);
    });
    return taskDrafts.map((task) => ({
        id: idByKey.get(task.key) ?? task.key,
        title: task.title,
        owner: task.owner,
        status: "pending",
        dependsOn: task.dependsOnKeys.flatMap((key) => {
            const dependencyId = idByKey.get(key);
            return dependencyId ? [dependencyId] : [];
        }),
    }));
}
function makeTaskPrefix(sliceId) {
    return `TASK-${sliceId.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
}
function writePlannedTasks(tasksPath, content, plannedTasks, force) {
    if (node_fs_1.default.existsSync(tasksPath)) {
        const current = node_fs_1.default.readFileSync(tasksPath, "utf-8");
        if (current === content) {
            return;
        }
        if (!force) {
            throw new Error(`Refusing to overwrite existing file \`${tasksPath}\` without --force.`);
        }
    }
    else {
        node_fs_1.default.mkdirSync(node_path_1.default.dirname(tasksPath), { recursive: true });
    }
    (0, tasks_1.writeTasksFile)(tasksPath, plannedTasks);
}
function loadYamlObject(filePath) {
    const raw = js_yaml_1.default.load(node_fs_1.default.readFileSync(filePath, "utf-8"));
    if (!isPlainObject(raw)) {
        throw new Error(`File \`${filePath}\` is not valid YAML.`);
    }
    return raw;
}
function readString(value, message) {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(message);
    }
    return value;
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
