/**
 * Test runner for implement FSM.
 * Executes test commands and parses results.
 */

import { execSync } from "node:child_process";

export interface TestResult {
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
  duration: number;
}

export interface TestRunOptions {
  cwd: string;
  timeout?: number;
  env?: Record<string, string>;
}

/**
 * Run a test command and return the result.
 */
export function runTestCommand(
  command: string,
  options: TestRunOptions,
): TestResult {
  const startTime = Date.now();
  const timeout = options.timeout || 60000; // Default 60s timeout

  try {
    const stdout = execSync(command, {
      cwd: options.cwd,
      encoding: "utf-8",
      timeout,
      env: { ...process.env, ...options.env },
      stdio: "pipe",
    });

    const duration = Date.now() - startTime;

    return {
      passed: true,
      exitCode: 0,
      stdout,
      stderr: "",
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;

    // execSync throws on non-zero exit code
    return {
      passed: false,
      exitCode: error.status || 1,
      stdout: error.stdout?.toString() || "",
      stderr: error.stderr?.toString() || "",
      error: error.message,
      duration,
    };
  }
}

/**
 * Extract error message from test output.
 */
export function extractErrorMessage(result: TestResult): string {
  if (result.passed) {
    return "";
  }

  // Try stderr first
  if (result.stderr && result.stderr.trim()) {
    return truncateOutput(result.stderr, 500);
  }

  // Then stdout
  if (result.stdout && result.stdout.trim()) {
    return truncateOutput(result.stdout, 500);
  }

  // Fallback to error message
  return result.error || "Test failed with no output";
}

/**
 * Truncate output to max length.
 */
function truncateOutput(output: string, maxLength: number): string {
  if (output.length <= maxLength) {
    return output;
  }

  // Try to truncate at line boundary
  const truncated = output.substring(0, maxLength);
  const lastNewline = truncated.lastIndexOf("\n");

  if (lastNewline > maxLength * 0.8) {
    return truncated.substring(0, lastNewline) + "\n... (truncated)";
  }

  return truncated + "... (truncated)";
}

/**
 * Format test result for display.
 */
export function formatTestResult(result: TestResult): string {
  const status = result.passed ? "PASSED" : "FAILED";
  const lines = [
    `Test ${status} (exit code: ${result.exitCode}, duration: ${result.duration}ms)`,
  ];

  if (!result.passed) {
    const errorMsg = extractErrorMessage(result);
    if (errorMsg) {
      lines.push("");
      lines.push("Error:");
      lines.push(errorMsg);
    }
  }

  return lines.join("\n");
}
