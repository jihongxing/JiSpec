# JiSpec AI 集成设计 v0.1

## 设计原则

JiSpec 是一个**协议优先、模型无关**的编排引擎，不应该绑定到任何特定的 LLM 提供商。

### 核心理念

1. **协议层与执行层分离**
   - JiSpec 负责：协议定义、验证、编排、追溯
   - AI 层负责：内容生成
   - 两者通过标准接口解耦

2. **多种集成方式**
   - 标准输入/输出（stdin/stdout）
   - HTTP API
   - 命令行工具
   - 本地模型
   - 云端服务

3. **用户自主选择**
   - 用户决定使用哪个模型
   - 用户决定如何调用模型
   - JiSpec 只负责组装提示和验证输出

## 架构设计

### 1. AI Provider 接口

```typescript
// tools/jispec/ai-provider.ts

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

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  [key: string]: any; // 允许 provider 特定的选项
}
```

### 2. 内置 Provider 实现

#### 2.1 Stdio Provider（推荐）

通过标准输入/输出与任何 AI 工具交互：

```typescript
// tools/jispec/providers/stdio-provider.ts

export class StdioProvider implements AIProvider {
  name = "stdio";

  async generate(prompt: string): Promise<string> {
    // 1. 将提示写入临时文件
    const promptFile = path.join(os.tmpdir(), `jispec-prompt-${Date.now()}.md`);
    fs.writeFileSync(promptFile, prompt);

    // 2. 打印提示文件路径
    console.log(`\n=== AI Input ===`);
    console.log(`Prompt saved to: ${promptFile}`);
    console.log(`\nPlease generate the output and save it to a file.`);
    console.log(`Then enter the output file path:\n`);

    // 3. 等待用户输入输出文件路径
    const outputFile = await this.readUserInput();

    // 4. 读取输出文件
    if (!fs.existsSync(outputFile)) {
      throw new Error(`Output file not found: ${outputFile}`);
    }

    return fs.readFileSync(outputFile, "utf-8");
  }

  async isAvailable(): Promise<boolean> {
    return true; // 总是可用
  }

  private async readUserInput(): Promise<string> {
    // 使用 readline 读取用户输入
    const readline = require("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question("Output file path: ", (answer: string) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }
}
```

#### 2.2 Command Provider

通过命令行工具调用 AI：

```typescript
// tools/jispec/providers/command-provider.ts

export class CommandProvider implements AIProvider {
  name = "command";

  constructor(private command: string) {}

  async generate(prompt: string): Promise<string> {
    // 1. 将提示写入临时文件
    const promptFile = path.join(os.tmpdir(), `jispec-prompt-${Date.now()}.md`);
    fs.writeFileSync(promptFile, prompt);

    // 2. 执行命令，传入提示文件路径
    const { stdout } = await execAsync(`${this.command} "${promptFile}"`);

    return stdout;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execAsync(`which ${this.command.split(" ")[0]}`);
      return true;
    } catch {
      return false;
    }
  }
}
```

#### 2.3 HTTP Provider

通过 HTTP API 调用 AI：

```typescript
// tools/jispec/providers/http-provider.ts

export class HttpProvider implements AIProvider {
  name = "http";

  constructor(
    private endpoint: string,
    private headers: Record<string, string> = {}
  ) {}

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
      },
      body: JSON.stringify({
        prompt,
        ...options,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.output || data.text || data.content || "";
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(this.endpoint, { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

#### 2.4 Claude Desktop Provider

通过 Claude Desktop 的 MCP 协议调用：

```typescript
// tools/jispec/providers/claude-desktop-provider.ts

export class ClaudeDesktopProvider implements AIProvider {
  name = "claude-desktop";

  async generate(prompt: string): Promise<string> {
    // 1. 将提示写入临时文件
    const promptFile = path.join(os.tmpdir(), `jispec-prompt-${Date.now()}.md`);
    fs.writeFileSync(promptFile, prompt);

    // 2. 打开 Claude Desktop 并传入提示
    console.log(`\n=== Claude Desktop Integration ===`);
    console.log(`Prompt saved to: ${promptFile}`);
    console.log(`\nOpening Claude Desktop...`);

    // 3. 使用 MCP 协议或 URL scheme 打开 Claude Desktop
    await execAsync(`open "claude://prompt?file=${encodeURIComponent(promptFile)}"`);

    // 4. 等待用户在 Claude Desktop 中完成并保存输出
    console.log(`\nPlease complete the task in Claude Desktop and save the output.`);
    console.log(`Then enter the output file path:\n`);

    const outputFile = await this.readUserInput();
    return fs.readFileSync(outputFile, "utf-8");
  }

  async isAvailable(): Promise<boolean> {
    // 检查 Claude Desktop 是否安装
    try {
      await execAsync("which claude");
      return true;
    } catch {
      return false;
    }
  }
}
```

### 3. Provider 配置

用户可以在 `jiproject/jiproject.yaml` 中配置 AI provider：

```yaml
# jiproject/jiproject.yaml

