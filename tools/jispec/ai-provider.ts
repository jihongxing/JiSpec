/**
 * AI Provider 接口
 * 所有 AI 集成都必须实现这个接口
 */
export interface AIProvider {
  name: string;

  /**
   * 调用 AI 生成内容
   * @param prompt - 组装好的提示
   * @param options - 可选的生成参数
   * @returns 生成的内容
   */
  generate(prompt: string, options?: GenerateOptions): Promise<string>;

  /**
   * 检查 provider 是否可用
   */
  isAvailable(): Promise<boolean>;
}

/**
 * 生成选项
 */
export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  [key: string]: any; // 允许 provider 特定的选项
}

/**
 * AI 配置（从 jiproject.yaml 加载）
 */
export interface AIConfig {
  provider?: string;
  command?: {
    executable: string;
    args?: string[];
  };
  http?: {
    endpoint: string;
    headers?: Record<string, string>;
  };
  options?: GenerateOptions;
}
