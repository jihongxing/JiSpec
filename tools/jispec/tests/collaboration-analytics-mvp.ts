import assert from "node:assert";
import { CollaborationAnalytics } from "../collaboration-analytics";
import type { ActivityEvent, UserPresence } from "../presence-manager";
import type { Notification } from "../notification-service";
import type { OperationConflict } from "../advanced-conflict-resolver";

function buildActivity(
  id: string,
  userId: string,
  type: ActivityEvent["type"],
  documentId: string,
  timestamp: string,
  data?: unknown
): ActivityEvent {
  return {
    id,
    sequence: parseInt(id.replace(/\D/g, ""), 10) || 1,
    userId,
    type,
    documentId,
    timestamp: new Date(timestamp),
    data,
  };
}

function buildNotification(
  id: string,
  userId: string,
  type: Notification["type"],
  createdAt: string,
  resourceId?: string,
  readAt?: string
): Notification {
  return {
    id,
    userId,
    type,
    title: `${type} title`,
    message: `${type} message`,
    priority: type === "conflict" ? "high" : "normal",
    channels: ["in-app"],
    createdAt: new Date(createdAt),
    readAt: readAt ? new Date(readAt) : undefined,
    resourceId,
    resourceType: "document",
    metadata: {},
  };
}

function buildConflict(
  id: string,
  type: OperationConflict["type"],
  detectedAt: string,
  documentId: string,
  resolved = true
): OperationConflict {
  return {
    id,
    type,
    detectedAt,
    resolved,
    operations: [
      {
        id: `${id}-op1`,
        userId: "alice",
        type: "insert",
        position: 1,
        content: "X",
        baseVersion: 0,
        timestamp: detectedAt,
        metadata: { documentId },
      } as OperationConflict["operations"][number],
      {
        id: `${id}-op2`,
        userId: "bob",
        type: "insert",
        position: 1,
        content: "Y",
        baseVersion: 0,
        timestamp: detectedAt,
        metadata: { documentId },
      } as OperationConflict["operations"][number],
    ],
    resolution: resolved
      ? {
          strategy: "operational_transform",
          mergedOperation: {
            id: `${id}-merged`,
            userId: "system",
            type: "insert",
            position: 2,
            content: "Y",
            baseVersion: 0,
            timestamp: new Date(new Date(detectedAt).getTime() + 500).toISOString(),
          },
          confidence: 0.9,
          rationale: "Merged",
          resolvedAt: new Date(new Date(detectedAt).getTime() + 500).toISOString(),
        }
      : undefined,
  };
}

async function testAnalyticsBuildsOverviewAndContributorRankings(): Promise<void> {
  const analytics = new CollaborationAnalytics();
  const start = new Date("2026-04-27T09:00:00.000Z");
  const end = new Date("2026-04-27T10:00:00.000Z");

  const activities: ActivityEvent[] = [
    buildActivity("a1", "alice", "join", "doc-1", "2026-04-27T09:01:00.000Z"),
    buildActivity("a2", "alice", "edit", "doc-1", "2026-04-27T09:02:00.000Z", { position: 10 }),
    buildActivity("a3", "bob", "edit", "doc-1", "2026-04-27T09:03:00.000Z", { position: 11 }),
    buildActivity("a4", "alice", "comment", "doc-1", "2026-04-27T09:04:00.000Z"),
    buildActivity("a5", "carol", "view", "doc-2", "2026-04-27T09:05:00.000Z"),
  ];

  const presences: UserPresence[] = [
    { userId: "alice", username: "Alice", status: "online", currentDocument: "doc-1", lastActivity: new Date("2026-04-27T09:10:00.000Z") },
    { userId: "bob", username: "Bob", status: "busy", currentDocument: "doc-1", lastActivity: new Date("2026-04-27T09:10:00.000Z") },
    { userId: "carol", username: "Carol", status: "away", currentDocument: "doc-2", lastActivity: new Date("2026-04-27T09:10:00.000Z") },
  ];

  const conflicts = [buildConflict("c1", "concurrent_edit", "2026-04-27T09:06:00.000Z", "doc-1")];
  const notifications = [
    buildNotification("n1", "alice", "comment", "2026-04-27T09:04:30.000Z", "doc-1", "2026-04-27T09:05:00.000Z"),
    buildNotification("n2", "bob", "conflict", "2026-04-27T09:06:30.000Z", "doc-1"),
  ];

  const report = analytics.generateReport({
    start,
    end,
    activities,
    presences,
    conflicts,
    notifications,
  });

  assert.equal(report.overview.totalActivities, 5);
  assert.equal(report.overview.totalEdits, 2);
  assert.equal(report.overview.totalConflicts, 1);
  assert.equal(report.overview.topDocuments[0].documentId, "doc-1");
  assert.equal(report.topContributors[0].userId, "alice");
  assert.equal(report.documents[0].documentId, "doc-1");
}

