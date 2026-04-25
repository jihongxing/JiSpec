import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { PipelineExecutor } from "../pipeline-executor";

/**
 * Rollback Regression Test
 *
 * Verifies that rollback transaction persistence works correctly:
 * 1. Reset slice to a stable state
 * 2. Run a stage that succeeds (creates snapshot)
 * 3. Inject failure into next stage
 * 4. Verify rollback restores previous state
 * 5. Verify new files are deleted
 * 6. Verify old files are preserved
 * 7. Verify trace.yaml consistency
 * 8. Verify pipeline can re-run without errors
 */

interface TestResult {
  passed: boolean;
  message: string;
  details?: string;
}

class RollbackRegressionTest {
  private root: string;
  private sliceId: string = "ordering-payment-v1";
  private contextId: string = "ordering";
  private originalUpdatedAt: string = "";

  constructor(root: string) {
    this.root = root;
  }

  /**
   * Run the full regression test
   */
  async run(): Promise<void> {
    console.log("\n=== Rollback Regression Test ===\n");

    const results: TestResult[] = [];

    try {
      // Capture original timestamp before any modifications
      const sliceFile = this.getSliceFile();
      const sliceContent = fs.readFileSync(sliceFile, "utf-8");
      const sliceData = yaml.load(sliceContent) as any;
      this.originalUpdatedAt = sliceData.lifecycle.updated_at;

      // Step 1: Reset slice to requirements-defined state
      console.log("[Step 1] Resetting slice to requirements-defined state...");
      await this.resetSliceState();
      results.push({ passed: true, message: "Slice reset to requirements-defined" });

      // Step 2: Remove any existing failure injection first
      console.log("\n[Step 2] Ensuring no failure injection...");
      await this.removeFailureInjection();
      results.push({ passed: true, message: "Failure injection removed" });

      // Step 3: Run design stage (should succeed and create snapshot)
      console.log("\n[Step 3] Running design stage (should succeed)...");
      const designResult = await this.runStage("design");
      if (!designResult.success) {
        throw new Error(`Design stage failed: ${designResult.error}`);
      }
      results.push({ passed: true, message: "Design stage completed successfully" });

      // Step 4: Verify snapshot was created
      console.log("\n[Step 4] Verifying snapshot was created...");
      const snapshotExists = this.verifySnapshotExists("design");
      if (!snapshotExists) {
        throw new Error("Snapshot was not created after design stage");
      }
      results.push({ passed: true, message: "Snapshot created for design stage" });

      // Step 5: Capture state before behavior stage
      console.log("\n[Step 5] Capturing state before behavior stage...");
      const stateBefore = await this.captureSliceState();
      const filesBefore = this.captureSliceFiles();
      results.push({ passed: true, message: `Captured state: ${stateBefore.state}, ${filesBefore.length} files` });

      // Step 6: Run behavior stage successfully first (to create files)
      console.log("\n[Step 6] Running behavior stage (should succeed)...");
      const behaviorResult = await this.runStage("behavior");
      if (!behaviorResult.success) {
        throw new Error(`Behavior stage failed: ${behaviorResult.error}`);
      }
      results.push({ passed: true, message: "Behavior stage completed successfully" });

      // Step 7: Verify files were created
      console.log("\n[Step 7] Verifying files were created...");
      const filesAfterBehavior = this.captureSliceFiles();
      const newFiles = filesAfterBehavior.filter(f => !filesBefore.includes(f));
      if (newFiles.length === 0) {
        throw new Error("No new files were created by behavior stage");
      }
      results.push({ passed: true, message: `New files created: ${newFiles.join(", ")}` });

      // Step 8: Inject failure and run test stage (should fail and auto-rollback)
      console.log("\n[Step 8] Injecting failure and running test stage (should fail and auto-rollback)...");
      await this.injectStageFailure("test");
      const testResult = await this.runStage("test");
      if (testResult.success) {
        throw new Error("Test stage should have failed but succeeded");
      }
      results.push({ passed: true, message: "Test stage failed as expected, auto-rollback triggered" });

      // Step 9: Verify rollback restored previous state
      console.log("\n[Step 9] Verifying rollback restored previous state...");
      const stateAfter = await this.captureSliceState();
      if (stateAfter.state !== "design-defined") {
        throw new Error(`State not restored: expected design-defined, got ${stateAfter.state}`);
      }
      results.push({ passed: true, message: `State restored to ${stateAfter.state}` });

      // Step 10: Verify new files were deleted
      console.log("\n[Step 10] Verifying new files were deleted...");
      const filesAfter = this.captureSliceFiles();
      const remainingNewFiles = filesAfter.filter(f => !filesBefore.includes(f));
      if (remainingNewFiles.length > 0) {
        throw new Error(`New files not deleted: ${remainingNewFiles.join(", ")}`);
      }
      results.push({ passed: true, message: "New files deleted successfully" });

      // Step 11: Verify old files were preserved
      console.log("\n[Step 11] Verifying old files were preserved...");
      const missingFiles = filesBefore.filter(f => !filesAfter.includes(f));
      if (missingFiles.length > 0) {
        throw new Error(`Old files missing: ${missingFiles.join(", ")}`);
      }
      results.push({ passed: true, message: "Old files preserved successfully" });

      // Step 12: Verify trace.yaml consistency
      console.log("\n[Step 12] Verifying trace.yaml consistency...");
      const traceConsistent = await this.verifyTraceConsistency();
      if (!traceConsistent) {
        throw new Error("trace.yaml is inconsistent after rollback");
      }
      results.push({ passed: true, message: "trace.yaml is consistent" });

      // Step 13: Remove failure injection and verify pipeline can re-run without errors
      console.log("\n[Step 13] Removing failure injection and verifying pipeline can re-run...");
      await this.removeFailureInjection();
      const rerunResult = await this.runStage("behavior");
      if (!rerunResult.success) {
        throw new Error(`Pipeline re-run failed: ${rerunResult.error}`);
      }
      results.push({ passed: true, message: "Pipeline re-run succeeded" });

      // Step 14: Teardown - reset slice to clean state
      console.log("\n[Step 14] Cleaning up test artifacts...");
      await this.resetSliceState();
      results.push({ passed: true, message: "Test artifacts cleaned up" });

      // Print summary
      this.printSummary(results);

    } catch (error) {
      results.push({
        passed: false,
        message: error instanceof Error ? error.message : String(error),
      });
      this.printSummary(results);

      // Teardown even on failure
      console.log("\n[Teardown] Cleaning up after test failure...");
      try {
        await this.resetSliceState();
        console.log("[Teardown] ✓ Cleanup completed");
      } catch (cleanupError) {
        console.error("[Teardown] ✗ Cleanup failed:", cleanupError);
      }

      process.exit(1);
    }
  }

