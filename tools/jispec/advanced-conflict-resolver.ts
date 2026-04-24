import { CRDTOperation } from "./collaboration-server";

/**
 * 冲突类型
 */
export type ConflictType = "concurrent_edit" | "delete_edit" | "move_edit" | "semantic";

/**
 * 冲突
 */
export interface Conflict {
  id: string;
  type: ConflictType;
  operations: CRDTOperation[];
  timestamp: Date;
  resolved: boolean;
  resolution?: ConflictResolution;
}

/**
 * 冲突解决策略
 */
export type ResolutionStrategy =
  | "three_way_merge"
  | "crdt_merge"
  | "last_write_wins"
  | "first_write_wins"
  | "manual"
  | "operational_transform";

/**
 * 冲突解决结果
 */
export interface ConflictResolution {
  strategy: ResolutionStrategy;
  result: CRDTOperation;
  confidence: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * 三方合并上下文
 */
export interface ThreeWayMergeContext {
  base: any;
  local: any;
  remote: any;
}

/**
 * CRDT 状态
 */
export interface CRDTState {
  content: any;
  version: number;
  vectorClock: Map<string, number>;
}

/**
 * 高级冲突解决器
 */
export class AdvancedConflictResolver {
  private conflicts: Map<string, Conflict> = new Map();
  private resolutionHistory: ConflictResolution[] = [];

  /**
   * 检测冲突
   */
  detectConflict(operations: CRDTOperation[]): Conflict | null {
    if (operations.length < 2) {
      return null;
    }

    const type = this.classifyConflict(operations);
    if (!type) {
      return null;
    }

    const conflict: Conflict = {
      id: `conflict-${Date.now()}-${Math.random()}`,
      type,
      operations,
      timestamp: new Date(),
      resolved: false,
    };

    this.conflicts.set(conflict.id, conflict);
    return conflict;
  }

  /**
   * 分类冲突
   */
  private classifyConflict(operations: CRDTOperation[]): ConflictType | null {
    const types = new Set(operations.map(op => op.type));

    // 并发编辑
    if (types.has("insert") || types.has("update")) {
      const positions = operations
        .filter(op => op.position !== undefined)
        .map(op => op.position!);

      if (positions.length >= 2) {
        const maxDiff = Math.max(...positions) - Math.min(...positions);
        if (maxDiff < 10) {
          return "concurrent_edit";
        }
      }
    }

    // 删除-编辑冲突
    if (types.has("delete") && (types.has("insert") || types.has("update"))) {
      return "delete_edit";
    }

    // 移动-编辑冲突
    if (operations.some(op => op.metadata?.type === "move")) {
      return "move_edit";
    }

    // 语义冲突
    if (operations.length >= 2) {
      return "semantic";
    }

    return null;
  }

  /**
   * 解决冲突
   */
  async resolveConflict(
    conflictId: string,
    strategy?: ResolutionStrategy
  ): Promise<ConflictResolution> {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    const selectedStrategy = strategy || this.selectStrategy(conflict);
    let resolution: ConflictResolution;

    switch (selectedStrategy) {
      case "three_way_merge":
        resolution = await this.threeWayMerge(conflict);
        break;

      case "crdt_merge":
        resolution = await this.crdtMerge(conflict);
        break;

      case "operational_transform":
        resolution = await this.operationalTransform(conflict);
        break;

      case "last_write_wins":
        resolution = this.lastWriteWins(conflict);
        break;

      case "first_write_wins":
        resolution = this.firstWriteWins(conflict);
        break;

      case "manual":
        throw new Error("Manual resolution required");

      default:
        resolution = this.lastWriteWins(conflict);
    }

    conflict.resolved = true;
    conflict.resolution = resolution;
    this.resolutionHistory.push(resolution);

    return resolution;
  }

