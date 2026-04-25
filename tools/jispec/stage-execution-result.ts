import type { ArtifactIdentity } from "./artifact-identity";

/**
 * 写入操作类型
 */
export type WriteOperationType = "file" | "directory";

/**
 * 写入操作（支持文件和目录）
 */
export interface WriteOperation {
  type: WriteOperationType;
  path: string;           // 文件或目录路径
  content?: string;       // 文件内容（仅 type=file 时使用）
  encoding?: string;      // 编码（默认 utf-8）
  identity?: ArtifactIdentity;  // 逻辑身份（可选，用于 identity-first 模式）
}

/**
 * 文件写入操作（向后兼容）
 */
export interface FileWrite {
  path: string;           // 文件路径
  content: string;        // 文件内容
  encoding?: string;      // 编码（默认 utf-8）
  identity?: ArtifactIdentity;  // 逻辑身份（可选，用于 identity-first 模式）
}

/**
 * 门控更新操作
 */
export interface GateUpdate {
  gate: string;           // 门控名称
  passed: boolean;        // 是否通过
  reason?: string;        // 原因说明
}

/**
 * 追溯链接
 */
export interface TraceLink {
  from: {
    type: string;         // 源类型（requirement, invariant, scenario, test, code）
    id: string;           // 源 ID
    identity?: ArtifactIdentity;  // 逻辑身份（可选，用于 identity-first 模式）
  };
  to: {
    type: string;         // 目标类型
    id: string;           // 目标 ID
    identity?: ArtifactIdentity;  // 逻辑身份（可选，用于 identity-first 模式）
  };
  relation: string;       // 关系类型（refines, verified_by, covered_by, implemented_by）
}

/**
 * 验证证据
 */
export interface Evidence {
  type: string;           // 证据类型（test_output, trace, validation）
  content: string;        // 证据内容
  timestamp: string;      // 时间戳
  metadata?: Record<string, unknown>;  // 额外元数据
  identity?: ArtifactIdentity;  // 逻辑身份（可选，用于 identity-first 模式）
}

/**
 * 阶段执行结果（结构化）
 */
export interface StageExecutionResult {
  success: boolean;
  writes: FileWrite[];           // 向后兼容，保留 FileWrite[]
  writeOperations?: WriteOperation[];  // 新的写入操作模型
  gateUpdates: GateUpdate[];
  traceLinks: TraceLink[];
  evidence: Evidence[];
  error?: string;
}
