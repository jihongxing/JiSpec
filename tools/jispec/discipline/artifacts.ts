import fs from "node:fs";
import path from "node:path";
import { readChangeSession } from "../change/change-session";
import type { AgentRunSession, CompletionEvidence, DebugPacket, DisciplineReport } from "./types";
import {
  resolveAgentRunSessionPath,
  resolveCompletionEvidencePath,
  resolveDebugPacketMarkdownPath,
  resolveDebugPacketPath,
  resolveDisciplineReportPath,
  resolveDisciplineSummaryPath,
  toRepoRelativePath,
} from "./paths";

function writeJson(root: string, absolutePath: string, value: unknown): string {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  return toRepoRelativePath(root, absolutePath);
}

export function writeAgentRunSession(root: string, session: AgentRunSession): string {
  return writeJson(root, resolveAgentRunSessionPath(root, session.sessionId), session);
}

export function writeCompletionEvidence(root: string, evidence: CompletionEvidence): string {
  return writeJson(root, resolveCompletionEvidencePath(root, evidence.sessionId), evidence);
}

export function writeDebugPacket(root: string, packet: DebugPacket): { jsonPath: string; markdownPath: string } {
  const jsonPath = writeJson(root, resolveDebugPacketPath(root, packet.sessionId), packet);
  const markdownAbsolutePath = resolveDebugPacketMarkdownPath(root, packet.sessionId);
  fs.mkdirSync(path.dirname(markdownAbsolutePath), { recursive: true });
  fs.writeFileSync(markdownAbsolutePath, renderDebugPacketMarkdown(packet), "utf-8");
  return {
    jsonPath,
    markdownPath: toRepoRelativePath(root, markdownAbsolutePath),
  };
}

export function writeDisciplineReport(root: string, report: DisciplineReport): string {
  return writeJson(root, resolveDisciplineReportPath(root, report.sessionId), report);
}

export function writeDisciplineSummary(root: string, report: DisciplineReport): string {
  const summaryPath = resolveDisciplineSummaryPath(root, report.sessionId);
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, renderDisciplineSummary(report), "utf-8");
  return toRepoRelativePath(root, summaryPath);
}

export function readDisciplineReport(root: string, sessionId: string): DisciplineReport | null {
  const reportPath = resolveDisciplineReportPath(root, sessionId);
  if (!fs.existsSync(reportPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(reportPath, "utf-8")) as DisciplineReport;
}

export function findLatestDisciplineReport(root: string, sessionId?: string): { path: string; report: DisciplineReport } | null {
  const preferredSessionId = sessionId ?? readChangeSession(root)?.id;
  if (preferredSessionId) {
    const preferredPath = resolveDisciplineReportPath(root, preferredSessionId);
    if (fs.existsSync(preferredPath)) {
      return {
        path: toRepoRelativePath(root, preferredPath),
        report: JSON.parse(fs.readFileSync(preferredPath, "utf-8")) as DisciplineReport,
      };
    }
  }

  const runRoot = path.join(root, ".jispec", "agent-run");
  if (!fs.existsSync(runRoot)) {
    return null;
  }
  const candidates = fs.readdirSync(runRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(runRoot, entry.name, "discipline-report.json"))
    .filter((candidate) => fs.existsSync(candidate))
    .map((candidate) => ({
      path: toRepoRelativePath(root, candidate),
      report: JSON.parse(fs.readFileSync(candidate, "utf-8")) as DisciplineReport,
    }))
    .sort((left, right) =>
      compareString(right.report.generatedAt, left.report.generatedAt) ||
      compareString(right.report.sessionId, left.report.sessionId) ||
      compareString(right.path, left.path)
    );
  const latest = candidates[0];
  if (!latest) {
    return null;
  }
  return latest;
}

function compareString(left: string, right: string): number {
  return left.localeCompare(right);
}

export function renderDisciplineSummary(report: DisciplineReport): string {
  const lines = [
    "# Agent Discipline Summary",
    "",
    `Session: ${report.sessionId}`,
    `Mode: ${report.mode}`,
    `Phase gate: ${report.phaseGate.status}`,
    `Test strategy: ${report.testStrategy.status}${report.testStrategy.command ? ` via ${report.testStrategy.command}` : ""}`,
    `Completion: ${report.completion.status}`,
    `Allowed paths: ${report.isolation.allowedPaths.join(", ") || "none"}`,
    `Touched paths: ${report.isolation.touchedPaths.join(", ") || "none"}`,
    `Unexpected paths: ${report.isolation.unexpectedPaths.join(", ") || "none"}`,
    "",
    "## Missing Evidence",
    ...renderList(report.completion.missingEvidence),
    "",
    "## Truth Sources",
    ...renderList(report.truthSources.map((source) => `${source.path} [${source.provenance}] ${source.note}`)),
    "",
    "This Markdown file is a human-readable companion summary, not a machine API. Read `discipline-report.json` for automation.",
    "",
  ];
  return `${lines.join("\n")}`;
}

function renderDebugPacketMarkdown(packet: DebugPacket): string {
  const lines = [
    "# Agent Debug Packet",
    "",
    `Session: ${packet.sessionId}`,
    `Stop point: ${packet.stopPoint}`,
    `Failing check: ${packet.failingCheck}`,
    `Failed command: ${packet.failedCommand ?? "not recorded"}`,
    `Minimal reproduction: ${packet.minimalReproductionCommand}`,
    `Hypothesis: ${packet.currentHypothesis}`,
    `Retry command: ${packet.retryCommand}`,
    "",
    "## Observed Evidence",
    ...renderList(packet.observedEvidence),
    "",
    "## Files Likely Involved",
    ...renderList(packet.filesLikelyInvolved),
    "",
  ];
  return `${lines.join("\n")}`;
}

function renderList(values: string[]): string[] {
  return values.length > 0 ? values.map((value) => `- ${value}`) : ["- none"];
}
