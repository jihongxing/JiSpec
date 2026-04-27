import assert from "node:assert";
import { CollaborationClient, CollaborationServer } from "../collaboration-server";
import { PresenceManager } from "../presence-manager";
import { PermissionManager } from "../permission-manager";

async function testCollaborativeInsertSyncsAcrossClients(): Promise<void> {
  const presence = new PresenceManager();
  const server = new CollaborationServer({ presenceManager: presence });

  try {
    const alice = new CollaborationClient(server, "alice", "Alice", "doc-1");
    const bob = new CollaborationClient(server, "bob", "Bob", "doc-1");

    const receivedByBob: string[] = [];
    bob.on("operation", (message) => {
      if (message.state) {
        receivedByBob.push(message.state.content);
      }
    });

    const initial = alice.connect("Hello");
    bob.connect();

    assert.equal(initial.content, "Hello");

    const updated = alice.sendOperation({
      type: "insert",
      position: 5,
      content: " World",
      baseVersion: 0,
    });

    assert.equal(updated.content, "Hello World");
    assert.deepEqual(receivedByBob, ["Hello World"]);
    assert.equal(server.getDocument("doc-1")?.content, "Hello World");

    alice.disconnect();
    bob.disconnect();
  } finally {
    server.close();
    presence.destroy();
  }
}

async function testConcurrentOperationsTransformAgainstLatestVersion(): Promise<void> {
  const server = new CollaborationServer();

  try {
    const alice = new CollaborationClient(server, "alice", "Alice", "doc-2");
    const bob = new CollaborationClient(server, "bob", "Bob", "doc-2");

    alice.connect("AB");
    bob.connect();

    alice.sendOperation({
      type: "insert",
      position: 1,
      content: "X",
      baseVersion: 0,
    });

    const bobResult = bob.sendOperation({
      type: "insert",
      position: 2,
      content: "Y",
      baseVersion: 0,
    });

    assert.equal(bobResult.content, "AXBY");
    assert.equal(server.getDocument("doc-2")?.version, 2);

    alice.disconnect();
    bob.disconnect();
  } finally {
    server.close();
  }
}

async function testPresenceCursorAndSelectionPropagation(): Promise<void> {
  const presence = new PresenceManager();
  const server = new CollaborationServer({ presenceManager: presence });

  try {
    const alice = new CollaborationClient(server, "alice", "Alice", "doc-3");
    const bob = new CollaborationClient(server, "bob", "Bob", "doc-3");

    const cursorEvents: Array<{ line: number; column: number }> = [];
    const selectionEvents: Array<{ start: number; end: number }> = [];

    bob.on("cursor", (message) => {
      if (message.cursor) {
        cursorEvents.push({ line: message.cursor.line, column: message.cursor.column });
      }
    });

    bob.on("selection", (message) => {
      if (message.selection) {
        selectionEvents.push({
          start: message.selection.start.column,
          end: message.selection.end.column,
        });
      }
    });

    alice.connect("Doc");
    bob.connect();

    alice.sendCursor({ line: 2, column: 4, documentId: "doc-3" });
    alice.sendSelection({
      start: { line: 2, column: 1 },
      end: { line: 2, column: 3 },
      documentId: "doc-3",
    });

    assert.deepEqual(cursorEvents, [{ line: 2, column: 4 }]);
    assert.deepEqual(selectionEvents, [{ start: 1, end: 3 }]);

    const documentUsers = presence.getDocumentUsers("doc-3");
    assert.equal(documentUsers.length, 2);
    const alicePresence = documentUsers.find((user) => user.userId === "alice");
    assert.ok(alicePresence);
    assert.equal(alicePresence?.cursor?.column, 4);
    assert.equal(alicePresence?.selection?.end.column, 3);

    alice.disconnect();
    bob.disconnect();
  } finally {
    server.close();
    presence.destroy();
  }
}

async function testPermissionManagerBlocksUnauthorizedWrites(): Promise<void> {
  const permissionManager = new PermissionManager();
  const server = new CollaborationServer({ permissionManager });

  try {
    permissionManager.grantPermission("alice", "doc-4", "document", "editor", "admin");
    permissionManager.grantPermission("bob", "doc-4", "document", "viewer", "admin");

    const alice = new CollaborationClient(server, "alice", "Alice", "doc-4");
    const bob = new CollaborationClient(server, "bob", "Bob", "doc-4");

    alice.connect("Base");
    bob.connect();

    const aliceResult = alice.sendOperation({
      type: "insert",
      position: 4,
      content: "!",
      baseVersion: 0,
    });

    assert.equal(aliceResult.content, "Base!");
    assert.throws(
      () =>
        bob.sendOperation({
          type: "insert",
          position: 0,
          content: "?",
          baseVersion: 1,
        }),
      /cannot write document/i
    );

    alice.disconnect();
    bob.disconnect();
  } finally {
    server.close();
    permissionManager.destroy();
  }
}

async function main() {
  console.log("=== Collaboration MVP Test ===\n");

  const tests: Array<{ name: string; run: () => Promise<void> }> = [
    { name: "collaborative insert syncs across clients", run: testCollaborativeInsertSyncsAcrossClients },
    { name: "concurrent operations transform against latest version", run: testConcurrentOperationsTransformAgainstLatestVersion },
    { name: "presence cursor and selection propagation", run: testPresenceCursorAndSelectionPropagation },
    { name: "permission manager blocks unauthorized writes", run: testPermissionManagerBlocksUnauthorizedWrites },
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
  console.error("Collaboration MVP test failed:", error);
  process.exit(1);
});
