import { EventEmitter } from "events";

/**
 * 用户状态
 */
export type UserStatus = "online" | "away" | "busy" | "offline";

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
  userId: string;
  type: "cursor" | "selection" | "edit" | "view" | "join" | "leave";
  documentId: string;
  timestamp: Date;
  data?: any;
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
    const presence: UserPresence = {
      userId,
      username,
      status: "online",
      lastActivity: new Date(),
      metadata,
    };

    this.presences.set(userId, presence);
    this.recordActivity({
      id: `activity-${Date.now()}-${Math.random()}`,
      userId,
      type: "join",
      documentId: "",
      timestamp: new Date(),
    });

    this.emit("user:online", presence);
    return presence;
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
    this.recordActivity({
      id: `activity-${Date.now()}-${Math.random()}`,
      userId,
      type: "leave",
      documentId: presence.currentDocument || "",
      timestamp: new Date(),
    });

    this.emit("user:offline", presence);
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

    this.emit("status:changed", presence, oldStatus);
  }

  /**
   * 更新光标位置
   */
  updateCursor(userId: string, cursor: CursorPosition): void {
    const presence = this.presences.get(userId);
    if (!presence) {
      return;
    }

    presence.cursor = cursor;
    presence.currentDocument = cursor.documentId;
    presence.lastActivity = new Date();

    this.recordActivity({
      id: `activity-${Date.now()}-${Math.random()}`,
      userId,
      type: "cursor",
      documentId: cursor.documentId,
      timestamp: new Date(),
      data: cursor,
    });

    this.emit("cursor:updated", presence);
  }

  /**
   * 更新选区
   */
  updateSelection(userId: string, selection: Selection): void {
    const presence = this.presences.get(userId);
    if (!presence) {
      return;
    }

    presence.selection = selection;
    presence.currentDocument = selection.documentId;
    presence.lastActivity = new Date();

    this.recordActivity({
      id: `activity-${Date.now()}-${Math.random()}`,
      userId,
      type: "selection",
      documentId: selection.documentId,
      timestamp: new Date(),
      data: selection,
    });

    this.emit("selection:updated", presence);
  }

  /**
   * 记录编辑活动
   */
  recordEdit(userId: string, documentId: string, data?: any): void {
    const presence = this.presences.get(userId);
    if (presence) {
      presence.lastActivity = new Date();
      presence.currentDocument = documentId;
    }

    this.recordActivity({
      id: `activity-${Date.now()}-${Math.random()}`,
      userId,
      type: "edit",
      documentId,
      timestamp: new Date(),
      data,
    });

    this.emit("edit:recorded", userId, documentId);
  }

  /**
   * 记录查看活动
   */
  recordView(userId: string, documentId: string): void {
    const presence = this.presences.get(userId);
    if (presence) {
      presence.lastActivity = new Date();
      presence.currentDocument = documentId;
    }

    this.recordActivity({
      id: `activity-${Date.now()}-${Math.random()}`,
      userId,
      type: "view",
      documentId,
      timestamp: new Date(),
    });

    this.emit("view:recorded", userId, documentId);
  }

  /**
   * 记录活动
   */
  private recordActivity(activity: ActivityEvent): void {
    this.activities.push(activity);

    if (this.activities.length > this.maxActivityHistory) {
      this.activities.shift();
    }
  }

  /**
   * 获取用户在线状态
   */
  getPresence(userId: string): UserPresence | undefined {
    return this.presences.get(userId);
  }

  /**
   * 获取所有在线用户
   */
  getOnlineUsers(): UserPresence[] {
    return Array.from(this.presences.values()).filter(p => p.status === "online");
  }

  /**
   * 获取文档的在线用户
   */
  getDocumentUsers(documentId: string): UserPresence[] {
    return Array.from(this.presences.values()).filter(
      p => p.currentDocument === documentId
    );
  }

  /**
   * 获取用户活动历史
   */
  getUserActivities(userId: string, limit?: number): ActivityEvent[] {
    const activities = this.activities.filter(a => a.userId === userId);
    if (limit) {
      return activities.slice(-limit);
    }
    return activities;
  }

  /**
   * 获取文档活动历史
   */
  getDocumentActivities(documentId: string, limit?: number): ActivityEvent[] {
    const activities = this.activities.filter(a => a.documentId === documentId);
    if (limit) {
      return activities.slice(-limit);
    }
    return activities;
  }

  /**
   * 获取最近活动
   */
  getRecentActivities(limit: number = 50): ActivityEvent[] {
    return this.activities.slice(-limit);
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
    const presences = Array.from(this.presences.values());
    const byDocument: Record<string, number> = {};

    for (const presence of presences) {
      if (presence.currentDocument) {
        byDocument[presence.currentDocument] = (byDocument[presence.currentDocument] || 0) + 1;
      }
    }

    // 计算最近 5 分钟的活动率
    const fiveMinutesAgo = Date.now() - 300000;
    const recentActivities = this.activities.filter(
      a => a.timestamp.getTime() >= fiveMinutesAgo
    );
    const recentActivityRate = recentActivities.length / 5; // 每分钟活动数

    return {
      totalUsers: presences.length,
      onlineUsers: presences.filter(p => p.status === "online").length,
      awayUsers: presences.filter(p => p.status === "away").length,
      busyUsers: presences.filter(p => p.status === "busy").length,
      byDocument,
      activityCount: this.activities.length,
      recentActivityRate,
    };
  }

  /**
   * 清理旧活动
   */
  cleanupOldActivities(maxAge: number = 86400000): void {
    const cutoff = Date.now() - maxAge;
    this.activities = this.activities.filter(
      a => a.timestamp.getTime() >= cutoff
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

    // 统计在同一文档中的协作次数
    for (const activity of this.activities) {
      if (activity.type === "edit" || activity.type === "view") {
        const documentUsers = this.getDocumentUsers(activity.documentId);
        for (const user of documentUsers) {
          if (user.userId !== activity.userId) {
            const key = [activity.userId, user.userId].sort().join("-");
            collaborations.set(key, (collaborations.get(key) || 0) + 1);
          }
        }
      }
    }

    // 转换为边
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
    this.removeAllListeners();
  }
}
