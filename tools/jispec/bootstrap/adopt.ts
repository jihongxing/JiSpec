import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
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
  label: "contracts" | "spec-debt" | "takeover-report" | "takeover-brief" | "adopt-summary";
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
      stageBootstrapTakeoverReport(root, manifest, session.artifacts, decisions, preparedBatch, status);
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
      baselineHandoff: preparedBatch.baselineHandoff,
      decisionLog: decisions.map((decision) => ({
        artifactKind: decision.artifactKind,
        decision: decision.kind,
        note: decision.note,
        edited: decision.kind === "edit",
        targetPath:
          decision.kind === "accept" || decision.kind === "edit"
            ? getContractRelativePath(decision.artifactKind)
            : decision.kind === "skip_as_spec_debt"
              ? `.spec/spec-debt/${session.manifest.sessionId}/${decision.artifactKind}.json`
              : undefined,
        sourceFiles: session.artifacts.find((artifact) => artifact.kind === decision.artifactKind)?.sourceFiles,
        confidenceScore: session.artifacts.find((artifact) => artifact.kind === decision.artifactKind)?.confidenceScore,
        provenanceNote: session.artifacts.find((artifact) => artifact.kind === decision.artifactKind)?.provenanceNote,
      })),
    };

    const manifestPath = saveDraftSessionManifest(root, finalManifest);

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
    lines.push(`Rejected artifacts: ${result.rejectedArtifactKinds.join(", ")}`);
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

  if (result.writtenFiles.length > 0) {
    lines.push("Written files:");
    lines.push(...result.writtenFiles.map((filePath) => `- ${filePath}`));
  } else {
    lines.push("Written files: none");
  }

  return lines.join("\n");
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
