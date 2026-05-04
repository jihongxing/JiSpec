import fs from "node:fs";
import path from "node:path";
import { compareGreenfieldSourceManifests, loadGreenfieldSourceManifest, loadResolvedGreenfieldSourceManifest, normalizePath } from "./source-documents";
import type { GreenfieldSourceEvolutionDiff, GreenfieldSourceEvolutionItem } from "./provenance-drift";
import { runGreenfieldSourceReviewList, type GreenfieldSourceReviewListItem } from "./source-governance";

export type GreenfieldSourceDiffSectionKind =
  | "added"
  | "modified"
  | "deprecated"
  | "split"
  | "merged"
  | "reanchored";

export interface GreenfieldSourceDiffItem extends GreenfieldSourceReviewListItem {
  subject: string;
  predecessorIds: string[];
  successorIds: string[];
}

export interface GreenfieldSourceDiffSection {
  kind: GreenfieldSourceDiffSectionKind;
  label: string;
  count: number;
  blockingOpenCount: number;
  items: GreenfieldSourceDiffItem[];
}

export interface GreenfieldSourceDiffResult {
  root: string;
  changeId: string;
  activeSnapshotPath: string;
  proposedSnapshotPath?: string;
  sourceEvolutionPath: string;
  sourceReviewPath: string;
  activeSnapshotId?: string;
  proposedSnapshotId?: string;
  changed: boolean;
  total: number;
  blockingOpenCount: number;
  counts: Record<GreenfieldSourceDiffSectionKind, number>;
  sections: GreenfieldSourceDiffSection[];
  nextCommands: string[];
}

const SECTION_ORDER: GreenfieldSourceDiffSectionKind[] = [
  "added",
  "modified",
  "deprecated",
  "split",
  "merged",
  "reanchored",
];

export function runGreenfieldSourceDiff(rootInput: string, change?: string): GreenfieldSourceDiffResult {
  const root = path.resolve(rootInput);
  const reviewList = runGreenfieldSourceReviewList(root, change);
  const activeManifestRef = loadResolvedGreenfieldSourceManifest(root);
  if (!activeManifestRef) {
    throw new Error("No active Greenfield source snapshot found. Run Greenfield init first.");
  }

  const sourceEvolutionPath = path.join(root, reviewList.sourceEvolutionPath);
  const diff = loadSourceEvolutionDiff(sourceEvolutionPath);
  if (!diff) {
    throw new Error(`Source evolution diff is missing: ${normalizePath(sourceEvolutionPath)}.`);
  }

  const proposedSnapshotPath = reviewList.proposedSnapshotPath
    ? path.join(root, reviewList.proposedSnapshotPath)
    : undefined;
  const proposedManifest = proposedSnapshotPath ? loadGreenfieldSourceManifest(proposedSnapshotPath) : undefined;
  const comparison = proposedManifest
    ? compareGreenfieldSourceManifests(activeManifestRef.manifest, proposedManifest)
    : undefined;

  const diffById = new Map(diff.items.map((item) => [item.evolution_id, item]));
  const sections = SECTION_ORDER.map((kind) => {
    const items = reviewList.items
      .filter((item) => item.evolutionKind === kind)
      .map((item) => toSourceDiffItem(item, diffById.get(item.evolutionId)))
      .sort((left, right) =>
        `${left.effectiveStatus}|${left.severity}|${left.subject}`.localeCompare(
          `${right.effectiveStatus}|${right.severity}|${right.subject}`,
        ),
      );

    return {
      kind,
      label: formatSectionLabel(kind),
      count: items.length,
      blockingOpenCount: items.filter((item) => item.severity === "blocking" && item.effectiveStatus === "proposed").length,
      items,
    } satisfies GreenfieldSourceDiffSection;
  });

  return {
    root: normalizePath(root),
    changeId: reviewList.changeId,
    activeSnapshotPath: activeManifestRef.manifestPath,
    proposedSnapshotPath: proposedSnapshotPath ? normalizePath(proposedSnapshotPath) : reviewList.proposedSnapshotPath,
    sourceEvolutionPath: reviewList.sourceEvolutionPath,
    sourceReviewPath: reviewList.sourceReviewPath,
    activeSnapshotId: readSnapshotId(activeManifestRef.manifest),
    proposedSnapshotId: proposedManifest ? readSnapshotId(proposedManifest) : undefined,
    changed: comparison?.changed ?? diff.summary.changed,
    total: reviewList.total,
    blockingOpenCount: reviewList.blockingOpenCount,
    counts: {
      added: diff.summary.added,
      modified: diff.summary.modified,
      deprecated: diff.summary.deprecated,
      split: diff.summary.split,
      merged: diff.summary.merged,
      reanchored: diff.summary.reanchored,
    },
    sections,
    nextCommands: [
      `jispec-cli source review list --root ${normalizePath(root)} --change ${reviewList.changeId}`,
      `jispec-cli source review adopt <itemId> --root ${normalizePath(root)} --change ${reviewList.changeId}`,
      `jispec-cli source review reject <itemId> --root ${normalizePath(root)} --change ${reviewList.changeId} --reason "<reason>"`,
      `jispec-cli source review defer <itemId> --root ${normalizePath(root)} --change ${reviewList.changeId} --owner <owner> --reason "<reason>"`,
      `jispec-cli source review waive <itemId> --root ${normalizePath(root)} --change ${reviewList.changeId} --owner <owner> --reason "<reason>"`,
      `jispec-cli source adopt --root ${normalizePath(root)} --change ${reviewList.changeId}`,
    ],
  };
}

