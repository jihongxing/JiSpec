import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import * as yaml from "js-yaml";
import { appendAuditEvent, inferAuditActor } from "../audit/event-ledger";
import {
  getContractRelativePath,
  loadDraftSession,
  saveDraftSessionManifest,
  type DraftArtifact,
  type DraftArtifactKind,
  type DraftSessionManifest,
} from "./draft";
import { normalizeEvidencePath } from "./evidence-graph";
import { createSpecDebtRecord, writeSpecDebtRecord } from "./spec-debt";
import {
  buildBootstrapTakeoverBrief,
  renderTakeoverBriefSummary,
  type BootstrapTakeoverBriefSummary,
} from "./takeover-brief";
import { buildBootstrapAdoptSummary } from "./adopt-summary";
import {
  getBootstrapAdoptSummaryPath,
  buildBootstrapTakeoverReport,
  getBootstrapTakeoverBriefPath,
  getBootstrapTakeoverBriefRelativePath,
  getBootstrapTakeoverReportPath,
  getBootstrapTakeoverReportRelativePath,
  type BootstrapBaselineHandoff,
} from "./takeover";
import type { ReplayMetadata } from "../replay/replay-metadata";
import type {
  ContractGraph,
  ContractGraphEdge,
  ContractGraphEdgeRelation,
  ContractGraphNode,
  ContractGraphNodeKind,
} from "../greenfield/contract-graph";

export type AdoptDecisionKind = "accept" | "reject" | "skip_as_spec_debt" | "edit";

export interface AdoptDecision {
  artifactKind: DraftArtifactKind;
  kind: AdoptDecisionKind;
  editedContent?: string;
  note?: string;
}

export interface BootstrapAdoptOptions {
  root: string;
  session?: string;
  interactive?: boolean;
  decisions?: AdoptDecision[];
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  testFailAfterOperation?: number;
  actor?: string;
  reason?: string;
}

export interface BootstrapAdoptResult {
  sessionId: string;
  manifestPath: string;
  status: DraftSessionManifest["status"];
  decisions: AdoptDecision[];
  writtenFiles: string[];
  adoptedArtifactPaths: string[];
  specDebtFiles: string[];
  rejectedArtifactKinds: DraftArtifactKind[];
  takeoverReportPath?: string;
  takeoverBriefPath?: string;
  adoptSummaryPath?: string;
  takeoverBriefSummary?: BootstrapTakeoverBriefSummary;
}

interface CommitOperation {
  label: "contracts" | "spec-debt" | "takeover-report" | "takeover-brief" | "adopt-summary" | "current-baseline" | "contract-graph";
  stagedPath: string;
  finalPath: string;
}

interface PreparedShadowBatch {
  shadowRoot: string;
  operations: CommitOperation[];
  stagedFiles: string[];
  adoptedArtifactPaths: string[];
  specDebtFiles: string[];
  takeoverReportPath?: string;
  takeoverBriefPath?: string;
  adoptSummaryPath?: string;
  takeoverBriefSummary?: BootstrapTakeoverBriefSummary;
  baselineHandoff?: BootstrapBaselineHandoff;
  takeoverReplay?: ReplayMetadata;
}

interface InteractiveQuestionSession {
  question(prompt: string): Promise<string>;
  close(): void;
}

