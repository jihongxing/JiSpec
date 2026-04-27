import { BudgetController, DEFAULT_BUDGET_LIMITS } from "../tools/jispec/implement/budget-controller";
import { runTestCommand, extractErrorMessage, formatTestResult } from "../tools/jispec/implement/test-runner";
import { buildContextBundle, formatContextBundle } from "../tools/jispec/implement/context-pruning";
import { runImplement } from "../tools/jispec/implement/implement-runner";
import path from "node:path";

async function testTaskPack8Phase1() {
  const root = path.resolve(".");

  console.log("=== Testing Task Pack 8 Phase 1: Core FSM ===\n");

  // Test 1: Budget Controller - Basic tracking
  console.log("Test 1: Budget controller basic tracking...");
  try {
    const budget = new BudgetController();
    console.log(`✓ Initial state: ${budget.getState().iterations} iterations`);
    console.log(`  Limits: ${JSON.stringify(budget.getLimits())}`);
    console.log(`  Can continue: ${budget.canContinue()}`);

    budget.recordIteration(1000, 0.05);
    const state = budget.getState();
    console.log(`✓ After 1 iteration: ${state.iterations} iterations, ${state.tokensUsed} tokens, $${state.costUSD}`);
  } catch (error) {
    console.log(`✗ Budget controller test failed: ${error}`);
  }
  console.log("");

  // Test 2: Budget Controller - Iteration limit
  console.log("Test 2: Budget controller iteration limit...");
  try {
    const budget = new BudgetController({ maxIterations: 3 });

    budget.recordIteration(100, 0.01);
    console.log(`  After 1: can continue = ${budget.canContinue()}`);

    budget.recordIteration(100, 0.01);
    console.log(`  After 2: can continue = ${budget.canContinue()}`);

    budget.recordIteration(100, 0.01);
    console.log(`  After 3: can continue = ${budget.canContinue()}`);

    const exceeded = budget.getExceededLimit();
    console.log(`✓ Exceeded limit: ${exceeded}`);
    console.log(`  Expected: iterations`);
    console.log(`  Match: ${exceeded === "iterations" ? "✓" : "✗"}`);
  } catch (error) {
    console.log(`✗ Iteration limit test failed: ${error}`);
  }
  console.log("");

  // Test 3: Budget Controller - Token limit
  console.log("Test 3: Budget controller token limit...");
  try {
    const budget = new BudgetController({ maxTokens: 2500 });

    budget.recordIteration(1000, 0.05);
    budget.recordIteration(1000, 0.05);
    budget.recordIteration(1000, 0.05);

    const exceeded = budget.getExceededLimit();
    console.log(`✓ Exceeded limit: ${exceeded}`);
    console.log(`  Expected: tokens`);
    console.log(`  Match: ${exceeded === "tokens" ? "✓" : "✗"}`);
  } catch (error) {
    console.log(`✗ Token limit test failed: ${error}`);
  }
  console.log("");

  // Test 4: Budget Controller - Cost limit
  console.log("Test 4: Budget controller cost limit...");
  try {
    const budget = new BudgetController({ maxCostUSD: 0.12 });

    budget.recordIteration(1000, 0.05);
    budget.recordIteration(1000, 0.05);
    budget.recordIteration(1000, 0.05);

    const exceeded = budget.getExceededLimit();
    console.log(`✓ Exceeded limit: ${exceeded}`);
    console.log(`  Expected: cost`);
    console.log(`  Match: ${exceeded === "cost" ? "✓" : "✗"}`);
  } catch (error) {
    console.log(`✗ Cost limit test failed: ${error}`);
  }
  console.log("");

  // Test 5: Test Runner - Successful command
  console.log("Test 5: Test runner with successful command...");
  try {
    const result = runTestCommand("echo 'test passed'", { cwd: root });
    console.log(`✓ Test result: passed=${result.passed}, exitCode=${result.exitCode}`);
    console.log(`  Duration: ${result.duration}ms`);
  } catch (error) {
    console.log(`✗ Test runner success test failed: ${error}`);
  }
  console.log("");

  // Test 6: Test Runner - Failed command
  console.log("Test 6: Test runner with failed command...");
  try {
    const result = runTestCommand("exit 1", { cwd: root });
    console.log(`✓ Test result: passed=${result.passed}, exitCode=${result.exitCode}`);

    const errorMsg = extractErrorMessage(result);
    console.log(`  Error message extracted: ${errorMsg ? "yes" : "no"}`);
  } catch (error) {
    console.log(`✗ Test runner failure test failed: ${error}`);
  }
  console.log("");

  // Test 7: Test Runner - Format output
  console.log("Test 7: Test runner format output...");
  try {
    const result = runTestCommand("exit 1", { cwd: root });
    const formatted = formatTestResult(result);
    console.log(`✓ Formatted output:`);
    console.log(formatted.split("\n").map(line => `  ${line}`).join("\n"));
  } catch (error) {
    console.log(`✗ Format output test failed: ${error}`);
  }
  console.log("");

  // Test 8: Context Pruning - Build context bundle
  console.log("Test 8: Context pruning build bundle...");
  try {
    // Create mock session
    const mockSession = {
      id: "test_session",
      createdAt: new Date().toISOString(),
      summary: "Test change",
      laneDecision: { lane: "strict" as const, reasons: [], autoPromoted: false },
      changedPaths: [
        { path: "package.json", kind: "config" as const },
        { path: "README.md", kind: "docs_only" as const },
      ],
      baseRef: "HEAD",
      nextCommands: [{ command: "npm test", description: "Run tests" }],
    };

    const bundle = buildContextBundle(root, mockSession, null);
    console.log(`✓ Context bundle created`);
    console.log(`  Change intent: ${bundle.immutablePack.changeIntent}`);
    console.log(`  Test command: ${bundle.immutablePack.testCommand}`);
    console.log(`  Working set files: ${bundle.workingSet.files.length}`);
    console.log(`  Working set lines: ${bundle.workingSet.totalLines}`);
  } catch (error) {
    console.log(`✗ Context pruning test failed: ${error}`);
  }
  console.log("");

  // Test 9: Context Pruning - With test result
  console.log("Test 9: Context pruning with test result...");
  try {
    const mockSession = {
      id: "test_session",
      createdAt: new Date().toISOString(),
      summary: "Test change",
      laneDecision: { lane: "strict" as const, reasons: [], autoPromoted: false },
      changedPaths: [{ path: "package.json", kind: "config" as const }],
      baseRef: "HEAD",
      nextCommands: [{ command: "npm test", description: "Run tests" }],
    };

    const testResult = runTestCommand("echo 'test failed' && exit 1", { cwd: root });
    const bundle = buildContextBundle(root, mockSession, testResult);

    console.log(`✓ Context bundle with test result`);
    console.log(`  Has test output: ${bundle.failurePack.lastTestOutput ? "yes" : "no"}`);
    console.log(`  Has error message: ${bundle.failurePack.lastErrorMessage ? "yes" : "no"}`);
  } catch (error) {
    console.log(`✗ Context with test result failed: ${error}`);
  }
  console.log("");

  // Test 10: Context Pruning - Format bundle
  console.log("Test 10: Context pruning format bundle...");
  try {
    const mockSession = {
      id: "test_session",
      createdAt: new Date().toISOString(),
      summary: "Add new feature",
      laneDecision: { lane: "strict" as const, reasons: [], autoPromoted: false },
      changedPaths: [{ path: "README.md", kind: "docs_only" as const }],
      baseRef: "HEAD",
      nextCommands: [{ command: "npm test", description: "Run tests" }],
    };

    const bundle = buildContextBundle(root, mockSession, null);
    const formatted = formatContextBundle(bundle);

    console.log(`✓ Formatted bundle (${formatted.length} chars)`);
    console.log(`  Contains change intent: ${formatted.includes("Add new feature") ? "yes" : "no"}`);
    console.log(`  Contains test command: ${formatted.includes("npm test") ? "yes" : "no"}`);
  } catch (error) {
    console.log(`✗ Format bundle test failed: ${error}`);
  }
  console.log("");

  console.log("=== Task Pack 8 Phase 1 Tests Complete ===");
  console.log("\nNote: Implement runner integration test requires active change session.");
  console.log("Run 'npm run jispec-cli -- change \"Test implementation\"' first to test full FSM.");
}

testTaskPack8Phase1().catch(console.error);