  /**
   * Reset slice to requirements-defined state
   */
  private async resetSliceState(): Promise<void> {
    const sliceFile = this.getSliceFile();
    const content = fs.readFileSync(sliceFile, "utf-8");
    const slice = yaml.load(content) as any;

    // Reset lifecycle state (use captured original timestamp if available)
    slice.lifecycle.state = "requirements-defined";
    slice.lifecycle.updated_at = this.originalUpdatedAt || slice.lifecycle.updated_at;

    // Reset gates
    slice.gates = {
      requirements_ready: true,
      design_ready: false,
      behavior_ready: false,
      test_ready: false,
      implementation_ready: false,
      verification_ready: false,
      accepted: false,
    };

    // Save
    fs.writeFileSync(sliceFile, yaml.dump(slice), "utf-8");

    // Clean up stage files
    const sliceDir = path.dirname(sliceFile);
    const filesToRemove = ["design.md", "behaviors.feature", "test-spec.yaml", "trace.yaml", "evidence.md", "src"];
    for (const file of filesToRemove) {
      const filePath = path.join(sliceDir, file);
      if (fs.existsSync(filePath)) {
        if (fs.statSync(filePath).isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(filePath);
        }
      }
    }

    // Clean up snapshots
    const snapshotDir = path.join(this.root, ".jispec", "snapshots", this.sliceId);
    if (fs.existsSync(snapshotDir)) {
      fs.rmSync(snapshotDir, { recursive: true, force: true });
    }

    console.log(`[Reset] Slice reset to requirements-defined state`);
  }

