import assert from "node:assert";
import { LocalDistributedRuntime } from "../distributed-runtime";
import type { DistributedTask } from "../distributed-scheduler";

const DEFAULT_REQUIREMENTS = {
  cpu: 1,
  memory: 128,
  disk: 64,
  timeout: 1000,
};

async function testEndToEndExecution(): Promise<void> {
  const runtime = new LocalDistributedRuntime({ strategy: "least_loaded", enableCache: false });

  try {
    await runtime.start();
    await runtime.addWorker(
      {
        id: "worker-a",
        masterHost: "localhost",
        masterPort: 0,
        capabilities: { maxCpu: 2, maxMemory: 1024, maxDisk: 1024 },
      },
      async (task) => ({ workerId: "worker-a", stageId: task.stageId })
    );

    const task = await runtime.runTask({
      sliceId: "slice-a",
      stageId: "design",
      payload: { kind: "design" },
      requirements: DEFAULT_REQUIREMENTS,
    });

    assert.equal(task.status, "completed");
    assert.equal(task.workerId, "worker-a");
    assert.deepEqual(task.result, { workerId: "worker-a", stageId: "design" });
  } finally {
    await runtime.stop();
  }
}

async function testResourceAwareScheduling(): Promise<void> {
  const runtime = new LocalDistributedRuntime({ strategy: "least_loaded", enableCache: false });

  try {
    await runtime.start();
    await runtime.addWorker(
      {
        id: "small-worker",
        masterHost: "localhost",
        masterPort: 0,
        capabilities: { maxCpu: 1, maxMemory: 256, maxDisk: 256 },
      },
      async () => ({ workerId: "small-worker" })
    );
    await runtime.addWorker(
      {
        id: "large-worker",
        masterHost: "localhost",
        masterPort: 0,
        capabilities: { maxCpu: 4, maxMemory: 2048, maxDisk: 2048 },
      },
      async () => ({ workerId: "large-worker" })
    );

    const task = await runtime.runTask({
      sliceId: "slice-heavy",
      stageId: "code",
      payload: {},
      requirements: {
        cpu: 2,
        memory: 512,
        disk: 128,
        timeout: 1000,
      },
    });

    assert.equal(task.status, "completed");
    assert.equal(task.workerId, "large-worker");
  } finally {
    await runtime.stop();
  }
}

async function testRetryThenSuccess(): Promise<void> {
  const runtime = new LocalDistributedRuntime({ strategy: "least_loaded", enableCache: false });
  let attempts = 0;

  try {
    await runtime.start();
    await runtime.addWorker(
      {
        id: "retry-worker",
        masterHost: "localhost",
        masterPort: 0,
        capabilities: { maxCpu: 2, maxMemory: 1024, maxDisk: 1024 },
      },
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("first attempt fails");
        }
        return { attempts };
      }
    );

    const task = await runtime.runTask({
      sliceId: "slice-retry",
      stageId: "test",
      payload: {},
      requirements: DEFAULT_REQUIREMENTS,
      maxRetries: 2,
    });

    assert.equal(task.status, "completed");
    assert.equal(task.retryCount, 1);
    assert.deepEqual(task.result, { attempts: 2 });
  } finally {
    await runtime.stop();
  }
}

async function testExhaustRetries(): Promise<void> {
  const runtime = new LocalDistributedRuntime({ strategy: "least_loaded", enableCache: false });

  try {
    await runtime.start();
    await runtime.addWorker(
      {
        id: "failing-worker",
        masterHost: "localhost",
        masterPort: 0,
        capabilities: { maxCpu: 2, maxMemory: 1024, maxDisk: 1024 },
      },
      async () => {
        throw new Error("always fails");
      }
    );

    let failed = false;
    try {
      await runtime.runTask({
        sliceId: "slice-fail",
        stageId: "behavior",
        payload: {},
        requirements: DEFAULT_REQUIREMENTS,
        maxRetries: 2,
      });
    } catch (error) {
      failed = true;
      assert.match(String(error), /always fails/);
    }

    assert.equal(failed, true);

    const failedTask = runtime
      .getScheduler()
      .getAllTasks()
      .find((task) => task.sliceId === "slice-fail") as DistributedTask | undefined;

    assert.ok(failedTask);
    assert.equal(failedTask?.status, "failed");
    assert.equal(failedTask?.retryCount, 2);
  } finally {
    await runtime.stop();
  }
}

async function testLeastLoadedBalancesParallelTasks(): Promise<void> {
  const runtime = new LocalDistributedRuntime({ strategy: "least_loaded", enableCache: false });
  const assignments: string[] = [];

  try {
    await runtime.start();

    const executorFor = (workerId: string) => async () => {
      assignments.push(workerId);
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { workerId };
    };

    await runtime.addWorker(
      {
        id: "worker-1",
        masterHost: "localhost",
        masterPort: 0,
        capabilities: { maxCpu: 1, maxMemory: 512, maxDisk: 512 },
      },
      executorFor("worker-1")
    );
    await runtime.addWorker(
      {
        id: "worker-2",
        masterHost: "localhost",
        masterPort: 0,
        capabilities: { maxCpu: 1, maxMemory: 512, maxDisk: 512 },
      },
      executorFor("worker-2")
    );

    const taskIds = [
      runtime.submitTask({
        sliceId: "slice-1",
        stageId: "design",
        payload: {},
        requirements: DEFAULT_REQUIREMENTS,
      }),
      runtime.submitTask({
        sliceId: "slice-2",
        stageId: "design",
        payload: {},
        requirements: DEFAULT_REQUIREMENTS,
      }),
    ];

    const tasks = await runtime.waitForAllTasks(taskIds);
    assert.equal(tasks.length, 2);
    assert.deepEqual(new Set(assignments), new Set(["worker-1", "worker-2"]));
  } finally {
    await runtime.stop();
  }
}

async function main() {
  console.log("=== Distributed Scheduler MVP Test ===\n");

  const tests: Array<{ name: string; run: () => Promise<void> }> = [
    { name: "end-to-end execution", run: testEndToEndExecution },
    { name: "resource-aware scheduling", run: testResourceAwareScheduling },
    { name: "retry then success", run: testRetryThenSuccess },
    { name: "retry exhaustion", run: testExhaustRetries },
    { name: "least-loaded balances parallel tasks", run: testLeastLoadedBalancesParallelTasks },
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
  console.error("Distributed scheduler MVP test failed:", error);
  process.exit(1);
});