  /**
   * 三方合并
   */
  private async threeWayMerge(conflict: Conflict): Promise<ConflictResolution> {
    const operations = conflict.operations;
    if (operations.length !== 2) {
      throw new Error("Three-way merge requires exactly 2 operations");
    }

    const [op1, op2] = operations;

    // 简化的三方合并逻辑
    const merged = this.mergeOperations(op1, op2);

    return {
      strategy: "three_way_merge",
      result: merged,
      confidence: 0.8,
      timestamp: new Date(),
      metadata: {
        method: "text_merge",
        operations: [op1.id, op2.id],
      },
    };
  }

  /**
   * CRDT 合并
   */
  private async crdtMerge(conflict: Conflict): Promise<ConflictResolution> {
    const operations = conflict.operations;

    // 使用向量时钟确定因果关系
    const merged = this.mergeCRDTOperations(operations);

    return {
      strategy: "crdt_merge",
      result: merged,
      confidence: 0.95,
      timestamp: new Date(),
      metadata: {
        method: "vector_clock",
        operationCount: operations.length,
      },
    };
  }

  /**
   * 操作转换 (Operational Transformation)
   */
  private async operationalTransform(conflict: Conflict): Promise<ConflictResolution> {
    const operations = conflict.operations;
    if (operations.length !== 2) {
      throw new Error("OT requires exactly 2 operations");
    }

    const [op1, op2] = operations;

    // 转换操作使其可以并发应用
    const transformed = this.transformOperations(op1, op2);

    return {
      strategy: "operational_transform",
      result: transformed,
      confidence: 0.85,
      timestamp: new Date(),
      metadata: {
        method: "ot",
        originalOps: [op1.id, op2.id],
      },
    };
  }

  /**
   * 最后写入获胜
   */
  private lastWriteWins(conflict: Conflict): ConflictResolution {
    const latest = conflict.operations.reduce((latest, op) =>
      op.timestamp > latest.timestamp ? op : latest
    );

    return {
      strategy: "last_write_wins",
      result: latest,
      confidence: 0.6,
      timestamp: new Date(),
      metadata: {
        winner: latest.id,
        winnerTimestamp: latest.timestamp,
      },
    };
  }

  /**
   * 第一写入获胜
   */
  private firstWriteWins(conflict: Conflict): ConflictResolution {
    const earliest = conflict.operations.reduce((earliest, op) =>
      op.timestamp < earliest.timestamp ? op : earliest
    );

    return {
      strategy: "first_write_wins",
      result: earliest,
      confidence: 0.6,
      timestamp: new Date(),
      metadata: {
        winner: earliest.id,
        winnerTimestamp: earliest.timestamp,
      },
    };
  }

  /**
   * 选择解决策略
   */
  private selectStrategy(conflict: Conflict): ResolutionStrategy {
    switch (conflict.type) {
      case "concurrent_edit":
        // 并发编辑优先使用 CRDT 或 OT
        return conflict.operations.length === 2 ? "operational_transform" : "crdt_merge";

      case "delete_edit":
        // 删除-编辑冲突需要手动处理
        return "manual";

      case "move_edit":
        // 移动-编辑冲突使用三方合并
        return "three_way_merge";

      case "semantic":
        // 语义冲突使用最后写入获胜
        return "last_write_wins";

      default:
        return "last_write_wins";
    }
  }

  /**
   * 合并两个操作
   */
  private mergeOperations(op1: CRDTOperation, op2: CRDTOperation): CRDTOperation {
    // 简化的合并逻辑
    if (op1.type === "insert" && op2.type === "insert") {
      return {
        id: `merged-${Date.now()}`,
        type: "insert",
        userId: "system",
        timestamp: new Date(),
        position: Math.min(op1.position || 0, op2.position || 0),
        content: `${op1.content}${op2.content}`,
      };
    }

    if (op1.type === "update" && op2.type === "update") {
      return {
        id: `merged-${Date.now()}`,
        type: "update",
        userId: "system",
        timestamp: new Date(),
        content: { ...op1.content, ...op2.content },
      };
    }

    // 默认返回较新的操作
    return op1.timestamp > op2.timestamp ? op1 : op2;
  }