ai:
  # Provider 类型：stdio, command, http, claude-desktop
  provider: stdio

  # Command provider 配置
  command:
    executable: "llm"  # 使用 Simon Willison 的 llm CLI
    args: ["--model", "gpt-4"]

  # HTTP provider 配置
  http:
    endpoint: "http://localhost:11434/api/generate"  # Ollama
    headers:
      Authorization: "Bearer ${OLLAMA_API_KEY}"

  # 生成选项
  options:
    temperature: 0.7
    maxTokens: 4000
```

### 4. Provider 工厂

```typescript
// tools/jispec/ai-provider-factory.ts

export class AIProviderFactory {
  static create(config: any): AIProvider {
    const providerType = config.ai?.provider || "stdio";

    switch (providerType) {
      case "stdio":
        return new StdioProvider();

      case "command":
        const cmd = config.ai?.command?.executable || "llm";
        const args = config.ai?.command?.args || [];
        return new CommandProvider(`${cmd} ${args.join(" ")}`);

      case "http":
        const endpoint = config.ai?.http?.endpoint;
        const headers = config.ai?.http?.headers || {};
        return new HttpProvider(endpoint, headers);

      case "claude-desktop":
        return new ClaudeDesktopProvider();

      default:
        throw new Error(`Unknown AI provider: ${providerType}`);
    }
  }
}
```

### 5. 更新 Agent Runner

```typescript
// tools/jispec/agent-runner.ts

async function callAI(context: AgentContext): Promise<string> {
  // 1. 加载 provider 配置
  const projectConfig = loadProjectConfig(context.root);
  const provider = AIProviderFactory.create(projectConfig);

  // 2. 检查 provider 是否可用
  if (!await provider.isAvailable()) {
    throw new Error(`AI provider '${provider.name}' is not available`);
  }

  // 3. 调用 provider 生成内容
  console.log(`\nUsing AI provider: ${provider.name}`);
  const output = await provider.generate(context.prompt, projectConfig.ai?.options);

  return output;
}
```

## 使用场景

### 场景 1：使用 Simon Willison 的 llm CLI

```yaml
# jiproject/jiproject.yaml
ai:
  provider: command
  command:
    executable: llm
    args: ["-m", "gpt-4"]
```

```bash
# 安装 llm
pip install llm

# 配置 API key
llm keys set openai

# 运行 agent
npm run jispec -- agent run domain ordering-checkout-v1
```

### 场景 2：使用 Ollama 本地模型

```yaml
# jiproject/jiproject.yaml
ai:
  provider: http
  http:
    endpoint: http://localhost:11434/api/generate
  options:
    model: llama3
    temperature: 0.7
```

```bash
# 启动 Ollama
ollama serve

# 运行 agent
npm run jispec -- agent run domain ordering-checkout-v1
```

### 场景 3：使用 Claude Desktop

```yaml
# jiproject/jiproject.yaml
ai:
  provider: claude-desktop
```

```bash
# 运行 agent（会自动打开 Claude Desktop）
npm run jispec -- agent run domain ordering-checkout-v1
```

### 场景 4：手动模式（默认）

```yaml
# jiproject/jiproject.yaml
ai:
  provider: stdio
```

```bash
# 运行 agent
npm run jispec -- agent run domain ordering-checkout-v1

# 输出：
# === AI Input ===
# Prompt saved to: /tmp/jispec-prompt-1234567890.md
#
# Please generate the output and save it to a file.
# Then enter the output file path:
#
# Output file path: /path/to/output.md
```

## 推荐工具

### 1. llm CLI (Simon Willison)
- 支持多个模型（OpenAI, Anthropic, Ollama, etc.）
- 简单易用
- 安装：`pip install llm`

### 2. Ollama
- 本地运行开源模型
- 支持 Llama 3, Mistral, etc.
- 安装：`curl https://ollama.ai/install.sh | sh`

### 3. LM Studio
- 图形化界面
- 本地运行模型
- 提供 HTTP API

### 4. Claude Desktop
- 官方客户端
- 最佳体验
- 支持 MCP 协议

## 优势

1. **模型无关**：支持任何 LLM（OpenAI, Anthropic, Ollama, etc.）
2. **平台无关**：支持云端和本地模型
3. **灵活集成**：支持多种调用方式（CLI, HTTP, stdio）
4. **用户自主**：用户完全控制使用哪个模型
5. **成本可控**：可以使用免费的本地模型
6. **隐私保护**：可以完全离线运行

## 下一步实现

1. **Phase 1.5: AI Provider 抽象层**（1 天）
   - 实现 AIProvider 接口
   - 实现 StdioProvider（默认）
   - 实现 CommandProvider
   - 实现 HttpProvider
   - 更新 agent-runner.ts

2. **Phase 1.6: 配置和文档**（0.5 天）
   - 添加 jiproject.yaml 配置支持
   - 编写集成指南
   - 提供示例配置

3. **Phase 2: 单向约束执行器**（继续原计划）

---

**文档版本**：v0.1
**创建日期**：2026-04-24
**状态**：Design
