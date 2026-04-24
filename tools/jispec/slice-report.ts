import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import {
  type LifecycleState,
  buildTraceReport,
  findSliceFile,
  getNextLifecycleState,
  getRequiredArtifactsForState,
  getRequiredGatesForState,
  isLifecycleState,
  validateSlice,
} from "./validator";

interface ArtifactStatus {
  name: string;
  path: string;
  exists: boolean;
  requiredForCurrent: boolean;
  requiredForNext: boolean;
}

export class SliceShowReport {
  constructor(
    public readonly root: string,
    public readonly sliceId: string,
    public readonly contextId: string,
    public readonly title: string,
    public readonly goal: string,
    public readonly priority: string,
    public readonly state: LifecycleState,
    public readonly nextState: LifecycleState | undefined,
    public readonly owners: Record<string, string>,
    public readonly requirementIds: string[],
    public readonly designRefs: string[],
    public readonly gates: Record<string, boolean>,
    public readonly artifacts: ArtifactStatus[],
    public readonly validationIssueCount: number,
    public readonly traceLinkCount: number,
  ) {}

  toDict(): Record<string, unknown> {
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

  renderText(): string {
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
    lines.push(
      ...this.artifacts.map((artifact) => {
        const tags = [];
        if (artifact.requiredForCurrent) {
          tags.push("current");
        }
        if (artifact.requiredForNext) {
          tags.push("next");
        }
        const tagText = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
        return `- ${artifact.name}: ${artifact.exists ? "present" : "missing"}${tagText}`;
      }),
    );

    return lines.join("\n");
  }
}

export class SliceStatusReport {
  constructor(
    public readonly root: string,
    public readonly sliceId: string,
    public readonly state: LifecycleState,
    public readonly nextState: LifecycleState | undefined,
    public readonly readyForNextState: boolean,
    public readonly missingArtifactsForCurrent: string[],
    public readonly missingArtifactsForNext: string[],
    public readonly missingGatesForNext: string[],
    public readonly validationIssues: string[],
    public readonly suggestedNextActions: string[],
  ) {}

