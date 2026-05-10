import { loadGreenfieldSourceManifest, normalizePath, type GreenfieldSourceSnapshotLayerModel } from "./source-documents";
import {
  computeGreenfieldSourceTruthFingerprint,
  type GreenfieldSourceTruthFingerprintContext,
} from "./truth-fingerprint";

export type GreenfieldSourceSnapshotVerificationStatus = "valid" | "invalid";

export interface GreenfieldSourceSnapshotVerificationIssue {
  code:
    | "GREENFIELD_SNAPSHOT_MANIFEST_MISSING"
    | "GREENFIELD_SNAPSHOT_SHAPE_INVALID"
    | "GREENFIELD_SNAPSHOT_LAYER_MISSING"
    | "GREENFIELD_SNAPSHOT_VERSION_MISMATCH"
    | "GREENFIELD_SNAPSHOT_FINGERPRINT_MISMATCH"
    | "GREENFIELD_SNAPSHOT_CONTEXT_MISMATCH"
    | "GREENFIELD_SNAPSHOT_EXPECTED_FINGERPRINT_MISMATCH"
    | "GREENFIELD_SNAPSHOT_EXPECTED_CONTEXT_MISMATCH";
  field?: string;
  message: string;
  expected?: string;
  actual?: string;
}

export interface GreenfieldSourceSnapshotVerificationOptions {
  expectedTruthFingerprint?: string;
  expectedContext?: Partial<GreenfieldSourceTruthFingerprintContext>;
}

export interface GreenfieldSourceSnapshotVerificationResult {
  status: GreenfieldSourceSnapshotVerificationStatus;
  valid: boolean;
  snapshot_path?: string;
  snapshot_version?: number;
  snapshot_id?: string;
  truth_fingerprint?: string;
  truth_fingerprint_context?: GreenfieldSourceTruthFingerprintContext;
  issues: GreenfieldSourceSnapshotVerificationIssue[];
}

export function verifyGreenfieldSourceSnapshot(
  snapshot: unknown,
  options: GreenfieldSourceSnapshotVerificationOptions = {},
): GreenfieldSourceSnapshotVerificationResult {
  const issues: GreenfieldSourceSnapshotVerificationIssue[] = [];
  const manifest = isRecord(snapshot) ? snapshot : undefined;

  if (!manifest) {
    issues.push({
      code: "GREENFIELD_SNAPSHOT_SHAPE_INVALID",
      message: "Snapshot must be a YAML/JSON object.",
      actual: describeValueType(snapshot),
    });
    return buildInvalidResult(issues);
  }

  const layer = extractSnapshotLayer(manifest, issues);
  if (!layer) {
    return buildInvalidResult(issues);
  }

  let computed;
  try {
    computed = computeGreenfieldSourceTruthFingerprint(layer);
  } catch (error) {
    issues.push({
      code: "GREENFIELD_SNAPSHOT_SHAPE_INVALID",
      field: "semantic_snapshot/replay_seed",
      message: error instanceof Error ? error.message : String(error),
    });
    return buildInvalidResult(issues);
  }

  const snapshotRecord = isRecord(manifest.snapshot) ? manifest.snapshot : undefined;
  const snapshotId = stringValue(snapshotRecord ? snapshotRecord["id"] : undefined);
  const snapshotVersion = numberValue(snapshotRecord ? snapshotRecord["version"] : undefined);
  const manifestFingerprint = stringValue(manifest.truth_fingerprint);
  const manifestContext = isRecord(manifest.truth_fingerprint_context) ? manifest.truth_fingerprint_context : undefined;

  if (snapshotVersion !== 1) {
    issues.push({
      code: "GREENFIELD_SNAPSHOT_VERSION_MISMATCH",
      field: "snapshot.version",
      message: "Snapshot version must be 1.",
      expected: "1",
      actual: snapshotVersion === undefined ? "missing" : String(snapshotVersion),
    });
  }

  if (!snapshotId) {
    issues.push({
      code: "GREENFIELD_SNAPSHOT_SHAPE_INVALID",
      field: "snapshot.id",
      message: "Snapshot id is missing.",
    });
  } else if (snapshotId !== computed.truth_fingerprint) {
    issues.push({
      code: "GREENFIELD_SNAPSHOT_FINGERPRINT_MISMATCH",
      field: "snapshot.id",
      message: "Snapshot id does not match the computed truth fingerprint.",
      expected: computed.truth_fingerprint,
      actual: snapshotId,
    });
  }

  if (!manifestFingerprint) {
    issues.push({
      code: "GREENFIELD_SNAPSHOT_SHAPE_INVALID",
      field: "truth_fingerprint",
      message: "truth_fingerprint is missing.",
    });
  } else if (manifestFingerprint !== computed.truth_fingerprint) {
    issues.push({
      code: "GREENFIELD_SNAPSHOT_FINGERPRINT_MISMATCH",
      field: "truth_fingerprint",
      message: "truth_fingerprint does not match the computed hash.",
      expected: computed.truth_fingerprint,
      actual: manifestFingerprint,
    });
  }

  if (!manifestContext) {
    issues.push({
      code: "GREENFIELD_SNAPSHOT_SHAPE_INVALID",
      field: "truth_fingerprint_context",
      message: "truth_fingerprint_context is missing.",
    });
  } else {
    compareFingerprintContext(manifestContext, computed.truth_fingerprint_context, issues);
  }

  if (options.expectedTruthFingerprint && options.expectedTruthFingerprint !== computed.truth_fingerprint) {
    issues.push({
      code: "GREENFIELD_SNAPSHOT_EXPECTED_FINGERPRINT_MISMATCH",
      field: "expectedTruthFingerprint",
      message: "Expected fingerprint does not match the computed fingerprint.",
      expected: options.expectedTruthFingerprint,
      actual: computed.truth_fingerprint,
    });
  }

  if (options.expectedContext) {
    compareExpectedContext(options.expectedContext, computed.truth_fingerprint_context, issues);
  }

  return {
    status: issues.length === 0 ? "valid" : "invalid",
    valid: issues.length === 0,
    snapshot_version: snapshotVersion,
    snapshot_id: snapshotId,
    truth_fingerprint: computed.truth_fingerprint,
    truth_fingerprint_context: computed.truth_fingerprint_context,
    issues,
  };
}

