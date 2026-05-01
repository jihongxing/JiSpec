import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import {
  CONSOLE_READ_MODEL_ARTIFACTS,
  getConsoleReadModelContract,
  type ConsoleReadModelArtifact,
  type ConsoleReadModelFormat,
  type ConsoleReadModelFreshness,
  type ConsoleReadModelStability,
} from "./read-model-contract";

export type ConsoleSnapshotArtifactStatus = "available" | "not_available_yet" | "unreadable" | "invalid";

export interface ConsoleSnapshotArtifactInstance {
  relativePath: string;
  status: Exclude<ConsoleSnapshotArtifactStatus, "not_available_yet">;
  sizeBytes?: number;
  modifiedAt?: string;
  contentHash?: string;
  data?: unknown;
  displayOnlyText?: string;
  error?: string;
}

export interface ConsoleSnapshotArtifact {
  id: string;
  pathPattern: string;
  producer: string;
  format: ConsoleReadModelFormat;
  stability: ConsoleReadModelStability;
  freshness: ConsoleReadModelFreshness;
  machineReadable: boolean;
  parseMarkdown: boolean;
  sourceUploadRequired: boolean;
  status: ConsoleSnapshotArtifactStatus;
  instances: ConsoleSnapshotArtifactInstance[];
  message?: string;
}

export interface ConsoleLocalSnapshot {
  version: 1;
  root: string;
  createdAt: string;
  boundary: {
    readOnly: true;
    replacesCliGate: false;
    sourceUploadRequired: false;
    localArtifactsAreSourceOfTruth: true;
    readsOnlyDeclaredJiSpecArtifacts: true;
    evaluatesPolicy: false;
    overridesVerify: false;
    synthesizesGateResults: false;
    markdownIsMachineApi: false;
  };
  artifacts: ConsoleSnapshotArtifact[];
  summary: {
    totalArtifacts: number;
    availableArtifacts: number;
    missingArtifacts: number;
    invalidArtifacts: number;
    unreadableArtifacts: number;
  };
}

export function collectConsoleLocalSnapshot(rootInput: string): ConsoleLocalSnapshot {
  const root = path.resolve(rootInput);
  const artifacts = CONSOLE_READ_MODEL_ARTIFACTS.map((artifact) => readSnapshotArtifact(root, artifact));
  const summary = artifacts.reduce(
    (acc, artifact) => {
      acc.totalArtifacts++;
      if (artifact.status === "available") {
        acc.availableArtifacts++;
      } else if (artifact.status === "not_available_yet") {
        acc.missingArtifacts++;
      } else if (artifact.status === "invalid") {
        acc.invalidArtifacts++;
      } else if (artifact.status === "unreadable") {
        acc.unreadableArtifacts++;
      }
      return acc;
    },
    {
      totalArtifacts: 0,
      availableArtifacts: 0,
      missingArtifacts: 0,
      invalidArtifacts: 0,
      unreadableArtifacts: 0,
    },
  );

  return {
    version: 1,
    root,
    createdAt: new Date().toISOString(),
    boundary: {
      ...getConsoleReadModelContract().boundary,
      readsOnlyDeclaredJiSpecArtifacts: true,
      evaluatesPolicy: false,
      overridesVerify: false,
      synthesizesGateResults: false,
      markdownIsMachineApi: false,
    },
    artifacts,
    summary,
  };
}

function readSnapshotArtifact(root: string, artifact: ConsoleReadModelArtifact): ConsoleSnapshotArtifact {
  const relativePaths = resolveArtifactRelativePaths(root, artifact.pathPattern);
  const base = {
    id: artifact.id,
    pathPattern: artifact.pathPattern,
    producer: artifact.producer,
    format: artifact.format,
    stability: artifact.stability,
    freshness: artifact.freshness,
    machineReadable: artifact.machineReadable,
    parseMarkdown: artifact.parseMarkdown,
    sourceUploadRequired: artifact.sourceUploadRequired,
  };

  if (relativePaths.length === 0) {
    return {
      ...base,
      status: "not_available_yet",
      instances: [],
      message: "Artifact not available yet. Run the producing JiSpec command to refresh it.",
    };
  }

  const instances = relativePaths.map((relativePath) => readArtifactInstance(root, relativePath, artifact));
  const status = summarizeInstanceStatuses(instances);

  return {
    ...base,
    status,
    instances,
  };
}

