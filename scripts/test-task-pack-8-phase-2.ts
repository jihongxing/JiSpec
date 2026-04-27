import { StallDetector } from "../tools/jispec/implement/stall-detector";
import { createEpisodeMemory, addEpisode, getRecentHypotheses, getRejectedPaths, wasHypothesisAttempted } from "../tools/jispec/implement/episode-memory";

async function testTaskPack8Phase2() {
  console.log("=== Testing Task Pack 8 Phase 2: Stall Detection ===\n");

  // Test 1: Stall Detector - Repeated failures
  console.log("Test 1: Stall detector - repeated failures...");
  try {
    const detector = new StallDetector();

    detector.recordIteration(false, ["file1.ts"], "Error: Cannot find module 'foo'");
    detector.recordIteration(false, ["file2.ts"], "Error: Cannot find module 'foo'");
    detector.recordIteration(false, ["file3.ts"], "Error: Cannot find module 'foo'");

    const result = detector.checkStall();
    console.log(`✓ Stall detected: ${result.isStalled}`);
    console.log(`  Reason: ${result.reason}`);
    console.log(`  Expected: repeated_failures`);
    console.log(`  Match: ${result.reason === "repeated_failures" ? "✓" : "✗"}`);
  } catch (error) {
    console.log(`✗ Repeated failures test failed: ${error}`);
  }
  console.log("");

  // Test 2: Stall Detector - Oscillation
  console.log("Test 2: Stall detector - oscillation...");
  try {
    const detector = new StallDetector();

    detector.recordIteration(false, ["file1.ts"], "Error 1");
    detector.recordIteration(false, ["file2.ts"], "Error 2");
    detector.recordIteration(false, ["file1.ts"], "Error 3");
    detector.recordIteration(false, ["file3.ts"], "Error 4");
    detector.recordIteration(false, ["file1.ts"], "Error 5");

    const result = detector.checkStall();
    console.log(`✓ Stall detected: ${result.isStalled}`);
    console.log(`  Reason: ${result.reason}`);
    console.log(`  Expected: oscillation`);
    console.log(`  Match: ${result.reason === "oscillation" ? "✓" : "✗"}`);
  } catch (error) {
    console.log(`✗ Oscillation test failed: ${error}`);
  }
  console.log("");

  // Test 3: Stall Detector - No progress
  console.log("Test 3: Stall detector - no progress...");
  try {
    const detector = new StallDetector();

    detector.recordIteration(false, ["file1.ts"], "Error 1");
    detector.recordIteration(false, ["file1.ts"], "Error 2");
    detector.recordIteration(false, ["file1.ts"], "Error 3");
    detector.recordIteration(false, ["file1.ts"], "Error 4");
    detector.recordIteration(false, ["file1.ts"], "Error 5");

    const result = detector.checkStall();
    console.log(`✓ Stall detected: ${result.isStalled}`);
    console.log(`  Reason: ${result.reason}`);
    console.log(`  Expected: no_progress`);
    console.log(`  Match: ${result.reason === "no_progress" ? "✓" : "✗"}`);
  } catch (error) {
    console.log(`✗ No progress test failed: ${error}`);
  }
  console.log("");

  // Test 4: Stall Detector - No stall (normal progress)
  console.log("Test 4: Stall detector - no stall...");
  try {
    const detector = new StallDetector();

    detector.recordIteration(false, ["file1.ts"], "Error 1");
    detector.recordIteration(false, ["file2.ts"], "Error 2");
    detector.recordIteration(false, ["file3.ts"], "Error 3");

    const result = detector.checkStall();
    console.log(`✓ Stall detected: ${result.isStalled}`);
    console.log(`  Expected: false`);
    console.log(`  Match: ${!result.isStalled ? "✓" : "✗"}`);
  } catch (error) {
    console.log(`✗ No stall test failed: ${error}`);
  }
  console.log("");

  // Test 5: Episode Memory - Add episodes
  console.log("Test 5: Episode memory - add episodes...");
  try {
    const memory = createEpisodeMemory();

    addEpisode(memory, {
      iteration: 1,
      hypothesis: "Add missing import",
      outcome: "failure",
      changedFiles: ["file1.ts"],
      errorMessage: "Cannot find module",
    });

    addEpisode(memory, {
      iteration: 2,
      hypothesis: "Fix import path",
      outcome: "failure",
      changedFiles: ["file1.ts"],
      errorMessage: "Cannot find module",
    });

    addEpisode(memory, {
      iteration: 3,
      hypothesis: "Install missing package",
      outcome: "success",
      changedFiles: ["package.json"],
    });

    console.log(`✓ Episodes added: ${memory.episodes.length}`);
    console.log(`  Expected: 3`);
    console.log(`  Match: ${memory.episodes.length === 3 ? "✓" : "✗"}`);
  } catch (error) {
    console.log(`✗ Add episodes test failed: ${error}`);
  }
  console.log("");

  // Test 6: Episode Memory - Get recent hypotheses
  console.log("Test 6: Episode memory - get recent hypotheses...");
  try {
    const memory = createEpisodeMemory();

    addEpisode(memory, {
      iteration: 1,
      hypothesis: "Hypothesis 1",
      outcome: "failure",
      changedFiles: [],
    });

    addEpisode(memory, {
      iteration: 2,
      hypothesis: "Hypothesis 2",
      outcome: "failure",
      changedFiles: [],
    });

    addEpisode(memory, {
      iteration: 3,
      hypothesis: "Hypothesis 3",
      outcome: "success",
      changedFiles: [],
    });

    const recent = getRecentHypotheses(memory, 2);
    console.log(`✓ Recent hypotheses: ${recent.length}`);
    console.log(`  Expected: 2`);
    console.log(`  Match: ${recent.length === 2 ? "✓" : "✗"}`);
    console.log(`  Last hypothesis: ${recent[recent.length - 1]}`);
  } catch (error) {
    console.log(`✗ Recent hypotheses test failed: ${error}`);
  }
  console.log("");

  // Test 7: Episode Memory - Get rejected paths
  console.log("Test 7: Episode memory - get rejected paths...");
  try {
    const memory = createEpisodeMemory();

    addEpisode(memory, {
      iteration: 1,
      hypothesis: "Try file1",
      outcome: "failure",
      changedFiles: ["file1.ts"],
    });

    addEpisode(memory, {
      iteration: 2,
      hypothesis: "Try file2",
      outcome: "failure",
      changedFiles: ["file2.ts"],
    });

    addEpisode(memory, {
      iteration: 3,
      hypothesis: "Try file3",
      outcome: "success",
      changedFiles: ["file3.ts"],
    });

    const rejected = getRejectedPaths(memory);
    console.log(`✓ Rejected paths: ${rejected.length}`);
    console.log(`  Expected: 2 (file1.ts, file2.ts)`);
    console.log(`  Match: ${rejected.length === 2 ? "✓" : "✗"}`);
    console.log(`  Paths: ${rejected.join(", ")}`);
  } catch (error) {
    console.log(`✗ Rejected paths test failed: ${error}`);
  }
  console.log("");

  // Test 8: Episode Memory - Check if hypothesis was attempted
  console.log("Test 8: Episode memory - check hypothesis attempted...");
  try {
    const memory = createEpisodeMemory();

    addEpisode(memory, {
      iteration: 1,
      hypothesis: "Add missing import",
      outcome: "failure",
      changedFiles: [],
    });

    const attempted = wasHypothesisAttempted(memory, "Add missing import");
    const notAttempted = wasHypothesisAttempted(memory, "Different hypothesis");

    console.log(`✓ Hypothesis attempted: ${attempted}`);
    console.log(`  Expected: true`);
    console.log(`  Match: ${attempted ? "✓" : "✗"}`);
    console.log(`  Not attempted: ${notAttempted}`);
    console.log(`  Expected: false`);
    console.log(`  Match: ${!notAttempted ? "✓" : "✗"}`);
  } catch (error) {
    console.log(`✗ Hypothesis attempted test failed: ${error}`);
  }
  console.log("");

  // Test 9: Stall Detector - Error signature normalization
  console.log("Test 9: Stall detector - error signature normalization...");
  try {
    const detector = new StallDetector();

    // Same error with different line numbers should be detected as repeated
    detector.recordIteration(false, ["file1.ts"], "Error at line 10: Cannot find module");
    detector.recordIteration(false, ["file2.ts"], "Error at line 25: Cannot find module");
    detector.recordIteration(false, ["file3.ts"], "Error at line 42: Cannot find module");

    const result = detector.checkStall();
    console.log(`✓ Stall detected: ${result.isStalled}`);
    console.log(`  Reason: ${result.reason}`);
    console.log(`  Expected: repeated_failures (normalized error)`);
    console.log(`  Match: ${result.reason === "repeated_failures" ? "✓" : "✗"}`);
  } catch (error) {
    console.log(`✗ Error normalization test failed: ${error}`);
  }
  console.log("");

  // Test 10: Integration - Context bundle with episode memory
  console.log("Test 10: Integration - context bundle with episode memory...");
  try {
    const { buildContextBundle } = await import("../tools/jispec/implement/context-pruning");

    const memory = createEpisodeMemory();
    addEpisode(memory, {
      iteration: 1,
      hypothesis: "Test hypothesis",
      outcome: "failure",
      changedFiles: ["test.ts"],
    });

    const mockSession = {
      id: "test_session",
      createdAt: new Date().toISOString(),
      summary: "Test change",
      laneDecision: { lane: "strict" as const, reasons: [], autoPromoted: false },
      changedPaths: [{ path: "package.json", kind: "config" as const }],
      baseRef: "HEAD",
      nextCommands: [{ command: "npm test", description: "Run tests" }],
    };

    const bundle = buildContextBundle(".", mockSession, null, memory);

    console.log(`✓ Context bundle with episode memory`);
    console.log(`  Has attempted hypotheses: ${bundle.episodeMemory.attemptedHypotheses.length > 0 ? "yes" : "no"}`);
    console.log(`  Has rejected paths: ${bundle.episodeMemory.rejectedPaths.length > 0 ? "yes" : "no"}`);
    console.log(`  Expected: yes, yes`);
    console.log(`  Match: ${bundle.episodeMemory.attemptedHypotheses.length > 0 && bundle.episodeMemory.rejectedPaths.length > 0 ? "✓" : "✗"}`);
  } catch (error) {
    console.log(`✗ Context bundle integration test failed: ${error}`);
  }
  console.log("");

  console.log("=== Task Pack 8 Phase 2 Tests Complete ===");
}

testTaskPack8Phase2().catch(console.error);
