import { UserPresence, ActivityEvent } from "./presence-manager";
import { Conflict, ConflictResolution } from "./advanced-conflict-resolver";
import { Notification } from "./notification-service";

/**
 * 协作指标
 */
export interface CollaborationMetrics {
  timestamp: Date;
  activeUsers: number;
  totalEdits: number;
  totalConflicts: number;
  resolvedConflicts: number;
  averageResolutionTime: number;
  collaborationScore: number;
}

/**
 * 用户协作统计
 */
export interface UserCollaborationStats {
  userId: string;
  username: string;
  totalEdits: number;
  totalConflicts: number;
  conflictsCreated: number;
  conflictsResolved: number;
  averageResponseTime: number;
  collaborationScore: number;
  topCollaborators: Array<{ userId: string; interactions: number }>;
}

/**
 * 文档协作统计
 */
export interface DocumentCollaborationStats {
  documentId: string;
  totalEdits: number;
  uniqueUsers: number;
  totalConflicts: number;
  conflictRate: number;
  averageResolutionTime: number;
  hotspots: Array<{ position: number; editCount: number }>;
}

/**
 * 协作效率分析
 */
export interface CollaborationEfficiencyAnalysis {
  period: { start: Date; end: Date };
  totalUsers: number;
  activeUsers: number;
  totalEdits: number;
  editsPerUser: number;
  conflictRate: number;
  resolutionRate: number;
  averageResolutionTime: number;
  peakHours: Array<{ hour: number; activity: number }>;
  efficiency: number; // 0-100
}

/**
 * 冲突分析
 */
export interface ConflictAnalysis {
  totalConflicts: number;
  byType: Record<string, number>;
  byUser: Record<string, number>;
  byDocument: Record<string, number>;
  resolutionStrategies: Record<string, number>;
  averageResolutionTime: number;
  resolutionRate: number;
  trends: Array<{ date: Date; count: number }>;
}

/**
 * 协作分析器
 */
export class CollaborationAnalytics {
  private metrics: CollaborationMetrics[] = [];
  private maxMetricsHistory: number = 10000;

  /**
   * 记录指标
   */
  recordMetrics(
    activeUsers: number,
    totalEdits: number,
    totalConflicts: number,
    resolvedConflicts: number,
    averageResolutionTime: number
  ): CollaborationMetrics {
    const collaborationScore = this.calculateCollaborationScore(
      activeUsers,
      totalEdits,
      totalConflicts,
      resolvedConflicts
    );

    const metrics: CollaborationMetrics = {
      timestamp: new Date(),
      activeUsers,
      totalEdits,
      totalConflicts,
      resolvedConflicts,
      averageResolutionTime,
      collaborationScore,
    };

    this.metrics.push(metrics);

    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics.shift();
    }