export function verifyGreenfieldSourceSnapshotFile(
  snapshotPath: string,
  options: GreenfieldSourceSnapshotVerificationOptions = {},
): GreenfieldSourceSnapshotVerificationResult {
  const manifest = loadGreenfieldSourceManifest(snapshotPath);
  if (!manifest) {
    return {
      status: "invalid",
      valid: false,
      snapshot_path: normalizePath(snapshotPath),
      issues: [
        {
          code: "GREENFIELD_SNAPSHOT_MANIFEST_MISSING",
          field: "snapshot_path",
          message: `Snapshot manifest could not be loaded: ${normalizePath(snapshotPath)}.`,
        },
      ],
    };
  }

  return {
    ...verifyGreenfieldSourceSnapshot(manifest, options),
    snapshot_path: normalizePath(snapshotPath),
  };
}

export function renderGreenfieldSourceSnapshotVerificationText(
  result: GreenfieldSourceSnapshotVerificationResult,
): string {
  const lines = [
    "Greenfield snapshot verification",
    `Status: ${result.status}`,
    `Snapshot path: ${result.snapshot_path ?? "not provided"}`,
    `Snapshot version: ${result.snapshot_version ?? "unknown"}`,
    `Snapshot id: ${result.snapshot_id ?? "unknown"}`,
    `Truth fingerprint: ${result.truth_fingerprint ?? "unknown"}`,
  ];

  if (result.truth_fingerprint_context) {
    lines.push(
      `Canonicalization: ${result.truth_fingerprint_context.canonicalization_version}`,
      `Schema version: ${result.truth_fingerprint_context.canonicalization_schema_version}`,
      `Engine version: ${result.truth_fingerprint_context.engine_version}`,
      `Ordering key: ${result.truth_fingerprint_context.ordering_key}`,
    );
  }

  if (result.issues.length > 0) {
    lines.push("", "Issues:");
    lines.push(...result.issues.map((issue) =>
      `- ${issue.code}${issue.field ? ` [${issue.field}]` : ""}: ${issue.message}`,
    ));
  }

  return lines.join("\n");
}

