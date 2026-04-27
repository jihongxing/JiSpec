import { classifyGitDiff, classifyPath } from "../tools/jispec/change/git-diff-classifier";
import { computeLaneDecision } from "../tools/jispec/change/lane-decision";
import { runChangeCommand } from "../tools/jispec/change/change-command";
import {
  writeChangeSession,
  readChangeSession,
  clearChangeSession,
} from "../tools/jispec/change/change-session";
import path from "node:path";
import fs from "node:fs";

async function testTaskPack7() {
  const root = path.resolve(".");

  console.log("=== Testing Task Pack 7: Change Command & Fast Lane ===\n");

  // Test 1: Classify individual paths
  console.log("Test 1: Testing path classification...");
  const testPaths = [
    "README.md",
    "docs/guide.md",
    ".spec/contracts/api_spec.json",
    "src/routes/orders.ts",
    "src/domain/order.ts",
    "tests/order.test.ts",
    "package.json",
    "src/utils/helper.ts",
  ];

  for (const testPath of testPaths) {
    const kind = classifyPath(testPath);
    console.log(`  ${testPath} -> ${kind}`);
  }
  console.log("✓ Path classification completed\n");

  // Test 2: Git diff classification (docs only)
  console.log("Test 2: Testing git diff classification...");
  try {
    const classification = classifyGitDiff(root, "HEAD");
    console.log(`✓ Git diff classified: ${classification.changedPaths.length} paths`);
    console.log(`  Fast eligible: ${classification.fastEligible}`);
    if (classification.strictReasons.length > 0) {
      console.log(`  Strict reasons: ${classification.strictReasons.length}`);
    }
  } catch (error) {
    console.log(`✗ Git diff classification failed: ${error}`);
  }
  console.log("");

  // Test 3: Lane decision computation
  console.log("Test 3: Testing lane decision...");
  try {
    const classification = classifyGitDiff(root, "HEAD");
    const decision = computeLaneDecision(classification, "auto" as any);
    console.log(`✓ Lane decision: ${decision.lane}`);
    console.log(`  Reasons: ${decision.reasons.length}`);
    if (decision.autoPromoted) {
      console.log(`  Auto-promoted: true`);
    }
  } catch (error) {
    console.log(`✗ Lane decision failed: ${error}`);
  }
  console.log("");

  // Test 4: Change command execution
  console.log("Test 4: Running change command...");
  try {
    const result = await runChangeCommand({
      root,
      summary: "Test change for Task Pack 7",
      lane: "auto" as any,
      baseRef: "HEAD",
      json: false,
    });

    console.log(`✓ Change command completed`);
    console.log(`  Session ID: ${result.session.id}`);
    console.log(`  Lane: ${result.session.laneDecision.lane}`);
    console.log(`  Next commands: ${result.session.nextCommands.length}`);
  } catch (error) {
    console.log(`✗ Change command failed: ${error}`);
  }
  console.log("");

  // Test 5: Change session persistence
  console.log("Test 5: Testing change session persistence...");
  try {
    const session = readChangeSession(root);
    if (session) {
      console.log(`✓ Session read from disk`);
      console.log(`  ID: ${session.id}`);
      console.log(`  Summary: ${session.summary}`);
      console.log(`  Lane: ${session.laneDecision.lane}`);
    } else {
      console.log(`  No active session found`);
    }
  } catch (error) {
    console.log(`✗ Session read failed: ${error}`);
  }
  console.log("");

  // Test 6: Fast lane with docs-only changes
  console.log("Test 6: Testing fast lane eligibility (simulated docs-only)...");
  try {
    // Simulate a classification with only docs changes
    const mockClassification = {
      changedPaths: [
        { path: "README.md", kind: "docs_only" as const },
        { path: "docs/guide.md", kind: "docs_only" as const },
      ],
      strictReasons: [],
      fastEligible: true,
    };

    const decision = computeLaneDecision(mockClassification, "auto" as any);
    console.log(`✓ Simulated docs-only changes`);
    console.log(`  Lane: ${decision.lane}`);
    console.log(`  Expected: fast`);
    console.log(`  Match: ${decision.lane === "fast" ? "✓" : "✗"}`);
  } catch (error) {
    console.log(`✗ Fast lane test failed: ${error}`);
  }
  console.log("");

  // Test 7: Strict lane with API changes
  console.log("Test 7: Testing strict lane requirement (simulated API changes)...");
  try {
    // Simulate a classification with API changes
    const mockClassification = {
      changedPaths: [
        { path: "src/routes/orders.ts", kind: "api_surface" as const },
        { path: ".spec/contracts/api_spec.json", kind: "contract" as const },
      ],
      strictReasons: [
        "changed path hits api surface: src/routes/orders.ts",
        "changed path hits contract asset: .spec/contracts/api_spec.json",
      ],
      fastEligible: false,
    };

    const decision = computeLaneDecision(mockClassification, "auto" as any);
    console.log(`✓ Simulated API changes`);
    console.log(`  Lane: ${decision.lane}`);
    console.log(`  Expected: strict`);
    console.log(`  Match: ${decision.lane === "strict" ? "✓" : "✗"}`);
  } catch (error) {
    console.log(`✗ Strict lane test failed: ${error}`);
  }
  console.log("");

  // Test 8: Auto-promotion from fast to strict
  console.log("Test 8: Testing auto-promotion from fast to strict...");
  try {
    // Simulate requesting fast lane but having API changes
    const mockClassification = {
      changedPaths: [
        { path: "src/routes/orders.ts", kind: "api_surface" as const },
      ],
      strictReasons: ["changed path hits api surface: src/routes/orders.ts"],
      fastEligible: false,
    };

    const decision = computeLaneDecision(mockClassification, "fast");
    console.log(`✓ Requested fast lane with API changes`);
    console.log(`  Lane: ${decision.lane}`);
    console.log(`  Auto-promoted: ${decision.autoPromoted}`);
    console.log(`  Expected: strict with auto-promotion`);
    console.log(`  Match: ${decision.lane === "strict" && decision.autoPromoted ? "✓" : "✗"}`);
  } catch (error) {
    console.log(`✗ Auto-promotion test failed: ${error}`);
  }
  console.log("");

  // Test 9: Change command with JSON output
  console.log("Test 9: Testing change command JSON output...");
  try {
    const result = await runChangeCommand({
      root,
      summary: "Test JSON output",
      lane: "auto" as any,
      baseRef: "HEAD",
      json: true,
    });

    const parsed = JSON.parse(result.text);
    console.log(`✓ JSON output parsed successfully`);
    console.log(`  Has session ID: ${!!parsed.id}`);
    console.log(`  Has lane decision: ${!!parsed.laneDecision}`);
    console.log(`  Has next commands: ${!!parsed.nextCommands}`);
  } catch (error) {
    console.log(`✗ JSON output test failed: ${error}`);
  }
  console.log("");

  // Cleanup: Clear active session
  console.log("Cleanup: Clearing active session...");
  try {
    clearChangeSession(root);
    console.log("✓ Session cleared");
  } catch (error) {
    console.log(`✗ Cleanup failed: ${error}`);
  }

  console.log("\n=== Task Pack 7 Tests Complete ===");
}

testTaskPack7().catch(console.error);
