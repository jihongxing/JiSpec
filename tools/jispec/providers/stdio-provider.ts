import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import type { AIProvider, GenerateOptions } from "../ai-provider";

/**
 * Stdio Provider - 通过标准输入/输出与用户交互
 * 这是默认的 provider，适合手动操作或与任何 AI 工具集成
 */
export class StdioProvider implements AIProvider {
  name = "stdio";

  async generate(prompt: string, _options?: GenerateOptions): Promise<string> {
    // 1. 将提示写入临时文件
    const promptFile = path.join(os.tmpdir(), `jispec-prompt-${Date.now()}.md`);
    fs.writeFileSync(promptFile, prompt, "utf-8");

    // 2. 打印提示信息
    console.log(`\n${"=".repeat(60)}`);
    console.log("AI Input Ready");
    console.log("=".repeat(60));
    console.log(`\nPrompt saved to: ${promptFile}`);
    console.log(`\nInstructions:`);
    console.log(`1. Open the prompt file and read the task`);
    console.log(`2. Generate the output using your preferred AI tool`);
    console.log(`3. Save the output to a file`);
    console.log(`4. Enter the output file path below\n`);

    // 3. 等待用户输入输出文件路径
    const outputFile = await this.readUserInput("Output file path: ");

    // 4. 验证输出文件存在
    if (!fs.existsSync(outputFile)) {
      throw new Error(`Output file not found: ${outputFile}`);
    }

    // 5. 读取输出文件
    const output = fs.readFileSync(outputFile, "utf-8");

    console.log(`\n✓ Output loaded (${output.length} characters)\n`);

    return output;
  }

  async isAvailable(): Promise<boolean> {
    return true; // 总是可用
  }

  private async readUserInput(prompt: string): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(prompt, (answer: string) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }
}