export function renderGreenfieldSourceDiffText(result: GreenfieldSourceDiffResult): string {
  const lines = [
    "Greenfield Source Diff",
    `Root: ${result.root}`,
    `Change ID: ${result.changeId}`,
    `Active snapshot: ${result.activeSnapshotPath}`,
    `Proposed snapshot: ${result.proposedSnapshotPath ?? "not available"}`,
    `Source evolution: ${result.sourceEvolutionPath}`,
    `Source review: ${result.sourceReviewPath}`,
    `Changed: ${result.changed ? "yes" : "no"}`,
    `Blocking open: ${result.blockingOpenCount}`,
    "",
    "Counts:",
    ...SECTION_ORDER.map((kind) => `- ${kind}: ${result.counts[kind]}`),
    "",
  ];

  if (result.total === 0) {
    lines.push("- No source evolution items.");
  } else {
    for (const section of result.sections) {
      if (section.count === 0) {
        continue;
      }
      lines.push(`${section.label}: ${section.count}`);
      for (const item of section.items) {
        lines.push(`- ${item.subject} [${item.effectiveStatus}, ${item.severity}]: ${item.summary}`);
      }
      lines.push("");
    }
  }

  lines.push("Next:");
  lines.push(...result.nextCommands.map((command) => `- ${command}`));
  return lines.join("\n");
}

function toSourceDiffItem(
  item: GreenfieldSourceReviewListItem,
  evolution: GreenfieldSourceEvolutionItem | undefined,
): GreenfieldSourceDiffItem {
  const predecessorIds = evolution?.predecessor_ids ?? [];
  const successorIds = evolution?.successor_ids ?? [];

  return {
    ...item,
    subject: describeSubject(item, predecessorIds, successorIds),
    predecessorIds: [...predecessorIds],
    successorIds: [...successorIds],
  };
}

function describeSubject(
  item: GreenfieldSourceReviewListItem,
  predecessorIds: string[],
  successorIds: string[],
): string {
  if (item.anchorId) {
    return item.anchorId;
  }
  if (item.evolutionKind === "split" && predecessorIds.length > 0 && successorIds.length > 0) {
    return `${predecessorIds.join(", ")} -> ${successorIds.join(", ")}`;
  }
  if (item.evolutionKind === "merged" && predecessorIds.length > 0 && successorIds.length > 0) {
    return `${predecessorIds.join(", ")} -> ${successorIds.join(", ")}`;
  }
  if (predecessorIds.length > 0) {
    return predecessorIds.join(", ");
  }
  if (successorIds.length > 0) {
    return successorIds.join(", ");
  }
  return item.itemId;
}

function formatSectionLabel(kind: GreenfieldSourceDiffSectionKind): string {
  switch (kind) {
    case "added":
      return "Added";
    case "modified":
      return "Modified";
    case "deprecated":
      return "Deprecated";
    case "split":
      return "Split";
    case "merged":
      return "Merged";
    case "reanchored":
      return "Reanchored";
  }
}

function loadSourceEvolutionDiff(filePath: string): GreenfieldSourceEvolutionDiff | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as GreenfieldSourceEvolutionDiff;
    return parsed && typeof parsed === "object" && Array.isArray(parsed.items) ? parsed : undefined;
  } catch {
    return undefined;
  }
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
