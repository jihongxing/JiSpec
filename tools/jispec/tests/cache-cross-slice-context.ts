/**
 * Cache Cross-Slice Context Test
 *
 * Verifies that shared context-level inputs properly invalidate cache
 * across multiple slices when the context file changes.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StageRunner } from '../stage-runner.js';

console.log('Running Cache Cross-Slice Context Test...\n');

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

// Helper: Create test project structure with multiple slices sharing context
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

  // Create shared context directory
  const contextDir = path.join(tmpDir, 'contexts', 'test');
  fs.mkdirSync(contextDir, { recursive: true });

  fs.writeFileSync(
    path.join(contextDir, 'context.yaml'),
    contextContent
  );

  fs.writeFileSync(
    path.join(contextDir, 'contracts.yaml'),
    `contracts:
  - id: shared-contract
    name: Shared Contract
`
  );

  // Create slice A
  const sliceADir = path.join(contextDir, 'slices', 'test-slice-a-v1');
  fs.mkdirSync(sliceADir, { recursive: true });

  fs.writeFileSync(
    path.join(sliceADir, 'slice.yaml'),
    `id: test-slice-a-v1
context_id: test
service_id: service-a
lifecycle:
  state: proposed
gates: {}
`
  );

  // Create slice B
  const sliceBDir = path.join(contextDir, 'slices', 'test-slice-b-v1');
  fs.mkdirSync(sliceBDir, { recursive: true });

  fs.writeFileSync(
    path.join(sliceBDir, 'slice.yaml'),
    `id: test-slice-b-v1
context_id: test
service_id: service-b
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

// Test: Shared context change invalidates cache for both slices
await test('Shared context change invalidates cache for both slices', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jispec-cross-slice-'));
  const counterFile = path.join(tmpDir, 'call-counter.txt');

  try {
    createTestProject(tmpDir, 'id: test\nname: Shared Context\nversion: 1.0.0\n');

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

    // Run slice A first time
    const resultA1 = await runner.run({
      sliceId: 'test-slice-a-v1',
      stageConfig,
      skipValidation: true,
    });

    if (!resultA1.success) {
      throw new Error(`Slice A first execution failed: ${resultA1.error}`);
    }

    const callCountAfterA1 = readCallCounter(counterFile);
    if (callCountAfterA1 !== 1) {
      throw new Error(`Expected 1 agent call after slice A first run, got ${callCountAfterA1}`);
    }

    // Run slice B first time
    const resultB1 = await runner.run({
      sliceId: 'test-slice-b-v1',
      stageConfig,
      skipValidation: true,
    });

    if (!resultB1.success) {
      throw new Error(`Slice B first execution failed: ${resultB1.error}`);
    }

    const callCountAfterB1 = readCallCounter(counterFile);
    if (callCountAfterB1 !== 2) {
      throw new Error(`Expected 2 agent calls after slice B first run, got ${callCountAfterB1}`);
    }

    // Restore both slices to initial state
    const sliceADir = path.join(tmpDir, 'contexts', 'test', 'slices', 'test-slice-a-v1');
    fs.writeFileSync(
      path.join(sliceADir, 'slice.yaml'),
      `id: test-slice-a-v1
context_id: test
service_id: service-a
lifecycle:
  state: proposed
gates: {}
`
    );

    const sliceBDir = path.join(tmpDir, 'contexts', 'test', 'slices', 'test-slice-b-v1');
    fs.writeFileSync(
      path.join(sliceBDir, 'slice.yaml'),
      `id: test-slice-b-v1
context_id: test
service_id: service-b
lifecycle:
  state: proposed
gates: {}
`
    );

    // Modify shared context.yaml
    const contextDir = path.join(tmpDir, 'contexts', 'test');
    fs.writeFileSync(
      path.join(contextDir, 'context.yaml'),
      'id: test\nname: Shared Context Modified\nversion: 2.0.0\n'
    );

    // Reset call counter
    fs.writeFileSync(counterFile, '0', 'utf-8');

    // Create new runner to pick up changed context
    const runner2 = await StageRunner.create(tmpDir);

    // Run slice A second time (should miss due to context change)
    const resultA2 = await runner2.run({
      sliceId: 'test-slice-a-v1',
      stageConfig,
      skipValidation: true,
    });

    if (!resultA2.success) {
      throw new Error(`Slice A second execution failed: ${resultA2.error}`);
    }

    const callCountAfterA2 = readCallCounter(counterFile);
    if (callCountAfterA2 !== 1) {
      throw new Error(`Expected 1 agent call after slice A context change (cache miss), got ${callCountAfterA2}`);
    }

    // Run slice B second time (should also miss due to same context change)
    const resultB2 = await runner2.run({
      sliceId: 'test-slice-b-v1',
      stageConfig,
      skipValidation: true,
    });

    if (!resultB2.success) {
      throw new Error(`Slice B second execution failed: ${resultB2.error}`);
    }

    const callCountAfterB2 = readCallCounter(counterFile);
    if (callCountAfterB2 !== 2) {
      throw new Error(`Expected 2 agent calls after slice B context change (cache miss), got ${callCountAfterB2}`);
    }
  } finally {
    delete process.env.JISPEC_TEST_CALL_COUNTER_FILE;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

})();
