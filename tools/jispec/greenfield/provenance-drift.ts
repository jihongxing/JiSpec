import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  buildGreenfieldSourceDocumentsManifest,
  loadGreenfieldSourceDocuments,
  loadGreenfieldSourceManifest,
  loadResolvedGreenfieldSourceManifest,
  normalizePath,
} from "./source-documents";

type SourceDocumentName = "requirements" | "technical_solution";
type EvolutionSeverity = "blocking" | "advisory";
type EvolutionKind = "added" | "modified" | "deprecated" | "split" | "merged" | "reanchored";

export interface GreenfieldProvenanceAnchorDrift {
  sourceDocument: SourceDocumentName;
  anchorId: string;
  kind: string;
  contractLevel: "required" | "supporting";
  path: string;
  severity: "blocking" | "advisory";
  expectedLine?: number;
  currentLine?: number;
  paragraphId?: string;
  expectedChecksum?: string;
  currentChecksum?: string;
  excerpt?: string;
  reason: "missing_file" | "line_checksum_mismatch" | "excerpt_not_found";
}

export interface GreenfieldSourceEvolutionItem {
  evolution_id: string;
  evolution_kind: EvolutionKind;
  source_document: SourceDocumentName;
  severity: EvolutionSeverity;
  path: string;
  anchor_id?: string;
  anchor_kind?: "requirement" | "heading";
  contract_level?: "required" | "supporting";
  predecessor_ids?: string[];
  successor_ids?: string[];
  expected_line?: number;
  current_line?: number;
  expected_checksum?: string;
  current_checksum?: string;
  expected_excerpt?: string;
  current_excerpt?: string;
  summary: string;
}

export interface GreenfieldSourceEvolutionDiff {
  version: 1;
  active_manifest_path: string;
  target_manifest_path?: string;
  target_origin: "proposed_snapshot" | "workspace_docs";
  generated_at: string;
  compatibility_mode: "active" | "legacy";
  summary: {
    changed: boolean;
    total: number;
    added: number;
    modified: number;
    deprecated: number;
    split: number;
    merged: number;
    reanchored: number;
  };
  items: GreenfieldSourceEvolutionItem[];
}

const DEFAULT_REQUIREMENTS_PATH = "docs/input/requirements.md";
const DEFAULT_TECHNICAL_SOLUTION_PATH = "docs/input/technical-solution.md";

export function collectGreenfieldProvenanceAnchorDrift(rootInput: string): GreenfieldProvenanceAnchorDrift[] {
  const diff = collectGreenfieldSourceEvolutionDiff(rootInput);
  if (!diff) {
    return [];
  }

  return diff.items
    .filter((item) => item.evolution_kind === "modified" || item.evolution_kind === "reanchored")
    .map((item) => ({
      sourceDocument: item.source_document,
      anchorId: item.anchor_id ?? "unknown-anchor",
      kind: item.anchor_kind ?? "heading",
      contractLevel: item.contract_level ?? "supporting",
      path: item.path,
      severity: item.severity,
      expectedLine: item.expected_line,
      currentLine: item.current_line,
      paragraphId: undefined,
      expectedChecksum: item.expected_checksum,
      currentChecksum: item.current_checksum,
      excerpt: item.expected_excerpt,
      reason: item.current_excerpt === undefined
        ? "excerpt_not_found" as const
        : "line_checksum_mismatch" as const,
    }))
    .sort((left, right) =>
      `${left.path}|${left.anchorId}|${left.reason}`.localeCompare(`${right.path}|${right.anchorId}|${right.reason}`),
    );
}

