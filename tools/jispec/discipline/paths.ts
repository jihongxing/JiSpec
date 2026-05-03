import path from "node:path";

export function resolveAgentRunDir(root: string, sessionId: string): string {
  return path.join(root, ".jispec", "agent-run", sessionId);
}

export function resolveAgentRunSessionPath(root: string, sessionId: string): string {
  return path.join(resolveAgentRunDir(root, sessionId), "session.json");
}

export function resolveDisciplineReportPath(root: string, sessionId: string): string {
  return path.join(resolveAgentRunDir(root, sessionId), "discipline-report.json");
}

export function resolveDisciplineSummaryPath(root: string, sessionId: string): string {
  return path.join(resolveAgentRunDir(root, sessionId), "discipline-summary.md");
}

export function resolveCompletionEvidencePath(root: string, sessionId: string): string {
  return path.join(resolveAgentRunDir(root, sessionId), "completion-evidence.json");
}

export function resolveDebugPacketPath(root: string, sessionId: string): string {
  return path.join(resolveAgentRunDir(root, sessionId), "debug-packet.json");
}

export function resolveDebugPacketMarkdownPath(root: string, sessionId: string): string {
  return path.join(resolveAgentRunDir(root, sessionId), "debug-packet.md");
}

export function toRepoRelativePath(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).replace(/\\/g, "/");
}
