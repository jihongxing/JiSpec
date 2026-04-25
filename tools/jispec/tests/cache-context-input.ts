/**
 * Cache Context Input Test
 *
 * Verifies that context-level inputs (e.g., {context}/context.yaml)
 * are properly included in cache keys and trigger cache misses when changed.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StageRunner } from '../stage-runner.js';

console.log('Running Cache Context Input Test...\n');

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

// Helper: Create test project structure with context-level inputs
function createTestProject(tmpDir: string, contextContent: string): void {
  const jiprojectDir = path.join(tmpDir, 'jiproject');
  fs.mkdirSync(jiprojectDir, { recursive: true });

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

  // Create context directory with context.yaml
  const contextDir = path.join(tmpDir, 'contexts', 'test');
  fs.mkdirSync(contextDir, { recursive: true });

  fs.writeFileSync(
    path.join(contextDir, 'context.yaml'),
    contextContent
  );

  fs.writeFileSync(
    path.join(contextDir, 'contracts.yaml'),
    `contracts:
  - id: test-contract
    name: Test Contract
`
  );

  // Create slice
  const sliceDir = path.join(contextDir, 'slices', 'test-slice-v1');
  fs.mkdirSync(sliceDir, { recursive: true });

  fs.writeFileSync(
    path.join(sliceDir, 'slice.yaml'),
    `id: test-slice-v1
context_id: test
service_id: test-service
lifecycle:
  state: proposed
gates: {}
`
  );

  // agents/agents.yaml
  const agentsDir = path.join(tmpDir, 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });

  fs.writeFileSync(
    path.join(agentsDir, 'agents.yaml'),
    `agents:
  - id: domain-agent
    role: Domain expert
    inputs: []
    outputs: []
`
  );
}

// Helper: Read call counter
function readCallCounter(counterFile: string): number {
  if (!fs.existsSync(counterFile)) {
    return 0;
  }
  return parseInt(fs.readFileSync(counterFile, 'utf-8'), 10) || 0;
}

(async () => {

// Test 1: Context-level inputs are included in cache key
await test('Context-level inputs are included in cache key', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jispec-context-input-'));
  const counterFile = path.join(tmpDir, 'call-counter.txt');

  try {
    createTestProject(tmpDir, 'id: test\nname: Test Context\nversion: 1.0.0\n');

    process.env.JISPEC_TEST_CALL_COUNTER_FILE = counterFile;

    const runner = await StageRunner.create(tmpDir);

    const stageConfig = {
      id: 'requirements',
      name: 'Requirements',
      agent: 'domain' as const,
      lifecycle_state: 'framed',
      inputs: { files: ['{context}/context.yaml', '{context}/contracts.yaml'], allowRead: true, allowWrite: false },
      outputs: { files: ['{slice}/requirements.md'], schemas: [], traceRequired: false },
      gates: { required: [], optional: [], autoUpdate: false },
    };

    const result = await runner.run({
      sliceId: 'test-slice-v1',
      stageConfig,
      skipValidation: true,
    });

    if (!result.success) {
      throw new Error(`Stage execution failed: ${result.error}`);
    }

    const callCount = readCallCounter(counterFile);
    if (callCount !== 1) {
      throw new Error(`Expected 1 agent call, got ${callCount}`);
    }
  } finally {
    delete process.env.JISPEC_TEST_CALL_COUNTER_FILE;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Test 2: Context file change triggers cache miss
await test('Context file change triggers cache miss', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jispec-context-change-'));
  const counterFile = path.join(tmpDir, 'call-counter.txt');

  try {
    createTestProject(tmpDir, 'id: test\nname: Test Context\nversion: 1.0.0\n');

    process.env.JISPEC_TEST_CALL_COUNTER_FILE = counterFile;

    const runner = await StageRunner.create(tmpDir);

    const stageConfig = {
      id: 'requirements',
      name: 'Requirements',
      agent: 'domain' as const,
      lifecycle_state: 'framed',
      inputs: { files: ['{context}/context.yaml', '{context}/contracts.yaml'], allowRead: true, allowWrite: false },
      outputs: { files: ['{slice}/requirements.md'], schemas: [], traceRequired: false },
      gates: { required: [], optional: [], autoUpdate: false },
    };

    // First run
    const result1 = await runner.run({
      sliceId: 'test-slice-v1',
      stageConfig,
      skipValidation: true,
    });

    if (!result1.success) {
      throw new Error(`First execution failed: ${result1.error}`);
    }

    const callCountAfterFirst = readCallCounter(counterFile);
    if (callCountAfterFirst !== 1) {
      throw new Error(`Expected 1 agent call after first run, got ${callCountAfterFirst}`);
    }

    // Restore slice to initial state
    const sliceDir = path.join(tmpDir, 'contexts', 'test', 'slices', 'test-slice-v1');
    fs.writeFileSync(
      path.join(sliceDir, 'slice.yaml'),
      `id: test-slice-v1
context_id: test
service_id: test-service
lifecycle:
  state: proposed
gates: {}
`
    );

    // Modify context.yaml
    const contextDir = path.join(tmpDir, 'contexts', 'test');
    fs.writeFileSync(
      path.join(contextDir, 'context.yaml'),
      'id: test\nname: Test Context Modified\nversion: 2.0.0\n'
    );

    // Reset call counter
    fs.writeFileSync(counterFile, '0', 'utf-8');

    // Create new runner to pick up changed context
    const runner2 = await StageRunner.create(tmpDir);

    // Second run with changed context
    const result2 = await runner2.run({
      sliceId: 'test-slice-v1',
      stageConfig,
      skipValidation: true,
    });

    if (!result2.success) {
      throw new Error(`Second execution failed: ${result2.error}`);
    }

    const callCountAfterSecond = readCallCounter(counterFile);
    if (callCountAfterSecond !== 1) {
      throw new Error(`Expected 1 agent call after context change (cache miss), got ${callCountAfterSecond}`);
    }
  } finally {
    delete process.env.JISPEC_TEST_CALL_COUNTER_FILE;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

})();
