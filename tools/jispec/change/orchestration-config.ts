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
  const details: string[] = [];

  if (resolution.configPath) {
    details.push(`Project config: ${path.relative(root, resolution.configPath).replace(/\\/g, "/")}`);
  } else {
    details.push("Project config: not present");
  }

  details.push(`Default change mode: ${resolution.mode}`);
  details.push(`Mode source: ${resolution.source}`);

  if (resolution.mode === "execute") {
    details.push("Execute-default mediation is configured.");
    details.push("Strict-lane changes still stop at the adopt boundary when an open bootstrap draft exists.");
  } else {
    details.push("Execute-default mediation is not enabled; change defaults to prompt mode.");
  }

  for (const warning of resolution.warnings) {
    details.push(warning);
  }

  return {
    defaultMode: resolution.mode,
    source: resolution.source,
    configPath: resolution.configPath,
    readyForExecuteDefault: resolution.mode === "execute" && resolution.warnings.length === 0,
    warnings: resolution.warnings,
    details,
  };
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