function extractSnapshotLayer(
  manifest: Record<string, unknown>,
  issues: GreenfieldSourceSnapshotVerificationIssue[],
): GreenfieldSourceSnapshotLayerModel | undefined {
  const semanticSnapshot = isRecord(manifest.semantic_snapshot) ? manifest.semantic_snapshot : undefined;
  const replaySeed = isRecord(manifest.replay_seed) ? manifest.replay_seed : undefined;

  if (!semanticSnapshot) {
    issues.push({
      code: "GREENFIELD_SNAPSHOT_LAYER_MISSING",
      field: "semantic_snapshot",
      message: "semantic_snapshot is missing.",
    });
  }

  if (!replaySeed) {
    issues.push({
      code: "GREENFIELD_SNAPSHOT_LAYER_MISSING",
      field: "replay_seed",
      message: "replay_seed is missing.",
    });
  }

  if (!semanticSnapshot || !replaySeed) {
    return undefined;
  }

  return {
    semantic_snapshot: semanticSnapshot as unknown as GreenfieldSourceSnapshotLayerModel["semantic_snapshot"],
    replay_seed: replaySeed as unknown as GreenfieldSourceSnapshotLayerModel["replay_seed"],
  };
}

function compareFingerprintContext(
  actual: Record<string, unknown>,
  expected: GreenfieldSourceTruthFingerprintContext,
  issues: GreenfieldSourceSnapshotVerificationIssue[],
): void {
  compareContextField(actual, expected, "version", issues, "GREENFIELD_SNAPSHOT_CONTEXT_MISMATCH");
  compareContextField(actual, expected, "canonicalization_version", issues, "GREENFIELD_SNAPSHOT_CONTEXT_MISMATCH");
  compareContextField(actual, expected, "canonicalization_schema_version", issues, "GREENFIELD_SNAPSHOT_CONTEXT_MISMATCH");
  compareContextField(actual, expected, "engine_version", issues, "GREENFIELD_SNAPSHOT_CONTEXT_MISMATCH");
  compareContextField(actual, expected, "ordering_key", issues, "GREENFIELD_SNAPSHOT_CONTEXT_MISMATCH");
}

function compareExpectedContext(
  expected: Partial<GreenfieldSourceTruthFingerprintContext>,
  actual: GreenfieldSourceTruthFingerprintContext,
  issues: GreenfieldSourceSnapshotVerificationIssue[],
): void {
  for (const key of Object.keys(expected) as Array<keyof GreenfieldSourceTruthFingerprintContext>) {
    const expectedValue = expected[key];
    if (expectedValue === undefined) {
      continue;
    }
    const actualValue = actual[key];
    if (actualValue !== expectedValue) {
      issues.push({
        code: "GREENFIELD_SNAPSHOT_EXPECTED_CONTEXT_MISMATCH",
        field: `expectedContext.${String(key)}`,
        message: "Expected context does not match the computed fingerprint context.",
        expected: String(expectedValue),
        actual: String(actualValue),
      });
    }
  }
}

function compareContextField(
  actual: Record<string, unknown>,
  expected: GreenfieldSourceTruthFingerprintContext,
  key: keyof GreenfieldSourceTruthFingerprintContext,
  issues: GreenfieldSourceSnapshotVerificationIssue[],
  code: GreenfieldSourceSnapshotVerificationIssue["code"],
): void {
  const actualValue = actual[key];
  const expectedValue = expected[key];
  if (actualValue === undefined) {
    issues.push({
      code,
      field: `truth_fingerprint_context.${String(key)}`,
      message: `truth_fingerprint_context.${String(key)} is missing.`,
      expected: String(expectedValue),
      actual: "missing",
    });
    return;
  }

  if (actualValue !== expectedValue) {
    issues.push({
      code,
      field: `truth_fingerprint_context.${String(key)}`,
      message: `truth_fingerprint_context.${String(key)} does not match the computed context.`,
      expected: String(expectedValue),
      actual: String(actualValue),
    });
  }
}

function buildInvalidResult(issues: GreenfieldSourceSnapshotVerificationIssue[]): GreenfieldSourceSnapshotVerificationResult {
  return {
    status: "invalid",
    valid: false,
    issues,
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeValueType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}
