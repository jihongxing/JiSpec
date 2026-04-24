# JiSpec 编排引擎实现计划 v0.1

## 项目愿景

JiSpec 的核心目标是实现 **DDD → SDD → BDD → TDD** 的全自动串联，构建一个基于"单向不可逆约束"的流水线引擎。

### 核心洞察

现代 AI 不缺生成内容的能力，缺的是**生成项目的编排能力**。JiSpec 通过协议层约束和流水线编排，让大型项目变得：

- ✅ **可追溯**：从需求到代码的完整追溯链
- ✅ **可编排**：自动化的阶段流转和 Agent 协作
- ✅ **可验证**：每个阶段的门控和验证机制
- ✅ **可审计**：结构化工件和变更历史
- ✅ **可测试**：从行为定义到测试用例的自动派生

## 核心理念：单向不可逆约束流水线

```
DDD (领域模型: context.yaml, contracts.yaml)
  ↓ [不可逆约束]
SDD (规格定义: requirements.md)
  ↓ [不可逆约束]
BDD (行为定义: behaviors.feature)
  ↓ [不可逆约束]
TDD (测试定义: test-spec.yaml)
  ↓ [不可逆约束]
Implementation (实现: 代码)
  ↓ [不可逆约束]
Verification (验证: evidence.md)
```

### 单向约束原则

每个阶段：

1. **输入只读**：上一阶段的产物是不可变的输入
2. **输出可写**：只能修改本阶段的产物
3. **门控必过**：必须通过验证才能推进到下一阶段
4. **追溯必连**：必须建立到上游产物的追溯链
5. **状态单向**：只能前进，不能回退（除非显式回滚）

## 架构设计

### 1. 协议层（Protocol Layer）✅ 已完成

- 文件结构规范
- JSON Schema 定义
- 生命周期状态机
- 追溯链机制
- 门控机制

### 2. 验证层（Validation Layer）✅ 已完成

- JSON Schema 验证
- 语义验证（跨文件引用）
- 追溯完整性检查
- 生命周期状态检查
- 任务依赖验证

### 3. 工具层（Tooling Layer）✅ 已完成

- CLI 命令（validate, slice, context, trace, artifact）
- CI 集成（GitHub Actions）
- 状态查询和更新

### 4. 编排层（Orchestration Layer）❌ 待实现

这是本计划的核心目标，包括：

- **Agent 运行器**：执行单个 Agent 任务
- **约束执行器**：强制单向约束规则
- **流水线引擎**：自动化阶段流转
- **人工介入点**：关键决策的 human-in-the-loop

## 实现路线图

### Phase 1: Agent 运行器基础（1-2 天）

**目标**：实现单个 Agent 的执行能力

#### 任务清单

1. **命令实现**
   - [ ] 实现 `jispec agent run <role> <target>` 命令
   - [ ] 支持 `--dry-run` 模式（只显示提示，不执行）
   - [ ] 支持 `--output <file>` 指定输出文件

2. **配置加载**
   - [ ] 读取 `agents/agents.yaml` 配置
   - [ ] 验证 agent 角色存在
   - [ ] 加载角色的提示模板

3. **上下文组装**
   - [ ] 识别输入文件（只读）
   - [ ] 识别输出文件（可写）
   - [ ] 组装提示上下文：
     - 角色定义
     - 输入文件内容
     - 输出文件规范
     - 约束规则

4. **AI 调用**
   - [ ] 集成 Claude API（或其他 LLM）
   - [ ] 传递组装好的提示
   - [ ] 接收生成的内容

5. **输出处理**
   - [ ] 保存生成的文件
   - [ ] 运行验证器检查输出
   - [ ] 显示验证结果

#### 技术实现

