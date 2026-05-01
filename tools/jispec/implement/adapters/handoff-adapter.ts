import fs from "node:fs";
import path from "node:path";
import {
  readHandoffPacketFromInput,
  type HandoffPacket,
  type ImplementationFailedCheck,
  type ImplementationDecisionStopPoint,
} from "../handoff-packet";

export type ExternalCodingTool = "codex" | "claude_code" | "cursor" | "copilot" | "devin";

export interface ExternalToolHandoffAdapterOptions {
  root: string;
  fromHandoff: string;
  tool: ExternalCodingTool;
  outPath?: string;
  createdAt?: string;
}

export interface ExternalToolHandoffAdapterResult {
  root: string;
  requestPath: string;
  summaryPath: string;
  request: ExternalToolHandoffRequest;
}

export interface ExternalToolHandoffRequest {
  version: 1;
  kind: "jispec-external-coding-tool-handoff";
  createdAt: string;
  tool: {
    id: ExternalCodingTool;
    label: string;
    adapterVersion: 1;
    promptStyle: string;
  };
  sourceHandoff: {
    sessionId: string;
    path: string;
    replayable: boolean;
    outcome: HandoffPacket["outcome"];
  };
  request: {
    changeIntent: string;
    summary: string;
    stopPoint: ImplementationDecisionStopPoint;
    failedCheck: ImplementationFailedCheck;
    allowedPaths: string[];
    filesNeedingAttention: string[];
    contractFocus: string[];
    testCommand: string;
    verifyCommand: string;
    returnPatchCommand: string;
  };
  constraints: {
    patchFormat: "unified_diff";
    allowedPathsOnly: true;
    doNotRunAsFinalAuthority: true;
    doNotUploadSourceRequiredByJiSpec: true;
    noSecretsInPrompt: true;
  };
  authorityBoundary: {
    adapterOnlyChangesRequestFormat: true;
    patchMustReturnThroughImplementExternalPatch: true;
    scopeCheckRequired: true;
    testsRequired: true;
    verifyRequired: true;
    llmIsNotBlockingJudge: true;
  };
  replay: {
    replayable: true;
    restoreCommand: string;
    retryWithExternalPatchCommand: string;
    rerunVerifyCommand: string;
  };
  prompt: string;
}

const TOOL_LABELS: Record<ExternalCodingTool, { label: string; promptStyle: string }> = {
  codex: {
    label: "Codex",
    promptStyle: "repository-agent",
  },
  claude_code: {
    label: "Claude Code",
    promptStyle: "terminal-coding-agent",
  },
  cursor: {
    label: "Cursor",
    promptStyle: "ide-agent",
  },
  copilot: {
    label: "GitHub Copilot",
    promptStyle: "ide-pair-programmer",
  },
  devin: {
    label: "Devin",
    promptStyle: "autonomous-coding-agent",
  },
};

export function buildExternalToolHandoffRequest(
  rootInput: string,
  handoffInput: string,
  tool: ExternalCodingTool,
  createdAt = new Date().toISOString(),
): ExternalToolHandoffRequest {
  const root = path.resolve(rootInput);
  const resolved = readHandoffPacketFromInput(root, handoffInput);
  if (!resolved) {
    throw new Error(`Handoff packet not found: ${handoffInput}`);
  }
  validateExternalCodingTool(tool);

  const packet = resolved.packet;
  if (!packet.replay?.replayable) {
    throw new Error(`Handoff packet is not replayable: ${handoffInput}`);
  }

  const externalHandoff = packet.decisionPacket.nextActionDetail.externalToolHandoff;
  const allowedPaths = stableUnique(
    externalHandoff?.allowedPaths.length
      ? externalHandoff.allowedPaths
      : packet.replay.inputs.allowedPatchPaths,
  );
  const filesNeedingAttention = stableUnique(
    externalHandoff?.filesNeedingAttention.length
      ? externalHandoff.filesNeedingAttention
      : packet.nextSteps.filesNeedingAttention,
  );
  const contractFocus = buildContractFocus(packet);
  const retryCommand = packet.replay.commands.retryWithExternalPatch;

  const request: ExternalToolHandoffRequest = {
    version: 1,
    kind: "jispec-external-coding-tool-handoff",
    createdAt,
    tool: {
      id: tool,
      label: TOOL_LABELS[tool].label,
      adapterVersion: 1,
      promptStyle: TOOL_LABELS[tool].promptStyle,
    },
    sourceHandoff: {
      sessionId: packet.sessionId,
      path: normalizePath(path.relative(root, resolved.path)),
      replayable: packet.replay.replayable,
      outcome: packet.outcome,
    },
    request: {
      changeIntent: packet.changeIntent,
      summary: packet.decisionPacket.summary,
      stopPoint: packet.decisionPacket.stopPoint,
      failedCheck: packet.decisionPacket.nextActionDetail.failedCheck,
      allowedPaths,
      filesNeedingAttention,
      contractFocus,
      testCommand: packet.nextSteps.testCommand,
      verifyCommand: packet.nextSteps.verifyCommand,
      returnPatchCommand: retryCommand,
    },
    constraints: {
      patchFormat: "unified_diff",
      allowedPathsOnly: true,
      doNotRunAsFinalAuthority: true,
      doNotUploadSourceRequiredByJiSpec: true,
      noSecretsInPrompt: true,
    },
    authorityBoundary: {
      adapterOnlyChangesRequestFormat: true,
      patchMustReturnThroughImplementExternalPatch: true,
      scopeCheckRequired: true,
      testsRequired: true,
      verifyRequired: true,
      llmIsNotBlockingJudge: true,
    },
    replay: {
      replayable: true,
      restoreCommand: packet.replay.commands.restore,
      retryWithExternalPatchCommand: retryCommand,
      rerunVerifyCommand: packet.replay.commands.rerunVerify,
    },
    prompt: "",
  };

  return {
    ...request,
    prompt: renderExternalToolPrompt(request, packet),
  };
}

