import fs from "node:fs";
import path from "node:path";
import { appendAuditEvent } from "../audit/event-ledger";
import { readChangeSession } from "../change/change-session";
import {
  collectGreenfieldSourceEvolutionDiff,
  renderGreenfieldSourceEvolutionMarkdown,
} from "./provenance-drift";
import {
  compareGreenfieldSourceManifests,
  loadGreenfieldSourceDocuments,
  loadGreenfieldSourceManifest,
  loadResolvedGreenfieldSourceManifest,
  normalizePath,
  renderGreenfieldSourceDocumentsManifest,
  type GreenfieldSourceSnapshotComparison,
} from "./source-documents";

const DEFAULT_REQUIREMENTS_PATH = "docs/input/requirements.md";
const DEFAULT_TECHNICAL_SOLUTION_PATH = "docs/input/technical-solution.md";

export interface GreenfieldSourceRefreshOptions {
  root: string;
  change?: string;
  requirements?: string;
  technicalSolution?: string;
  generatedAt?: string;
}

export interface GreenfieldSourceRefreshResult {
  root: string;
  changeId: string;
  deltaDir: string;
  activeSnapshotPath: string;
  proposedSnapshotPath: string;
  sourceEvolutionPath: string;
  sourceEvolutionMarkdownPath: string;
  requirementsPath: string;
  technicalSolutionPath?: string;
  comparison: GreenfieldSourceSnapshotComparison;
  proposedSnapshotId?: string;
  nextCommand: string;
}

export function runGreenfieldSourceRefresh(options: GreenfieldSourceRefreshOptions): GreenfieldSourceRefreshResult {
  const root = path.resolve(options.root);
  const changeId = resolveChangeId(root, options.change);
  const deltaDir = path.join(root, ".spec", "deltas", changeId);
  fs.mkdirSync(deltaDir, { recursive: true });

  const resolvedActiveManifest = loadResolvedGreenfieldSourceManifest(root);
  if (!resolvedActiveManifest) {
    throw new Error("No active Greenfield source snapshot found at .spec/greenfield/source-documents.active.yaml or .spec/greenfield/source-documents.yaml.");
  }

  const requirementsPath = path.resolve(options.requirements ?? path.join(root, DEFAULT_REQUIREMENTS_PATH));
  const technicalSolutionCandidate = options.technicalSolution ?? path.join(root, DEFAULT_TECHNICAL_SOLUTION_PATH);
  const technicalSolutionPath = technicalSolutionCandidate ? path.resolve(technicalSolutionCandidate) : undefined;
  const inputContract = loadGreenfieldSourceDocuments({
    requirements: requirementsPath,
    technicalSolution: technicalSolutionPath && fs.existsSync(technicalSolutionPath) ? technicalSolutionPath : undefined,
  });
  if (inputContract.status === "failed") {
    throw new Error(`Source refresh failed because the edited source documents are invalid: ${inputContract.blockingIssues.join(" ")}`);
  }

  const proposedSnapshotPath = path.join(deltaDir, "source-documents.proposed.yaml");
  const proposedManifestText = renderGreenfieldSourceDocumentsManifest(inputContract, {
    root,
    requirementsPath,
    technicalSolutionPath: technicalSolutionPath && fs.existsSync(technicalSolutionPath) ? technicalSolutionPath : undefined,
    snapshotStatus: "proposed",
    generatedAt: options.generatedAt,
  });
  fs.writeFileSync(proposedSnapshotPath, proposedManifestText, "utf-8");

  const proposedManifest = loadGreenfieldSourceManifest(proposedSnapshotPath);
  if (!proposedManifest) {
    throw new Error(`Failed to parse proposed source snapshot at ${normalizePath(proposedSnapshotPath)}.`);
  }
  const sourceEvolutionPath = path.join(deltaDir, "source-evolution.json");
  const sourceEvolutionMarkdownPath = path.join(deltaDir, "source-evolution.md");
  const sourceEvolution = collectGreenfieldSourceEvolutionDiff(root, {
    changeId,
    targetManifestPath: proposedSnapshotPath,
    generatedAt: options.generatedAt,
  });
  fs.writeFileSync(sourceEvolutionPath, `${JSON.stringify(sourceEvolution ?? {
    version: 1,
    active_manifest_path: resolvedActiveManifest.manifestPath,
    target_manifest_path: normalizePath(proposedSnapshotPath),
    target_origin: "proposed_snapshot",
    generated_at: options.generatedAt ?? new Date().toISOString(),
    compatibility_mode: resolvedActiveManifest.compatibilityMode,
    summary: {
      changed: false,
      total: 0,
      added: 0,
      modified: 0,
      deprecated: 0,
      split: 0,
      merged: 0,
      reanchored: 0,
    },
    items: [],
  }, null, 2)}\n`, "utf-8");
  fs.writeFileSync(sourceEvolutionMarkdownPath, sourceEvolution ? renderGreenfieldSourceEvolutionMarkdown(sourceEvolution) : "# Source Evolution\n\n- None.\n", "utf-8");

  appendAuditEvent(root, {
    type: "source_refresh",
    sourceArtifact: {
      kind: "greenfield-source-refresh",
      path: normalizePath(sourceEvolutionPath),
    },
    affectedContracts: [
      normalizePath(proposedSnapshotPath),
      normalizePath(sourceEvolutionPath),
      normalizePath(sourceEvolutionMarkdownPath),
    ],
    details: {
      changeId,
      comparison: resultComparisonSummary(resolvedActiveManifest.manifest, proposedManifest),
    },
  });

  return {
    root: normalizePath(root),
    changeId,
    deltaDir: normalizePath(deltaDir),
    activeSnapshotPath: resolvedActiveManifest.manifestPath,
    proposedSnapshotPath: normalizePath(proposedSnapshotPath),
    sourceEvolutionPath: normalizePath(sourceEvolutionPath),
    sourceEvolutionMarkdownPath: normalizePath(sourceEvolutionMarkdownPath),
    requirementsPath: normalizePath(requirementsPath),
    technicalSolutionPath: technicalSolutionPath && fs.existsSync(technicalSolutionPath) ? normalizePath(technicalSolutionPath) : undefined,
    comparison: compareGreenfieldSourceManifests(resolvedActiveManifest.manifest, proposedManifest),
    proposedSnapshotId: readSnapshotId(proposedManifest),
    nextCommand: `jispec-cli source diff --root ${normalizePath(root)} --change ${changeId}`,
  };
}

