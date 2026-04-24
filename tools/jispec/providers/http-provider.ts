import type { AIProvider, GenerateOptions } from "../ai-provider";

/**
 * HTTP Provider - 通过 HTTP API 调用 AI
 * 支持任何提供 HTTP API 的 LLM 服务
 * 例如：Ollama, LM Studio, OpenAI-compatible APIs, etc.
 */
export class HttpProvider implements AIProvider {
  name = "http";

  constructor(
    private endpoint: string,
    private headers: Record<string, string> = {}
  ) {}

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    console.log(`\nCalling HTTP endpoint: ${this.endpoint}\n`);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.headers,
        },
        body: JSON.stringify({
          prompt,
          temperature: options?.temperature,
          max_tokens: options?.maxTokens,
          stop: options?.stopSequences,
          ...options,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      // 尝试从不同的响应格式中提取输出
      const output =
        data.output ||
        data.text ||
        data.content ||
        data.response ||
        data.choices?.[0]?.text ||
        data.choices?.[0]?.message?.content ||
        "";

      if (!output) {
        throw new Error("No output found in API response");
      }

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`HTTP API call failed: ${message}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // 尝试 HEAD 请求检查端点是否可用
      const response = await fetch(this.endpoint, {
        method: "HEAD",
        headers: this.headers,
      });
      return response.ok || response.status === 405; // 405 = Method Not Allowed (但端点存在)
    } catch {
      return false;
    }
  }
}
