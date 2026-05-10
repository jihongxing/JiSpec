import crypto from "node:crypto";

export type KernelLifecycleStatus =
  | "observed"
  | "normalized"
  | "open"
  | "resolved"
  | "archived"
  | "committed"
  | "rolled_back";

export type KernelMutationSource =
  | "git_diff"
  | "git_commit"
  | "external_patch"
  | "ci_patch"
  | "ide_patch"
  | "human_patch"
  | "unknown";

export type KernelChangeClassification = "derived_change" | "unmapped_mutation";

export type KernelDecision = "approve" | "reject" | "defer" | "replay";

export type KernelProvenanceRelationship =
  | "derived_from"
  | "observed_from"
  | "normalized_from"
  | "resolved_into"
  | "replayed_from";

export interface KernelIdentity {
  id: string;
  createdAt: string;
  updatedAt?: string;
}

export interface KernelArtifactRef {
  path: string;
  kind: string;
}

export interface KernelProvenanceLink extends KernelIdentity {
  sourceId: string;
  sourceKind: string;
  targetId: string;
  targetKind: string;
  relationship: KernelProvenanceRelationship;
  confidence?: number;
  reason?: string;
}

export interface KernelMutation extends KernelIdentity {
  source: KernelMutationSource;
  summary: string;
  status: KernelLifecycleStatus;
  path?: string;
  confidence: number;
  reason?: string;
  payload?: Record<string, unknown>;
  lineage: KernelProvenanceLink[];
}

export interface ChangeHypothesis extends KernelIdentity {
  mutationId: string;
  classification: KernelChangeClassification;
  status: KernelLifecycleStatus;
  summary: string;
  confidence: number;
  reasons: string[];
  facts: string[];
  policyVersion?: string;
  candidateChangeIds: string[];
  lineage: KernelProvenanceLink[];
}

export interface AmbiguityDebtRecord extends KernelIdentity {
  mutationId: string;
  status: "open" | "reclassified" | "resolved" | "archived";
  owner: string;
  reason: string;
  confidence: number;
  nextReview?: string;
  source: KernelMutationSource | "unknown";
  candidateChangeIds: string[];
  lineage: KernelProvenanceLink[];
}

export interface KernelState<TPayload = Record<string, unknown>> extends KernelIdentity {
  kind: string;
  status: KernelLifecycleStatus;
  payload: TPayload;
  lineage: KernelProvenanceLink[];
}

export interface KernelTransitionResult<TState = KernelState, TOutput = unknown> extends KernelIdentity {
  changeId: string;
  fromState: TState;
  toState: TState;
  decision: KernelDecision;
  outputs: TOutput[];
  provenance: KernelProvenanceLink[];
  committed: boolean;
}

export function createKernelTimestamp(input: Date = new Date()): string {
  return input.toISOString();
}

export function createKernelId(prefix: string, input: string): string {
  const normalizedPrefix = prefix.trim().replace(/[^a-z0-9_-]+/gi, "-") || "kernel";
  const hash = crypto.createHash("sha256").update(input).digest("hex").slice(0, 12);
  return `${normalizedPrefix}-${hash}`;
}

export function createKernelIdentity(prefix: string, input: string, now: Date = new Date()): KernelIdentity {
  return {
    id: createKernelId(prefix, input),
    createdAt: createKernelTimestamp(now),
  };
}

export function stableKernelList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right));
}

export function serializeKernelRecord(value: unknown): string {
  return JSON.stringify(sortKernelValue(value), null, 2);
}

export function parseKernelRecord<T>(json: string): T {
  return JSON.parse(json) as T;
}

export function createKernelArtifactRef(kind: string, path: string): KernelArtifactRef {
  return {
    kind: kind.trim(),
    path: path.replace(/\\/g, "/"),
  };
}

function sortKernelValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKernelValue);
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortKernelValue(entry)]),
    );
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
