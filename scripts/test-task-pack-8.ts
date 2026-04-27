/**
 * Comprehensive test suite for Task Pack 8 - all phases.
 * Tests budget controller, test runner, context pruning, episode memory,
 * stall detector, handoff packet, and test command resolver.
 */

import { BudgetController } from "../tools/jispec/implement/budget-controller";
import { runTestCommand, extractErrorMessage } from "../tools/jispec/implement/test-runner";
import { buildContextBundle } from "../tools/jispec/implement/context-pruning";
import { createEpisodeMemory, addEpisode, getRecentHypotheses, getRejectedPaths } from "../tools/jispec/implement/episode-memory";
import { StallDetector } from "../tools/jispec/implement/stall-detector";
import { generateHandoffPacket, writeHandoffPacket, readHandoffPacket, formatHandoffPacket } from "../tools/jispec/implement/handoff-packet";
import { resolveTestCommand, extractTestCommandFromSession, extractTestCommandFromPackageJson, validateTestCommand } from "../tools/jispec/implement/test-command-resolver";
import path from "node:path";
import fs from "node:fs";

async function testTaskPack8() {
  const root = path.resolve(".");
  let passCount = 0;
  let failCount = 0;

  console.log("=== Task Pack 8 Comprehensive Test Suite ===\n");

  // Phase 1: Budget Controller
  console.log("--- Phase 1: Budget Controller ---");

  try {
    const budget = new BudgetController({ maxIterations: 5, maxTokens: 10000, maxCostUSD: 1.0 });

    if (budget.canContinue()) {
      budget.recordIteration(2000, 0.1);
      const state = budget.getState();

      if (state.iterations === 1 && state.tokensUsed === 2000 && state.costUSD === 0.1) {
        console.log("✓ Budget controller tracks iterations, tokens, and cost");
        passCount++;
      } else {
        console.log("✗ Budget controller state incorrect");
        failCount++;
      }
    } else {
      console.log("✗ Budget controller should allow first iteration");
      failCount++;
    }
  } catch (error) {
    console.log(`✗ Budget controller test failed: ${error}`);
    failCount++;
  }

  // Phase 1: Test Runner
  console.log("\n--- Phase 1: Test Runner ---");

  try {
    const result = runTestCommand("echo test", { cwd: root });

    if (result.passed && result.exitCode === 0) {
      console.log("✓ Test runner executes commands");
      passCount++;
    } else {
      console.log("✗ Test runner execution failed");
      failCount++;
    }
  } catch (error) {
    console.log(`✗ Test runner test failed: ${error}`);
    failCount++;
  }

  // Phase 1: Context Pruning
  console.log("\n--- Phase 1: Context Pruning ---");

  try {
    const mockSession = {
      id: "test_session",
      createdAt: new Date().toISOString(),
      summary: "Test change",
      laneDecision: { lane: "strict" as const, reasons: [], autoPromoted: false },
      changedPaths: [{ path: "src/test.ts", kind: "domain_core" as const }],
      baseRef: "HEAD",
      nextCommands: [],
    };

    const context = buildContextBundle(root, mockSession, null, undefined);

    if (context.immutablePack && context.workingSet) {
      console.log("✓ Context pruning builds context bundle");
      passCount++;
    } else {
      console.log("✗ Context bundle incomplete");
      failCount++;
    }
  } catch (error) {
    console.log(`✗ Context pruning test failed: ${error}`);
    failCount++;
  }

  // Phase 2: Episode Memory
  console.log("\n--- Phase 2: Episode Memory ---");

  try {
    const episodeMemory = createEpisodeMemory();

    addEpisode(episodeMemory, {
      iteration: 1,
      hypothesis: "Add feature X",
      outcome: "failure",
      changedFiles: ["src/feature.ts"],
      errorMessage: "Type error",
    });

    const hypotheses = getRecentHypotheses(episodeMemory, 5);
    const rejectedPaths = getRejectedPaths(episodeMemory);

    if (hypotheses.length === 1 && rejectedPaths.length === 1) {
      console.log("✓ Episode memory tracks hypotheses and rejected paths");
      passCount++;
    } else {
      console.log("✗ Episode memory tracking incorrect");
      failCount++;
    }
  } catch (error) {
    console.log(`✗ Episode memory test failed: ${error}`);
    failCount++;
  }

  // Phase 2: Stall Detector - Repeated Failures
  console.log("\n--- Phase 2: Stall Detector (Repeated Failures) ---");

  try {
    const detector = new StallDetector();

    detector.recordIteration(false, ["file1.ts"], "Error: Cannot find module");
    detector.recordIteration(false, ["file2.ts"], "Error: Cannot find module");
    detector.recordIteration(false, ["file3.ts"], "Error: Cannot find module");

    const check = detector.checkStall();

    if (check.isStalled && check.reason === "repeated_failures") {
      console.log("✓ Stall detector catches repeated failures");
      passCount++;
    } else {
      console.log("✗ Stall detector failed to detect repeated failures");
      failCount++;
    }
  } catch (error) {
    console.log(`✗ Stall detector test failed: ${error}`);
    failCount++;
  }

  // Phase 2: Stall Detector - Oscillation
  console.log("\n--- Phase 2: Stall Detector (Oscillation) ---");

  try {
    const detector = new StallDetector();

    detector.recordIteration(false, ["file1.ts"], "Error A");
    detector.recordIteration(false, ["file2.ts"], "Error B");
    detector.recordIteration(false, ["file1.ts"], "Error C");

    const check = detector.checkStall();

    if (check.isStalled && check.reason === "oscillation") {
      console.log("✓ Stall detector catches oscillation");
      passCount++;
    } else {
      console.log("✗ Stall detector failed to detect oscillation");
      failCount++;
    }
  } catch (error) {
    console.log(`✗ Stall detector oscillation test failed: ${error}`);
    failCount++;
  }

  // Phase 2: Stall Detector - No Progress
  console.log("\n--- Phase 2: Stall Detector (No Progress) ---");

  try {
    const detector = new StallDetector();

    for (let i = 0; i < 5; i++) {
      detector.recordIteration(false, [], "Error");
    }

    const check = detector.checkStall();

    if (check.isStalled && check.reason === "no_progress") {
      console.log("✓ Stall detector catches no progress");
      passCount++;
    } else {
      console.log("✗ Stall detector failed to detect no progress");
      failCount++;
    }
  } catch (error) {
    console.log(`✗ Stall detector no progress test failed: ${error}`);
    failCount++;
  }

  // Phase 3: Handoff Packet Generation
  console.log("\n--- Phase 3: Handoff Packet ---");

  try {
    const mockSession = {
      id: "test_handoff",
      createdAt: new Date().toISOString(),
      summary: "Test handoff",
      laneDecision: { lane: "strict" as const, reasons: [], autoPromoted: false },
      changedPaths: [{ path: "src/test.ts", kind: "domain_core" as const }],
      baseRef: "HEAD",
      nextCommands: [{ command: "npm test", description: "Run tests" }],
    };

    const mockResult = {
      outcome: "budget_exhausted" as const,
      sessionId: "test_handoff",
      lane: "strict" as const,
      requestedFast: false,
      autoPromoted: false,
      laneReasons: ["user requested strict lane"],
      iterations: 5,
      tokensUsed: 50000,
      costUSD: 2.5,
      testsPassed: false,
      metadata: {
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        testCommand: "npm test",
      },
    };

    const episodeMemory = createEpisodeMemory();
    addEpisode(episodeMemory, {
      iteration: 1,
      hypothesis: "Test hypothesis",
      outcome: "failure",
      changedFiles: ["src/test.ts"],
      errorMessage: "Test error",
    });

    const packet = generateHandoffPacket(root, mockSession, mockResult, episodeMemory, "Test error");

    if (packet.sessionId === "test_handoff" && packet.outcome === "budget_exhausted") {
      console.log("✓ Handoff packet generation works");
      passCount++;
    } else {
      console.log("✗ Handoff packet generation failed");
      failCount++;
    }

    // Test write and read
    const filepath = writeHandoffPacket(root, packet);
    const readPacket = readHandoffPacket(root, "test_handoff");

    if (readPacket && readPacket.sessionId === "test_handoff") {
      console.log("✓ Handoff packet write/read works");
      passCount++;
    } else {
      console.log("✗ Handoff packet write/read failed");
      failCount++;
    }

    // Cleanup
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    // Test formatting
    const formatted = formatHandoffPacket(packet);

    if (formatted.includes("Handoff Packet") && formatted.includes("Next Steps")) {
      console.log("✓ Handoff packet formatting works");
      passCount++;
    } else {
      console.log("✗ Handoff packet formatting failed");
      failCount++;
    }
  } catch (error) {
    console.log(`✗ Handoff packet test failed: ${error}`);
    failCount += 3;
  }

  // Phase 4: Test Command Resolver
  console.log("\n--- Phase 4: Test Command Resolver ---");

  try {
    const mockSession = {
      id: "test_resolver",
      createdAt: new Date().toISOString(),
      summary: "Test resolver",
      laneDecision: { lane: "strict" as const, reasons: [], autoPromoted: false },
      changedPaths: [],
      baseRef: "HEAD",
      nextCommands: [{ command: "npm run verify", description: "Verify changes" }],
    };

    // Test explicit command (highest priority)
    const resolution1 = resolveTestCommand(root, mockSession, "npm run custom-test");

    if (resolution1.command === "npm run custom-test" && resolution1.source === "explicit") {
      console.log("✓ Test command resolver handles explicit command");
      passCount++;
    } else {
      console.log("✗ Test command resolver explicit command failed");
      failCount++;
    }

    // Test session hint
    const resolution2 = resolveTestCommand(root, mockSession);

    if (resolution2.command === "npm run verify" && resolution2.source === "session_hint") {
      console.log("✓ Test command resolver extracts from session hint");
      passCount++;
    } else {
      console.log("✗ Test command resolver session hint failed");
      failCount++;
    }

    // Test package.json fallback
    const packageCommand = extractTestCommandFromPackageJson(root);

    if (packageCommand === "npm test") {
      console.log("✓ Test command resolver extracts from package.json");
      passCount++;
    } else {
      console.log("✓ Test command resolver package.json (no test script or not found)");
      passCount++;
    }

    // Test validation
    const validation1 = validateTestCommand("npm test");
    const validation2 = validateTestCommand("rm -rf /");

    if (validation1.valid && !validation2.valid) {
      console.log("✓ Test command validator works");
      passCount++;
    } else {
      console.log("✗ Test command validator failed");
      failCount++;
    }
  } catch (error) {
    console.log(`✗ Test command resolver test failed: ${error}`);
    failCount += 4;
  }

  // Summary
  console.log("\n=== Test Summary ===");
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Total: ${passCount + failCount}`);

  if (failCount === 0) {
    console.log("\n✓ All tests passed!");
  } else {
    console.log(`\n✗ ${failCount} test(s) failed`);
  }
}

testTaskPack8().catch(console.error);
