import crypto from "node:crypto";
import { canonicalizeToJson, type CanonicalSchema } from "./canonicalization";
import type { GreenfieldSourceReplaySeed, GreenfieldSourceSnapshotLayerModel } from "./source-documents";

export const GREENFIELD_SOURCE_FINGERPRINT_SCHEMA_VERSION = 1;
export const GREENFIELD_SOURCE_CANONICALIZATION_VERSION = "greenfield-canonicalization@1";
export const GREENFIELD_SOURCE_FINGERPRINT_ENGINE_VERSION = "greenfield-source-documents@1";

export interface GreenfieldSourceTruthFingerprintContext {
  version: 1;
  canonicalization_version: string;
  canonicalization_schema_version: number;
  engine_version: string;
  ordering_key: string;
}

export interface GreenfieldSourceTruthFingerprintResult {
  truth_fingerprint: string;
  truth_fingerprint_context: GreenfieldSourceTruthFingerprintContext;
}

export interface GreenfieldSourceTruthFingerprintManifestMetadata {
  truth_fingerprint?: string;
  truth_fingerprint_context?: GreenfieldSourceTruthFingerprintContext;
}

export function computeGreenfieldSourceTruthFingerprint(
  layer: GreenfieldSourceSnapshotLayerModel,
): GreenfieldSourceTruthFingerprintResult {
  const canonicalBytes = canonicalizeToJson(layer, GREENFIELD_SOURCE_SNAPSHOT_LAYER_SCHEMA);
  return {
    truth_fingerprint: crypto.createHash("sha256").update(canonicalBytes, "utf-8").digest("hex"),
    truth_fingerprint_context: buildGreenfieldSourceTruthFingerprintContext(layer.replay_seed),
  };
}

export function buildGreenfieldSourceTruthFingerprintContext(
  replaySeed: GreenfieldSourceReplaySeed,
): GreenfieldSourceTruthFingerprintContext {
  return {
    version: 1,
    canonicalization_version: GREENFIELD_SOURCE_CANONICALIZATION_VERSION,
    canonicalization_schema_version: GREENFIELD_SOURCE_FINGERPRINT_SCHEMA_VERSION,
    engine_version: replaySeed.engine_version,
    ordering_key: replaySeed.ordering_key,
  };
}

export function readGreenfieldSourceTruthFingerprintMetadata(
  manifest: Record<string, unknown>,
): GreenfieldSourceTruthFingerprintManifestMetadata | undefined {
  const truthFingerprint = stringValue(manifest.truth_fingerprint);
  const context = isRecord(manifest.truth_fingerprint_context)
    ? buildGreenfieldSourceTruthFingerprintContextFromRecord(manifest.truth_fingerprint_context)
    : undefined;

  if (!truthFingerprint && !context) {
    return undefined;
  }

  return {
    ...(truthFingerprint ? { truth_fingerprint: truthFingerprint } : {}),
    ...(context ? { truth_fingerprint_context: context } : {}),
  };
}

const GREENFIELD_SOURCE_REPLAY_SEED_SCHEMA: CanonicalSchema = {
  kind: "object",
  required: ["version", "generated_at", "engine_version", "ordering_key"],
  additionalProperties: false,
  properties: {
    version: { kind: "number" },
    generated_at: { kind: "string" },
    engine_version: { kind: "string" },
    ordering_key: { kind: "string" },
  },
};

const GREENFIELD_SOURCE_DOCUMENT_SCHEMA: CanonicalSchema = {
  kind: "object",
  required: ["path", "role", "status", "exists", "line_count", "anchors"],
  additionalProperties: false,
  properties: {
    path: { kind: "string" },
    original_path: { kind: "string" },
    role: { kind: "string" },
    status: { kind: "string" },
    checksum: { kind: "string" },
    line_count: { kind: "number" },
    requirement_ids: {
      kind: "array",
      arrayKind: "list",
      items: { kind: "string" },
    },
    anchors: {
      kind: "array",
      arrayKind: "list",
      items: {
        kind: "object",
        required: ["id", "kind", "contract_level", "path", "line", "paragraph_id", "excerpt", "checksum", "aliases"],
        additionalProperties: false,
        properties: {
          id: { kind: "string" },
          kind: { kind: "string" },
          contract_level: { kind: "string" },
          path: { kind: "string" },
          line: { kind: "number" },
          paragraph_id: { kind: "string" },
          excerpt: { kind: "string" },
          checksum: { kind: "string" },
          aliases: {
            kind: "array",
            arrayKind: "list",
            items: { kind: "string" },
          },
        },
      },
    },
    exists: { kind: "boolean" },
    // Compatibility/legacy fields can exist in manifest objects but are not part
    // of the fingerprinting contract.
    // They are intentionally excluded from the canonical layer.
  },
};

