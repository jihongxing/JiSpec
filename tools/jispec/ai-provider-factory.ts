import type { AIConfig, AIProvider } from "./ai-provider";
import { CommandProvider } from "./providers/command-provider";
import { HttpProvider } from "./providers/http-provider";
import { StdioProvider } from "./providers/stdio-provider";

/**
 * AI Provider Factory
 * 根据配置创建相应的 AI Provider
 */
export class AIProviderFactory {
  /**
   * 根据配置创建 AI Provider
   */
  static create(config?: AIConfig): AIProvider {
    const providerType = config?.provider || "stdio";

    switch (providerType) {
      case "stdio":
        return new StdioProvider();

      case "command": {
        if (!config?.command?.executable) {
          throw new Error("Command provider requires 'command.executable' in config");
        }
        return new CommandProvider(
          config.command.executable,
          config.command.args || []
        );
      }

      case "http": {
        if (!config?.http?.endpoint) {
          throw new Error("HTTP provider requires 'http.endpoint' in config");
        }
        return new HttpProvider(
          config.http.endpoint,
          config.http.headers || {}
        );
      }

      default:
        throw new Error(
          `Unknown AI provider: ${providerType}. Valid providers: stdio, command, http`
        );
    }
  }

  /**
   * 列出所有可用的 provider 类型
   */
  static listProviders(): string[] {
    return ["stdio", "command", "http"];
  }
}
