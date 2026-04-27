/**
 * Context pruning for implement FSM.
 * Builds deterministic context bundles for each iteration.
 */

import path from "node:path";
import fs from "node:fs";
import type { ChangeSession } from "../change/change-session";
import type { TestResult } from "./test-runner";
import type { EpisodeMemory } from "./episode-memory";
import { getRecentHypotheses, getRejectedPaths } from "./episode-memory";

export interface ContextBundle {
  immutablePack: {
    changeIntent: string;
    testCommand: string;
    changedPaths: string[];
    laneDecision: string;
  };
  workingSet: {
    files: Array<{ path: string; content: string }>;
    totalLines: number;
  };
  failurePack: {
    lastTestOutput: string;
    lastErrorMessage?: string;
  };
  episodeMemory: {
    attemptedHypotheses: string[];
    rejectedPaths: string[];
  };
}

const MAX_WORKING_SET_LINES = 5000;
const MAX_TEST_OUTPUT_LINES = 1000;

/**
 * Build context bundle for current iteration.
 */
export function buildContextBundle(
  root: string,
  session: ChangeSession,
  lastTestResult: TestResult | null,
  episodeMemory?: EpisodeMemory,
): ContextBundle {
  const immutablePack = {
    changeIntent: session.summary,
    testCommand: session.nextCommands[0]?.command || "npm test",
    changedPaths: session.changedPaths.map((cp) => cp.path),
    laneDecision: session.laneDecision.lane,
  };

  const workingSet = buildWorkingSet(root, session);
  const failurePack = buildFailurePack(lastTestResult);
  const episodeMemoryPack = buildEpisodeMemoryPack(episodeMemory);

  return {
    immutablePack,
    workingSet,
    failurePack,
    episodeMemory: episodeMemoryPack,
  };
}

/**
 * Build working set from changed files.
 */
function buildWorkingSet(
  root: string,
  session: ChangeSession,
): { files: Array<{ path: string; content: string }>; totalLines: number } {
  const files: Array<{ path: string; content: string }> = [];
  let totalLines = 0;

  for (const changedPath of session.changedPaths) {
    if (totalLines >= MAX_WORKING_SET_LINES) {
      break;
    }

    const fullPath = path.join(root, changedPath.path);

    // Skip if file doesn't exist (might be deleted)
    if (!fs.existsSync(fullPath)) {
      continue;
    }

    // Skip if not a file
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) {
      continue;
    }

    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split("\n").length;

      // Skip if adding this file would exceed limit
      if (totalLines + lines > MAX_WORKING_SET_LINES) {
        continue;
      }

      files.push({
        path: changedPath.path,
        content,
      });

      totalLines += lines;
    } catch (error) {
      // Skip files that can't be read
      continue;
    }
  }

  return { files, totalLines };
}

/**
 * Build failure pack from last test result.
 */
function buildFailurePack(
  lastTestResult: TestResult | null,
): { lastTestOutput: string; lastErrorMessage?: string } {
  if (!lastTestResult) {
    return {
      lastTestOutput: "",
    };
  }

  const output = lastTestResult.passed
    ? lastTestResult.stdout
    : lastTestResult.stderr || lastTestResult.stdout;

  const truncated = truncateOutput(output, MAX_TEST_OUTPUT_LINES);

  return {
    lastTestOutput: truncated,
    lastErrorMessage: lastTestResult.passed ? undefined : lastTestResult.error,
  };
}

/**
 * Truncate output to max lines.
 */
function truncateOutput(output: string, maxLines: number): string {
  if (!output) {
    return "";
  }

  const lines = output.split("\n");
  if (lines.length <= maxLines) {
    return output;
  }

  return lines.slice(0, maxLines).join("\n") + "\n... (truncated)";
}

/**
 * Build episode memory pack.
 */
function buildEpisodeMemoryPack(
  episodeMemory?: EpisodeMemory,
): { attemptedHypotheses: string[]; rejectedPaths: string[] } {
  if (!episodeMemory) {
    return {
      attemptedHypotheses: [],
      rejectedPaths: [],
    };
  }

  return {
    attemptedHypotheses: getRecentHypotheses(episodeMemory, 5),
    rejectedPaths: getRejectedPaths(episodeMemory),
  };
}

/**
 * Format context bundle as text for LLM prompt.
 */
export function formatContextBundle(bundle: ContextBundle): string {
  const sections: string[] = [];

  // Immutable pack
  sections.push("=== Change Intent ===");
  sections.push(bundle.immutablePack.changeIntent);
  sections.push("");
  sections.push(`Test command: ${bundle.immutablePack.testCommand}`);
  sections.push(`Lane: ${bundle.immutablePack.laneDecision}`);
  sections.push("");

  // Working set
  sections.push("=== Working Set ===");
  sections.push(`Files: ${bundle.workingSet.files.length}`);
  sections.push(`Total lines: ${bundle.workingSet.totalLines}`);
  sections.push("");

  for (const file of bundle.workingSet.files) {
    sections.push(`--- ${file.path} ---`);
    sections.push(file.content);
    sections.push("");
  }

  // Failure pack
  if (bundle.failurePack.lastTestOutput) {
    sections.push("=== Last Test Output ===");
    sections.push(bundle.failurePack.lastTestOutput);
    sections.push("");
  }

  if (bundle.failurePack.lastErrorMessage) {
    sections.push("=== Last Error ===");
    sections.push(bundle.failurePack.lastErrorMessage);
    sections.push("");
  }

  // Episode memory
  if (bundle.episodeMemory.attemptedHypotheses.length > 0) {
    sections.push("=== Attempted Hypotheses ===");
    for (const hypothesis of bundle.episodeMemory.attemptedHypotheses) {
      sections.push(`- ${hypothesis}`);
    }
    sections.push("");
  }

  if (bundle.episodeMemory.rejectedPaths.length > 0) {
    sections.push("=== Rejected Paths ===");
    for (const path of bundle.episodeMemory.rejectedPaths) {
      sections.push(`- ${path}`);
    }
    sections.push("");
  }

  return sections.join("\n");
}
