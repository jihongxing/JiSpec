/**
 * Storage Adapter Interface
 *
 * Abstracts storage operations to support multiple backends:
 * - Local filesystem (Phase 5.1)
 * - Object storage (Phase 5.2+)
 * - Remote worker storage (Phase 5.2+)
 * - Distributed cache (Phase 5.2+)
 */

export interface ArtifactIdentity {
  sliceId: string;
  stageId: string;
  artifactType: "requirements" | "design" | "behavior" | "test" | "code" | "evidence" | "trace" | "snapshot" | "report";
  artifactId: string;
  logicalName?: string;
}

export interface StorageAdapter {
  /**
   * Resolve the physical path for an artifact identity
   */
  resolveArtifactPath(identity: ArtifactIdentity): string;

  /**
   * Write a file to storage
   */
  writeFile(path: string, content: string | Buffer, encoding?: BufferEncoding): Promise<void>;

  /**
   * Read a file from storage
   */
  readFile(path: string, encoding?: BufferEncoding): Promise<string | Buffer>;

  /**
   * Check if a file exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * Create a directory (recursive)
   */
  mkdir(path: string): Promise<void>;

  /**
   * Remove a file
   */
  removeFile(path: string): Promise<void>;

  /**
   * List files in a directory
   */
  listFiles(path: string): Promise<string[]>;

  /**
   * Remove a directory (recursive)
   */
  removeDirectory(path: string): Promise<void>;

  /**
   * Copy a file
   */
  copyFile(source: string, destination: string): Promise<void>;
}