function resolveArtifactRelativePaths(root: string, pathPattern: string): string[] {
  if (!pathPattern.includes("*") && !pathPattern.includes("<")) {
    return fs.existsSync(path.join(root, pathPattern)) ? [pathPattern] : [];
  }

  if (pathPattern === ".spec/waivers/*.json") {
    return listDirectFiles(root, ".spec/waivers", ".json");
  }

  if (pathPattern === ".spec/spec-debt/<session-id>/*.json") {
    return listNestedFiles(root, ".spec/spec-debt", ".json", 2)
      .filter((relativePath) => relativePath !== ".spec/spec-debt/ledger.yaml");
  }

  if (pathPattern === ".spec/baselines/releases/<version>.yaml") {
    return listDirectFiles(root, ".spec/baselines/releases", ".yaml");
  }

  if (pathPattern === ".spec/releases/compare/<from>-to-<to>/compare-report.json") {
    return listCompareReports(root, "compare-report.json");
  }

  if (pathPattern === ".spec/releases/compare/<from>-to-<to>/compare-report.md") {
    return listCompareReports(root, "compare-report.md");
  }

  return [];
}

function readArtifactInstance(
  root: string,
  relativePath: string,
  artifact: ConsoleReadModelArtifact,
): ConsoleSnapshotArtifactInstance {
  const absolutePath = path.join(root, relativePath);

  try {
    const stat = fs.statSync(absolutePath);
    const content = fs.readFileSync(absolutePath, "utf-8");
    const base = {
      relativePath,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      contentHash: hashContent(content),
    };

    if (artifact.format === "markdown") {
      return {
        ...base,
        status: "available",
        displayOnlyText: content,
      };
    }

    return {
      ...base,
      status: "available",
      data: parseMachineReadableArtifact(content, artifact.format),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      relativePath,
      status: isParseError(error) ? "invalid" : "unreadable",
      error: message,
    };
  }
}

function parseMachineReadableArtifact(content: string, format: ConsoleReadModelFormat): unknown {
  if (format === "json") {
    return JSON.parse(content);
  }

  if (format === "yaml") {
    return yaml.load(content);
  }

  if (format === "lock") {
    return content;
  }

  return undefined;
}

function summarizeInstanceStatuses(instances: ConsoleSnapshotArtifactInstance[]): ConsoleSnapshotArtifactStatus {
  if (instances.some((instance) => instance.status === "invalid")) {
    return "invalid";
  }

  if (instances.some((instance) => instance.status === "unreadable")) {
    return "unreadable";
  }

  return "available";
}

function listDirectFiles(root: string, relativeDir: string, extension: string): string[] {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) {
    return [];
  }

  return fs.readdirSync(absoluteDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => normalizeRelativePath(path.posix.join(relativeDir, entry.name)))
    .sort((left, right) => left.localeCompare(right));
}

function listNestedFiles(root: string, relativeDir: string, extension: string, maxDepth: number): string[] {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir) || maxDepth < 1) {
    return [];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const childRelativePath = normalizeRelativePath(path.posix.join(relativeDir, entry.name));
    const childAbsolutePath = path.join(root, childRelativePath);
    if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(childRelativePath);
    } else if (entry.isDirectory() && maxDepth > 1) {
      files.push(...listNestedFiles(root, childRelativePath, extension, maxDepth - 1));
    } else if (entry.isDirectory() && maxDepth === 1) {
      for (const child of fs.readdirSync(childAbsolutePath, { withFileTypes: true })) {
        if (child.isFile() && child.name.endsWith(extension)) {
          files.push(normalizeRelativePath(path.posix.join(childRelativePath, child.name)));
        }
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function listCompareReports(root: string, filename: string): string[] {
  const compareRoot = path.join(root, ".spec", "releases", "compare");
  if (!fs.existsSync(compareRoot)) {
    return [];
  }

  return fs.readdirSync(compareRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => normalizeRelativePath(path.posix.join(".spec/releases/compare", entry.name, filename)))
    .filter((relativePath) => fs.existsSync(path.join(root, relativePath)))
    .sort((left, right) => left.localeCompare(right));
}

function normalizeRelativePath(candidate: string): string {
  return candidate.replace(/\\/g, "/");
}

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function isParseError(error: unknown): boolean {
  return error instanceof SyntaxError || error instanceof yaml.YAMLException;
}
