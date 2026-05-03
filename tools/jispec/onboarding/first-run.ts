import fs from "node:fs";
import path from "node:path";

export type FirstRunClassification =
  | "active_change_session"
  | "open_bootstrap_draft"
  | "needs_bootstrap_draft"
  | "needs_policy"
  | "verify_blocked"
  | "ready_to_verify"
  | "legacy_takeover_start"
  | "greenfield_start";

export interface FirstRunCommandRecommendation {
  command: string;
  reason: string;
  writesLocalArtifacts: boolean;
  writes: string[];
}

export interface FirstRunState {
  projectScaffold: boolean;
  bootstrapEvidence: boolean;
  openDraftSessionId?: string;
  adoptedContracts: boolean;
  policy: boolean;
  verifyReport?: {
    path: string;
    verdict?: string;
    ok?: boolean;
  };
  activeChangeSession?: {
    id?: string;
    summary?: string;
    mode?: string;
  };
  greenfieldInputs: {
    requirements?: string;
    technicalSolution?: string;
  };
  sourceSignals: string[];
  emptyDirectory: boolean;
}

export interface FirstRunResult {
  root: string;
  classification: FirstRunClassification;
  summary: string;
  state: FirstRunState;
  nextAction: FirstRunCommandRecommendation;
  alternativeActions: FirstRunCommandRecommendation[];
  boundaries: {
    readOnly: boolean;
    sourceUploadRequired: boolean;
    llmBlockingGate: boolean;
    writesOnlyWhenUserRunsNextCommand: boolean;
  };
}

interface VerifyReportJson {
  verdict?: string;
  ok?: boolean;
}

interface ChangeSessionJson {
  id?: string;
  summary?: string;
  orchestrationMode?: string;
}

interface DraftManifestJson {
  sessionId?: string;
  status?: string;
  updatedAt?: string;
  createdAt?: string;
}

export function runFirstRun(options: { root: string }): FirstRunResult {
  const root = path.resolve(options.root);
  const state = collectFirstRunState(root);
  const rootArg = formatRootArg(root);
  const alternativeActions = buildAlternativeActions(rootArg, state);
  const nextAction = chooseNextAction(rootArg, state);

  return {
    root: normalizePath(root),
    classification: classifyState(state),
    summary: summarizeState(state),
    state,
    nextAction,
    alternativeActions,
    boundaries: {
      readOnly: true,
      sourceUploadRequired: false,
      llmBlockingGate: false,
      writesOnlyWhenUserRunsNextCommand: true,
    },
  };
}

export function renderFirstRunJSON(result: FirstRunResult): string {
  return JSON.stringify(result, null, 2);
}

export function renderFirstRunText(result: FirstRunResult): string {
  const lines = [
    "JiSpec Guided First Run",
    `Root: ${result.root}`,
    `State: ${result.classification}`,
    `Summary: ${result.summary}`,
    "",
    "Next action:",
    `- ${result.nextAction.command}`,
    `  Reason: ${result.nextAction.reason}`,
    `  Writes local artifacts: ${result.nextAction.writesLocalArtifacts ? "yes" : "no"}`,
  ];

  if (result.nextAction.writes.length > 0) {
    lines.push("  Writes:");
    for (const writePath of result.nextAction.writes) {
      lines.push(`  - ${writePath}`);
    }
  }

  if (result.alternativeActions.length > 0) {
    lines.push("", "Alternatives:");
    for (const action of result.alternativeActions) {
      lines.push(`- ${action.command}`);
      lines.push(`  Reason: ${action.reason}`);
    }
  }

  lines.push(
    "",
    "Boundary:",
    "- This command is read-only.",
    "- JiSpec does not upload source code.",
    "- LLM output is not a blocking gate.",
    "- Local artifacts are written only when you run the recommended next command.",
  );

  return lines.join("\n");
}

function collectFirstRunState(root: string): FirstRunState {
  const sourceSignals = collectSourceSignals(root);
  return {
    projectScaffold: fs.existsSync(path.join(root, "jiproject", "project.yaml")),
    bootstrapEvidence: fs.existsSync(path.join(root, ".spec", "facts", "bootstrap", "evidence-graph.json")),
    openDraftSessionId: findOpenBootstrapDraftSessionId(root),
    adoptedContracts: hasFiles(path.join(root, ".spec", "contracts")),
    policy: fs.existsSync(path.join(root, ".spec", "policy.yaml")),
    verifyReport: readVerifyReport(root),
    activeChangeSession: readActiveChangeSession(root),
    greenfieldInputs: detectGreenfieldInputs(root),
    sourceSignals,
    emptyDirectory: isEffectivelyEmpty(root),
  };
}

