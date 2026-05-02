import path from "node:path";
import { appendAuditEvent } from "../audit/event-ledger";
import {
  buildExternalToolRunReplayMetadata,
  type ExternalToolRunReplayMetadata,
} from "../replay/replay-metadata";

export type ExternalToolRunMode = "run-external-tool";
export type SourceUploadRisk = "none" | "summary_only" | "source_snippets" | "full_source";
export type ExternalToolPolicyProfile = "default" | "solo" | "small_team" | "regulated";

export interface ExternalToolRunRequest {
  mode: ExternalToolRunMode;
  command: string;
  provider: string;
  sourceScope: string[];
  networkRequired: boolean;
  sourceUploadRisk: SourceUploadRisk;
  modelOrServiceProvider: string;
  generatedAt: string;
  policyProfile?: ExternalToolPolicyProfile;
  ownerApprovalPresent?: boolean;
}

export interface ExternalToolRunEvaluation {
  allowed: boolean;
  reasons: string[];
  requiredApproval?: {
    role: "owner";
    subject: {
      kind: "external_graph_summary_sharing";
      ref: string;
    };
  };
}

export interface ExternalToolRunArtifact {
  kind: "jispec-external-tool-run";
  mode: ExternalToolRunMode;
  command: string;
  provider: string;
  networkRequired: boolean;
  sourceUploadRisk: SourceUploadRisk;
  modelOrServiceProvider: string;
  sourceScope: string[];
  generatedAt: string;
  advisoryOnly: true;
  outputBlockingEligible: false;
  audit: {
    kind: "external_tool_run_requested";
    provider: string;
    generatedAt: string;
  };
  replay: ExternalToolRunReplayMetadata;
}

export function evaluateExternalToolRunRequest(input: ExternalToolRunRequest): ExternalToolRunEvaluation {
  const provider = normalizeText(input.provider);
  const command = normalizeText(input.command);
  const sourceScope = normalizeSourceScope(input.sourceScope);
  const modelOrServiceProvider = normalizeText(input.modelOrServiceProvider);
  const reasons: string[] = [];

  if (input.mode !== "run-external-tool") {
    reasons.push("mode must be run-external-tool");
  }
  if (!provider) {
    reasons.push("provider is required");
  }
  if (!command) {
    reasons.push("command is required");
  }
  if (sourceScope.length === 0) {
    reasons.push("source scope is required");
  }
  if (!modelOrServiceProvider) {
    reasons.push("model or service provider is required");
  }
  if (!Number.isFinite(Date.parse(input.generatedAt))) {
    reasons.push("generatedAt must be a valid date-time string");
  }

  const regulatedApprovalRequired =
    input.policyProfile === "regulated" &&
    (input.networkRequired || input.sourceUploadRisk !== "none") &&
    input.ownerApprovalPresent !== true;

  if (regulatedApprovalRequired) {
    reasons.push("owner approval is required before sharing or adopting external graph summary");
    return {
      allowed: false,
      reasons,
      requiredApproval: {
        role: "owner",
        subject: {
          kind: "external_graph_summary_sharing",
          ref: provider ?? "unknown",
        },
      },
    };
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}

export function buildExternalToolRunArtifact(input: ExternalToolRunRequest): ExternalToolRunArtifact {
  const evaluation = evaluateExternalToolRunRequest(input);
  if (!evaluation.allowed) {
    throw new Error(`external tool run request is not allowed: ${evaluation.reasons.join("; ")}`);
  }

  const normalized = normalizeRequest(input);
  const artifactBase = {
    kind: "jispec-external-tool-run" as const,
    mode: normalized.mode,
    command: normalized.command,
    provider: normalized.provider,
    networkRequired: normalized.networkRequired,
    sourceUploadRisk: normalized.sourceUploadRisk,
    modelOrServiceProvider: normalized.modelOrServiceProvider,
    sourceScope: normalized.sourceScope,
    generatedAt: normalized.generatedAt,
    advisoryOnly: true as const,
    outputBlockingEligible: false as const,
    audit: {
      kind: "external_tool_run_requested" as const,
      provider: normalized.provider,
      generatedAt: normalized.generatedAt,
    },
  };

  return {
    ...artifactBase,
    replay: buildExternalToolRunReplayMetadata(artifactBase),
  };
}

export function appendExternalToolRunAudit(
  rootInput: string,
  artifact: ExternalToolRunArtifact,
  artifactPath = ".spec/integrations/external-tool-run.json",
): ReturnType<typeof appendAuditEvent> {
  const root = path.resolve(rootInput);
  return appendAuditEvent(root, {
    type: "external_tool_run_requested",
    reason: `External tool run requested for provider ${artifact.provider}.`,
    sourceArtifact: {
      kind: "external-tool-run-boundary",
      path: artifactPath,
    },
    affectedContracts: [
      `external_tool_provider:${artifact.provider}`,
      ...artifact.sourceScope,
    ],
    details: {
      command: artifact.command,
      provider: artifact.provider,
      networkRequired: artifact.networkRequired,
      sourceUploadRisk: artifact.sourceUploadRisk,
      modelOrServiceProvider: artifact.modelOrServiceProvider,
      sourceScope: artifact.sourceScope,
      advisoryOnly: artifact.advisoryOnly,
      outputBlockingEligible: artifact.outputBlockingEligible,
      replay: artifact.replay,
    },
  });
}

function normalizeRequest(input: ExternalToolRunRequest): ExternalToolRunRequest & {
  command: string;
  provider: string;
  sourceScope: string[];
  modelOrServiceProvider: string;
} {
  return {
    ...input,
    command: normalizeText(input.command) ?? "",
    provider: normalizeText(input.provider) ?? "",
    sourceScope: normalizeSourceScope(input.sourceScope),
    modelOrServiceProvider: normalizeText(input.modelOrServiceProvider) ?? "",
  };
}

function normalizeSourceScope(value: string[]): string[] {
  return Array.from(new Set(value.map((entry) => normalizePath(entry.trim())).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right));
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
