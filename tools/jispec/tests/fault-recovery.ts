import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DistributedTask } from "../distributed-scheduler";
import { FaultRecoveryManager } from "../fault-recovery";
import { LocalDistributedRuntime } from "../distributed-runtime";
import { RemoteDistributedRuntime } from "../remote-runtime";

const DEFAULT_REQUIREMENTS = {
  cpu: 1,
  memory: 128,
  disk: 64,
  timeout: 1000,
};

function createMockTask(overrides: Partial<DistributedTask> = {}): DistributedTask {
  return {
    id: overrides.id ?? "task-1",
    sliceId: overrides.sliceId ?? "slice-a",
    stageId: overrides.stageId ?? "design",
    priority: overrides.priority ?? "normal",
    status: overrides.status ?? "pending",
    payload: overrides.payload ?? { kind: "test" },
    resourceRequirements: overrides.resourceRequirements ?? { ...DEFAULT_REQUIREMENTS },
    retryCount: overrides.retryCount ?? 0,
    maxRetries: overrides.maxRetries ?? 3,
    createdAt: overrides.createdAt ?? new Date(),
    workerId: overrides.workerId,
    assignedAt: overrides.assignedAt,
    startedAt: overrides.startedAt,
    completedAt: overrides.completedAt,
    result: overrides.result,
    error: overrides.error,
  };
}

async function testCheckpointRecoveryRestoresSavedState(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-fault-recovery-"));

  try {
    const manager = new FaultRecoveryManager(root);
    const task = createMockTask({ id: "checkpoint-task" });

    manager.createCheckpoint(task.id, { step: "after-design", gates: { design_ready: true } });
    const failure = manager.recordFailure({
      task,
      type: "task_timeout",
      error: new Error("Task timeout"),
    });

    const action = await manager.recoverTask(task, failure);

    assert.equal(action.strategy, "checkpoint");
    assert.deepEqual(action.checkpointState, { step: "after-design", gates: { design_ready: true } });
    assert.equal(task.status, "pending");
    assert.equal(task.workerId, undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testDegradedRetryShrinksResourceRequirements(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-fault-recovery-"));

  try {
    const manager = new FaultRecoveryManager(root, { degradedRetryFactor: 0.5 });
    const task = createMockTask({
      id: "degrade-task",
      resourceRequirements: {
        cpu: 4,
        memory: 512,
        disk: 256,
        timeout: 1000,
      },
    });

    const failure = manager.recordFailure({
      task,
      type: "resource_exhausted",
      error: new Error("Insufficient resources"),
    });

    const action = await manager.recoverTask(task, failure);

    assert.equal(action.strategy, "degrade");
    assert.deepEqual(task.resourceRequirements, {
      cpu: 2,
      memory: 256,
      disk: 128,
      timeout: 1000,
    });
    assert.deepEqual(action.nextRequirements, task.resourceRequirements);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testLocalRuntimeRecoversAfterWorkerFailure(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-fault-local-"));
  let flakyAttempts = 0;

  try {
    const runtime = new LocalDistributedRuntime({
      root,
      enableCache: false,
      enableResourceManagement: true,
      enableFaultRecovery: true,
    });
    await runtime.start();

    await runtime.addWorker(
      {
        id: "flaky-worker",
        masterHost: "localhost",
        masterPort: 0,
        capabilities: { maxCpu: 2, maxMemory: 512, maxDisk: 256 },
      },
      async () => {
        flakyAttempts += 1;
        throw new Error("worker offline");
      }
    );

    await runtime.addWorker(
      {
        id: "healthy-worker",
        masterHost: "localhost",
        masterPort: 0,
        capabilities: { maxCpu: 2, maxMemory: 512, maxDisk: 256 },
      },
      async () => ({ workerId: "healthy-worker" })
    );

    const task = await runtime.runTask({
      sliceId: "slice-recover",
      stageId: "behavior",
      payload: { mode: "migrate" },
      requirements: DEFAULT_REQUIREMENTS,
      maxRetries: 3,
    });

    assert.equal(task.status, "completed");
    assert.equal(task.workerId, "healthy-worker");
    assert.ok(flakyAttempts >= 1);

    const failures = runtime.getFaultRecoveryManager().getFailureHistory(task.id);
    assert.ok(failures.length >= 1);
    assert.equal(failures[0]?.strategy, "migrate");

    await runtime.stop();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function testRemoteRuntimeRetriesAfterInitialExecutionFailure(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-fault-remote-"));
  let attempts = 0;

  try {
    const runtime = new RemoteDistributedRuntime({
      root,
      enableCache: false,
      enableResourceManagement: true,
      enableFaultRecovery: true,
    });
    await runtime.start();

    await runtime.addRemoteWorker(
      {
        id: "remote-worker-recover",
        masterHost: "127.0.0.1",
        masterPort: 0,
        capabilities: { maxCpu: 2, maxMemory: 512, maxDisk: 256 },
      },
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("Task timeout");
        }
        return { attempts };
      }
    );

    const task = await runtime.runTask({
      sliceId: "remote-slice-recover",
      stageId: "test",
      payload: { mode: "retry" },
      requirements: DEFAULT_REQUIREMENTS,
      maxRetries: 3,
    });

    assert.equal(task.status, "completed");
    assert.deepEqual(task.result, { attempts: 2 });

    const failures = runtime.getFaultRecoveryManager().getFailureHistory(task.id);
    assert.ok(failures.length >= 1);
    assert.equal(failures[0]?.strategy, "checkpoint");

    await runtime.stop();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  console.log("=== Fault Recovery Test ===\n");

  const tests: Array<{ name: string; run: () => Promise<void> }> = [
    { name: "checkpoint recovery restores saved state", run: testCheckpointRecoveryRestoresSavedState },
    { name: "degraded retry shrinks resource requirements", run: testDegradedRetryShrinksResourceRequirements },
    { name: "local runtime recovers after worker failure", run: testLocalRuntimeRecoversAfterWorkerFailure },
    { name: "remote runtime retries after initial execution failure", run: testRemoteRuntimeRetriesAfterInitialExecutionFailure },
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
  console.error("Fault recovery test failed:", error);
  process.exit(1);
});