function classifyState(state: FirstRunState): FirstRunClassification {
  if (state.activeChangeSession) {
    return "active_change_session";
  }
  if (state.openDraftSessionId) {
    return "open_bootstrap_draft";
  }
  if (state.bootstrapEvidence && !state.adoptedContracts) {
    return "needs_bootstrap_draft";
  }
  if (state.adoptedContracts && !state.policy) {
    return "needs_policy";
  }
  if (state.verifyReport?.ok === false) {
    return "verify_blocked";
  }
  if (state.projectScaffold && state.policy) {
    return "ready_to_verify";
  }
  if (state.emptyDirectory || state.greenfieldInputs.requirements) {
    return "greenfield_start";
  }
  return "legacy_takeover_start";
}

function chooseNextAction(rootArg: string, state: FirstRunState): FirstRunCommandRecommendation {
  const classification = classifyState(state);

  switch (classification) {
    case "active_change_session":
      return {
        command: `npm run jispec -- implement --root ${rootArg}`,
        reason: "An active change session exists; continue through implementation mediation or replay before starting a new takeover.",
        writesLocalArtifacts: true,
        writes: [".jispec/implement/", ".jispec/handoff/", ".jispec/change-sessions/"],
      };
    case "open_bootstrap_draft":
      return {
        command: `npm run jispec -- adopt --root ${rootArg} --session ${state.openDraftSessionId} --interactive`,
        reason: "A bootstrap draft is open; a human should accept, edit, defer, or reject the draft before verify becomes meaningful.",
        writesLocalArtifacts: true,
        writes: [".spec/contracts/", ".spec/spec-debt/", ".spec/handoffs/bootstrap-takeover.json", ".spec/handoffs/adopt-summary.md"],
      };
    case "needs_bootstrap_draft":
      return {
        command: `npm run jispec -- bootstrap draft --root ${rootArg}`,
        reason: "Bootstrap evidence already exists; draft the first candidate contract bundle for human review.",
        writesLocalArtifacts: true,
        writes: [".spec/sessions/<session>/manifest.json", ".spec/sessions/<session>/drafts/"],
      };
    case "needs_policy":
      return {
        command: `npm run jispec -- policy migrate --root ${rootArg}`,
        reason: "Adopted contracts exist but policy is missing; create the local policy gate before verify/CI.",
        writesLocalArtifacts: true,
        writes: [".spec/policy.yaml", ".spec/audit/events.jsonl"],
      };
    case "verify_blocked":
      return {
        command: `npm run jispec -- console dashboard --root ${rootArg}`,
        reason: `The latest verify report is ${state.verifyReport?.verdict ?? "blocking"}; inspect governance next actions before changing contracts or waivers.`,
        writesLocalArtifacts: false,
        writes: [],
      };
    case "ready_to_verify":
      return {
        command: `npm run jispec -- verify --root ${rootArg}`,
        reason: "Project scaffold and policy are present; run the deterministic local gate.",
        writesLocalArtifacts: true,
        writes: [".spec/handoffs/verify-summary.md"],
      };
    case "greenfield_start":
      return buildGreenfieldAction(rootArg, state);
    case "legacy_takeover_start":
      return {
        command: `npm run jispec -- bootstrap discover --root ${rootArg} --init-project`,
        reason: "This looks like an existing repository without bootstrap evidence; start with local evidence discovery.",
        writesLocalArtifacts: true,
        writes: ["jiproject/project.yaml", ".spec/facts/bootstrap/evidence-graph.json", ".spec/facts/bootstrap/bootstrap-summary.md"],
      };
  }
}

function buildAlternativeActions(rootArg: string, state: FirstRunState): FirstRunCommandRecommendation[] {
  const actions: FirstRunCommandRecommendation[] = [];

  if (state.verifyReport) {
    actions.push({
      command: `npm run jispec -- console actions --root ${rootArg}`,
      reason: "Generate read-only governance action suggestions from the latest local artifacts.",
      writesLocalArtifacts: false,
      writes: [],
    });
  }

  if (state.policy) {
    actions.push({
      command: `node --import tsx ./scripts/check-jispec.ts --root ${rootArg}`,
      reason: "Run the same local CI wrapper used by GitHub/GitLab templates.",
      writesLocalArtifacts: true,
      writes: [".jispec-ci/verify-report.json", ".jispec-ci/ci-summary.md", ".jispec-ci/verify-summary.md"],
    });
  }

  return actions;
}

function buildGreenfieldAction(rootArg: string, state: FirstRunState): FirstRunCommandRecommendation {
  const requirements = state.greenfieldInputs.requirements ?? "<requirements.md>";
  const technicalSolution = state.greenfieldInputs.technicalSolution ?? "<technical-solution.md>";
  return {
    command: `npm run jispec -- init --root ${rootArg} --requirements ${quoteCommandArg(requirements)} --technical-solution ${quoteCommandArg(technicalSolution)}`,
    reason: state.greenfieldInputs.requirements
      ? "Product input documents are present; initialize a Greenfield JiSpec project from them."
      : "The directory is empty; create requirements and technical-solution documents, then initialize a Greenfield JiSpec project.",
    writesLocalArtifacts: true,
    writes: ["docs/input/", "jiproject/", ".spec/greenfield/", ".spec/policy.yaml", ".github/workflows/jispec-verify.yml"],
  };
}

