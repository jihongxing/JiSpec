import assert from "node:assert";
import { CollaborationClient, CollaborationServer } from "../collaboration-server";
import { PresenceManager } from "../presence-manager";

async function testActivityFeedCapturesCoreCollaborationSignals(): Promise<void> {
  const presence = new PresenceManager();
  const server = new CollaborationServer({ presenceManager: presence });

  try {
    const alice = new CollaborationClient(server, "alice", "Alice", "doc-awareness");
    const bob = new CollaborationClient(server, "bob", "Bob", "doc-awareness");

    alice.connect("Hello");
    bob.connect();

    alice.sendCursor({ line: 1, column: 3, documentId: "doc-awareness" });
    alice.sendSelection({
      start: { line: 1, column: 1 },
      end: { line: 1, column: 5 },
      documentId: "doc-awareness",
    });
    alice.sendOperation({
      type: "insert",
      position: 5,
      content: " world",
      baseVersion: 0,
    });
    bob.addComment("Looks good", { start: 0, end: 5 });
    bob.sendOperation({
      type: "insert",
      position: 5,
      content: "!",
      baseVersion: 0,
    });

    const feed = server.getActivityFeed("doc-awareness");
    const types = feed.map((event) => event.type);

    assert.ok(types.includes("join"));
    assert.ok(types.includes("view"));
    assert.ok(types.includes("sync"));
    assert.ok(types.includes("cursor"));
    assert.ok(types.includes("selection"));
    assert.ok(types.includes("edit"));
    assert.ok(types.includes("comment"));
    assert.ok(types.includes("conflict"));

    const conflictEvent = feed.find((event) => event.type === "conflict");
    assert.ok(conflictEvent);
    assert.equal((conflictEvent?.data as { type?: string }).type, "concurrent_edit");

    alice.disconnect();
    bob.disconnect();
  } finally {
    server.close();
    presence.destroy();
  }
}

async function testReplayReconstructsDocumentEvolution(): Promise<void> {
  const server = new CollaborationServer();

  try {
    const alice = new CollaborationClient(server, "alice", "Alice", "doc-replay");
    alice.connect("A");

    alice.sendOperation({
      type: "insert",
      position: 1,
      content: "B",
      baseVersion: 0,
    });
    alice.sendOperation({
      type: "replace",
      position: 0,
      length: 2,
      content: "CD",
      baseVersion: 1,
    });

    const replay = server.replayDocumentOperations("doc-replay");
    assert.equal(replay.length, 3);
    assert.equal(replay[0].content, "A");
    assert.equal(replay[1].content, "AB");
    assert.equal(replay[2].content, "CD");

    alice.disconnect();
  } finally {
    server.close();
  }
}

async function testAwarenessSnapshotAndStatsReflectCurrentState(): Promise<void> {
  const presence = new PresenceManager();
  const server = new CollaborationServer({ presenceManager: presence });

  try {
    const alice = new CollaborationClient(server, "alice", "Alice", "doc-stats");
    const bob = new CollaborationClient(server, "bob", "Bob", "doc-stats");

    alice.connect("Seed");
    bob.connect();
    bob.requestSync();
    alice.addComment("Track this");

    const snapshot = server.getPresenceSnapshot("doc-stats");
    assert.equal(snapshot.totalUsers, 2);
    assert.equal(snapshot.statusCounts.online, 2);
    assert.deepEqual(
      snapshot.users.map((user) => user.userId).sort(),
      ["alice", "bob"]
    );

    const stats = server.getAwarenessStats("doc-stats");
    assert.equal(stats.totalSessions, 2);
    assert.equal(stats.commentCount, 1);
    assert.equal(stats.documentVersion, 0);
    assert.equal(stats.activityByType.sync >= 2, true);
    assert.equal(stats.byDocument["doc-stats"], 2);

    alice.disconnect();
    bob.disconnect();
  } finally {
    server.close();
    presence.destroy();
  }
}

async function main() {
  console.log("=== Collaboration Awareness MVP Test ===\n");

  const tests: Array<{ name: string; run: () => Promise<void> }> = [
    { name: "activity feed captures core collaboration signals", run: testActivityFeedCapturesCoreCollaborationSignals },
    { name: "replay reconstructs document evolution", run: testReplayReconstructsDocumentEvolution },
    { name: "awareness snapshot and stats reflect current state", run: testAwarenessSnapshotAndStatsReflectCurrentState },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test.run();
      console.log(`✓ ${test.name}`);
      passed += 1;
    } catch (error) {
      console.error(`✗ ${test.name}:`, error);
      failed += 1;
    }
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Collaboration awareness MVP test failed:", error);
  process.exit(1);
});
