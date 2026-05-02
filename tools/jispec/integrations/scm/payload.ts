import fs from "node:fs";
import path from "node:path";
import { inferNextAction, type VerifyReport } from "../../ci/verify-report";
import { renderPrCommentMarkdown } from "../../ci/pr-comment";
import { collectConsoleLocalSnapshot, type ConsoleGovernanceObjectSnapshot } from "../../console/read-model-snapshot";
import { readChangeSession } from "../../change/change-session";
import { listHandoffPackets, readHandoffPacket, type HandoffPacket } from "../../implement/handoff-packet";
import {
  buildExternalIntegrationContract,
  buildLocalArtifactRefs,
  type ExternalIntegrationContract,
  type LocalArtifactRef,
} from "../contract";

export type IntegrationProvider = "github" | "gitlab" | "jira" | "linear";
export type IntegrationPayloadKind = "scm_comment" | "issue_link";

export interface IntegrationPayloadOptions {
  root: string;
  provider: IntegrationProvider;
  kind: IntegrationPayloadKind;
  outPath?: string;
  createdAt?: string;
}

export interface IntegrationPayloadResult {
  root: string;
  payloadPath: string;
  markdownPath: string;
  payload: IntegrationPayload;
}

export interface IntegrationPayload {
  version: 1;
  kind: IntegrationPayloadKind;
  provider: IntegrationProvider;
  createdAt: string;
  boundary: {
    localOnly: true;
    previewOnly: true;
    cloudApiWriteRequired: false;
    cloudTokenRequired: false;
    sourceUploadRequired: false;
    localArtifactsRemainSourceOfTruth: true;
    doesNotReplaceVerify: true;
  };
  contract: ExternalIntegrationContract;
  sourceArtifacts: string[];
  sourceArtifactRefs: LocalArtifactRef[];
  summary: {
    verifyVerdict: string;
    verifyOk: boolean;
    totalIssues: number;
    blockingIssues: number;
    advisoryIssues: number;
    nextAction: string;
    waiverSummary: string;
    specDebtSummary: string;
    handoffNextAction: string;
    changeIntent: string;
  };
  scm?: {
    target: "pull_request_comment" | "merge_request_note";
    markdown: string;
  };
  issue?: {
    target: "issue_link_preview";
    title: string;
    bodyMarkdown: string;
    changeIntentBackfill: string;
    labels: string[];
    localArtifactRefs: string[];
  };
}

export function buildIntegrationPayload(options: IntegrationPayloadOptions): IntegrationPayload {
  const root = path.resolve(options.root);
  validateProviderKind(options.provider, options.kind);
  const report = readVerifyReport(root);
  const snapshot = collectConsoleLocalSnapshot(root);
  const handoff = readLatestHandoff(root);
  const sourceArtifacts = collectSourceArtifacts(root, snapshot, handoff);
  const sourceArtifactRefs = buildLocalArtifactRefs(sourceArtifacts);
  const nextAction = report ? inferNextAction(report) : "Run npm run ci:verify to create local verify artifacts.";
  const waiverSummary = summarizeWaivers(snapshot.governance.objects);
  const specDebtSummary = summarizeSpecDebt(snapshot.governance.objects);
  const handoffNextAction = handoff?.decisionPacket.nextAction ?? "No implementation handoff next action is available.";
  const changeIntent = handoff?.changeIntent ?? readChangeSession(root)?.summary ?? "No change intent artifact is available.";
  const summary = {
    verifyVerdict: report?.verdict ?? "not_available_yet",
    verifyOk: report?.ok ?? false,
    totalIssues: report?.counts.total ?? 0,
    blockingIssues: report?.counts.blocking ?? 0,
    advisoryIssues: report?.counts.advisory ?? 0,
    nextAction,
    waiverSummary,
    specDebtSummary,
    handoffNextAction,
    changeIntent,
  };

  const base = {
    version: 1 as const,
    kind: options.kind,
    provider: options.provider,
    createdAt: options.createdAt ?? new Date().toISOString(),
    boundary: {
      localOnly: true as const,
      previewOnly: true as const,
      cloudApiWriteRequired: false as const,
      cloudTokenRequired: false as const,
      sourceUploadRequired: false as const,
      localArtifactsRemainSourceOfTruth: true as const,
      doesNotReplaceVerify: true as const,
    },
    contract: buildExternalIntegrationContract(options.kind === "scm_comment" ? "scm_comment_preview" : "issue_link_preview"),
    sourceArtifacts,
    sourceArtifactRefs,
    summary,
  };

  if (options.kind === "scm_comment") {
    return {
      ...base,
      scm: {
        target: options.provider === "gitlab" ? "merge_request_note" : "pull_request_comment",
        markdown: renderScmCommentMarkdown(options.provider, report, summary),
      },
    };
  }

  return {
    ...base,
    issue: {
      target: "issue_link_preview",
      title: buildIssueTitle(options.provider, summary),
      bodyMarkdown: renderIssueBodyMarkdown(options.provider, summary, sourceArtifacts),
      changeIntentBackfill: summary.changeIntent,
      labels: buildIssueLabels(summary),
      localArtifactRefs: sourceArtifacts,
    },
  };
}

