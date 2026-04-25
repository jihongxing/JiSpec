/**
 * Cache Integration Tests
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FilesystemStorage } from '../filesystem-storage.js';
import { CacheManager } from '../cache-manager.js';
import { computeCacheKey, computeContentHash, type CacheKeyInputs } from '../cache-key.js';
import { createManifest } from '../cache-manifest.js';

console.log('Running Cache Integration Tests...\n');

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

// Helper: Create test project structure
function createTestProject(tmpDir: string): void {
  const jiprojectDir = path.join(tmpDir, 'jiproject');
  fs.mkdirSync(jiprojectDir, { recursive: true });

  // project.yaml
  fs.writeFileSync(
    path.join(jiprojectDir, 'project.yaml'),
    `id: test-project
name: Test Project
version: 0.1.0
delivery_model: bounded-context-slice
ai:
  provider: mock
  model: test-model
`
  );

  // contexts/test-context/slices/test-slice/slice.yaml
  const sliceDir = path.join(tmpDir, 'contexts', 'test-context', 'slices', 'test-slice');
  fs.mkdirSync(sliceDir, { recursive: true });

  fs.writeFileSync(
    path.join(sliceDir, 'slice.yaml'),
    `id: test-slice-v1
context_id: test-context
service_id: test-service
lifecycle:
  state: proposed
gates: {}
`
  );

  // Input file
  fs.writeFileSync(
    path.join(sliceDir, 'input.txt'),
    'Initial input content'
  );

  // agents/agents.yaml
  const agentsDir = path.join(tmpDir, 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });

  fs.writeFileSync(
    path.join(agentsDir, 'agents.yaml'),
    `domain:
  id: domain
  role: Domain expert
  inputs: []
  outputs: []
`
  );
}

(async () => {

// Test 1: First execution - cache miss
await test('First execution causes cache miss', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jispec-cache-integration-'));

  try {
    createTestProject(tmpDir);

    const storage = new FilesystemStorage(tmpDir);
    const cacheManager = new CacheManager(storage, tmpDir);

    // First execution should miss cache
    const manifests = await cacheManager.listManifests();
    if (manifests.length !== 0) {
      throw new Error('Cache should be empty before first execution');
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Test 2: Second execution with same inputs - cache hit
await test('Second execution with same inputs causes cache hit', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jispec-cache-integration-'));

  try {
    createTestProject(tmpDir);

    const storage = new FilesystemStorage(tmpDir);
    const cacheManager = new CacheManager(storage, tmpDir);

    // Simulate cached result by manually storing manifest and result
    const keyInputs: CacheKeyInputs = {
      sliceId: 'test-slice-v1',
      stageId: 'requirements',
      identity: {
        sliceId: 'test-slice-v1',
        stageId: 'requirements',
        artifactType: 'requirements',
        artifactId: 'output',
      },
      inputArtifacts: [],
      dependencyState: {
        gates: {},
        lifecycleState: 'proposed',
      },
      providerConfig: {
        provider: 'mock',
        model: 'test-model',
      },
      contractVersion: {
        contractHash: 'test-hash',
        schemaVersion: '1.0.0',
      },
    };

    const cacheKey = computeCacheKey(keyInputs);
    const manifest = createManifest(cacheKey, keyInputs, [], []);
    const result = {
      success: true,
      writes: [],
      gateUpdates: [],
      traceLinks: [],
      evidence: [],
    };

    await cacheManager.put(manifest, result);

    // Verify cache hit
    const retrieved = await cacheManager.get(cacheKey);
    if (!retrieved) {
      throw new Error('Cache should return result on hit');
    }

    if (!retrieved.success) {
      throw new Error('Retrieved result should be successful');
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Test 3: Input content change causes cache miss
await test('Input content change invalidates cache', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jispec-cache-integration-'));

  try {
    createTestProject(tmpDir);

    const storage = new FilesystemStorage(tmpDir);
    const cacheManager = new CacheManager(storage, tmpDir);

    // Original input hash
    const originalHash = computeContentHash('Initial input content');

    const keyInputs1: CacheKeyInputs = {
      sliceId: 'test-slice-v1',
      stageId: 'requirements',
      identity: {
        sliceId: 'test-slice-v1',
        stageId: 'requirements',
        artifactType: 'requirements',
        artifactId: 'output',
      },
      inputArtifacts: [{
        identity: {
          sliceId: 'test-slice-v1',
          stageId: 'requirements',
          artifactType: 'requirements',
          artifactId: 'input',
        },
        contentHash: originalHash,
      }],
      dependencyState: {
        gates: {},
        lifecycleState: 'proposed',
      },
      providerConfig: {
        provider: 'mock',
        model: 'test-model',
      },
      contractVersion: {
        contractHash: 'test-hash',
        schemaVersion: '1.0.0',
      },
    };

    const cacheKey1 = computeCacheKey(keyInputs1);

    // Changed input hash
    const changedHash = computeContentHash('Changed input content');

    const keyInputs2: CacheKeyInputs = {
      ...keyInputs1,
      inputArtifacts: [{
        identity: {
          sliceId: 'test-slice-v1',
          stageId: 'requirements',
          artifactType: 'requirements',
          artifactId: 'input',
        },
        contentHash: changedHash,
      }],
    };

    const cacheKey2 = computeCacheKey(keyInputs2);

    // Keys should be different
    if (cacheKey1 === cacheKey2) {
      throw new Error('Cache keys should differ when input content changes');
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Test 4: Provider/model change causes cache miss
await test('Provider or model change invalidates cache', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jispec-cache-integration-'));

  try {
    createTestProject(tmpDir);

    const baseKeyInputs: CacheKeyInputs = {
      sliceId: 'test-slice-v1',
      stageId: 'requirements',
      identity: {
        sliceId: 'test-slice-v1',
        stageId: 'requirements',
        artifactType: 'requirements',
        artifactId: 'output',
      },
      inputArtifacts: [],
      dependencyState: {
        gates: {},
        lifecycleState: 'proposed',
      },
      providerConfig: {
        provider: 'mock',
        model: 'test-model',
      },
      contractVersion: {
        contractHash: 'test-hash',
        schemaVersion: '1.0.0',
      },
    };

    const cacheKey1 = computeCacheKey(baseKeyInputs);

    // Change provider
    const keyInputs2: CacheKeyInputs = {
      ...baseKeyInputs,
      providerConfig: {
        provider: 'anthropic',
        model: 'test-model',
      },
    };

    const cacheKey2 = computeCacheKey(keyInputs2);

    if (cacheKey1 === cacheKey2) {
      throw new Error('Cache keys should differ when provider changes');
    }

    // Change model
    const keyInputs3: CacheKeyInputs = {
      ...baseKeyInputs,
      providerConfig: {
        provider: 'mock',
        model: 'different-model',
      },
    };

    const cacheKey3 = computeCacheKey(keyInputs3);

    if (cacheKey1 === cacheKey3) {
      throw new Error('Cache keys should differ when model changes');
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

})();
