import { EventEmitter } from "events";

/**
 * 用户状态
 */
export type UserStatus = "online" | "away" | "busy" | "offline";

/**
 * 活动类型
 */
export type ActivityType =
  | "cursor"
  | "selection"
  | "edit"
  | "view"
  | "join"
  | "leave"
  | "comment"
  | "conflict"
  | "sync";

/**
 * 光标位置
 */
export interface CursorPosition {
  line: number;
  column: number;
  documentId: string;
}

/**
 * 选区
 */
export interface Selection {
  start: { line: number; column: number };
  end: { line: number; column: number };
  documentId: string;
}

/**
 * 用户在线状态
 */
export interface UserPresence {
  userId: string;
  username: string;
  status: UserStatus;
  cursor?: CursorPosition;
  selection?: Selection;
  currentDocument?: string;
  lastActivity: Date;
  metadata?: Record<string, any>;
}

/**
 * 活动事件
 */
export interface ActivityEvent {
  id: string;
  sequence: number;
  userId: string;
  type: ActivityType;
  documentId: string;
  timestamp: Date;
  data?: unknown;
}

export interface ActivityQuery {
  documentId?: string;
  userId?: string;
  types?: ActivityType[];
  since?: Date;
  limit?: number;
}

export interface PresenceSnapshot {
  generatedAt: Date;
  documentId?: string;
  totalUsers: number;
  statusCounts: Record<UserStatus, number>;
  users: UserPresence[];
}

export interface AwarenessStats {
  documentId?: string;
  totalUsers: number;
  onlineUsers: number;
  awayUsers: number;
  busyUsers: number;
  activityCount: number;
  recentActivityRate: number;
  uniqueDocuments: number;
  byDocument: Record<string, number>;
  activityByType: Record<ActivityType, number>;
  activeDocuments: Array<{
    documentId: string;
    users: number;
    activities: number;
  }>;
}

/**
 * 在线状态管理器
 */
export class PresenceManager extends EventEmitter {
  private presences: Map<string, UserPresence> = new Map();
  private activities: ActivityEvent[] = [];
  private maxActivityHistory: number = 1000;
  private awayTimeout: number = 300000; // 5 分钟
  private offlineTimeout: number = 600000; // 10 分钟
  private checkInterval: NodeJS.Timeout | null = null;
  private activitySequence = 0;

  constructor(
    awayTimeout: number = 300000,
    offlineTimeout: number = 600000
  ) {
    super();
    this.awayTimeout = awayTimeout;
    this.offlineTimeout = offlineTimeout;
    this.startStatusCheck();
  }

  /**
   * 用户上线
   */
  userOnline(userId: string, username: string, metadata?: Record<string, any>): UserPresence {
    const currentDocument = typeof metadata?.documentId === "string" ? metadata.documentId : undefined;
    const presence: UserPresence = {
      userId,
      username,
      status: "online",
      currentDocument,
      lastActivity: new Date(),
      metadata,
    };

    this.presences.set(userId, presence);
    this.appendActivity(this.createActivity(userId, "join", currentDocument ?? "", metadata));

    const snapshot = this.clonePresence(presence);
    this.emit("user:online", snapshot);
    return snapshot;
  }

  /**
   * 用户离线
   */
  userOffline(userId: string): void {
    const presence = this.presences.get(userId);
    if (!presence) {
      return;
    }

    presence.status = "offline";
    presence.lastActivity = new Date();
    this.appendActivity(this.createActivity(userId, "leave", presence.currentDocument || ""));

    this.emit("user:offline", this.clonePresence(presence));
    this.presences.delete(userId);
  }

  /**
   * 更新用户状态
   */
  updateStatus(userId: string, status: UserStatus): void {
    const presence = this.presences.get(userId);
    if (!presence) {
      return;
    }

    const oldStatus = presence.status;
    presence.status = status;
    presence.lastActivity = new Date();

    this.emit("status:changed", this.clonePresence(presence), oldStatus);
  }

