import fs from "node:fs";
import path from "node:path";
import { inferEvidenceProvenance, type EvidenceProvenanceDescriptor } from "../provenance/evidence-provenance";

export type ExternalGraphImportMode = "import-only";
export type ExternalGraphImportStatus = "available" | "invalid" | "not_available_yet";
export type ExternalEvidenceFreshness = "fresh" | "stale" | "unknown";
export type ExternalGraphPrivacySubjectKind = "external_graph_summary" | "normalized_external_evidence";

export interface ExternalGraphNode {
  id: string;
  kind: string;
  label: string;
}

export interface ExternalGraphEdge {
  from: string;
  to: string;
  kind: string;
}

export interface ExternalGraphArtifact {
  provider: string;
  generatedAt: string;
  nodes: ExternalGraphNode[];
  edges: ExternalGraphEdge[];
}

export interface ExternalImportProvenance {
  label: "external_import";
  descriptor: EvidenceProvenanceDescriptor;
}

export interface NormalizedExternalGraphEvidence {
  provider: string;
  generatedAt: string;
  sourcePath: string;
  freshness: ExternalEvidenceFreshness;
  nodeId: string;
  nodeKind: string;
  label: string;
  provenance: ExternalImportProvenance;
  advisoryOnly: true;
  blockingEligible: false;
}

export interface ExternalGraphImportWarning {
  kind: "invalid_external_graph_artifact";
  message: string;
}

export interface ExternalGraphPrivacySubject {
  kind: ExternalGraphPrivacySubjectKind;
  sourcePath: string;
}

export interface ExternalGraphImportResult {
  mode: ExternalGraphImportMode;
  status: ExternalGraphImportStatus;
  sourcePath: string;
  execution: {
    commandExecuted: false;
    networkUsed: false;
    sourceUploaded: false;
  };
  evidence: NormalizedExternalGraphEvidence[];
  warnings: ExternalGraphImportWarning[];
  verifyInterruption: false;
  privacySubjects: ExternalGraphPrivacySubject[];
}

const FRESHNESS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function importExternalGraphArtifact(input: {
  root: string;
  mode: ExternalGraphImportMode;
  sourcePath: string;
  now?: Date;
}): ExternalGraphImportResult {
  if (input.mode !== "import-only") {
    throw new Error(`Unsupported external graph import mode: ${input.mode}`);
  }

  const root = path.resolve(input.root);
  const absolutePath = path.isAbsolute(input.sourcePath) ? input.sourcePath : path.join(root, input.sourcePath);
  const sourcePath = normalizePath(path.isAbsolute(input.sourcePath) ? path.relative(root, absolutePath) : input.sourcePath);
  const base = baseResult(sourcePath);

  if (!fs.existsSync(absolutePath)) {
    return base;
  }

  try {
    const artifact = parseArtifact(JSON.parse(fs.readFileSync(absolutePath, "utf-8")));
    const evidence = normalizeExternalGraphEvidence({
      provider: artifact.provider,
      generatedAt: artifact.generatedAt,
      sourcePath,
      nodes: artifact.nodes,
      edges: artifact.edges,
      now: input.now ?? new Date(),
    });

    return {
      ...base,
      status: "available",
      evidence,
      privacySubjects: [
        { kind: "external_graph_summary", sourcePath },
        { kind: "normalized_external_evidence", sourcePath },
      ],
    };
  } catch (error) {
    return {
      ...base,
      status: "invalid",
      warnings: [
        {
          kind: "invalid_external_graph_artifact",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

export function normalizeExternalGraphEvidence(input: {
  provider: string;
  generatedAt: string;
  sourcePath: string;
  nodes: ExternalGraphNode[];
  edges: ExternalGraphEdge[];
  now: Date;
}): NormalizedExternalGraphEvidence[] {
  const sourcePath = normalizePath(input.sourcePath);
  const freshness = classifyFreshness(input.generatedAt, input.now);

  return input.nodes.map((node) => ({
    provider: input.provider,
    generatedAt: input.generatedAt,
    sourcePath,
    freshness,
    nodeId: node.id,
    nodeKind: node.kind,
    label: node.label,
    provenance: {
      label: "external_import",
      descriptor: inferEvidenceProvenance({
        confidence: 0.8,
        evidenceKind: node.kind,
        sourcePath,
        ownerReviewRequired: true,
      }).descriptor,
    },
    advisoryOnly: true,
    blockingEligible: false,
  }));
}

function baseResult(sourcePath: string): ExternalGraphImportResult {
  return {
    mode: "import-only",
    status: "not_available_yet",
    sourcePath,
    execution: {
      commandExecuted: false,
      networkUsed: false,
      sourceUploaded: false,
    },
    evidence: [],
    warnings: [],
    verifyInterruption: false,
    privacySubjects: [],
  };
}

function parseArtifact(value: unknown): ExternalGraphArtifact {
  const artifact = requireRecord(value, "external graph artifact");
  assertAllowedKeys(artifact, ["provider", "generatedAt", "nodes", "edges"], "external graph artifact");
  const provider = requiredString(artifact.provider, "provider");
  const generatedAt = requiredDateTime(artifact.generatedAt, "generatedAt");

  return {
    provider,
    generatedAt,
    nodes: parseNodes(artifact.nodes),
    edges: parseEdges(artifact.edges),
  };
}

function parseNodes(value: unknown): ExternalGraphNode[] {
  if (!Array.isArray(value)) {
    throw new Error("nodes must be an array");
  }

  return value.map((node, index) => {
    const record = requireRecord(node, `nodes[${index}]`);
    assertAllowedKeys(record, ["id", "kind", "label"], `nodes[${index}]`);
    return {
      id: requiredString(record.id, `nodes[${index}].id`),
      kind: requiredString(record.kind, `nodes[${index}].kind`),
      label: requiredString(record.label, `nodes[${index}].label`),
    };
  });
}

function parseEdges(value: unknown): ExternalGraphEdge[] {
  if (!Array.isArray(value)) {
    throw new Error("edges must be an array");
  }

  return value.map((edge, index) => {
    const record = requireRecord(edge, `edges[${index}]`);
    assertAllowedKeys(record, ["from", "to", "kind"], `edges[${index}]`);
    return {
      from: requiredString(record.from, `edges[${index}].from`),
      to: requiredString(record.to, `edges[${index}].to`),
      kind: requiredString(record.kind, `edges[${index}].kind`),
    };
  });
}

function classifyFreshness(generatedAt: string, now: Date): ExternalEvidenceFreshness {
  const timestamp = Date.parse(generatedAt);
  if (!Number.isFinite(timestamp)) {
    return "unknown";
  }

  const ageMs = now.getTime() - timestamp;
  if (ageMs < 0) {
    return "unknown";
  }
  return ageMs <= FRESHNESS_WINDOW_MS ? "fresh" : "stale";
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function requiredDateTime(value: unknown, label: string): string {
  const text = requiredString(value, label);
  if (!Number.isFinite(Date.parse(text))) {
    throw new Error(`${label} must be a valid date-time string`);
  }
  return text;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertAllowedKeys(value: Record<string, unknown>, allowedKeys: string[], label: string): void {
  const allowed = new Set(allowedKeys);
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (extra.length > 0) {
    throw new Error(`${label} has unsupported field(s): ${extra.sort().join(", ")}`);
  }
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
