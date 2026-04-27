import assert from "node:assert";
import { AdvancedConflictResolver } from "../advanced-conflict-resolver";
import { CollaborationClient, CollaborationServer, type CollaborationOperation } from "../collaboration-server";

function buildOperation(overrides: Partial<CollaborationOperation>): CollaborationOperation {
  return {
    id: overrides.id ?? "op",
    userId: overrides.userId ?? "user",
    type: overrides.type ?? "insert",
    position: overrides.position ?? 0,
    length: overrides.length,
    content: overrides.content,
    baseVersion: overrides.baseVersion ?? 0,
    timestamp: overrides.timestamp ?? new Date().toISOString(),
  };
}

async function testResolverDetectsConcurrentEditConflict(): Promise<void> {
  const resolver = new AdvancedConflictResolver();

  const first = buildOperation({
    id: "op-1",
    userId: "alice",
    type: "insert",
    position: 1,
    content: "X",
    baseVersion: 0,
    timestamp: "2026-04-27T10:00:00.000Z",
  });
  const second = buildOperation({
    id: "op-2",
    userId: "bob",
    type: "insert",
    position: 1,
    content: "Y",
    baseVersion: 0,
    timestamp: "2026-04-27T10:00:01.000Z",
  });

  const conflict = resolver.detectConflict(first, second);
  assert.ok(conflict);
  assert.equal(conflict?.type, "concurrent_edit");

  const resolution = resolver.resolveConflict(conflict!.id);
  assert.equal(resolution.strategy, "operational_transform");
  assert.equal(resolution.mergedOperation.position, 2);
}

async function testResolverFallsBackForDeleteEditConflict(): Promise<void> {
  const resolver = new AdvancedConflictResolver();

  const remove = buildOperation({
    id: "delete-1",
    userId: "alice",
    type: "delete",
    position: 2,
    length: 2,
    baseVersion: 0,
    timestamp: "2026-04-27T10:00:00.000Z",
  });
  const edit = buildOperation({
    id: "insert-1",
    userId: "bob",
    type: "insert",
    position: 3,
    content: "Z",
    baseVersion: 0,
    timestamp: "2026-04-27T10:00:02.000Z",
  });

  const conflict = resolver.detectConflict(remove, edit);
  assert.ok(conflict);
  assert.equal(conflict?.type, "delete_edit");

  const resolution = resolver.resolveConflict(conflict!.id);
  assert.equal(resolution.strategy, "last_write_wins");
  assert.equal(resolution.mergedOperation.id, "insert-1");
}

async function testCollaborationServerEmitsConflictAndResolution(): Promise<void> {
  const server = new CollaborationServer();

  try {
    const alice = new CollaborationClient(server, "alice", "Alice", "doc-conflict");
    const bob = new CollaborationClient(server, "bob", "Bob", "doc-conflict");
    const emittedConflicts: string[] = [];

    server.on("conflict", (conflict) => {
      emittedConflicts.push(conflict.type);
    });

    alice.connect("AB");
    bob.connect();

    alice.sendOperation({
      type: "insert",
      position: 1,
      content: "X",
      baseVersion: 0,
    });

    const finalState = bob.sendOperation({
      type: "insert",
      position: 1,
      content: "Y",
      baseVersion: 0,
    });

    assert.deepEqual(emittedConflicts, ["concurrent_edit"]);
    assert.equal(finalState.content, "AXYB");
    assert.equal(server.getConflictResolver().getStats().resolvedConflicts, 1);

    alice.disconnect();
    bob.disconnect();
  } finally {
    server.close();
  }
}

async function testCollaborationStatsExposeConflictCounts(): Promise<void> {
  const server = new CollaborationServer();

  try {
    const alice = new CollaborationClient(server, "alice", "Alice", "doc-stats");
    const bob = new CollaborationClient(server, "bob", "Bob", "doc-stats");

    alice.connect("Seed");
    bob.connect();

    alice.sendOperation({
      type: "replace",
      position: 0,
      length: 4,
      content: "Plan",
      baseVersion: 0,
    });

    bob.sendOperation({
      type: "replace",
      position: 0,
      length: 4,
      content: "Spec",
      baseVersion: 0,
    });

    const stats = server.getStats();
    assert.equal(stats.totalConflicts, 1);
    assert.equal(server.getConflictResolver().getStats().byType.replace_edit, 1);

    alice.disconnect();
    bob.disconnect();
  } finally {
    server.close();
  }
}

async function main() {
  console.log("=== Conflict Resolution MVP Test ===\n");

  const tests: Array<{ name: string; run: () => Promise<void> }> = [
    { name: "resolver detects concurrent edit conflict", run: testResolverDetectsConcurrentEditConflict },
    { name: "resolver falls back for delete-edit conflict", run: testResolverFallsBackForDeleteEditConflict },
    { name: "collaboration server emits conflict and resolution", run: testCollaborationServerEmitsConflictAndResolution },
    { name: "collaboration stats expose conflict counts", run: testCollaborationStatsExposeConflictCounts },
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
  console.error("Conflict resolution MVP test failed:", error);
  process.exit(1);
});
