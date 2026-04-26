/**
 * Rollback Regression Test
 *
 * Tests real failure-triggered rollback chain: StageRunner → FailureHandler → rollback from snapshot.
 * Verifies that when a stage fails, the system correctly restores previous state from snapshots.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { StageRunner } from "../stage-runner.js";

async function testRealRollbackChain() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-rollback-"));

  try {
    // Create complete fixture matching cache-integration-e2e structure
    const jiprojectDir = path.join(tmpDir, "jiproject");
    fs.mkdirSync(jiprojectDir, { recursive: true });

    fs.writeFileSync(
      path.join(jiprojectDir, "project.yaml"),
      `id: test-project
name: Test Project
version: 0.1.0
delivery_model: bounded-context-slice
ai:
  provider: mock
  model: test-model
`
    );

    const sliceDir = path.join(tmpDir, "contexts", "test", "slices", "test-slice-v1");
    fs.mkdirSync(sliceDir, { recursive: true });

    fs.writeFileSync(
      path.join(sliceDir, "slice.yaml"),
      `id: test-slice-v1
context_id: test
service_id: test-service
lifecycle:
  state: proposed
gates: {}
`
    );

    fs.writeFileSync(path.join(sliceDir, "requirements.md"), "# Requirements\nTest requirements", "utf-8");

    const agentsDir = path.join(tmpDir, "agents");
    fs.mkdirSync(agentsDir, { recursive: true });

    fs.writeFileSync(
      path.join(agentsDir, "agents.yaml"),
      `agents:
  - id: domain-agent
    role: Domain expert
    inputs: []
    outputs: []
`
    );

    // Initialize real components
    const runner = StageRunner.create(tmpDir);

    // Step 1: Run design stage successfully
    await runner.run({
      sliceId: "test-slice-v1",
      stageConfig: {
        id: "design",
        name: "Design",
        agent: "domain" as const,
        lifecycle_state: "design-defined",
        inputs: { files: ["{slice}/requirements.md"], allowRead: true, allowWrite: false },
        outputs: { files: ["{slice}/design.md"], schemas: [], traceRequired: false },
        gates: { required: [], optional: [], autoUpdate: false },
      },
      skipValidation: true,
      failureConfig: {
        retry: { enabled: false, max_attempts: 1, backoff: "fixed", initial_delay: 0, max_delay: 0 },
        rollback: { enabled: true, strategy: "full" },
        human_intervention: { enabled: false, prompt_on_failure: false, allow_skip: false, allow_manual_fix: false },
      },
    });

    // Verify snapshot was created
    const snapshotDir = path.join(tmpDir, ".jispec", "snapshots", "test-slice-v1");
    const snapshots = fs.existsSync(snapshotDir) ? fs.readdirSync(snapshotDir) : [];
    if (snapshots.length === 0) {
      throw new Error("No snapshot created after design stage");
    }

    // Verify lifecycle advanced
    const sliceAfterDesign = yaml.load(fs.readFileSync(path.join(sliceDir, "slice.yaml"), "utf-8")) as any;
    if (sliceAfterDesign.lifecycle.state !== "design-defined") {
      throw new Error(`Expected design-defined, got ${sliceAfterDesign.lifecycle.state}`);
    }

    // Verify design.md was created
    if (!fs.existsSync(path.join(sliceDir, "design.md"))) {
      throw new Error("design.md was not created");
    }

    console.log("✓ Test 1: Design stage succeeds and creates snapshot");

    // Step 2: Inject failure for behavior stage
    process.env.JISPEC_TEST_FAIL_AFTER_LIFECYCLE = "behavior";

    let behaviorFailed = false;
    try {
      const result = await runner.run({
        sliceId: "test-slice-v1",
        stageConfig: {
          id: "behavior",
          name: "Behavior",
          agent: "domain" as const,
          lifecycle_state: "behavior-defined",
          inputs: { files: ["{slice}/design.md"], allowRead: true, allowWrite: false },
          outputs: { files: ["{slice}/behavior.md"], schemas: [], traceRequired: false },
          gates: { required: [], optional: [], autoUpdate: false },
        },
        skipValidation: true,
        failureConfig: {
          retry: { enabled: false, max_attempts: 1, backoff: "fixed", initial_delay: 0, max_delay: 0 },
          rollback: { enabled: true, strategy: "full" },
          human_intervention: { enabled: false, prompt_on_failure: false, allow_skip: false, allow_manual_fix: false },
        },
      });

      // Check if result indicates failure
      if (!result.success) {
        behaviorFailed = true;
      }
    } catch (error: any) {
      behaviorFailed = true;
    }

    if (!behaviorFailed) {
      throw new Error("Behavior stage should have failed but didn't");
    }

    console.log("✓ Test 2: Behavior stage fails as expected");

    // Step 3: Verify rollback occurred
    const sliceAfterRollback = yaml.load(fs.readFileSync(path.join(sliceDir, "slice.yaml"), "utf-8")) as any;
    if (sliceAfterRollback.lifecycle.state !== "design-defined") {
      throw new Error(`Rollback failed: expected design-defined, got ${sliceAfterRollback.lifecycle.state}`);
    }

    console.log("✓ Test 3: Lifecycle rolled back to design-defined");

    // Step 4: Verify previous stage files are preserved
    if (!fs.existsSync(path.join(sliceDir, "design.md"))) {
      throw new Error("design.md was lost after rollback");
    }

    console.log("✓ Test 4: Previous stage files preserved after rollback");

    // Step 5: Verify behavior.md was not created
    if (fs.existsSync(path.join(sliceDir, "behavior.md"))) {
      throw new Error("behavior.md should not exist after rollback");
    }

    console.log("✓ Test 5: Failed stage artifacts cleaned up");

    // Cleanup
    delete process.env.JISPEC_TEST_FAIL_AFTER_LIFECYCLE;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return true;
  } catch (error) {
    delete process.env.JISPEC_TEST_FAIL_AFTER_LIFECYCLE;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  console.log("=== Rollback Regression Test ===\n");

  let passed = 0;
  let failed = 0;

  try {
    await testRealRollbackChain();
    passed += 5; // This test has 5 internal assertions
  } catch (error: any) {
    console.error("✗ Rollback chain test failed:", error.message);
    failed += 5;
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error("Test suite failed:", error);
  process.exit(1);
});
