import type { ActivityEvent, ActivityType, UserPresence } from "./presence-manager";
import type {
  ConflictResolverStats,
  ConflictType,
  OperationConflict,
  ResolutionStrategy,
} from "./advanced-conflict-resolver";
import type { Notification, NotificationType } from "./notification-service";

export interface CollaborationOverview {
  period: { start: Date; end: Date };
  activeUsers: number;
  totalActivities: number;
  totalEdits: number;
  totalComments: number;
  totalConflicts: number;
  conflictRate: number;
  notificationCount: number;
  unreadNotificationCount: number;
  activityByType: Record<ActivityType, number>;
  topDocuments: Array<{
    documentId: string;
    activities: number;
    users: number;
  }>;
  collaborationScore: number;
}

export interface UserContributionInsight {
  userId: string;
  username?: string;
  totalActivities: number;
  edits: number;
  comments: number;
  views: number;
  conflictsInvolved: number;
  notificationsReceived: number;
  unreadNotifications: number;
  activeDocuments: string[];
  contributionScore: number;
}

export interface DocumentCollaborationInsight {
  documentId: string;
  uniqueUsers: number;
  totalActivities: number;
  edits: number;
  comments: number;
  conflicts: number;
  notifications: number;
  activityByType: Partial<Record<ActivityType, number>>;
  hotspots: Array<{ bucket: number; edits: number }>;
}

export interface ConflictInsight {
  totalConflicts: number;
  resolvedConflicts: number;
  unresolvedConflicts: number;
  resolutionRate: number;
  byType: Record<ConflictType, number>;
  byStrategy: Record<ResolutionStrategy, number>;
  byDocument: Record<string, number>;
  averageConfidence: number;
}

export interface NotificationInsight {
  totalNotifications: number;
  unreadNotifications: number;
  byType: Partial<Record<NotificationType, number>>;
  byUser: Record<string, number>;
  averageReadLatencyMs: number;
}

export interface CollaborationReport {
  overview: CollaborationOverview;
  topContributors: UserContributionInsight[];
  documents: DocumentCollaborationInsight[];
  conflicts: ConflictInsight;
  notifications: NotificationInsight;
  recommendations: string[];
}

export class CollaborationAnalytics {
  buildOverview(
    start: Date,
    end: Date,
    activities: ActivityEvent[],
    presences: UserPresence[],
    conflicts: OperationConflict[],
    notifications: Notification[]
  ): CollaborationOverview {
    const scopedActivities = this.filterByPeriod(activities, start, end);
    const scopedConflicts = this.filterConflictsByPeriod(conflicts, start, end);
    const scopedNotifications = this.filterNotificationsByPeriod(notifications, start, end);

    const activityByType = this.emptyActivityCounts();
    const documentUsers = new Map<string, Set<string>>();
    const documentCounts = new Map<string, number>();

    for (const activity of scopedActivities) {
      activityByType[activity.type] += 1;
      if (!documentUsers.has(activity.documentId)) {
        documentUsers.set(activity.documentId, new Set());
      }
      documentUsers.get(activity.documentId)!.add(activity.userId);
      documentCounts.set(activity.documentId, (documentCounts.get(activity.documentId) || 0) + 1);
    }

    const totalEdits = activityByType.edit;
    const totalComments = activityByType.comment;
    const totalConflicts = scopedConflicts.length;
    const activeUsers = new Set(scopedActivities.map((activity) => activity.userId)).size;
    const conflictRate = totalEdits > 0 ? totalConflicts / totalEdits : 0;

    const topDocuments = Array.from(documentCounts.entries())
      .map(([documentId, count]) => ({
        documentId,
        activities: count,
        users: documentUsers.get(documentId)?.size ?? 0,
      }))
      .sort((left, right) => right.activities - left.activities)
      .slice(0, 5);

    return {
      period: { start, end },
      activeUsers,
      totalActivities: scopedActivities.length,
      totalEdits,
      totalComments,
      totalConflicts,
      conflictRate,
      notificationCount: scopedNotifications.length,
      unreadNotificationCount: scopedNotifications.filter((notification) => !notification.readAt).length,
      activityByType,
      topDocuments,
      collaborationScore: this.calculateCollaborationScore(
        activeUsers,
        scopedActivities.length,
        totalConflicts,
        scopedNotifications.length
      ),
    };
  }