  /**
   * 更新光标位置
   */
  updateCursor(userId: string, cursor: CursorPosition): void {
    const presence = this.presences.get(userId);
    if (!presence) {
      return;
    }

    presence.cursor = { ...cursor };
    presence.currentDocument = cursor.documentId;
    presence.lastActivity = new Date();

    this.appendActivity(this.createActivity(userId, "cursor", cursor.documentId, cursor));
    this.emit("cursor:updated", this.clonePresence(presence));
  }

  /**
   * 更新选区
   */
  updateSelection(userId: string, selection: Selection): void {
    const presence = this.presences.get(userId);
    if (!presence) {
      return;
    }

    presence.selection = {
      ...selection,
      start: { ...selection.start },
      end: { ...selection.end },
    };
    presence.currentDocument = selection.documentId;
    presence.lastActivity = new Date();

    this.appendActivity(this.createActivity(userId, "selection", selection.documentId, selection));
    this.emit("selection:updated", this.clonePresence(presence));
  }

  /**
   * 记录编辑活动
   */
  recordEdit(userId: string, documentId: string, data?: unknown): ActivityEvent {
    const activity = this.recordActivityEvent(userId, "edit", documentId, data);
    this.emit("edit:recorded", userId, documentId, this.cloneActivity(activity));
    return activity;
  }

  /**
   * 记录查看活动
   */
  recordView(userId: string, documentId: string, data?: unknown): ActivityEvent {
    const activity = this.recordActivityEvent(userId, "view", documentId, data);
    this.emit("view:recorded", userId, documentId, this.cloneActivity(activity));
    return activity;
  }

  /**
   * 记录评论活动
   */
  recordComment(userId: string, documentId: string, data?: unknown): ActivityEvent {
    const activity = this.recordActivityEvent(userId, "comment", documentId, data);
    this.emit("comment:recorded", userId, documentId, this.cloneActivity(activity));
    return activity;
  }

  /**
   * 记录冲突活动
   */
  recordConflict(userId: string, documentId: string, data?: unknown): ActivityEvent {
    const activity = this.recordActivityEvent(userId, "conflict", documentId, data);
    this.emit("conflict:recorded", userId, documentId, this.cloneActivity(activity));
    return activity;
  }

  /**
   * 记录同步活动
   */
  recordSync(userId: string, documentId: string, data?: unknown): ActivityEvent {
    const activity = this.recordActivityEvent(userId, "sync", documentId, data);
    this.emit("sync:recorded", userId, documentId, this.cloneActivity(activity));
    return activity;
  }

  /**
   * 通用活动记录入口
   */
  recordActivityEvent(
    userId: string,
    type: ActivityType,
    documentId: string,
    data?: unknown
  ): ActivityEvent {
    const presence = this.presences.get(userId);
    if (presence) {
      presence.lastActivity = new Date();
      if (documentId) {
        presence.currentDocument = documentId;
      }
    }

    const activity = this.createActivity(userId, type, documentId, data);
    this.appendActivity(activity);
    return activity;
  }

  /**
   * 获取用户在线状态
   */
  getPresence(userId: string): UserPresence | undefined {
    const presence = this.presences.get(userId);
    return presence ? this.clonePresence(presence) : undefined;
  }

  /**
   * 获取所有在线用户
   */
  getOnlineUsers(): UserPresence[] {
    return Array.from(this.presences.values())
      .filter(presence => presence.status === "online")
      .map((presence) => this.clonePresence(presence));
  }

  /**
   * 获取文档的在线用户
   */
  getDocumentUsers(documentId: string): UserPresence[] {
    return Array.from(this.presences.values())
      .filter((presence) => presence.currentDocument === documentId)
      .map((presence) => this.clonePresence(presence));
  }