export async function runBootstrapAdopt(options: BootstrapAdoptOptions): Promise<BootstrapAdoptResult> {
  const root = path.resolve(options.root);
  const session = loadDraftSession(root, options.session);
  const manifest = {
    ...session.manifest,
    status: "adopting" as const,
    updatedAt: new Date().toISOString(),
  };

  saveDraftSessionManifest(root, manifest);

  try {
    const decisions = options.decisions
      ? normalizeDecisions(session.artifacts, options.decisions)
      : options.interactive
        ? await collectInteractiveDecisions(
            session.artifacts,
            options.input ?? process.stdin,
            options.output ?? process.stdout,
          )
        : (() => {
            throw new Error("Bootstrap adopt currently requires either --interactive or explicit decisions.");
          })();

    const preparedBatch = prepareShadowBatch(root, session.manifest.sessionId, session.artifacts, decisions);
    const status =
      preparedBatch.adoptedArtifactPaths.length > 0 || preparedBatch.specDebtFiles.length > 0 ? "committed" : "abandoned";

    if (status === "committed") {
      stageBootstrapTakeoverReport(root, manifest, session.artifacts, decisions, preparedBatch, status, {
        actor: options.actor ?? inferAuditActor(),
        reason: options.reason,
      });
    }

    const writtenFiles =
      preparedBatch.operations.length > 0
        ? commitShadowBatch(preparedBatch, options.testFailAfterOperation)
        : [];

    const finalManifest: DraftSessionManifest = {
      ...manifest,
      status,
      updatedAt: new Date().toISOString(),
      adoptedArtifactPaths: preparedBatch.adoptedArtifactPaths,
      specDebtPaths: preparedBatch.specDebtFiles.map((filePath) => normalizeEvidencePath(path.relative(root, filePath))),
      takeoverReportPath: preparedBatch.takeoverReportPath,
      takeoverBriefPath: preparedBatch.takeoverBriefPath,
      adoptSummaryPath: preparedBatch.adoptSummaryPath,
      replay: preparedBatch.takeoverReplay,
      baselineHandoff: preparedBatch.baselineHandoff,
      decisionLog: decisions.map((decision) => ({
        artifactKind: decision.artifactKind,
        decision: decision.kind,
        note: decision.note,
        edited: decision.kind === "edit",
        targetPath: targetPathForAdoptDecision(session.manifest.sessionId, decision),
        sourceFiles: session.artifacts.find((artifact) => artifact.kind === decision.artifactKind)?.sourceFiles,
        confidenceScore: session.artifacts.find((artifact) => artifact.kind === decision.artifactKind)?.confidenceScore,
        provenanceNote: session.artifacts.find((artifact) => artifact.kind === decision.artifactKind)?.provenanceNote,
      })),
    };

    const manifestPath = saveDraftSessionManifest(root, finalManifest);
    recordBootstrapAdoptAuditEvents(root, manifestPath, session.manifest.sessionId, session.artifacts, decisions, {
      actor: options.actor,
      reason: options.reason,
    });

    return {
      sessionId: session.manifest.sessionId,
      manifestPath,
      status,
      decisions,
      writtenFiles: writtenFiles.sort((left, right) => left.localeCompare(right)),
      adoptedArtifactPaths: [...preparedBatch.adoptedArtifactPaths].sort((left, right) => left.localeCompare(right)),
      specDebtFiles: preparedBatch.specDebtFiles
        .map((filePath) => normalizeEvidencePath(path.relative(root, filePath)))
        .sort((left, right) => left.localeCompare(right)),
      rejectedArtifactKinds: decisions
        .filter((decision) => decision.kind === "reject")
        .map((decision) => decision.artifactKind)
        .sort((left, right) => left.localeCompare(right)),
      takeoverReportPath: preparedBatch.takeoverReportPath,
      takeoverBriefPath: preparedBatch.takeoverBriefPath,
      adoptSummaryPath: preparedBatch.adoptSummaryPath,
      takeoverBriefSummary: preparedBatch.takeoverBriefSummary,
    };
  } catch (error) {
    const abandonedManifest: DraftSessionManifest = {
      ...manifest,
      status: "abandoned",
      updatedAt: new Date().toISOString(),
    };
    saveDraftSessionManifest(root, abandonedManifest);
    throw error;
  }
}

