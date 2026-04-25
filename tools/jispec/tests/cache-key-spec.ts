/**
 * Cache Key Specification Tests
 *
 * Verifies:
 * - Deterministic serialization (same inputs → same key)
 * - Canonical ordering (input order doesn't affect key)
 * - Sensitivity to changes (different inputs → different key)
 * - Round-trip stability (serialize → deserialize → serialize)
 */

import {
  computeCacheKey,
  computeContentHash,
  serializeCacheKeyInputs,
  debugCacheKey,
  type CacheKeyInputs,
} from '../cache-key.js';
import type { ArtifactIdentity } from '../artifact-identity.js';

console.log('Running Cache Key Specification Tests...\n');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }
}

// Test 1: Same inputs produce same key (determinism)
test('Same inputs produce same cache key', () => {
  const inputs: CacheKeyInputs = {
    sliceId: 'test-slice-v1',
    stageId: 'requirements',
    identity: {
      sliceId: 'test-slice-v1',
      stageId: 'requirements',
      artifactType: 'requirements',
      artifactId: 'requirements',
      logicalName: 'requirements.md',
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

  const key1 = computeCacheKey(inputs);
  const key2 = computeCacheKey(inputs);

  if (key1 !== key2) {
    throw new Error(`Keys differ: ${key1} !== ${key2}`);
  }
});

// Test 2: Input artifact order doesn't affect key (canonical ordering)
test('Input artifact order does not affect cache key', () => {
  const identity1: ArtifactIdentity = {
    sliceId: 'test-slice-v1',
    stageId: 'requirements',
    artifactType: 'requirements',
    artifactId: 'req1',
  };

  const identity2: ArtifactIdentity = {
    sliceId: 'test-slice-v1',
    stageId: 'requirements',
    artifactType: 'requirements',
    artifactId: 'req2',
  };

  const baseInputs: CacheKeyInputs = {
    sliceId: 'test-slice-v1',
    stageId: 'design',
    identity: {
      sliceId: 'test-slice-v1',
      stageId: 'design',
      artifactType: 'design',
      artifactId: 'design',
    },
    inputArtifacts: [],
    dependencyState: {
      gates: {},
      lifecycleState: 'design-defined',
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

  // Order 1: req1, req2
  const inputs1 = {
    ...baseInputs,
    inputArtifacts: [
      { identity: identity1, contentHash: 'hash1' },
      { identity: identity2, contentHash: 'hash2' },
    ],
  };

  // Order 2: req2, req1
  const inputs2 = {
    ...baseInputs,
    inputArtifacts: [
      { identity: identity2, contentHash: 'hash2' },
      { identity: identity1, contentHash: 'hash1' },
    ],
  };

  const key1 = computeCacheKey(inputs1);
  const key2 = computeCacheKey(inputs2);

  if (key1 !== key2) {
    throw new Error(`Keys differ despite same inputs: ${key1} !== ${key2}`);
  }
});

// Test 3: Gate order doesn't affect key (canonical ordering)
test('Gate order does not affect cache key', () => {
  const baseInputs: CacheKeyInputs = {
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

  // Order 1: gate-a, gate-b
  const inputs1 = {
    ...baseInputs,
    dependencyState: {
      gates: { 'gate-a': true, 'gate-b': false },
      lifecycleState: 'requirements-defined',
    },
  };

  // Order 2: gate-b, gate-a
  const inputs2 = {
    ...baseInputs,
    dependencyState: {
      gates: { 'gate-b': false, 'gate-a': true },
      lifecycleState: 'requirements-defined',
    },
  };

  const key1 = computeCacheKey(inputs1);
  const key2 = computeCacheKey(inputs2);

  if (key1 !== key2) {
    throw new Error(`Keys differ despite same gates: ${key1} !== ${key2}`);
  }
});

// Test 4: Different content hash produces different key
test('Different input content hash produces different key', () => {
  const baseInputs: CacheKeyInputs = {
    sliceId: 'test-slice-v1',
    stageId: 'design',
    identity: {
      sliceId: 'test-slice-v1',
      stageId: 'design',
      artifactType: 'design',
      artifactId: 'design',
    },
    inputArtifacts: [
      {
        identity: {
          sliceId: 'test-slice-v1',
          stageId: 'requirements',
          artifactType: 'requirements',
          artifactId: 'requirements',
        },
        contentHash: 'hash1',
      },
    ],
    dependencyState: {
      gates: {},
      lifecycleState: 'design-defined',
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

  const inputs2 = {
    ...baseInputs,
    inputArtifacts: [
      {
        identity: {
          sliceId: 'test-slice-v1',
          stageId: 'requirements',
          artifactType: 'requirements' as const,
          artifactId: 'requirements',
        },
        contentHash: 'hash2', // Different hash
      },
    ],
  };

  const key1 = computeCacheKey(baseInputs);
  const key2 = computeCacheKey(inputs2);

  if (key1 === key2) {
    throw new Error('Keys should differ for different content hashes');
  }
});

// Test 5: Different provider/model produces different key
test('Different provider/model produces different key', () => {
  const baseInputs: CacheKeyInputs = {
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

  const inputs2 = {
    ...baseInputs,
    providerConfig: {
      provider: 'openai',
      model: 'gpt-4',
    },
  };

  const key1 = computeCacheKey(baseInputs);
  const key2 = computeCacheKey(inputs2);

  if (key1 === key2) {
    throw new Error('Keys should differ for different provider/model');
  }
});

// Test 6: Different gate status produces different key
test('Different gate status produces different key', () => {
  const baseInputs: CacheKeyInputs = {
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

  const inputs2 = {
    ...baseInputs,
    dependencyState: {
      gates: { 'gate-a': false }, // Different status
      lifecycleState: 'requirements-defined',
    },
  };

  const key1 = computeCacheKey(baseInputs);
  const key2 = computeCacheKey(inputs2);

  if (key1 === key2) {
    throw new Error('Keys should differ for different gate status');
  }
});

// Test 7: Round-trip serialization is stable
test('Round-trip serialization is stable', () => {
  const inputs: CacheKeyInputs = {
    sliceId: 'test-slice-v1',
    stageId: 'requirements',
    identity: {
      sliceId: 'test-slice-v1',
      stageId: 'requirements',
      artifactType: 'requirements',
      artifactId: 'requirements',
      logicalName: 'requirements.md',
    },
    inputArtifacts: [
      {
        identity: {
          sliceId: 'test-slice-v1',
          stageId: 'context',
          artifactType: 'requirements',
          artifactId: 'context',
        },
        contentHash: 'hash1',
      },
    ],
    dependencyState: {
      gates: { 'gate-a': true },
      lifecycleState: 'requirements-defined',
    },
    providerConfig: {
      provider: 'anthropic',
      model: 'claude-opus-4',
      temperature: 0.7,
    },
    contractVersion: {
      contractHash: 'abc123',
      schemaVersion: '1.0.0',
    },
  };

  const serialized1 = serializeCacheKeyInputs(inputs);
  const parsed = JSON.parse(serialized1);
  const serialized2 = JSON.stringify(parsed, null, 2);

  if (serialized1 !== serialized2) {
    throw new Error('Round-trip serialization is not stable');
  }
});

// Test 8: Content hash is deterministic
test('Content hash is deterministic', () => {
  const content = '# Requirements\n\nThis is a test.';

  const hash1 = computeContentHash(content);
  const hash2 = computeContentHash(content);

  if (hash1 !== hash2) {
    throw new Error(`Content hashes differ: ${hash1} !== ${hash2}`);
  }
});

// Test 9: Different content produces different hash
test('Different content produces different hash', () => {
  const content1 = '# Requirements\n\nVersion 1';
  const content2 = '# Requirements\n\nVersion 2';

  const hash1 = computeContentHash(content1);
  const hash2 = computeContentHash(content2);

  if (hash1 === hash2) {
    throw new Error('Different content should produce different hashes');
  }
});

// Test 10: Debug output is readable
test('Debug output is readable and complete', () => {
  const inputs: CacheKeyInputs = {
    sliceId: 'test-slice-v1',
    stageId: 'requirements',
    identity: {
      sliceId: 'test-slice-v1',
      stageId: 'requirements',
      artifactType: 'requirements',
      artifactId: 'requirements',
    },
    inputArtifacts: [
      {
        identity: {
          sliceId: 'test-slice-v1',
          stageId: 'context',
          artifactType: 'requirements',
          artifactId: 'context',
        },
        contentHash: 'abcdef1234567890',
      },
    ],
    dependencyState: {
      gates: { 'gate-a': true },
      lifecycleState: 'requirements-defined',
    },
    providerConfig: {
      provider: 'anthropic',
      model: 'claude-opus-4',
    },
    contractVersion: {
      contractHash: 'abc123def456',
      schemaVersion: '1.0.0',
    },
  };

  const debug = debugCacheKey(inputs);

  // Verify key sections are present
  if (!debug.includes('Cache Key Composition:')) {
    throw new Error('Debug output missing header');
  }
  if (!debug.includes('Slice: test-slice-v1')) {
    throw new Error('Debug output missing slice');
  }
  if (!debug.includes('Stage: requirements')) {
    throw new Error('Debug output missing stage');
  }
  if (!debug.includes('Input Artifacts (1):')) {
    throw new Error('Debug output missing input artifacts');
  }
  if (!debug.includes('Lifecycle: requirements-defined')) {
    throw new Error('Debug output missing lifecycle');
  }
  if (!debug.includes('Provider: anthropic/claude-opus-4')) {
    throw new Error('Debug output missing provider');
  }
  if (!debug.includes('Final Key: cache:')) {
    throw new Error('Debug output missing final key');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
