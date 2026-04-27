import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RemoteDistributedRuntime } from "../remote-runtime";

const DEFAULT_REQUIREMENTS = {
  cpu: 1,
  memory: 128,
  disk: 64,
  timeout: 1000,
};

async function testRemoteWorkerRegistersAndExecutesTask(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-remote-runtime-"));
  let executions = 0;

  try {
    const runtime = new RemoteDistributedRuntime({ root, enableCache: false });
    await runtime.start();

    await runtime.addRemoteWorker(
      {
        id: "remote-worker-a",
        masterHost: "127.0.0.1",
        masterPort: 0,
        capabilities: { maxCpu: 2, maxMemory: 1024, maxDisk: 1024 },
      },
      async (task) => {
        executions += 1;
        return { workerId: "remote-worker-a", stageId: task.stageId, executions };
      }
    );

    const worker = runtime.getScheduler().getWorker("remote-worker-a");
    assert.ok(worker);

    const task = await runtime.runTask({
      sliceId: "remote-slice",
      stageId: "design",
      payload: { mode: "remote" },
      requirements: DEFAULT_REQUIREMENTS,
    });

    assert.equal(task.status, "completed");
    assert.equal(task.workerId, "remote-worker-a");
    assert.deepEqual(task.result, { workerId: "remote-worker-a", stageId: "design", executions: 1 });
    assert.equal(executions, 1);

    await runtime.stop();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testRemoteRuntimeRetriesOnFailure(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-remote-runtime-"));
  let attempts = 0;

  try {
    const runtime = new RemoteDistributedRuntime({ root, enableCache: false });
    await runtime.start();

    await runtime.addRemoteWorker(
      {
        id: "remote-worker-retry",
        masterHost: "127.0.0.1",
        masterPort: 0,
        capabilities: { maxCpu: 2, maxMemory: 1024, maxDisk: 1024 },
      },
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("remote fail once");
        }
        return { attempts };
      }
    );

    const task = await runtime.runTask({
      sliceId: "remote-slice",
      stageId: "behavior",
      payload: { mode: "retry" },
      requirements: DEFAULT_REQUIREMENTS,
      maxRetries: 2,
    });

    assert.equal(task.status, "completed");
    assert.equal(task.retryCount, 1);
    assert.deepEqual(task.result, { attempts: 2 });
    await runtime.stop();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testRemoteCacheHitSkipsSecondExecution(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-remote-runtime-"));
  let executions = 0;

  try {
    const runtime = new RemoteDistributedRuntime({ root, enableCache: true });
    await runtime.start();

    await runtime.addRemoteWorker(
      {
        id: "remote-worker-cache",
        masterHost: "127.0.0.1",
        masterPort: 0,
        capabilities: { maxCpu: 2, maxMemory: 1024, maxDisk: 1024 },
      },
      async (task) => {
        executions += 1;
        return { executions, payload: task.payload };
      }
    );

    await runtime.runTask({
      sliceId: "remote-slice",
      stageId: "test",
      payload: { mode: "cache" },
      requirements: DEFAULT_REQUIREMENTS,
    });

    const second = await runtime.runTask({
      sliceId: "remote-slice",
      stageId: "test",
      payload: { mode: "cache" },
      requirements: DEFAULT_REQUIREMENTS,
    });

    assert.equal(executions, 1);
    assert.equal((second.result as { __cache?: { hit?: boolean } }).__cache?.hit, true);

    await runtime.stop();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  console.log("=== Remote Runtime MVP Test ===\n");

  const tests: Array<{ name: string; run: () => Promise<void> }> = [
    { name: "remote worker registers and executes task", run: testRemoteWorkerRegistersAndExecutesTask },
    { name: "remote runtime retries on failure", run: testRemoteRuntimeRetriesOnFailure },
    { name: "remote cache hit skips second execution", run: testRemoteCacheHitSkipsSecondExecution },
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
  console.error("Remote runtime MVP test failed:", error);
  process.exit(1);
});
