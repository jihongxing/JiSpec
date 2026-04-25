/**
 * Stage Runner Identity Apply Test
 *
 * Verifies that StageRunner correctly validates and applies identity-first execution results.
 * This test drives the actual StageRunner.applyExecutionResult logic with temporary fixtures.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StageRunner } from '../stage-runner.js';
import type { StageExecutionResult, FileWrite, WriteOperation } from '../stage-execution-result.js';
import type { StageConfig } from '../pipeline-executor.js';
import type { ArtifactIdentity } from '../artifact-identity.js';

console.log('Running Stage Runner Identity Apply Tests...\n');

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
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

// Create temporary test fixture
function createTempFixture(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jispec-test-'));

  // Create minimal slice structure
  // Use "testcontext" as both context and slice prefix so resolveArtifactPath works
  const contextDir = path.join(tmpDir, 'contexts', 'testcontext');
  const sliceDir = path.join(contextDir, 'slices', 'testcontext-slice-v1');
  fs.mkdirSync(sliceDir, { recursive: true });

  // Create context.yaml
  const contextYaml = `
id: testcontext
name: Test Context
`;
  fs.writeFileSync(path.join(contextDir, 'context.yaml'), contextYaml.trim());

  // Create slice.yaml with proper lifecycle structure
  const sliceYaml = `
id: testcontext-slice-v1
slice_id: testcontext-slice-v1
context_id: testcontext
service_id: test-service
lifecycle:
  state: requirements-defined
  history: []
gates: {}
`;
  fs.writeFileSync(path.join(sliceDir, 'slice.yaml'), sliceYaml.trim());

  return tmpDir;
}

function cleanupFixture(tmpDir: string) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Run all tests
(async () => {

// Test 1: Correct identity-path pair should be accepted
await test('Correct identity-path pair is accepted by apply', async () => {
  const tmpDir = createTempFixture();

  try {
    const runner = StageRunner.create(tmpDir);

    const identity: ArtifactIdentity = {
      sliceId: 'testcontext-slice-v1',
      stageId: 'requirements',
      artifactType: 'requirements',
      artifactId: 'requirements',
      logicalName: 'requirements.md'
    };

    const fullPath = path.join(tmpDir, 'contexts/testcontext/slices/testcontext-slice-v1/requirements.md');

    const result: StageExecutionResult = {
      success: true,
      writes: [{
        path: fullPath,
        content: '# Requirements',
        identity
      }],
      gateUpdates: [],
      traceLinks: [],
      evidence: []
    };

    const stageConfig: StageConfig = {
      id: 'requirements',
      name: 'Requirements',
      agent: 'requirements' as any,
      lifecycle_state: 'requirements',
      inputs: { files: [], allowRead: false, allowWrite: false },
      outputs: { files: ['requirements.md'], traceRequired: false },
      gates: { autoUpdate: false, required: [], optional: [] }
    };

    const contract = {
      inputs: [],
      outputs: []  // Skip output validation for this test
    };

    try {
      await (runner as any).applyExecutionResult('testcontext-slice-v1', stageConfig, result, contract);
    } catch (error) {
      // Slice validation will fail, but we only care that identity-path validation passed
      // and the file was written
      if (error && (error as Error).message.includes('Identity-path mismatch')) {
        throw error;  // This is the error we're testing for - should NOT happen
      }
      // Other errors (like slice validation) are expected in this minimal fixture
    }

    // Verify file was written (this is the real test)
    if (!fs.existsSync(fullPath)) {
      throw new Error('File was not written');
    }
  } finally {
    cleanupFixture(tmpDir);
  }
});

// Test 2: Incorrect identity-path pair should be rejected
await test('Incorrect identity-path pair is rejected by apply', async () => {
  const tmpDir = createTempFixture();

  try {
    const runner = StageRunner.create(tmpDir);

    const identity: ArtifactIdentity = {
      sliceId: 'testcontext-slice-v1',
      stageId: 'requirements',
      artifactType: 'requirements',
      artifactId: 'requirements',
      logicalName: 'requirements.md'
    };

    // Wrong path - points to design.md but identity says requirements.md
    const wrongPath = path.join(tmpDir, 'contexts/testcontext/slices/testcontext-slice-v1/design.md');

    const result: StageExecutionResult = {
      success: true,
      writes: [{
        path: wrongPath,
        content: '# Design',
        identity
      }],
      gateUpdates: [],
      traceLinks: [],
      evidence: []
    };

    const stageConfig: StageConfig = {
      id: 'requirements',
      name: 'Requirements',
      agent: 'requirements' as any,
      lifecycle_state: 'requirements',
      inputs: { files: [], allowRead: false, allowWrite: false },
      outputs: { files: ['requirements.md'], traceRequired: false },
      gates: { autoUpdate: false, required: [], optional: [] }
    };

    const contract = {
      inputs: [],
      outputs: [{ path: 'requirements.md', description: 'Requirements' }]
    };

    let errorThrown = false;
    try {
      await (runner as any).applyExecutionResult('testcontext-slice-v1', stageConfig, result, contract);
    } catch (error) {
      errorThrown = true;
      if (!error || !(error as Error).message.includes('Identity-path mismatch')) {
        throw new Error('Expected identity-path mismatch error');
      }
    }

    if (!errorThrown) {
      throw new Error('Expected apply to throw identity-path mismatch error');
    }
  } finally {
    cleanupFixture(tmpDir);
  }
});

// Test 3: Directory identity should be validated and applied
await test('Directory identity is validated and applied', async () => {
  const tmpDir = createTempFixture();

  try {
    const runner = StageRunner.create(tmpDir);

    const identity: ArtifactIdentity = {
      sliceId: 'testcontext-slice-v1',
      stageId: 'implementing',
      artifactType: 'code',
      artifactId: 'src',
      logicalName: 'src'
    };

    const dirPath = path.join(tmpDir, 'contexts/testcontext/slices/testcontext-slice-v1/src');

    const result: StageExecutionResult = {
      success: true,
      writes: [],
      writeOperations: [{
        type: 'directory',
        path: dirPath,
        identity
      }],
      gateUpdates: [],
      traceLinks: [],
      evidence: []
    };

    const stageConfig: StageConfig = {
      id: 'implementing',
      name: 'Implementing',
      agent: 'implementing' as any,
      lifecycle_state: 'implementing',
      inputs: { files: [], allowRead: false, allowWrite: false },
      outputs: { files: [], traceRequired: false },
      gates: { autoUpdate: false, required: [], optional: [] }
    };

    const contract = {
      inputs: [],
      outputs: []
    };

    // This should succeed without throwing identity-path mismatch error
    try {
      await (runner as any).applyExecutionResult('testcontext-slice-v1', stageConfig, result, contract);
    } catch (error) {
      // Slice validation will fail, but we only care that identity-path validation passed
      if (error && (error as Error).message.includes('Identity-path mismatch')) {
        throw error;  // This is the error we're testing for - should NOT happen
      }
      // Other errors (like slice validation) are expected in this minimal fixture
    }

    // Verify directory was created
    if (!fs.existsSync(dirPath)) {
      throw new Error('Directory was not created');
    }
  } finally {
    cleanupFixture(tmpDir);
  }
});

// Test 4: Malformed identity should be rejected
await test('Malformed identity is rejected by apply', async () => {
  const tmpDir = createTempFixture();

  try {
    const runner = StageRunner.create(tmpDir);

    const identity = {
      sliceId: 'testcontext-slice-v1',
      stageId: 'implementing',
      artifactType: 'code',
      artifactId: '' // Empty artifactId is malformed
    } as ArtifactIdentity;

    const dirPath = path.join(tmpDir, 'contexts/testcontext/slices/testcontext-slice-v1/src');

    const result: StageExecutionResult = {
      success: true,
      writes: [],
      writeOperations: [{
        type: 'directory',
        path: dirPath,
        identity
      }],
      gateUpdates: [],
      traceLinks: [],
      evidence: []
    };

    const stageConfig: StageConfig = {
      id: 'implementing',
      name: 'Implementing',
      agent: 'implementing' as any,
      lifecycle_state: 'implementing',
      inputs: { files: [], allowRead: false, allowWrite: false },
      outputs: { files: [], traceRequired: false },
      gates: { autoUpdate: false, required: [], optional: [] }
    };

    const contract = {
      inputs: [],
      outputs: []
    };

    let errorThrown = false;
    try {
      await (runner as any).applyExecutionResult('testcontext-slice-v1', stageConfig, result, contract);
    } catch (error) {
      errorThrown = true;
      if (!error || !(error as Error).message.includes('Malformed identity')) {
        throw new Error('Expected malformed identity error');
      }
    }

    if (!errorThrown) {
      throw new Error('Expected apply to throw malformed identity error');
    }
  } finally {
    cleanupFixture(tmpDir);
  }
});

// Test 5: Path-only fallback should work
await test('Path-only fallback works in apply', async () => {
  const tmpDir = createTempFixture();

  try {
    const runner = StageRunner.create(tmpDir);

    const fullPath = path.join(tmpDir, 'contexts/testcontext/slices/testcontext-slice-v1/notes.md');

    const result: StageExecutionResult = {
      success: true,
      writes: [{
        path: fullPath,
        content: '# Notes'
        // No identity - should fall back to path-only mode
      }],
      gateUpdates: [],
      traceLinks: [],
      evidence: []
    };

    const stageConfig: StageConfig = {
      id: 'requirements',
      name: 'Requirements',
      agent: 'requirements' as any,
      lifecycle_state: 'requirements',
      inputs: { files: [], allowRead: false, allowWrite: false },
      outputs: { files: ['notes.md'], traceRequired: false },
      gates: { autoUpdate: false, required: [], optional: [] }
    };

    const contract = {
      inputs: [],
      outputs: []  // Empty outputs to skip output validation
    };

    // This should succeed without throwing
    try {
      await (runner as any).applyExecutionResult('testcontext-slice-v1', stageConfig, result, contract);
    } catch (error) {
      // Slice validation will fail, but we only care that path-only mode worked
      if (error && (error as Error).message.includes('Identity-path mismatch')) {
        throw error;  // This is the error we're testing for - should NOT happen
      }
      // Other errors (like slice validation) are expected in this minimal fixture
    }

    // Verify file was written
    if (!fs.existsSync(fullPath)) {
      throw new Error('File was not written in path-only mode');
    }
  } finally {
    cleanupFixture(tmpDir);
  }
});

// Test 6: Directory with wrong identity-path should fail fast
await test('Directory with wrong identity-path fails fast', async () => {
  const tmpDir = createTempFixture();

  try {
    const runner = StageRunner.create(tmpDir);

    const identity: ArtifactIdentity = {
      sliceId: 'testcontext-slice-v1',
      stageId: 'implementing',
      artifactType: 'code',
      artifactId: 'src'
    };

    // Wrong path - identity says 'src' but path is 'lib'
    const wrongPath = path.join(tmpDir, 'contexts/testcontext/slices/testcontext-slice-v1/lib');

    const result: StageExecutionResult = {
      success: true,
      writes: [],
      writeOperations: [{
        type: 'directory',
        path: wrongPath,
        identity
      }],
      gateUpdates: [],
      traceLinks: [],
      evidence: []
    };

    const stageConfig: StageConfig = {
      id: 'implementing',
      name: 'Implementing',
      agent: 'implementing' as any,
      lifecycle_state: 'implementing',
      inputs: { files: [], allowRead: false, allowWrite: false },
      outputs: { files: [], traceRequired: false },
      gates: { autoUpdate: false, required: [], optional: [] }
    };

    const contract = {
      inputs: [],
      outputs: []
    };

    let errorThrown = false;
    try {
      await (runner as any).applyExecutionResult('testcontext-slice-v1', stageConfig, result, contract);
    } catch (error) {
      errorThrown = true;
      if (!error || !(error as Error).message.includes('Identity-path mismatch')) {
        throw new Error('Expected identity-path mismatch error for directory');
      }
    }

    if (!errorThrown) {
      throw new Error('Expected apply to throw identity-path mismatch error for directory');
    }

    // Verify directory was NOT created
    if (fs.existsSync(wrongPath)) {
      throw new Error('Directory should not have been created after validation failure');
    }
  } finally {
    cleanupFixture(tmpDir);
  }
});

// Test 7: Correct relative path file writeOperation should succeed
await test('Correct relative path file writeOperation is accepted', async () => {
  const tmpDir = createTempFixture();

  try {
    const runner = StageRunner.create(tmpDir);

    const identity: ArtifactIdentity = {
      sliceId: 'testcontext-slice-v1',
      stageId: 'implementing',
      artifactType: 'code',
      artifactId: 'service',
      logicalName: 'service.ts'
    };

    // Use relative path (common case from providers)
    const relativePath = 'contexts/testcontext/slices/testcontext-slice-v1/service.ts';

    const result: StageExecutionResult = {
      success: true,
      writes: [],
      writeOperations: [{
        type: 'file',
        path: relativePath,
        content: '// Service file',
        identity
      }],
      gateUpdates: [],
      traceLinks: [],
      evidence: []
    };

    const stageConfig: StageConfig = {
      id: 'implementing',
      name: 'Implementing',
      agent: 'implementing' as any,
      lifecycle_state: 'implementing',
      inputs: { files: [], allowRead: false, allowWrite: false },
      outputs: { files: [], traceRequired: false },
      gates: { autoUpdate: false, required: [], optional: [] }
    };

    const contract = {
      inputs: [],
      outputs: []
    };

    try {
      await (runner as any).applyExecutionResult('testcontext-slice-v1', stageConfig, result, contract);
    } catch (error) {
      // Slice validation will fail, but we only care that identity-path validation passed
      if (error && (error as Error).message.includes('Identity-path mismatch')) {
        throw error;  // This is the error we're testing for - should NOT happen
      }
      // Other errors (like slice validation) are expected in this minimal fixture
    }

    // Verify file was written to the correct location
    const absolutePath = path.join(tmpDir, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error('File was not written to the correct location');
    }
  } finally {
    cleanupFixture(tmpDir);
  }
});

// Test 8: Correct absolute path file writeOperation should succeed
await test('Correct absolute path file writeOperation is accepted', async () => {
  const tmpDir = createTempFixture();

  try {
    const runner = StageRunner.create(tmpDir);

    const identity: ArtifactIdentity = {
      sliceId: 'testcontext-slice-v1',
      stageId: 'implementing',
      artifactType: 'code',
      artifactId: 'right',
      logicalName: 'right.ts'
    };

    // Use absolute path (resolveArtifactPath returns absolute)
    const absolutePath = path.join(tmpDir, 'contexts/testcontext/slices/testcontext-slice-v1/right.ts');

    const result: StageExecutionResult = {
      success: true,
      writes: [],
      writeOperations: [{
        type: 'file',
        path: absolutePath,
        content: '// Right file',
        identity
      }],
      gateUpdates: [],
      traceLinks: [],
      evidence: []
    };

    const stageConfig: StageConfig = {
      id: 'implementing',
      name: 'Implementing',
      agent: 'implementing' as any,
      lifecycle_state: 'implementing',
      inputs: { files: [], allowRead: false, allowWrite: false },
      outputs: { files: [], traceRequired: false },
      gates: { autoUpdate: false, required: [], optional: [] }
    };

    const contract = {
      inputs: [],
      outputs: []
    };

    try {
      await (runner as any).applyExecutionResult('testcontext-slice-v1', stageConfig, result, contract);
    } catch (error) {
      // Slice validation will fail, but we only care that identity-path validation passed
      if (error && (error as Error).message.includes('Identity-path mismatch')) {
        throw error;  // This is the error we're testing for - should NOT happen
      }
      // Other errors (like slice validation) are expected in this minimal fixture
    }

    // Verify file was written to the correct location
    if (!fs.existsSync(absolutePath)) {
      throw new Error('File was not written to the correct location');
    }
  } finally {
    cleanupFixture(tmpDir);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

})();