  /**
   * Run a specific stage
   */
  private async runStage(stageId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const executor = PipelineExecutor.create(this.root);
      const result = await executor.run(this.sliceId, { from: stageId, to: stageId });
      return { success: result.success, error: result.error };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Verify snapshot exists for a stage
   */
  private verifySnapshotExists(stageId: string): boolean {
    const snapshotDir = path.join(this.root, ".jispec", "snapshots", this.sliceId);
    if (!fs.existsSync(snapshotDir)) {
      return false;
    }

    const files = fs.readdirSync(snapshotDir);
    return files.some(f => f.startsWith(`${stageId}-`));
  }

  /**
   * Capture current slice state
   */
  private async captureSliceState(): Promise<{ state: string; gates: any }> {
    const sliceFile = this.getSliceFile();
    const content = fs.readFileSync(sliceFile, "utf-8");
    const slice = yaml.load(content) as any;

    return {
      state: slice.lifecycle.state,
      gates: slice.gates,
    };
  }

  /**
   * Capture current slice files
   */
  private captureSliceFiles(): string[] {
    const sliceDir = path.dirname(this.getSliceFile());
    const files: string[] = [];

    const walkDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile()) {
          files.push(path.relative(sliceDir, fullPath));
        } else if (entry.isDirectory()) {
          walkDir(fullPath);
        }
      }
    };

    walkDir(sliceDir);
    return files.sort();
  }

  /**
   * Inject failure into a specific stage
   * Uses environment variable to trigger failure in stage-runner.ts
   */
  private async injectStageFailure(stageId: string): Promise<void> {
    process.env.JISPEC_TEST_FAIL_AFTER_LIFECYCLE = stageId;
    console.log(`[Inject] Failure injection set for stage: ${stageId}`);
  }

  /**
   * Remove failure injection
   */
  private async removeFailureInjection(): Promise<void> {
    delete process.env.JISPEC_TEST_FAIL_AFTER_LIFECYCLE;
    console.log(`[Inject] Failure injection removed`);
  }

  /**
   * Verify trace.yaml consistency
   */
  private async verifyTraceConsistency(): Promise<boolean> {
    const sliceDir = path.dirname(this.getSliceFile());
    const traceFile = path.join(sliceDir, "trace.yaml");

    if (!fs.existsSync(traceFile)) {
      // No trace file is OK if we're in early stages
      return true;
    }

    try {
      const content = fs.readFileSync(traceFile, "utf-8");
      const trace = yaml.load(content) as any;

      // Verify trace structure (uses 'links' not 'traces')
      if (!trace.links || !Array.isArray(trace.links)) {
        console.error(`[Trace] Invalid structure: expected 'links' array`);
        return false;
      }

      // Verify all referenced files exist
      for (const link of trace.links) {
        // Basic structure check
        if (!link.from || !link.to || !link.relation) {
          console.error(`[Trace] Invalid link structure: ${JSON.stringify(link)}`);
          return false;
        }

        // Check if referenced artifacts exist
        // Scenarios should reference behaviors.feature
        if (link.from.type === 'scenario' || link.to.type === 'scenario') {
          const behaviorsFile = path.join(sliceDir, 'behaviors.feature');
          if (!fs.existsSync(behaviorsFile)) {
            console.error(`[Trace] Scenario reference found but behaviors.feature doesn't exist`);
            return false;
          }
        }

        // Tests should reference test-spec.yaml
        if (link.from.type === 'test' || link.to.type === 'test') {
          const testFile = path.join(sliceDir, 'test-spec.yaml');
          if (!fs.existsSync(testFile)) {
            console.error(`[Trace] Test reference found but test-spec.yaml doesn't exist`);
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      console.error(`[Trace] Error verifying trace.yaml: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Get slice file path
   */
  private getSliceFile(): string {
    return path.join(
      this.root,
      "contexts",
      this.contextId,
      "slices",
      this.sliceId,
      "slice.yaml"
    );
  }

  /**
   * Print test summary
   */
  private printSummary(results: TestResult[]): void {
    console.log("\n=== Test Summary ===\n");

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    for (const result of results) {
      const status = result.passed ? "✓" : "✗";
      console.log(`${status} ${result.message}`);
      if (result.details) {
        console.log(`  ${result.details}`);
      }
    }

    console.log(`\nTotal: ${results.length} tests`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed === 0) {
      console.log("\n✓ All tests passed!\n");
    } else {
      console.log("\n✗ Some tests failed!\n");
    }
  }
}

// Run the test
const root = process.cwd();
const test = new RollbackRegressionTest(root);
test.run().catch(error => {
  console.error(`\n✗ Test failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