export function collectGreenfieldSourceEvolutionDiff(
  rootInput: string,
  options?: {
    changeId?: string;
    targetManifestPath?: string;
    generatedAt?: string;
  },
): GreenfieldSourceEvolutionDiff | undefined {
  const root = path.resolve(rootInput);
  const resolvedActiveManifest = loadResolvedGreenfieldSourceManifest(root);
  if (!resolvedActiveManifest) {
    return undefined;
  }

  const target = loadTargetManifest(root, options);
  if (!target) {
    return undefined;
  }

  const activeDocuments = getManifestSourceDocuments(resolvedActiveManifest.manifest);
  const targetDocuments = getManifestSourceDocuments(target.manifest);
  const items = [
    ...collectRequirementEvolution("requirements", activeDocuments.requirements, targetDocuments.requirements),
    ...collectHeadingEvolution("requirements", activeDocuments.requirements, targetDocuments.requirements),
    ...collectHeadingEvolution("technical_solution", activeDocuments.technical_solution, targetDocuments.technical_solution),
  ].sort((left, right) =>
    `${left.path}|${left.evolution_kind}|${left.anchor_id ?? left.predecessor_ids?.join(",") ?? ""}`.localeCompare(
      `${right.path}|${right.evolution_kind}|${right.anchor_id ?? right.predecessor_ids?.join(",") ?? ""}`,
    ),
  );

  return {
    version: 1,
    active_manifest_path: resolvedActiveManifest.manifestPath,
    target_manifest_path: target.manifestPath,
    target_origin: target.origin,
    generated_at: options?.generatedAt ?? new Date().toISOString(),
    compatibility_mode: resolvedActiveManifest.compatibilityMode,
    summary: {
      changed: items.length > 0,
      total: items.length,
      added: items.filter((item) => item.evolution_kind === "added").length,
      modified: items.filter((item) => item.evolution_kind === "modified").length,
      deprecated: items.filter((item) => item.evolution_kind === "deprecated").length,
      split: items.filter((item) => item.evolution_kind === "split").length,
      merged: items.filter((item) => item.evolution_kind === "merged").length,
      reanchored: items.filter((item) => item.evolution_kind === "reanchored").length,
    },
    items,
  };
}

export function renderGreenfieldProvenanceDriftWarnings(drifts: GreenfieldProvenanceAnchorDrift[]): string[] {
  return drifts.map((drift) =>
    `Provenance anchor ${drift.anchorId} in ${drift.path} drifted: ${drift.reason}${drift.expectedLine ? ` at line ${drift.expectedLine}` : ""}.`,
  );
}

export function renderGreenfieldSourceEvolutionWarnings(items: GreenfieldSourceEvolutionItem[]): string[] {
  return items.map((item) => `Source evolution ${item.evolution_kind} in ${item.path}: ${item.summary}`);
}

export function renderGreenfieldSourceEvolutionMarkdown(diff: GreenfieldSourceEvolutionDiff): string {
  const lines = [
    "# Source Evolution",
    "",
    `- Active manifest: \`${diff.active_manifest_path}\``,
    `- Target origin: \`${diff.target_origin}\``,
    `- Target manifest: \`${diff.target_manifest_path ?? "workspace_docs"}\``,
    `- Compatibility mode: \`${diff.compatibility_mode}\``,
    `- Changed: \`${diff.summary.changed ? "yes" : "no"}\``,
    `- Items: \`${diff.summary.total}\``,
    "",
    "## Counts",
    "",
    `- added: ${diff.summary.added}`,
    `- modified: ${diff.summary.modified}`,
    `- deprecated: ${diff.summary.deprecated}`,
    `- split: ${diff.summary.split}`,
    `- merged: ${diff.summary.merged}`,
    `- reanchored: ${diff.summary.reanchored}`,
    "",
    "## Items",
    "",
  ];

  if (diff.items.length === 0) {
    lines.push("- None.");
    lines.push("");
    return lines.join("\n");
  }

  for (const item of diff.items) {
    const subject = item.anchor_id
      ? item.anchor_id
      : item.predecessor_ids?.join(", ") ?? item.successor_ids?.join(", ") ?? "source-evolution";
    lines.push(`- \`${item.evolution_kind}\` \`${subject}\` in \`${item.path}\`: ${item.summary}`);
  }
  lines.push("");
  return lines.join("\n");
}

