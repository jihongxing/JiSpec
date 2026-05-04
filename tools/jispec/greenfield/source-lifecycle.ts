import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { normalizePath } from "./source-documents";

export type GreenfieldRequirementLifecycleStatus =
  | "active"
  | "modified"
  | "deprecated"
  | "split"
  | "merged"
  | "replaced";

export interface GreenfieldRequirementLifecycleEntry {
  id: string;
  status: GreenfieldRequirementLifecycleStatus;
  source_snapshot?: string;
  introduced_by_change?: string | null;
  modified_by_change?: string | null;
  deprecated_by_change?: string | null;
  supersedes: string[];
  replaced_by: string[];
  merged_from: string[];
}

export interface GreenfieldRequirementLifecycleRegistry {
  version: 1;
  registry_version: number;
  generated_at: string;
  active_snapshot_id?: string;
  last_adopted_change_id?: string | null;
  requirements: GreenfieldRequirementLifecycleEntry[];
}

export const GREENFIELD_REQUIREMENT_LIFECYCLE_PATH = ".spec/requirements/lifecycle.yaml";

export function buildInitialRequirementLifecycleRegistry(
  manifest: Record<string, unknown>,
  options?: {
    generatedAt?: string;
    registryVersion?: number;
    lastAdoptedChangeId?: string | null;
  },
): GreenfieldRequirementLifecycleRegistry {
  const generatedAt = options?.generatedAt ?? new Date().toISOString();
  const activeSnapshotId = readManifestSnapshotId(manifest);
  const requirementIds = readManifestRequirementIds(manifest);

  return {
    version: 1,
    registry_version: options?.registryVersion ?? 1,
    generated_at: generatedAt,
    active_snapshot_id: activeSnapshotId,
    last_adopted_change_id: options?.lastAdoptedChangeId ?? null,
    requirements: requirementIds.map((id) => ({
      id,
      status: "active" as const,
      source_snapshot: activeSnapshotId,
      introduced_by_change: null,
      modified_by_change: null,
      deprecated_by_change: null,
      supersedes: [],
      replaced_by: [],
      merged_from: [],
    })),
  };
}

export function loadRequirementLifecycleRegistry(rootInput: string): GreenfieldRequirementLifecycleRegistry | undefined {
  const filePath = path.join(path.resolve(rootInput), GREENFIELD_REQUIREMENT_LIFECYCLE_PATH);
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  try {
    const parsed = yaml.load(fs.readFileSync(filePath, "utf-8"));
    if (!isRecord(parsed)) {
      return undefined;
    }
    const requirements = Array.isArray(parsed.requirements)
      ? parsed.requirements.filter(isRecord).map(toLifecycleEntry)
      : [];
    return {
      version: 1,
      registry_version: numberValue(parsed.registry_version) ?? 1,
      generated_at: stringValue(parsed.generated_at) ?? new Date().toISOString(),
      active_snapshot_id: stringValue(parsed.active_snapshot_id),
      last_adopted_change_id: stringValue(parsed.last_adopted_change_id) ?? null,
      requirements: requirements.sort((left, right) => left.id.localeCompare(right.id)),
    };
  } catch {
    return undefined;
  }
}

export function writeRequirementLifecycleRegistry(
  rootInput: string,
  registry: GreenfieldRequirementLifecycleRegistry,
): string {
  const root = path.resolve(rootInput);
  const targetPath = path.join(root, GREENFIELD_REQUIREMENT_LIFECYCLE_PATH);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, renderRequirementLifecycleRegistry(registry), "utf-8");
  return normalizePath(targetPath);
}

export function renderRequirementLifecycleRegistry(registry: GreenfieldRequirementLifecycleRegistry): string {
  return yaml.dump({
    version: 1,
    registry_version: registry.registry_version,
    generated_at: registry.generated_at,
    active_snapshot_id: registry.active_snapshot_id,
    last_adopted_change_id: registry.last_adopted_change_id ?? null,
    requirements: [...registry.requirements]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((entry) => ({
        id: entry.id,
        status: entry.status,
        source_snapshot: entry.source_snapshot,
        introduced_by_change: entry.introduced_by_change ?? null,
        modified_by_change: entry.modified_by_change ?? null,
        deprecated_by_change: entry.deprecated_by_change ?? null,
        supersedes: stableUnique(entry.supersedes),
        replaced_by: stableUnique(entry.replaced_by),
        merged_from: stableUnique(entry.merged_from),
      })),
  }, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
}

export function readManifestSnapshotId(manifest: Record<string, unknown>): string | undefined {
  const snapshot = isRecord(manifest.snapshot) ? manifest.snapshot : undefined;
  return stringValue(snapshot?.id);
}

export function readManifestRequirementIds(manifest: Record<string, unknown>): string[] {
  const sourceDocuments = isRecord(manifest.source_documents) ? manifest.source_documents : undefined;
  const requirements = sourceDocuments && isRecord(sourceDocuments.requirements) ? sourceDocuments.requirements : undefined;
  const ids = Array.isArray(requirements?.requirement_ids)
    ? requirements.requirement_ids.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
  return stableUnique(ids);
}

function toLifecycleEntry(value: Record<string, unknown>): GreenfieldRequirementLifecycleEntry {
  return {
    id: stringValue(value.id) ?? "unknown-requirement",
    status: toLifecycleStatus(value.status),
    source_snapshot: stringValue(value.source_snapshot),
    introduced_by_change: stringValue(value.introduced_by_change) ?? null,
    modified_by_change: stringValue(value.modified_by_change) ?? null,
    deprecated_by_change: stringValue(value.deprecated_by_change) ?? null,
    supersedes: stringArray(value.supersedes),
    replaced_by: stringArray(value.replaced_by),
    merged_from: stringArray(value.merged_from),
  };
}

function toLifecycleStatus(value: unknown): GreenfieldRequirementLifecycleStatus {
  switch (value) {
    case "modified":
    case "deprecated":
    case "split":
    case "merged":
    case "replaced":
      return value;
    default:
      return "active";
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? stableUnique(value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0))
    : [];
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
