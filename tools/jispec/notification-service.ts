import { EventEmitter } from "events";

/**
 * 通知类型
 */
export type NotificationType =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "comment"
  | "mention"
  | "conflict"
  | "lock"
  | "permission";

/**
 * 通知优先级
 */
export type NotificationPriority = "low" | "normal" | "high" | "urgent";

/**
 * 通知渠道
 */
export type NotificationChannel = "websocket" | "email" | "slack" | "webhook" | "in-app";

/**
 * 通知
 */
export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  userId: string;
  resourceId?: string;
  resourceType?: string;
  channels: NotificationChannel[];
  createdAt: Date;
  readAt?: Date;
  metadata?: Record<string, any>;
}

/**
 * 通知配置
 */
export interface NotificationPreferences {
  userId: string;
  channels: {
    websocket: boolean;
    email: boolean;
    slack: boolean;
    webhook: boolean;
    inApp: boolean;
  };
  filters: {
    types: NotificationType[];
    minPriority: NotificationPriority;
  };
  quietHours?: {
    enabled: boolean;
    start: string; // HH:mm
    end: string; // HH:mm
  };
}

export interface SendNotificationOptions {
  priority?: NotificationPriority;
  resourceId?: string;
  resourceType?: string;
  channels?: NotificationChannel[];
  metadata?: Record<string, any>;
}

/**
 * 通知处理器
 */
export interface NotificationHandler {
  send(notification: Notification): Promise<void>;
}

/**
 * WebSocket 通知处理器
 */
export class WebSocketNotificationHandler implements NotificationHandler {
  constructor(private sendToUser: (userId: string, data: any) => void) {}

  async send(notification: Notification): Promise<void> {
    this.sendToUser(notification.userId, {
      type: "notification",
      notification,
    });
  }
}

/**
 * Email 通知处理器
 */
export class EmailNotificationHandler implements NotificationHandler {
  async send(notification: Notification): Promise<void> {
    // 简化实现，实际应该调用邮件服务
    console.log(`[Email] Sending to user ${notification.userId}: ${notification.title}`);
  }
}

/**
 * Slack 通知处理器
 */
export class SlackNotificationHandler implements NotificationHandler {
  constructor(private webhookUrl?: string) {}

  async send(notification: Notification): Promise<void> {
    // 简化实现，实际应该调用 Slack API
    console.log(`[Slack] Sending to user ${notification.userId}: ${notification.title}`);
  }
}

/**
 * Webhook 通知处理器
 */
export class WebhookNotificationHandler implements NotificationHandler {
  constructor(private webhookUrl: string) {}

  async send(notification: Notification): Promise<void> {
    // 简化实现，实际应该发送 HTTP 请求
    console.log(`[Webhook] Sending to ${this.webhookUrl}: ${notification.title}`);
  }
}

/**
 * 应用内通知处理器
 */
export class InAppNotificationHandler implements NotificationHandler {
  private notifications: Map<string, Notification[]> = new Map();

  async send(notification: Notification): Promise<void> {
    if (!this.notifications.has(notification.userId)) {
      this.notifications.set(notification.userId, []);
    }
    this.notifications.get(notification.userId)!.push(notification);
  }

  getNotifications(userId: string): Notification[] {
    return this.notifications.get(userId) || [];
  }

  clearNotifications(userId: string): void {
    this.notifications.delete(userId);
  }
}

/**
 * 通知服务
 */
export class NotificationService extends EventEmitter {
  private notifications: Map<string, Notification> = new Map();
  private preferences: Map<string, NotificationPreferences> = new Map();
  private handlers: Map<NotificationChannel, NotificationHandler> = new Map();
  private maxHistorySize: number = 1000;

  constructor() {
    super();
  }

  /**
   * 注册通知处理器
   */
  registerHandler(channel: NotificationChannel, handler: NotificationHandler): void {
    this.handlers.set(channel, handler);
  }

  hasHandler(channel: NotificationChannel): boolean {
    return this.handlers.has(channel);
  }

