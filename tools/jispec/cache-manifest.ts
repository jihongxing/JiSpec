/**
 * Cache Manifest Specification
 *
 * Defines the structure and operations for cache manifests.
 * A manifest records:
 * - Cache key and its composition
 * - Input/output artifact snapshots
 * - Provider/contract/schema versions
 * - Cache status (hit, miss, invalidated)
 * - Creation and access timestamps
 *
 * Design principles:
 * - Manifest is the single source of truth for cache validity
 * - Manifest captures enough context to explain hit/miss decisions
 * - Manifest supports dependency tracking and invalidation
 * - Manifest is portable across storage backends
 */

import type { CacheKey, CacheKeyInputs } from './cache-key.js';
import type { ArtifactIdentity } from './artifact-identity.js';

/**
 * Cache status
 */
export type CacheStatus = 'valid' | 'invalidated' | 'expired';

/**
 * Artifact snapshot (identity + content hash)
 */
export interface ArtifactSnapshot {
  identity: ArtifactIdentity;
  contentHash: string;
  timestamp: string;  // ISO 8601 timestamp when snapshot was taken
}

/**
 * Invalidation reason
 */
export interface InvalidationReason {
  reason: 'input_changed' | 'dependency_changed' | 'contract_changed' | 'manual' | 'expired';
  details: string;
  timestamp: string;  // ISO 8601 timestamp when invalidated
}

/**
 * Cache manifest
 */
export interface CacheManifest {
  // Cache key
  cacheKey: CacheKey;

  // Key composition (for debugging and invalidation)
  keyInputs: CacheKeyInputs;

  // Input snapshots (what went in)
  inputSnapshots: ArtifactSnapshot[];

  // Output snapshots (what came out)
  outputSnapshots: ArtifactSnapshot[];

  // Provider configuration
  provider: {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  };

  // Contract and schema versions
  contractHash: string;
  schemaVersion: string;

  // Status
  status: CacheStatus;
  invalidationReason?: InvalidationReason;

  // Timestamps
  createdAt: string;      // ISO 8601 timestamp when cache entry was created
  lastAccessedAt: string; // ISO 8601 timestamp when cache was last accessed
  expiresAt?: string;     // ISO 8601 timestamp when cache expires (optional TTL)

  // Metadata
  executionTimeMs?: number;  // How long the original execution took
  metadata?: Record<string, unknown>;  // Additional metadata
}

/**
 * Create a new cache manifest
 */
export function createManifest(
  cacheKey: CacheKey,
  keyInputs: CacheKeyInputs,
  inputSnapshots: ArtifactSnapshot[],
  outputSnapshots: ArtifactSnapshot[],
  options?: {
    executionTimeMs?: number;
    ttlSeconds?: number;
    metadata?: Record<string, unknown>;
  }
): CacheManifest {
  const now = new Date().toISOString();

  return {
    cacheKey,
    keyInputs,
    inputSnapshots,
    outputSnapshots,
    provider: {
      provider: keyInputs.providerConfig.provider,
      model: keyInputs.providerConfig.model,
      temperature: keyInputs.providerConfig.temperature,
      maxTokens: keyInputs.providerConfig.maxTokens,
    },
    contractHash: keyInputs.contractVersion.contractHash,
    schemaVersion: keyInputs.contractVersion.schemaVersion,
    status: 'valid',
    createdAt: now,
    lastAccessedAt: now,
    expiresAt: options?.ttlSeconds
      ? new Date(Date.now() + options.ttlSeconds * 1000).toISOString()
      : undefined,
    executionTimeMs: options?.executionTimeMs,
    metadata: options?.metadata,
  };
}

/**
 * Invalidate a manifest
 */
export function invalidateManifest(
  manifest: CacheManifest,
  reason: InvalidationReason['reason'],
  details: string
): CacheManifest {
  return {
    ...manifest,
    status: 'invalidated',
    invalidationReason: {
      reason,
      details,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Update last accessed timestamp
 */
export function touchManifest(manifest: CacheManifest): CacheManifest {
  return {
    ...manifest,
    lastAccessedAt: new Date().toISOString(),
  };
}

/**
 * Check if manifest is expired
 */
export function isExpired(manifest: CacheManifest): boolean {
  if (!manifest.expiresAt) {
    return false;
  }

  return new Date(manifest.expiresAt) < new Date();
}

/**
 * Check if manifest is valid (not invalidated or expired)
 */
export function isValid(manifest: CacheManifest): boolean {
  if (manifest.status === 'invalidated') {
    return false;
  }

  if (isExpired(manifest)) {
    return false;
  }

  return true;
}

/**
 * Serialize manifest to JSON
 */
export function serializeManifest(manifest: CacheManifest): string {
  return JSON.stringify(manifest, null, 2);
}

/**
 * Deserialize manifest from JSON
 */
export function deserializeManifest(json: string): CacheManifest {
  return JSON.parse(json);
}

/**
 * Debug display of manifest
 */
export function debugManifest(manifest: CacheManifest): string {
  const lines: string[] = [];

  lines.push('Cache Manifest:');
  lines.push(`  Key: ${manifest.cacheKey}`);
  lines.push(`  Status: ${manifest.status}`);

  if (manifest.invalidationReason) {
    lines.push(`  Invalidation: ${manifest.invalidationReason.reason} - ${manifest.invalidationReason.details}`);
    lines.push(`    at ${manifest.invalidationReason.timestamp}`);
  }

  lines.push(`  Created: ${manifest.createdAt}`);
  lines.push(`  Last Accessed: ${manifest.lastAccessedAt}`);

  if (manifest.expiresAt) {
    const expired = isExpired(manifest);
    lines.push(`  Expires: ${manifest.expiresAt} ${expired ? '(EXPIRED)' : ''}`);
  }

  if (manifest.executionTimeMs !== undefined) {
    lines.push(`  Execution Time: ${manifest.executionTimeMs}ms`);
  }

  lines.push(`  Provider: ${manifest.provider.provider}/${manifest.provider.model}`);
  lines.push(`  Contract: ${manifest.contractHash.slice(0, 8)}... (schema ${manifest.schemaVersion})`);

  lines.push(`  Input Snapshots (${manifest.inputSnapshots.length}):`);
  for (const snapshot of manifest.inputSnapshots) {
    lines.push(`    - ${snapshot.identity.artifactType}:${snapshot.identity.artifactId} [${snapshot.contentHash.slice(0, 8)}...] @ ${snapshot.timestamp}`);
  }

  lines.push(`  Output Snapshots (${manifest.outputSnapshots.length}):`);
  for (const snapshot of manifest.outputSnapshots) {
    lines.push(`    - ${snapshot.identity.artifactType}:${snapshot.identity.artifactId} [${snapshot.contentHash.slice(0, 8)}...] @ ${snapshot.timestamp}`);
  }

  return lines.join('\n');
}