  buildUserInsights(
    activities: ActivityEvent[],
    presences: UserPresence[],
    conflicts: OperationConflict[],
    notifications: Notification[]
  ): UserContributionInsight[] {
    const usernameByUserId = new Map<string, string>();
    for (const presence of presences) {
      usernameByUserId.set(presence.userId, presence.username);
    }

    const activityByUser = new Map<string, ActivityEvent[]>();
    for (const activity of activities) {
      const current = activityByUser.get(activity.userId) ?? [];
      current.push(activity);
      activityByUser.set(activity.userId, current);
    }

    const allUserIds = new Set<string>([
      ...activityByUser.keys(),
      ...notifications.map((notification) => notification.userId),
      ...conflicts.flatMap((conflict) => conflict.operations.map((operation) => operation.userId)),
    ]);

    return Array.from(allUserIds)
      .map((userId) => {
        const userActivities = activityByUser.get(userId) ?? [];
        const edits = userActivities.filter((activity) => activity.type === "edit").length;
        const comments = userActivities.filter((activity) => activity.type === "comment").length;
        const views = userActivities.filter((activity) => activity.type === "view").length;
        const userConflicts = conflicts.filter((conflict) =>
          conflict.operations.some((operation) => operation.userId === userId)
        );
        const userNotifications = notifications.filter((notification) => notification.userId === userId);
        const activeDocuments = Array.from(new Set(userActivities.map((activity) => activity.documentId))).filter(Boolean);

        return {
          userId,
          username: usernameByUserId.get(userId),
          totalActivities: userActivities.length,
          edits,
          comments,
          views,
          conflictsInvolved: userConflicts.length,
          notificationsReceived: userNotifications.length,
          unreadNotifications: userNotifications.filter((notification) => !notification.readAt).length,
          activeDocuments,
          contributionScore: this.calculateContributionScore(
            userActivities.length,
            edits,
            comments,
            userConflicts.length,
            activeDocuments.length
          ),
        };
      })
      .sort((left, right) => right.contributionScore - left.contributionScore);
  }

  buildDocumentInsights(
    activities: ActivityEvent[],
    conflicts: OperationConflict[],
    notifications: Notification[]
  ): DocumentCollaborationInsight[] {
    const documentIds = new Set<string>([
      ...activities.map((activity) => activity.documentId),
      ...notifications.map((notification) => notification.resourceId || "").filter(Boolean),
      ...conflicts.flatMap((conflict) => this.extractConflictDocumentIds(conflict)),
    ]);

    return Array.from(documentIds)
      .filter(Boolean)
      .map((documentId) => {
        const documentActivities = activities.filter((activity) => activity.documentId === documentId);
        const documentConflicts = conflicts.filter((conflict) =>
          this.extractConflictDocumentIds(conflict).includes(documentId)
        );
        const documentNotifications = notifications.filter((notification) => notification.resourceId === documentId);
        const activityByType = this.countActivityTypes(documentActivities);
        const hotspots = this.buildEditHotspots(documentActivities);

        return {
          documentId,
          uniqueUsers: new Set(documentActivities.map((activity) => activity.userId)).size,
          totalActivities: documentActivities.length,
          edits: activityByType.edit ?? 0,
          comments: activityByType.comment ?? 0,
          conflicts: documentConflicts.length,
          notifications: documentNotifications.length,
          activityByType,
          hotspots,
        };
      })
      .sort((left, right) => right.totalActivities - left.totalActivities);
  }

  buildConflictInsight(
    conflicts: OperationConflict[],
    stats?: ConflictResolverStats
  ): ConflictInsight {
    const byType: Record<ConflictType, number> = {
      concurrent_edit: 0,
      delete_edit: 0,
      replace_edit: 0,
      semantic: 0,
    };

    const byStrategy: Record<ResolutionStrategy, number> = {
      operational_transform: 0,
      crdt_merge: 0,
      three_way_merge: 0,
      last_write_wins: 0,
      first_write_wins: 0,
      manual: 0,
    };

    const byDocument: Record<string, number> = {};
    const confidences: number[] = [];

    for (const conflict of conflicts) {
      byType[conflict.type] += 1;
      if (conflict.resolution) {
        byStrategy[conflict.resolution.strategy] += 1;
        confidences.push(conflict.resolution.confidence);
      }

      for (const documentId of this.extractConflictDocumentIds(conflict)) {
        byDocument[documentId] = (byDocument[documentId] || 0) + 1;
      }
    }

    const resolvedConflicts = stats?.resolvedConflicts ?? conflicts.filter((conflict) => conflict.resolved).length;
    const unresolvedConflicts = stats?.unresolvedConflicts ?? conflicts.filter((conflict) => !conflict.resolved).length;
    const totalConflicts = stats?.totalConflicts ?? conflicts.length;

    return {
      totalConflicts,
      resolvedConflicts,
      unresolvedConflicts,
      resolutionRate: totalConflicts > 0 ? resolvedConflicts / totalConflicts : 0,
      byType,
      byStrategy,
      byDocument,
      averageConfidence: confidences.length > 0
        ? confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length
        : 0,
    };
  }