function loadTargetManifest(
  root: string,
  options?: {
    changeId?: string;
    targetManifestPath?: string;
  },
): { manifestPath?: string; origin: "proposed_snapshot" | "workspace_docs"; manifest: Record<string, unknown> } | undefined {
  const explicitPath = options?.targetManifestPath
    ? path.resolve(options.targetManifestPath)
    : options?.changeId
      ? path.join(root, ".spec", "deltas", options.changeId, "source-documents.proposed.yaml")
      : undefined;
  if (explicitPath) {
    const manifest = loadGreenfieldSourceManifest(explicitPath);
    if (manifest) {
      return {
        manifestPath: normalizePath(explicitPath),
        origin: "proposed_snapshot",
        manifest,
      };
    }
  }

  const requirementsPath = path.join(root, DEFAULT_REQUIREMENTS_PATH);
  const technicalSolutionPath = path.join(root, DEFAULT_TECHNICAL_SOLUTION_PATH);
  if (!fs.existsSync(requirementsPath)) {
    return undefined;
  }

  const inputContract = loadGreenfieldSourceDocuments({
    requirements: requirementsPath,
    technicalSolution: fs.existsSync(technicalSolutionPath) ? technicalSolutionPath : undefined,
  });
  if (inputContract.status === "failed") {
    return undefined;
  }

  return {
    origin: "workspace_docs",
    manifest: buildGreenfieldSourceDocumentsManifest(inputContract, {
      root,
      requirementsPath,
      technicalSolutionPath: fs.existsSync(technicalSolutionPath) ? technicalSolutionPath : undefined,
      snapshotStatus: "proposed",
    }),
  };
}

function collectRequirementEvolution(
  sourceDocument: SourceDocumentName,
  activeDocument: Record<string, unknown> | undefined,
  targetDocument: Record<string, unknown> | undefined,
): GreenfieldSourceEvolutionItem[] {
  const activeRequirements = requirementAnchorsById(activeDocument);
  const targetRequirements = requirementAnchorsById(targetDocument);
  const activeIds = Object.keys(activeRequirements).sort();
  const targetIds = Object.keys(targetRequirements).sort();
  const addedIds = targetIds.filter((id) => !activeIds.includes(id));
  const removedIds = activeIds.filter((id) => !targetIds.includes(id));
  const consumedAdded = new Set<string>();
  const consumedRemoved = new Set<string>();
  const items: GreenfieldSourceEvolutionItem[] = [];

  for (const removedId of removedIds) {
    const successors = addedIds.filter((candidate) => requirementFamilyKey(candidate) === requirementFamilyKey(removedId));
    if (successors.length >= 2) {
      consumedRemoved.add(removedId);
      for (const successor of successors) {
        consumedAdded.add(successor);
      }
      const predecessor = activeRequirements[removedId];
      items.push({
        evolution_id: evolutionId("split", [removedId, ...successors]),
        evolution_kind: "split",
        source_document: sourceDocument,
        severity: "blocking",
        path: stringValue(predecessor?.path) ?? documentPath(sourceDocument),
        predecessor_ids: [removedId],
        successor_ids: successors.sort(),
        summary: `Requirement ${removedId} appears to have been split into ${successors.sort().join(", ")}.`,
      });
    }
  }

  for (const addedId of addedIds) {
    if (consumedAdded.has(addedId)) {
      continue;
    }
    const predecessors = removedIds.filter((candidate) => requirementFamilyKey(candidate) === requirementFamilyKey(addedId));
    if (predecessors.length >= 2) {
      for (const predecessor of predecessors) {
        consumedRemoved.add(predecessor);
      }
      consumedAdded.add(addedId);
      const successor = targetRequirements[addedId];
      items.push({
        evolution_id: evolutionId("merged", [...predecessors, addedId]),
        evolution_kind: "merged",
        source_document: sourceDocument,
        severity: "blocking",
        path: stringValue(successor?.path) ?? documentPath(sourceDocument),
        predecessor_ids: predecessors.sort(),
        successor_ids: [addedId],
        summary: `Requirements ${predecessors.sort().join(", ")} appear to have merged into ${addedId}.`,
      });
    }
  }

  for (const addedId of addedIds) {
    if (consumedAdded.has(addedId)) {
      continue;
    }
    const current = targetRequirements[addedId];
    items.push({
      evolution_id: evolutionId("added", [addedId]),
      evolution_kind: "added",
      source_document: sourceDocument,
      severity: "blocking",
      path: stringValue(current?.path) ?? documentPath(sourceDocument),
      anchor_id: addedId,
      anchor_kind: "requirement",
      contract_level: "required",
      current_line: numberValue(current?.line),
      current_checksum: stringValue(current?.checksum),
      current_excerpt: stringValue(current?.excerpt),
      summary: `Requirement ${addedId} is present in the target source snapshot but not in the active source snapshot.`,
    });
  }

  for (const removedId of removedIds) {
    if (consumedRemoved.has(removedId)) {
      continue;
    }
    const previous = activeRequirements[removedId];
    items.push({
      evolution_id: evolutionId("deprecated", [removedId]),
      evolution_kind: "deprecated",
      source_document: sourceDocument,
      severity: "blocking",
      path: stringValue(previous?.path) ?? documentPath(sourceDocument),
      anchor_id: removedId,
      anchor_kind: "requirement",
      contract_level: "required",
      expected_line: numberValue(previous?.line),
      expected_checksum: stringValue(previous?.checksum),
      expected_excerpt: stringValue(previous?.excerpt),
      summary: `Requirement ${removedId} is no longer present in the target source snapshot.`,
    });
  }

  for (const retainedId of activeIds.filter((id) => targetIds.includes(id))) {
    const previous = activeRequirements[retainedId];
    const current = targetRequirements[retainedId];
    const previousChecksum = stringValue(previous?.checksum);
    const currentChecksum = stringValue(current?.checksum);
    const previousLine = numberValue(previous?.line);
    const currentLine = numberValue(current?.line);
    if (previousChecksum && currentChecksum && previousChecksum !== currentChecksum) {
      items.push({
        evolution_id: evolutionId("modified", [retainedId]),
        evolution_kind: "modified",
        source_document: sourceDocument,
        severity: "blocking",
        path: stringValue(current?.path) ?? stringValue(previous?.path) ?? documentPath(sourceDocument),
        anchor_id: retainedId,
        anchor_kind: "requirement",
        contract_level: "required",
        expected_line: previousLine,
        current_line: currentLine,
        expected_checksum: previousChecksum,
        current_checksum: currentChecksum,
        expected_excerpt: stringValue(previous?.excerpt),
        current_excerpt: stringValue(current?.excerpt),
        summary: `Requirement ${retainedId} kept its identity but changed semantic content.`,
      });
      continue;
    }

    if (previousLine !== currentLine) {
      items.push({
        evolution_id: evolutionId("reanchored", [retainedId]),
        evolution_kind: "reanchored",
        source_document: sourceDocument,
        severity: "advisory",
        path: stringValue(current?.path) ?? stringValue(previous?.path) ?? documentPath(sourceDocument),
        anchor_id: retainedId,
        anchor_kind: "requirement",
        contract_level: "required",
        expected_line: previousLine,
        current_line: currentLine,
        expected_checksum: previousChecksum,
        current_checksum: currentChecksum,
        expected_excerpt: stringValue(previous?.excerpt),
        current_excerpt: stringValue(current?.excerpt),
        summary: `Requirement ${retainedId} moved to a new anchor position without changing checksum.`,
      });
    }
  }

  return items;
}