```typescript
// tools/jispec/agent-runner.ts

interface AgentRunOptions {
  role: string;           // domain, design, behavior, test, implement, verify
  target: string;         // slice-id or context-id
  dryRun?: boolean;       // 只显示提示，不执行
  output?: string;        // 指定输出文件
}

interface AgentContext {
  role: AgentRole;
  inputs: ReadonlyFile[];   // 只读输入文件
  outputs: WritableFile[];  // 可写输出文件
  constraints: Constraint[]; // 约束规则
  prompt: string;           // 组装好的提示
}

class AgentRunner {
  async run(options: AgentRunOptions): Promise<AgentResult> {
    // 1. 加载配置
    const config = await this.loadAgentConfig(options.role);

    // 2. 组装上下文
    const context = await this.assembleContext(config, options.target);

    // 3. 调用 AI
    const output = await this.callAI(context);

    // 4. 保存输出
    await this.saveOutput(output, context.outputs);

    // 5. 验证输出
    const validation = await this.validate(context.outputs);

    return { output, validation };
  }
}
```

#### 验收标准

- [ ] 能够运行 `jispec agent run domain ordering-checkout-v1`
- [ ] 能够加载 agents.yaml 配置
- [ ] 能够组装包含输入文件的提示
- [ ] 能够调用 AI 并保存输出
- [ ] 能够验证输出文件的格式

### Phase 2: 单向约束执行器（2-3 天）

**目标**：强制执行单向不可逆约束

#### 任务清单

1. **输入保护**
   - [ ] 实现输入文件的只读保护
   - [ ] 检测对输入文件的修改尝试
   - [ ] 提供清晰的错误信息

2. **输出验证**
   - [ ] 验证输出文件符合 Schema
   - [ ] 验证输出文件的追溯链
   - [ ] 验证输出文件的语义正确性

3. **门控检查**
   - [ ] 自动检查当前阶段的门控条件
   - [ ] 提供门控未通过的详细原因
   - [ ] 支持手动设置门控状态

4. **追溯链更新**
   - [ ] 自动生成追溯链条目
   - [ ] 更新 trace.yaml 文件
   - [ ] 验证追溯链的完整性

#### 技术实现

```typescript
// tools/jispec/constraint-enforcer.ts

interface Constraint {
  type: 'readonly' | 'writable' | 'gate' | 'trace';
  target: string;
  rule: ConstraintRule;
}

class ConstraintEnforcer {
  async enforce(context: AgentContext, output: AgentOutput): Promise<EnforcementResult> {
    // 1. 检查输入文件未被修改
    await this.checkInputsUnmodified(context.inputs);

    // 2. 验证输出文件
    await this.validateOutputs(context.outputs, output);

    // 3. 检查门控条件
    await this.checkGates(context.gates);

    // 4. 更新追溯链
    await this.updateTrace(context.trace, output);

    return { passed: true, violations: [] };
  }
}
```

#### 验收标准

- [ ] 尝试修改输入文件时报错
- [ ] 输出文件不符合 Schema 时报错
- [ ] 门控未通过时无法推进状态
- [ ] 追溯链自动更新并验证通过

### Phase 3: 流水线引擎（3-5 天）

**目标**：实现全自动的阶段流转

#### 任务清单

1. **流水线定义**
   - [ ] 创建 `agents/pipeline.yaml` 配置
   - [ ] 定义每个阶段的输入、输出、门控
   - [ ] 定义阶段之间的依赖关系

2. **自动流转**
   - [ ] 实现 `jispec pipeline run <slice-id>` 命令
   - [ ] 自动检查当前状态
   - [ ] 自动运行对应的 agent
   - [ ] 自动验证输出
   - [ ] 自动推进到下一状态
   - [ ] 循环直到完成或失败

3. **失败处理**
   - [ ] 记录失败原因
   - [ ] 支持从失败点恢复
   - [ ] 支持回滚到上一状态

4. **人工介入**
   - [ ] 在关键决策点暂停
   - [ ] 等待人工审核
   - [ ] 支持人工修改后继续

#### 技术实现

