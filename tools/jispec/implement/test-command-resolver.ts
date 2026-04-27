/**
 * Test command resolver for implement FSM.
 * Resolves test command from multiple sources with fallback chain.
 */

import path from "node:path";
import fs from "node:fs";
import type { ChangeSession } from "../change/change-session";

export interface TestCommandResolution {
  command: string;
  source: "explicit" | "session_hint" | "package_json" | "default";
  description?: string;
}

/**
 * Resolve test command with fallback chain:
 * 1. Explicit option (highest priority)
 * 2. Session hint (from nextCommands)
 * 3. package.json test script
 * 4. Default "npm test"
 */
export function resolveTestCommand(
  root: string,
  session: ChangeSession,
  explicitCommand?: string,
): TestCommandResolution {
  // Priority 1: Explicit option
  if (explicitCommand) {
    return {
      command: explicitCommand,
      source: "explicit",
      description: "Provided via --test-command option",
    };
  }

  // Priority 2: Session hint
  const sessionCommand = extractTestCommandFromSession(session);
  if (sessionCommand) {
    return {
      command: sessionCommand.command,
      source: "session_hint",
      description: sessionCommand.description,
    };
  }

  // Priority 3: package.json
  const packageCommand = extractTestCommandFromPackageJson(root);
  if (packageCommand) {
    return {
      command: packageCommand,
      source: "package_json",
      description: "From package.json scripts.test",
    };
  }

  // Priority 4: Default
  return {
    command: "npm test",
    source: "default",
    description: "Default test command",
  };
}

/**
 * Extract test command from session hints.
 */
export function extractTestCommandFromSession(
  session: ChangeSession,
): { command: string; description?: string } | null {
  // Look for verify command
  const verifyCommand = session.nextCommands.find((cmd) =>
    cmd.command.includes("verify") || cmd.command.includes("test"),
  );

  if (verifyCommand) {
    return {
      command: verifyCommand.command,
      description: verifyCommand.description,
    };
  }

  return null;
}

/**
 * Extract test command from package.json.
 */
export function extractTestCommandFromPackageJson(root: string): string | null {
  const packageJsonPath = path.join(root, "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(content);

    if (packageJson.scripts?.test) {
      return `npm test`;
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Validate test command.
 */
export function validateTestCommand(command: string): {
  valid: boolean;
  reason?: string;
} {
  if (!command || command.trim().length === 0) {
    return {
      valid: false,
      reason: "Test command cannot be empty",
    };
  }

  // Check for dangerous commands
  const dangerous = ["rm ", "del ", "format ", "mkfs"];
  for (const cmd of dangerous) {
    if (command.includes(cmd)) {
      return {
        valid: false,
        reason: `Test command contains dangerous operation: ${cmd}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Describe test command resolution.
 */
export function describeTestCommand(resolution: TestCommandResolution): string {
  const lines: string[] = [];

  lines.push(`Test command: ${resolution.command}`);
  lines.push(`Source: ${resolution.source}`);

  if (resolution.description) {
    lines.push(`Description: ${resolution.description}`);
  }

  return lines.join("\n");
}
