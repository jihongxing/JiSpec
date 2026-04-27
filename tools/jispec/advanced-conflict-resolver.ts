import { randomUUID } from "node:crypto";
import type { CollaborationOperation } from "./collaboration-server";

export type ConflictType =
  | "concurrent_edit"
  | "delete_edit"
  | "replace_edit"
  | "semantic";

export type ResolutionStrategy =
  | "operational_transform"
  | "crdt_merge"
  | "three_way_merge"
  | "last_write_wins"
  | "first_write_wins"
  | "manual";

export interface OperationConflict {
  id: string;
  type: ConflictType;
  operations: CollaborationOperation[];
  detectedAt: string;
  resolved: boolean;
  resolution?: ConflictResolution;
}

export interface ConflictResolution {
  strategy: ResolutionStrategy;
  mergedOperation: CollaborationOperation;
  confidence: number;
  rationale: string;
  resolvedAt: string;
}

export interface ConflictResolverStats {
  totalConflicts: number;
  resolvedConflicts: number;
  unresolvedConflicts: number;
  byType: Record<ConflictType, number>;
  byStrategy: Record<ResolutionStrategy, number>;
}

function getOperationRange(operation: CollaborationOperation): { start: number; end: number } {
  const start = operation.position;

  switch (operation.type) {
    case "insert":
      return {
        start,
        end: start + (operation.content?.length ?? 0),
      };
    case "delete":
    case "replace":
      return {
        start,
        end: start + (operation.length ?? 0),
      };
    default:
      return { start, end: start };
  }
}

function rangesOverlap(
  left: { start: number; end: number },
  right: { start: number; end: number }
): boolean {
  return left.start <= right.end && right.start <= left.end;
}

export class AdvancedConflictResolver {
  private readonly conflicts = new Map<string, OperationConflict>();
  private readonly resolutionHistory: ConflictResolution[] = [];

  detectConflict(
    baseOperation: CollaborationOperation,
    incomingOperation: CollaborationOperation
  ): OperationConflict | null {
    if (baseOperation.id === incomingOperation.id) {
      return null;
    }

    if (
      baseOperation.baseVersion !== incomingOperation.baseVersion &&
      incomingOperation.baseVersion >= baseOperation.baseVersion
    ) {
      return null;
    }

    const type = this.classifyConflict(baseOperation, incomingOperation);
    if (!type) {
      return null;
    }

    const conflict: OperationConflict = {
      id: randomUUID(),
      type,
      operations: [baseOperation, incomingOperation],
      detectedAt: new Date().toISOString(),
      resolved: false,
    };

    this.conflicts.set(conflict.id, conflict);
    return conflict;
  }

  resolveConflict(
    conflictId: string,
    strategy?: ResolutionStrategy
  ): ConflictResolution {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    const selectedStrategy = strategy ?? this.selectStrategy(conflict);
    const resolution = this.buildResolution(conflict, selectedStrategy);

    conflict.resolved = true;
    conflict.resolution = resolution;
    this.resolutionHistory.push(resolution);

    return resolution;
  }

  getConflict(conflictId: string): OperationConflict | undefined {
    return this.conflicts.get(conflictId);
  }

  getConflicts(): OperationConflict[] {
    return Array.from(this.conflicts.values()).map((conflict) => ({
      ...conflict,
      operations: conflict.operations.map((operation) => ({ ...operation })),
      resolution: conflict.resolution ? { ...conflict.resolution, mergedOperation: { ...conflict.resolution.mergedOperation } } : undefined,
    }));
  }

  getUnresolvedConflicts(): OperationConflict[] {
    return this.getConflicts().filter((conflict) => !conflict.resolved);
  }

  getResolutionHistory(): ConflictResolution[] {
    return this.resolutionHistory.map((resolution) => ({
      ...resolution,
      mergedOperation: { ...resolution.mergedOperation },
    }));
  }

  getStats(): ConflictResolverStats {
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

    for (const conflict of this.conflicts.values()) {
      byType[conflict.type] += 1;
      if (conflict.resolution) {
        byStrategy[conflict.resolution.strategy] += 1;
      }
    }

    return {
      totalConflicts: this.conflicts.size,
      resolvedConflicts: Array.from(this.conflicts.values()).filter((conflict) => conflict.resolved).length,
      unresolvedConflicts: Array.from(this.conflicts.values()).filter((conflict) => !conflict.resolved).length,
      byType,
      byStrategy,
    };
  }

  private classifyConflict(
    baseOperation: CollaborationOperation,
    incomingOperation: CollaborationOperation
  ): ConflictType | null {
    const baseRange = getOperationRange(baseOperation);
    const incomingRange = getOperationRange(incomingOperation);
    const overlap = rangesOverlap(baseRange, incomingRange);

    if (!overlap) {
      return null;
    }

    if (baseOperation.type === "delete" || incomingOperation.type === "delete") {
      return "delete_edit";
    }

    if (baseOperation.type === "replace" || incomingOperation.type === "replace") {
      return "replace_edit";
    }

    if (baseOperation.type === "insert" && incomingOperation.type === "insert") {
      return "concurrent_edit";
    }

    return "semantic";
  }

