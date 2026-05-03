import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as yaml from "js-yaml";
import { createFactsContract } from "../facts/facts-contract";
import { loadVerifyPolicy, policyFileExists } from "../policy/policy-loader";
import { validatePolicyAgainstFactsContract } from "../policy/policy-schema";
import type { ChangeSessionOrchestrationMode } from "./change-session";

export interface ChangeDefaultModeResolution {
  mode: ChangeSessionOrchestrationMode;
  source: "cli" | "project_config" | "built_in_default";
  configPath?: string;
  warnings: string[];
}

export interface ChangeExecuteDefaultBoundary {
  promptModeRecordsOnly: true;
  executeModeRunsMediationAndVerify: true;
  explicitCliModeOverridesProjectDefault: true;
  projectDefaultAppliesOnlyWhenModeOmitted: true;
  strictLaneOpenDraftAction: "pause_at_adopt_boundary";
  businessCodeGeneratedByJiSpec: false;
  adoptBoundary: {
    status: "clear" | "open_draft_pause_required";
    openDraftSessionId?: string;
    nextAction?: string;
  };
}

export type ChangeExecuteDefaultPreconditionId =
  | "project_config"
  | "verify_policy"
  | "verify_stability"
  | "external_patch_mediation"
  | "adopt_boundary";

export interface ChangeExecuteDefaultPrecondition {
  id: ChangeExecuteDefaultPreconditionId;
  status: "pass" | "warning" | "blocker";
  message: string;
  ownerAction: string;
}

export interface ChangeExecuteDefaultReadiness {
  defaultMode: ChangeSessionOrchestrationMode;
  source: ChangeDefaultModeResolution["source"];
  configPath?: string;
  readyForExecuteDefault: boolean;
  canSetExecuteDefault: boolean;
  openDraftSessionId?: string;
  boundary: ChangeExecuteDefaultBoundary;
  preconditions: ChangeExecuteDefaultPrecondition[];
  blockers: string[];
  warnings: string[];
  ownerActions: string[];
  details: string[];
}

interface VerifyReadinessPayload {
  verdict?: string;
  ok?: boolean;
  issues?: Array<{
    code?: string;
    severity?: string;
  }>;
}

const EXECUTE_DEFAULT_GOVERNANCE_ONLY_BLOCKERS = new Set([
  "AGENT_DISCIPLINE_INCOMPLETE",
  "POLICY_NO_BLOCKING_ISSUES",
]);

export function resolveChangeCommandMode(
  root: string,
  explicitMode?: ChangeSessionOrchestrationMode,
): ChangeDefaultModeResolution {
  if (explicitMode !== undefined) {
    validateChangeMode(explicitMode);
    return {
      mode: explicitMode,
      source: "cli",
      warnings: [],
    };
  }

  const config = loadConfiguredChangeDefaultMode(root);
  if (config.mode) {
    return {
      mode: config.mode,
      source: "project_config",
      configPath: config.configPath,
      warnings: config.warnings,
    };
  }

  return {
    mode: "prompt",
    source: "built_in_default",
    configPath: config.configPath,
    warnings: config.warnings,
  };
}