  buildNotificationInsight(notifications: Notification[]): NotificationInsight {
    const byType: Partial<Record<NotificationType, number>> = {};
    const byUser: Record<string, number> = {};
    const readLatencies: number[] = [];

    for (const notification of notifications) {
      byType[notification.type] = (byType[notification.type] || 0) + 1;
      byUser[notification.userId] = (byUser[notification.userId] || 0) + 1;

      if (notification.readAt) {
        readLatencies.push(notification.readAt.getTime() - notification.createdAt.getTime());
      }
    }

    return {
      totalNotifications: notifications.length,
      unreadNotifications: notifications.filter((notification) => !notification.readAt).length,
      byType,
      byUser,
      averageReadLatencyMs: readLatencies.length > 0
        ? readLatencies.reduce((sum, latency) => sum + latency, 0) / readLatencies.length
        : 0,
    };
  }

  generateReport(input: {
    start: Date;
    end: Date;
    activities: ActivityEvent[];
    presences: UserPresence[];
    conflicts: OperationConflict[];
    notifications: Notification[];
    conflictStats?: ConflictResolverStats;
  }): CollaborationReport {
    const scopedActivities = this.filterByPeriod(input.activities, input.start, input.end);
    const scopedConflicts = this.filterConflictsByPeriod(input.conflicts, input.start, input.end);
    const scopedNotifications = this.filterNotificationsByPeriod(input.notifications, input.start, input.end);

    const overview = this.buildOverview(
      input.start,
      input.end,
      scopedActivities,
      input.presences,
      scopedConflicts,
      scopedNotifications
    );
    const topContributors = this.buildUserInsights(
      scopedActivities,
      input.presences,
      scopedConflicts,
      scopedNotifications
    ).slice(0, 5);
    const documents = this.buildDocumentInsights(scopedActivities, scopedConflicts, scopedNotifications);
    const conflicts = this.buildConflictInsight(scopedConflicts, input.conflictStats);
    const notifications = this.buildNotificationInsight(scopedNotifications);

    return {
      overview,
      topContributors,
      documents,
      conflicts,
      notifications,
      recommendations: this.buildRecommendations(overview, conflicts, notifications),
    };
  }

  formatReport(report: CollaborationReport): string {
    const lines: string[] = [];

    lines.push("# Collaboration Insight Report");
    lines.push("");
    lines.push(`Period: ${report.overview.period.start.toISOString()} - ${report.overview.period.end.toISOString()}`);
    lines.push(`Active Users: ${report.overview.activeUsers}`);
    lines.push(`Activities: ${report.overview.totalActivities}`);
    lines.push(`Conflicts: ${report.overview.totalConflicts}`);
    lines.push(`Notifications: ${report.overview.notificationCount}`);
    lines.push(`Collaboration Score: ${report.overview.collaborationScore}`);
    lines.push("");
    lines.push("Top Contributors:");
    for (const user of report.topContributors) {
      lines.push(`- ${user.username ?? user.userId}: score ${user.contributionScore}, edits ${user.edits}, comments ${user.comments}`);
    }
    lines.push("");
    lines.push("Recommendations:");
    for (const recommendation of report.recommendations) {
      lines.push(`- ${recommendation}`);
    }

    return lines.join("\n");
  }

  private filterByPeriod(activities: ActivityEvent[], start: Date, end: Date): ActivityEvent[] {
    return activities.filter((activity) => activity.timestamp >= start && activity.timestamp <= end);
  }

  private filterConflictsByPeriod(conflicts: OperationConflict[], start: Date, end: Date): OperationConflict[] {
    return conflicts.filter((conflict) => {
      const detectedAt = new Date(conflict.detectedAt);
      return detectedAt >= start && detectedAt <= end;
    });
  }