const GREENFIELD_SOURCE_CONTRACT_NOTICE_SCHEMA: CanonicalSchema = {
  kind: "object",
  required: ["description"],
  additionalProperties: false,
  properties: {
    required: { kind: "boolean" },
    optional: { kind: "boolean" },
    description: { kind: "string" },
  },
};

const GREENFIELD_SOURCE_SEMANTIC_SNAPSHOT_SCHEMA: CanonicalSchema = {
  kind: "object",
  required: [
    "version",
    "input_contract",
    "source_documents",
    "input_mode",
    "input_status",
    "blocking_issues",
    "warnings",
    "open_decisions",
  ],
  additionalProperties: false,
  properties: {
    version: { kind: "number" },
    input_contract: {
      kind: "object",
      required: ["version", "supported_modes", "requirements", "technical_solution", "ji_spec_responsibilities", "user_responsibilities"],
      additionalProperties: false,
      properties: {
        version: { kind: "number" },
        supported_modes: {
          kind: "array",
          arrayKind: "set",
          items: { kind: "string" },
        },
        requirements: GREENFIELD_SOURCE_CONTRACT_NOTICE_SCHEMA,
        technical_solution: GREENFIELD_SOURCE_CONTRACT_NOTICE_SCHEMA,
        ji_spec_responsibilities: {
          kind: "array",
          arrayKind: "list",
          items: { kind: "string" },
        },
        user_responsibilities: {
          kind: "array",
          arrayKind: "list",
          items: { kind: "string" },
        },
      },
    },
    source_documents: {
      kind: "object",
      required: ["requirements", "technical_solution"],
      additionalProperties: false,
      properties: {
        requirements: GREENFIELD_SOURCE_DOCUMENT_SCHEMA,
        technical_solution: GREENFIELD_SOURCE_DOCUMENT_SCHEMA,
      },
    },
    input_mode: { kind: "string" },
    input_status: { kind: "string" },
    blocking_issues: {
      kind: "array",
      arrayKind: "list",
      items: { kind: "string" },
    },
    warnings: {
      kind: "array",
      arrayKind: "list",
      items: { kind: "string" },
    },
    open_decisions: {
      kind: "array",
      arrayKind: "list",
      items: { kind: "string" },
    },
    open_questions: {
      kind: "object",
      required: ["path", "total", "blocking", "source_documents", "contracts", "behavior", "slices"],
      additionalProperties: false,
      properties: {
        path: { kind: "string" },
        generated_at: { kind: "string" },
        total: { kind: "number" },
        blocking: { kind: "number" },
        source_documents: { kind: "number" },
        contracts: { kind: "number" },
        behavior: { kind: "number" },
        slices: { kind: "number" },
      },
    },
  },
};

const GREENFIELD_SOURCE_SNAPSHOT_LAYER_SCHEMA: CanonicalSchema = {
  kind: "object",
  required: ["semantic_snapshot", "replay_seed"],
  additionalProperties: false,
  properties: {
    semantic_snapshot: GREENFIELD_SOURCE_SEMANTIC_SNAPSHOT_SCHEMA,
    replay_seed: GREENFIELD_SOURCE_REPLAY_SEED_SCHEMA,
  },
};

function buildGreenfieldSourceTruthFingerprintContextFromRecord(
  value: Record<string, unknown>,
): GreenfieldSourceTruthFingerprintContext | undefined {
  const version = numberValue(value.version);
  const canonicalizationSchemaVersion = numberValue(value.canonicalization_schema_version);
  const canonicalizationVersion = stringValue(value.canonicalization_version);
  const engineVersion = stringValue(value.engine_version);
  const orderingKey = stringValue(value.ordering_key);

  if (
    version !== 1 ||
    canonicalizationSchemaVersion === undefined ||
    !canonicalizationVersion ||
    !engineVersion ||
    !orderingKey
  ) {
    return undefined;
  }

  return {
    version: 1,
    canonicalization_version: canonicalizationVersion,
    canonicalization_schema_version: canonicalizationSchemaVersion,
    engine_version: engineVersion,
    ordering_key: orderingKey,
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