export function renderBootstrapAdoptText(result: BootstrapAdoptResult): string {
  const lines = [
    `Bootstrap adopt finished for session \`${result.sessionId}\`.`,
    `Status: ${result.status}`,
    `Decisions applied: ${result.decisions.length}`,
  ];

  if (result.adoptedArtifactPaths.length > 0) {
    lines.push("Adopted assets:");
    lines.push(...result.adoptedArtifactPaths.map((filePath) => `- ${filePath}`));
  }

  if (result.specDebtFiles.length > 0) {
    lines.push("Spec debt records:");
    lines.push(...result.specDebtFiles.map((filePath) => `- ${filePath}`));
  }

  if (result.rejectedArtifactKinds.length > 0) {
    lines.push("Rejected artifacts:");
    lines.push(...result.rejectedArtifactKinds.map((artifactKind) => `- \`${artifactKind}\` -> rejected:${artifactKind}`));
  }

  if (result.takeoverReportPath) {
    lines.push(`Takeover report: ${result.takeoverReportPath}`);
  }

  if (result.takeoverBriefPath) {
    lines.push(`Takeover brief: ${result.takeoverBriefPath}`);
    if (result.takeoverBriefSummary) {
      lines.push("Brief summary:");
      lines.push(...renderTakeoverBriefSummary(result.takeoverBriefSummary).map((entry) => `- ${entry}`));
    }
  }

  if (result.adoptSummaryPath) {
    lines.push(`Adopt summary: ${result.adoptSummaryPath}`);
  }

  lines.push("Next command: npm run jispec-cli -- verify");

  if (result.writtenFiles.length > 0) {
    lines.push("Written files:");
    lines.push(...result.writtenFiles.map((filePath) => `- ${filePath}`));
  } else {
    lines.push("Written files: none");
  }

  return lines.join("\n");
}

function recordBootstrapAdoptAuditEvents(
  root: string,
  manifestPath: string,
  sessionId: string,
  artifacts: DraftArtifact[],
  decisions: AdoptDecision[],
  options: { actor?: string; reason?: string },
): void {
  const actor = options.actor ?? inferAuditActor();
  for (const decision of decisions) {
    const artifact = artifacts.find((entry) => entry.kind === decision.artifactKind);
    appendAuditEvent(root, {
      type: auditEventTypeForAdoptDecision(decision.kind),
      actor,
      reason: decision.note ?? options.reason ?? `Bootstrap adopt ${decision.kind} for ${decision.artifactKind}.`,
      sourceArtifact: {
        kind: "bootstrap-draft-manifest",
        path: manifestPath,
      },
      affectedContracts: [
        targetPathForAdoptDecision(sessionId, decision),
        ...(artifact?.sourceFiles ?? []),
      ],
      details: {
        sessionId,
        artifactKind: decision.artifactKind,
        decision: decision.kind,
        edited: decision.kind === "edit",
        sourceFiles: artifact?.sourceFiles ?? [],
        confidenceScore: artifact?.confidenceScore,
        provenanceNote: artifact?.provenanceNote,
      },
    });
  }
}

function auditEventTypeForAdoptDecision(kind: AdoptDecisionKind): "adopt_accept" | "adopt_edit" | "adopt_reject" | "adopt_defer" {
  if (kind === "accept") {
    return "adopt_accept";
  }
  if (kind === "edit") {
    return "adopt_edit";
  }
  if (kind === "skip_as_spec_debt") {
    return "adopt_defer";
  }
  return "adopt_reject";
}

function targetPathForAdoptDecision(sessionId: string, decision: AdoptDecision): string {
  if (decision.kind === "accept" || decision.kind === "edit") {
    return getContractRelativePath(decision.artifactKind);
  }
  if (decision.kind === "skip_as_spec_debt") {
    return `.spec/spec-debt/${sessionId}/${decision.artifactKind}.json`;
  }
  return `rejected:${decision.artifactKind}`;
}

function normalizeDecisions(artifacts: DraftArtifact[], decisions: AdoptDecision[]): AdoptDecision[] {
  const decisionMap = new Map(decisions.map((decision) => [decision.artifactKind, decision]));
  return artifacts.map((artifact) => {
    const explicit = decisionMap.get(artifact.kind);
    if (explicit) {
      return explicit;
    }

    return {
      artifactKind: artifact.kind,
      kind: "reject",
    } satisfies AdoptDecision;
  });
}