    return metrics;
  }

  /**
   * 计算协作分数
   */
  private calculateCollaborationScore(
    activeUsers: number,
    totalEdits: number,
    totalConflicts: number,
    resolvedConflicts: number
  ): number {
    if (activeUsers === 0 || totalEdits === 0) {
      return 0;
    }

    // 基础分数：编辑活跃度
    const activityScore = Math.min(totalEdits / activeUsers / 10, 40);

    // 冲突处理分数
    const conflictScore = totalConflicts > 0
      ? (resolvedConflicts / totalConflicts) * 30
      : 30;

    // 协作广度分数
    const breadthScore = Math.min(activeUsers * 3, 30);

    return Math.round(activityScore + conflictScore + breadthScore);
  }

  /**
   * 分析用户协作
   */
  analyzeUserCollaboration(
    userId: string,
    username: string,
    activities: ActivityEvent[],
    conflicts: Conflict[]
  ): UserCollaborationStats {
    const userActivities = activities.filter(a => a.userId === userId);
    const totalEdits = userActivities.filter(a => a.type === "edit").length;

    const userConflicts = conflicts.filter(c =>
      c.operations.some(op => op.userId === userId)
    );

    const conflictsCreated = userConflicts.filter(c =>
      c.operations[0].userId === userId
    ).length;

    const conflictsResolved = userConflicts.filter(c => c.resolved).length;

    // 计算平均响应时间
    const responseTimes: number[] = [];
    for (const conflict of userConflicts) {
      if (conflict.resolved && conflict.resolution) {
        const responseTime = conflict.resolution.timestamp.getTime() - conflict.timestamp.getTime();
        responseTimes.push(responseTime);
      }
    }
    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    // 找出主要协作者
    const collaborators = new Map<string, number>();
    for (const activity of userActivities) {
      const sameDocActivities = activities.filter(
        a => a.documentId === activity.documentId && a.userId !== userId
      );
      for (const other of sameDocActivities) {
        collaborators.set(other.userId, (collaborators.get(other.userId) || 0) + 1);
      }
    }

    const topCollaborators = Array.from(collaborators.entries())
      .map(([userId, interactions]) => ({ userId, interactions }))
      .sort((a, b) => b.interactions - a.interactions)
      .slice(0, 5);

    const collaborationScore = this.calculateUserCollaborationScore(
      totalEdits,
      userConflicts.length,
      conflictsResolved,
      topCollaborators.length
    );

    return {
      userId,
      username,
      totalEdits,
      totalConflicts: userConflicts.length,
      conflictsCreated,
      conflictsResolved,
      averageResponseTime,
      collaborationScore,
      topCollaborators,
    };
  }

  /**
   * 计算用户协作分数
   */
  private calculateUserCollaborationScore(
    totalEdits: number,
    totalConflicts: number,
    conflictsResolved: number,
    collaboratorCount: number
  ): number {
    const activityScore = Math.min(totalEdits / 5, 40);
    const resolutionScore = totalConflicts > 0
      ? (conflictsResolved / totalConflicts) * 30
      : 30;
    const collaborationScore = Math.min(collaboratorCount * 6, 30);

    return Math.round(activityScore + resolutionScore + collaborationScore);
  }

  /**
   * 分析文档协作
   */
  analyzeDocumentCollaboration(
    documentId: string,
    activities: ActivityEvent[],
    conflicts: Conflict[]
  ): DocumentCollaborationStats {
    const docActivities = activities.filter(a => a.documentId === documentId);
    const totalEdits = docActivities.filter(a => a.type === "edit").length;
    const uniqueUsers = new Set(docActivities.map(a => a.userId)).size;

    const docConflicts = conflicts.filter(c =>
      c.operations.some(op => op.metadata?.documentId === documentId)
    );
    const totalConflicts = docConflicts.length;
    const conflictRate = totalEdits > 0 ? totalConflicts / totalEdits : 0;

    // 计算平均解决时间
    const resolutionTimes: number[] = [];
    for (const conflict of docConflicts) {
      if (conflict.resolved && conflict.resolution) {
        const time = conflict.resolution.timestamp.getTime() - conflict.timestamp.getTime();
        resolutionTimes.push(time);
      }
    }
    const averageResolutionTime = resolutionTimes.length > 0
      ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
      : 0;

    // 找出编辑热点
    const positionCounts = new Map<number, number>();
    for (const activity of docActivities) {
      if (activity.type === "edit" && activity.data?.position !== undefined) {
        const pos = Math.floor(activity.data.position / 100) * 100;
        positionCounts.set(pos, (positionCounts.get(pos) || 0) + 1);
      }
    }

    const hotspots = Array.from(positionCounts.entries())
      .map(([position, editCount]) => ({ position, editCount }))
      .sort((a, b) => b.editCount - a.editCount)
      .slice(0, 10);

    return {
      documentId,
      totalEdits,
      uniqueUsers,
      totalConflicts,
      conflictRate,
      averageResolutionTime,
      hotspots,
    };
  }

  /**
   * 分析协作效率
   */
  analyzeCollaborationEfficiency(
    startDate: Date,
    endDate: Date,
    activities: ActivityEvent[],
    conflicts: Conflict[],
    presences: UserPresence[]
  ): CollaborationEfficiencyAnalysis {
    const periodActivities = activities.filter(
      a => a.timestamp >= startDate && a.timestamp <= endDate
    );

    const totalUsers = new Set(periodActivities.map(a => a.userId)).size;
    const activeUsers = presences.filter(p => p.status === "online").length;
    const totalEdits = periodActivities.filter(a => a.type === "edit").length;
    const editsPerUser = totalUsers > 0 ? totalEdits / totalUsers : 0;

    const periodConflicts = conflicts.filter(
      c => c.timestamp >= startDate && c.timestamp <= endDate
    );
    const totalConflicts = periodConflicts.length;
    const resolvedConflicts = periodConflicts.filter(c => c.resolved).length;
    const conflictRate = totalEdits > 0 ? totalConflicts / totalEdits : 0;
    const resolutionRate = totalConflicts > 0 ? resolvedConflicts / totalConflicts : 0;

    // 计算平均解决时间
    const resolutionTimes: number[] = [];
    for (const conflict of periodConflicts) {
      if (conflict.resolved && conflict.resolution) {
        const time = conflict.resolution.timestamp.getTime() - conflict.timestamp.getTime();
        resolutionTimes.push(time);
      }
    }
    const averageResolutionTime = resolutionTimes.length > 0
      ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
      : 0;

    // 分析高峰时段
    const hourCounts = new Array(24).fill(0);
    for (const activity of periodActivities) {
      const hour = activity.timestamp.getHours();
      hourCounts[hour]++;
    }
    const peakHours = hourCounts
      .map((activity, hour) => ({ hour, activity }))
      .sort((a, b) => b.activity - a.activity)
      .slice(0, 5);

    // 计算效率分数
    const efficiency = this.calculateEfficiencyScore(
      editsPerUser,
      conflictRate,
      resolutionRate,
      averageResolutionTime
    );

    return {
      period: { start: startDate, end: endDate },
      totalUsers,
      activeUsers,
      totalEdits,
      editsPerUser,
      conflictRate,
      resolutionRate,
      averageResolutionTime,
      peakHours,
      efficiency,
    };
  }

  /**
   * 计算效率分数
   */
  private calculateEfficiencyScore(
    editsPerUser: number,
    conflictRate: number,
    resolutionRate: number,
    averageResolutionTime: number
  ): number {
    // 编辑效率分数
    const editScore = Math.min(editsPerUser * 5, 30);

    // 冲突控制分数
    const conflictScore = Math.max(30 - conflictRate * 100, 0);

    // 解决效率分数
    const resolutionScore = resolutionRate * 20;

    // 响应速度分数
    const speedScore = averageResolutionTime > 0
      ? Math.max(20 - averageResolutionTime / 60000, 0)
      : 20;

    return Math.round(editScore + conflictScore + resolutionScore + speedScore);
  }

  /**
   * 分析冲突
   */
  analyzeConflicts(conflicts: Conflict[]): ConflictAnalysis {
    const byType: Record<string, number> = {};
    const byUser: Record<string, number> = {};
    const byDocument: Record<string, number> = {};
    const resolutionStrategies: Record<string, number> = {};

    for (const conflict of conflicts) {
      byType[conflict.type] = (byType[conflict.type] || 0) + 1;

      for (const op of conflict.operations) {
        byUser[op.userId] = (byUser[op.userId] || 0) + 1;

        const docId = op.metadata?.documentId || "unknown";
        byDocument[docId] = (byDocument[docId] || 0) + 1;
      }

      if (conflict.resolution) {
        const strategy = conflict.resolution.strategy;
        resolutionStrategies[strategy] = (resolutionStrategies[strategy] || 0) + 1;
      }
    }

    const resolvedConflicts = conflicts.filter(c => c.resolved);
    const resolutionTimes: number[] = [];
    for (const conflict of resolvedConflicts) {
      if (conflict.resolution) {
        const time = conflict.resolution.timestamp.getTime() - conflict.timestamp.getTime();
        resolutionTimes.push(time);
      }
    }
    const averageResolutionTime = resolutionTimes.length > 0
      ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
      : 0;

    const resolutionRate = conflicts.length > 0
      ? resolvedConflicts.length / conflicts.length
      : 0;

    // 生成趋势数据
    const trends = this.generateConflictTrends(conflicts);

    return {
      totalConflicts: conflicts.length,
      byType,
      byUser,
      byDocument,
      resolutionStrategies,
      averageResolutionTime,
      resolutionRate,
      trends,
    };
  }

  /**
   * 生成冲突趋势
   */
  private generateConflictTrends(conflicts: Conflict[]): Array<{ date: Date; count: number }> {
    const dateCounts = new Map<string, number>();

    for (const conflict of conflicts) {
      const dateKey = conflict.timestamp.toISOString().split("T")[0];
      dateCounts.set(dateKey, (dateCounts.get(dateKey) || 0) + 1);
    }

    return Array.from(dateCounts.entries())
      .map(([dateStr, count]) => ({ date: new Date(dateStr), count }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * 获取指标历史
   */
  getMetricsHistory(limit?: number): CollaborationMetrics[] {
    if (limit) {
      return this.metrics.slice(-limit);
    }
    return [...this.metrics];
  }

  /**
   * 获取协作趋势
   */
  getCollaborationTrends(days: number = 7): {
    dates: Date[];
    activeUsers: number[];
    totalEdits: number[];
    conflicts: number[];
    scores: number[];
  } {
    const cutoff = Date.now() - days * 86400000;
    const recentMetrics = this.metrics.filter(m => m.timestamp.getTime() >= cutoff);

    return {
      dates: recentMetrics.map(m => m.timestamp),
      activeUsers: recentMetrics.map(m => m.activeUsers),
      totalEdits: recentMetrics.map(m => m.totalEdits),
      conflicts: recentMetrics.map(m => m.totalConflicts),
      scores: recentMetrics.map(m => m.collaborationScore),
    };
  }

  /**
   * 生成协作报告
   */
  generateReport(
    startDate: Date,
    endDate: Date,
    activities: ActivityEvent[],
    conflicts: Conflict[],
    presences: UserPresence[]
  ): string {
    const efficiency = this.analyzeCollaborationEfficiency(
      startDate,
      endDate,
      activities,
      conflicts,
      presences
    );

    const conflictAnalysis = this.analyzeConflicts(conflicts);

    return `
# 协作分析报告

**时间段**: ${startDate.toISOString()} - ${endDate.toISOString()}

## 总体指标

- 总用户数: ${efficiency.totalUsers}
- 活跃用户数: ${efficiency.activeUsers}
- 总编辑次数: ${efficiency.totalEdits}
- 人均编辑次数: ${efficiency.editsPerUser.toFixed(2)}
- 协作效率分数: ${efficiency.efficiency}/100

## 冲突分析

- 总冲突数: ${conflictAnalysis.totalConflicts}
- 冲突率: ${(efficiency.conflictRate * 100).toFixed(2)}%
- 解决率: ${(conflictAnalysis.resolutionRate * 100).toFixed(2)}%
- 平均解决时间: ${(conflictAnalysis.averageResolutionTime / 1000).toFixed(2)}秒

## 高峰时段

${efficiency.peakHours.map(h => `- ${h.hour}:00 - ${h.activity} 次活动`).join("\n")}

## 冲突类型分布

${Object.entries(conflictAnalysis.byType).map(([type, count]) => `- ${type}: ${count}`).join("\n")}

## 解决策略分布

${Object.entries(conflictAnalysis.resolutionStrategies).map(([strategy, count]) => `- ${strategy}: ${count}`).join("\n")}
`;
  }
}
