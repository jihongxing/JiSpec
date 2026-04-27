import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ResourceManager } from "../resource-manager";
import { LocalDistributedRuntime } from "../distributed-runtime";
import { RemoteDistributedRuntime } from "../remote-runtime";

const DEFAULT_REQUIREMENTS = {
  cpu: 1,
  memory: 128,
  disk: 64,
  timeout: 1000,
};

async function testAllocationBlocksOversubscription(): Promise<void> {
  const manager = new ResourceManager({ cpu: 2, memory: 512, disk: 256 });

  const allocation = manager.allocateResources("worker-a", "task-1", {
    cpu: 2,
    memory: 256,
    disk: 128,
  });

  assert.equal(manager.canAllocate({ cpu: 1, memory: 128, disk: 64 }), false);
  assert.throws(
    () => manager.allocateResources("worker-a", "task-2", { cpu: 1, memory: 128, disk: 64 }),
    /Insufficient resources/
  );

  manager.releaseResources(allocation.id);
  assert.equal(manager.canAllocate({ cpu: 1, memory: 128, disk: 64 }), true);
}

async function testLocalRuntimeTracksAndReleasesWorkerResources(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-resource-local-"));

  try {
    const runtime = new LocalDistributedRuntime({ root, enableCache: false, enableResourceManagement: true });
    await runtime.start();

    let unblock: (() => void) | undefined;
    const taskFinished = new Promise<void>((resolve) => {
      unblock = resolve;
    });

    await runtime.addWorker(
      {
        id: "resource-worker",
        masterHost: "localhost",
        masterPort: 0,
        capabilities: { maxCpu: 2, maxMemory: 512, maxDisk: 256 },
      },
      async () => {
        await taskFinished;
        return { workerId: "resource-worker" };
      }
    );

    const taskPromise = runtime.runTask({
      sliceId: "slice-resource",
      stageId: "design",
      payload: { step: "hold" },
      requirements: DEFAULT_REQUIREMENTS,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const inFlightStatus = runtime.getWorkerResourceStatus("resource-worker");
    assert.ok(inFlightStatus);
    assert.equal(inFlightStatus?.used.cpu, 1);
    assert.equal(inFlightStatus?.used.memory, 128);
    assert.equal(inFlightStatus?.allocationCount, 1);

    unblock?.();
    const task = await taskPromise;

    assert.equal(task.status, "completed");

    const releasedStatus = runtime.getWorkerResourceStatus("resource-worker");
    assert.ok(releasedStatus);
    assert.equal(releasedStatus?.used.cpu, 0);
    assert.equal(releasedStatus?.used.memory, 0);
    assert.equal(releasedStatus?.allocationCount, 0);

    await runtime.stop();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testRemoteRuntimeReleasesResourcesAfterCompletion(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-resource-remote-"));

  try {
    const runtime = new RemoteDistributedRuntime({ root, enableCache: false, enableResourceManagement: true });
    await runtime.start();

    await runtime.addRemoteWorker(
      {
        id: "remote-resource-worker",
        masterHost: "127.0.0.1",
        masterPort: 0,
        capabilities: { maxCpu: 2, maxMemory: 512, maxDisk: 256 },
      },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { workerId: "remote-resource-worker" };
      }
    );

    const task = await runtime.runTask({
      sliceId: "remote-resource-slice",
      stageId: "test",
      payload: { step: "remote" },
      requirements: DEFAULT_REQUIREMENTS,
    });

    assert.equal(task.status, "completed");

    const status = runtime.getWorkerResourceStatus("remote-resource-worker");
    assert.ok(status);
    assert.equal(status?.used.cpu, 0);
    assert.equal(status?.used.memory, 0);
    assert.equal(status?.allocationCount, 0);

    await runtime.stop();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  console.log("=== Resource Management Test ===\n");

  const tests: Array<{ name: string; run: () => Promise<void> }> = [
    { name: "allocation blocks oversubscription", run: testAllocationBlocksOversubscription },
    { name: "local runtime tracks and releases worker resources", run: testLocalRuntimeTracksAndReleasesWorkerResources },
    { name: "remote runtime releases resources after completion", run: testRemoteRuntimeReleasesResourcesAfterCompletion },
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
  console.error("Resource management test failed:", error);
  process.exit(1);
});
