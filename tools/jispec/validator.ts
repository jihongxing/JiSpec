import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import yaml from "js-yaml";

export const REQUIREMENT_ID_PATTERN = /\bREQ-[A-Z0-9-]+-\d+\b/g;

// Unified lifecycle states matching pipeline.yaml
export const LIFECYCLE_ORDER = [
  "proposed",
  "requirements-defined",
  "design-defined",
  "behavior-defined",
  "test-defined",
  "implementing",
  "verifying",
  "accepted",
  "released",
] as const;
export type LifecycleState = (typeof LIFECYCLE_ORDER)[number];

export const REQUIRED_ARTIFACTS_BY_STATE: Record<LifecycleState, string[]> = {
  proposed: ["slice.yaml"],
  "requirements-defined": ["slice.yaml", "requirements.md"],
  "design-defined": ["slice.yaml", "requirements.md", "design.md"],
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
  verifying: [
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
export const REQUIRED_GATES_BY_STATE: Record<LifecycleState, string[]> = {
  proposed: [],
  "requirements-defined": ["requirements_ready"],
  "design-defined": ["requirements_ready", "design_ready"],
  "behavior-defined": ["requirements_ready", "design_ready", "behavior_ready"],
  "test-defined": ["requirements_ready", "design_ready", "behavior_ready", "test_ready"],
  implementing: ["requirements_ready", "design_ready", "behavior_ready", "test_ready"],
  verifying: ["requirements_ready", "design_ready", "behavior_ready", "test_ready", "implementation_ready"],
  accepted: ["requirements_ready", "design_ready", "behavior_ready", "test_ready", "implementation_ready", "accepted"],
  released: ["requirements_ready", "design_ready", "behavior_ready", "test_ready", "implementation_ready", "accepted"],
};

type JsonObject = Record<string, unknown>;

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface TraceNodeRef {
  type: string;
  id: string;
}

export interface TraceLink {
  from: TraceNodeRef;
  to: TraceNodeRef;
  relation: string;
}

export class TraceReport {
  constructor(
    public readonly root: string,
    public readonly sliceId: string,
    public readonly contextId: string,
    public readonly tracePath: string,
    public readonly links: TraceLink[],
    public readonly nodeTypeCounts: Record<string, number>,
    public readonly relationCounts: Record<string, number>,
    public readonly validation: ValidationResult,
  ) {}

  toDict(): Record<string, unknown> {
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

  renderText(): string {
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
    lines.push(
      ...this.links.map(
        (link, index) => `- ${index + 1}. ${link.from.type}:${link.from.id} -[${link.relation}]-> ${link.to.type}:${link.to.id}`,
      ),
    );

    if (!this.validation.ok) {
      lines.push("Issues:");
      lines.push(...this.validation.issues.map((issue) => `- [${issue.code}] ${issue.path}: ${issue.message}`));
    }

    return lines.join("\n");
  }
}

export class ValidationResult {
  constructor(public readonly root: string, public readonly issues: ValidationIssue[] = []) {}

  get ok(): boolean {
    return this.issues.length === 0;
  }

  add(code: string, issuePath: string, message: string): void {
    this.issues.push({
      code,
      path: displayPath(this.root, issuePath),
      message,
    });
  }

  toDict(): Record<string, unknown> {
    return {
      ok: this.ok,
      root: this.root,
      issue_count: this.issues.length,
      issues: this.issues,
    };
  }

  renderText(): string {
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

interface BuildIndexesResult {
  contextIndex: Record<string, JsonObject>;
  sliceIndex: Record<string, JsonObject>;
  schemas: Record<string, JsonObject>;
  agentIds: Set<string>;
}

export function validateRepository(root: string): ValidationResult {
  const result = new ValidationResult(root);
  const { contextIndex, sliceIndex, schemas, agentIds } = buildIndexes(root, result);
  validateContextActiveSlices(root, contextIndex, sliceIndex, result);

  for (const sliceId of Object.keys(sliceIndex).sort()) {
    const sliceResult = validateSlice(root, sliceId, { contextIndex, sliceIndex, schemas, agentIds });
    result.issues.push(...sliceResult.issues);
  }
  return result;
}

export function validateSlice(
  root: string,
  sliceId: string,
  cache?: BuildIndexesResult,
): ValidationResult {
  const result = new ValidationResult(root);
  const { contextIndex, schemas, agentIds } = cache ?? buildIndexes(root, result);

  const sliceFile = findSliceFile(root, sliceId);
  if (!sliceFile) {
    result.add("SLICE_NOT_FOUND", path.join(root, "contexts"), `Slice \`${sliceId}\` does not exist.`);
    return result;
  }

  const sliceData = loadYaml(sliceFile, result);
  validateFileAgainstSchema(sliceFile, sliceData, schemas.slice, result);
  validateSliceSemantics(sliceFile, sliceData, contextIndex, result);
  validateSliceLifecycle(sliceFile, sliceData, result);

  if (!isObject(sliceData)) {
    return result;
  }

  const lifecycle = sliceData.lifecycle;
  const state = isObject(lifecycle) && typeof lifecycle.state === "string" ? lifecycle.state : undefined;
  if (state && stateAtLeast(state, "behavior-defined")) {
    validateSliceTrace(root, sliceFile, sliceData, schemas.trace, result);
  }

  validateSliceTasks(root, sliceFile, agentIds, schemas.tasks, result);

  return result;
}

export function validateSliceTraceOnly(root: string, sliceId: string): ValidationResult {
  const result = new ValidationResult(root);
  const { schemas } = buildIndexes(root, result);
  const sliceFile = findSliceFile(root, sliceId);
  if (!sliceFile) {
    result.add("SLICE_NOT_FOUND", path.join(root, "contexts"), `Slice \`${sliceId}\` does not exist.`);
    return result;
  }

  const sliceData = loadYaml(sliceFile, result);
  if (!isObject(sliceData)) {
    return result;
  }

  validateSliceTrace(root, sliceFile, sliceData, schemas.trace, result);
  return result;
}

export function buildTraceReport(root: string, sliceId: string): TraceReport {
  const validation = validateSliceTraceOnly(root, sliceId);
  const sliceFile = findSliceFile(root, sliceId);
  if (!sliceFile) {
    throw new Error(`Slice \`${sliceId}\` does not exist.`);
  }

  const sliceData = yaml.load(fs.readFileSync(sliceFile, "utf-8"));
  if (!isObject(sliceData)) {
    throw new Error(`Slice file \`${sliceFile}\` is not valid YAML.`);
  }

  const contextId =
    typeof sliceData.context_id === "string"
      ? sliceData.context_id
      : path.basename(path.dirname(path.dirname(path.dirname(sliceFile))));
  const tracePath = path.join(path.dirname(sliceFile), "trace.yaml");
  const traceData = fs.existsSync(tracePath) ? yaml.load(fs.readFileSync(tracePath, "utf-8")) : undefined;

  const links = isObject(traceData) && Array.isArray(traceData.links) ? normalizeTraceLinks(traceData.links) : [];
  const nodeTypeCounts: Record<string, number> = {};
  const relationCounts: Record<string, number> = {};

  for (const link of links) {
    nodeTypeCounts[link.from.type] = (nodeTypeCounts[link.from.type] ?? 0) + 1;
    nodeTypeCounts[link.to.type] = (nodeTypeCounts[link.to.type] ?? 0) + 1;
    relationCounts[link.relation] = (relationCounts[link.relation] ?? 0) + 1;
  }

  return new TraceReport(root, sliceId, contextId, tracePath, links, nodeTypeCounts, relationCounts, validation);
}

export function findSliceFile(root: string, sliceId: string): string | undefined {
  const contextsRoot = path.join(root, "contexts");
  if (!fs.existsSync(contextsRoot)) {
    return undefined;
  }

  for (const contextEntry of fs.readdirSync(contextsRoot, { withFileTypes: true })) {
    if (!contextEntry.isDirectory()) {
      continue;
    }
    const candidate = path.join(contextsRoot, contextEntry.name, "slices", sliceId, "slice.yaml");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function isLifecycleState(value: string): value is LifecycleState {
  return LIFECYCLE_ORDER.includes(value as LifecycleState);
}

export function getNextLifecycleState(currentState: LifecycleState): LifecycleState | undefined {
  const index = LIFECYCLE_ORDER.indexOf(currentState);
  return index >= 0 ? LIFECYCLE_ORDER[index + 1] : undefined;
}

export function getRequiredArtifactsForState(state: LifecycleState): string[] {
  return REQUIRED_ARTIFACTS_BY_STATE[state] ?? [];
}

export function getRequiredGatesForState(state: LifecycleState): string[] {
  return REQUIRED_GATES_BY_STATE[state] ?? [];
}

function buildIndexes(root: string, result: ValidationResult): BuildIndexesResult {
  if (!fs.existsSync(root)) {
    result.add("ROOT_NOT_FOUND", root, "Repository root does not exist.");
    return { contextIndex: {}, sliceIndex: {}, schemas: {}, agentIds: new Set() };
  }

  const projectPath = path.join(root, "jiproject", "project.yaml");
  const projectData = loadYaml(projectPath, result);
  const schemas = loadSchemas(root, result);
  const agentIds = loadAgentIds(root, result);

  validateFileAgainstSchema(projectPath, projectData, schemas.project, result);
  validateProjectSemantics(root, projectPath, projectData, result);

  const contextIndex: Record<string, JsonObject> = {};
  for (const contextFile of findFiles(path.join(root, "contexts"), "context.yaml")) {
    const data = loadYaml(contextFile, result);
    validateFileAgainstSchema(contextFile, data, schemas.context, result);
    if (isObject(data) && typeof data.id === "string") {
      contextIndex[data.id] = data;
    }
  }

  const sliceIndex: Record<string, JsonObject> = {};
  for (const sliceFile of findSliceFiles(root)) {
    const data = loadYaml(sliceFile, result);
    validateFileAgainstSchema(sliceFile, data, schemas.slice, result);
    if (isObject(data) && typeof data.id === "string") {
      sliceIndex[data.id] = data;
    }
  }

  for (const contractsFile of findFiles(path.join(root, "contexts"), "contracts.yaml")) {
    if (!contractsFile.includes(`${path.sep}design${path.sep}`)) {
      continue;
    }
    const data = loadYaml(contractsFile, result);
    validateFileAgainstSchema(contractsFile, data, schemas.contracts, result);
  }

  return { contextIndex, sliceIndex, schemas, agentIds };
}

function validateProjectSemantics(root: string, projectPath: string, projectData: unknown, result: ValidationResult): void {
  if (!isObject(projectData)) {
    return;
  }

  const sourceDocuments = projectData.source_documents;
  if (!isObject(sourceDocuments)) {
    result.add(
      "PROJECT_SOURCE_DOCUMENTS_INVALID",
      projectPath,
      "`source_documents` must be an object mapping document names to paths.",
    );
    return;
  }

  for (const [name, relativePath] of Object.entries(sourceDocuments)) {
    if (typeof relativePath !== "string") {
      result.add(
        "PROJECT_SOURCE_DOCUMENT_PATH_INVALID",
        projectPath,
        `\`source_documents.${name}\` must be a string path.`,
      );
      continue;
    }

    const target = path.join(root, relativePath);
    if (!fs.existsSync(target)) {
      result.add(
        "PROJECT_SOURCE_DOCUMENT_MISSING",
        projectPath,
        `Referenced source document \`${relativePath}\` does not exist.`,
      );
    }
  }
}

function validateSliceSemantics(
  sliceFile: string,
  sliceData: unknown,
  contextIndex: Record<string, JsonObject>,
  result: ValidationResult,
): void {
  if (!isObject(sliceData)) {
    return;
  }

  const contextId = typeof sliceData.context_id === "string" ? sliceData.context_id : undefined;
  const expectedContextId = path.basename(path.dirname(path.dirname(path.dirname(sliceFile))));
  if (contextId !== expectedContextId) {
    result.add(
      "SLICE_CONTEXT_MISMATCH",
      sliceFile,
      `\`context_id\` is \`${contextId}\` but the slice lives under \`${expectedContextId}\`.`,
    );
  }

  if (contextId && !(contextId in contextIndex)) {
    result.add("SLICE_CONTEXT_UNKNOWN", sliceFile, `Referenced context \`${contextId}\` does not exist.`);
  }

  // Validate dependencies
  const dependencies = sliceData.dependencies;
  if (dependencies !== undefined && !Array.isArray(dependencies)) {
    result.add("SLICE_DEPENDENCIES_INVALID", sliceFile, "`dependencies` must be an array.");
    return;
  }

  if (Array.isArray(dependencies)) {
    validateSliceDependencies(sliceFile, sliceData, dependencies, result);
  }
}

function validateSliceLifecycle(sliceFile: string, sliceData: unknown, result: ValidationResult): void {
  if (!isObject(sliceData)) {
    return;
  }

  // Check for lifecycle.state (new format)
  const lifecycle = sliceData.lifecycle;
  if (!isObject(lifecycle)) {
    result.add("SLICE_LIFECYCLE_MISSING", sliceFile, "`lifecycle` object is required.");
    return;
  }

  const state = typeof lifecycle.state === "string" ? lifecycle.state : undefined;
  if (!state) {
    result.add("SLICE_STATE_INVALID", sliceFile, "`lifecycle.state` must be a string.");
    return;
  }
  if (!isLifecycleState(state)) {
    result.add(
      "SLICE_STATE_UNKNOWN",
      sliceFile,
      `\`lifecycle.state\` must be one of ${LIFECYCLE_ORDER.join(", ")}.`,
    );
    return;
  }

  const sliceDir = path.dirname(sliceFile);
  for (const artifact of getRequiredArtifactsForState(state)) {
    const artifactPath = artifact === "slice.yaml" ? sliceFile : path.join(sliceDir, artifact);
    if (!fs.existsSync(artifactPath)) {
      result.add("SLICE_ARTIFACT_MISSING", artifactPath, `Slice state \`${state}\` requires \`${artifact}\`.`);
    }
  }
}

function validateSliceDependencies(
  sliceFile: string,
  sliceData: JsonObject,
  dependencies: unknown[],
  result: ValidationResult,
): void {
  const sliceId = typeof sliceData.id === "string" ? sliceData.id : undefined;
  const root = path.resolve(path.dirname(sliceFile), "../../../..");
  const seenDeps = new Set<string>();

  for (const [index, dep] of dependencies.entries()) {
    if (!isObject(dep)) {
      result.add("SLICE_DEPENDENCY_INVALID", sliceFile, `Dependency at index ${index} must be an object.`);
      continue;
    }

    const targetSliceId = typeof dep.slice_id === "string" ? dep.slice_id : undefined;
    const kind = typeof dep.kind === "string" ? dep.kind : undefined;
    const requiredState = typeof dep.required_state === "string" ? dep.required_state : undefined;

    if (!targetSliceId) {
      result.add("SLICE_DEPENDENCY_MISSING_SLICE_ID", sliceFile, `Dependency at index ${index} missing \`slice_id\`.`);
      continue;
    }

    if (!kind) {
      result.add("SLICE_DEPENDENCY_MISSING_KIND", sliceFile, `Dependency at index ${index} missing \`kind\`.`);
      continue;
    }

    if (!requiredState) {
      result.add("SLICE_DEPENDENCY_MISSING_STATE", sliceFile, `Dependency at index ${index} missing \`required_state\`.`);
      continue;
    }

    // Check self-dependency
    if (targetSliceId === sliceId) {
      result.add(
        "SLICE_DEPENDENCY_SELF",
        sliceFile,
        `Slice \`${sliceId}\` cannot depend on itself.`,
      );
      continue;
    }

    // Check duplicate dependencies
    const depKey = `${targetSliceId}:${kind}`;
    if (seenDeps.has(depKey)) {
      result.add(
        "SLICE_DEPENDENCY_DUPLICATE",
        sliceFile,
        `Duplicate dependency on \`${targetSliceId}\` with kind \`${kind}\`.`,
      );
      continue;
    }
    seenDeps.add(depKey);

    // Check target slice exists
    const targetSliceFile = findSliceFile(root, targetSliceId);
    if (!targetSliceFile) {
      result.add(
        "SLICE_DEPENDENCY_TARGET_MISSING",
        sliceFile,
        `Dependency references non-existent slice \`${targetSliceId}\`.`,
      );
      continue;
    }

    // Validate required_state is a valid lifecycle state
    if (!isLifecycleState(requiredState)) {
      result.add(
        "SLICE_DEPENDENCY_INVALID_STATE",
        sliceFile,
        `Dependency at index ${index} has invalid \`required_state\` \`${requiredState}\`. Must be one of ${LIFECYCLE_ORDER.join(", ")}.`,
      );
    }
  }
}

function validateContextActiveSlices(
  root: string,
  contextIndex: Record<string, JsonObject>,
  sliceIndex: Record<string, JsonObject>,
  result: ValidationResult,
): void {
  for (const contextId of Object.keys(contextIndex).sort()) {
    const contextFile = path.join(root, "contexts", contextId, "context.yaml");
    const data = contextIndex[contextId];
    const activeSlices = data.active_slices;
    if (!Array.isArray(activeSlices)) {
      result.add("CONTEXT_ACTIVE_SLICES_INVALID", contextFile, "`active_slices` must be a list.");
      continue;
    }

    for (const sliceId of activeSlices) {
      if (typeof sliceId === "string" && !(sliceId in sliceIndex)) {
        result.add(
          "CONTEXT_ACTIVE_SLICE_MISSING",
          contextFile,
          `Active slice \`${sliceId}\` does not exist on disk.`,
        );
      }
    }
  }
}

function validateSliceTrace(
  root: string,
  sliceFile: string,
  sliceData: JsonObject,
  traceSchema: JsonObject | undefined,
  result: ValidationResult,
): void {
  const sliceDir = path.dirname(sliceFile);
  const sliceId = typeof sliceData.id === "string" ? sliceData.id : path.basename(sliceDir);
  const contextId = typeof sliceData.context_id === "string" ? sliceData.context_id : path.basename(path.dirname(path.dirname(sliceDir)));
  const tracePath = path.join(sliceDir, "trace.yaml");
  if (!fs.existsSync(tracePath)) {
    result.add("TRACE_FILE_MISSING", sliceDir, `Slice \`${sliceId}\` is missing \`trace.yaml\`.`);
    return;
  }

  const traceData = loadYaml(tracePath, result);
  validateFileAgainstSchema(tracePath, traceData, traceSchema, result);
  if (!isObject(traceData)) {
    return;
  }

  // Collect requirement IDs from both global and slice-level requirements.md
  const globalRequirementIds = collectRequirementIds(path.join(root, "docs", "input", "requirements.md"));
  const sliceRequirementIds = collectRequirementIds(path.join(sliceDir, "requirements.md"));
  const requirementIds = new Set([...globalRequirementIds, ...sliceRequirementIds]);

  const testIds = collectTestIds(path.join(sliceDir, "test-spec.yaml"), result);
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

  const nodeTypes = new Set<string>();
  links.forEach((link, index) => {
    if (!isObject(link)) {
      result.add("TRACE_LINK_INVALID", tracePath, `Trace link at index ${index} must be an object.`);
      return;
    }

    for (const side of ["from", "to"] as const) {
      const node = link[side];
      if (!isObject(node)) {
        result.add(
          "TRACE_NODE_INVALID",
          tracePath,
          `Trace link at index ${index} has a non-object \`${side}\` node.`,
        );
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
      result.add(
        "TRACE_CHAIN_INCOMPLETE",
        tracePath,
        `Trace for slice \`${sliceId}\` must include at least one \`${requiredType}\` node.`,
      );
    }
  }
}

function validateSliceTasks(
  root: string,
  sliceFile: string,
  agentIds: Set<string>,
  tasksSchema: JsonObject | undefined,
  result: ValidationResult,
): void {
  const sliceDir = path.dirname(sliceFile);
  const tasksPath = path.join(sliceDir, "tasks.yaml");
  if (!fs.existsSync(tasksPath)) {
    return;
  }

  const tasksData = loadYaml(tasksPath, result);
  validateFileAgainstSchema(tasksPath, tasksData, tasksSchema, result);
  if (!isObject(tasksData) || !Array.isArray(tasksData.tasks)) {
    return;
  }

  const seenIds = new Set<string>();
  const declaredIds = new Set<string>();
  const dependenciesToCheck: Array<{ taskId: string; dependsOn: string[] }> = [];
  const taskStatusById = new Map<string, string>();

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
      result.add(
        "TASK_OWNER_UNKNOWN",
        tasksPath,
        `Task \`${taskId ?? `index ${index}`}\` references unknown agent owner \`${owner}\`.`,
      );
    }

    const dependsOn = Array.isArray(task.depends_on)
      ? task.depends_on.filter((value): value is string => typeof value === "string")
      : [];
    if (taskId && dependsOn.length > 0) {
      dependenciesToCheck.push({ taskId, dependsOn });
    }
  }

  for (const dependencyGroup of dependenciesToCheck) {
    for (const dependencyId of dependencyGroup.dependsOn) {
      if (dependencyId === dependencyGroup.taskId) {
        result.add(
          "TASK_DEPENDENCY_SELF",
          tasksPath,
          `Task \`${dependencyGroup.taskId}\` cannot depend on itself.`,
        );
        continue;
      }
      if (!declaredIds.has(dependencyId)) {
        result.add(
          "TASK_DEPENDENCY_UNKNOWN",
          tasksPath,
          `Task \`${dependencyGroup.taskId}\` depends on unknown task \`${dependencyId}\`.`,
        );
      }
    }
  }

  validateTaskDependencyCycles(tasksPath, dependenciesToCheck, result);
  validateTaskDependencyStatuses(tasksPath, dependenciesToCheck, taskStatusById, result);
}

function validateTaskDependencyCycles(
  tasksPath: string,
  dependenciesToCheck: Array<{ taskId: string; dependsOn: string[] }>,
  result: ValidationResult,
): void {
  const dependencyMap = new Map<string, string[]>();
  for (const dependencyGroup of dependenciesToCheck) {
    dependencyMap.set(dependencyGroup.taskId, dependencyGroup.dependsOn);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  for (const taskId of dependencyMap.keys()) {
    visitTaskDependency(taskId, dependencyMap, visiting, visited, result, tasksPath);
  }
}

function validateTaskDependencyStatuses(
  tasksPath: string,
  dependenciesToCheck: Array<{ taskId: string; dependsOn: string[] }>,
  taskStatusById: Map<string, string>,
  result: ValidationResult,
): void {
  for (const dependencyGroup of dependenciesToCheck) {
    const taskStatus = taskStatusById.get(dependencyGroup.taskId);
    if (taskStatus !== "in_progress" && taskStatus !== "completed") {
      continue;
    }

    const unmetDependencies = dependencyGroup.dependsOn.filter((dependencyId) => taskStatusById.get(dependencyId) !== "completed");
    if (unmetDependencies.length > 0) {
      result.add(
        "TASK_DEPENDENCY_UNSATISFIED",
        tasksPath,
        `Task \`${dependencyGroup.taskId}\` cannot be \`${taskStatus}\` until these dependencies are completed: ${unmetDependencies.join(", ")}.`,
      );
    }
  }
}

function visitTaskDependency(
  taskId: string,
  dependencyMap: Map<string, string[]>,
  visiting: Set<string>,
  visited: Set<string>,
  result: ValidationResult,
  tasksPath: string,
): void {
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

function normalizeTraceLinks(rawLinks: unknown[]): TraceLink[] {
  const links: TraceLink[] = [];
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

function validateTraceNode(
  tracePath: string,
  index: number,
  side: string,
  nodeType: string | undefined,
  nodeId: string | undefined,
  requirementIds: Set<string>,
  scenarioIds: Set<string>,
  testIds: Set<string>,
  invariantIds: Set<string>,
  result: ValidationResult,
): void {
  if (!nodeType || !nodeId) {
    return;
  }

  if (nodeType === "requirement" && !requirementIds.has(nodeId)) {
    result.add(
      "TRACE_REQUIREMENT_UNKNOWN",
      tracePath,
      `Trace link at index ${index} references unknown requirement \`${nodeId}\` in \`${side}\`.`,
    );
  } else if (nodeType === "scenario" && !scenarioIds.has(nodeId)) {
    result.add(
      "TRACE_SCENARIO_UNKNOWN",
      tracePath,
      `Trace link at index ${index} references unknown scenario \`${nodeId}\` in \`${side}\`.`,
    );
  } else if (nodeType === "test" && !testIds.has(nodeId)) {
    result.add(
      "TRACE_TEST_UNKNOWN",
      tracePath,
      `Trace link at index ${index} references unknown test \`${nodeId}\` in \`${side}\`.`,
    );
  } else if (nodeType === "invariant" && !invariantIds.has(nodeId)) {
    result.add(
      "TRACE_INVARIANT_UNKNOWN",
      tracePath,
      `Trace link at index ${index} references unknown invariant \`${nodeId}\` in \`${side}\`.`,
    );
  }
}

function collectRequirementIds(requirementsPath: string): Set<string> {
  if (!fs.existsSync(requirementsPath)) {
    return new Set();
  }
  const content = fs.readFileSync(requirementsPath, "utf-8");
  return new Set(content.match(REQUIREMENT_ID_PATTERN) ?? []);
}

function collectTestIds(testSpecPath: string, result: ValidationResult): Set<string> {
  if (!fs.existsSync(testSpecPath)) {
    result.add("TEST_SPEC_MISSING", testSpecPath, "Missing `test-spec.yaml` required for trace validation.");
    return new Set();
  }

  const data = loadYaml(testSpecPath, result);
  if (!isObject(data) || !Array.isArray(data.tests)) {
    result.add("TEST_SPEC_INVALID", testSpecPath, "`tests` must be a list.");
    return new Set();
  }

  return new Set(
    data.tests
      .filter(isObject)
      .map((test) => test.id)
      .filter((id): id is string => typeof id === "string"),
  );
}

function collectScenarioIds(root: string, contextId: string, sliceDir: string): Set<string> {
  const scenarioIds = new Set<string>();
  const scenarioDir = path.join(root, "contexts", contextId, "behavior", "scenarios");
  if (fs.existsSync(scenarioDir)) {
    for (const entry of fs.readdirSync(scenarioDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".feature")) {
        scenarioIds.add(path.basename(entry.name, ".feature"));
      }
    }
  }

  const behaviorsPath = path.join(sliceDir, "behaviors.feature");
  if (fs.existsSync(behaviorsPath)) {
    const content = fs.readFileSync(behaviorsPath, "utf-8");
    for (const token of extractTokenIds(content, "SCN-")) {
      scenarioIds.add(token);
    }
  }
  return scenarioIds;
}

function collectInvariantIds(root: string, contextId: string, result: ValidationResult): Set<string> {
  const invariantsPath = path.join(root, "contexts", contextId, "domain", "invariants.yaml");
  if (!fs.existsSync(invariantsPath)) {
    return new Set();
  }

  const data = loadYaml(invariantsPath, result);
  if (!isObject(data) || !Array.isArray(data.invariants)) {
    result.add("INVARIANTS_INVALID", invariantsPath, "`invariants` must be a list.");
    return new Set();
  }

  return new Set(
    data.invariants
      .filter(isObject)
      .map((item) => item.id)
      .filter((id): id is string => typeof id === "string"),
  );
}

function extractTokenIds(content: string, prefix: string): Set<string> {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escapedPrefix}[A-Z0-9-]+\\b`, "g");
  return new Set(content.match(pattern) ?? []);
}

function loadSchemas(root: string, result: ValidationResult): Record<string, JsonObject> {
  const schemaDir = path.join(root, "schemas");
  const schemaNames: Record<string, string> = {
    project: "project.schema.json",
    context: "context.schema.json",
    slice: "slice.schema.json",
    trace: "trace.schema.json",
    contracts: "contracts.schema.json",
    tasks: "tasks.schema.json",
  };
  const schemas: Record<string, JsonObject> = {};

  for (const [key, filename] of Object.entries(schemaNames)) {
    const schemaPath = path.join(schemaDir, filename);
    if (!fs.existsSync(schemaPath)) {
      result.add("SCHEMA_MISSING", schemaPath, `Required schema \`${filename}\` does not exist.`);
      continue;
    }

    try {
      schemas[key] = JSON.parse(fs.readFileSync(schemaPath, "utf-8")) as JsonObject;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.add("SCHEMA_INVALID_JSON", schemaPath, `Invalid JSON: ${message}`);
    }
  }

  return schemas;
}

function loadAgentIds(root: string, result: ValidationResult): Set<string> {
  const agentsPath = path.join(root, "agents", "agents.yaml");
  if (!fs.existsSync(agentsPath)) {
    return new Set();
  }

  const data = loadYaml(agentsPath, result);
  if (!isObject(data) || !Array.isArray(data.agents)) {
    result.add("AGENTS_INVALID", agentsPath, "`agents` must be a list.");
    return new Set();
  }

  return new Set(
    data.agents
      .filter(isObject)
      .map((agent) => agent.id)
      .filter((id): id is string => typeof id === "string"),
  );
}

function validateFileAgainstSchema(
  filePath: string,
  data: unknown,
  schema: JsonObject | undefined,
  result: ValidationResult,
): void {
  if (!schema || data === undefined || data === null) {
    return;
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
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

function loadYaml(filePath: string, result: ValidationResult): unknown {
  if (!fs.existsSync(filePath)) {
    result.add("FILE_MISSING", filePath, "Expected file does not exist.");
    return undefined;
  }

  try {
    return yaml.load(fs.readFileSync(filePath, "utf-8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.add("YAML_PARSE_FAILED", filePath, `Invalid YAML: ${message}`);
    return undefined;
  }
}

function stateAtLeast(currentState: string, minimumState: string): boolean {
  return LIFECYCLE_ORDER.indexOf(currentState as (typeof LIFECYCLE_ORDER)[number]) >=
    LIFECYCLE_ORDER.indexOf(minimumState as (typeof LIFECYCLE_ORDER)[number]);
}

function displayPath(root: string, issuePath: string): string {
  return path.relative(root, issuePath) || issuePath;
}

function findFiles(root: string, filename: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }

  const results: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, filename));
    } else if (entry.isFile() && entry.name === filename) {
      results.push(fullPath);
    }
  }
  return results;
}

function findSliceFiles(root: string): string[] {
  const contextsRoot = path.join(root, "contexts");
  const results: string[] = [];
  if (!fs.existsSync(contextsRoot)) {
    return results;
  }

  for (const contextEntry of fs.readdirSync(contextsRoot, { withFileTypes: true })) {
    if (!contextEntry.isDirectory()) {
      continue;
    }
    const slicesRoot = path.join(contextsRoot, contextEntry.name, "slices");
    if (!fs.existsSync(slicesRoot)) {
      continue;
    }
    for (const sliceEntry of fs.readdirSync(slicesRoot, { withFileTypes: true })) {
      if (!sliceEntry.isDirectory()) {
        continue;
      }
      const sliceFile = path.join(slicesRoot, sliceEntry.name, "slice.yaml");
      if (fs.existsSync(sliceFile)) {
        results.push(sliceFile);
      }
    }
  }

  return results;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