function collectHeadingEvolution(
  sourceDocument: SourceDocumentName,
  activeDocument: Record<string, unknown> | undefined,
  targetDocument: Record<string, unknown> | undefined,
): GreenfieldSourceEvolutionItem[] {
  const activeHeadings = headingAnchorsById(activeDocument);
  const targetHeadings = headingAnchorsById(targetDocument);
  const items: GreenfieldSourceEvolutionItem[] = [];
  const matchedTargetIds = new Set<string>();

  for (const [headingId, previous] of Object.entries(activeHeadings)) {
    const match = findMatchingHeading(previous, targetHeadings, matchedTargetIds);
    const current = match ? targetHeadings[match] : undefined;
    if (match) {
      matchedTargetIds.add(match);
    }
    const previousChecksum = stringValue(previous?.checksum);
    const currentChecksum = stringValue(current?.checksum);
    const previousLine = numberValue(previous?.line);
    const currentLine = numberValue(current?.line);
    if (current && previousChecksum === currentChecksum && previousLine === currentLine) {
      continue;
    }
    items.push({
      evolution_id: evolutionId("reanchored", [headingId]),
      evolution_kind: "reanchored",
      source_document: sourceDocument,
      severity: "advisory",
      path: stringValue(current?.path) ?? stringValue(previous?.path) ?? documentPath(sourceDocument),
      anchor_id: headingId,
      anchor_kind: "heading",
      contract_level: "supporting",
      expected_line: previousLine,
      current_line: currentLine,
      expected_checksum: previousChecksum,
      current_checksum: currentChecksum,
      expected_excerpt: stringValue(previous?.excerpt),
      current_excerpt: stringValue(current?.excerpt),
      summary: current
        ? `Supporting heading ${headingId} was re-anchored or reworded.`
        : `Supporting heading ${headingId} could not be matched exactly and should be re-anchored.`,
    });
  }

  return items;
}

