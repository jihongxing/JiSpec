# JiSpec AI 集成指南

## 概述

JiSpec 支持多种 AI 集成方式，你可以选择最适合你的工作流程的方式。

## 配置方式

在 `jiproject/jiproject.yaml` 中配置 AI provider：

```yaml
ai:
  provider: stdio  # 可选：stdio, command, http
  options:
    temperature: 0.7
    maxTokens: 4000
```

## Provider 类型

### 1. Stdio Provider（默认）

**适用场景**：手动操作、灵活集成、任何 AI 工具

**配置**：
```yaml
ai:
  provider: stdio
```

**使用流程**：
1. 运行命令：`npm run jispec -- agent run domain ordering-checkout-v1`
2. JiSpec 将提示保存到临时文件（如 `/tmp/jispec-prompt-1234567890.md`）
3. 你使用任何 AI 工具（Claude Desktop、ChatGPT、Cursor 等）生成输出
4. 将输出保存到文件
5. 输入输出文件路径

**优点**：
- 最灵活，支持任何 AI 工具
- 无需配置
- 可以手动审查和修改输出

---

### 2. Command Provider

**适用场景**：使用 CLI 工具（llm, aichat, ollama 等）

**配置**：
```yaml
ai:
  provider: command
  command:
    executable: llm
    args: ["-m", "gpt-4"]
  options:
    temperature: 0.7
    maxTokens: 4000
```

**支持的工具**：

#### llm (推荐)
```bash
# 安装
pip install llm

# 配置 OpenAI
llm keys set openai

# 配置 Anthropic
llm keys set anthropic

# 使用
npm run jispec -- agent run domain ordering-checkout-v1
```

配置示例：
```yaml
ai:
  provider: command
  command:
    executable: llm
    args: ["-m", "claude-3-5-sonnet-20241022"]
```

#### ollama
```bash
# 安装
curl https://ollama.ai/install.sh | sh

# 拉取模型
ollama pull llama3

# 使用
npm run jispec -- agent run domain ordering-checkout-v1
```

配置示例：
```yaml
ai:
  provider: command
  command:
    executable: ollama
    args: ["run", "llama3"]
```

---

### 3. HTTP Provider

**适用场景**：使用 HTTP API（Ollama、LM Studio、OpenAI-compatible APIs）

**配置**：
```yaml
ai:
  provider: http
  http:
    endpoint: http://localhost:11434/api/generate
    headers:
      Authorization: "Bearer ${OLLAMA_API_KEY}"
  options:
    temperature: 0.7
    maxTokens: 4000
```

**支持的服务**：

#### Ollama API
```bash
# 启动 Ollama
ollama serve

# 拉取模型
ollama pull llama3
```

配置示例：
```yaml
ai:
  provider: http
  http:
    endpoint: http://localhost:11434/api/generate
  options:
    model: llama3
    temperature: 0.7
```

#### LM Studio
```bash
# 1. 下载并启动 LM Studio
# 2. 加载模型
# 3. 启动本地服务器（默认端口 1234）
```

配置示例：
```yaml
ai:
  provider: http
  http:
    endpoint: http://localhost:1234/v1/chat/completions
  options:
    temperature: 0.7
```

---

## 推荐配置

### 开发环境（本地模型）
```yaml
ai:
  provider: http
  http:
    endpoint: http://localhost:11434/api/generate
  options:
    model: llama3
    temperature: 0.7
```

### 生产环境（云端 API）
```yaml
ai:
  provider: command
  command:
    executable: llm
    args: ["-m", "claude-3-5-sonnet-20241022"]
  options:
    temperature: 0.7
    maxTokens: 4000
```

### 手动审查模式
```yaml
ai:
  provider: stdio
```

---

## 最佳实践

1. **开发时使用 dry-run**
   ```bash
   npm run jispec -- agent run domain ordering-checkout-v1 --dry-run
   ```
   先查看提示，确保正确后再实际运行。

2. **使用本地模型进行测试**
   使用 Ollama 等本地模型进行快速迭代，避免 API 费用。

3. **生产环境使用高质量模型**
   使用 GPT-4 或 Claude 3.5 Sonnet 等高质量模型确保输出质量。

4. **保存提示历史**
   JiSpec 会将提示保存到临时文件，你可以保存这些文件用于调试和改进。

5. **验证输出**
   JiSpec 会自动验证输出，确保符合协议规范。

---

## 下一步

- 查看 [编排引擎实现计划](./orchestration-engine-plan-v0.1.md)
- 查看 [Agent 运行器实现记录](./agent-runner-implementation.md)
- 查看 [AI 集成设计](./ai-integration-design-v0.1.md)

---

**文档版本**：v1.0
**创建日期**：2026-04-24
**状态**：Complete