```typescript
// tools/jispec/pipeline-engine.ts

interface PipelineStage {
  name: string;
  agent: string;
  inputs: string[];
  outputs: string[];
  gates: string[];
  humanReview?: boolean;
}

class PipelineEngine {
  async run(sliceId: string, options: PipelineOptions): Promise<PipelineResult> {
    const slice = await this.loadSlice(sliceId);
    const pipeline = await this.loadPipeline();

    let currentStage = this.getCurrentStage(slice.lifecycle.state);

    while (currentStage) {
      console.log(`Running stage: ${currentStage.name}`);

      // 1. 运行 agent
      const agentResult = await this.agentRunner.run({
        role: currentStage.agent,
        target: sliceId
      });

      // 2. 强制约束
      const enforcement = await this.constraintEnforcer.enforce(
        currentStage,
        agentResult
      );

      if (!enforcement.passed) {
        return { success: false, stage: currentStage.name, errors: enforcement.violations };
      }

      // 3. 检查门控
      const gatesPassed = await this.checkGates(currentStage.gates, sliceId);

      if (!gatesPassed) {
        return { success: false, stage: currentStage.name, reason: 'Gates not passed' };
      }

      // 4. 人工审核
      if (currentStage.humanReview) {
        const approved = await this.requestHumanReview(currentStage, agentResult);
        if (!approved) {
          return { success: false, stage: currentStage.name, reason: 'Human review rejected' };
        }
      }

      // 5. 推进状态
      await this.advanceState(sliceId, currentStage.nextState);

      // 6. 下一阶段
      currentStage = this.getNextStage(currentStage);
    }

    return { success: true, completedStages: pipeline.stages.length };
  }
}
```

#### 验收标准

- [ ] 能够运行 `jispec pipeline run ordering-checkout-v1`
- [ ] 自动从 `requirements-defined` 推进到 `verified`
- [ ] 每个阶段的输出都通过验证
- [ ] 失败时能够显示详细错误信息
- [ ] 支持从失败点恢复

### Phase 4: 端到端演示（1-2 天）

**目标**：完整的使用文档和演示

#### 任务清单

1. **使用指南**
   - [ ] 编写 `docs/getting-started.md`
   - [ ] 编写 `docs/pipeline-guide.md`
   - [ ] 编写 `docs/agent-guide.md`

2. **演示项目**
   - [ ] 创建一个新的示例切片
   - [ ] 从空白到完整实现的全流程
   - [ ] 录制演示视频或截图

3. **故障排查**
   - [ ] 编写 `docs/troubleshooting.md`
   - [ ] 记录常见错误和解决方案
   - [ ] 提供调试技巧

4. **API 文档**
   - [ ] 生成 TypeScript API 文档
   - [ ] 编写扩展指南（如何添加新的 agent）

#### 验收标准

- [ ] 新用户能够在 10 分钟内运行第一个流水线
- [ ] 文档覆盖所有核心功能
- [ ] 演示视频清晰展示价值主张
- [ ] 故障排查文档覆盖 80% 的常见问题

## 技术栈

- **语言**：TypeScript
- **CLI 框架**：Commander.js
- **验证**：Ajv (JSON Schema)
- **AI 集成**：Anthropic Claude API（可扩展到其他 LLM）
- **测试**：Vitest
- **CI/CD**：GitHub Actions

## 成功指标

1. **自动化率**：从需求到验证的自动化率达到 80%+
2. **验证通过率**：生成的工件首次验证通过率达到 90%+
3. **追溯完整性**：100% 的代码都能追溯到需求
4. **人工介入点**：平均每个切片需要人工介入 ≤ 3 次
5. **时间节省**：相比传统开发流程节省 50%+ 的时间

## 风险和挑战

1. **AI 输出质量**：AI 生成的内容可能不符合预期
   - 缓解：通过严格的验证和门控机制
   - 缓解：提供高质量的提示模板

2. **约束过于严格**：单向约束可能限制灵活性
   - 缓解：提供显式的回滚机制
   - 缓解：允许人工介入修改

3. **学习曲线**：新概念需要时间理解
   - 缓解：提供详细的文档和示例
   - 缓解：提供交互式的教程

4. **工具集成**：与现有工具链的集成
   - 缓解：提供插件机制
   - 缓解：支持自定义 agent

## 下一步行动

1. **立即开始**：Phase 1 - Agent 运行器基础
2. **并行准备**：设计 `agents/pipeline.yaml` 的结构
3. **持续验证**：每个 Phase 完成后运行端到端测试

---

**文档版本**：v0.1
**创建日期**：2026-04-24
**作者**：JiSpec Team
**状态**：Draft