export function writeExternalToolHandoffRequest(
  options: ExternalToolHandoffAdapterOptions,
): ExternalToolHandoffAdapterResult {
  const root = path.resolve(options.root);
  const request = buildExternalToolHandoffRequest(root, options.fromHandoff, options.tool, options.createdAt);
  const requestPath = resolveRequestPath(root, request, options.outPath);
  const summaryPath = requestPath.replace(/\.json$/i, ".md");

  fs.mkdirSync(path.dirname(requestPath), { recursive: true });
  fs.writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`, "utf-8");
  fs.writeFileSync(summaryPath, renderExternalToolHandoffMarkdown(request), "utf-8");

  return {
    root,
    requestPath,
    summaryPath,
    request,
  };
}

export function renderExternalToolHandoffJSON(result: ExternalToolHandoffAdapterResult): string {
  return JSON.stringify(result, null, 2);
}

export function renderExternalToolHandoffText(result: ExternalToolHandoffAdapterResult): string {
  return [
    "External coding tool handoff request written.",
    `Tool: ${result.request.tool.label}`,
    `Session: ${result.request.sourceHandoff.sessionId}`,
    `Stop point: ${result.request.request.stopPoint}`,
    `Failed check: ${result.request.request.failedCheck}`,
    `Allowed paths: ${result.request.request.allowedPaths.join(", ") || "none"}`,
    `Request path: ${normalizePath(path.relative(result.root, result.requestPath))}`,
    `Summary path: ${normalizePath(path.relative(result.root, result.summaryPath))}`,
    `Return patch through: ${result.request.request.returnPatchCommand}`,
    "Boundary: adapter changes request format only; external patch still returns through implement --external-patch for scope, test, and verify.",
  ].join("\n");
}

export function parseExternalCodingTool(value: string): ExternalCodingTool {
  const normalized = value.trim().toLowerCase().replace(/[-\s]/g, "_");
  validateExternalCodingTool(normalized);
  return normalized;
}

function renderExternalToolPrompt(request: ExternalToolHandoffRequest, packet: HandoffPacket): string {
  return [
    `You are receiving a JiSpec handoff for ${request.tool.label}.`,
    "",
    `Change intent: ${request.request.changeIntent}`,
    `Current stop point: ${request.request.stopPoint}`,
    `Failed check: ${request.request.failedCheck}`,
    `Summary: ${request.request.summary}`,
    "",
    "Allowed paths:",
    ...formatList(request.request.allowedPaths),
    "",
    "Files needing attention:",
    ...formatList(request.request.filesNeedingAttention),
    "",
    "Contract focus:",
    ...formatList(request.request.contractFocus),
    "",
    `Test command: ${request.request.testCommand}`,
    `Verify command after mediation: ${request.request.verifyCommand}`,
    "",
    "Produce a unified diff patch only for the allowed paths. Do not treat your own result as final authority.",
    `Return the patch through JiSpec with: ${request.request.returnPatchCommand}`,
    "JiSpec will run scope check, patch apply, tests, and verify after the patch returns.",
    "",
    "Recent failure context:",
    ...formatList(packet.summary.whatFailed),
  ].join("\n");
}

function renderExternalToolHandoffMarkdown(request: ExternalToolHandoffRequest): string {
  return [
    "# JiSpec External Coding Tool Handoff",
    "",
    `Tool: ${request.tool.label}`,
    `Session: ${request.sourceHandoff.sessionId}`,
    `Stop point: ${request.request.stopPoint}`,
    `Failed check: ${request.request.failedCheck}`,
    "",
    "## Request",
    "",
    request.prompt,
    "",
    "## Authority Boundary",
    "",
    "- This adapter only changes request format.",
    "- The external tool must return a unified diff patch.",
    "- The patch must go through `implement --external-patch`.",
    "- JiSpec still performs scope check, patch apply, tests, and verify.",
    "- The external tool is not a blocking judge.",
    "",
  ].join("\n");
}

function buildContractFocus(packet: HandoffPacket): string[] {
  return stableUnique([
    ...packet.contractContext.adoptedContractPaths,
    ...packet.contractContext.deferredSpecDebtPaths,
    ...packet.contractContext.changedPathKinds.map((kind) => `path_kind:${kind}`),
    `lane:${packet.contractContext.lane}`,
  ]);
}

function resolveRequestPath(root: string, request: ExternalToolHandoffRequest, outPath?: string): string {
  if (outPath) {
    return path.isAbsolute(outPath) ? outPath : path.join(root, outPath);
  }
  return path.join(
    root,
    ".jispec",
    "handoff",
    "adapters",
    request.sourceHandoff.sessionId,
    `${request.tool.id}-request.json`,
  );
}

function validateExternalCodingTool(value: string): asserts value is ExternalCodingTool {
  if (!["codex", "claude_code", "cursor", "copilot", "devin"].includes(value)) {
    throw new Error("--tool must be one of: codex, claude_code, cursor, copilot, devin");
  }
}

function formatList(values: string[]): string[] {
  return values.length > 0 ? values.map((value) => `- ${value}`) : ["- none"];
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right));
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
