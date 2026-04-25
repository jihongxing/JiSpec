/**
 * Cache Integration E2E Tests
 *
 * Tests real StageRunner.run() with cache hit/miss behavior
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StageRunner } from '../stage-runner.js';

console.log('Running Cache Integration E2E Tests...\n');

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

  // agents/agents.yaml (must be array format with 'agents' wrapper)
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

// Test 1: First execution - cache miss, agent called
await test('First execution causes cache miss and calls agent', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jispec-cache-e2e-'));
  const counterFile = path.join(tmpDir, 'call-counter.txt');

  try {
    createTestProject(tmpDir);

    // Set up call counter
    process.env.JISPEC_TEST_CALL_COUNTER_FILE = counterFile;

    const runner = await StageRunner.create(tmpDir);

    const stageConfig = {
      id: 'requirements',
      name: 'Requirements',
      agent: 'domain' as const,
      lifecycle_state: 'framed',
      inputs: { files: ['contexts/test-context/slices/test-slice/input.txt'], allowRead: true, allowWrite: false },
      outputs: { files: ['contexts/test-context/slices/test-slice/output.txt'], schemas: [], traceRequired: false },
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

// Test 2: Second execution with same inputs - cache hit, agent NOT called
await test('Second execution with same inputs causes cache hit and skips agent', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jispec-cache-e2e-'));
  const counterFile = path.join(tmpDir, 'call-counter.txt');

  try {
    createTestProject(tmpDir);

    // Set up call counter
    process.env.JISPEC_TEST_CALL_COUNTER_FILE = counterFile;

    const runner = await StageRunner.create(tmpDir);

    const stageConfig = {
      id: 'requirements',
      name: 'Requirements',
      agent: 'domain' as const,
      lifecycle_state: 'framed',
      inputs: { files: ['contexts/test-context/slices/test-slice/input.txt'], allowRead: true, allowWrite: false },
      outputs: { files: ['contexts/test-context/slices/test-slice/output.txt'], schemas: [], traceRequired: false },
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

    // Second run with same inputs
    const result2 = await runner.run({
      sliceId: 'test-slice-v1',
      stageConfig,
      skipValidation: true,
    });

    if (!result2.success) {
      throw new Error(`Second execution failed: ${result2.error}`);
    }

    const callCountAfterSecond = readCallCounter(counterFile);
    if (callCountAfterSecond !== 1) {
      throw new Error(`Expected 1 agent call after second run (cache hit), got ${callCountAfterSecond}`);
    }
  } finally {
    delete process.env.JISPEC_TEST_CALL_COUNTER_FILE;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Test 3: Input content change causes cache miss
await test('Input content change causes cache miss and re-executes agent', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jispec-cache-e2e-'));
  const counterFile = path.join(tmpDir, 'call-counter.txt');

  try {
    createTestProject(tmpDir);

    // Set up call counter
    process.env.JISPEC_TEST_CALL_COUNTER_FILE = counterFile;

    const runner = await StageRunner.create(tmpDir);

    const stageConfig = {
      id: 'requirements',
      name: 'Requirements',
      agent: 'domain' as const,
      lifecycle_state: 'framed',
      inputs: { files: ['contexts/test-context/slices/test-slice/input.txt'], allowRead: true, allowWrite: false },
      outputs: { files: ['contexts/test-context/slices/test-slice/output.txt'], schemas: [], traceRequired: false },
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

    // Modify input file
    const sliceDir = path.join(tmpDir, 'contexts', 'test-context', 'slices', 'test-slice');
    fs.writeFileSync(
      path.join(sliceDir, 'input.txt'),
      'Changed input content'
    );

    // Second run with changed input
    const result2 = await runner.run({
      sliceId: 'test-slice-v1',
      stageConfig,
      skipValidation: true,
    });

    if (!result2.success) {
      throw new Error(`Second execution failed: ${result2.error}`);
    }

    const callCountAfterSecond = readCallCounter(counterFile);
    if (callCountAfterSecond !== 2) {
      throw new Error(`Expected 2 agent calls after input change, got ${callCountAfterSecond}`);
    }
  } finally {
    delete process.env.JISPEC_TEST_CALL_COUNTER_FILE;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Test 4: Provider/model change causes cache miss
await test('Provider or model change causes cache miss and re-executes agent', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jispec-cache-e2e-'));
  const counterFile = path.join(tmpDir, 'call-counter.txt');

  try {
    createTestProject(tmpDir);

    // Set up call counter
    process.env.JISPEC_TEST_CALL_COUNTER_FILE = counterFile;

    const runner = await StageRunner.create(tmpDir);

    const stageConfig = {
      id: 'requirements',
      name: 'Requirements',
      agent: 'domain' as const,
      lifecycle_state: 'framed',
      inputs: { files: ['contexts/test-context/slices/test-slice/input.txt'], allowRead: true, allowWrite: false },
      outputs: { files: ['contexts/test-context/slices/test-slice/output.txt'], schemas: [], traceRequired: false },
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

    // Change provider/model in project.yaml
    const jiprojectDir = path.join(tmpDir, 'jiproject');
    fs.writeFileSync(
      path.join(jiprojectDir, 'project.yaml'),
      `id: test-project
name: Test Project
version: 0.1.0
delivery_model: bounded-context-slice
ai:
  provider: anthropic
  model: claude-opus-4
`
    );

    // Second run with changed provider/model
    const result2 = await runner.run({
      sliceId: 'test-slice-v1',
      stageConfig,
      skipValidation: true,
    });

    if (!result2.success) {
      throw new Error(`Second execution failed: ${result2.error}`);
    }

    const callCountAfterSecond = readCallCounter(counterFile);
    if (callCountAfterSecond !== 2) {
      throw new Error(`Expected 2 agent calls after provider change, got ${callCountAfterSecond}`);
    }
  } finally {
    delete process.env.JISPEC_TEST_CALL_COUNTER_FILE;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

})();
