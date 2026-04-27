/**
 * Evidence Cleanup Regression Test
 *
 * Verifies that rollback correctly cleans up evidence files created after
 * the snapshot timestamp, while preserving evidence from stable stages.
 *
 * Test scenario:
 * 1. Run design stage successfully (creates design evidence)
 * 2. Create stable snapshot
 * 3. Run behavior stage that fails (creates behavior evidence)
 * 4. Rollback to stable snapshot
 * 5. Verify behavior evidence is deleted
 * 6. Verify design evidence is preserved
 */

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import yaml from "js-yaml";
import { FailureHandler } from "../failure-handler.js";
import type { FailureHandlingConfig } from "../pipeline-executor.js";

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
  testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-evidence-cleanup-"));

  // Create test structure
  fs.mkdirSync(path.join(testRoot, "contexts", "test", "slices", "test-slice-v1"), { recursive: true });
  fs.mkdirSync(path.join(testRoot, ".jispec", "evidence", "test-slice-v1"), { recursive: true });

  // Create test slice
  const sliceData = {
    id: "test-slice-v1",
    name: "Test Slice",
    lifecycle: {
      state: "design-complete",
      updated_at: new Date().toISOString(),
    },
    gates: {
      requirements_ready: true,
      design_ready: true,
      behavior_ready: false,
    },
  };

  fs.writeFileSync(
    path.join(testRoot, "contexts", "test", "slices", "test-slice-v1", "slice.yaml"),
    yaml.dump(sliceData),
    "utf-8"
  );
}

