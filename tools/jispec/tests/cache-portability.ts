/**
 * Cache Portability Test
 *
 * Verifies that cache keys are identical across different workspace roots
 * for the same logical slice/stage/contract.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StageRunner } from '../stage-runner.js';

console.log('Running Cache Portability Test...\n');

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

  const sliceDir = path.join(tmpDir, 'contexts', 'test', 'slices', 'test-slice-v1');
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

  fs.writeFileSync(
    path.join(sliceDir, 'input.txt'),
    'Initial input content'
  );

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

(async () => {

await test('Cache keys are identical across different workspace roots', async () => {
  const tmpDir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'jispec-portability-1-'));
  const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'jispec-portability-2-'));

  try {
    createTestProject(tmpDir1);
    createTestProject(tmpDir2);

    const runner1 = await StageRunner.create(tmpDir1);
    const runner2 = await StageRunner.create(tmpDir2);

    const stageConfig = {
      id: 'requirements',
      name: 'Requirements',
      agent: 'domain' as const,
      lifecycle_state: 'framed',
      inputs: { files: ['{slice}/input.txt'], allowRead: true, allowWrite: false },
      outputs: { files: ['{slice}/output.txt'], schemas: [], traceRequired: false },
      gates: { required: [], optional: [], autoUpdate: false },
    };

    // Capture cache keys by intercepting cacheManager.get
    let cacheKey1: string | undefined;
    let cacheKey2: string | undefined;

    const originalGet1 = (runner1 as any).cacheManager.get.bind((runner1 as any).cacheManager);
    const originalGet2 = (runner2 as any).cacheManager.get.bind((runner2 as any).cacheManager);

    (runner1 as any).cacheManager.get = function(key: string) {
      cacheKey1 = key;
      return originalGet1(key);
    };

    (runner2 as any).cacheManager.get = function(key: string) {
      cacheKey2 = key;
      return originalGet2(key);
    };

    await runner1.run({
      sliceId: 'test-slice-v1',
      stageConfig,
      skipValidation: true,
    });

    await runner2.run({
      sliceId: 'test-slice-v1',
      stageConfig,
      skipValidation: true,
    });

    if (!cacheKey1 || !cacheKey2) {
      throw new Error('Failed to capture cache keys');
    }

    if (cacheKey1 !== cacheKey2) {
      throw new Error(`Cache keys differ:\n  Key1: ${cacheKey1}\n  Key2: ${cacheKey2}`);
    }

    console.log(`  Cache key: ${cacheKey1}`);
  } finally {
    fs.rmSync(tmpDir1, { recursive: true, force: true });
    fs.rmSync(tmpDir2, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

})();
