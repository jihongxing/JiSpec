import assert from "node:assert";
import { CollaborationClient, CollaborationServer } from "../collaboration-server";
import { PermissionManager } from "../permission-manager";

async function testDocumentLockBlocksOtherEditors(): Promise<void> {
  const permissionManager = new PermissionManager();
  const server = new CollaborationServer({ permissionManager });

  try {
    permissionManager.grantPermission("alice", "doc-lock-1", "document", "editor", "admin");
    permissionManager.grantPermission("bob", "doc-lock-1", "document", "editor", "admin");

    const alice = new CollaborationClient(server, "alice", "Alice", "doc-lock-1");
    const bob = new CollaborationClient(server, "bob", "Bob", "doc-lock-1");

    alice.connect("Base");
    bob.connect();

    const lock = alice.lockDocument(60000, { reason: "editing critical section" });
    assert.equal(lock.userId, "alice");
    assert.equal(server.getDocumentLock("doc-lock-1")?.userId, "alice");

    assert.throws(
      () =>
        bob.sendOperation({
          type: "insert",
          position: 0,
          content: "?",
          baseVersion: 0,
        }),
      /cannot write locked document/i
    );

    const result = alice.sendOperation({
      type: "insert",
      position: 4,
      content: "!",
      baseVersion: 0,
    });
    assert.equal(result.content, "Base!");

    alice.disconnect();
    bob.disconnect();
  } finally {
    server.close();
    permissionManager.destroy();
  }
}

async function testAdminCanForceUnlockAndRestoreWrites(): Promise<void> {
  const permissionManager = new PermissionManager();
  const server = new CollaborationServer({ permissionManager });

  try {
    permissionManager.grantPermission("alice", "doc-lock-2", "document", "editor", "system");
    permissionManager.grantPermission("bob", "doc-lock-2", "document", "admin", "system");

    const alice = new CollaborationClient(server, "alice", "Alice", "doc-lock-2");
    const bob = new CollaborationClient(server, "bob", "Bob", "doc-lock-2");

    alice.connect("Seed");
    bob.connect();

    alice.lockDocument(60000);
    assert.equal(server.getDocumentLock("doc-lock-2")?.userId, "alice");

    bob.forceUnlockDocument();
    assert.equal(server.getDocumentLock("doc-lock-2"), undefined);

    const state = bob.sendOperation({
      type: "insert",
      position: 4,
      content: "!",
      baseVersion: 0,
    });
    assert.equal(state.content, "Seed!");

    alice.disconnect();
    bob.disconnect();
  } finally {
    server.close();
    permissionManager.destroy();
  }
}

async function testExpiredLockAutoReleases(): Promise<void> {
  const permissionManager = new PermissionManager(50);
  const server = new CollaborationServer({ permissionManager });

  try {
    permissionManager.grantPermission("alice", "doc-lock-3", "document", "editor", "system");
    permissionManager.grantPermission("bob", "doc-lock-3", "document", "editor", "system");

    const alice = new CollaborationClient(server, "alice", "Alice", "doc-lock-3");
    const bob = new CollaborationClient(server, "bob", "Bob", "doc-lock-3");

    alice.connect("Hi");
    bob.connect();

    alice.lockDocument(20);
    await new Promise((resolve) => setTimeout(resolve, 40));

    assert.equal(server.getDocumentLock("doc-lock-3"), undefined);

    const state = bob.sendOperation({
      type: "insert",
      position: 2,
      content: "!",
      baseVersion: 0,
    });
    assert.equal(state.content, "Hi!");

    alice.disconnect();
    bob.disconnect();
  } finally {
    server.close();
    permissionManager.destroy();
  }
}

async function main() {
  console.log("=== Collaboration Locking MVP Test ===\n");

  const tests: Array<{ name: string; run: () => Promise<void> }> = [
    { name: "document lock blocks other editors", run: testDocumentLockBlocksOtherEditors },
    { name: "admin can force unlock and restore writes", run: testAdminCanForceUnlockAndRestoreWrites },
    { name: "expired lock auto releases", run: testExpiredLockAutoReleases },
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
  console.error("Collaboration locking MVP test failed:", error);
  process.exit(1);
});
