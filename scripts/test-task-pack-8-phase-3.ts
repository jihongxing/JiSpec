import { generateHandoffPacket, writeHandoffPacket, readHandoffPacket, listHandoffPackets, formatHandoffPacket } from "../tools/jispec/implement/handoff-packet";
import { createEpisodeMemory, addEpisode } from "../tools/jispec/implement/episode-memory";
import path from "node:path";
import fs from "node:fs";

async function testTaskPack8Phase3() {
  const root = path.resolve(".");

  console.log("=== Testing Task Pack 8 Phase 3: Handoff Packet ===\n");

  // Test 1: Generate handoff packet - budget exhausted
  console.log("Test 1: Generate handoff packet - budget exhausted...");
  try {
    const mockSession = {
      id: "test_session_1",
      createdAt: new Date().toISOString(),
      summary: "Add order refund feature",
      laneDecision: { lane: "strict" as const, reasons: [], autoPromoted: false },
      changedPaths: [
        { path: "src/order.ts", kind: "domain_core" as const },
        { path: "src/refund.ts", kind: "domain_core" as const },
      ],
      baseRef: "HEAD",
      nextCommands: [{ command: "npm test", description: "Run tests" }],
    };

    const mockResult = {
      outcome: "budget_exhausted" as const,
      sessionId: "test_session_1",
      lane: "strict" as const,
      requestedFast: false,
      autoPromoted: false,
      laneReasons: ["user requested strict lane"],
      iterations: 10,
      tokensUsed: 95000,
      costUSD: 4.75,
      testsPassed: false,
      metadata: {
        startedAt: "2026-04-27T10:00:00Z",
        completedAt: "2026-04-27T10:30:00Z",
        testCommand: "npm test",
      },
    };

    const episodeMemory = createEpisodeMemory();
    addEpisode(episodeMemory, {
      iteration: 1,
      hypothesis: "Add RefundService class",
      outcome: "failure",
      changedFiles: ["src/refund.ts"],
      errorMessage: "Cannot find module 'RefundService'",
    });

    const packet = generateHandoffPacket(root, mockSession, mockResult, episodeMemory, "Cannot find module 'RefundService'");

    console.log(`✓ Handoff packet generated`);
    console.log(`  Session ID: ${packet.sessionId}`);
    console.log(`  Outcome: ${packet.outcome}`);
    console.log(`  Suggested actions: ${packet.nextSteps.suggestedActions.length}`);
  } catch (error) {
    console.log(`✗ Generate handoff packet test failed: ${error}`);
  }
  console.log("");

  // Test 2: Write and read handoff packet
  console.log("Test 2: Write and read handoff packet...");
  try {
    const mockSession = {
      id: "test_session_2",
      createdAt: new Date().toISOString(),
      summary: "Test write",
      laneDecision: { lane: "strict" as const, reasons: [], autoPromoted: false },
      changedPaths: [],
      baseRef: "HEAD",
      nextCommands: [{ command: "npm test", description: "Run tests" }],
    };

    const mockResult = {
      outcome: "budget_exhausted" as const,
      sessionId: "test_session_2",
      lane: "strict" as const,
      requestedFast: false,
      autoPromoted: false,
      laneReasons: ["user requested strict lane"],
      iterations: 1,
      tokensUsed: 1000,
      costUSD: 0.05,
      testsPassed: false,
      metadata: {
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        testCommand: "npm test",
      },
    };

    const episodeMemory = createEpisodeMemory();
    const packet = generateHandoffPacket(root, mockSession, mockResult, episodeMemory, "Test error");

    const filepath = writeHandoffPacket(root, packet);
    console.log(`✓ Handoff packet written: ${filepath}`);

    const readPacket = readHandoffPacket(root, "test_session_2");
    console.log(`  Read back: ${readPacket ? "yes" : "no"}`);

    // Cleanup
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  } catch (error) {
    console.log(`✗ Write/read test failed: ${error}`);
  }
  console.log("");

  // Test 3: Format handoff packet
  console.log("Test 3: Format handoff packet...");
  try {
    const mockSession = {
      id: "test_session_3",
      createdAt: new Date().toISOString(),
      summary: "Test format",
      laneDecision: { lane: "strict" as const, reasons: [], autoPromoted: false },
      changedPaths: [],
      baseRef: "HEAD",
      nextCommands: [{ command: "npm test", description: "Run tests" }],
    };

    const mockResult = {
      outcome: "stall_detected" as const,
      sessionId: "test_session_3",
      lane: "strict" as const,
      requestedFast: false,
      autoPromoted: false,
      laneReasons: ["user requested strict lane"],
      iterations: 3,
      tokensUsed: 3000,
      costUSD: 0.15,
      testsPassed: false,
      metadata: {
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        testCommand: "npm test",
        stallReason: "repeated_failures: same error",
      },
    };

    const episodeMemory = createEpisodeMemory();
    const packet = generateHandoffPacket(root, mockSession, mockResult, episodeMemory, "Test error");
    const formatted = formatHandoffPacket(packet);

    console.log(`✓ Formatted (${formatted.length} chars)`);
    console.log(`  Contains next steps: ${formatted.includes("Next Steps") ? "yes" : "no"}`);
  } catch (error) {
    console.log(`✗ Format test failed: ${error}`);
  }
  console.log("");

  console.log("=== Task Pack 8 Phase 3 Tests Complete ===");
}

testTaskPack8Phase3().catch(console.error);
