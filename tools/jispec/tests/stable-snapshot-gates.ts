/**
 * Stable Snapshot Gates Preservation Test
 *
 * Verifies that post-commit stable snapshots correctly preserve gate states
 * that were updated during transaction execution.
 *
 * Test scenario:
 * 1. Run a stage that updates gates (e.g., design stage sets design_ready: true)
 * 2. Transaction commits successfully
 * 3. Post-commit stable snapshot is created
 * 4. Verify snapshot contains the updated gate state
 */

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import yaml from "js-yaml";
import type { FailureHandlingConfig } from "../pipeline-executor.js";
import type { StageExecutionResult } from "../stage-execution-result.js";

let testRoot = "";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const FAILURE_CONFIG: FailureHandlingConfig = {
  retry: {
    enabled: false,
    max_attempts: 1,
    backoff: "fixed",
    initial_delay: 0,
    max_delay: 0,
  },
  rollback: {
    enabled: true,
    strategy: "full",
  },
  human_intervention: {
    enabled: false,
    prompt_on_failure: false,
    allow_skip: false,
    allow_manual_fix: false,
  },
};

async function setup(): Promise<void> {
  await cleanup();
  testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-stable-snapshot-gates-"));

  // Create test structure
  fs.mkdirSync(path.join(testRoot, "contexts", "test", "slices", "test-slice-v1"), { recursive: true });
  fs.mkdirSync(path.join(testRoot, "agents"), { recursive: true });

  // Create test slice
  const sliceData = {
    id: "test-slice-v1",
    name: "Test Slice",
    lifecycle: {
      state: "requirements-defined",
      updated_at: new Date().toISOString(),
    },
    gates: {
      requirements_ready: true,
      design_ready: false,
    },
  };

  fs.writeFileSync(
    path.join(testRoot, "contexts", "test", "slices", "test-slice-v1", "slice.yaml"),
    yaml.dump(sliceData),
    "utf-8"
  );

  // Create test pipeline
  const pipelineData = {
    name: "test-pipeline",
    version: "1.0.0",
    stages: [
      {
        id: "design",
        name: "Design",
        agent: "mock-agent",
        lifecycle_state: "design-complete",
        inputs: [],
        outputs: [{ type: "design", path: "design.md" }],
        gates: [{ name: "design_ready", condition: "always" }],
      },
    ],
  };

  fs.writeFileSync(
    path.join(testRoot, "agents", "pipeline.yaml"),
    yaml.dump(pipelineData),
    "utf-8"
  );
}

async function cleanup(): Promise<void> {
  if (testRoot && fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
  testRoot = "";
}

async function testStableSnapshotPreservesGates(): Promise<TestResult> {
  const testName = "Stable snapshot preserves gate states";

  try {
    // Enable transaction mode
    process.env.JISPEC_USE_TRANSACTION_MANAGER = "true";

    // Mock execution result with proper structure
    const mockExecutionResult: StageExecutionResult = {
      success: true,
      writes: [
        {
          path: "contexts/test/slices/test-slice-v1/design.md",
          content: "# Design Document\n\nTest design content",
          encoding: "utf-8",
        },
      ],
      gateUpdates: [
        {
          gate: "design_ready",
          passed: true,
        },
      ],
      traceLinks: [],
      evidence: [],
      writeOperations: [],
    };

    // Manually execute transaction flow
    const { TransactionManager } = await import("../transaction-manager.js");
    const txManager = new TransactionManager(testRoot);

    const sliceFile = path.join(testRoot, "contexts", "test", "slices", "test-slice-v1", "slice.yaml");

    const targetLifecycleState = {
      lifecycle: {
        state: "design-complete",
        updated_at: new Date().toISOString(),
      },
    };

    const tx = await txManager.begin({
      sliceId: "test-slice-v1",
      stageId: "design",
      targetLifecycleState,
    });

    await tx.prepareSnapshot();
    await tx.apply(mockExecutionResult);
    await tx.commit();

    // Read committed slice state
    const committedSliceContent = fs.readFileSync(sliceFile, "utf-8");
    const committedSliceState = yaml.load(committedSliceContent) as any;

    // Create post-commit stable snapshot (simulating stage-runner behavior)
    const { FailureHandler } = await import("../failure-handler.js");
    const failureHandler = new FailureHandler(testRoot, FAILURE_CONFIG);

    await failureHandler.createSnapshot("test-slice-v1", "design", committedSliceState);

    // Verify snapshot exists and contains correct gate state
    const snapshotDir = path.join(testRoot, ".jispec", "snapshots", "test-slice-v1");
    const snapshotFiles = fs.readdirSync(snapshotDir);

    if (snapshotFiles.length === 0) {
      return {
        name: testName,
        passed: false,
        error: "No snapshot files found",
      };
    }

    // Read the latest snapshot
    const latestSnapshot = snapshotFiles.sort().reverse()[0];
    const snapshotPath = path.join(snapshotDir, latestSnapshot);
    const snapshotContent = fs.readFileSync(snapshotPath, "utf-8");
    const snapshotData = JSON.parse(snapshotContent);

    // Verify gate state in snapshot
    if (!snapshotData.sliceState.gates) {
      return {
        name: testName,
        passed: false,
        error: "Snapshot does not contain gates",
      };
    }

    if (snapshotData.sliceState.gates.design_ready !== true) {
      return {
        name: testName,
        passed: false,
        error: `Expected design_ready: true, got: ${snapshotData.sliceState.gates.design_ready}`,
      };
    }

    // Verify lifecycle state in snapshot
    if (snapshotData.sliceState.lifecycle.state !== "design-complete") {
      return {
        name: testName,
        passed: false,
        error: `Expected lifecycle state: design-complete, got: ${snapshotData.sliceState.lifecycle.state}`,
      };
    }

    return {
      name: testName,
      passed: true,
    };
  } catch (error: any) {
    return {
      name: testName,
      passed: false,
      error: error.message,
    };
  } finally {
    delete process.env.JISPEC_USE_TRANSACTION_MANAGER;
  }
}

async function runTests(): Promise<void> {
  console.log("=== Stable Snapshot Gates Preservation Test ===\n");

  await setup();

  const results: TestResult[] = [];

  // Run test
  results.push(await testStableSnapshotPreservesGates());

  await cleanup();

  // Print results
  let passed = 0;
  let failed = 0;

  for (const result of results) {
    if (result.passed) {
      console.log(`✓ ${result.name}`);
      passed++;
    } else {
      console.log(`✗ ${result.name}`);
      console.log(`  Error: ${result.error}`);
      failed++;
    }
  }

  console.log(`\n${passed}/${results.length} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error("Test runner failed:", error);
  process.exit(1);
});
