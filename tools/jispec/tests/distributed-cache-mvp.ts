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

async function testDistributedCacheHitSkipsWorkerExecution(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-distributed-cache-"));
  let executions = 0;

  try {
    const runtime = new LocalDistributedRuntime({ root, enableCache: true });
    await runtime.start();
    await runtime.addWorker(
      {
        id: "cache-worker",
        masterHost: "localhost",
        masterPort: 0,
        capabilities: { maxCpu: 2, maxMemory: 1024, maxDisk: 1024 },
      },
      async (task) => {
        executions += 1;
        return { workerId: "cache-worker", payload: task.payload, executions };
      }
    );

    const first = await runtime.runTask({
      sliceId: "slice-cache",
      stageId: "design",
      payload: { spec: "same" },
      requirements: DEFAULT_REQUIREMENTS,
    });
    const second = await runtime.runTask({
      sliceId: "slice-cache",
      stageId: "design",
      payload: { spec: "same" },
      requirements: DEFAULT_REQUIREMENTS,
    });

    assert.equal(first.status, "completed");
    assert.equal(second.status, "completed");
    assert.equal(executions, 1);
    assert.equal((second.result as { __cache?: { hit?: boolean } }).__cache?.hit, true);

    await runtime.stop();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testDistributedCacheMissOnPayloadChange(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-distributed-cache-"));
  let executions = 0;

  try {
    const runtime = new LocalDistributedRuntime({ root, enableCache: true });
    await runtime.start();
    await runtime.addWorker(
      {
        id: "cache-worker",
        masterHost: "localhost",
        masterPort: 0,
        capabilities: { maxCpu: 2, maxMemory: 1024, maxDisk: 1024 },
      },
      async (task) => {
        executions += 1;
        return { hashSource: task.payload, executions };
      }
    );

    await runtime.runTask({
      sliceId: "slice-cache",
      stageId: "behavior",
      payload: { spec: "v1" },
      requirements: DEFAULT_REQUIREMENTS,
    });
    await runtime.runTask({
      sliceId: "slice-cache",
      stageId: "behavior",
      payload: { spec: "v2" },
      requirements: DEFAULT_REQUIREMENTS,
    });

    assert.equal(executions, 2);
    await runtime.stop();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testDistributedCachePersistsAcrossRuntimeRestart(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-distributed-cache-"));
  let firstExecutions = 0;
  let secondExecutions = 0;

  try {
    const runtime1 = new LocalDistributedRuntime({ root, enableCache: true });
    await runtime1.start();
    await runtime1.addWorker(
      {
        id: "cache-worker-1",
        masterHost: "localhost",
        masterPort: 0,
        capabilities: { maxCpu: 2, maxMemory: 1024, maxDisk: 1024 },
      },
      async () => {
        firstExecutions += 1;
        return { runtime: 1, count: firstExecutions };
      }
    );

    await runtime1.runTask({
      sliceId: "slice-cache",
      stageId: "test",
      payload: { spec: "persisted" },
      requirements: DEFAULT_REQUIREMENTS,
    });
    await runtime1.stop();

    const runtime2 = new LocalDistributedRuntime({ root, enableCache: true });
    await runtime2.start();
    await runtime2.addWorker(
      {
        id: "cache-worker-2",
        masterHost: "localhost",
        masterPort: 0,
        capabilities: { maxCpu: 2, maxMemory: 1024, maxDisk: 1024 },
      },
      async () => {
        secondExecutions += 1;
        return { runtime: 2, count: secondExecutions };
      }
    );

    const task = await runtime2.runTask({
      sliceId: "slice-cache",
      stageId: "test",
      payload: { spec: "persisted" },
      requirements: DEFAULT_REQUIREMENTS,
    });

    assert.equal(firstExecutions, 1);
    assert.equal(secondExecutions, 0);
    assert.equal((task.result as { __cache?: { hit?: boolean } }).__cache?.hit, true);
    await runtime2.stop();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  console.log("=== Distributed Cache MVP Test ===\n");

  const tests: Array<{ name: string; run: () => Promise<void> }> = [
    { name: "cache hit skips worker execution", run: testDistributedCacheHitSkipsWorkerExecution },
    { name: "payload change causes cache miss", run: testDistributedCacheMissOnPayloadChange },
    { name: "disk cache survives runtime restart", run: testDistributedCachePersistsAcrossRuntimeRestart },
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
  console.error("Distributed cache MVP test failed:", error);
  process.exit(1);
});
