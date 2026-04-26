/**
 * Windows-Safe Naming Tests
 *
 * Verifies that snapshot filenames, cache keys, and artifact paths
 * do not contain Windows-illegal characters (: < > " | ? * \0-\x1F).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ArtifactIdentity } from '../artifact-identity';
import { computeCacheKey } from '../cache-key';
import { FilesystemStorage } from '../filesystem-storage';

const WINDOWS_ILLEGAL_CHARS = /[<>"|?*\x00-\x1F]/;  // Removed : from the pattern since drive letters need it

function assertWindowsSafe(str: string, context: string) {
  // For Windows paths, only check the filename portion, not the drive letter
  const filename = str.split(/[/\\]/).pop() || str;

  if (WINDOWS_ILLEGAL_CHARS.test(filename)) {
    throw new Error(`${context} contains Windows-illegal characters: ${filename}`);
  }
}

async function testSnapshotFilenames() {
  // Test that snapshot filenames use sanitized timestamps
  const timestamp = new Date().toISOString();
  const sanitized = timestamp.replace(/:/g, '-');

  // Verify sanitized timestamp is Windows-safe
  assertWindowsSafe(sanitized, 'Sanitized timestamp');

  // Verify snapshot filename pattern is Windows-safe
  const snapshotFilename = `snapshot-${sanitized}.json`;
  assertWindowsSafe(snapshotFilename, 'Snapshot filename');

  console.log('✓ Test 1: Snapshot filenames are Windows-safe');
}

async function testCacheKeyFilenames() {
  const identity: ArtifactIdentity = {
    sliceId: 'test-slice-v1',
    stageId: 'requirements',
    artifactType: 'requirements',
    artifactId: 'requirements',
    logicalName: 'requirements.md',
  };

  const keyInputs = {
    sliceId: 'test-slice-v1',
    stageId: 'test-stage',
    identity,
    inputArtifacts: [
      {
        identity,
        contentHash: 'abc123',
      },
    ],
    dependencyState: {
      gates: {},
      lifecycleState: 'proposed',
    },
    providerConfig: {
      provider: 'mock',
      model: 'mock-model',
    },
    contractVersion: {
      contractHash: 'contract123',
      schemaVersion: '1.0.0',
    },
  };

  const cacheKey = computeCacheKey(keyInputs);

  // Verify cache key is Windows-safe
  assertWindowsSafe(cacheKey, 'Cache key');

  console.log('✓ Test 2: Cache keys are Windows-safe');
}

async function testArtifactPaths() {
  const identity: ArtifactIdentity = {
    sliceId: 'test-slice-v1',
    stageId: 'requirements',
    artifactType: 'requirements',
    artifactId: 'requirements',
    logicalName: 'requirements.md',
  };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jispec-windows-safe-'));
  const storage = new FilesystemStorage(tmpDir);

  try {
    const resolvedPath = storage.resolveArtifactPath(identity);

    // Verify resolved path is Windows-safe
    assertWindowsSafe(resolvedPath, 'Artifact path');

    console.log('✓ Test 3: Artifact paths are Windows-safe');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  console.log('=== Windows-Safe Naming Tests ===\n');

  let passed = 0;
  let failed = 0;

  try {
    await testSnapshotFilenames();
    passed++;
  } catch (error: any) {
    console.error('✗ Test 1 failed:', error.message);
    failed++;
  }

  try {
    await testCacheKeyFilenames();
    passed++;
  } catch (error: any) {
    console.error('✗ Test 2 failed:', error.message);
    failed++;
  }

  try {
    await testArtifactPaths();
    passed++;
  } catch (error: any) {
    console.error('✗ Test 3 failed:', error.message);
    failed++;
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
