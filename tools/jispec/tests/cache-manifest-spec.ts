/**
 * Cache Manifest Tests
 *
 * Verifies:
 * - Manifest creation and serialization
 * - Manifest invalidation
 * - Manifest expiration
 * - Round-trip stability
 * - CacheManager operations (store, retrieve, invalidate, query)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createManifest,
  invalidateManifest,
  touchManifest,
  isExpired,
  isValid,
  serializeManifest,
  deserializeManifest,
  debugManifest,
  type CacheManifest,
  type ArtifactSnapshot,
} from '../cache-manifest.js';
import { CacheManager } from '../cache-manager.js';
import { FilesystemStorage } from '../filesystem-storage.js';
import { computeCacheKey, computeContentHash, type CacheKeyInputs } from '../cache-key.js';
import type { StageExecutionResult } from '../stage-execution-result.js';

console.log('Running Cache Manifest Tests...\n');

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }
}

(async () => {

// Test 1: Create manifest
await test('Create manifest with all fields', () => {
  const keyInputs: CacheKeyInputs = {
    sliceId: 'test-slice-v1',
    stageId: 'requirements',
    identity: {
      sliceId: 'test-slice-v1',
      stageId: 'requirements',
      artifactType: 'requirements',
      artifactId: 'requirements',
    },
    inputArtifacts: [],
    dependencyState: {
      gates: {},
      lifecycleState: 'requirements-defined',
    },
    providerConfig: {
      provider: 'anthropic',
      model: 'claude-opus-4',
    },
    contractVersion: {
      contractHash: 'abc123',
      schemaVersion: '1.0.0',
    },
  };

  const cacheKey = computeCacheKey(keyInputs);
  const inputSnapshots: ArtifactSnapshot[] = [];
  const outputSnapshots: ArtifactSnapshot[] = [{
    identity: keyInputs.identity,
    contentHash: 'hash123',
    timestamp: new Date().toISOString(),
  }];

  const manifest = createManifest(cacheKey, keyInputs, inputSnapshots, outputSnapshots, {
    executionTimeMs: 1000,
    ttlSeconds: 3600,
  });

  if (manifest.cacheKey !== cacheKey) {
    throw new Error('Cache key mismatch');
  }
  if (manifest.status !== 'valid') {
    throw new Error('Status should be valid');
  }
  if (manifest.executionTimeMs !== 1000) {
    throw new Error('Execution time mismatch');
  }
  if (!manifest.expiresAt) {
    throw new Error('Expires at should be set');
  }
});

// Test 2: Invalidate manifest
await test('Invalidate manifest', () => {
  const keyInputs: CacheKeyInputs = {
    sliceId: 'test-slice-v1',
    stageId: 'requirements',
    identity: {
      sliceId: 'test-slice-v1',
      stageId: 'requirements',
      artifactType: 'requirements',
      artifactId: 'requirements',
    },
    inputArtifacts: [],
    dependencyState: {
      gates: {},
      lifecycleState: 'requirements-defined',
    },
    providerConfig: {
      provider: 'anthropic',
      model: 'claude-opus-4',
    },
    contractVersion: {
      contractHash: 'abc123',
      schemaVersion: '1.0.0',
    },
  };

  const cacheKey = computeCacheKey(keyInputs);
  const manifest = createManifest(cacheKey, keyInputs, [], []);

  const invalidated = invalidateManifest(manifest, 'input_changed', 'Input artifact changed');

  if (invalidated.status !== 'invalidated') {
    throw new Error('Status should be invalidated');
  }
  if (!invalidated.invalidationReason) {
    throw new Error('Invalidation reason should be set');
  }
  if (invalidated.invalidationReason.reason !== 'input_changed') {
    throw new Error('Invalidation reason mismatch');
  }
});

// Test 3: Touch manifest updates timestamp
await test('Touch manifest updates last accessed timestamp', async () => {
  const keyInputs: CacheKeyInputs = {
    sliceId: 'test-slice-v1',
    stageId: 'requirements',
    identity: {
      sliceId: 'test-slice-v1',
      stageId: 'requirements',
      artifactType: 'requirements',
      artifactId: 'requirements',
    },
    inputArtifacts: [],
    dependencyState: {
      gates: {},
      lifecycleState: 'requirements-defined',
    },
    providerConfig: {
      provider: 'anthropic',
      model: 'claude-opus-4',
    },
    contractVersion: {
      contractHash: 'abc123',
      schemaVersion: '1.0.0',
    },
  };

  const cacheKey = computeCacheKey(keyInputs);
  const manifest = createManifest(cacheKey, keyInputs, [], []);

  const originalTimestamp = manifest.lastAccessedAt;

  // Wait a bit to ensure timestamp changes
  await new Promise(resolve => setTimeout(resolve, 10));

  const touched = touchManifest(manifest);

  if (touched.lastAccessedAt === originalTimestamp) {
    throw new Error('Last accessed timestamp should be updated');
  }
});

// Test 4: Expired manifest detection
await test('Expired manifest is detected', () => {
  const keyInputs: CacheKeyInputs = {
    sliceId: 'test-slice-v1',
    stageId: 'requirements',
    identity: {
      sliceId: 'test-slice-v1',
      stageId: 'requirements',
      artifactType: 'requirements',
      artifactId: 'requirements',
    },
    inputArtifacts: [],
    dependencyState: {
      gates: {},
      lifecycleState: 'requirements-defined',
    },
    providerConfig: {
      provider: 'anthropic',
      model: 'claude-opus-4',
    },
    contractVersion: {
      contractHash: 'abc123',
      schemaVersion: '1.0.0',
    },
  };

  const cacheKey = computeCacheKey(keyInputs);

  // Create manifest with TTL of 1 second in the past
  const manifest = createManifest(cacheKey, keyInputs, [], [], { ttlSeconds: -1 });

  if (!isExpired(manifest)) {
    throw new Error('Manifest should be expired');
  }

  if (isValid(manifest)) {
    throw new Error('Expired manifest should not be valid');
  }
});

// Test 5: Round-trip serialization
await test('Round-trip serialization is stable', () => {
  const keyInputs: CacheKeyInputs = {
    sliceId: 'test-slice-v1',
    stageId: 'requirements',
    identity: {
      sliceId: 'test-slice-v1',
      stageId: 'requirements',
      artifactType: 'requirements',
      artifactId: 'requirements',
    },
    inputArtifacts: [],
    dependencyState: {
      gates: { 'gate-a': true },
      lifecycleState: 'requirements-defined',
    },
    providerConfig: {
      provider: 'anthropic',
      model: 'claude-opus-4',
    },
    contractVersion: {
      contractHash: 'abc123',
      schemaVersion: '1.0.0',
    },
  };

  const cacheKey = computeCacheKey(keyInputs);
  const manifest = createManifest(cacheKey, keyInputs, [], []);

  const serialized = serializeManifest(manifest);
  const deserialized = deserializeManifest(serialized);
  const reserialized = serializeManifest(deserialized);

  if (serialized !== reserialized) {
    throw new Error('Round-trip serialization is not stable');
  }
});

// Test 6: Debug output is readable
await test('Debug output is readable', () => {
  const keyInputs: CacheKeyInputs = {
    sliceId: 'test-slice-v1',
    stageId: 'requirements',
    identity: {
      sliceId: 'test-slice-v1',
      stageId: 'requirements',
      artifactType: 'requirements',
      artifactId: 'requirements',
    },
    inputArtifacts: [],
    dependencyState: {
      gates: {},
      lifecycleState: 'requirements-defined',
    },
    providerConfig: {
      provider: 'anthropic',
      model: 'claude-opus-4',
    },
    contractVersion: {
      contractHash: 'abc123',
      schemaVersion: '1.0.0',
    },
  };

  const cacheKey = computeCacheKey(keyInputs);
  const manifest = createManifest(cacheKey, keyInputs, [], []);

  const debug = debugManifest(manifest);

  if (!debug.includes('Cache Manifest:')) {
    throw new Error('Debug output missing header');
  }
  if (!debug.includes('Status: valid')) {
    throw new Error('Debug output missing status');
  }
});

// Test 7: CacheManager store and retrieve
await test('CacheManager stores and retrieves manifest', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jispec-cache-test-'));

  try {
    const storage = new FilesystemStorage(tmpDir);
    const manager = new CacheManager(storage, tmpDir);

    const keyInputs: CacheKeyInputs = {
      sliceId: 'test-slice-v1',
      stageId: 'requirements',
      identity: {
        sliceId: 'test-slice-v1',
        stageId: 'requirements',
        artifactType: 'requirements',
        artifactId: 'requirements',
      },
      inputArtifacts: [],
      dependencyState: {
        gates: {},
        lifecycleState: 'requirements-defined',
      },
      providerConfig: {
        provider: 'anthropic',
        model: 'claude-opus-4',
      },
      contractVersion: {
        contractHash: 'abc123',
        schemaVersion: '1.0.0',
      },
    };

    const cacheKey = computeCacheKey(keyInputs);
    const manifest = createManifest(cacheKey, keyInputs, [], []);
    const result: StageExecutionResult = {
      success: true,
      writes: [],
      gateUpdates: [],
      traceLinks: [],
      evidence: [],
    };

    await manager.put(manifest, result);

    const retrieved = await manager.getManifest(cacheKey);

    if (!retrieved) {
      throw new Error('Manifest not retrieved');
    }

    if (retrieved.cacheKey !== cacheKey) {
      throw new Error('Retrieved manifest cache key mismatch');
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Test 8: CacheManager invalidation
await test('CacheManager invalidates cache entry', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jispec-cache-test-'));

  try {
    const storage = new FilesystemStorage(tmpDir);
    const manager = new CacheManager(storage, tmpDir);

    const keyInputs: CacheKeyInputs = {
      sliceId: 'test-slice-v1',
      stageId: 'requirements',
      identity: {
        sliceId: 'test-slice-v1',
        stageId: 'requirements',
        artifactType: 'requirements',
        artifactId: 'requirements',
      },
      inputArtifacts: [],
      dependencyState: {
        gates: {},
        lifecycleState: 'requirements-defined',
      },
      providerConfig: {
        provider: 'anthropic',
        model: 'claude-opus-4',
      },
      contractVersion: {
        contractHash: 'abc123',
        schemaVersion: '1.0.0',
      },
    };

    const cacheKey = computeCacheKey(keyInputs);
    const manifest = createManifest(cacheKey, keyInputs, [], []);
    const result: StageExecutionResult = {
      success: true,
      writes: [],
      gateUpdates: [],
      traceLinks: [],
      evidence: [],
    };

    await manager.put(manifest, result);

    const validBefore = await manager.isValid(cacheKey);
    if (!validBefore) {
      throw new Error('Cache should be valid before invalidation');
    }

    await manager.invalidate(cacheKey, 'manual', 'Test invalidation');

    const validAfter = await manager.isValid(cacheKey);
    if (validAfter) {
      throw new Error('Cache should be invalid after invalidation');
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Test 9: CacheManager query by slice
await test('CacheManager finds manifests by slice ID', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jispec-cache-test-'));

  try {
    const storage = new FilesystemStorage(tmpDir);
    const manager = new CacheManager(storage, tmpDir);

    const keyInputs1: CacheKeyInputs = {
      sliceId: 'slice-a',
      stageId: 'requirements',
      identity: {
        sliceId: 'slice-a',
        stageId: 'requirements',
        artifactType: 'requirements',
        artifactId: 'requirements',
      },
      inputArtifacts: [],
      dependencyState: {
        gates: {},
        lifecycleState: 'requirements-defined',
      },
      providerConfig: {
        provider: 'anthropic',
        model: 'claude-opus-4',
      },
      contractVersion: {
        contractHash: 'abc123',
        schemaVersion: '1.0.0',
      },
    };

    const keyInputs2: CacheKeyInputs = {
      ...keyInputs1,
      sliceId: 'slice-b',
      identity: {
        ...keyInputs1.identity,
        sliceId: 'slice-b',
      },
    };

    const cacheKey1 = computeCacheKey(keyInputs1);
    const cacheKey2 = computeCacheKey(keyInputs2);

    const manifest1 = createManifest(cacheKey1, keyInputs1, [], []);
    const manifest2 = createManifest(cacheKey2, keyInputs2, [], []);

    const result: StageExecutionResult = {
      success: true,
      writes: [],
      gateUpdates: [],
      traceLinks: [],
      evidence: [],
    };

    await manager.put(manifest1, result);
    await manager.put(manifest2, result);

    const sliceAManifests = await manager.findBySlice('slice-a');

    if (sliceAManifests.length !== 1) {
      throw new Error(`Expected 1 manifest for slice-a, got ${sliceAManifests.length}`);
    }

    if (sliceAManifests[0].keyInputs.sliceId !== 'slice-a') {
      throw new Error('Retrieved manifest slice ID mismatch');
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Test 10: CacheManager prune
await test('CacheManager prunes invalid entries', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jispec-cache-test-'));

  try {
    const storage = new FilesystemStorage(tmpDir);
    const manager = new CacheManager(storage, tmpDir);

    const keyInputs: CacheKeyInputs = {
      sliceId: 'test-slice-v1',
      stageId: 'requirements',
      identity: {
        sliceId: 'test-slice-v1',
        stageId: 'requirements',
        artifactType: 'requirements',
        artifactId: 'requirements',
      },
      inputArtifacts: [],
      dependencyState: {
        gates: {},
        lifecycleState: 'requirements-defined',
      },
      providerConfig: {
        provider: 'anthropic',
        model: 'claude-opus-4',
      },
      contractVersion: {
        contractHash: 'abc123',
        schemaVersion: '1.0.0',
      },
    };

    const cacheKey = computeCacheKey(keyInputs);

    // Create expired manifest
    const manifest = createManifest(cacheKey, keyInputs, [], [], { ttlSeconds: -1 });
    const result: StageExecutionResult = {
      success: true,
      writes: [],
      gateUpdates: [],
      traceLinks: [],
      evidence: [],
    };

    await manager.put(manifest, result);

    const beforePrune = await manager.listManifests();
    if (beforePrune.length !== 1) {
      throw new Error('Expected 1 manifest before prune');
    }

    const pruned = await manager.prune();

    if (pruned !== 1) {
      throw new Error(`Expected 1 pruned entry, got ${pruned}`);
    }

    const afterPrune = await manager.listManifests();
    if (afterPrune.length !== 0) {
      throw new Error('Expected 0 manifests after prune');
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

})();