export function evaluateChangeExecuteDefaultReadiness(root: string): ChangeExecuteDefaultReadiness {
  const resolution = resolveChangeCommandMode(root);
  const openDraftSessionId = findOpenBootstrapDraftSessionId(root);
  const boundary = buildExecuteDefaultBoundary(openDraftSessionId);
  const preconditions = evaluateExecuteDefaultPreconditions(root, resolution, boundary);
  const blockers = preconditions.filter((precondition) => precondition.status === "blocker");
  const warnings = preconditions.filter((precondition) => precondition.status === "warning");
  const canSetExecuteDefault = blockers.length === 0;
  const details: string[] = [];

  if (resolution.configPath) {
    details.push(`Project config: ${path.relative(root, resolution.configPath).replace(/\\/g, "/")}`);
  } else {
    details.push("Project config: not present");
  }

  details.push(`Current default: ${resolution.mode}`);
  details.push(`Default change mode: ${resolution.mode}`);
  details.push(`Mode source: ${resolution.source}`);

  const readyForExecuteDefault = resolution.mode === "execute" && canSetExecuteDefault;
  details.push(`Decision: ${renderExecuteDefaultDecision(resolution.mode, readyForExecuteDefault, blockers)}`);
  details.push(`Switch gate: ${canSetExecuteDefault ? "pass" : "blocked"}`);
  details.push(`Blockers: ${blockers.length === 0 ? "none" : blockers.map((blocker) => blocker.message).join("; ")}`);
  details.push(`Warnings: ${warnings.length === 0 ? "none" : warnings.map((warning) => warning.message).join("; ")}`);
  details.push("Preconditions:");
  for (const precondition of preconditions) {
    details.push(`  - ${precondition.id}: ${precondition.status} - ${precondition.message}`);
    details.push(`    Owner action: ${precondition.ownerAction}`);
  }
  details.push("Guardrail: execute-default only enters implementation mediation and verify orchestration; JiSpec still does not generate business code autonomously.");
  details.push("Mode precedence: explicit --mode prompt or --mode execute overrides project configuration.");
  details.push("Project default scope: change.default_mode applies only when --mode is omitted.");
  details.push("Adopt boundary: strict-lane changes still stop before implement when an open bootstrap draft exists.");
  details.push(`Adopt boundary status: ${boundary.adoptBoundary.status}`);
  details.push(`Open bootstrap draft: ${openDraftSessionId ?? "none"}`);
  details.push("Implementation ownership: JiSpec does not generate or own business-code implementation.");

  if (openDraftSessionId) {
    details.push(`Next action: run npm run jispec-cli -- adopt --interactive --session ${openDraftSessionId} before relying on strict-lane execute-default.`);
  } else if (resolution.mode === "execute") {
    details.push("Next action: run change without --mode when you want the project default to enter implementation mediation.");
  } else {
    details.push("Next action: keep prompt default, or set change.default_mode: execute in jiproject/project.yaml after the team accepts execute mediation as the default entry point.");
  }

  for (const blocker of blockers) {
    details.push(`Blocking reason: ${blocker.message}`);
    details.push(`Owner action: ${blocker.ownerAction}`);
  }

  return {
    defaultMode: resolution.mode,
    source: resolution.source,
    configPath: resolution.configPath,
    readyForExecuteDefault,
    canSetExecuteDefault,
    openDraftSessionId,
    boundary,
    preconditions,
    blockers: blockers.map((blocker) => blocker.message),
    warnings: warnings.map((warning) => warning.message),
    ownerActions: uniqueSorted(preconditions
      .filter((precondition) => precondition.status !== "pass")
      .map((precondition) => precondition.ownerAction)),
    details,
  };
}

function buildExecuteDefaultBoundary(openDraftSessionId?: string): ChangeExecuteDefaultBoundary {
  return {
    promptModeRecordsOnly: true,
    executeModeRunsMediationAndVerify: true,
    explicitCliModeOverridesProjectDefault: true,
    projectDefaultAppliesOnlyWhenModeOmitted: true,
    strictLaneOpenDraftAction: "pause_at_adopt_boundary",
    businessCodeGeneratedByJiSpec: false,
    adoptBoundary: openDraftSessionId
      ? {
          status: "open_draft_pause_required",
          openDraftSessionId,
          nextAction: `npm run jispec-cli -- adopt --interactive --session ${openDraftSessionId}`,
        }
      : {
          status: "clear",
        },
  };
}

function renderExecuteDefaultDecision(
  mode: ChangeSessionOrchestrationMode,
  readyForExecuteDefault: boolean,
  blockers: ChangeExecuteDefaultPrecondition[],
): string {
  if (mode === "prompt") {
    return "Prompt remains the default; use --mode execute for explicit trials before switching the project default.";
  }
  if (blockers.length > 0) {
    return "Do not enable execute-default until the blocking precondition(s) are fixed.";
  }
  if (readyForExecuteDefault) {
    return "Execute-default mediation is configured and ready for ordinary change calls.";
  }
  return "Review required before changing the project default.";
}

function evaluateExecuteDefaultPreconditions(
  root: string,
  resolution: ChangeDefaultModeResolution,
  boundary: ChangeExecuteDefaultBoundary,
): ChangeExecuteDefaultPrecondition[] {
  return [
    evaluateProjectConfigPrecondition(resolution),
    evaluateVerifyPolicyPrecondition(root),
    evaluateVerifyStabilityPrecondition(root, boundary.adoptBoundary.openDraftSessionId),
    evaluateExternalPatchMediationPrecondition(),
    evaluateAdoptBoundaryPrecondition(boundary),
  ];
}

function evaluateProjectConfigPrecondition(resolution: ChangeDefaultModeResolution): ChangeExecuteDefaultPrecondition {
  if (resolution.warnings.length > 0) {
    return {
      id: "project_config",
      status: "blocker",
      message: resolution.warnings.join("; "),
      ownerAction: "Fix jiproject/project.yaml so change.default_mode is either prompt or execute, then rerun doctor v1.",
    };
  }

  return {
    id: "project_config",
    status: "pass",
    message: "Project change.default_mode configuration is parseable.",
    ownerAction: "No action required.",
  };
}

