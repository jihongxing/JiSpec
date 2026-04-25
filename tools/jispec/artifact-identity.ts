/**
 * Artifact Identity
 *
 * Unified identity model for all artifacts in the JiSpec execution pipeline.
 * This is the single source of truth for artifact identification, independent
 * of physical storage location.
 *
 * Design principles:
 * - Identity is logical, not physical
 * - Identity is portable across storage backends
 * - Identity is stable across execution contexts
 * - Identity can be encoded/decoded for trace links and cache keys
 */

/**
 * Artifact type enumeration
 */
export type ArtifactType =
  | "requirements"
  | "design"
  | "behavior"
  | "test"
  | "code"
  | "evidence"
  | "trace"
  | "snapshot"
  | "report";

/**
 * Artifact identity
 */
export interface ArtifactIdentity {
  sliceId: string;
  stageId: string;
  artifactType: ArtifactType;
  artifactId: string;
  logicalName?: string;
}

/**
 * Encode artifact identity to a stable string representation
 * Format: sliceId:stageId:artifactType:artifactId[:logicalName]
 */
export function encodeIdentity(identity: ArtifactIdentity): string {
  const parts = [
    identity.sliceId,
    identity.stageId,
    identity.artifactType,
    identity.artifactId,
  ];

  if (identity.logicalName) {
    parts.push(identity.logicalName);
  }

  return parts.join(":");
}

/**
 * Decode artifact identity from string representation
 */
export function decodeIdentity(encoded: string): ArtifactIdentity {
  const parts = encoded.split(":");

  if (parts.length < 4) {
    throw new Error(`Invalid encoded identity: ${encoded}`);
  }

  return {
    sliceId: parts[0],
    stageId: parts[1],
    artifactType: parts[2] as ArtifactType,
    artifactId: parts[3],
    logicalName: parts[4],
  };
}

/**
 * Create artifact identity from physical path
 * Infers identity from conventional path structure:
 * contexts/{context}/slices/{sliceId}/{artifactFile}
 */
export function fromPath(path: string, stageId: string): ArtifactIdentity {
  // Extract slice ID from path
  const sliceMatch = path.match(/slices\/([^\/]+)\//);
  if (!sliceMatch) {
    throw new Error(`Cannot extract sliceId from path: ${path}`);
  }
  const sliceId = sliceMatch[1];

  // Extract artifact file name
  const fileName = path.split("/").pop() || "";

  // Infer artifact type from file extension/name
  let artifactType: ArtifactType;
  let artifactId: string;

  if (fileName === "requirements.md") {
    artifactType = "requirements";
    artifactId = "requirements";
  } else if (fileName === "design.md") {
    artifactType = "design";
    artifactId = "design";
  } else if (fileName === "behaviors.feature") {
    artifactType = "behavior";
    artifactId = "behaviors";
  } else if (fileName.endsWith(".test.ts") || fileName.endsWith(".spec.ts")) {
    artifactType = "test";
    artifactId = fileName.replace(/\.(test|spec)\.ts$/, "");
  } else if (fileName.endsWith(".ts") || fileName.endsWith(".js")) {
    artifactType = "code";
    artifactId = fileName.replace(/\.(ts|js)$/, "");
  } else if (fileName === "trace.yaml") {
    artifactType = "trace";
    artifactId = "trace";
  } else {
    // Default: use file name as-is
    artifactType = "code";
    artifactId = fileName;
  }

  return {
    sliceId,
    stageId,
    artifactType,
    artifactId,
    logicalName: fileName,
  };
}

/**
 * Convert artifact identity to trace reference format
 * Used in trace.yaml for linking artifacts
 */
export function toTraceRef(identity: ArtifactIdentity): string {
  // Trace ref format: {artifactType}:{artifactId}
  return `${identity.artifactType}:${identity.artifactId}`;
}

/**
 * Parse trace reference back to partial identity
 * Returns artifactType and artifactId, caller must provide sliceId/stageId
 */
export function fromTraceRef(traceRef: string): Pick<ArtifactIdentity, "artifactType" | "artifactId"> {
  const parts = traceRef.split(":");

  if (parts.length !== 2) {
    throw new Error(`Invalid trace reference: ${traceRef}`);
  }

  return {
    artifactType: parts[0] as ArtifactType,
    artifactId: parts[1],
  };
}

/**
 * Check if two identities refer to the same artifact
 */
export function identityEquals(a: ArtifactIdentity, b: ArtifactIdentity): boolean {
  return (
    a.sliceId === b.sliceId &&
    a.stageId === b.stageId &&
    a.artifactType === b.artifactType &&
    a.artifactId === b.artifactId
  );
}

/**
 * Create a canonical artifact ID from identity
 * Used for cache keys and deduplication
 */
export function toCanonicalId(identity: ArtifactIdentity): string {
  return `${identity.sliceId}/${identity.stageId}/${identity.artifactType}/${identity.artifactId}`;
}
