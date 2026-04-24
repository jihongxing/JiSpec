import type { AgentRole } from "./agent-runner";
import type { LifecycleState } from "./validator";

/**
 * 已解析的文件路径（占位符已替换）
 */
export interface ResolvedFilePath {
  /** 原始路径模板 */
  template: string;
  /** 解析后的绝对路径 */
  resolved: string;
}

/**
 * 已解析的阶段契约
 *
 * 这是 pipeline.yaml 中阶段定义经过占位符替换后的最终契约。
 * StageRunner 使用这个契约来驱动 agent 执行。
 */
export interface ResolvedStageContract {
  /** 阶段 ID */
  stageId: string;

  /** 阶段名称 */
  stageName: string;

  /** Agent 角色 */
  role: AgentRole;

  /** 目标生命周期状态 */
  lifecycleState: LifecycleState;

  /** 输入文件列表 */
  inputs: ResolvedFilePath[];

  /** 输出文件列表 */
  outputs: ResolvedFilePath[];

  /** 需要设置的 gates */
  gates: string[];

  /** 是否需要 trace */
  traceRequired: boolean;
}

/**
 * 占位符替换上下文
 */
export interface PlaceholderContext {
  root: string;
  context: string;
  slice: string;
}

/**
 * 替换路径中的占位符
 *
 * 支持的占位符：
 * - {root} - 项目根目录
 * - {context} - 上下文 ID
 * - {slice} - 切片 ID
 * - <root> - 项目根目录（旧格式）
 * - <context-id> - 上下文 ID（旧格式）
 * - <slice-id> - 切片 ID（旧格式）
 */
export function resolvePlaceholders(template: string, context: PlaceholderContext): string {
  return template
    .replace(/\{root\}/g, context.root)
    .replace(/\{context\}/g, context.context)
    .replace(/\{slice\}/g, context.slice)
    .replace(/<root>/g, context.root)
    .replace(/<context-id>/g, context.context)
    .replace(/<slice-id>/g, context.slice);
}

/**
 * 阶段契约解析器
 *
 * 负责将 pipeline.yaml 中的路径模板解析为实际路径
 */
export class StageContractResolver {
  private context: PlaceholderContext;

  constructor(root: string, contextId: string, sliceId: string) {
    this.context = {
      root,
      context: contextId,
      slice: sliceId,
    };
  }

  /**
   * 解析文件路径列表
   */
  resolveFiles(templates: string[], schemas?: string[]): ResolvedFilePath[] {
    return templates.map((template) => ({
      template,
      resolved: resolvePlaceholders(template, this.context),
    }));
  }

  /**
   * 解析单个文件路径
   */
  resolveFile(template: string): ResolvedFilePath {
    return {
      template,
      resolved: resolvePlaceholders(template, this.context),
    };
  }
}