  /**
   * 合并 CRDT 操作
   */
  private mergeCRDTOperations(operations: CRDTOperation[]): CRDTOperation {
    // 按时间戳排序
    const sorted = [...operations].sort((a, b) =>
      a.timestamp.getTime() - b.timestamp.getTime()
    );

    // 依次应用所有操作
    let result = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      result = this.mergeOperations(result, sorted[i]);
    }

    return result;
  }

  /**
   * 转换操作 (OT)
   */
  private transformOperations(op1: CRDTOperation, op2: CRDTOperation): CRDTOperation {
    // 简化的 OT 转换
    if (op1.type === "insert" && op2.type === "insert") {
      const pos1 = op1.position || 0;
      const pos2 = op2.position || 0;

      if (pos1 <= pos2) {
        // op2 需要调整位置
        return {
          ...op2,
          position: pos2 + (op1.content?.length || 0),
        };
      } else {
        // op1 需要调整位置
        return {
          ...op1,
          position: pos1 + (op2.content?.length || 0),
        };
      }
    }

    if (op1.type === "delete" && op2.type === "insert") {
      const deletePos = op1.position || 0;
      const deleteLen = op1.length || 0;
      const insertPos = op2.position || 0;

      if (insertPos >= deletePos + deleteLen) {
        // 插入在删除之后，调整位置
        return {
          ...op2,
          position: insertPos - deleteLen,
        };
      }
    }

    // 默认不转换
    return op2;
  }

  /**
   * 获取冲突
   */
  getConflict(conflictId: string): Conflict | undefined {
    return this.conflicts.get(conflictId);
  }

  /**
   * 获取所有未解决的冲突
   */
  getUnresolvedConflicts(): Conflict[] {
    return Array.from(this.conflicts.values()).filter(c => !c.resolved);
  }

  /**
   * 获取解决历史
   */
  getResolutionHistory(limit?: number): ConflictResolution[] {
    if (limit) {
      return this.resolutionHistory.slice(-limit);
    }
    return [...this.resolutionHistory];
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalConflicts: number;
    resolvedConflicts: number;
    unresolvedConflicts: number;
    resolutionRate: number;
    byType: Record<ConflictType, number>;
    byStrategy: Record<ResolutionStrategy, number>;
    averageConfidence: number;
  } {
    const conflicts = Array.from(this.conflicts.values());
    const resolved = conflicts.filter(c => c.resolved);

    const byType: Record<ConflictType, number> = {
      concurrent_edit: 0,
      delete_edit: 0,
      move_edit: 0,
      semantic: 0,
    };

    const byStrategy: Record<ResolutionStrategy, number> = {
      three_way_merge: 0,
      crdt_merge: 0,
      last_write_wins: 0,
      first_write_wins: 0,
      manual: 0,
      operational_transform: 0,
    };

    for (const conflict of conflicts) {
      byType[conflict.type]++;
      if (conflict.resolution) {
        byStrategy[conflict.resolution.strategy]++;
      }
    }

    const totalConfidence = this.resolutionHistory.reduce(
      (sum, r) => sum + r.confidence,
      0
    );
    const averageConfidence = this.resolutionHistory.length > 0
      ? totalConfidence / this.resolutionHistory.length
      : 0;

    return {
      totalConflicts: conflicts.length,
      resolvedConflicts: resolved.length,
      unresolvedConflicts: conflicts.length - resolved.length,
      resolutionRate: conflicts.length > 0 ? resolved.length / conflicts.length : 0,
      byType,
      byStrategy,
      averageConfidence,
    };
  }

  /**
   * 清理已解决的冲突
   */
  cleanupResolvedConflicts(maxAge: number = 86400000): void {
    const now = Date.now();
    for (const [id, conflict] of this.conflicts) {
      if (conflict.resolved && now - conflict.timestamp.getTime() > maxAge) {
        this.conflicts.delete(id);
      }
    }
  }
}
