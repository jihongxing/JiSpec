import fs from "node:fs";
import path from "node:path";
import {
  getContractRelativePath,
  type DraftArtifact,
  type DraftArtifactKind,
  type DraftQualitySummary,
  type DraftSessionManifest,
} from "./draft";
import { normalizeEvidencePath } from "./evidence-graph";
import { normalizeReplayPaths, type ReplayMetadata } from "../replay/replay-metadata";

const BOOTSTRAP_TAKEOVER_REPORT_PATH = ".spec/handoffs/bootstrap-takeover.json";
const BOOTSTRAP_TAKEOVER_BRIEF_PATH = ".spec/handoffs/takeover-brief.md";
const BOOTSTRAP_ADOPT_SUMMARY_PATH = ".spec/handoffs/adopt-summary.md";

export interface BootstrapTakeoverDecisionRecord {
  artifactKind: DraftArtifactKind;
  finalState: "adopted" | "spec_debt" | "rejected";
  targetPath?: string;
  note?: string;
  edited: boolean;
  sourceFiles: string[];
  confidenceScore: number;
  provenanceNote: string;
}

export interface BootstrapBaselineHandoff {
  expectedContractPaths: string[];
  deferredSpecDebtPaths: string[];
  rejectedArtifactKinds: DraftArtifactKind[];
}

export interface BootstrapTakeoverReport {
  version: 1;
  createdAt: string;
  updatedAt: string;
  repoRoot: string;
  sessionId: string;
  status: DraftSessionManifest["status"];
  manifestPath: string;
  sourceEvidenceGraphPath: string;
  sourceEvidenceGeneratedAt?: string;
  providerName?: string;
  generationMode?: "deterministic" | "provider" | "provider-fallback";
  qualitySummary?: DraftQualitySummary;
  adoptedArtifactPaths: string[];
  specDebtPaths: string[];
  rejectedArtifactKinds: DraftArtifactKind[];
  decisions: BootstrapTakeoverDecisionRecord[];
  baselineHandoff: BootstrapBaselineHandoff;
  replay?: ReplayMetadata;
}

export interface BootstrapTakeoverReportInput {
  root: string;
  manifest: DraftSessionManifest;
  artifacts: DraftArtifact[];
  decisions: Array<{
    artifactKind: DraftArtifactKind;
    kind: "accept" | "reject" | "skip_as_spec_debt" | "edit";
    note?: string;
    editedContent?: string;
  }>;
  status: DraftSessionManifest["status"];
  adoptedArtifactPaths: string[];
  specDebtPaths: string[];
  rejectedArtifactKinds: DraftArtifactKind[];
  actor?: string;
  reason?: string;
}

export function getBootstrapTakeoverReportPath(rootInput: string): string {
  return path.join(path.resolve(rootInput), BOOTSTRAP_TAKEOVER_REPORT_PATH);
}

export function getBootstrapTakeoverReportRelativePath(): string {
  return BOOTSTRAP_TAKEOVER_REPORT_PATH;
}

export function getBootstrapTakeoverBriefPath(rootInput: string): string {
  return path.join(path.resolve(rootInput), BOOTSTRAP_TAKEOVER_BRIEF_PATH);
}

export function getBootstrapTakeoverBriefRelativePath(): string {
  return BOOTSTRAP_TAKEOVER_BRIEF_PATH;
}

export function getBootstrapAdoptSummaryPath(rootInput: string): string {
  return path.join(path.resolve(rootInput), BOOTSTRAP_ADOPT_SUMMARY_PATH);
}

export function getBootstrapAdoptSummaryRelativePath(): string {
  return BOOTSTRAP_ADOPT_SUMMARY_PATH;
}

