import assert from "node:assert";
import {
  CollaborationClient,
  CollaborationServer,
} from "../collaboration-server";
import { NotificationService, InAppNotificationHandler } from "../notification-service";
import { PermissionManager } from "../permission-manager";

async function testCommentAndMentionNotificationsReachRecipients(): Promise<void> {
  const notificationService = new NotificationService();
  const inApp = new InAppNotificationHandler();
  notificationService.registerHandler("in-app", inApp);

  const permissionManager = new PermissionManager();
  const server = new CollaborationServer({ notificationService, permissionManager });

  try {
    permissionManager.grantPermission("alice", "doc-notify-1", "document", "editor", "system");
    permissionManager.grantPermission("bob", "doc-notify-1", "document", "editor", "system");
    permissionManager.grantPermission("carol", "doc-notify-1", "document", "editor", "system");

    const alice = new CollaborationClient(server, "alice", "Alice", "doc-notify-1");
    const bob = new CollaborationClient(server, "bob", "Bob", "doc-notify-1");
    const carol = new CollaborationClient(server, "carol", "Carol", "doc-notify-1");

    alice.connect("Plan");
    bob.connect();
    carol.connect();

    bob.addComment("Please review this @alice and @carol");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const aliceNotifications = notificationService.getUserNotifications("alice");
    const carolNotifications = notificationService.getUserNotifications("carol");
    const bobNotifications = notificationService.getUserNotifications("bob");

    assert.equal(aliceNotifications.some((notification) => notification.type === "comment"), true);
    assert.equal(aliceNotifications.some((notification) => notification.type === "mention"), true);
    assert.equal(carolNotifications.some((notification) => notification.type === "comment"), true);
    assert.equal(carolNotifications.some((notification) => notification.type === "mention"), true);
    assert.equal(bobNotifications.length, 0);

    alice.disconnect();
    bob.disconnect();
    carol.disconnect();
  } finally {
    server.close();
    permissionManager.destroy();
    notificationService.destroy();
  }
}

async function testConflictNotificationAndUnreadInbox(): Promise<void> {
  const notificationService = new NotificationService();
  const inApp = new InAppNotificationHandler();
  notificationService.registerHandler("in-app", inApp);

  const server = new CollaborationServer({ notificationService });

  try {
    const alice = new CollaborationClient(server, "alice", "Alice", "doc-notify-2");
    const bob = new CollaborationClient(server, "bob", "Bob", "doc-notify-2");

    alice.connect("AB");
    bob.connect();

    alice.sendOperation({
      type: "insert",
      position: 1,
      content: "X",
      baseVersion: 0,
    });

    bob.sendOperation({
      type: "insert",
      position: 1,
      content: "Y",
      baseVersion: 0,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const aliceNotifications = notificationService.getUserNotifications("alice");
    assert.equal(aliceNotifications.some((notification) => notification.type === "conflict"), true);
    assert.equal(notificationService.getUnreadCount("alice") > 0, true);

    const firstConflict = aliceNotifications.find((notification) => notification.type === "conflict");
    assert.ok(firstConflict);
    notificationService.markAsRead(firstConflict!.id);
    assert.equal(notificationService.getUnreadCount("alice"), aliceNotifications.length - 1);

    alice.disconnect();
    bob.disconnect();
  } finally {
    server.close();
    notificationService.destroy();
  }
}

async function testLockNotificationsBroadcastToCollaborators(): Promise<void> {
  const notificationService = new NotificationService();
  const inApp = new InAppNotificationHandler();
  notificationService.registerHandler("in-app", inApp);

  const permissionManager = new PermissionManager();
  const server = new CollaborationServer({ notificationService, permissionManager });

  try {
    permissionManager.grantPermission("alice", "doc-notify-3", "document", "editor", "system");
    permissionManager.grantPermission("bob", "doc-notify-3", "document", "editor", "system");

    const alice = new CollaborationClient(server, "alice", "Alice", "doc-notify-3");
    const bob = new CollaborationClient(server, "bob", "Bob", "doc-notify-3");

    alice.connect("Draft");
    bob.connect();

    alice.lockDocument(60000);
    alice.renewDocumentLock(60000);
    alice.unlockDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const bobNotifications = notificationService.getUserNotifications("bob");
    const actions = bobNotifications
      .filter((notification) => notification.type === "lock")
      .map((notification) => notification.metadata?.action);

    assert.deepEqual(actions.slice().sort(), ["locked", "renewed", "unlocked"].sort());

    alice.disconnect();
    bob.disconnect();
  } finally {
    server.close();
    permissionManager.destroy();
    notificationService.destroy();
  }
}

async function main() {
  console.log("=== Collaboration Notifications MVP Test ===\n");

  const tests: Array<{ name: string; run: () => Promise<void> }> = [
    { name: "comment and mention notifications reach recipients", run: testCommentAndMentionNotificationsReachRecipients },
    { name: "conflict notification and unread inbox", run: testConflictNotificationAndUnreadInbox },
    { name: "lock notifications broadcast to collaborators", run: testLockNotificationsBroadcastToCollaborators },
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
  console.error("Collaboration notifications MVP test failed:", error);
  process.exit(1);
});