  /**
   * 获取在线状态快照
   */
  getPresenceSnapshot(documentId?: string): PresenceSnapshot {
    const users = Array.from(this.presences.values())
      .filter((presence) => !documentId || presence.currentDocument === documentId)
      .map((presence) => this.clonePresence(presence));

    const statusCounts: Record<UserStatus, number> = {
      online: 0,
      away: 0,
      busy: 0,
      offline: 0,
    };

    for (const user of users) {
      statusCounts[user.status] += 1;
    }

    return {
      generatedAt: new Date(),
      documentId,
      totalUsers: users.length,
      statusCounts,
      users,
    };
  }

  /**
   * 获取活动流
   */
  getActivityFeed(query: ActivityQuery = {}): ActivityEvent[] {
    let activities = this.activities.filter((activity) => {
      if (query.documentId && activity.documentId !== query.documentId) {
        return false;
      }
      if (query.userId && activity.userId !== query.userId) {
        return false;
      }
      if (query.types && !query.types.includes(activity.type)) {
        return false;
      }
      if (query.since && activity.timestamp.getTime() < query.since.getTime()) {
        return false;
      }
      return true;
    });

    if (query.limit !== undefined) {
      activities = activities.slice(-query.limit);
    }

    return activities.map((activity) => this.cloneActivity(activity));
  }

  /**
   * 获取用户活动历史
   */
  getUserActivities(userId: string, limit?: number): ActivityEvent[] {
    return this.getActivityFeed({ userId, limit });
  }

  /**
   * 获取文档活动历史
   */
  getDocumentActivities(documentId: string, limit?: number): ActivityEvent[] {
    return this.getActivityFeed({ documentId, limit });
  }

  /**
   * 获取文档编辑时间线
   */
  getDocumentOperationTimeline(documentId: string, limit?: number): ActivityEvent[] {
    return this.getActivityFeed({
      documentId,
      limit,
      types: ["edit"],
    });
  }

  /**
   * 获取最近活动
   */
  getRecentActivities(limit: number = 50): ActivityEvent[] {
    return this.getActivityFeed({ limit });
  }