  /**
   * 发送通知
   */
  async sendNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    options?: SendNotificationOptions
  ): Promise<Notification> {
    const notification: Notification = {
      id: `notif-${Date.now()}-${Math.random()}`,
      type,
      priority: options?.priority || "normal",
      title,
      message,
      userId,
      resourceId: options?.resourceId,
      resourceType: options?.resourceType,
      channels: options?.channels || ["websocket", "in-app"],
      createdAt: new Date(),
      metadata: options?.metadata,
    };

    // 检查用户偏好
    const preferences = this.preferences.get(userId);
    if (preferences) {
      notification.channels = this.filterChannels(notification, preferences);

      // 检查是否在静默时段
      if (this.isInQuietHours(preferences)) {
        notification.channels = notification.channels.filter(c => c === "in-app");
      }
    }

    // 保存通知
    this.notifications.set(notification.id, notification);

    // 发送到各个渠道
    await this.deliverNotification(notification);

    this.emit("notification:sent", notification);

    // 清理旧通知
    if (this.notifications.size > this.maxHistorySize) {
      const oldest = Array.from(this.notifications.keys())[0];
      this.notifications.delete(oldest);
    }

    return notification;
  }

  /**
   * 过滤渠道
   */
  private filterChannels(
    notification: Notification,
    preferences: NotificationPreferences
  ): NotificationChannel[] {
    const channels: NotificationChannel[] = [];

    // 检查类型过滤
    if (!preferences.filters.types.includes(notification.type)) {
      return ["in-app"]; // 至少保留应用内通知
    }

    // 检查优先级过滤
    const priorityLevels: NotificationPriority[] = ["low", "normal", "high", "urgent"];
    const notifPriorityIndex = priorityLevels.indexOf(notification.priority);
    const minPriorityIndex = priorityLevels.indexOf(preferences.filters.minPriority);

    if (notifPriorityIndex < minPriorityIndex) {
      return ["in-app"];
    }

    // 根据用户偏好选择渠道
    if (preferences.channels.websocket) channels.push("websocket");
    if (preferences.channels.email) channels.push("email");
    if (preferences.channels.slack) channels.push("slack");
    if (preferences.channels.webhook) channels.push("webhook");
    if (preferences.channels.inApp) channels.push("in-app");

    return channels.length > 0 ? channels : ["in-app"];
  }

  /**
   * 检查是否在静默时段
   */
  private isInQuietHours(preferences: NotificationPreferences): boolean {
    if (!preferences.quietHours?.enabled) {
      return false;
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    const start = preferences.quietHours.start;
    const end = preferences.quietHours.end;

    if (start <= end) {
      return currentTime >= start && currentTime <= end;
    } else {
      // 跨越午夜
      return currentTime >= start || currentTime <= end;
    }
  }

  /**
   * 投递通知
   */
  private async deliverNotification(notification: Notification): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const channel of notification.channels) {
      const handler = this.handlers.get(channel);
      if (handler) {
        promises.push(
          handler.send(notification).catch(error => {
            console.error(`Failed to send notification via ${channel}:`, error);
            this.emit("notification:failed", notification, channel, error);
          })
        );
      }
    }

    await Promise.all(promises);
  }

  /**
   * 标记为已读
   */
  markAsRead(notificationId: string): void {
    const notification = this.notifications.get(notificationId);
    if (notification && !notification.readAt) {
      notification.readAt = new Date();
      this.emit("notification:read", notification);
    }
  }

  /**
   * 批量标记为已读
   */
  markAllAsRead(userId: string): void {
    for (const notification of this.notifications.values()) {
      if (notification.userId === userId && !notification.readAt) {
        notification.readAt = new Date();
      }
    }
    this.emit("notifications:read-all", userId);
  }

  /**
   * 获取用户通知
   */
  getUserNotifications(userId: string, unreadOnly: boolean = false): Notification[] {
    const notifications = Array.from(this.notifications.values())
      .filter(n => n.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (unreadOnly) {
      return notifications.filter(n => !n.readAt);
    }

    return notifications;
  }

  getUnreadCount(userId: string): number {
    return this.getUserNotifications(userId, true).length;
  }

  /**
   * 获取通知
   */
  getNotification(notificationId: string): Notification | undefined {
    return this.notifications.get(notificationId);
  }

  /**
   * 删除通知
   */
  deleteNotification(notificationId: string): void {
    const notification = this.notifications.get(notificationId);
    if (notification) {
      this.notifications.delete(notificationId);
      this.emit("notification:deleted", notification);
    }
  }

  /**
   * 设置用户偏好
   */
  setPreferences(userId: string, preferences: Partial<NotificationPreferences>): void {
    const existing = this.preferences.get(userId) || {
      userId,
      channels: {
        websocket: true,
        email: true,
        slack: false,
        webhook: false,
        inApp: true,
      },
      filters: {
        types: ["info", "success", "warning", "error", "comment", "mention", "conflict", "lock", "permission"],
        minPriority: "low",
      },
    };

    this.preferences.set(userId, { ...existing, ...preferences, userId });
    this.emit("preferences:updated", userId);
  }

  /**
   * 获取用户偏好
   */
  getPreferences(userId: string): NotificationPreferences | undefined {
    return this.preferences.get(userId);
  }

  /**
   * 发送提及通知
   */
  async notifyMention(
    userId: string,
    mentionedBy: string,
    resourceId: string,
    resourceType: string,
    context: string
  ): Promise<Notification> {
    return this.sendNotification(
      userId,
      "mention",
      "You were mentioned",
      `${mentionedBy} mentioned you in ${resourceType} ${resourceId}`,
      {
        priority: "high",
        resourceId,
        resourceType,
        metadata: { mentionedBy, context },
      }
    );
  }

  /**
   * 发送评论通知
   */
  async notifyComment(
    userId: string,
    resourceId: string,
    commentedBy: string,
    preview: string
  ): Promise<Notification> {
    return this.sendNotification(
      userId,
      "comment",
      "New comment",
      `${commentedBy} commented on ${resourceId}`,
      {
        priority: "normal",
        resourceId,
        resourceType: "document",
        metadata: {
          commentedBy,
          preview,
        },
      }
    );
  }

  /**
   * 发送冲突通知
   */
  async notifyConflict(
    userId: string,
    conflictId: string,
    resourceId: string,
    conflictType: string
  ): Promise<Notification> {
    return this.sendNotification(
      userId,
      "conflict",
      "Conflict detected",
      `A ${conflictType} conflict was detected in ${resourceId}`,
      {
        priority: "high",
        resourceId,
        metadata: { conflictId, conflictType },
      }
    );
  }

  /**
   * 发送锁定通知
   */
  async notifyLock(
    userId: string,
    resourceId: string,
    lockedBy: string,
    action: "locked" | "unlocked" | "renewed" | "force-unlocked"
  ): Promise<Notification> {
    return this.sendNotification(
      userId,
      "lock",
      `Resource ${action}`,
      `${resourceId} was ${action} by ${lockedBy}`,
      {
        priority: "normal",
        resourceId,
        metadata: { lockedBy, action },
      }
    );
  }

  extractMentions(content: string): string[] {
    const mentions = new Set<string>();
    const pattern = /@([a-zA-Z0-9._-]+)/g;
    let match = pattern.exec(content);

    while (match) {
      mentions.add(match[1]);
      match = pattern.exec(content);
    }

    return Array.from(mentions);
  }

  /**
   * 发送权限通知
   */
  async notifyPermission(
    userId: string,
    resourceId: string,
    action: "granted" | "revoked",
    role: string
  ): Promise<Notification> {
    return this.sendNotification(
      userId,
      "permission",
      `Permission ${action}`,
      `Your ${role} permission for ${resourceId} was ${action}`,
      {
        priority: "normal",
        resourceId,
        metadata: { action, role },
      }
    );
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalNotifications: number;
    unreadNotifications: number;
    byType: Record<NotificationType, number>;
    byPriority: Record<NotificationPriority, number>;
    byChannel: Record<NotificationChannel, number>;
  } {
    const notifications = Array.from(this.notifications.values());

    const byType: Record<NotificationType, number> = {
      info: 0,
      success: 0,
      warning: 0,
      error: 0,
      comment: 0,
      mention: 0,
      conflict: 0,
      lock: 0,
      permission: 0,
    };

    const byPriority: Record<NotificationPriority, number> = {
      low: 0,
      normal: 0,
      high: 0,
      urgent: 0,
    };

    const byChannel: Record<NotificationChannel, number> = {
      websocket: 0,
      email: 0,
      slack: 0,
      webhook: 0,
      "in-app": 0,
    };

    for (const notification of notifications) {
      byType[notification.type]++;
      byPriority[notification.priority]++;
      for (const channel of notification.channels) {
        byChannel[channel]++;
      }
    }

    return {
      totalNotifications: notifications.length,
      unreadNotifications: notifications.filter(n => !n.readAt).length,
      byType,
      byPriority,
      byChannel,
    };
  }

  /**
   * 清理旧通知
   */
  cleanupOldNotifications(maxAge: number = 2592000000): void {
    const cutoff = Date.now() - maxAge; // 默认 30 天
    for (const [id, notification] of this.notifications) {
      if (notification.createdAt.getTime() < cutoff) {
        this.notifications.delete(id);
      }
    }
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.notifications.clear();
    this.preferences.clear();
    this.handlers.clear();
    this.removeAllListeners();
  }
}
