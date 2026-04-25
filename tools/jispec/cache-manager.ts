/**
 * Cache Manager
 *
 * Manages cache manifests and cached execution results.
 * Responsibilities:
 * - Store and retrieve cache manifests
 * - Store and retrieve cached execution results
 * - Validate cache entries
 * - Invalidate cache entries
 * - Query cache by key or identity
 *
 * Uses StorageAdapter for all I/O operations.
 */

import path from 'node:path';
import type { StorageAdapter } from './storage-adapter.js';
import type { CacheKey } from './cache-key.js';
import type { CacheManifest } from './cache-manifest.js';
import {
  serializeManifest,
  deserializeManifest,
  isValid,
  touchManifest,
  invalidateManifest,
} from './cache-manifest.js';
import type { StageExecutionResult } from './stage-execution-result.js';
import type { ArtifactIdentity } from './artifact-identity.js';

/**
 * Cache manager
 */
export class CacheManager {
  private storage: StorageAdapter;
  private cacheDir: string;

  constructor(storage: StorageAdapter, root: string) {
    this.storage = storage;
    this.cacheDir = path.join(root, '.jispec-cache');
  }

  /**
   * Get manifest path for a cache key
   */
  private getManifestPath(cacheKey: CacheKey): string {
    // Extract hash from cache key (format: "cache:hash")
    const hash = cacheKey.replace(/^cache:/, '');
    return path.join(this.cacheDir, 'manifests', `${hash}.json`);
  }

  /**
   * Get result path for a cache key
   */
  private getResultPath(cacheKey: CacheKey): string {
    const hash = cacheKey.replace(/^cache:/, '');
    return path.join(this.cacheDir, 'results', `${hash}.json`);
  }

  /**
   * Store cache manifest
   */
  async storeManifest(manifest: CacheManifest): Promise<void> {
    const manifestPath = this.getManifestPath(manifest.cacheKey);
    const serialized = serializeManifest(manifest);
    await this.storage.writeFile(manifestPath, serialized);
  }

  /**
   * Retrieve cache manifest
   */
  async getManifest(cacheKey: CacheKey): Promise<CacheManifest | null> {
    const manifestPath = this.getManifestPath(cacheKey);

    if (!await this.storage.exists(manifestPath)) {
      return null;
    }

    const content = await this.storage.readFile(manifestPath);
    return deserializeManifest(typeof content === 'string' ? content : content.toString('utf8'));
  }

  /**
   * Store execution result
   */
  async storeResult(cacheKey: CacheKey, result: StageExecutionResult): Promise<void> {
    const resultPath = this.getResultPath(cacheKey);
    const serialized = JSON.stringify(result, null, 2);
    await this.storage.writeFile(resultPath, serialized);
  }

  /**
   * Retrieve execution result
   */
  async getResult(cacheKey: CacheKey): Promise<StageExecutionResult | null> {
    const resultPath = this.getResultPath(cacheKey);

    if (!await this.storage.exists(resultPath)) {
      return null;
    }

    const content = await this.storage.readFile(resultPath);
    return JSON.parse(typeof content === 'string' ? content : content.toString('utf8'));
  }

  /**
   * Check if cache entry exists and is valid
   */
  async isValid(cacheKey: CacheKey): Promise<boolean> {
    const manifest = await this.getManifest(cacheKey);

    if (!manifest) {
      return false;
    }

    return isValid(manifest);
  }

  /**
   * Get cached result if valid
   */
  async get(cacheKey: CacheKey): Promise<StageExecutionResult | null> {
    const manifest = await this.getManifest(cacheKey);

    if (!manifest || !isValid(manifest)) {
      return null;
    }

    // Update last accessed timestamp
    const touched = touchManifest(manifest);
    await this.storeManifest(touched);

    return await this.getResult(cacheKey);
  }

  /**
   * Store cache entry (manifest + result)
   */
  async put(manifest: CacheManifest, result: StageExecutionResult): Promise<void> {
    await this.storeManifest(manifest);
    await this.storeResult(manifest.cacheKey, result);
  }

  /**
   * Invalidate cache entry
   */
  async invalidate(
    cacheKey: CacheKey,
    reason: 'input_changed' | 'dependency_changed' | 'contract_changed' | 'manual' | 'expired',
    details: string
  ): Promise<void> {
    const manifest = await this.getManifest(cacheKey);

    if (!manifest) {
      return;
    }

    const invalidated = invalidateManifest(manifest, reason, details);
    await this.storeManifest(invalidated);
  }

  /**
   * List all cache manifests
   */
  async listManifests(): Promise<CacheManifest[]> {
    const manifestsDir = path.join(this.cacheDir, 'manifests');

    if (!await this.storage.exists(manifestsDir)) {
      return [];
    }

    const files = await this.storage.listFiles(manifestsDir);
    const manifests: CacheManifest[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }

      const manifestPath = path.join(manifestsDir, file);
      const content = await this.storage.readFile(manifestPath);
      manifests.push(deserializeManifest(typeof content === 'string' ? content : content.toString('utf8')));
    }

    return manifests;
  }

  /**
   * Find manifests by slice ID
   */
  async findBySlice(sliceId: string): Promise<CacheManifest[]> {
    const allManifests = await this.listManifests();
    return allManifests.filter(m => m.keyInputs.sliceId === sliceId);
  }

  /**
   * Find manifests by stage ID
   */
  async findByStage(sliceId: string, stageId: string): Promise<CacheManifest[]> {
    const allManifests = await this.listManifests();
    return allManifests.filter(
      m => m.keyInputs.sliceId === sliceId && m.keyInputs.stageId === stageId
    );
  }

  /**
   * Find manifests by artifact identity
   */
  async findByIdentity(identity: ArtifactIdentity): Promise<CacheManifest[]> {
    const allManifests = await this.listManifests();
    return allManifests.filter(m => {
      const keyIdentity = m.keyInputs.identity;
      return (
        keyIdentity.sliceId === identity.sliceId &&
        keyIdentity.stageId === identity.stageId &&
        keyIdentity.artifactType === identity.artifactType &&
        keyIdentity.artifactId === identity.artifactId
      );
    });
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    if (await this.storage.exists(this.cacheDir)) {
      await this.storage.removeDirectory(this.cacheDir);
    }
  }

  /**
   * Clear invalid/expired cache entries
   */
  async prune(): Promise<number> {
    const allManifests = await this.listManifests();
    let pruned = 0;

    for (const manifest of allManifests) {
      if (!isValid(manifest)) {
        const manifestPath = this.getManifestPath(manifest.cacheKey);
        const resultPath = this.getResultPath(manifest.cacheKey);

        await this.storage.removeFile(manifestPath);

        if (await this.storage.exists(resultPath)) {
          await this.storage.removeFile(resultPath);
        }

        pruned++;
      }
    }

    return pruned;
  }
}