  private filterNotificationsByPeriod(notifications: Notification[], start: Date, end: Date): Notification[] {
    return notifications.filter((notification) => notification.createdAt >= start && notification.createdAt <= end);
  }

  private emptyActivityCounts(): Record<ActivityType, number> {
    return {
      cursor: 0,
      selection: 0,
      edit: 0,
      view: 0,
      join: 0,
      leave: 0,
      comment: 0,
      conflict: 0,
      sync: 0,
    };
  }

  private countActivityTypes(activities: ActivityEvent[]): Partial<Record<ActivityType, number>> {
    const counts: Partial<Record<ActivityType, number>> = {};
    for (const activity of activities) {
      counts[activity.type] = (counts[activity.type] || 0) + 1;
    }
    return counts;
  }

  private buildEditHotspots(activities: ActivityEvent[]): Array<{ bucket: number; edits: number }> {
    const hotspots = new Map<number, number>();
    for (const activity of activities) {
      if (activity.type !== "edit") {
        continue;
      }

      const position = this.extractOperationPosition(activity.data);
      if (position === undefined) {
        continue;
      }

      const bucket = Math.floor(position / 50) * 50;
      hotspots.set(bucket, (hotspots.get(bucket) || 0) + 1);
    }

    return Array.from(hotspots.entries())
      .map(([bucket, edits]) => ({ bucket, edits }))
      .sort((left, right) => right.edits - left.edits)
      .slice(0, 5);
  }

  private extractOperationPosition(data: unknown): number | undefined {
    if (!data || typeof data !== "object") {
      return undefined;
    }

    const candidate = data as { position?: unknown };
    return typeof candidate.position === "number" ? candidate.position : undefined;
  }

  private extractConflictDocumentIds(conflict: OperationConflict): string[] {
    return Array.from(
      new Set(
        conflict.operations
          .map((operation) => {
            const candidate = operation as { metadata?: { documentId?: string } };
            return candidate.metadata?.documentId;
          })
          .filter((documentId): documentId is string => typeof documentId === "string" && documentId.length > 0)
      )
    );
  }

  private calculateCollaborationScore(
    activeUsers: number,
    totalActivities: number,
    totalConflicts: number,
    notificationCount: number
  ): number {
    if (activeUsers === 0 || totalActivities === 0) {
      return 0;
    }

    const activityScore = Math.min((totalActivities / activeUsers) * 4, 45);
    const conflictPenalty = Math.min(totalConflicts * 5, 25);
    const responsivenessScore = Math.min(notificationCount * 2, 20);
    const breadthScore = Math.min(activeUsers * 2, 20);

    return Math.max(0, Math.round(activityScore + responsivenessScore + breadthScore - conflictPenalty));
  }

  private calculateContributionScore(
    totalActivities: number,
    edits: number,
    comments: number,
    conflicts: number,
    documents: number
  ): number {
    const activityScore = Math.min(totalActivities * 3, 35);
    const editScore = Math.min(edits * 4, 30);
    const commentScore = Math.min(comments * 5, 20);
    const breadthScore = Math.min(documents * 5, 15);
    const conflictPenalty = Math.min(conflicts * 4, 20);

    return Math.max(0, Math.round(activityScore + editScore + commentScore + breadthScore - conflictPenalty));
  }

  private buildRecommendations(
    overview: CollaborationOverview,
    conflicts: ConflictInsight,
    notifications: NotificationInsight
  ): string[] {
    const recommendations: string[] = [];

    if (conflicts.resolutionRate < 0.7 && conflicts.totalConflicts > 0) {
      recommendations.push("Increase review bandwidth around contested documents to improve conflict resolution rate.");
    }

    if (overview.conflictRate > 0.3) {
      recommendations.push("Hot documents show elevated edit contention; consider temporary locks or ownership rotation.");
    }

    if (notifications.unreadNotifications > 0) {
      recommendations.push("Unread collaboration notifications are accumulating; encourage triage to reduce response lag.");
    }

    if (overview.activeUsers <= 1 && overview.totalActivities > 0) {
      recommendations.push("Activity is concentrated in a single contributor; pair review or handoff could improve resilience.");
    }

    if (recommendations.length === 0) {
      recommendations.push("Collaboration signals look healthy; continue tracking conflict and notification trends for drift.");
    }

    return recommendations;
  }
}