export function writeIntegrationPayload(options: IntegrationPayloadOptions): IntegrationPayloadResult {
  const root = path.resolve(options.root);
  const payload = buildIntegrationPayload({ ...options, root });
  const payloadPath = resolvePayloadPath(root, payload, options.outPath);
  const markdownPath = payloadPath.replace(/\.json$/i, ".md");
  const markdown = payload.scm?.markdown ?? payload.issue?.bodyMarkdown ?? renderPayloadMarkdown(payload);

  fs.mkdirSync(path.dirname(payloadPath), { recursive: true });
  fs.writeFileSync(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  fs.writeFileSync(markdownPath, `${markdown.endsWith("\n") ? markdown : `${markdown}\n`}`, "utf-8");

  return {
    root,
    payloadPath,
    markdownPath,
    payload,
  };
}

export function renderIntegrationPayloadJSON(result: IntegrationPayloadResult): string {
  return JSON.stringify(result, null, 2);
}

export function renderIntegrationPayloadText(result: IntegrationPayloadResult): string {
  return [
    "Integration payload preview written.",
    `Provider: ${result.payload.provider}`,
    `Kind: ${result.payload.kind}`,
    `Verify verdict: ${result.payload.summary.verifyVerdict}`,
    `Next action: ${result.payload.summary.nextAction}`,
    `Payload path: ${normalizePath(path.relative(result.root, result.payloadPath))}`,
    `Markdown path: ${normalizePath(path.relative(result.root, result.markdownPath))}`,
    "Boundary: local preview only; no cloud token, no source upload, no replacement for verify.",
  ].join("\n");
}

export function parseIntegrationProvider(value: string): IntegrationProvider {
  const normalized = value.trim().toLowerCase();
  if (normalized === "github" || normalized === "gitlab" || normalized === "jira" || normalized === "linear") {
    return normalized;
  }
  throw new Error("--provider must be one of: github, gitlab, jira, linear");
}

export function parseIntegrationPayloadKind(value: string): IntegrationPayloadKind {
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  if (normalized === "scm_comment" || normalized === "issue_link") {
    return normalized;
  }
  throw new Error("--kind must be one of: scm_comment, issue_link");
}

function renderScmCommentMarkdown(
  provider: IntegrationProvider,
  report: VerifyReport | null,
  summary: IntegrationPayload["summary"],
): string {
  const base = report
    ? renderPrCommentMarkdown(report, { includeConsoleLink: false })
    : [
        "## JiSpec Verify: not_available_yet",
        "",
        "### Next Action",
        "",
        summary.nextAction,
        "",
      ].join("\n");
  const target = provider === "gitlab" ? "GitLab MR" : "GitHub PR";
  return [
    base.trimEnd(),
    "",
    "### Governance Context",
    "",
    `- Target: ${target}`,
    `- Waivers: ${summary.waiverSummary}`,
    `- Spec debt: ${summary.specDebtSummary}`,
    `- Handoff next action: ${summary.handoffNextAction}`,
    `- Change intent: ${summary.changeIntent}`,
    "",
    "### Integration Boundary",
    "",
    "- This is a local payload preview generated from JiSpec artifacts.",
    "- It does not call SCM APIs, require cloud tokens, upload source, or replace verify.",
    "",
  ].join("\n");
}

function renderIssueBodyMarkdown(
  provider: IntegrationProvider,
  summary: IntegrationPayload["summary"],
  sourceArtifacts: string[],
): string {
  return [
    `# JiSpec ${provider === "jira" ? "Jira" : "Linear"} Issue Link Preview`,
    "",
    `Change intent: ${summary.changeIntent}`,
    "",
    "## Verify",
    "",
    `- Verdict: ${summary.verifyVerdict}`,
    `- Blocking issues: ${summary.blockingIssues}`,
    `- Advisory issues: ${summary.advisoryIssues}`,
    `- Next action: ${summary.nextAction}`,
    "",
    "## Governance",
    "",
    `- Waivers: ${summary.waiverSummary}`,
    `- Spec debt: ${summary.specDebtSummary}`,
    `- Handoff next action: ${summary.handoffNextAction}`,
    "",
    "## Local Artifact References",
    "",
    ...formatList(sourceArtifacts),
    "",
    "## Boundary",
    "",
    "- Preview only; no cloud API write is performed.",
    "- Local JiSpec artifacts remain the source of truth.",
    "- This payload does not replace verify or ci:verify.",
    "",
  ].join("\n");
}

function renderPayloadMarkdown(payload: IntegrationPayload): string {
  return payload.scm?.markdown ?? payload.issue?.bodyMarkdown ?? JSON.stringify(payload, null, 2);
}

function readVerifyReport(root: string): VerifyReport | null {
  const reportPath = path.join(root, ".jispec-ci", "verify-report.json");
  if (!fs.existsSync(reportPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(reportPath, "utf-8")) as VerifyReport;
}

function readLatestHandoff(root: string): HandoffPacket | null {
  const ids = listHandoffPackets(root);
  const latest = ids.at(-1);
  return latest ? readHandoffPacket(root, latest) : null;
}

function collectSourceArtifacts(
  root: string,
  snapshot: ReturnType<typeof collectConsoleLocalSnapshot>,
  handoff: HandoffPacket | null,
): string[] {
  const paths = new Set<string>();
  const verifyReport = ".jispec-ci/verify-report.json";
  if (fs.existsSync(path.join(root, verifyReport))) {
    paths.add(verifyReport);
  }
  for (const object of snapshot.governance.objects) {
    for (const sourcePath of object.sourcePaths) {
      paths.add(sourcePath);
    }
  }
  if (handoff) {
    paths.add(`.jispec/handoff/${handoff.sessionId}.json`);
  }
  return Array.from(paths).sort((left, right) => left.localeCompare(right));
}

function summarizeWaivers(objects: ConsoleGovernanceObjectSnapshot[]): string {
  const waiver = governanceObject(objects, "waiver_lifecycle");
  if (!waiver || waiver.summary.state === "not_available_yet") {
    return "not_available_yet";
  }
  return `${numberValue(waiver.summary.active)} active, ${numberValue(waiver.summary.expired)} expired, ${numberValue(waiver.summary.revoked)} revoked`;
}

function summarizeSpecDebt(objects: ConsoleGovernanceObjectSnapshot[]): string {
  const debt = governanceObject(objects, "spec_debt_ledger");
  if (!debt || debt.summary.state === "not_available_yet") {
    return "not_available_yet";
  }
  return `${numberValue(debt.summary.greenfieldLedgerItems)} Greenfield item(s), ${numberValue(debt.summary.bootstrapDebtRecords)} bootstrap record(s)`;
}

function governanceObject(objects: ConsoleGovernanceObjectSnapshot[], id: string): ConsoleGovernanceObjectSnapshot | undefined {
  return objects.find((object) => object.id === id);
}

function buildIssueTitle(provider: IntegrationProvider, summary: IntegrationPayload["summary"]): string {
  const prefix = provider === "jira" ? "JiSpec Jira link" : "JiSpec Linear link";
  return `${prefix}: ${summary.verifyVerdict} for ${summary.changeIntent}`;
}

function buildIssueLabels(summary: IntegrationPayload["summary"]): string[] {
  const labels = ["jispec", "local-preview"];
  if (summary.blockingIssues > 0) {
    labels.push("blocking");
  }
  if (summary.advisoryIssues > 0) {
    labels.push("advisory");
  }
  return labels;
}

function resolvePayloadPath(root: string, payload: IntegrationPayload, outPath?: string): string {
  if (outPath) {
    return path.isAbsolute(outPath) ? outPath : path.join(root, outPath);
  }
  const fileName = `${payload.provider}-${payload.kind}.json`;
  const dir = payload.kind === "scm_comment"
    ? path.join(root, ".spec", "integrations", "scm")
    : path.join(root, ".spec", "integrations", "issues");
  return path.join(dir, fileName);
}

function validateProviderKind(provider: IntegrationProvider, kind: IntegrationPayloadKind): void {
  if (kind === "scm_comment" && provider !== "github" && provider !== "gitlab") {
    throw new Error("scm_comment payloads support github or gitlab providers.");
  }
  if (kind === "issue_link" && provider !== "jira" && provider !== "linear") {
    throw new Error("issue_link payloads support jira or linear providers.");
  }
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatList(values: string[]): string[] {
  return values.length > 0 ? values.map((value) => `- ${value}`) : ["- none"];
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
