import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import {
  type LifecycleState,
  LIFECYCLE_ORDER,
  findSliceFile,
  getNextLifecycleState,
  getRequiredArtifactsForState,
  getRequiredGatesForState,
  isLifecycleState,
  validateSlice,
} from "./validator";

export interface SliceCreateOptions {
  root: string;
  contextId: string;
  sliceId: string;
  title?: string;
  goal?: string;
  priority: string;
  productOwner: string;
  engineeringOwner: string;
  requirementIds?: string[];
}

export class SliceCreateResult {
  constructor(
    public readonly root: string,
    public readonly contextId: string,
    public readonly sliceId: string,
    public readonly createdFiles: string[],
  ) {}

  renderText(): string {
    const lines = [
      `Created slice \`${this.sliceId}\` in context \`${this.contextId}\`.`,
      "Generated files:",
    ];
    lines.push(...this.createdFiles.map((filePath) => `- ${filePath}`));
    return lines.join("\n");
  }
}

export class SliceAdvanceResult {
  constructor(
    public readonly root: string,
    public readonly sliceId: string,
    public readonly fromState: LifecycleState,
    public readonly toState: LifecycleState,
    public readonly updatedGates: Record<string, boolean>,
  ) {}

  renderText(): string {
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

export class SliceUpdateGatesResult {
  constructor(
    public readonly root: string,
    public readonly sliceId: string,
    public readonly updatedGates: Record<string, boolean>,
    public readonly currentGates: Record<string, boolean>,
  ) {}

  renderText(): string {
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

export function createSlice(options: SliceCreateOptions): SliceCreateResult {
  const { root, contextId, sliceId } = options;
  const contextDir = path.join(root, "contexts", contextId);
  const contextFile = path.join(contextDir, "context.yaml");
  if (!fs.existsSync(contextFile)) {
    throw new Error(`Context \`${contextId}\` does not exist.`);
  }

  const sliceDir = path.join(contextDir, "slices", sliceId);
  if (fs.existsSync(sliceDir)) {
    throw new Error(`Slice \`${sliceId}\` already exists in context \`${contextId}\`.`);
  }

  const title = options.title ?? humanizeIdentifier(sliceId);
  const goal = options.goal ?? `Deliver ${title}.`;
  const requirementValue = (options.requirementIds ?? ["REQ-TBD-001"])[0];
  const scenarioValue = `SCN-${tokenize(sliceId)}-001`;
  const testValue = `TEST-${tokenize(sliceId)}-001`;
  const taskValue = `TASK-${tokenize(sliceId)}-001`;

  fs.mkdirSync(sliceDir, { recursive: false });
  const createdFiles: string[] = [];

  const slicePayload = {
    id: sliceId,
    title,
    context_id: contextId,
    status: LIFECYCLE_ORDER[0],
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

  const sliceYamlPath = path.join(sliceDir, "slice.yaml");
  fs.writeFileSync(sliceYamlPath, yaml.dump(slicePayload, { sortKeys: false, lineWidth: 120 }), "utf-8");
  createdFiles.push(sliceYamlPath);

  const replacements: Record<string, string> = {
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

  const templateRoot = path.join(root, "templates", "slice");
  for (const entry of fs.readdirSync(templateRoot, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === "slice.yaml") {
      continue;
    }
    const templatePath = path.join(templateRoot, entry.name);
    const targetPath = path.join(sliceDir, entry.name);
    let content = fs.readFileSync(templatePath, "utf-8");
    for (const [source, target] of Object.entries(replacements)) {
      content = content.replaceAll(source, target);
    }
    fs.writeFileSync(targetPath, content, "utf-8");
    createdFiles.push(targetPath);
  }

  appendActiveSlice(contextFile, sliceId);
  createdFiles.push(contextFile);

  return new SliceCreateResult(root, contextId, sliceId, createdFiles);
}

export interface SliceAdvanceOptions {
  root: string;
  sliceId: string;
  toState: string;
  gateUpdates?: string[];
}

export interface SliceUpdateGatesOptions {
  root: string;
  sliceId: string;
  gateUpdates: string[];
}

export function advanceSlice(options: SliceAdvanceOptions): SliceAdvanceResult {
  const sliceFile = findSliceFile(options.root, options.sliceId);
  if (!sliceFile) {
    throw new Error(`Slice \`${options.sliceId}\` does not exist.`);
  }

  const originalContent = fs.readFileSync(sliceFile, "utf-8");
  const sliceData = yaml.load(originalContent);
  if (!isPlainObject(sliceData)) {
    throw new Error(`Slice file \`${sliceFile}\` is not valid YAML.`);
  }

  const currentState = sliceData.status;
  if (typeof currentState !== "string" || !isLifecycleState(currentState)) {
    throw new Error(`Slice \`${options.sliceId}\` has an invalid current status.`);
  }
  if (!isLifecycleState(options.toState)) {
    throw new Error(`Target state must be one of ${LIFECYCLE_ORDER.join(", ")}.`);
  }
  if (currentState === options.toState) {
    throw new Error(`Slice \`${options.sliceId}\` is already in \`${options.toState}\`.`);
  }

  const expectedNextState = getNextLifecycleState(currentState);
  if (options.toState !== expectedNextState) {
    throw new Error(
      expectedNextState
        ? `Slice \`${options.sliceId}\` can only advance from \`${currentState}\` to \`${expectedNextState}\`.`
        : `Slice \`${options.sliceId}\` is already at the final state.`,
    );
  }

  const gates = ensureGatesRecord(sliceData, sliceFile);
  const updatedGates = applyGateUpdates(gates, options.gateUpdates ?? []);
  enforceArtifactRequirements(sliceFile, options.toState);
  enforceGateRequirements(options.toState, gates, options.sliceId);

  sliceData.status = options.toState;
  sliceData.gates = gates;

  const nextContent = yaml.dump(sliceData, { sortKeys: false, lineWidth: 120 });
  fs.writeFileSync(sliceFile, nextContent, "utf-8");

  const validation = validateSlice(options.root, options.sliceId);
  if (!validation.ok) {
    fs.writeFileSync(sliceFile, originalContent, "utf-8");
    throw new Error(validation.renderText());
  }

  return new SliceAdvanceResult(options.root, options.sliceId, currentState, options.toState, updatedGates);
}

export function updateSliceGates(options: SliceUpdateGatesOptions): SliceUpdateGatesResult {
  if (options.gateUpdates.length === 0) {
    throw new Error("At least one gate update is required. Use --set-gate gate_name=true|false.");
  }

  const sliceFile = findSliceFile(options.root, options.sliceId);
  if (!sliceFile) {
    throw new Error(`Slice \`${options.sliceId}\` does not exist.`);
  }

  const originalContent = fs.readFileSync(sliceFile, "utf-8");
  const sliceData = yaml.load(originalContent);
  if (!isPlainObject(sliceData)) {
    throw new Error(`Slice file \`${sliceFile}\` is not valid YAML.`);
  }

  const gates = ensureGatesRecord(sliceData, sliceFile);
  const updatedGates = applyGateUpdates(gates, options.gateUpdates);
  sliceData.gates = gates;

  const nextContent = yaml.dump(sliceData, { sortKeys: false, lineWidth: 120 });
  fs.writeFileSync(sliceFile, nextContent, "utf-8");

  const validation = validateSlice(options.root, options.sliceId);
  if (!validation.ok) {
    fs.writeFileSync(sliceFile, originalContent, "utf-8");
    throw new Error(validation.renderText());
  }

  return new SliceUpdateGatesResult(options.root, options.sliceId, updatedGates, gates);
}

function appendActiveSlice(contextFile: string, sliceId: string): void {
  const data = yaml.load(fs.readFileSync(contextFile, "utf-8"));
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`Context file \`${contextFile}\` is not valid YAML.`);
  }

  const contextData = data as Record<string, unknown>;
  const activeSlices = contextData.active_slices;
  if (!Array.isArray(activeSlices)) {
    throw new Error(`Context file \`${contextFile}\` must contain an \`active_slices\` list.`);
  }

  if (!activeSlices.includes(sliceId)) {
    activeSlices.push(sliceId);
  }
  contextData.active_slices = activeSlices;
  fs.writeFileSync(contextFile, yaml.dump(contextData, { sortKeys: false, lineWidth: 120 }), "utf-8");
}

function ensureGatesRecord(sliceData: Record<string, unknown>, sliceFile: string): Record<string, boolean> {
  const gates = sliceData.gates;
  if (!isPlainObject(gates)) {
    throw new Error(`Slice file \`${sliceFile}\` must contain a \`gates\` object.`);
  }

  const gateRecord: Record<string, boolean> = {};
  for (const [name, value] of Object.entries(gates)) {
    if (typeof value !== "boolean") {
      throw new Error(`Gate \`${name}\` in \`${sliceFile}\` must be a boolean.`);
    }
    gateRecord[name] = value;
  }
  return gateRecord;
}

function applyGateUpdates(gates: Record<string, boolean>, updates: string[]): Record<string, boolean> {
  const applied: Record<string, boolean> = {};
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

function enforceArtifactRequirements(sliceFile: string, targetState: LifecycleState): void {
  const sliceDir = path.dirname(sliceFile);
  for (const artifact of getRequiredArtifactsForState(targetState)) {
    const artifactPath = artifact === "slice.yaml" ? sliceFile : path.join(sliceDir, artifact);
    if (!fs.existsSync(artifactPath)) {
      throw new Error(`State \`${targetState}\` requires \`${artifact}\` before advancing.`);
    }
  }
}

function enforceGateRequirements(targetState: LifecycleState, gates: Record<string, boolean>, sliceId: string): void {
  const missing = getRequiredGatesForState(targetState).filter((gate) => gates[gate] !== true);
  if (missing.length > 0) {
    throw new Error(
      `Slice \`${sliceId}\` cannot advance to \`${targetState}\` until these gates are true: ${missing.join(", ")}.`,
    );
  }
}

function humanizeIdentifier(value: string): string {
  return value
    .replaceAll("_", "-")
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function tokenize(value: string): string {
  return value
    .toUpperCase()
    .replaceAll("_", "-")
    .split("")
    .filter((char) => /[A-Z0-9-]/.test(char))
    .join("");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
