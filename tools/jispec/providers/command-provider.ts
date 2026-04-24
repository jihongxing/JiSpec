import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { AIProvider, GenerateOptions } from "../ai-provider";

const execAsync = promisify(exec);

/**
 * Command Provider - 通过命令行工具调用 AI
 * 支持任何接受提示文件并输出结果的 CLI 工具
 * 例如：llm, aichat, ollama, etc.
 */
export class CommandProvider implements AIProvider {
  name = "command";

  constructor(
    private executable: string,
    private args: string[] = []
  ) {}

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    // 1. 将提示写入临时文件
    const promptFile = path.join(os.tmpdir(), `jispec-prompt-${Date.now()}.md`);
    fs.writeFileSync(promptFile, prompt, "utf-8");

    // 2. 构建命令
    const cmdArgs = [...this.args];

    // 添加选项参数（如果支持）
    if (options?.temperature !== undefined) {
      cmdArgs.push("--temperature", String(options.temperature));
    }
    if (options?.maxTokens !== undefined) {
      cmdArgs.push("--max-tokens", String(options.maxTokens));
    }

    // 添加提示文件路径
    cmdArgs.push(promptFile);

    const command = `${this.executable} ${cmdArgs.join(" ")}`;

    console.log(`\nExecuting: ${command}\n`);

    // 3. 执行命令
    try {
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      if (stderr) {
        console.error(`Warning: ${stderr}`);
      }

      return stdout.trim();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Command execution failed: ${message}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // 检查命令是否存在
      await execAsync(`which ${this.executable}`);
      return true;
    } catch {
      return false;
    }
  }
}