  private selectStrategy(conflict: OperationConflict): ResolutionStrategy {
    switch (conflict.type) {
      case "concurrent_edit":
        return "operational_transform";
      case "delete_edit":
        return "last_write_wins";
      case "replace_edit":
        return "three_way_merge";
      case "semantic":
      default:
        return "crdt_merge";
    }
  }

  private buildResolution(
    conflict: OperationConflict,
    strategy: ResolutionStrategy
  ): ConflictResolution {
    const [baseOperation, incomingOperation] = conflict.operations;

    switch (strategy) {
      case "operational_transform":
        return {
          strategy,
          mergedOperation: this.applyOperationalTransform(baseOperation, incomingOperation),
          confidence: 0.9,
          rationale: "Concurrent insert operations were transformed to preserve both edits.",
          resolvedAt: new Date().toISOString(),
        };

      case "three_way_merge":
        return {
          strategy,
          mergedOperation: this.applyThreeWayMerge(baseOperation, incomingOperation),
          confidence: 0.8,
          rationale: "Replace-style edits were merged into a single replacement span.",
          resolvedAt: new Date().toISOString(),
        };

      case "crdt_merge":
        return {
          strategy,
          mergedOperation: this.applyCrdtMerge(baseOperation, incomingOperation),
          confidence: 0.85,
          rationale: "Conflict was merged by deterministic timestamp ordering.",
          resolvedAt: new Date().toISOString(),
        };

      case "first_write_wins":
        return {
          strategy,
          mergedOperation: this.pickByTimestamp(baseOperation, incomingOperation, "first"),
          confidence: 0.6,
          rationale: "Earlier edit was kept as authoritative.",
          resolvedAt: new Date().toISOString(),
        };

      case "manual":
        return {
          strategy,
          mergedOperation: {
            ...incomingOperation,
            content: incomingOperation.content ?? baseOperation.content,
          },
          confidence: 0.3,
          rationale: "Conflict requires manual inspection; provisional merged operation recorded.",
          resolvedAt: new Date().toISOString(),
        };

      case "last_write_wins":
      default:
        return {
          strategy: "last_write_wins",
          mergedOperation: this.pickByTimestamp(baseOperation, incomingOperation, "last"),
          confidence: 0.65,
          rationale: "Later edit was kept as authoritative.",
          resolvedAt: new Date().toISOString(),
        };
    }
  }

  private applyOperationalTransform(
    baseOperation: CollaborationOperation,
    incomingOperation: CollaborationOperation
  ): CollaborationOperation {
    if (baseOperation.type !== "insert" || incomingOperation.type !== "insert") {
      return { ...incomingOperation };
    }

    const baseLength = baseOperation.content?.length ?? 0;
    const adjustedPosition =
      incomingOperation.position >= baseOperation.position
        ? incomingOperation.position + baseLength
        : incomingOperation.position;

    return {
      ...incomingOperation,
      position: adjustedPosition,
      baseVersion: Math.max(baseOperation.baseVersion, incomingOperation.baseVersion),
    };
  }

  private applyThreeWayMerge(
    baseOperation: CollaborationOperation,
    incomingOperation: CollaborationOperation
  ): CollaborationOperation {
    const start = Math.min(baseOperation.position, incomingOperation.position);
    const baseEnd = baseOperation.position + (baseOperation.length ?? 0);
    const incomingEnd = incomingOperation.position + (incomingOperation.length ?? 0);
    const end = Math.max(baseEnd, incomingEnd);

    return {
      id: randomUUID(),
      userId: "system",
      type: "replace",
      position: start,
      length: end - start,
      content: `${baseOperation.content ?? ""}${incomingOperation.content ?? ""}`,
      baseVersion: Math.max(baseOperation.baseVersion, incomingOperation.baseVersion),
      timestamp: new Date().toISOString(),
    };
  }

  private applyCrdtMerge(
    baseOperation: CollaborationOperation,
    incomingOperation: CollaborationOperation
  ): CollaborationOperation {
    const ordered = [baseOperation, incomingOperation].sort((left, right) =>
      left.timestamp.localeCompare(right.timestamp)
    );

    return {
      id: randomUUID(),
      userId: "system",
      type: "replace",
      position: Math.min(ordered[0].position, ordered[1].position),
      length: Math.max(ordered[0].length ?? 0, ordered[1].length ?? 0),
      content: ordered.map((operation) => operation.content ?? "").join(""),
      baseVersion: Math.max(baseOperation.baseVersion, incomingOperation.baseVersion),
      timestamp: new Date().toISOString(),
    };
  }

  private pickByTimestamp(
    baseOperation: CollaborationOperation,
    incomingOperation: CollaborationOperation,
    mode: "first" | "last"
  ): CollaborationOperation {
    const ordered = [baseOperation, incomingOperation].sort((left, right) =>
      left.timestamp.localeCompare(right.timestamp)
    );

    return {
      ...(mode === "first" ? ordered[0] : ordered[1]),
    };
  }
}
