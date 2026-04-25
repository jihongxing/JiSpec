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
 * Create artifact identity for directory/container outputs.
 */
export function createDirectoryIdentity(
  directoryPath: string,
  sliceId: string,
  stageId: string,
  artifactType: ArtifactType = "code"
): ArtifactIdentity {
  const normalizedPath = directoryPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const directoryName = normalizedPath.split("/").pop() || "root";

  return {
    sliceId,
    stageId,
    artifactType,
    artifactId: directoryName,
    logicalName: directoryName,
  };
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
 * - contexts/{context}/slices/{sliceId}/{artifactFile} (slice-level)
 * - contexts/{context}/{artifactFile} (context-level)
 *
 * Supports both POSIX (/) and Windows (\) path separators
 */
export function fromPath(path: string, stageId: string, sliceId?: string): ArtifactIdentity {
  // Normalize path separators to forward slashes for consistent parsing
  const normalizedPath = path.replace(/\\/g, "/");

  // Extract slice ID from path or use provided sliceId
  const sliceMatch = normalizedPath.match(/slices\/([^\/]+)\//);
  const extractedSliceId = sliceMatch ? sliceMatch[1] : sliceId;

  if (!extractedSliceId) {
    // Context-level artifact (no slice in path)
    const contextMatch = normalizedPath.match(/contexts\/([^\/]+)\//);
    if (contextMatch) {
      const contextId = contextMatch[1];
      const fileName = normalizedPath.split("/").pop() || "";

      // Context-level artifacts use context ID as sliceId
      return {
        sliceId: `context:${contextId}`,
        stageId,
        artifactType: inferArtifactType(fileName),
        artifactId: inferArtifactId(fileName),
        logicalName: fileName,
      };
    }

    throw new Error(`Cannot extract sliceId or contextId from path: ${path}`);
  }

  // Extract artifact file name
  const fileName = normalizedPath.split("/").pop() || "";

  return {
    sliceId: extractedSliceId,
    stageId,
    artifactType: inferArtifactType(fileName),
    artifactId: inferArtifactId(fileName),
    logicalName: fileName,
  };
}

/**
 * Infer artifact type from file name
 */
function inferArtifactType(fileName: string): ArtifactType {
  if (fileName === "requirements.md") return "requirements";
  if (fileName === "design.md") return "design";
  if (fileName === "behaviors.feature") return "behavior";
  if (fileName === "test-spec.yaml") return "test";
  if (fileName.endsWith(".test.ts") || fileName.endsWith(".spec.ts")) return "test";
  if (fileName === "trace.yaml") return "trace";
  if (fileName === "context.yaml" || fileName === "contracts.yaml") return "requirements";
  return "code";
}

/**
 * Infer artifact ID from file name
 */
function inferArtifactId(fileName: string): string {
  if (fileName === "requirements.md") return "requirements";
  if (fileName === "design.md") return "design";
  if (fileName === "behaviors.feature") return "behaviors";
  if (fileName === "test-spec.yaml") return "test-spec";
  if (fileName === "trace.yaml") return "trace";
  if (fileName === "context.yaml") return "context";
  if (fileName === "contracts.yaml") return "contracts";
  if (fileName.endsWith(".test.ts") || fileName.endsWith(".spec.ts")) {
    return fileName.replace(/\.(test|spec)\.ts$/, "");
  }
  if (fileName.endsWith(".ts") || fileName.endsWith(".js")) {
    return fileName.replace(/\.(ts|js)$/, "");
  }
  if (fileName.endsWith(".txt")) {
    return fileName.replace(/\.txt$/, "");
  }
  return fileName;
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
