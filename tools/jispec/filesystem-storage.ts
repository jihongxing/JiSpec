/**
 * Filesystem Storage Adapter
 *
 * Implements StorageAdapter for local filesystem operations.
 * Wraps Node.js fs module with async/await interface.
 */

import fs from "node:fs";
import path from "node:path";
import { StorageAdapter, ArtifactIdentity } from "./storage-adapter";

export class FilesystemStorage implements StorageAdapter {
  private root: string;

  constructor(root: string) {
    this.root = root;
  }

  /**
   * Resolve the physical path for an artifact identity
   */
  resolveArtifactPath(identity: ArtifactIdentity): string {
    const { sliceId, artifactType, logicalName } = identity;

    // Extract context from sliceId
    // For context-level artifacts: sliceId = "context:{contextId}"
    // For slice-level artifacts: sliceId = actual slice ID, need to extract context
    let contextId: string;
    if (sliceId.startsWith("context:")) {
      contextId = sliceId.substring(8); // Remove "context:" prefix
    } else {
      // Extract context from sliceId (e.g., "ordering" from "ordering-payment-v1")
      contextId = sliceId.split("-")[0];
    }

    switch (artifactType) {
      case "requirements":
      case "design":
      case "behavior":
      case "test":
      case "code":
        // Slice artifacts go in contexts/<context>/slices/<sliceId>/
        return path.join(this.root, "contexts", contextId, "slices", sliceId, logicalName || "");

      case "snapshot":
        // Snapshots go in .jispec/snapshots/<sliceId>/
        return path.join(this.root, ".jispec", "snapshots", sliceId, logicalName || "");

      case "report":
        // Reports go in .jispec/reports/
        return path.join(this.root, ".jispec", "reports", logicalName || "");

      case "evidence":
        // Evidence goes in .jispec/evidence/<sliceId>/
        return path.join(this.root, ".jispec", "evidence", sliceId, logicalName || "");

      case "trace":
        // Trace goes in contexts/<context>/slices/<sliceId>/trace.yaml
        return path.join(this.root, "contexts", contextId, "slices", sliceId, "trace.yaml");

      default:
        throw new Error(`Unknown artifact type: ${artifactType}`);
    }
  }

  /**
   * Write a file to storage
   */
  async writeFile(filePath: string, content: string | Buffer, encoding: BufferEncoding = "utf-8"): Promise<void> {
    // Ensure parent directory exists
    await this.mkdir(path.dirname(filePath));

    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, content, { encoding }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Read a file from storage
   */
  async readFile(filePath: string, encoding: BufferEncoding = "utf-8"): Promise<string | Buffer> {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, { encoding }, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  /**
   * Check if a file exists
   */
  async exists(filePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      fs.access(filePath, fs.constants.F_OK, (err) => {
        resolve(!err);
      });
    });
  }

  /**
   * Create a directory (recursive)
   */
  async mkdir(dirPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.mkdir(dirPath, { recursive: true }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Remove a file
   */
  async removeFile(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.unlink(filePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * List files in a directory
   */
  async listFiles(dirPath: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      fs.readdir(dirPath, (err, files) => {
        if (err) reject(err);
        else resolve(files);
      });
    });
  }

  /**
   * Remove a directory (recursive)
   */
  async removeDirectory(dirPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.rm(dirPath, { recursive: true, force: true }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Copy a file
   */
  async copyFile(source: string, destination: string): Promise<void> {
    // Ensure parent directory exists
    await this.mkdir(path.dirname(destination));

    return new Promise((resolve, reject) => {
      fs.copyFile(source, destination, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Synchronous write file (for compatibility with existing code)
   */
  writeFileSync(filePath: string, content: string | Buffer, encoding: BufferEncoding = "utf-8"): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, { encoding });
  }

  /**
   * Synchronous read file (for compatibility with existing code)
   */
  readFileSync(filePath: string, encoding: BufferEncoding = "utf-8"): string | Buffer {
    return fs.readFileSync(filePath, { encoding });
  }

  /**
   * Synchronous exists check (for compatibility with existing code)
   */
  existsSync(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  /**
   * Synchronous mkdir (for compatibility with existing code)
   */
  mkdirSync(dirPath: string): void {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  /**
   * Synchronous list files (for compatibility with existing code)
   */
  listFilesSync(dirPath: string): string[] {
    return fs.readdirSync(dirPath);
  }

  /**
   * Synchronous stat (for compatibility with existing code)
   */
  statSync(filePath: string): fs.Stats {
    return fs.statSync(filePath);
  }
}
