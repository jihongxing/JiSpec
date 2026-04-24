import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { findSliceFile, validateSlice } from "./validator";

export const TASK_STATUSES = ["pending", "in_progress", "completed", "blocked"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface SliceTask {
  id: string;
  title: string;
  owner: string;
  status: TaskStatus;
  dependsOn: string[];
  updatedAt?: string;
}

export interface SliceTaskContext {
  root: string;
  sliceId: string;
  contextId: string;
  sliceDir: string;
  tasksPath: string;
  tasks: SliceTask[];
}

export interface TaskSummary {
  taskCount: number;
  completedTaskCount: number;
  activeTaskCount: number;
  blockedTaskCount: number;
  pendingTaskCount: number;
  actionableTaskCount: number;
  waitingTaskCount: number;
  actionableTasks: SliceTask[];
}

export interface SliceTaskUpdateOptions {
  root: string;
  sliceId: string;
  statusUpdates: string[];
  timestamp?: string;
}

export class SliceTaskUpdateResult {
  constructor(
    public readonly root: string,
    public readonly sliceId: string,
    public readonly changedTasks: SliceTask[],
  ) {}

  renderText(): string {
    const lines = [`Updated tasks for slice \`${this.sliceId}\`.`];
    if (this.changedTasks.length === 0) {
      lines.push("No tasks changed.");
      return lines.join("\n");
    }

    lines.push("Changed tasks:");
    lines.push(
      ...this.changedTasks.map(
        (task) =>
          `- ${task.id} | status=${task.status} | owner=${task.owner}${task.updatedAt ? ` | updated_at=${task.updatedAt}` : ""}`,
      ),
    );
    return lines.join("\n");
  }
}

export function loadSliceTasks(root: string, sliceId: string): SliceTaskContext {
  const sliceFile = findSliceFile(root, sliceId);
  if (!sliceFile) {
    throw new Error(`Slice \`${sliceId}\` does not exist.`);
  }

  const sliceDir = path.dirname(sliceFile);
  return {
    root,
    sliceId,
    contextId: path.basename(path.dirname(path.dirname(sliceDir))),
    sliceDir,
    tasksPath: path.join(sliceDir, "tasks.yaml"),
    tasks: readTasksFile(path.join(sliceDir, "tasks.yaml")),
  };
}

export function readTasksFile(tasksPath: string): SliceTask[] {
  if (!fs.existsSync(tasksPath)) {
    return [];
  }

  const raw = yaml.load(fs.readFileSync(tasksPath, "utf-8"));
  if (!isPlainObject(raw) || !Array.isArray(raw.tasks)) {
    throw new Error(`Tasks file \`${tasksPath}\` is not valid YAML.`);
  }

  return raw.tasks.flatMap((task, index) => {
    if (!isPlainObject(task)) {
      throw new Error(`Task at index ${index} in \`${tasksPath}\` must be an object.`);
    }
    return [normalizeTask(task, tasksPath, index)];
  });
}

export function summarizeTasks(tasks: SliceTask[]): TaskSummary {
  let completedTaskCount = 0;
  let activeTaskCount = 0;
  let blockedTaskCount = 0;
  let pendingTaskCount = 0;

  for (const task of tasks) {
    if (task.status === "completed") {
      completedTaskCount += 1;
    } else if (task.status === "in_progress") {
      activeTaskCount += 1;
    } else if (task.status === "blocked") {
      blockedTaskCount += 1;
    } else {
      pendingTaskCount += 1;
    }
  }

  const actionableTasks = getActionableTasks(tasks);
  return {
    taskCount: tasks.length,
    completedTaskCount,
    activeTaskCount,
    blockedTaskCount,
    pendingTaskCount,
    actionableTaskCount: actionableTasks.length,
    waitingTaskCount: Math.max(pendingTaskCount - actionableTasks.length, 0),
    actionableTasks,
  };
}

export function getActionableTasks(tasks: SliceTask[]): SliceTask[] {
  const completedTaskIds = new Set(tasks.filter((task) => task.status === "completed").map((task) => task.id));
  return tasks.filter(
    (task) => task.status === "pending" && task.dependsOn.every((dependencyId) => completedTaskIds.has(dependencyId)),
  );
}

export function updateSliceTasks(options: SliceTaskUpdateOptions): SliceTaskUpdateResult {
  if (options.statusUpdates.length === 0) {
    throw new Error("At least one task status update is required. Use --set-status task_id=pending|in_progress|completed|blocked.");
  }

  const taskContext = loadSliceTasks(options.root, options.sliceId);
  if (!fs.existsSync(taskContext.tasksPath)) {
    throw new Error(`Slice \`${options.sliceId}\` does not have a \`tasks.yaml\` file yet.`);
  }

  const originalContent = fs.readFileSync(taskContext.tasksPath, "utf-8");
  const tasksById = new Map(taskContext.tasks.map((task) => [task.id, { ...task, dependsOn: [...task.dependsOn] }]));
  const changedTaskIds: string[] = [];
  const changedTaskSet = new Set<string>();
  const timestamp = options.timestamp ?? new Date().toISOString();

  try {
    for (const update of options.statusUpdates) {
      const [rawTaskId, rawStatus] = update.split("=", 2);
      const taskId = rawTaskId?.trim();
      const statusValue = rawStatus?.trim();
      if (!taskId || !statusValue) {
        throw new Error(`Invalid task status update \`${update}\`. Use the form task_id=pending|in_progress|completed|blocked.`);
      }
      if (!isTaskStatus(statusValue)) {
        throw new Error(
          `Invalid task status \`${statusValue}\` for task \`${taskId}\`. Use one of ${TASK_STATUSES.join(", ")}.`,
        );
      }

      const task = tasksById.get(taskId);
      if (!task) {
        throw new Error(`Task \`${taskId}\` does not exist in slice \`${options.sliceId}\`.`);
      }

      task.status = statusValue;
      task.updatedAt = timestamp;
      if (!changedTaskSet.has(taskId)) {
        changedTaskIds.push(taskId);
        changedTaskSet.add(taskId);
      }
    }

    const nextTasks = taskContext.tasks.map((task) => {
      const updated = tasksById.get(task.id);
      if (!updated) {
        return task;
      }
      return updated;
    });

    enforceTaskGraphConsistency(nextTasks);

    writeTasksFile(taskContext.tasksPath, nextTasks);
    const validation = validateSlice(options.root, options.sliceId);
    if (!validation.ok) {
      throw new Error(validation.renderText());
    }

    return new SliceTaskUpdateResult(
      options.root,
      options.sliceId,
      changedTaskIds.map((taskId) => {
        const task = tasksById.get(taskId);
        if (!task) {
          throw new Error(`Task \`${taskId}\` disappeared during update.`);
        }
        return task;
      }),
    );
  } catch (error) {
    fs.writeFileSync(taskContext.tasksPath, originalContent, "utf-8");
    throw error;
  }
}

export function writeTasksFile(tasksPath: string, tasks: SliceTask[]): void {
  const payload = {
    tasks: tasks.map((task) => {
      const record: Record<string, unknown> = {
        id: task.id,
        title: task.title,
        owner: task.owner,
        status: task.status,
      };
      if (task.dependsOn.length > 0) {
        record.depends_on = task.dependsOn;
      }
      if (task.updatedAt) {
        record.updated_at = task.updatedAt;
      }
      return record;
    }),
  };

  fs.writeFileSync(tasksPath, yaml.dump(payload, { sortKeys: false, lineWidth: 120 }), "utf-8");
}

function normalizeTask(task: Record<string, unknown>, tasksPath: string, index: number): SliceTask {
  const id = readString(task.id, `Task at index ${index} in \`${tasksPath}\` is missing \`id\`.`);
  const title = readString(task.title, `Task \`${id}\` in \`${tasksPath}\` is missing \`title\`.`);
  const owner = readString(task.owner, `Task \`${id}\` in \`${tasksPath}\` is missing \`owner\`.`);
  const status = readTaskStatus(task.status, `Task \`${id}\` in \`${tasksPath}\` has an invalid \`status\`.`);
  const dependsOn = Array.isArray(task.depends_on)
    ? task.depends_on.flatMap((value, dependencyIndex) => {
        if (typeof value !== "string" || value.length === 0) {
          throw new Error(
            `Task \`${id}\` in \`${tasksPath}\` has an invalid dependency at index ${dependencyIndex}.`,
          );
        }
        return [value];
      })
    : [];
  const updatedAt = typeof task.updated_at === "string" && task.updated_at.length > 0 ? task.updated_at : undefined;

  return {
    id,
    title,
    owner,
    status,
    dependsOn,
    updatedAt,
  };
}

function enforceTaskGraphConsistency(tasks: SliceTask[]): void {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  for (const task of tasks) {
    if (task.status !== "in_progress" && task.status !== "completed") {
      continue;
    }
    const unmetDependencies = task.dependsOn.filter((dependencyId) => tasksById.get(dependencyId)?.status !== "completed");
    if (unmetDependencies.length > 0) {
      throw new Error(
        `Task \`${task.id}\` cannot remain in \`${task.status}\` until these dependencies are completed: ${unmetDependencies.join(", ")}.`,
      );
    }
  }
}

function isTaskStatus(value: string): value is TaskStatus {
  return TASK_STATUSES.includes(value as TaskStatus);
}

function readTaskStatus(value: unknown, message: string): TaskStatus {
  if (typeof value !== "string" || !isTaskStatus(value)) {
    throw new Error(message);
  }
  return value;
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