async function collectInteractiveDecisions(
  artifacts: DraftArtifact[],
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<AdoptDecision[]> {
  const promptSession = await createInteractiveQuestionSession(input, output);
  const decisions: AdoptDecision[] = [];

  try {
    for (const artifact of artifacts) {
      output.write(`\n=== ${artifact.kind} (${artifact.relativePath}) ===\n`);
      output.write(`${renderArtifactPreview(artifact.content)}\n`);

      const kind = await promptForDecision(promptSession, artifact.kind);
      if (kind === "edit") {
        output.write("Enter replacement content. Finish with a single line containing only EOF.\n");
        const editedContent = await readMultilineInput(promptSession);
        const note = await promptSession.question("Optional edit note (press Enter to skip): ");
        decisions.push({
          artifactKind: artifact.kind,
          kind,
          editedContent,
          note: note.trim() || undefined,
        });
        continue;
      }

      const notePrompt = kind === "skip_as_spec_debt" ? "Optional spec debt note (press Enter to skip): " : "Optional note (press Enter to skip): ";
      const note = await promptSession.question(notePrompt);
      decisions.push({
        artifactKind: artifact.kind,
        kind,
        note: note.trim() || undefined,
      });
    }
  } finally {
    promptSession.close();
  }

  return decisions;
}

async function createInteractiveQuestionSession(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<InteractiveQuestionSession> {
  const interactiveInput = input as NodeJS.ReadableStream & { isTTY?: boolean };
  const interactiveOutput = output as NodeJS.WritableStream & { isTTY?: boolean };
  const isTerminal = interactiveInput.isTTY === true && interactiveOutput.isTTY === true;

  if (isTerminal) {
    const readline = createInterface({ input, output, terminal: true });
    return {
      question(prompt: string): Promise<string> {
        return readline.question(prompt);
      },
      close(): void {
        readline.close();
      },
    };
  }

  const bufferedLines = await readBufferedInteractiveLines(input);
  let lineIndex = 0;

  return {
    async question(prompt: string): Promise<string> {
      output.write(prompt);
      if (lineIndex >= bufferedLines.length) {
        throw new Error("Interactive adopt input ended before all draft decisions were collected.");
      }

      const answer = bufferedLines[lineIndex];
      lineIndex += 1;
      return answer;
    },
    close(): void {
      return;
    },
  };
}

async function promptForDecision(
  promptSession: InteractiveQuestionSession,
  artifactKind: DraftArtifactKind,
): Promise<AdoptDecisionKind> {
  while (true) {
    const answer = await promptSession.question(
      `Decision for ${artifactKind} [accept/reject/skip_as_spec_debt/edit] (default accept): `,
    );
    const normalized = answer.trim();
    if (normalized === "") {
      return "accept";
    }

    if (
      normalized === "accept" ||
      normalized === "reject" ||
      normalized === "skip_as_spec_debt" ||
      normalized === "edit"
    ) {
      return normalized;
    }
  }
}

async function readBufferedInteractiveLines(input: NodeJS.ReadableStream): Promise<string[]> {
  const chunks: string[] = [];

  for await (const chunk of input) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf-8"));
  }

  const raw = chunks.join("");
  if (raw.length === 0) {
    return [];
  }

  return raw.split(/\r?\n/);
}

async function readMultilineInput(promptSession: InteractiveQuestionSession): Promise<string> {
  const lines: string[] = [];

  while (true) {
    const line = await promptSession.question("");
    if (line === "EOF") {
      break;
    }
    lines.push(line);
  }

  return lines.join("\n").trimEnd();
}

function renderArtifactPreview(content: string): string {
  const lines = content.split(/\r?\n/).slice(0, 16);
  return lines.join("\n");
}

function prepareShadowBatch(
  root: string,
  sessionId: string,
  artifacts: DraftArtifact[],
  decisions: AdoptDecision[],
): PreparedShadowBatch {
  const sessionDir = path.join(root, ".spec", "sessions", sessionId);
  const shadowRoot = path.join(sessionDir, "shadow");
  fs.rmSync(shadowRoot, { recursive: true, force: true });
  fs.mkdirSync(shadowRoot, { recursive: true });

  const adoptedArtifacts: DraftArtifact[] = [];
  const specDebtFiles: string[] = [];
  const stagedFiles: string[] = [];

  const contractsStagingPath = path.join(shadowRoot, "contracts");
  const liveContractsPath = path.join(root, ".spec", "contracts");
  if (fs.existsSync(liveContractsPath)) {
    fs.cpSync(liveContractsPath, contractsStagingPath, { recursive: true });
  } else {
    fs.mkdirSync(contractsStagingPath, { recursive: true });
  }

  for (const artifact of artifacts) {
    const decision = decisions.find((candidate) => candidate.artifactKind === artifact.kind);
    if (!decision) {
      continue;
    }

    if (decision.kind === "accept" || decision.kind === "edit") {
      const stagedPath = path.join(contractsStagingPath, path.basename(getContractRelativePath(artifact.kind)));
      const content = decision.kind === "edit" && typeof decision.editedContent === "string"
        ? decision.editedContent
        : artifact.content;
      fs.mkdirSync(path.dirname(stagedPath), { recursive: true });
      fs.writeFileSync(stagedPath, content.endsWith("\n") ? content : `${content}\n`, "utf-8");
      stagedFiles.push(normalizeEvidencePath(stagedPath));
      adoptedArtifacts.push({
        ...artifact,
        content,
      });
      continue;
    }

    if (decision.kind === "skip_as_spec_debt") {
      const stagedDebtDirectory = path.join(shadowRoot, "spec-debt", sessionId);
      const record = createSpecDebtRecord(sessionId, artifact, decision.note);
      const recordPath = writeSpecDebtRecord(stagedDebtDirectory, record);
      const finalDebtPath = path.join(root, ".spec", "spec-debt", sessionId, `${artifact.kind}.json`);
      stagedFiles.push(recordPath);
      specDebtFiles.push(normalizeEvidencePath(finalDebtPath));
    }
  }

  const operations: CommitOperation[] = [];

  if (adoptedArtifacts.length > 0) {
    operations.push({
      label: "contracts",
      stagedPath: contractsStagingPath,
      finalPath: liveContractsPath,
    });
  } else {
    fs.rmSync(contractsStagingPath, { recursive: true, force: true });
  }

  if (specDebtFiles.length > 0) {
    operations.push({
      label: "spec-debt",
      stagedPath: path.join(shadowRoot, "spec-debt", sessionId),
      finalPath: path.join(root, ".spec", "spec-debt", sessionId),
    });
  }

  return {
    shadowRoot,
    operations,
    stagedFiles,
    adoptedArtifactPaths: adoptedArtifacts
      .map((artifact) => normalizeEvidencePath(getContractRelativePath(artifact.kind)))
      .sort((left, right) => left.localeCompare(right)),
    specDebtFiles,
  };
}

function stageBootstrapTakeoverReport(
  root: string,
  manifest: DraftSessionManifest,
  artifacts: DraftArtifact[],
  decisions: AdoptDecision[],
  batch: PreparedShadowBatch,
  status: DraftSessionManifest["status"],
  replayContext: { actor?: string; reason?: string },
): void {
  const report = buildBootstrapTakeoverReport({
    root,
    manifest,
    artifacts,
    decisions,
    status,
    adoptedArtifactPaths: batch.adoptedArtifactPaths,
    specDebtPaths: batch.specDebtFiles.map((filePath) => normalizeEvidencePath(path.relative(root, filePath))),
    rejectedArtifactKinds: decisions
      .filter((decision) => decision.kind === "reject")
      .map((decision) => decision.artifactKind),
    actor: replayContext.actor,
    reason: replayContext.reason,
  });
  const stagedPath = path.join(batch.shadowRoot, "handoffs", "bootstrap-takeover.json");
  fs.mkdirSync(path.dirname(stagedPath), { recursive: true });
  fs.writeFileSync(stagedPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  batch.operations.push({
    label: "takeover-report",
    stagedPath,
    finalPath: getBootstrapTakeoverReportPath(root),
  });
  batch.stagedFiles.push(normalizeEvidencePath(stagedPath));
  batch.takeoverReportPath = getBootstrapTakeoverReportRelativePath();
  batch.baselineHandoff = report.baselineHandoff;
  batch.takeoverReplay = report.replay;
  stageBootstrapMainlineBaseline(root, manifest, report, batch);

  const adoptSummary = buildBootstrapAdoptSummary(report);
  const stagedAdoptSummaryPath = path.join(batch.shadowRoot, "handoffs", path.basename(adoptSummary.relativePath));
  fs.mkdirSync(path.dirname(stagedAdoptSummaryPath), { recursive: true });
  fs.writeFileSync(stagedAdoptSummaryPath, adoptSummary.content, "utf-8");
  batch.operations.push({
    label: "adopt-summary",
    stagedPath: stagedAdoptSummaryPath,
    finalPath: getBootstrapAdoptSummaryPath(root),
  });
  batch.stagedFiles.push(normalizeEvidencePath(stagedAdoptSummaryPath));
  batch.adoptSummaryPath = adoptSummary.relativePath;

  const brief = buildBootstrapTakeoverBrief({
    root,
    report,
    artifacts,
    decisions,
  });
  const stagedBriefPath = path.join(batch.shadowRoot, "handoffs", path.basename(getBootstrapTakeoverBriefRelativePath()));
  fs.mkdirSync(path.dirname(stagedBriefPath), { recursive: true });
  fs.writeFileSync(stagedBriefPath, brief.content, "utf-8");
  batch.operations.push({
    label: "takeover-brief",
    stagedPath: stagedBriefPath,
    finalPath: getBootstrapTakeoverBriefPath(root),
  });
  batch.stagedFiles.push(normalizeEvidencePath(stagedBriefPath));
  batch.takeoverBriefPath = brief.relativePath;
  batch.takeoverBriefSummary = brief.summary;
}

function stageBootstrapMainlineBaseline(
  root: string,
  manifest: DraftSessionManifest,
  report: ReturnType<typeof buildBootstrapTakeoverReport>,
  batch: PreparedShadowBatch,
): void {
  const baselinePath = path.join(batch.shadowRoot, "baselines", "current.yaml");
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(
    baselinePath,
    yaml.dump(buildLegacyCurrentBaseline(root, manifest, report), { lineWidth: 100, noRefs: true, sortKeys: false }),
    "utf-8",
  );
  batch.operations.push({
    label: "current-baseline",
    stagedPath: baselinePath,
    finalPath: path.join(root, ".spec", "baselines", "current.yaml"),
  });
  batch.stagedFiles.push(normalizeEvidencePath(baselinePath));

  const graphPath = path.join(batch.shadowRoot, "evidence", "contract-graph.json");
  fs.mkdirSync(path.dirname(graphPath), { recursive: true });
  fs.writeFileSync(graphPath, `${JSON.stringify(buildLegacyContractGraph(report), null, 2)}\n`, "utf-8");
  batch.operations.push({
    label: "contract-graph",
    stagedPath: graphPath,
    finalPath: path.join(root, ".spec", "evidence", "contract-graph.json"),
  });
  batch.stagedFiles.push(normalizeEvidencePath(graphPath));
}

function buildLegacyCurrentBaseline(
  root: string,
  manifest: DraftSessionManifest,
  report: ReturnType<typeof buildBootstrapTakeoverReport>,
): Record<string, unknown> {
  const project = readProjectIdentity(root);
  const contracts = [...report.adoptedArtifactPaths].sort((left, right) => left.localeCompare(right));
  return {
    baseline_id: `${manifest.sessionId}-legacy-current`,
    project_id: project.id,
    project_name: project.name,
    entry_model: "legacy_takeover",
    status: "adopted",
    source_takeover: {
      path: ".spec/handoffs/bootstrap-takeover.json",
      session_id: manifest.sessionId,
      evidence_graph_path: manifest.sourceEvidenceGraphPath,
      generation_mode: manifest.generationMode,
    },
    requirement_ids: [],
    contexts: contracts.filter((entry) => entry.endsWith("domain.yaml")),
    contracts,
    scenarios: contracts.filter((entry) => entry.endsWith("behaviors.feature")),
    slices: [],
    bootstrap_takeover: {
      adopted_contract_paths: contracts,
      deferred_spec_debt_paths: report.specDebtPaths,
      rejected_artifact_kinds: report.rejectedArtifactKinds,
    },
    change_mainline_handoff: {
      path: ".spec/handoffs/bootstrap-takeover.json",
      summary_path: ".spec/handoffs/adopt-summary.md",
      status: "ready",
      change_summary: "Continue from adopted legacy takeover baseline.",
      next_commands: [
        "npm run jispec-cli -- change <summary> --mode execute",
        "npm run jispec-cli -- verify",
        "npm run ci:verify",
      ],
    },
    verify_policy: {
      path: ".spec/policy.yaml",
      status: "run policy migrate if missing",
    },
    ci_gate: {
      provider: "local",
      local_command: "npm run ci:verify",
    },
    assets: stableUnique([
      "jiproject/project.yaml",
      ".spec/baselines/current.yaml",
      ".spec/evidence/contract-graph.json",
      ".spec/handoffs/bootstrap-takeover.json",
      ".spec/handoffs/takeover-brief.md",
      ".spec/handoffs/adopt-summary.md",
      ...contracts,
      ...report.specDebtPaths,
    ]),
  };
}

function buildLegacyContractGraph(report: ReturnType<typeof buildBootstrapTakeoverReport>): ContractGraph {
  const baselineNode: ContractGraphNode = {
    id: "@baseline:legacy-takeover",
    kind: "baseline",
    label: "Legacy takeover baseline",
    path: ".spec/baselines/current.yaml",
    source_id: report.sessionId,
  };
  const contractNodes: ContractGraphNode[] = report.adoptedArtifactPaths.map((contractPath) => ({
    id: contractNodeId(contractPath),
    kind: contractNodeKind(contractPath),
    label: contractPath,
    path: contractPath,
    source_id: contractPath,
  }));
  const debtNodes: ContractGraphNode[] = report.specDebtPaths.map((debtPath) => ({
    id: specDebtNodeId(debtPath),
    kind: "spec_debt",
    label: debtPath,
    path: debtPath,
    source_id: debtPath,
  }));
  const edges: ContractGraphEdge[] = [
    ...contractNodes.map((node) => ({
      from: baselineNode.id,
      to: node.id,
      relation: "defines" as const,
      source: "review_record" as const,
      reason: "Legacy takeover adopted this contract into the current baseline.",
    })),
    ...debtNodes.map((node) => ({
      from: baselineNode.id,
      to: node.id,
      relation: "deferred_by" as const,
      source: "spec_debt" as const,
      reason: "Legacy takeover deferred this artifact as spec debt.",
    })),
  ];
  const nodes = stableGraphNodes([baselineNode, ...contractNodes, ...debtNodes]);
  const stableEdges = stableGraphEdges(edges);

  return {
    schema_version: 1,
    graph_kind: "deterministic-contract-graph",
    generated_at: report.updatedAt,
    nodes,
    edges: stableEdges,
    summary: summarizeLegacyContractGraph(nodes, stableEdges),
    warnings: report.rejectedArtifactKinds.map((kind) => `Rejected bootstrap artifact was not included in current baseline: ${kind}.`),
  };
}

function commitShadowBatch(batch: PreparedShadowBatch, testFailAfterOperation?: number): string[] {
  const backupRoot = path.join(batch.shadowRoot, "backups");
  fs.mkdirSync(backupRoot, { recursive: true });

  const committedBackups: Array<{ finalPath: string; backupPath?: string }> = [];
  const writtenFiles = new Set<string>();
  let operationCount = 0;

  try {
    for (const operation of batch.operations) {
      fs.mkdirSync(path.dirname(operation.finalPath), { recursive: true });
      const backupPath = fs.existsSync(operation.finalPath)
        ? path.join(backupRoot, `${operation.label}-backup-${operationCount}`)
        : undefined;

      try {
        if (backupPath) {
          fs.renameSync(operation.finalPath, backupPath);
        }

        fs.renameSync(operation.stagedPath, operation.finalPath);
      } catch (error) {
        if (fs.existsSync(operation.finalPath)) {
          fs.rmSync(operation.finalPath, { recursive: true, force: true });
        }
        if (backupPath && fs.existsSync(backupPath)) {
          fs.renameSync(backupPath, operation.finalPath);
        }
        throw error;
      }

      committedBackups.push({ finalPath: operation.finalPath, backupPath });
      operationCount += 1;

      for (const filePath of listFilesRecursive(operation.finalPath)) {
        writtenFiles.add(normalizeEvidencePath(filePath));
      }

      if (typeof testFailAfterOperation === "number" && operationCount >= testFailAfterOperation) {
        throw new Error("Injected adopt commit failure");
      }
    }

    fs.rmSync(backupRoot, { recursive: true, force: true });
    return [...writtenFiles].sort((left, right) => left.localeCompare(right));
  } catch (error) {
    for (const committed of [...committedBackups].reverse()) {
      if (fs.existsSync(committed.finalPath)) {
        fs.rmSync(committed.finalPath, { recursive: true, force: true });
      }
      if (committed.backupPath && fs.existsSync(committed.backupPath)) {
        fs.renameSync(committed.backupPath, committed.finalPath);
      }
    }

    throw error;
  }
}

function listFilesRecursive(targetPath: string): string[] {
  if (!fs.existsSync(targetPath)) {
    return [];
  }

  const stats = fs.statSync(targetPath);
  if (stats.isFile()) {
    return [targetPath];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function readProjectIdentity(root: string): { id: string; name: string } {
  const projectPath = path.join(root, "jiproject", "project.yaml");
  if (fs.existsSync(projectPath)) {
    const parsed = yaml.load(fs.readFileSync(projectPath, "utf-8"));
    if (isRecord(parsed)) {
      const id = stringValue(parsed.id);
      const name = stringValue(parsed.name);
      if (id || name) {
        return {
          id: id ?? slugify(name ?? "legacy-takeover"),
          name: name ?? id ?? "Legacy Takeover",
        };
      }
    }
  }

  const packagePath = path.join(root, "package.json");
  if (fs.existsSync(packagePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
      const name = isRecord(parsed) ? stringValue(parsed.name) : undefined;
      if (name) {
        return { id: slugify(name), name };
      }
    } catch {
      // Fall through to the default identity.
    }
  }

  return { id: "legacy-takeover", name: "Legacy Takeover" };
}

function contractNodeId(contractPath: string): string {
  return `@contract:${contractPath}`;
}

function specDebtNodeId(debtPath: string): string {
  return `@spec-debt:${debtPath}`;
}

function contractNodeKind(contractPath: string): ContractGraphNodeKind {
  if (contractPath.endsWith("domain.yaml")) {
    return "bounded_context";
  }
  if (contractPath.endsWith("behaviors.feature")) {
    return "bdd_scenario";
  }
  return "api_contract";
}

function summarizeLegacyContractGraph(nodes: ContractGraphNode[], edges: ContractGraphEdge[]): ContractGraph["summary"] {
  const nodeCounts = emptyNodeCounts();
  const edgeCounts = emptyEdgeCounts();
  for (const node of nodes) {
    nodeCounts[node.kind]++;
  }
  for (const edge of edges) {
    edgeCounts[edge.relation]++;
  }
  return {
    node_counts: nodeCounts,
    edge_counts: edgeCounts,
  };
}

function emptyNodeCounts(): Record<ContractGraphNodeKind, number> {
  return {
    requirement: 0,
    bounded_context: 0,
    domain_entity: 0,
    domain_event: 0,
    invariant: 0,
    api_contract: 0,
    bdd_scenario: 0,
    slice: 0,
    test: 0,
    code_fact: 0,
    migration: 0,
    review_decision: 0,
    spec_debt: 0,
    baseline: 0,
    delta: 0,
  };
}

function emptyEdgeCounts(): Record<ContractGraphEdgeRelation, number> {
  return {
    defines: 0,
    owns: 0,
    depends_on: 0,
    verifies: 0,
    covered_by: 0,
    implements: 0,
    consumes: 0,
    emits: 0,
    blocked_by: 0,
    supersedes: 0,
    deferred_by: 0,
    waived_by: 0,
    derived_from: 0,
  };
}

function stableGraphNodes(nodes: ContractGraphNode[]): ContractGraphNode[] {
  return [...nodes].sort((left, right) => left.id.localeCompare(right.id));
}

function stableGraphEdges(edges: ContractGraphEdge[]): ContractGraphEdge[] {
  return [...edges].sort((left, right) => `${left.from}|${left.relation}|${left.to}`.localeCompare(`${right.from}|${right.relation}|${right.to}`));
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "legacy-takeover";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
