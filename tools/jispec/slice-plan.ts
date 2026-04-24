import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { type SliceTask, writeTasksFile } from "./tasks";
import { findSliceFile, validateSlice } from "./validator";

interface PlannedTaskDraft {
  key: string;
  title: string;
  owner: string;
  dependsOnKeys: string[];
}

export class SlicePlanResult {
  constructor(
    public readonly root: string,
    public readonly sliceId: string,
    public readonly writtenFiles: string[],
    public readonly taskCount: number,
    public readonly taskOwners: string[],
  ) {}

  renderText(): string {
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

export function planSlice(root: string, sliceId: string, force = false): SlicePlanResult {
  const sliceFile = findSliceFile(root, sliceId);
  if (!sliceFile) {
    throw new Error(`Slice \`${sliceId}\` does not exist.`);
  }

  const sliceDir = path.dirname(sliceFile);
  const sliceData = loadYamlObject(sliceFile);
  const contextId = readString(sliceData.context_id, `Slice \`${sliceId}\` is missing \`context_id\`.`);

  const tasksPath = path.join(sliceDir, "tasks.yaml");
  const originalTasks = fs.existsSync(tasksPath) ? fs.readFileSync(tasksPath, "utf-8") : null;

  try {
    const plannedTasks = buildPlannedTasks(root, sliceId, contextId, sliceDir, sliceData);
    const content = yaml.dump(
      {
        tasks: plannedTasks.map((task) => {
          const record: Record<string, unknown> = {
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
      },
      { sortKeys: false, lineWidth: 120 },
    );
    writePlannedTasks(tasksPath, content, plannedTasks, force);

    const validation = validateSlice(root, sliceId);
    if (!validation.ok) {
      throw new Error(validation.renderText());
    }

    return new SlicePlanResult(
      root,
      sliceId,
      [tasksPath],
      plannedTasks.length,
      Array.from(new Set(plannedTasks.map((task) => task.owner))).sort(),
    );
  } catch (error) {
    if (originalTasks === null) {
      if (fs.existsSync(tasksPath)) {
        fs.rmSync(tasksPath, { force: true });
      }
    } else {
      fs.writeFileSync(tasksPath, originalTasks, "utf-8");
    }
    throw error;
  }
}

function buildPlannedTasks(
  root: string,
  sliceId: string,
  contextId: string,
  sliceDir: string,
  sliceData: Record<string, unknown>,
): SliceTask[] {
  const taskDrafts: PlannedTaskDraft[] = [];
  const artifactTaskKeys: string[] = [];

  const designPath = path.join(sliceDir, "design.md");
  const behaviorPath = path.join(sliceDir, "behaviors.feature");
  const testSpecPath = path.join(sliceDir, "test-spec.yaml");
  const tracePath = path.join(sliceDir, "trace.yaml");

  if (!fs.existsSync(designPath)) {
    const task = createTaskDraft("design", "Generate or refine the slice design document", "design-agent");
    taskDrafts.push(task);
    artifactTaskKeys.push(task.key);
  }
  if (!fs.existsSync(behaviorPath)) {
    const task = createTaskDraft(
      "behavior",
      "Derive executable behavior scenarios for the slice",
      "behavior-agent",
      artifactTaskKeys,
    );
    taskDrafts.push(task);
    artifactTaskKeys.push(task.key);
  }
  if (!fs.existsSync(testSpecPath)) {
    const task = createTaskDraft(
      "test-spec",
      "Generate slice test specifications and coverage mapping",
      "test-agent",
      artifactTaskKeys,
    );
    taskDrafts.push(task);
    artifactTaskKeys.push(task.key);
  }
  if (!fs.existsSync(tracePath)) {
    const task = createTaskDraft(
      "trace",
      "Synchronize trace links for requirements, scenarios, and tests",
      "review-agent",
      artifactTaskKeys,
    );
    taskDrafts.push(task);
    artifactTaskKeys.push(task.key);
  }

  const implementationDependencyKeys = artifactTaskKeys.slice(-1);
  const implementationTaskKeys: string[] = [];
  const modules = Array.from(new Set(loadDesignModules(root, contextId)));
  if (modules.length > 0) {
    for (const moduleName of modules) {
      const task = createTaskDraft(
        `implement:${moduleName}`,
        `Implement or update slice logic in ${moduleName}`,
        "build-agent",
        implementationDependencyKeys,
      );
      taskDrafts.push(task);
      implementationTaskKeys.push(task.key);
    }
  } else {
    const task = createTaskDraft(
      "implement:primary",
      "Implement the slice in the primary context modules",
      "build-agent",
      implementationDependencyKeys,
    );
    taskDrafts.push(task);
    implementationTaskKeys.push(task.key);
  }

  const verificationDependencyKeys =
    implementationTaskKeys.length > 0 ? implementationTaskKeys : implementationDependencyKeys;
  const verificationTaskKeys: string[] = [];
  const testTargets = dedupeTestTargets(loadTestTargets(testSpecPath));
  if (testTargets.length > 0) {
    for (const testTarget of testTargets) {
      const task = createTaskDraft(
        `verify:${testTarget.type}:${testTarget.target}`,
        `Add or update ${testTarget.type} tests for ${testTarget.target}`,
        "test-agent",
        verificationDependencyKeys,
      );
      taskDrafts.push(task);
      verificationTaskKeys.push(task.key);
    }
  } else {
    const task = createTaskDraft(
      "verify:default",
      "Add slice verification tests",
      "test-agent",
      verificationDependencyKeys,
    );
    taskDrafts.push(task);
    verificationTaskKeys.push(task.key);
  }

  if (Array.isArray(sliceData.source_refs as unknown)) {
    // no-op; placeholder to keep deterministic behavior if schema evolves
  }

  const reviewDependencyKeys =
    verificationTaskKeys.length > 0
      ? verificationTaskKeys
      : implementationTaskKeys.length > 0
        ? implementationTaskKeys
        : implementationDependencyKeys;
  const reviewTask = createTaskDraft(
    "review:protocol",
    "Run slice check and resolve protocol issues",
    "review-agent",
    reviewDependencyKeys,
  );
  taskDrafts.push(reviewTask);
  taskDrafts.push(
    createTaskDraft(
      "review:evidence",
      "Collect acceptance evidence and prepare gate updates",
      "review-agent",
      [reviewTask.key],
    ),
  );

  return assignTaskIds(sliceId, taskDrafts);
}

function loadDesignModules(root: string, contextId: string): string[] {
  const modulesPath = path.join(root, "contexts", contextId, "design", "modules.yaml");
  if (!fs.existsSync(modulesPath)) {
    return [];
  }

  const raw = yaml.load(fs.readFileSync(modulesPath, "utf-8"));
  if (!isPlainObject(raw) || !Array.isArray(raw.modules)) {
    return [];
  }

  return raw.modules
    .filter(isPlainObject)
    .map((moduleInfo) => moduleInfo.name)
    .filter((name): name is string => typeof name === "string");
}

function loadTestTargets(testSpecPath: string): Array<{ type: string; target: string }> {
  if (!fs.existsSync(testSpecPath)) {
    return [];
  }

  const raw = yaml.load(fs.readFileSync(testSpecPath, "utf-8"));
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

function dedupeTestTargets(testTargets: Array<{ type: string; target: string }>): Array<{ type: string; target: string }> {
  const seen = new Set<string>();
  const deduped: Array<{ type: string; target: string }> = [];
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

function createTaskDraft(key: string, title: string, owner: string, dependsOnKeys: string[] = []): PlannedTaskDraft {
  return {
    key,
    title,
    owner,
    dependsOnKeys: Array.from(new Set(dependsOnKeys)),
  };
}

function assignTaskIds(sliceId: string, taskDrafts: PlannedTaskDraft[]): SliceTask[] {
  const taskPrefix = makeTaskPrefix(sliceId);
  const idByKey = new Map<string, string>();
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

function makeTaskPrefix(sliceId: string): string {
  return `TASK-${sliceId.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`;
}

function writePlannedTasks(tasksPath: string, content: string, plannedTasks: SliceTask[], force: boolean): void {
  if (fs.existsSync(tasksPath)) {
    const current = fs.readFileSync(tasksPath, "utf-8");
    if (current === content) {
      return;
    }
    if (!force) {
      throw new Error(`Refusing to overwrite existing file \`${tasksPath}\` without --force.`);
    }
  } else {
    fs.mkdirSync(path.dirname(tasksPath), { recursive: true });
  }

  writeTasksFile(tasksPath, plannedTasks);
}

function loadYamlObject(filePath: string): Record<string, unknown> {
  const raw = yaml.load(fs.readFileSync(filePath, "utf-8"));
  if (!isPlainObject(raw)) {
    throw new Error(`File \`${filePath}\` is not valid YAML.`);
  }
  return raw;
}

function readString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(message);
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
