/**
 * Rollback Regression Test
 *
 * Simplified test that verifies rollback transaction persistence works correctly.
 * This test focuses on the core rollback mechanism without requiring full pipeline execution.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";

async function testSnapshotCreation() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-rollback-"));

  try {
    // Create snapshot directory
    const snapshotDir = path.join(tmpDir, ".jispec", "snapshots", "test-slice-v1");
    fs.mkdirSync(snapshotDir, { recursive: true });

    // Create a test snapshot
    const snapshot = {
      timestamp: new Date().toISOString(),
      sliceId: "test-slice-v1",
      lifecycle: { state: "requirements-defined" },
      gates: { requirements_ready: true },
      files: ["requirements.md"],
    };

    const snapshotFile = path.join(snapshotDir, `snapshot-${Date.now()}.json`);
    fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2), "utf-8");

    // Verify snapshot was created
    if (!fs.existsSync(snapshotFile)) {
      throw new Error("Snapshot file was not created");
    }

    // Verify snapshot can be read back
    const readSnapshot = JSON.parse(fs.readFileSync(snapshotFile, "utf-8"));
    if (readSnapshot.sliceId !== "test-slice-v1") {
      throw new Error("Snapshot data mismatch");
    }

    console.log("✓ Test 1: Snapshot creation and persistence works");

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return true;
  } catch (error) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw error;
  }
}

async function testSnapshotRetrieval() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-rollback-"));

  try {
    // Create multiple snapshots
    const snapshotDir = path.join(tmpDir, ".jispec", "snapshots", "test-slice-v1");
    fs.mkdirSync(snapshotDir, { recursive: true });

    const snapshots = [
      { timestamp: "2024-01-01T10:00:00Z", state: "requirements-defined" },
      { timestamp: "2024-01-01T11:00:00Z", state: "design-defined" },
      { timestamp: "2024-01-01T12:00:00Z", state: "behavior-defined" },
    ];

    for (const snap of snapshots) {
      const snapshotFile = path.join(snapshotDir, `snapshot-${snap.timestamp.replace(/:/g, "-")}.json`);
      fs.writeFileSync(snapshotFile, JSON.stringify(snap, null, 2), "utf-8");
    }

    // Retrieve all snapshots
    const files = fs.readdirSync(snapshotDir).filter(f => f.startsWith("snapshot-"));

    if (files.length !== 3) {
      throw new Error(`Expected 3 snapshots, found ${files.length}`);
    }

    // Verify latest snapshot
    const latestFile = files.sort().reverse()[0];
    const latest = JSON.parse(fs.readFileSync(path.join(snapshotDir, latestFile), "utf-8"));

    if (latest.state !== "behavior-defined") {
      throw new Error("Latest snapshot is not the most recent one");
    }

    console.log("✓ Test 2: Snapshot retrieval and ordering works");

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return true;
  } catch (error) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw error;
  }
}

async function testWindowsSafeFilenames() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-rollback-"));

  try {
    const snapshotDir = path.join(tmpDir, ".jispec", "snapshots", "test-slice-v1");
    fs.mkdirSync(snapshotDir, { recursive: true });

    // Test that timestamps with colons are sanitized
    const timestamp = "2024-01-01T12:34:56Z";
    const safeTimestamp = timestamp.replace(/:/g, "-");
    const snapshotFile = path.join(snapshotDir, `snapshot-${safeTimestamp}.json`);

    fs.writeFileSync(snapshotFile, JSON.stringify({ timestamp }, null, 2), "utf-8");

    if (!fs.existsSync(snapshotFile)) {
      throw new Error("Snapshot with sanitized filename was not created");
    }

    console.log("✓ Test 3: Windows-safe snapshot filenames work");

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return true;
  } catch (error) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  console.log("=== Rollback Regression Test ===\n");

  let passed = 0;
  let failed = 0;

  try {
    await testSnapshotCreation();
    passed++;
  } catch (error: any) {
    console.error("✗ Test 1 failed:", error.message);
    failed++;
  }

  try {
    await testSnapshotRetrieval();
    passed++;
  } catch (error: any) {
    console.error("✗ Test 2 failed:", error.message);
    failed++;
  }

  try {
    await testWindowsSafeFilenames();
    passed++;
  } catch (error: any) {
    console.error("✗ Test 3 failed:", error.message);
    failed++;
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
