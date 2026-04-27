import { runVerify } from "../tools/jispec/verify/verify-runner";
import { createWaiver } from "../tools/jispec/verify/waiver-store";
import path from "node:path";

async function testTaskPack4() {
  const root = path.resolve(".");

  console.log("=== Testing Task Pack 4: Baseline / Observe / Waiver ===\n");

  // Test 1: Basic verify
  console.log("Test 1: Running basic verify...");
  try {
    const result1 = await runVerify({ root });
    console.log(`✓ Basic verify completed: ${result1.verdict}`);
    console.log(`  Issues: ${result1.issueCount}`);
  } catch (error) {
    console.log(`✗ Basic verify failed: ${error}`);
  }

  // Test 2: Write baseline
  console.log("\nTest 2: Writing baseline...");
  try {
    const result2 = await runVerify({ root, writeBaseline: true });
    console.log(`✓ Baseline written: ${result2.issueCount} issues captured`);
  } catch (error) {
    console.log(`✗ Write baseline failed: ${error}`);
  }

  // Test 3: Apply baseline
  console.log("\nTest 3: Applying baseline...");
  try {
    const result3 = await runVerify({ root, useBaseline: true });
    console.log(`✓ Baseline applied: ${result3.verdict}`);
    if (result3.metadata?.baselineApplied) {
      console.log(`  Baseline was applied successfully`);
    }
  } catch (error) {
    console.log(`✗ Apply baseline failed: ${error}`);
  }

  // Test 4: Observe mode
  console.log("\nTest 4: Running in observe mode...");
  try {
    const result4 = await runVerify({ root, observe: true });
    console.log(`✓ Observe mode completed: ${result4.verdict}`);
    if (result4.metadata?.observeMode) {
      console.log(`  Observe mode was applied`);
      console.log(`  Original verdict: ${result4.metadata.originalVerdict}`);
    }
  } catch (error) {
    console.log(`✗ Observe mode failed: ${error}`);
  }

  // Test 5: Create waiver
  console.log("\nTest 5: Creating waiver...");
  try {
    const waiverResult = createWaiver(root, {
      code: "MISSING_FILE",
      owner: "test-user",
      reason: "Test waiver for Task Pack 4",
      expiresAt: "2026-12-31T23:59:59.000Z",
    });
    console.log(`✓ Waiver created: ${waiverResult.waiver.id}`);
    console.log(`  File: ${waiverResult.filePath}`);
  } catch (error) {
    console.log(`✗ Create waiver failed: ${error}`);
  }

  // Test 6: Apply waivers
  console.log("\nTest 6: Running verify with waivers...");
  try {
    const result6 = await runVerify({ root, applyWaivers: true });
    console.log(`✓ Verify with waivers completed: ${result6.verdict}`);
    if (result6.metadata?.waiversApplied) {
      console.log(`  Waivers applied: ${result6.metadata.waiversApplied}`);
    }
  } catch (error) {
    console.log(`✗ Verify with waivers failed: ${error}`);
  }

  // Test 7: Combined (baseline + observe)
  console.log("\nTest 7: Running with baseline + observe...");
  try {
    const result7 = await runVerify({ root, useBaseline: true, observe: true });
    console.log(`✓ Combined mode completed: ${result7.verdict}`);
    console.log(`  Baseline applied: ${!!result7.metadata?.baselineApplied}`);
    console.log(`  Observe mode: ${!!result7.metadata?.observeMode}`);
  } catch (error) {
    console.log(`✗ Combined mode failed: ${error}`);
  }

  console.log("\n=== Task Pack 4 Tests Complete ===");
}

testTaskPack4().catch(console.error);
