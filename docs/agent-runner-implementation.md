# Agent 运行器实现记录

## 完成时间
2026-04-24

## 实现内容

### Phase 1: Agent 运行器基础 ✅ 已完成

实现了单个 Agent 的执行能力，包括：

#### 1. 命令实现 ✅
- ✅ 实现 `jispec agent run <role> <target>` 命令
- ✅ 支持 `--dry-run` 模式（只显示提示，不执行）
- ✅ 支持 `--output <file>` 指定输出文件

#### 2. 配置加载 ✅
- ✅ 读取 `agents/agents.yaml` 配置
- ✅ 验证 agent 角色存在
- ✅ 映射角色名到 agent ID：
  - `domain` → `domain-agent`
  - `design` → `design-agent`
  - `behavior` → `behavior-agent`
  - `test` → `test-agent`
  - `implement` → `build-agent`
  - `verify` → `review-agent`

#### 3. 上下文组装 ✅
- ✅ 识别输入文件（只读）
- ✅ 识别输出文件（可写）
- ✅ 组装提示上下文：
  - Agent 角色和描述
  - Slice 上下文信息
  - 输入文件内容
  - 输出文件规范
  - 约束规则（如果有）

#### 4. AI 调用 🔄 占位符实现
- ✅ 基础框架已实现
- ⏳ 待集成 Claude API（或其他 LLM）
- 当前返回占位符内容

#### 5. 输出处理 ✅
- ✅ 保存生成的文件
- ✅ 运行验证器检查输出
- ✅ 显示验证结果

## 文件清单

### 新增文件
- `tools/jispec/agent-runner.ts` - Agent 运行器核心实现
- `docs/orchestration-engine-plan-v0.1.md` - 编排引擎实现计划
- `docs/agent-runner-implementation.md` - 本文档

### 修改文件
- `tools/jispec/cli.ts` - 添加 `agent` 命令组

## 使用示例

### Dry-run 模式（查看提示）
```bash
npm run jispec -- agent run domain ordering-checkout-v1 --dry-run
```

输出示例：
```
=== DRY RUN MODE ===

Agent Context:
  Role: Extract domain concepts, language, invariants, and events.
  Slice: ordering-checkout-v1
  Context: ordering

Input Files (3):
  - docs\input\requirements.md ✓
  - jiproject\context-map.yaml ✓
  - contexts\ordering\domain\* ✗

Output Files (1):
  - contexts\ordering\domain\*

=== ASSEMBLED PROMPT ===

# Agent: domain-agent

Extract domain concepts, language, invariants, and events.

## Slice Context
- Slice ID: ordering-checkout-v1
- Title: Checkout MVP
- Goal: Allow users to submit an order from a valid cart...
- Current State: behavior-defined
- Priority: high

## Input Files (Read-Only)
...
```

### 实际运行（需要 AI 集成）
```bash
npm run jispec -- agent run domain ordering-checkout-v1
```

### 指定输出文件
```bash
npm run jispec -- agent run domain ordering-checkout-v1 --output contexts/ordering/domain/checkout.md
```

## 技术架构

### 核心接口

```typescript
// Agent 角色类型
type AgentRole = "domain" | "design" | "behavior" | "test" | "implement" | "verify";

// Agent 运行选项
interface AgentRunOptions {
  root: string;
  role: AgentRole;
  target: string;
  dryRun?: boolean;
  output?: string;
}

// Agent 配置（从 agents.yaml 加载）
interface AgentConfig {
  id: string;
  role: string; // 角色描述
  inputs: string[];
  outputs: string[];
  scope?: string[];
  constraints?: string[];
  prompt_template?: string;
}

// Agent 执行上下文
interface AgentContext {
  role: AgentRole;
  sliceId: string;
  contextId: string;
  slicePath: string;
  inputs: ReadonlyFile[];
  outputs: WritableFile[];
  constraints: string[];
  prompt: string;
}

// Agent 执行结果
interface AgentResult {
  success: boolean;
  role: AgentRole;
  sliceId: string;
  output?: string;
  outputPath?: string;
  validation?: {
    ok: boolean;
    errors: string[];
  };
  error?: string;
}
```

### 核心函数

1. **loadAgentConfig(root, role)** - 加载 agent 配置
2. **assembleAgentContext(root, config, sliceId)** - 组装执行上下文
3. **runAgent(options)** - 运行 agent（主入口）
4. **callAI(context)** - 调用 AI（待实现）
5. **formatAgentResult(result)** - 格式化结果输出

## 下一步工作

### 立即可做
1. **集成 Claude API**
   - 安装 `@anthropic-ai/sdk` 包
   - 实现 `callAI` 函数
   - 添加 API key 配置

2. **改进文件模式解析**
   - 当前 `<context-id>` 和 `<slice-id>` 占位符已支持
   - 需要实现 glob 模式匹配（如 `domain/*`）

3. **测试端到端流程**
   - 运行 domain agent 生成领域模型
   - 验证输出文件格式
   - 检查追溯链更新

### Phase 2: 单向约束执行器
参见 `docs/orchestration-engine-plan-v0.1.md`

## 验收标准

- ✅ 能够运行 `jispec agent run domain ordering-checkout-v1 --dry-run`
- ✅ 能够加载 agents.yaml 配置
- ✅ 能够组装包含输入文件的提示
- ⏳ 能够调用 AI 并保存输出（待 API 集成）
- ✅ 能够验证输出文件的格式

## 已知问题

1. **Glob 模式支持不完整**
   - 当前对 `domain/*` 等模式只是简单返回原始路径
   - 需要实现真正的 glob 匹配

2. **AI 调用未实现**
   - 当前返回占位符内容
   - 需要集成实际的 LLM API

3. **错误处理可以改进**
   - 需要更详细的错误信息
   - 需要更好的失败恢复机制

## 总结

Phase 1 的核心目标已经完成：**实现了单个 Agent 的执行框架**。

关键成果：
- ✅ 命令行接口完整
- ✅ 配置加载和验证
- ✅ 上下文组装和提示生成
- ✅ 输出验证集成
- ✅ Dry-run 模式可用于调试

这为后续的 Phase 2（单向约束执行器）和 Phase 3（流水线引擎）奠定了坚实的基础。

---

**文档版本**：v1.0
**创建日期**：2026-04-24
**状态**：Phase 1 Complete