export function buildBootstrapTakeoverReport(input: BootstrapTakeoverReportInput): BootstrapTakeoverReport {
  const root = path.resolve(input.root);
  const artifactByKind = new Map(input.artifacts.map((artifact) => [artifact.kind, artifact]));
  const decisions: BootstrapTakeoverDecisionRecord[] = [];
  for (const decision of input.decisions) {
    const artifact = artifactByKind.get(decision.artifactKind);
    if (!artifact) {
      continue;
    }

    const record: BootstrapTakeoverDecisionRecord = {
      artifactKind: decision.artifactKind,
      finalState:
        decision.kind === "accept" || decision.kind === "edit"
          ? "adopted"
          : decision.kind === "skip_as_spec_debt"
            ? "spec_debt"
            : "rejected",
      note: decision.note,
      edited: decision.kind === "edit",
      sourceFiles: [...artifact.sourceFiles].sort((left, right) => left.localeCompare(right)),
      confidenceScore: artifact.confidenceScore,
      provenanceNote: artifact.provenanceNote,
    };
    if (decision.kind === "accept" || decision.kind === "edit") {
      record.targetPath = getContractRelativePath(decision.artifactKind);
    } else if (decision.kind === "skip_as_spec_debt") {
      record.targetPath = normalizeEvidencePath(`.spec/spec-debt/${input.manifest.sessionId}/${decision.artifactKind}.json`);
    }

    decisions.push(record);
  }
  decisions.sort((left, right) => left.artifactKind.localeCompare(right.artifactKind));

  const timestamp = new Date().toISOString();
  const adoptedArtifactPaths = [...input.adoptedArtifactPaths].sort((left, right) => left.localeCompare(right));
  const specDebtPaths = [...input.specDebtPaths].sort((left, right) => left.localeCompare(right));
  const rejectedArtifactKinds = [...input.rejectedArtifactKinds].sort((left, right) => left.localeCompare(right));

  return {
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    repoRoot: normalizeEvidencePath(root),
    sessionId: input.manifest.sessionId,
    status: input.status,
    manifestPath: normalizeEvidencePath(path.join(".spec", "sessions", input.manifest.sessionId, "manifest.json")),
    sourceEvidenceGraphPath: input.manifest.sourceEvidenceGraphPath,
    sourceEvidenceGeneratedAt: input.manifest.sourceEvidenceGeneratedAt,
    providerName: input.manifest.providerName,
    generationMode: input.manifest.generationMode,
    qualitySummary: input.manifest.qualitySummary,
    adoptedArtifactPaths,
    specDebtPaths,
    rejectedArtifactKinds,
    decisions,
    baselineHandoff: {
      expectedContractPaths: adoptedArtifactPaths,
      deferredSpecDebtPaths: specDebtPaths,
      rejectedArtifactKinds,
    },
    replay: buildBootstrapTakeoverReplay({
      root,
      manifest: input.manifest,
      artifacts: input.artifacts,
      status: input.status,
      actor: input.actor,
      reason: input.reason,
    }),
  };
}

function buildBootstrapTakeoverReplay(input: {
  root: string;
  manifest: DraftSessionManifest;
  artifacts: DraftArtifact[];
  status: DraftSessionManifest["status"];
  actor?: string;
  reason?: string;
}): ReplayMetadata {
  const manifestPath = normalizeEvidencePath(path.join(".spec", "sessions", input.manifest.sessionId, "manifest.json"));
  const commandParts = [
    "npm run jispec-cli -- adopt",
    `--session ${input.manifest.sessionId}`,
    "--interactive",
  ];
  if (input.actor) {
    commandParts.push(`--actor ${quoteShellValue(input.actor)}`);
  }
  if (input.reason) {
    commandParts.push(`--reason ${quoteShellValue(input.reason)}`);
  }

  return {
    version: 1,
    replayable: true,
    source: "bootstrap_adopt",
    sourceSession: input.manifest.sessionId,
    sourceArtifact: manifestPath,
    inputArtifacts: normalizeReplayPaths(input.root, [
      input.manifest.sourceEvidenceGraphPath,
      manifestPath,
      ...input.manifest.artifactPaths,
      ...input.artifacts.flatMap((artifact) => artifact.sourceFiles),
    ]),
    commands: {
      rerun: commandParts.join(" "),
      inspect: `npm run jispec-cli -- adopt --session ${input.manifest.sessionId} --interactive`,
      verify: "npm run jispec-cli -- verify",
    },
    actor: input.actor,
    reason: input.reason,
    previousOutcome: "drafted",
    nextHumanAction: input.status === "committed"
      ? "Run npm run jispec-cli -- verify and review any blocking, spec-debt, or owner-review follow-up."
      : "Review the bootstrap draft session and decide whether to accept, edit, defer, or reject each artifact.",
  };
}

function quoteShellValue(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function writeBootstrapTakeoverReport(rootInput: string, report: BootstrapTakeoverReport): string {
  const reportPath = getBootstrapTakeoverReportPath(rootInput);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  return normalizeEvidencePath(reportPath);
}

export function loadBootstrapTakeoverReport(rootInput: string): BootstrapTakeoverReport | null {
  const reportPath = getBootstrapTakeoverReportPath(rootInput);
  if (!fs.existsSync(reportPath)) {
    return null;
  }

  const parsed = JSON.parse(fs.readFileSync(reportPath, "utf-8")) as BootstrapTakeoverReport;
  return {
    ...parsed,
    adoptedArtifactPaths: [...parsed.adoptedArtifactPaths].sort((left, right) => left.localeCompare(right)),
    specDebtPaths: [...parsed.specDebtPaths].sort((left, right) => left.localeCompare(right)),
    rejectedArtifactKinds: [...parsed.rejectedArtifactKinds].sort((left, right) => left.localeCompare(right)),
    decisions: [...parsed.decisions].sort((left, right) => left.artifactKind.localeCompare(right.artifactKind)),
    baselineHandoff: {
      expectedContractPaths: [...parsed.baselineHandoff.expectedContractPaths].sort((left, right) => left.localeCompare(right)),
      deferredSpecDebtPaths: [...parsed.baselineHandoff.deferredSpecDebtPaths].sort((left, right) => left.localeCompare(right)),
      rejectedArtifactKinds: [...parsed.baselineHandoff.rejectedArtifactKinds].sort((left, right) => left.localeCompare(right)),
    },
  };
}
