import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import type { ChangeSessionOrchestrationMode } from "./change-session";

export interface ChangeDefaultModeResolution {
  mode: ChangeSessionOrchestrationMode;
  source: "cli" | "project_config" | "built_in_default";
  configPath?: string;
  warnings: string[];
}

export interface ChangeExecuteDefaultReadiness {
  defaultMode: ChangeSessionOrchestrationMode;
  source: ChangeDefaultModeResolution["source"];
  configPath?: string;
  readyForExecuteDefault: boolean;
  openDraftSessionId?: string;
  warnings: string[];
  details: string[];
}

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
  const details: string[] = [];

  if (resolution.configPath) {
    details.push(`Project config: ${path.relative(root, resolution.configPath).replace(/\\/g, "/")}`);
  } else {
    details.push("Project config: not present");
  }

  details.push(`Current default: ${resolution.mode}`);
  details.push(`Default change mode: ${resolution.mode}`);
  details.push(`Mode source: ${resolution.source}`);

  const readyForExecuteDefault = resolution.mode === "execute" && resolution.warnings.length === 0;
  details.push(`Decision: ${renderExecuteDefaultDecision(resolution.mode, readyForExecuteDefault, resolution.warnings)}`);
  details.push("Guardrail: execute-default only enters implementation mediation and verify orchestration; JiSpec still does not generate business code autonomously.");
  details.push("Adopt boundary: strict-lane changes still stop before implement when an open bootstrap draft exists.");
  details.push(`Open bootstrap draft: ${openDraftSessionId ?? "none"}`);

  if (openDraftSessionId) {
    details.push(`Next action: run npm run jispec-cli -- adopt --interactive --session ${openDraftSessionId} before relying on strict-lane execute-default.`);
  } else if (resolution.mode === "execute") {
    details.push("Next action: run change without --mode when you want the project default to enter implementation mediation.");
  } else {
    details.push("Next action: keep prompt default, or set change.default_mode: execute in jiproject/project.yaml after the team accepts execute mediation as the default entry point.");
  }

  for (const warning of resolution.warnings) {
    details.push(`Blocking reason: ${warning}`);
  }

  return {
    defaultMode: resolution.mode,
    source: resolution.source,
    configPath: resolution.configPath,
    readyForExecuteDefault,
    openDraftSessionId,
    warnings: resolution.warnings,
    details,
  };
}

function renderExecuteDefaultDecision(
  mode: ChangeSessionOrchestrationMode,
  readyForExecuteDefault: boolean,
  warnings: string[],
): string {
  if (warnings.length > 0) {
    return "Do not enable execute-default until the project configuration warning(s) are fixed.";
  }
  if (readyForExecuteDefault) {
    return "Execute-default mediation is configured and ready for ordinary change calls.";
  }
  if (mode === "prompt") {
    return "Prompt remains the default; use --mode execute for explicit trials before switching the project default.";
  }
  return "Review required before changing the project default.";
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
