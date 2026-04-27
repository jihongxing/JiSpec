import path from "node:path";
import { CacheManager } from "./cache-manager";
import type { CacheWarmupResult } from "./cache-manager";
import { computeCacheKey, computeContentHash, type CacheKeyInputs } from "./cache-key";
import { createManifest } from "./cache-manifest";
import type { ArtifactSnapshot } from "./cache-manifest";
import type { ArtifactIdentity } from "./artifact-identity";
import type { DistributedTask } from "./distributed-scheduler";
import type { StorageAdapter } from "./storage-adapter";

export interface DistributedTaskCacheContext {
  task: DistributedTask;
  workerId?: string;
  providerConfig?: {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  };
  contractVersion?: {
    contractHash: string;
    schemaVersion: string;
  };
  dependencyState?: {
    gates?: Record<string, boolean>;
    lifecycleState?: string;
  };
}

export interface DistributedTaskCacheValue<T> {
  cacheKey: string;
  cacheHit: boolean;
  value: T;
}

/**
 * Thin adapter that reuses the existing cache-key/manifest model
 * for distributed task execution results.
 */
export class DistributedTaskCache {
  private readonly cacheManager: CacheManager;

  constructor(storage: StorageAdapter, root: string) {
    this.cacheManager = new CacheManager(storage, root);
  }

  async get<T>(context: DistributedTaskCacheContext): Promise<DistributedTaskCacheValue<T> | null> {
    const { cacheKey } = this.buildCacheRecord(context);
    const value = await this.cacheManager.get<T>(cacheKey);

    if (value === null) {
      return null;
    }

    return {
      cacheKey,
      cacheHit: true,
      value,
    };
  }

  async put<T>(context: DistributedTaskCacheContext, value: T, executionTimeMs?: number): Promise<string> {
    const { cacheKey, keyInputs, inputSnapshots } = this.buildCacheRecord(context);
    const outputSnapshots = this.captureOutputSnapshots(context, value);

    const manifest = createManifest(cacheKey, keyInputs, inputSnapshots, outputSnapshots, {
      executionTimeMs,
      metadata: {
        distributed: true,
        workerId: context.workerId ?? null,
      },
    });

    await this.cacheManager.put(manifest, value);
    return cacheKey;
  }

  async invalidate(
    context: DistributedTaskCacheContext,
    reason: "input_changed" | "dependency_changed" | "contract_changed" | "manual" | "expired",
    details: string
  ): Promise<void> {
    const { cacheKey } = this.buildCacheRecord(context);
    await this.cacheManager.invalidate(cacheKey, reason, details);
  }

  getStats() {
    return this.cacheManager.getStats();
  }

  async invalidateBySlice(
    sliceId: string,
    reason: "input_changed" | "dependency_changed" | "contract_changed" | "manual" | "expired",
    details: string
  ): Promise<number> {
    return this.cacheManager.invalidateBySlice(sliceId, reason, details);
  }

  async invalidateByStage(
    sliceId: string,
    stageId: string,
    reason: "input_changed" | "dependency_changed" | "contract_changed" | "manual" | "expired",
    details: string
  ): Promise<number> {
    return this.cacheManager.invalidateByStage(sliceId, stageId, reason, details);
  }

  async warmupSlice(sliceId: string): Promise<CacheWarmupResult> {
    return this.cacheManager.warmupSlice(sliceId);
  }

  async warmupStage(sliceId: string, stageId: string): Promise<CacheWarmupResult> {
    return this.cacheManager.warmupStage(sliceId, stageId);
  }

  private buildCacheRecord(context: DistributedTaskCacheContext): {
    cacheKey: string;
    keyInputs: CacheKeyInputs;
    inputSnapshots: ArtifactSnapshot[];
  } {
    const identity = this.resolvePrimaryIdentity(context);
    const payloadHash = computeContentHash(JSON.stringify(context.task.payload ?? {}));
    const inputSnapshot: ArtifactSnapshot = {
      identity,
      contentHash: payloadHash,
      timestamp: new Date().toISOString(),
    };

    const keyInputs: CacheKeyInputs = {
      sliceId: context.task.sliceId,
      stageId: context.task.stageId,
      identity,
      inputArtifacts: [{
        identity,
        contentHash: payloadHash,
      }],
      dependencyState: {
        gates: context.dependencyState?.gates ?? {},
        lifecycleState: context.dependencyState?.lifecycleState ?? "distributed",
      },
      providerConfig: context.providerConfig ?? {
        provider: "distributed-runtime",
        model: "in-process-worker",
      },
      contractVersion: context.contractVersion ?? {
        contractHash: computeContentHash(JSON.stringify({
          resourceRequirements: context.task.resourceRequirements,
          priority: context.task.priority,
        })),
        schemaVersion: "1.0.0",
      },
    };

    return {
      cacheKey: computeCacheKey(keyInputs),
      keyInputs,
      inputSnapshots: [inputSnapshot],
    };
  }

  private resolvePrimaryIdentity(context: DistributedTaskCacheContext): ArtifactIdentity {
    const payload = context.task.payload as { identity?: ArtifactIdentity; logicalName?: string } | undefined;

    if (payload?.identity) {
      return payload.identity;
    }

    return {
      sliceId: context.task.sliceId,
      stageId: context.task.stageId,
      artifactType: "report",
      artifactId: `${context.task.stageId}-result`,
      logicalName: path.join(context.task.sliceId, `${context.task.stageId}.json`),
    };
  }

  private captureOutputSnapshots<T>(context: DistributedTaskCacheContext, value: T): ArtifactSnapshot[] {
    const identity = this.resolvePrimaryIdentity(context);
    const contentHash = computeContentHash(JSON.stringify(value));

    return [{
      identity,
      contentHash,
      timestamp: new Date().toISOString(),
    }];
  }
}
