/**
 * Cache Key Specification for StageExecution
 *
 * Defines the canonical cache key structure for stage execution results.
 * A cache key uniquely identifies an execution context such that:
 * - Same key → same execution result (deterministic)
 * - Different key → potentially different result
 *
 * Design principles:
 * - Stable: key format doesn't change across versions
 * - Canonical: same inputs always produce same key
 * - Complete: captures all factors that affect execution
 * - Debuggable: key composition is transparent and inspectable
 */

import crypto from 'node:crypto';
import type { ArtifactIdentity, ArtifactType } from './artifact-identity.js';

/**
 * Provider configuration that affects execution
 */
export interface ProviderConfig {
  provider: string;      // e.g., "anthropic", "openai"
  model: string;         // e.g., "claude-opus-4", "gpt-4"
  temperature?: number;  // Model temperature
  maxTokens?: number;    // Max output tokens
}

/**
 * Contract/schema version that affects execution
 */
export interface ContractVersion {
  contractHash: string;  // Hash of stage contract (inputs/outputs/gates)
  schemaVersion: string; // Schema version (e.g., "1.0.0")
}

/**
 * Input artifact with content hash
 */
export interface InputArtifact {
  identity: ArtifactIdentity;
  contentHash: string;   // SHA-256 hash of artifact content
}

/**
 * Dependency state (gate status, lifecycle state)
 */
export interface DependencyState {
  gates: Record<string, boolean>;  // Gate name → passed status
  lifecycleState: string;          // Current lifecycle state
}

/**
 * Complete cache key inputs for stage execution
 */
export interface CacheKeyInputs {
  sliceId: string;
  stageId: string;
  identity: ArtifactIdentity;           // Primary output identity
  inputArtifacts: InputArtifact[];      // All input artifacts with hashes
  dependencyState: DependencyState;     // Gate and lifecycle state
  providerConfig: ProviderConfig;       // Provider/model configuration
  contractVersion: ContractVersion;     // Contract and schema version
}

/**
 * Canonical cache key (opaque string)
 */
export type CacheKey = string;

/**
 * Serialize cache key inputs to canonical JSON string
 * Ensures stable ordering and formatting
 */
export function serializeCacheKeyInputs(inputs: CacheKeyInputs): string {
  // Sort input artifacts by encoded identity for stable ordering
  const sortedInputs = [...inputs.inputArtifacts].sort((a, b) => {
    const aKey = `${a.identity.sliceId}:${a.identity.stageId}:${a.identity.artifactType}:${a.identity.artifactId}`;
    const bKey = `${b.identity.sliceId}:${b.identity.stageId}:${b.identity.artifactType}:${b.identity.artifactId}`;
    return aKey.localeCompare(bKey);
  });

  // Sort gates by name for stable ordering
  const sortedGates = Object.keys(inputs.dependencyState.gates)
    .sort()
    .reduce((acc, key) => {
      acc[key] = inputs.dependencyState.gates[key];
      return acc;
    }, {} as Record<string, boolean>);

  // Build canonical structure
  const canonical = {
    sliceId: inputs.sliceId,
    stageId: inputs.stageId,
    identity: {
      sliceId: inputs.identity.sliceId,
      stageId: inputs.identity.stageId,
      artifactType: inputs.identity.artifactType,
      artifactId: inputs.identity.artifactId,
      logicalName: inputs.identity.logicalName || null,
    },
    inputArtifacts: sortedInputs.map(input => ({
      identity: {
        sliceId: input.identity.sliceId,
        stageId: input.identity.stageId,
        artifactType: input.identity.artifactType,
        artifactId: input.identity.artifactId,
        logicalName: input.identity.logicalName || null,
      },
      contentHash: input.contentHash,
    })),
    dependencyState: {
      gates: sortedGates,
      lifecycleState: inputs.dependencyState.lifecycleState,
    },
    providerConfig: {
      provider: inputs.providerConfig.provider,
      model: inputs.providerConfig.model,
      temperature: inputs.providerConfig.temperature ?? null,
      maxTokens: inputs.providerConfig.maxTokens ?? null,
    },
    contractVersion: {
      contractHash: inputs.contractVersion.contractHash,
      schemaVersion: inputs.contractVersion.schemaVersion,
    },
  };

  // Serialize with stable formatting (2-space indent, sorted keys)
  return JSON.stringify(canonical, null, 2);
}

/**
 * Compute cache key from inputs
 * Returns SHA-256 hash of canonical serialization
 */
export function computeCacheKey(inputs: CacheKeyInputs): CacheKey {
  const serialized = serializeCacheKeyInputs(inputs);
  const hash = crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
  return `cache:${hash}`;
}

/**
 * Compute content hash for artifact content
 * Returns SHA-256 hash of content string
 */
export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Debug display of cache key composition
 * Returns human-readable breakdown of key inputs
 */
export function debugCacheKey(inputs: CacheKeyInputs): string {
  const lines: string[] = [];

  lines.push('Cache Key Composition:');
  lines.push(`  Slice: ${inputs.sliceId}`);
  lines.push(`  Stage: ${inputs.stageId}`);
  lines.push(`  Identity: ${inputs.identity.sliceId}:${inputs.identity.stageId}:${inputs.identity.artifactType}:${inputs.identity.artifactId}`);

  lines.push(`  Input Artifacts (${inputs.inputArtifacts.length}):`);
  for (const input of inputs.inputArtifacts) {
    lines.push(`    - ${input.identity.artifactType}:${input.identity.artifactId} [${input.contentHash.slice(0, 8)}...]`);
  }

  lines.push(`  Dependency State:`);
  lines.push(`    Lifecycle: ${inputs.dependencyState.lifecycleState}`);
  lines.push(`    Gates: ${Object.keys(inputs.dependencyState.gates).length}`);
  for (const [gate, passed] of Object.entries(inputs.dependencyState.gates)) {
    lines.push(`      ${gate}: ${passed ? 'PASS' : 'FAIL'}`);
  }

  lines.push(`  Provider: ${inputs.providerConfig.provider}/${inputs.providerConfig.model}`);
  if (inputs.providerConfig.temperature !== undefined) {
    lines.push(`    Temperature: ${inputs.providerConfig.temperature}`);
  }
  if (inputs.providerConfig.maxTokens !== undefined) {
    lines.push(`    Max Tokens: ${inputs.providerConfig.maxTokens}`);
  }

  lines.push(`  Contract: ${inputs.contractVersion.contractHash.slice(0, 8)}... (schema ${inputs.contractVersion.schemaVersion})`);

  const key = computeCacheKey(inputs);
  lines.push(`  Final Key: ${key}`);

  return lines.join('\n');
}