async function cleanup(): Promise<void> {
  if (testRoot && fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
  testRoot = "";
}

async function testEvidenceCleanupOnRollback(): Promise<TestResult> {
  const testName = "Rollback cleans up evidence files correctly";

  try {
    const failureHandler = new FailureHandler(testRoot, FAILURE_CONFIG);

    const sliceFile = path.join(testRoot, "contexts", "test", "slices", "test-slice-v1", "slice.yaml");
    const sliceContent = fs.readFileSync(sliceFile, "utf-8");
    const sliceState = yaml.load(sliceContent) as any;

    // Step 1: Create stable snapshot after design stage
    await failureHandler.createSnapshot("test-slice-v1", "design", sliceState);

    // Get snapshot timestamp
    const snapshotDir = path.join(testRoot, ".jispec", "snapshots", "test-slice-v1");
    const snapshotFiles = fs.readdirSync(snapshotDir);
    const latestSnapshot = snapshotFiles.sort().reverse()[0];
    const snapshotPath = path.join(snapshotDir, latestSnapshot);
    const snapshotContent = fs.readFileSync(snapshotPath, "utf-8");
    const snapshotData = JSON.parse(snapshotContent);
    const snapshotTimestamp = new Date(snapshotData.timestamp).getTime();

    // Step 2: Create design evidence (before snapshot)
    const designEvidenceTimestamp = snapshotTimestamp - 10000; // 10 seconds before
    const designEvidencePath = path.join(
      testRoot,
      ".jispec",
      "evidence",
      "test-slice-v1",
      `design-${designEvidenceTimestamp}.json`
    );
    fs.writeFileSync(
      designEvidencePath,
      JSON.stringify({ stage: "design", status: "success" }),
      "utf-8"
    );

    // Step 3: Wait a bit to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 100));

    // Step 4: Create behavior evidence (after snapshot)
    const behaviorEvidenceTimestamp = Date.now();
    const behaviorEvidencePath = path.join(
      testRoot,
      ".jispec",
      "evidence",
      "test-slice-v1",
      `behavior-${behaviorEvidenceTimestamp}.json`
    );
    fs.writeFileSync(
      behaviorEvidencePath,
      JSON.stringify({ stage: "behavior", status: "failed" }),
      "utf-8"
    );

    // Verify both evidence files exist before rollback
    if (!fs.existsSync(designEvidencePath)) {
      return {
        name: testName,
        passed: false,
        error: "Design evidence file not created",
      };
    }

    if (!fs.existsSync(behaviorEvidencePath)) {
      return {
        name: testName,
        passed: false,
        error: "Behavior evidence file not created",
      };
    }

    // Step 5: Rollback to stable snapshot
    await failureHandler.rollbackToLatest("test-slice-v1", "behavior");

    // Step 6: Verify behavior evidence is deleted
    if (fs.existsSync(behaviorEvidencePath)) {
      return {
        name: testName,
        passed: false,
        error: "Behavior evidence file was not deleted during rollback",
      };
    }

    // Step 7: Verify design evidence is preserved
    if (!fs.existsSync(designEvidencePath)) {
      return {
        name: testName,
        passed: false,
        error: "Design evidence file was incorrectly deleted during rollback",
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
  }
}

async function testEvidenceCleanupWithMultipleFiles(): Promise<TestResult> {
  const testName = "Rollback handles multiple evidence files correctly";

  try {
    const failureHandler = new FailureHandler(testRoot, FAILURE_CONFIG);

    const sliceFile = path.join(testRoot, "contexts", "test", "slices", "test-slice-v1", "slice.yaml");
    const sliceContent = fs.readFileSync(sliceFile, "utf-8");
    const sliceState = yaml.load(sliceContent) as any;

    // Create stable snapshot
    await failureHandler.createSnapshot("test-slice-v1", "design", sliceState);

    const snapshotDir = path.join(testRoot, ".jispec", "snapshots", "test-slice-v1");
    const snapshotFiles = fs.readdirSync(snapshotDir);
    const latestSnapshot = snapshotFiles.sort().reverse()[0];
    const snapshotPath = path.join(snapshotDir, latestSnapshot);
    const snapshotContent = fs.readFileSync(snapshotPath, "utf-8");
    const snapshotData = JSON.parse(snapshotContent);
    const snapshotTimestamp = new Date(snapshotData.timestamp).getTime();

    // Create multiple evidence files before snapshot
    const stableEvidence = [
      `design-${snapshotTimestamp - 30000}.json`,
      `design-${snapshotTimestamp - 20000}.json`,
      `requirements-${snapshotTimestamp - 10000}.json`,
    ];

    for (const filename of stableEvidence) {
      const evidencePath = path.join(testRoot, ".jispec", "evidence", "test-slice-v1", filename);
      fs.writeFileSync(evidencePath, JSON.stringify({ stable: true }), "utf-8");
    }

    // Wait to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create multiple evidence files after snapshot
    const failedEvidence = [
      `behavior-${Date.now()}.json`,
      `behavior-${Date.now() + 1}.json`,
      `test-${Date.now() + 2}.json`,
    ];

    for (const filename of failedEvidence) {
      const evidencePath = path.join(testRoot, ".jispec", "evidence", "test-slice-v1", filename);
      fs.writeFileSync(evidencePath, JSON.stringify({ failed: true }), "utf-8");
    }

    // Rollback
    await failureHandler.rollbackToLatest("test-slice-v1", "behavior");

    // Verify stable evidence is preserved
    for (const filename of stableEvidence) {
      const evidencePath = path.join(testRoot, ".jispec", "evidence", "test-slice-v1", filename);
      if (!fs.existsSync(evidencePath)) {
        return {
          name: testName,
          passed: false,
          error: `Stable evidence file ${filename} was incorrectly deleted`,
        };
      }
    }

    // Verify failed evidence is deleted
    for (const filename of failedEvidence) {
      const evidencePath = path.join(testRoot, ".jispec", "evidence", "test-slice-v1", filename);
      if (fs.existsSync(evidencePath)) {
        return {
          name: testName,
          passed: false,
          error: `Failed evidence file ${filename} was not deleted`,
        };
      }
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
  }
}

async function runTests(): Promise<void> {
  console.log("=== Evidence Cleanup Regression Test ===\n");

  await setup();

  const results: TestResult[] = [];

  // Run tests
  results.push(await testEvidenceCleanupOnRollback());

  // Clean up and setup again for second test
  await cleanup();
  await setup();

  results.push(await testEvidenceCleanupWithMultipleFiles());

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