  toDict(): Record<string, unknown> {
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

  renderText(): string {
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

export function buildSliceShowReport(root: string, sliceId: string): SliceShowReport {
  const context = loadSliceContext(root, sliceId);
  const validation = validateSlice(root, sliceId);
  const nextState = getNextLifecycleState(context.state);
  const currentRequired = new Set(getRequiredArtifactsForState(context.state));
  const nextRequired = new Set(nextState ? getRequiredArtifactsForState(nextState) : []);
  const artifacts = standardArtifactPaths(context).map(([name, artifactPath]) => ({
    name,
    path: artifactPath,
    exists: fs.existsSync(artifactPath),
    requiredForCurrent: currentRequired.has(name),
    requiredForNext: nextRequired.has(name),
  }));

  let traceLinkCount = 0;
  try {
    traceLinkCount = buildTraceReport(root, sliceId).links.length;
  } catch {
    traceLinkCount = 0;
  }

  return new SliceShowReport(
    root,
    sliceId,
    context.contextId,
    context.title,
    context.goal,
    context.priority,
    context.state,
    nextState,
    context.owners,
    context.requirementIds,
    context.designRefs,
    context.gates,
    artifacts,
    validation.issues.length,
    traceLinkCount,
  );
}

export function buildSliceStatusReport(root: string, sliceId: string): SliceStatusReport {
  const context = loadSliceContext(root, sliceId);
  const validation = validateSlice(root, sliceId);
  const nextState = getNextLifecycleState(context.state);
  const currentArtifacts = getRequiredArtifactsForState(context.state);
  const nextArtifacts = nextState ? getRequiredArtifactsForState(nextState) : [];
  const missingArtifactsForCurrent = currentArtifacts.filter(
    (artifact) => !fs.existsSync(path.join(context.sliceDir, artifact)),
  );
  const missingArtifactsForNext = nextArtifacts.filter(
    (artifact) => !fs.existsSync(path.join(context.sliceDir, artifact)),
  );
  const missingGatesForNext = nextState
    ? getRequiredGatesForState(nextState).filter((gate) => context.gates[gate] !== true)
    : [];
  const validationIssues = validation.issues.map((issue) => `[${issue.code}] ${issue.message}`);

  const suggestedNextActions = new Set<string>();
  const derivableArtifacts = new Set(["design.md", "behaviors.feature", "test-spec.yaml", "trace.yaml"]);
  const shouldSuggestDeriveAll =
    missingArtifactsForCurrent.some((artifact) => derivableArtifacts.has(artifact)) ||
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
    suggestedNextActions.add(
      `Set the required gates and rerun \`slice advance <slice-id> --to ${nextState}\` when ready.`,
    );
  }
  if (validation.issues.length > 0) {
    suggestedNextActions.add("Run `slice check <slice-id>` and resolve the reported protocol issues.");
  }
  if (suggestedNextActions.size === 0 && nextState) {
    suggestedNextActions.add(`Advance the slice with \`slice advance <slice-id> --to ${nextState}\`.`);
  }

  return new SliceStatusReport(
    root,
    sliceId,
    context.state,
    nextState,
    missingArtifactsForCurrent.length === 0 &&
      missingArtifactsForNext.length === 0 &&
      missingGatesForNext.length === 0 &&
      validation.ok,
    missingArtifactsForCurrent,
    missingArtifactsForNext,
    missingGatesForNext,
    validationIssues,
    Array.from(suggestedNextActions),
  );
}

function loadSliceContext(root: string, sliceId: string) {
  const sliceFile = findSliceFile(root, sliceId);
  if (!sliceFile) {
    throw new Error(`Slice \`${sliceId}\` does not exist.`);
  }

  const raw = yaml.load(fs.readFileSync(sliceFile, "utf-8"));
  if (!isPlainObject(raw)) {
    throw new Error(`Slice file \`${sliceFile}\` is not valid YAML.`);
  }

  const contextId = typeof raw.context_id === "string" ? raw.context_id : undefined;
  const lifecycle = isPlainObject(raw.lifecycle) ? raw.lifecycle : undefined;
  const state = lifecycle && typeof lifecycle.state === "string" && isLifecycleState(lifecycle.state) ? lifecycle.state : undefined;
  if (!contextId || !state) {
    throw new Error(`Slice file \`${sliceFile}\` is missing required lifecycle.state metadata.`);
  }

  const owners = isPlainObject(raw.owners)
    ? Object.fromEntries(Object.entries(raw.owners).filter(([, value]) => typeof value === "string")) as Record<
        string,
        string
      >
    : {};
  const requirementIds =
    isPlainObject(raw.source_refs) && Array.isArray(raw.source_refs.requirement_ids)
      ? raw.source_refs.requirement_ids.filter((value): value is string => typeof value === "string")
      : [];
  const designRefs =
    isPlainObject(raw.source_refs) && Array.isArray(raw.source_refs.design_refs)
      ? raw.source_refs.design_refs.filter((value): value is string => typeof value === "string")
      : [];
  const gates = isPlainObject(raw.gates)
    ? Object.fromEntries(Object.entries(raw.gates).filter(([, value]) => typeof value === "boolean")) as Record<
        string,
        boolean
      >
    : {};

  return {
    sliceFile,
    sliceDir: path.dirname(sliceFile),
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

function standardArtifactPaths(context: { sliceDir: string; sliceFile: string }): Array<[string, string]> {
  return [
    ["slice.yaml", context.sliceFile],
    ["requirements.md", path.join(context.sliceDir, "requirements.md")],
    ["design.md", path.join(context.sliceDir, "design.md")],
    ["behaviors.feature", path.join(context.sliceDir, "behaviors.feature")],
    ["test-spec.yaml", path.join(context.sliceDir, "test-spec.yaml")],
    ["tasks.yaml", path.join(context.sliceDir, "tasks.yaml")],
    ["trace.yaml", path.join(context.sliceDir, "trace.yaml")],
    ["evidence.md", path.join(context.sliceDir, "evidence.md")],
  ];
}

function displayPath(root: string, filePath: string): string {
  return path.relative(root, filePath) || filePath;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