function getManifestSourceDocuments(
  manifest: Record<string, unknown>,
): Record<SourceDocumentName, Record<string, unknown> | undefined> {
  const sourceDocuments = isRecord(manifest.source_documents) ? manifest.source_documents : {};
  return {
    requirements: isRecord(sourceDocuments.requirements) ? sourceDocuments.requirements : undefined,
    technical_solution: isRecord(sourceDocuments.technical_solution) ? sourceDocuments.technical_solution : undefined,
  };
}

function requirementAnchorsById(documentRecord: Record<string, unknown> | undefined): Record<string, Record<string, unknown>> {
  return anchorsById(documentRecord, "requirement");
}

function headingAnchorsById(documentRecord: Record<string, unknown> | undefined): Record<string, Record<string, unknown>> {
  return anchorsById(documentRecord, "heading");
}

function anchorsById(
  documentRecord: Record<string, unknown> | undefined,
  anchorKind: "requirement" | "heading",
): Record<string, Record<string, unknown>> {
  if (!documentRecord) {
    return {};
  }
  const anchors = Array.isArray(documentRecord.anchors) ? documentRecord.anchors : [];
  const result: Record<string, Record<string, unknown>> = {};
  for (const anchor of anchors) {
    if (!isRecord(anchor) || stringValue(anchor.kind) !== anchorKind) {
      continue;
    }
    const id = stringValue(anchor.id);
    if (!id) {
      continue;
    }
    result[id] = anchor;
  }
  return result;
}

function findMatchingHeading(
  activeHeading: Record<string, unknown>,
  targetHeadings: Record<string, Record<string, unknown>>,
  matchedTargetIds: Set<string>,
): string | undefined {
  const activeId = stringValue(activeHeading.id);
  if (activeId && targetHeadings[activeId] && !matchedTargetIds.has(activeId)) {
    return activeId;
  }

  const activeAliases = new Set(aliasValues(activeHeading));
  for (const [candidateId, candidate] of Object.entries(targetHeadings)) {
    if (matchedTargetIds.has(candidateId)) {
      continue;
    }
    const targetAliases = aliasValues(candidate);
    if (targetAliases.some((alias) => activeAliases.has(alias))) {
      return candidateId;
    }
  }

  return undefined;
}

function requirementFamilyKey(requirementId: string): string {
  const match = requirementId.match(/^(REQ-[A-Z0-9]+)-/);
  return match?.[1] ?? requirementId;
}

function aliasValues(anchor: Record<string, unknown>): string[] {
  const values = new Set<string>();
  const id = stringValue(anchor.id);
  if (id) {
    values.add(normalizeAlias(id));
  }
  const excerpt = stringValue(anchor.excerpt);
  if (excerpt) {
    values.add(normalizeAlias(excerpt.replace(/^#{1,6}\s+/, "")));
  }
  const aliases = Array.isArray(anchor.aliases) ? anchor.aliases : [];
  for (const alias of aliases) {
    if (typeof alias === "string" && alias.trim().length > 0) {
      values.add(normalizeAlias(alias));
    }
  }
  return Array.from(values).filter((value) => value.length > 0);
}

function evolutionId(kind: EvolutionKind, ids: string[]): string {
  return `${kind}:${stableHash(ids.sort().join("|"))}`;
}

function stableHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function normalizeAlias(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function documentPath(sourceDocument: SourceDocumentName): string {
  return sourceDocument === "requirements" ? DEFAULT_REQUIREMENTS_PATH : DEFAULT_TECHNICAL_SOLUTION_PATH;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
