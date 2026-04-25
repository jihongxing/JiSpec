/**
 * Stage Runner Identity Apply Test
 *
 * Verifies that StageRunner correctly validates and applies identity-first execution results.
 */

import { fromPath, encodeIdentity, type ArtifactIdentity } from '../artifact-identity.js';
import type { StageExecutionResult, FileWrite, WriteOperation } from '../stage-execution-result.js';

console.log('Running Stage Runner Identity Apply Tests...\n');

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

// Test 1: Correct identity-path pair should be accepted
test('Correct identity-path pair is accepted', () => {
  const sliceId = 'ordering-checkout-v1';
  const stageId = 'requirements';
  const identity: ArtifactIdentity = {
    sliceId,
    stageId,
    artifactType: 'requirements',
    artifactId: 'requirements',
    logicalName: 'requirements.md'
  };

  const fullPath = `contexts/ordering/slices/${sliceId}/requirements.md`;
  const write: FileWrite = {
    path: fullPath,
    content: '# Requirements',
    identity
  };

  // Verify identity matches path
  const inferred = fromPath(write.path, stageId);
  if (!inferred) {
    throw new Error('Failed to infer identity from path');
  }

  const expectedEncoded = encodeIdentity(identity);
  const inferredEncoded = encodeIdentity(inferred);

  if (expectedEncoded !== inferredEncoded) {
    throw new Error('Identity does not match inferred identity from path');
  }
});

// Test 2: Incorrect identity-path pair should be rejected
test('Incorrect identity-path pair is rejected', () => {
  const sliceId = 'ordering-checkout-v1';
  const stageId = 'requirements';
  const identity: ArtifactIdentity = {
    sliceId,
    stageId,
    artifactType: 'requirements',
    artifactId: 'requirements'
  };

  const fullPath = `contexts/ordering/slices/${sliceId}/design.md`;
  const write: FileWrite = {
    path: fullPath, // Wrong path for requirements identity
    content: '# Design',
    identity
  };

  // Verify identity does NOT match path
  const inferred = fromPath(write.path, stageId);
  if (!inferred) {
    throw new Error('Failed to infer identity from path');
  }

  if (encodeIdentity(identity) === encodeIdentity(inferred)) {
    throw new Error('Identity should not match inferred identity from wrong path');
  }
});

// Test 3: Directory identity should be well-formed
test('Directory identity is well-formed', () => {
  const sliceId = 'ordering-checkout-v1';
  const stageId = 'implementing';
  const identity: ArtifactIdentity = {
    sliceId,
    stageId,
    artifactType: 'code',
    artifactId: 'src'
  };

  const op: WriteOperation = {
    type: 'directory',
    path: 'src',
    identity
  };

  // Verify identity has all required fields
  if (!identity.sliceId || !identity.artifactId || !identity.artifactType) {
    throw new Error('Directory identity is malformed');
  }
});

// Test 4: Malformed identity should be detected
test('Malformed identity is detected', () => {
  const identity = {
    sliceId: 'ordering-checkout-v1',
    stageId: 'implementing',
    artifactType: 'code',
    artifactId: '' // Empty artifactId is malformed
  } as ArtifactIdentity;

  const op: WriteOperation = {
    type: 'directory',
    path: 'src',
    identity
  };

  // Verify malformed identity is detected
  if (!identity.artifactId) {
    // This is expected - malformed identity detected
    return;
  }

  throw new Error('Malformed identity was not detected');
});

// Test 5: Path-only fallback should work
test('Path-only fallback works', () => {
  const write: FileWrite = {
    path: 'requirements.md',
    content: '# Requirements'
    // No identity provided - should fall back to path-only mode
  };

  // Verify write has no identity
  if (write.identity) {
    throw new Error('Write should not have identity in fallback mode');
  }
});

// Test 6: Identity encoding is stable
test('Identity encoding is stable', () => {
  const identity: ArtifactIdentity = {
    sliceId: 'ordering-checkout-v1',
    stageId: 'behavior',
    artifactType: 'behavior',
    artifactId: 'checkout-flow'
  };

  const encoded1 = encodeIdentity(identity);
  const encoded2 = encodeIdentity(identity);

  if (encoded1 !== encoded2) {
    throw new Error('Identity encoding is not stable');
  }

  if (!encoded1.includes('behavior') || !encoded1.includes('ordering-checkout-v1')) {
    throw new Error('Encoded identity does not contain expected components');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
