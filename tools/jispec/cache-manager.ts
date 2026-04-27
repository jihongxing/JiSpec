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

export interface CacheManagerStats {
  manifestL1Hits: number;
  manifestL2Hits: number;
  resultL1Hits: number;
  resultL2Hits: number;
  misses: number;
  puts: number;
  invalidations: number;
  memoryManifests: number;
  memoryResults: number;
}

export interface CacheWarmupResult {
  requested: number;
  loaded: number;
  missing: number;
}

/**
 * Cache manager
 */
export class CacheManager {
  private storage: StorageAdapter;
  private cacheDir: string;
  private manifestMemory = new Map<CacheKey, CacheManifest>();
  private resultMemory = new Map<CacheKey, unknown>();
  private stats: CacheManagerStats = {
    manifestL1Hits: 0,
    manifestL2Hits: 0,
    resultL1Hits: 0,
    resultL2Hits: 0,
    misses: 0,
    puts: 0,
    invalidations: 0,
    memoryManifests: 0,
    memoryResults: 0,
  };

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
    this.manifestMemory.set(manifest.cacheKey, manifest);
    this.stats.memoryManifests = this.manifestMemory.size;
  }

  /**
   * Retrieve cache manifest
   */
  async getManifest(cacheKey: CacheKey): Promise<CacheManifest | null> {
    const memoryManifest = this.manifestMemory.get(cacheKey);
    if (memoryManifest) {
      this.stats.manifestL1Hits++;
      return memoryManifest;
    }

    const manifestPath = this.getManifestPath(cacheKey);

    if (!await this.storage.exists(manifestPath)) {
      this.stats.misses++;
      return null;
    }

    const content = await this.storage.readFile(manifestPath);
    const manifest = deserializeManifest(typeof content === 'string' ? content : content.toString('utf8'));
    this.manifestMemory.set(cacheKey, manifest);
    this.stats.manifestL2Hits++;
    this.stats.memoryManifests = this.manifestMemory.size;
    return manifest;
  }

  /**
   * Store typed cache value
   */
  async storeValue<T>(cacheKey: CacheKey, value: T): Promise<void> {
    const resultPath = this.getResultPath(cacheKey);
    const serialized = JSON.stringify(value, null, 2);
    await this.storage.writeFile(resultPath, serialized);
    this.resultMemory.set(cacheKey, value);
    this.stats.memoryResults = this.resultMemory.size;
  }

  /**
   * Retrieve typed cache value without manifest validation
   */
  async getStoredValue<T>(cacheKey: CacheKey): Promise<T | null> {
    if (this.resultMemory.has(cacheKey)) {
      this.stats.resultL1Hits++;
      return this.resultMemory.get(cacheKey) as T;
    }

    const resultPath = this.getResultPath(cacheKey);

    if (!await this.storage.exists(resultPath)) {
      this.stats.misses++;
      return null;
    }

    const content = await this.storage.readFile(resultPath);
    const value = JSON.parse(typeof content === 'string' ? content : content.toString('utf8')) as T;
    this.resultMemory.set(cacheKey, value);
    this.stats.resultL2Hits++;
    this.stats.memoryResults = this.resultMemory.size;
    return value;
  }

  /**
   * Store execution result
   */
  async storeResult(cacheKey: CacheKey, result: StageExecutionResult): Promise<void> {
    await this.storeValue(cacheKey, result);
  }

  /**
   * Retrieve execution result without manifest validation
   */
  async getResult(cacheKey: CacheKey): Promise<StageExecutionResult | null> {
    return this.getStoredValue<StageExecutionResult>(cacheKey);
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
  async get<T = StageExecutionResult>(cacheKey: CacheKey): Promise<T | null> {
    const manifest = await this.getManifest(cacheKey);

    if (!manifest || !isValid(manifest)) {
      if (manifest && !isValid(manifest)) {
        this.manifestMemory.delete(cacheKey);
        this.resultMemory.delete(cacheKey);
        this.stats.memoryManifests = this.manifestMemory.size;
        this.stats.memoryResults = this.resultMemory.size;
      }
      return null;
    }

    // Update last accessed timestamp
    const touched = touchManifest(manifest);
    await this.storeManifest(touched);

    return await this.getStoredValue<T>(cacheKey);
  }

  /**
   * Store cache entry (manifest + result)
   */
  async put<T = StageExecutionResult>(manifest: CacheManifest, result: T): Promise<void> {
    await this.storeManifest(manifest);
    await this.storeValue(manifest.cacheKey, result);
    this.stats.puts++;
  }

  /**
   * Preload valid cache entries into L1 memory.
   */
  async warmup(cacheKeys: CacheKey[]): Promise<CacheWarmupResult> {
    let loaded = 0;
    let missing = 0;

    for (const cacheKey of cacheKeys) {
      const manifest = await this.getManifest(cacheKey);
      if (!manifest || !isValid(manifest)) {
        missing++;
        continue;
      }

      const value = await this.getStoredValue(cacheKey);
      if (value === null) {
        missing++;
        continue;
      }

      loaded++;
    }

    return {
      requested: cacheKeys.length,
      loaded,
      missing,
    };
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
    this.resultMemory.delete(cacheKey);
    this.stats.invalidations++;
    this.stats.memoryResults = this.resultMemory.size;
  }

  /**
   * Invalidate all cache entries for a slice.
   */
  async invalidateBySlice(
    sliceId: string,
    reason: 'input_changed' | 'dependency_changed' | 'contract_changed' | 'manual' | 'expired',
    details: string
  ): Promise<number> {
    const manifests = await this.findBySlice(sliceId);
    for (const manifest of manifests) {
      await this.invalidate(manifest.cacheKey, reason, details);
    }
    return manifests.length;
  }

  /**
   * Invalidate all cache entries for a slice/stage.
   */
  async invalidateByStage(
    sliceId: string,
    stageId: string,
    reason: 'input_changed' | 'dependency_changed' | 'contract_changed' | 'manual' | 'expired',
    details: string
  ): Promise<number> {
    const manifests = await this.findByStage(sliceId, stageId);
    for (const manifest of manifests) {
      await this.invalidate(manifest.cacheKey, reason, details);
    }
    return manifests.length;
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
   * Warm all valid entries for a slice into L1.
   */
  async warmupSlice(sliceId: string): Promise<CacheWarmupResult> {
    const manifests = await this.findBySlice(sliceId);
    return this.warmup(manifests.map((manifest) => manifest.cacheKey));
  }

  /**
   * Warm all valid entries for a slice/stage into L1.
   */
  async warmupStage(sliceId: string, stageId: string): Promise<CacheWarmupResult> {
    const manifests = await this.findByStage(sliceId, stageId);
    return this.warmup(manifests.map((manifest) => manifest.cacheKey));
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    if (await this.storage.exists(this.cacheDir)) {
      await this.storage.removeDirectory(this.cacheDir);
    }
    this.manifestMemory.clear();
    this.resultMemory.clear();
    this.stats.memoryManifests = 0;
    this.stats.memoryResults = 0;
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

        this.manifestMemory.delete(manifest.cacheKey);
        this.resultMemory.delete(manifest.cacheKey);

        pruned++;
      }
    }

    this.stats.memoryManifests = this.manifestMemory.size;
    this.stats.memoryResults = this.resultMemory.size;
    return pruned;
  }

  getStats(): CacheManagerStats {
    return {
      ...this.stats,
      memoryManifests: this.manifestMemory.size,
      memoryResults: this.resultMemory.size,
    };
  }
}
