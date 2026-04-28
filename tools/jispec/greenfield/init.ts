import path from "node:path";
import { writeGreenfieldProjectAssets, type GreenfieldProjectAssetResult } from "./project-assets";
import { loadGreenfieldSourceDocuments, type GreenfieldInputContract } from "./source-documents";

export interface GreenfieldInitOptions {
  root: string;
  requirements?: string;
  technicalSolution?: string;
  force?: boolean;
}

export interface GreenfieldInitResult {
  root: string;
  requirements?: string;
  technicalSolution?: string;
  force: boolean;
  status: "input_contract_ready" | "input_contract_failed";
  inputContract: GreenfieldInputContract;
  writtenFiles: string[];
  skippedFiles: string[];
  createdDirectories: string[];
  nextTask: "greenfield-initialization-mvp-complete";
}

export function runGreenfieldInit(options: GreenfieldInitOptions): GreenfieldInitResult {
  const inputContract = loadGreenfieldSourceDocuments({
    requirements: options.requirements,
    technicalSolution: options.technicalSolution,
  });

  const assetResult: GreenfieldProjectAssetResult = inputContract.status === "failed"
    ? { writtenFiles: [], skippedFiles: [], createdDirectories: [] }
    : writeGreenfieldProjectAssets({
        root: options.root,
        inputContract,
        force: options.force,
      });

  return {
    root: normalizePath(path.resolve(options.root)),
    requirements: options.requirements ? normalizePath(path.resolve(options.requirements)) : undefined,
    technicalSolution: options.technicalSolution
      ? normalizePath(path.resolve(options.technicalSolution))
      : undefined,
    force: options.force === true,
    status: inputContract.status === "failed" ? "input_contract_failed" : "input_contract_ready",
    inputContract,
    writtenFiles: assetResult.writtenFiles,
    skippedFiles: assetResult.skippedFiles,
    createdDirectories: assetResult.createdDirectories,
    nextTask: "greenfield-initialization-mvp-complete",
  };
}

export function renderGreenfieldInitText(result: GreenfieldInitResult): string {
  const lines = [
    result.status === "input_contract_failed"
      ? "Greenfield init input contract failed."
      : "Greenfield init project assets written.",
    "Project boundary, contracts, behavior scenarios, initial slice queue, verify policy, and CI gate are ready for review.",
    "",
    `Root: ${result.root}`,
    `Requirements: ${result.requirements ?? "not provided"}`,
    `Technical solution: ${result.technicalSolution ?? "not provided"}`,
    `Input mode: ${result.inputContract.mode}`,
    `Input status: ${result.inputContract.status}`,
    `Force: ${result.force ? "yes" : "no"}`,
    `Next task: ${result.nextTask}`,
  ];

  if (result.writtenFiles.length > 0) {
    lines.push("", "Written files:");
    lines.push(...result.writtenFiles.map((filePath) => `- ${filePath}`));
  }

  if (result.skippedFiles.length > 0) {
    lines.push("", "Skipped existing files:");
    lines.push(...result.skippedFiles.map((filePath) => `- ${filePath}`));
  }

  if (result.inputContract.blockingIssues.length > 0) {
    lines.push("", "Blocking issues:");
    lines.push(...result.inputContract.blockingIssues.map((issue) => `- ${issue}`));
  }

  if (result.inputContract.warnings.length > 0) {
    lines.push("", "Warnings:");
    lines.push(...result.inputContract.warnings.map((warning) => `- ${warning}`));
  }

  if (result.inputContract.openDecisions.length > 0) {
    lines.push("", "Open decisions:");
    lines.push(...result.inputContract.openDecisions.map((decision) => `- ${decision}`));
  }

  return lines.join("\n");
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