function evaluateVerifyPolicyPrecondition(root: string): ChangeExecuteDefaultPrecondition {
  if (!policyFileExists(root)) {
    return {
      id: "verify_policy",
      status: "blocker",
      message: ".spec/policy.yaml is missing.",
      ownerAction: "Run npm run jispec-cli -- policy migrate to create the team verify policy before enabling execute-default.",
    };
  }

  try {
    const policy = loadVerifyPolicy(root);
    if (!policy) {
      return {
        id: "verify_policy",
        status: "blocker",
        message: ".spec/policy.yaml could not be loaded.",
        ownerAction: "Run npm run jispec-cli -- policy migrate, then review the generated policy.",
      };
    }

    const validation = validatePolicyAgainstFactsContract(policy, createFactsContract());
    if (!validation.valid) {
      return {
        id: "verify_policy",
        status: "blocker",
        message: `.spec/policy.yaml failed facts contract validation (${validation.issues.length} issue(s)).`,
        ownerAction: "Run npm run jispec-cli -- policy migrate and resolve the reported policy validation issue(s).",
      };
    }

    return {
      id: "verify_policy",
      status: "pass",
      message: ".spec/policy.yaml is present and matches the facts contract.",
      ownerAction: "No action required.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: "verify_policy",
      status: "blocker",
      message: `.spec/policy.yaml could not be validated: ${message}`,
      ownerAction: "Fix .spec/policy.yaml or regenerate it with npm run jispec-cli -- policy migrate.",
    };
  }
}

function evaluateVerifyStabilityPrecondition(
  root: string,
  openDraftSessionId?: string,
): ChangeExecuteDefaultPrecondition {
  const toolingRoot = resolveToolingRoot();
  const cliPath = path.join(toolingRoot, "tools", "jispec", "cli.ts");
  if (!fs.existsSync(cliPath)) {
    return {
      id: "verify_stability",
      status: "blocker",
      message: "JiSpec CLI entrypoint is missing, so verify stability could not be checked.",
      ownerAction: "Restore tools/jispec/cli.ts before changing the default mode.",
    };
  }

  const run = spawnSync(
    process.execPath,
    ["--import", "tsx", cliPath, "verify", "--root", root, "--json"],
    {
      cwd: toolingRoot,
      encoding: "utf-8",
      timeout: 60000,
    },
  );
  if (run.error) {
    return {
      id: "verify_stability",
      status: "blocker",
      message: `verify --json could not run: ${run.error.message}`,
      ownerAction: "Run npm run jispec-cli -- verify --json and fix the runtime error before enabling execute-default.",
    };
  }

  const parsed = parseVerifyJson(run.stdout);
  const verdict = parsed?.verdict ?? "unknown";
  const ok = parsed?.ok === true || verdict === "PASS";
  const blockingIssueCodes = (parsed?.issues ?? [])
    .filter((issue) => issue?.severity === "blocking")
    .map((issue) => issue.code)
    .filter((code): code is string => typeof code === "string");
  const governanceOnlyBlocking =
    blockingIssueCodes.length > 0 &&
    blockingIssueCodes.every((code) => EXECUTE_DEFAULT_GOVERNANCE_ONLY_BLOCKERS.has(code));
  if (run.status !== 0 || !ok) {
    if (governanceOnlyBlocking) {
      return {
        id: "verify_stability",
        status: "warning",
        message: `verify --json is failing only on governance blockers excluded from execute-default readiness (${blockingIssueCodes.join(", ")}).`,
        ownerAction: "Keep governance blockers visible in verify, but they do not block execute-default readiness for the mainline path.",
      };
    }
    if (openDraftSessionId) {
      return {
        id: "verify_stability",
        status: "warning",
        message: `verify --json is not fully stable in the presence of open bootstrap draft ${openDraftSessionId} (exit=${run.status ?? "unknown"}, verdict=${verdict}).`,
        ownerAction: `Adopt or clear the open bootstrap draft ${openDraftSessionId}, then rerun verify before switching the default.`,
      };
    }
    return {
      id: "verify_stability",
      status: "blocker",
      message: `verify --json is not stable enough for execute-default (exit=${run.status ?? "unknown"}, verdict=${verdict}).`,
      ownerAction: "Run npm run jispec-cli -- verify --json and resolve blocking verify issues before enabling execute-default.",
    };
  }

  return {
    id: "verify_stability",
    status: "pass",
    message: `verify --json is currently non-blocking (${verdict}).`,
    ownerAction: "No action required.",
  };
}

