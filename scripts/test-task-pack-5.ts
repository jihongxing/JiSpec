import { runVerify } from "../tools/jispec/verify/verify-runner";
import path from "node:path";

async function testTaskPack5() {
  const root = path.resolve(".");

  console.log("=== Testing Task Pack 5: Facts Contract & Policy DSL ===\n");

  // Test 1: Basic verify without policy
  console.log("Test 1: Running basic verify without policy...");
  try {
    const result1 = await runVerify({ root });
    console.log(`✓ Basic verify completed: ${result1.verdict}`);
    console.log(`  Issues: ${result1.issueCount}`);
  } catch (error) {
    console.log(`✗ Basic verify failed: ${error}`);
  }

  // Test 2: Verify with facts output
  console.log("\nTest 2: Running verify with facts output...");
  try {
    const result2 = await runVerify({
      root,
      factsOutPath: ".spec/facts/test-canonical.json",
    });
    console.log(`✓ Verify with facts output completed: ${result2.verdict}`);
    console.log(`  Facts written to .spec/facts/test-canonical.json`);
  } catch (error) {
    console.log(`✗ Verify with facts output failed: ${error}`);
  }

  // Test 3: Verify with policy
  console.log("\nTest 3: Running verify with policy...");
  try {
    const result3 = await runVerify({
      root,
      policyPath: ".spec/policy.yaml",
    });
    console.log(`✓ Verify with policy completed: ${result3.verdict}`);
    console.log(`  Issues: ${result3.issueCount}`);
    console.log(`  Sources: ${result3.sources.join(", ")}`);
  } catch (error) {
    console.log(`✗ Verify with policy failed: ${error}`);
  }

  // Test 4: Verify with policy and facts output
  console.log("\nTest 4: Running verify with policy and facts output...");
  try {
    const result4 = await runVerify({
      root,
      policyPath: ".spec/policy.yaml",
      factsOutPath: ".spec/facts/latest-canonical.json",
    });
    console.log(`✓ Verify with policy and facts completed: ${result4.verdict}`);
    console.log(`  Issues: ${result4.issueCount}`);
    console.log(`  Policy-generated issues: ${result4.issues.filter(i => i.code.startsWith("POLICY_")).length}`);
  } catch (error) {
    console.log(`✗ Verify with policy and facts failed: ${error}`);
  }

  // Test 5: Combined with baseline and policy
  console.log("\nTest 5: Running verify with baseline and policy...");
  try {
    const result5 = await runVerify({
      root,
      useBaseline: true,
      policyPath: ".spec/policy.yaml",
    });
    console.log(`✓ Combined baseline + policy completed: ${result5.verdict}`);
    console.log(`  Baseline applied: ${!!result5.metadata?.baselineApplied}`);
    console.log(`  Policy sources: ${result5.sources.includes("policy-engine")}`);
  } catch (error) {
    console.log(`✗ Combined baseline + policy failed: ${error}`);
  }

  // Test 6: Full stack (policy + baseline + observe)
  console.log("\nTest 6: Running full stack (policy + baseline + observe)...");
  try {
    const result6 = await runVerify({
      root,
      policyPath: ".spec/policy.yaml",
      useBaseline: true,
      observe: true,
    });
    console.log(`✓ Full stack completed: ${result6.verdict}`);
    console.log(`  Baseline applied: ${!!result6.metadata?.baselineApplied}`);
    console.log(`  Observe mode: ${!!result6.metadata?.observeMode}`);
    console.log(`  Policy engine: ${result6.sources.includes("policy-engine")}`);
  } catch (error) {
    console.log(`✗ Full stack failed: ${error}`);
  }

  console.log("\n=== Task Pack 5 Tests Complete ===");
}

testTaskPack5().catch(console.error);