function summarizeState(state: FirstRunState): string {
  if (state.activeChangeSession) {
    return `Active change session ${state.activeChangeSession.id ?? "unknown"} is present.`;
  }
  if (state.openDraftSessionId) {
    return `Bootstrap draft session ${state.openDraftSessionId} is waiting for human adoption.`;
  }
  if (state.verifyReport?.ok === false) {
    return `Latest verify report is ${state.verifyReport.verdict ?? "blocking"}.`;
  }
  if (state.bootstrapEvidence && state.adoptedContracts && state.projectScaffold && state.policy) {
    return "Bootstrap takeover baseline is committed and the repo is ready to verify.";
  }
  if (state.bootstrapEvidence && state.adoptedContracts) {
    return "Bootstrap takeover baseline is committed.";
  }
  if (state.bootstrapEvidence) {
    return "Bootstrap evidence exists but contracts are not adopted yet.";
  }
  if (state.projectScaffold && state.policy) {
    return "Project scaffold and policy are present.";
  }
  if (state.emptyDirectory) {
    return "Directory has no project or source signals yet.";
  }
  if (state.sourceSignals.length > 0) {
    return `Existing repository signals detected: ${state.sourceSignals.join(", ")}.`;
  }
  return "No JiSpec state found yet.";
}

function findOpenBootstrapDraftSessionId(root: string): string | undefined {
  const sessionsRoot = path.join(root, ".spec", "sessions");
  if (!fs.existsSync(sessionsRoot)) {
    return undefined;
  }

  const candidates: Array<{ sessionId: string; updatedAt: string }> = [];
  for (const entry of fs.readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const manifestPath = path.join(sessionsRoot, entry.name, "manifest.json");
    const manifest = readJson<DraftManifestJson>(manifestPath);
    if (!manifest || (manifest.status !== "drafted" && manifest.status !== "adopting")) {
      continue;
    }
    candidates.push({
      sessionId: manifest.sessionId ?? entry.name,
      updatedAt: manifest.updatedAt ?? manifest.createdAt ?? "",
    });
  }

  candidates.sort((left, right) =>
    `${right.updatedAt}|${right.sessionId}`.localeCompare(`${left.updatedAt}|${left.sessionId}`),
  );
  return candidates[0]?.sessionId;
}

function readVerifyReport(root: string): FirstRunState["verifyReport"] {
  const reportPath = path.join(root, ".jispec-ci", "verify-report.json");
  const report = readJson<VerifyReportJson>(reportPath);
  if (!report) {
    return undefined;
  }
  return {
    path: ".jispec-ci/verify-report.json",
    verdict: report.verdict,
    ok: report.ok,
  };
}

function readActiveChangeSession(root: string): FirstRunState["activeChangeSession"] {
  const session = readJson<ChangeSessionJson>(path.join(root, ".jispec", "change-session.json"));
  if (!session) {
    return undefined;
  }
  return {
    id: session.id,
    summary: session.summary,
    mode: session.orchestrationMode,
  };
}

function detectGreenfieldInputs(root: string): FirstRunState["greenfieldInputs"] {
  const requirementsCandidates = [
    "requirements.md",
    "docs/requirements.md",
    "docs/input/requirements.md",
  ];
  const technicalSolutionCandidates = [
    "technical-solution.md",
    "docs/technical-solution.md",
    "docs/input/technical-solution.md",
  ];

  return {
    requirements: findFirstExistingRelativePath(root, requirementsCandidates),
    technicalSolution: findFirstExistingRelativePath(root, technicalSolutionCandidates),
  };
}

function collectSourceSignals(root: string): string[] {
  const candidates = [
    "package.json",
    "pyproject.toml",
    "go.mod",
    "Cargo.toml",
    "pom.xml",
    "src",
    "app",
    "lib",
    "tests",
    "schemas",
    "migrations",
  ];
  return candidates.filter((candidate) => fs.existsSync(path.join(root, candidate)));
}

function isEffectivelyEmpty(root: string): boolean {
  if (!fs.existsSync(root)) {
    return true;
  }
  const ignored = new Set([".git", ".DS_Store"]);
  return fs.readdirSync(root).filter((entry) => !ignored.has(entry)).length === 0;
}

function hasFiles(directory: string): boolean {
  if (!fs.existsSync(directory)) {
    return false;
  }
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.some((entry) => entry.isFile() || entry.isDirectory());
}

function findFirstExistingRelativePath(root: string, candidates: string[]): string | undefined {
  return candidates.find((candidate) => fs.existsSync(path.join(root, candidate)));
}

function readJson<T>(filePath: string): T | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return undefined;
  }
}

function formatRootArg(root: string): string {
  const relative = path.relative(process.cwd(), root);
  if (!relative) {
    return ".";
  }
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return quoteCommandArg(normalizePath(relative));
  }
  return quoteCommandArg(normalizePath(root));
}

function quoteCommandArg(value: string): string {
  if (/^[A-Za-z0-9_./:<>{}-]+$/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '\\"')}"`;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
