"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArtifactDeriveAllResult = exports.ArtifactSyncTraceResult = exports.ArtifactDeriveResult = void 0;
exports.deriveBehavior = deriveBehavior;
exports.deriveDesign = deriveDesign;
exports.deriveTests = deriveTests;
exports.syncTrace = syncTrace;
exports.deriveAll = deriveAll;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const validator_1 = require("./validator");
class ArtifactDeriveResult {
    sliceId;
    artifact;
    writtenFiles;
    scenarioIds;
    constructor(sliceId, artifact, writtenFiles, scenarioIds) {
        this.sliceId = sliceId;
        this.artifact = artifact;
        this.writtenFiles = writtenFiles;
        this.scenarioIds = scenarioIds;
    }
    renderText() {
        const lines = [
            `Derived ${this.artifact} artifacts for slice \`${this.sliceId}\`.`,
            "Written files:",
            ...this.writtenFiles.map((filePath) => `- ${filePath}`),
        ];
        if (this.scenarioIds.length > 0) {
            lines.push("Scenario IDs:");
            lines.push(...this.scenarioIds.map((scenarioId) => `- ${scenarioId}`));
        }
        return lines.join("\n");
    }
}
exports.ArtifactDeriveResult = ArtifactDeriveResult;
class ArtifactSyncTraceResult {
    sliceId;
    writtenFiles;
    preservedLinkCount;
    generatedLinkCount;
    scenarioIds;
    testIds;
    constructor(sliceId, writtenFiles, preservedLinkCount, generatedLinkCount, scenarioIds, testIds) {
        this.sliceId = sliceId;
        this.writtenFiles = writtenFiles;
        this.preservedLinkCount = preservedLinkCount;
        this.generatedLinkCount = generatedLinkCount;
        this.scenarioIds = scenarioIds;
        this.testIds = testIds;
    }
    renderText() {
        const lines = [
            `Synchronized trace artifacts for slice \`${this.sliceId}\`.`,
            "Written files:",
            ...this.writtenFiles.map((filePath) => `- ${filePath}`),
            `Preserved links: ${this.preservedLinkCount}`,
            `Generated links: ${this.generatedLinkCount}`,
        ];
        if (this.scenarioIds.length > 0) {
            lines.push("Scenario IDs:");
            lines.push(...this.scenarioIds.map((scenarioId) => `- ${scenarioId}`));
        }
        if (this.testIds.length > 0) {
            lines.push("Test IDs:");
            lines.push(...this.testIds.map((testId) => `- ${testId}`));
        }
        return lines.join("\n");
    }
}
exports.ArtifactSyncTraceResult = ArtifactSyncTraceResult;
class ArtifactDeriveAllResult {
    sliceId;
    writtenFiles;
    steps;
    validationIssueCount;
    constructor(sliceId, writtenFiles, steps, validationIssueCount) {
        this.sliceId = sliceId;
        this.writtenFiles = writtenFiles;
        this.steps = steps;
        this.validationIssueCount = validationIssueCount;
    }
    renderText() {
        const lines = [
            `Derived all artifacts for slice \`${this.sliceId}\`.`,
            "Executed steps:",
            ...this.steps.map((step) => `- ${step}`),
            "Written files:",
            ...this.writtenFiles.map((filePath) => `- ${filePath}`),
            `Validation issues after derive-all: ${this.validationIssueCount}`,
        ];
        return lines.join("\n");
    }
}
exports.ArtifactDeriveAllResult = ArtifactDeriveAllResult;
function deriveBehavior(root, sliceId, force = false) {
    const context = loadSliceContext(root, sliceId);
    const scenarioSources = selectScenarioSources(context);
    if (scenarioSources.length === 0) {
        throw new Error(`No context scenarios were found for slice \`${sliceId}\` in context \`${context.contextId}\`.`);
    }
    const behaviorContent = renderBehaviorFeature(context.sliceTitle, context.sliceGoal, scenarioSources);
    const behaviorPath = node_path_1.default.join(context.sliceDir, "behaviors.feature");
    writeDerivedFile(behaviorPath, behaviorContent, force);
    return new ArtifactDeriveResult(sliceId, "behavior", [behaviorPath], scenarioSources.map((scenario) => scenario.scenarioId));
}
function deriveDesign(root, sliceId, force = false) {
    const context = loadSliceContext(root, sliceId);
    const requirementIds = loadRequirementIds(context.sliceFile);
    const requirementNotes = loadRequirementNotes(node_path_1.default.join(context.sliceDir, "requirements.md"));
    const designRefs = loadDesignRefs(context.sliceFile);
    const modules = selectDesignModules(root, context);
    const contracts = selectDesignContracts(root, context.contextId, modules);
    const lines = [
        "# Slice Design",
        "",
        "## Summary",
        "",
        `${context.sliceTitle} is a derived JiSpec design slice for the \`${context.contextId}\` context.`,
        `${context.sliceGoal}`,
        "",
        "## Requirement Mapping",
        "",
    ];
    if (requirementIds.length > 0) {
        lines.push(...requirementIds.map((id) => `- \`${id}\``));
    }
    else {
        lines.push("- No linked requirements declared in `slice.yaml`.");
    }
    if (requirementNotes.length > 0) {
        lines.push("");
        lines.push("## Scope Notes");
        lines.push("");
        lines.push(...requirementNotes.map((note) => `- ${note}`));
    }
    lines.push("");
    lines.push("## Impacted Modules");
    lines.push("");
    if (modules.length > 0) {
        for (const moduleInfo of modules) {
            const detail = moduleInfo.responsibility ? `: ${moduleInfo.responsibility}` : "";
            lines.push(`- \`${moduleInfo.name}\`${detail}`);
        }
    }
    else {
        lines.push(`- \`${context.contextId}-application\``);
    }
    lines.push("");
    lines.push("## Relevant Contracts");
    lines.push("");
    if (contracts.length > 0) {
        for (const contract of contracts) {
            const segments = [
                `\`${contract.name}\``,
                contract.direction ? `direction=${contract.direction}` : undefined,
                contract.sourceContext ? `source=${contract.sourceContext}` : undefined,
                `fields=${contract.fieldCount}`,
            ].filter(Boolean);
            lines.push(`- ${segments.join(", ")}`);
        }
    }
    else {
        lines.push("- No explicit contracts selected from the context.");
    }
    lines.push("");
    lines.push("## Key Decision");
    lines.push("");
    if (designRefs.length > 0) {
        lines.push(`Preserve the existing design decisions referenced by this slice: ${designRefs.map((ref) => `\`${ref}\``).join(", ")}.`);
    }
    else if (contracts.some((contract) => contract.sourceContext)) {
        lines.push("Preserve context boundaries and consume upstream data through explicit contracts.");
    }
    else {
        lines.push("Preserve the bounded context boundary and keep slice implementation scoped to the declared modules.");
    }
    const designPath = node_path_1.default.join(context.sliceDir, "design.md");
    writeDerivedFile(designPath, `${lines.join("\n").trimEnd()}\n`, force);
    return new ArtifactDeriveResult(sliceId, "design", [designPath], []);
}
function deriveTests(root, sliceId, force = false) {
    const context = loadSliceContext(root, sliceId);
    const scenarioIds = collectSliceScenarioIds(context);
    if (scenarioIds.length === 0) {
        throw new Error(`No scenario IDs were found for slice \`${sliceId}\`. Run \`artifact derive-behavior\` first or add slice scenarios.`);
    }
    const targets = loadModuleTargets(root, context.contextId);
    const testSpecPath = node_path_1.default.join(context.sliceDir, "test-spec.yaml");
    const coverageMapPath = node_path_1.default.join(root, "contexts", context.contextId, "tests", "coverage-map.yaml");
    const testSpecContent = js_yaml_1.default.dump({
        tests: scenarioIds.flatMap((scenarioId) => [
            {
                id: toTestId(scenarioId, "UNIT"),
                type: "unit",
                verifies: [scenarioId],
                target: targets.unitTarget,
            },
            {
                id: toTestId(scenarioId, "INTEGRATION"),
                type: "integration",
                verifies: [scenarioId],
                target: targets.integrationTarget,
            },
        ]),
    }, { sortKeys: false, lineWidth: 120 });
    writeDerivedFile(testSpecPath, testSpecContent, force);
    const coverageMapContent = js_yaml_1.default.dump({
        coverage: scenarioIds.map((scenarioId) => ({
            scenario_id: scenarioId,
            tests: [toTestId(scenarioId, "UNIT"), toTestId(scenarioId, "INTEGRATION")],
        })),
    }, { sortKeys: false, lineWidth: 120 });
    writeDerivedFile(coverageMapPath, coverageMapContent, force);
    return new ArtifactDeriveResult(sliceId, "tests", [testSpecPath, coverageMapPath], scenarioIds);
}
function syncTrace(root, sliceId) {
    const context = loadSliceContext(root, sliceId);
    const scenarioIds = collectSliceScenarioIds(context);
    if (scenarioIds.length === 0) {
        throw new Error(`No scenario IDs were found for slice \`${sliceId}\`. Run \`artifact derive-behavior\` first or add scenario annotations.`);
    }
    const testSpecPath = node_path_1.default.join(context.sliceDir, "test-spec.yaml");
    if (!node_fs_1.default.existsSync(testSpecPath)) {
        throw new Error(`Missing \`test-spec.yaml\` for slice \`${sliceId}\`. Run \`artifact derive-tests\` first.`);
    }
    const testSpec = js_yaml_1.default.load(node_fs_1.default.readFileSync(testSpecPath, "utf-8"));
    if (!isPlainObject(testSpec) || !Array.isArray(testSpec.tests)) {
        throw new Error(`Slice test spec \`${testSpecPath}\` is not valid YAML.`);
    }
    const requirementIds = loadRequirementIds(context.sliceFile);
    if (requirementIds.length === 0) {
        throw new Error(`Slice \`${sliceId}\` has no \`source_refs.requirement_ids\` to sync into trace.`);
    }
    const generatedLinks = [];
    for (const requirementId of requirementIds) {
        for (const scenarioId of scenarioIds) {
            generatedLinks.push({
                from: { type: "requirement", id: requirementId },
                to: { type: "scenario", id: scenarioId },
                relation: "verified_by",
            });
        }
    }
    const testIds = new Set();
    for (const rawTest of testSpec.tests) {
        if (!isPlainObject(rawTest)) {
            continue;
        }
        const testId = typeof rawTest.id === "string" ? rawTest.id : undefined;
        const verifies = Array.isArray(rawTest.verifies)
            ? rawTest.verifies.filter((value) => typeof value === "string")
            : [];
        if (!testId) {
            continue;
        }
        testIds.add(testId);
        for (const scenarioId of verifies) {
            generatedLinks.push({
                from: { type: "scenario", id: scenarioId },
                to: { type: "test", id: testId },
                relation: "covered_by",
            });
        }
    }
    const tracePath = node_path_1.default.join(context.sliceDir, "trace.yaml");
    const existingLinks = loadTraceLinks(tracePath);
    const preservedLinks = existingLinks.filter((link) => !isManagedDerivedLink(link));
    const mergedLinks = dedupeTraceLinks([...preservedLinks, ...generatedLinks]);
    const traceContent = js_yaml_1.default.dump({ links: mergedLinks }, { sortKeys: false, lineWidth: 120 });
    node_fs_1.default.writeFileSync(tracePath, traceContent, "utf-8");
    return new ArtifactSyncTraceResult(sliceId, [tracePath], preservedLinks.length, generatedLinks.length, scenarioIds, Array.from(testIds).sort());
}
function deriveAll(root, sliceId, force = false) {
    const context = loadSliceContext(root, sliceId);
    const backupPaths = [
        node_path_1.default.join(context.sliceDir, "design.md"),
        node_path_1.default.join(context.sliceDir, "behaviors.feature"),
        node_path_1.default.join(context.sliceDir, "test-spec.yaml"),
        node_path_1.default.join(root, "contexts", context.contextId, "tests", "coverage-map.yaml"),
        node_path_1.default.join(context.sliceDir, "trace.yaml"),
    ];
    const backups = new Map();
    for (const filePath of backupPaths) {
        backups.set(filePath, node_fs_1.default.existsSync(filePath) ? node_fs_1.default.readFileSync(filePath, "utf-8") : null);
    }
    try {
        const writtenFiles = new Set();
        const steps = [];
        const design = deriveDesign(root, sliceId, force);
        steps.push("derive-design");
        design.writtenFiles.forEach((filePath) => writtenFiles.add(filePath));
        const behavior = deriveBehavior(root, sliceId, force);
        steps.push("derive-behavior");
        behavior.writtenFiles.forEach((filePath) => writtenFiles.add(filePath));
        const tests = deriveTests(root, sliceId, force);
        steps.push("derive-tests");
        tests.writtenFiles.forEach((filePath) => writtenFiles.add(filePath));
        const trace = syncTrace(root, sliceId);
        steps.push("sync-trace");
        trace.writtenFiles.forEach((filePath) => writtenFiles.add(filePath));
        const validation = (0, validator_1.validateRepository)(root);
        if (!validation.ok) {
            throw new Error(validation.renderText());
        }
        return new ArtifactDeriveAllResult(sliceId, Array.from(writtenFiles), steps, validation.issues.length);
    }
    catch (error) {
        restoreBackups(backups);
        throw error;
    }
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
    if (!contextId) {
        throw new Error(`Slice file \`${sliceFile}\` is missing \`context_id\`.`);
    }
    const sliceTitle = typeof raw.title === "string" ? raw.title : sliceId;
    const sliceGoal = typeof raw.goal === "string" ? raw.goal : `Deliver ${sliceTitle}.`;
    return {
        root,
        sliceId,
        sliceFile,
        sliceDir: node_path_1.default.dirname(sliceFile),
        contextId,
        sliceTitle,
        sliceGoal,
    };
}
function selectScenarioSources(context) {
    const scenarioDir = node_path_1.default.join(context.root, "contexts", context.contextId, "behavior", "scenarios");
    if (!node_fs_1.default.existsSync(scenarioDir)) {
        return [];
    }
    const candidates = node_fs_1.default
        .readdirSync(scenarioDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".feature"))
        .map((entry) => node_path_1.default.join(scenarioDir, entry.name))
        .sort();
    const sliceTokens = buildSliceTokens(context);
    const scored = candidates.map((filePath) => {
        const stem = node_path_1.default.basename(filePath, ".feature");
        const content = node_fs_1.default.readFileSync(filePath, "utf-8");
        const contentTokens = tokenize(`${stem} ${content}`);
        const score = contentTokens.filter((token) => sliceTokens.has(token)).length;
        return { filePath, stem, content, score };
    });
    const selected = scored.some((entry) => entry.score > 0)
        ? scored.filter((entry) => entry.score > 0)
        : scored;
    return selected.map((entry) => parseScenarioSource(entry.stem, entry.content));
}
function parseScenarioSource(scenarioId, content) {
    const lines = content.replace(/\r\n/g, "\n").split("\n");
    const featureLine = lines.find((line) => line.trimStart().startsWith("Feature:"));
    const featureName = featureLine ? featureLine.replace(/^.*Feature:\s*/, "").trim() : scenarioId;
    const bodyLines = lines.filter((line) => !line.trimStart().startsWith("Feature:"));
    const normalizedBody = trimEmptyEdges(bodyLines).join("\n");
    return {
        scenarioId,
        featureName,
        content: normalizedBody,
    };
}
function renderBehaviorFeature(sliceTitle, sliceGoal, scenarioSources) {
    const lines = [
        `Feature: ${sliceTitle}`,
        "",
        `# Derived by JiSpec from context scenarios`,
        `# Goal: ${sliceGoal}`,
        "",
    ];
    scenarioSources.forEach((scenario, index) => {
        lines.push(`# Scenario ID: ${scenario.scenarioId}`);
        lines.push(`# Source Feature: ${scenario.featureName}`);
        lines.push(...scenario.content.split("\n"));
        if (index < scenarioSources.length - 1) {
            lines.push("");
        }
    });
    return `${lines.join("\n").trimEnd()}\n`;
}
function collectSliceScenarioIds(context) {
    const behaviorPath = node_path_1.default.join(context.sliceDir, "behaviors.feature");
    const found = new Set();
    if (node_fs_1.default.existsSync(behaviorPath)) {
        const content = node_fs_1.default.readFileSync(behaviorPath, "utf-8");
        for (const match of content.matchAll(/^#\s*Scenario ID:\s*([A-Z0-9-]+)\s*$/gm)) {
            if (match[1]) {
                found.add(match[1]);
            }
        }
    }
    if (found.size === 0) {
        for (const scenario of selectScenarioSources(context)) {
            found.add(scenario.scenarioId);
        }
    }
    return Array.from(found).sort();
}
function loadRequirementIds(sliceFile) {
    const raw = js_yaml_1.default.load(node_fs_1.default.readFileSync(sliceFile, "utf-8"));
    if (!isPlainObject(raw) || !isPlainObject(raw.source_refs) || !Array.isArray(raw.source_refs.requirement_ids)) {
        return [];
    }
    return raw.source_refs.requirement_ids.filter((value) => typeof value === "string");
}
function loadDesignRefs(sliceFile) {
    const raw = js_yaml_1.default.load(node_fs_1.default.readFileSync(sliceFile, "utf-8"));
    if (!isPlainObject(raw) || !isPlainObject(raw.source_refs) || !Array.isArray(raw.source_refs.design_refs)) {
        return [];
    }
    return raw.source_refs.design_refs.filter((value) => typeof value === "string");
}
function loadRequirementNotes(requirementsPath) {
    if (!node_fs_1.default.existsSync(requirementsPath)) {
        return [];
    }
    const lines = node_fs_1.default.readFileSync(requirementsPath, "utf-8").replace(/\r\n/g, "\n").split("\n");
    const notes = [];
    let inScopeNotes = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("## ")) {
            inScopeNotes = trimmed.toLowerCase() === "## scope notes";
            continue;
        }
        if (!inScopeNotes) {
            continue;
        }
        if (trimmed.startsWith("- ")) {
            notes.push(trimmed.slice(2).trim());
        }
    }
    return notes;
}
function loadModuleTargets(root, contextId) {
    const modulesPath = node_path_1.default.join(root, "contexts", contextId, "design", "modules.yaml");
    if (!node_fs_1.default.existsSync(modulesPath)) {
        return {
            unitTarget: `${contextId}-domain`,
            integrationTarget: `${contextId}-application`,
        };
    }
    const raw = js_yaml_1.default.load(node_fs_1.default.readFileSync(modulesPath, "utf-8"));
    if (!isPlainObject(raw) || !Array.isArray(raw.modules)) {
        return {
            unitTarget: `${contextId}-domain`,
            integrationTarget: `${contextId}-application`,
        };
    }
    const moduleNames = raw.modules
        .filter(isPlainObject)
        .map((item) => item.name)
        .filter((name) => typeof name === "string");
    const unitTarget = moduleNames.find((name) => name.endsWith("-domain")) ?? moduleNames[0] ?? `${contextId}-domain`;
    const integrationTarget = moduleNames.find((name) => name.endsWith("-application")) ?? moduleNames[0] ?? `${contextId}-application`;
    return { unitTarget, integrationTarget };
}
function selectDesignModules(root, context) {
    const modulesPath = node_path_1.default.join(root, "contexts", context.contextId, "design", "modules.yaml");
    if (!node_fs_1.default.existsSync(modulesPath)) {
        return [];
    }
    const raw = js_yaml_1.default.load(node_fs_1.default.readFileSync(modulesPath, "utf-8"));
    if (!isPlainObject(raw) || !Array.isArray(raw.modules)) {
        return [];
    }
    const modules = raw.modules.filter(isPlainObject).flatMap((item) => {
        const name = typeof item.name === "string" ? item.name : undefined;
        if (!name) {
            return [];
        }
        return [
            {
                id: typeof item.id === "string" ? item.id : undefined,
                name,
                responsibility: typeof item.responsibility === "string" ? item.responsibility : undefined,
            },
        ];
    });
    const sliceTokens = buildSliceTokens(context);
    const scored = modules.map((moduleInfo) => {
        const tokens = tokenize(`${moduleInfo.name} ${moduleInfo.responsibility ?? ""}`);
        const score = tokens.filter((token) => sliceTokens.has(token)).length;
        return { moduleInfo, score };
    });
    if (scored.some((entry) => entry.score > 0)) {
        return scored.filter((entry) => entry.score > 0).map((entry) => entry.moduleInfo);
    }
    return modules;
}
function selectDesignContracts(root, contextId, modules) {
    const contractsPath = node_path_1.default.join(root, "contexts", contextId, "design", "contracts.yaml");
    if (!node_fs_1.default.existsSync(contractsPath)) {
        return [];
    }
    const raw = js_yaml_1.default.load(node_fs_1.default.readFileSync(contractsPath, "utf-8"));
    if (!isPlainObject(raw) || !Array.isArray(raw.contracts)) {
        return [];
    }
    const contracts = raw.contracts.filter(isPlainObject).flatMap((item) => {
        const name = typeof item.name === "string" ? item.name : undefined;
        const fields = Array.isArray(item.fields) ? item.fields : [];
        if (!name) {
            return [];
        }
        return [
            {
                id: typeof item.id === "string" ? item.id : undefined,
                name,
                direction: typeof item.direction === "string" ? item.direction : undefined,
                sourceContext: typeof item.source_context === "string" ? item.source_context : undefined,
                fieldCount: fields.length,
            },
        ];
    });
    if (contracts.length === 0) {
        return [];
    }
    const moduleTokens = new Set(modules.flatMap((moduleInfo) => tokenize(`${moduleInfo.name} ${moduleInfo.responsibility ?? ""}`)));
    const scored = contracts.map((contract) => {
        const tokens = tokenize(`${contract.name} ${contract.direction ?? ""} ${contract.sourceContext ?? ""}`);
        const score = tokens.filter((token) => moduleTokens.has(token)).length + (contract.direction === "upstream-read" ? 1 : 0);
        return { contract, score };
    });
    if (scored.some((entry) => entry.score > 0)) {
        return scored.filter((entry) => entry.score > 0).map((entry) => entry.contract);
    }
    return contracts.slice(0, 3);
}
function toTestId(scenarioId, suffix) {
    return scenarioId.replace(/^SCN-/, "TEST-").concat(`-${suffix}`);
}
function writeDerivedFile(filePath, content, force) {
    if (node_fs_1.default.existsSync(filePath)) {
        const current = node_fs_1.default.readFileSync(filePath, "utf-8");
        if (current === content) {
            return;
        }
        if (!force) {
            throw new Error(`Refusing to overwrite existing file \`${filePath}\` without --force.`);
        }
    }
    else {
        node_fs_1.default.mkdirSync(node_path_1.default.dirname(filePath), { recursive: true });
    }
    node_fs_1.default.writeFileSync(filePath, content, "utf-8");
}
function restoreBackups(backups) {
    for (const [filePath, content] of backups.entries()) {
        if (content === null) {
            if (node_fs_1.default.existsSync(filePath)) {
                node_fs_1.default.rmSync(filePath, { force: true });
            }
            continue;
        }
        node_fs_1.default.mkdirSync(node_path_1.default.dirname(filePath), { recursive: true });
        node_fs_1.default.writeFileSync(filePath, content, "utf-8");
    }
}
function loadTraceLinks(tracePath) {
    if (!node_fs_1.default.existsSync(tracePath)) {
        return [];
    }
    const raw = js_yaml_1.default.load(node_fs_1.default.readFileSync(tracePath, "utf-8"));
    if (!isPlainObject(raw) || !Array.isArray(raw.links)) {
        return [];
    }
    return raw.links.filter(isTraceLinkRecord);
}
function isManagedDerivedLink(link) {
    return ((link.from.type === "requirement" && link.to.type === "scenario" && link.relation === "verified_by") ||
        (link.from.type === "scenario" && link.to.type === "test" && link.relation === "covered_by"));
}
function dedupeTraceLinks(links) {
    const seen = new Set();
    const deduped = [];
    for (const link of links) {
        const key = traceLinkKey(link);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        deduped.push(link);
    }
    return deduped;
}
function traceLinkKey(link) {
    return `${link.from.type}:${link.from.id}|${link.relation}|${link.to.type}:${link.to.id}`;
}
function isTraceLinkRecord(value) {
    return (isPlainObject(value) &&
        isPlainObject(value.from) &&
        isPlainObject(value.to) &&
        typeof value.from.type === "string" &&
        typeof value.from.id === "string" &&
        typeof value.to.type === "string" &&
        typeof value.to.id === "string" &&
        typeof value.relation === "string");
}
function buildSliceTokens(context) {
    return new Set(tokenize(`${context.sliceId} ${context.sliceTitle} ${context.sliceGoal}`));
}
function tokenize(value) {
    const stopwords = new Set(["the", "and", "for", "with", "from", "into", "that", "this", "mvp"]);
    return value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !stopwords.has(token));
}
function trimEmptyEdges(lines) {
    let start = 0;
    let end = lines.length;
    while (start < end && lines[start]?.trim() === "") {
        start += 1;
    }
    while (end > start && lines[end - 1]?.trim() === "") {
        end -= 1;
    }
    return lines.slice(start, end);
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