function resultComparisonSummary(
  activeManifest: Record<string, unknown>,
  proposedManifest: Record<string, unknown>,
): GreenfieldSourceSnapshotComparison {
  return compareGreenfieldSourceManifests(activeManifest, proposedManifest);
}

export function renderGreenfieldSourceRefreshText(result: GreenfieldSourceRefreshResult): string {
  const lines = [
    "Greenfield source snapshot refreshed.",
    "",
    `Root: ${result.root}`,
    `Change ID: ${result.changeId}`,
    `Active snapshot: ${result.activeSnapshotPath}`,
    `Proposed snapshot: ${result.proposedSnapshotPath}`,
    `Source evolution: ${result.sourceEvolutionPath}`,
    `Source evolution summary: ${result.sourceEvolutionMarkdownPath}`,
    `Requirements: ${result.requirementsPath}`,
    `Technical solution: ${result.technicalSolutionPath ?? "not provided"}`,
    `Changed: ${result.comparison.changed ? "yes" : "no"}`,
    `Changed documents: ${result.comparison.documentChecksumChanged.length > 0 ? result.comparison.documentChecksumChanged.join(", ") : "none"}`,
    `Added requirement IDs: ${result.comparison.addedRequirementIds.length > 0 ? result.comparison.addedRequirementIds.join(", ") : "none"}`,
    `Removed requirement IDs: ${result.comparison.removedRequirementIds.length > 0 ? result.comparison.removedRequirementIds.join(", ") : "none"}`,
    `Changed requirement IDs: ${result.comparison.changedRequirementIds.length > 0 ? result.comparison.changedRequirementIds.join(", ") : "none"}`,
    `Next command: ${result.nextCommand}`,
  ];

  return lines.join("\n");
}

function resolveChangeId(root: string, requestedChange: string | undefined): string {
  if (requestedChange && requestedChange !== "latest") {
    return requestedChange;
  }

  const activeSession = readChangeSession(root);
  const activeChangeId = activeSession?.specDelta?.changeId;
  if (typeof activeChangeId === "string" && activeChangeId.length > 0) {
    return activeChangeId;
  }

  const deltasRoot = path.join(root, ".spec", "deltas");
  if (!fs.existsSync(deltasRoot)) {
    throw new Error("No change delta workspace exists yet. Run `jispec-cli change \"<summary>\"` before `jispec-cli source refresh`.");
  }

  const candidates = fs.readdirSync(deltasRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      changeId: entry.name,
      mtimeMs: fs.statSync(path.join(deltasRoot, entry.name)).mtimeMs,
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.changeId.localeCompare(left.changeId));

  const latest = candidates[0]?.changeId;
  if (!latest) {
    throw new Error("No change delta workspace exists yet. Run `jispec-cli change \"<summary>\"` before `jispec-cli source refresh`.");
  }
  return latest;
}

function readSnapshotId(manifest: Record<string, unknown>): string | undefined {
  const snapshot = manifest.snapshot;
  if (typeof snapshot === "object" && snapshot !== null && !Array.isArray(snapshot)) {
    const id = (snapshot as { id?: unknown }).id;
    if (typeof id === "string" && id.length > 0) {
      return id;
    }
  }
  return undefined;
}