function evaluateExternalPatchMediationPrecondition(): ChangeExecuteDefaultPrecondition {
  const toolingRoot = resolveToolingRoot();
  const requiredFiles = [
    path.join(toolingRoot, "tools", "jispec", "implement", "implement-runner.ts"),
    path.join(toolingRoot, "tools", "jispec", "implement", "patch-mediation.ts"),
    path.join(toolingRoot, "tools", "jispec", "implement", "handoff-packet.ts"),
  ];
  const missingFiles = requiredFiles.filter((filePath) => !fs.existsSync(filePath));
  if (missingFiles.length > 0) {
    return {
      id: "external_patch_mediation",
      status: "blocker",
      message: `External patch mediation files are missing: ${missingFiles.map((filePath) => path.relative(toolingRoot, filePath).replace(/\\/g, "/")).join(", ")}.`,
      ownerAction: "Restore implement-runner, patch-mediation, and handoff-packet before enabling execute-default.",
    };
  }

  const snippets = [
    { file: requiredFiles[0], text: "externalPatchPath" },
    { file: requiredFiles[0], text: "patch_rejected_out_of_scope" },
    { file: requiredFiles[1], text: "validatePatchScope" },
    { file: requiredFiles[1], text: "writePatchMediationArtifact" },
    { file: requiredFiles[2], text: "generateHandoffPacket" },
    { file: requiredFiles[2], text: "nextActionOwner" },
  ];
  const missingSnippets = snippets.filter((snippet) => !fs.readFileSync(snippet.file, "utf-8").includes(snippet.text));
  if (missingSnippets.length > 0) {
    return {
      id: "external_patch_mediation",
      status: "blocker",
      message: `External patch mediation is incomplete: ${missingSnippets.map((snippet) => `${path.basename(snippet.file)}:${snippet.text}`).join(", ")}.`,
      ownerAction: "Finish external patch scope, handoff, and next-action mediation before enabling execute-default.",
    };
  }

  return {
    id: "external_patch_mediation",
    status: "pass",
    message: "External patch mediation surface is present.",
    ownerAction: "No action required.",
  };
}

function evaluateAdoptBoundaryPrecondition(boundary: ChangeExecuteDefaultBoundary): ChangeExecuteDefaultPrecondition {
  if (boundary.adoptBoundary.status === "open_draft_pause_required") {
    return {
      id: "adopt_boundary",
      status: "warning",
      message: `Open bootstrap draft ${boundary.adoptBoundary.openDraftSessionId}; strict-lane execute-default will pause at adopt.`,
      ownerAction: boundary.adoptBoundary.nextAction ?? "Run npm run jispec-cli -- adopt --interactive before relying on strict-lane execute-default.",
    };
  }

  return {
    id: "adopt_boundary",
    status: "pass",
    message: "No open bootstrap draft blocks the strict-lane adopt boundary.",
    ownerAction: "No action required.",
  };
}

function parseVerifyJson(stdout: string): VerifyReadinessPayload | null {
  try {
    const parsed = JSON.parse(stdout) as VerifyReadinessPayload;
    return parsed;
  } catch {
    return null;
  }
}

function resolveToolingRoot(): string {
  const candidates = [
    path.resolve(__dirname, "..", "..", ".."),
    process.cwd(),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "tools", "jispec", "cli.ts"))) {
      return candidate;
    }
  }
  return process.cwd();
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
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
    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
        sessionId?: string;
        status?: string;
        updatedAt?: string;
        createdAt?: string;
      };
      if (manifest.status !== "drafted" && manifest.status !== "adopting") {
        continue;
      }
      candidates.push({
        sessionId: manifest.sessionId ?? entry.name,
        updatedAt: manifest.updatedAt ?? manifest.createdAt ?? "",
      });
    } catch {
      continue;
    }
  }

  candidates.sort((left, right) =>
    `${right.updatedAt}|${right.sessionId}`.localeCompare(`${left.updatedAt}|${left.sessionId}`),
  );
  return candidates[0]?.sessionId;
}

function loadConfiguredChangeDefaultMode(root: string): {
  mode?: ChangeSessionOrchestrationMode;
  configPath?: string;
  warnings: string[];
} {
  const configPath = path.join(root, "jiproject", "project.yaml");
  if (!fs.existsSync(configPath)) {
    return { warnings: [] };
  }

  try {
    const parsed = yaml.load(fs.readFileSync(configPath, "utf-8"));
    if (!isRecord(parsed)) {
      return {
        configPath,
        warnings: ["jiproject/project.yaml is not an object; using built-in prompt default."],
      };
    }

    const change = isRecord(parsed.change) ? parsed.change : undefined;
    const rawMode = change?.default_mode ?? change?.defaultMode;
    if (rawMode === undefined) {
      return { configPath, warnings: [] };
    }

    if (rawMode !== "prompt" && rawMode !== "execute") {
      return {
        configPath,
        warnings: [`Invalid change.default_mode '${String(rawMode)}'; expected prompt or execute.`],
      };
    }

    return {
      mode: rawMode,
      configPath,
      warnings: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      configPath,
      warnings: [`Could not parse jiproject/project.yaml; using built-in prompt default. ${message}`],
    };
  }
}

function validateChangeMode(mode: ChangeSessionOrchestrationMode): void {
  if (mode !== "prompt" && mode !== "execute") {
    throw new Error(`Invalid change mode: ${mode}. Expected prompt or execute.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
