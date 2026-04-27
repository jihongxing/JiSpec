import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalDistributedRuntime } from "../distributed-runtime";

const DEFAULT_REQUIREMENTS = {
  cpu: 1,
  memory: 128,
  disk: 64,
  timeout: 1000,
};

async function testStageInvalidationForcesReexecution(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-cache-invalidation-"));
  let executions = 0;

  try {
    const runtime = new LocalDistributedRuntime({ root, enableCache: true });
    await runtime.start();
    await runtime.addWorker(
      {
        id: "worker-a",
        masterHost: "localhost",
        masterPort: 0,
        capabilities: { maxCpu: 2, maxMemory: 1024, maxDisk: 1024 },
      },
      async () => {
        executions += 1;
        return { executions };
      }
    );

    await runtime.runTask({
      sliceId: "slice-a",
      stageId: "design",
      payload: { version: 1 },
      requirements: DEFAULT_REQUIREMENTS,
    });

    const invalidated = await runtime.invalidateStageCache(
      "slice-a",
      "design",
      "manual",
      "test invalidation"
    );

    assert.equal(invalidated, 1);

    const rerun = await runtime.runTask({
      sliceId: "slice-a",
      stageId: "design",
      payload: { version: 1 },
      requirements: DEFAULT_REQUIREMENTS,
    });

    assert.equal(executions, 2);
    assert.equal((rerun.result as { __cache?: { hit?: boolean } }).__cache?.hit, undefined);
    await runtime.stop();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testWarmupPromotesDiskEntriesToL1(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-cache-warmup-"));
  let executions = 0;

  try {
    const runtime1 = new LocalDistributedRuntime({ root, enableCache: true });
    await runtime1.start();
    await runtime1.addWorker(
      {
        id: "worker-a",
        masterHost: "localhost",
        masterPort: 0,
        capabilities: { maxCpu: 2, maxMemory: 1024, maxDisk: 1024 },
      },
      async () => {
        executions += 1;
        return { executions };
      }
    );

    await runtime1.runTask({
      sliceId: "slice-warm",
      stageId: "behavior",
      payload: { kind: "warmup" },
      requirements: DEFAULT_REQUIREMENTS,
    });
    await runtime1.stop();

    const runtime2 = new LocalDistributedRuntime({ root, enableCache: true });
    const warmupResult = await runtime2.warmupStageCache("slice-warm", "behavior");
    const statsAfterWarmup = runtime2.getCacheStats();

    assert.equal(warmupResult.requested, 1);
    assert.equal(warmupResult.loaded, 1);
    assert.equal(statsAfterWarmup.memoryManifests >= 1, true);
    assert.equal(statsAfterWarmup.memoryResults >= 1, true);

    await runtime2.start();
    await runtime2.addWorker(
      {
        id: "worker-b",
        masterHost: "localhost",
        masterPort: 0,
        capabilities: { maxCpu: 2, maxMemory: 1024, maxDisk: 1024 },
      },
      async () => {
        executions += 1;
        return { executions };
      }
    );

    const task = await runtime2.runTask({
      sliceId: "slice-warm",
      stageId: "behavior",
      payload: { kind: "warmup" },
      requirements: DEFAULT_REQUIREMENTS,
    });

    assert.equal(executions, 1);
    assert.equal((task.result as { __cache?: { hit?: boolean } }).__cache?.hit, true);
    await runtime2.stop();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testSliceInvalidationClearsMultipleStages(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-cache-slice-invalidation-"));
  let executions = 0;

  try {
    const runtime = new LocalDistributedRuntime({ root, enableCache: true });
    await runtime.start();
    await runtime.addWorker(
      {
        id: "worker-a",
        masterHost: "localhost",
        masterPort: 0,
        capabilities: { maxCpu: 2, maxMemory: 1024, maxDisk: 1024 },
      },
      async (task) => {
        executions += 1;
        return { executions, stageId: task.stageId };
      }
    );

    await runtime.runTask({
      sliceId: "slice-multi",
      stageId: "design",
      payload: { spec: "shared" },
      requirements: DEFAULT_REQUIREMENTS,
    });
    await runtime.runTask({
      sliceId: "slice-multi",
      stageId: "behavior",
      payload: { spec: "shared" },
      requirements: DEFAULT_REQUIREMENTS,
    });

    const invalidated = await runtime.invalidateSliceCache(
      "slice-multi",
      "manual",
      "test slice invalidation"
    );

    assert.equal(invalidated, 2);

    await runtime.runTask({
      sliceId: "slice-multi",
      stageId: "design",
      payload: { spec: "shared" },
      requirements: DEFAULT_REQUIREMENTS,
    });
    await runtime.runTask({
      sliceId: "slice-multi",
      stageId: "behavior",
      payload: { spec: "shared" },
      requirements: DEFAULT_REQUIREMENTS,
    });

    assert.equal(executions, 4);
    await runtime.stop();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  console.log("=== Distributed Cache Invalidation & Warmup Test ===\n");

  const tests: Array<{ name: string; run: () => Promise<void> }> = [
    { name: "stage invalidation forces re-execution", run: testStageInvalidationForcesReexecution },
    { name: "warmup promotes disk entries to L1", run: testWarmupPromotesDiskEntriesToL1 },
    { name: "slice invalidation clears multiple stages", run: testSliceInvalidationClearsMultipleStages },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test.run();
      console.log(`✓ ${test.name}`);
      passed += 1;
    } catch (error) {
      console.error(`✗ ${test.name}:`, error);
      failed += 1;
    }
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Distributed cache invalidation/warmup test failed:", error);
  process.exit(1);
});