async function testAnalyticsCapturesConflictAndNotificationInsights(): Promise<void> {
  const analytics = new CollaborationAnalytics();
  const conflicts = [
    buildConflict("c1", "concurrent_edit", "2026-04-27T09:06:00.000Z", "doc-1"),
    buildConflict("c2", "replace_edit", "2026-04-27T09:07:00.000Z", "doc-2", false),
  ];
  const notifications = [
    buildNotification("n1", "alice", "comment", "2026-04-27T09:04:30.000Z", "doc-1", "2026-04-27T09:05:00.000Z"),
    buildNotification("n2", "alice", "mention", "2026-04-27T09:05:30.000Z", "doc-1"),
    buildNotification("n3", "bob", "conflict", "2026-04-27T09:06:30.000Z", "doc-2", "2026-04-27T09:07:30.000Z"),
  ];

  const conflictInsight = analytics.buildConflictInsight(conflicts);
  const notificationInsight = analytics.buildNotificationInsight(notifications);

  assert.equal(conflictInsight.totalConflicts, 2);
  assert.equal(conflictInsight.resolvedConflicts, 1);
  assert.equal(conflictInsight.byType.concurrent_edit, 1);
  assert.equal(conflictInsight.byType.replace_edit, 1);
  assert.equal(notificationInsight.totalNotifications, 3);
  assert.equal(notificationInsight.unreadNotifications, 1);
  assert.equal(notificationInsight.byType.mention, 1);
  assert.equal(notificationInsight.averageReadLatencyMs > 0, true);
}

async function testAnalyticsFormatsReportAndRecommendations(): Promise<void> {
  const analytics = new CollaborationAnalytics();
  const start = new Date("2026-04-27T09:00:00.000Z");
  const end = new Date("2026-04-27T10:00:00.000Z");

  const report = analytics.generateReport({
    start,
    end,
    activities: [
      buildActivity("a1", "alice", "edit", "doc-1", "2026-04-27T09:02:00.000Z", { position: 10 }),
      buildActivity("a2", "alice", "edit", "doc-1", "2026-04-27T09:03:00.000Z", { position: 20 }),
      buildActivity("a3", "alice", "comment", "doc-1", "2026-04-27T09:04:00.000Z"),
    ],
    presences: [
      { userId: "alice", username: "Alice", status: "online", currentDocument: "doc-1", lastActivity: new Date("2026-04-27T09:10:00.000Z") },
    ],
    conflicts: [buildConflict("c1", "concurrent_edit", "2026-04-27T09:06:00.000Z", "doc-1", false)],
    notifications: [buildNotification("n1", "alice", "conflict", "2026-04-27T09:06:30.000Z", "doc-1")],
  });

  const formatted = analytics.formatReport(report);

  assert.equal(report.recommendations.length > 0, true);
  assert.equal(formatted.includes("Collaboration Insight Report"), true);
  assert.equal(formatted.includes("Recommendations:"), true);
}

async function main() {
  console.log("=== Collaboration Analytics MVP Test ===\n");

  const tests: Array<{ name: string; run: () => Promise<void> }> = [
    { name: "analytics builds overview and contributor rankings", run: testAnalyticsBuildsOverviewAndContributorRankings },
    { name: "analytics captures conflict and notification insights", run: testAnalyticsCapturesConflictAndNotificationInsights },
    { name: "analytics formats report and recommendations", run: testAnalyticsFormatsReportAndRecommendations },
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
  console.error("Collaboration analytics MVP test failed:", error);
  process.exit(1);
});