  /**
   * 获取协作感知统计
   */
  getAwarenessStats(documentId?: string): AwarenessStats {
    const relevantPresences = Array.from(this.presences.values()).filter(
      (presence) => !documentId || presence.currentDocument === documentId
    );
    const relevantActivities = this.getActivityFeed(documentId ? { documentId } : {});

    const byDocument: Record<string, number> = {};
    for (const presence of relevantPresences) {
      if (presence.currentDocument) {
        byDocument[presence.currentDocument] = (byDocument[presence.currentDocument] || 0) + 1;
      }
    }

    const activityByType: Record<ActivityType, number> = {
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

    const documentActivityCount = new Map<string, number>();
    for (const activity of relevantActivities) {
      activityByType[activity.type] += 1;
      if (activity.documentId) {
        documentActivityCount.set(
          activity.documentId,
          (documentActivityCount.get(activity.documentId) || 0) + 1
        );
      }
    }

    const activeDocuments = Array.from(documentActivityCount.entries())
      .map(([currentDocument, activities]) => ({
        documentId: currentDocument,
        users: byDocument[currentDocument] || 0,
        activities,
      }))
      .sort((left, right) => right.activities - left.activities);

    const fiveMinutesAgo = Date.now() - 300000;
    const recentActivityRate =
      relevantActivities.filter(
        (activity) => activity.timestamp.getTime() >= fiveMinutesAgo
      ).length / 5;

    return {
      documentId,
      totalUsers: relevantPresences.length,
      onlineUsers: relevantPresences.filter((presence) => presence.status === "online").length,
      awayUsers: relevantPresences.filter((presence) => presence.status === "away").length,
      busyUsers: relevantPresences.filter((presence) => presence.status === "busy").length,
      activityCount: relevantActivities.length,
      recentActivityRate,
      uniqueDocuments: new Set(
        relevantActivities
          .map((activity) => activity.documentId)
          .concat(relevantPresences.map((presence) => presence.currentDocument || ""))
          .filter(Boolean)
      ).size,
      byDocument,
      activityByType,
      activeDocuments,
    };
  }

  /**
   * 启动状态检查
   */
  private startStatusCheck(): void {
    if (this.checkInterval) {
      return;
    }

    this.checkInterval = setInterval(() => {
      this.checkUserStatus();
    }, 60000); // 每分钟检查一次
  }

  /**
   * 停止状态检查
   */
  stopStatusCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * 检查用户状态
   */
  private checkUserStatus(): void {
    const now = Date.now();

    for (const [userId, presence] of this.presences) {
      const inactiveTime = now - presence.lastActivity.getTime();

      if (inactiveTime >= this.offlineTimeout) {
        this.userOffline(userId);
      } else if (inactiveTime >= this.awayTimeout && presence.status === "online") {
        this.updateStatus(userId, "away");
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalUsers: number;
    onlineUsers: number;
    awayUsers: number;
    busyUsers: number;
    byDocument: Record<string, number>;
    activityCount: number;
    recentActivityRate: number;
  } {
    const stats = this.getAwarenessStats();

    return {
      totalUsers: stats.totalUsers,
      onlineUsers: stats.onlineUsers,
      awayUsers: stats.awayUsers,
      busyUsers: stats.busyUsers,
      byDocument: stats.byDocument,
      activityCount: stats.activityCount,
      recentActivityRate: stats.recentActivityRate,
    };
  }

  /**
   * 清理旧活动
   */
  cleanupOldActivities(maxAge: number = 86400000): void {
    const cutoff = Date.now() - maxAge;
    this.activities = this.activities.filter(
      activity => activity.timestamp.getTime() >= cutoff
    );
  }

  /**
   * 获取用户协作关系
   */
  getCollaborationGraph(): {
    users: string[];
    edges: Array<{ from: string; to: string; weight: number }>;
  } {
    const users = Array.from(this.presences.keys());
    const edges: Array<{ from: string; to: string; weight: number }> = [];
    const collaborations = new Map<string, number>();

    for (const activity of this.activities) {
      if (activity.type === "edit" || activity.type === "view" || activity.type === "comment") {
        const documentUsers = this.getDocumentUsers(activity.documentId);
        for (const user of documentUsers) {
          if (user.userId !== activity.userId) {
            const key = [activity.userId, user.userId].sort().join("-");
            collaborations.set(key, (collaborations.get(key) || 0) + 1);
          }
        }
      }
    }

    for (const [key, weight] of collaborations) {
      const [from, to] = key.split("-");
      edges.push({ from, to, weight });
    }

    return { users, edges };
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.stopStatusCheck();
    this.presences.clear();
    this.activities = [];
    this.activitySequence = 0;
    this.removeAllListeners();
  }

  private createActivity(
    userId: string,
    type: ActivityType,
    documentId: string,
    data?: unknown
  ): ActivityEvent {
    return {
      id: `activity-${Date.now()}-${Math.random()}`,
      sequence: ++this.activitySequence,
      userId,
      type,
      documentId,
      timestamp: new Date(),
      data,
    };
  }

  private appendActivity(activity: ActivityEvent): void {
    this.activities.push(activity);

    if (this.activities.length > this.maxActivityHistory) {
      this.activities.shift();
    }

    this.emit("activity:recorded", this.cloneActivity(activity));
  }

  private clonePresence(presence: UserPresence): UserPresence {
    return {
      ...presence,
      cursor: presence.cursor ? { ...presence.cursor } : undefined,
      selection: presence.selection
        ? {
            ...presence.selection,
            start: { ...presence.selection.start },
            end: { ...presence.selection.end },
          }
        : undefined,
      lastActivity: new Date(presence.lastActivity),
      metadata: presence.metadata ? { ...presence.metadata } : undefined,
    };
  }

  private cloneActivity(activity: ActivityEvent): ActivityEvent {
    return {
      ...activity,
      timestamp: new Date(activity.timestamp),
      data: this.cloneData(activity.data),
    };
  }

  private cloneData(data: unknown): unknown {
    if (data === undefined || data === null) {
      return data;
    }

    if (typeof data !== "object") {
      return data;
    }

    return JSON.parse(JSON.stringify(data));
  }
}
