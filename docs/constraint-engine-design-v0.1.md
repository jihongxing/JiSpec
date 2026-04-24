# JiSpec 约束执行引擎设计文档 v0.1

## 概述

约束执行引擎（Constraint Engine）是 JiSpec 编排系统的核心组件，负责实现**单向不可逆约束**，确保 DDD → SDD → BDD → TDD 流水线的每个阶段都遵循协议规则。

## 设计原则

### 1. 单向不可逆（One-Way Irreversible）

```
DDD (领域模型)
  ↓ [只读约束]
SDD (规格定义) ← 不能修改 DDD
  ↓ [只读约束]
BDD (行为定义) ← 不能修改 DDD/SDD
  ↓ [只读约束]
TDD (测试定义) ← 不能修改 DDD/SDD/BDD
  ↓ [只读约束]
Implementation ← 不能修改 DDD/SDD/BDD/TDD
```

**核心规则**：
- 每个阶段只能读取上游产物，不能修改
- 每个阶段只能写入本阶段的产物
- 违反约束的操作必须被拒绝

### 2. 门控检查（Gate Checking）

每个阶段完成后，必须通过门控检查才能推进到下一阶段：

```yaml
gates:
  requirements_ready: true   # 需求已完成
  design_ready: false        # 设计未完成
  behavior_ready: false
  test_ready: false
  implementation_ready: false
  verification_ready: false
```

### 3. 追溯链完整性（Trace Integrity）

每个产物必须追溯到上游产物：

```yaml
# behaviors.feature 必须追溯到 requirements.md
trace:
  - from: behaviors.feature#scenario-1
    to: requirements.md#FR-001
    type: implements
```

### 4. 输出验证（Output Validation）

每个阶段的输出必须通过：
- Schema 验证（JSON Schema）
- 语义验证（跨文件引用）
- 追溯验证（追溯链完整性）
- 门控验证（必须的门控已设置）

## 架构设计

### 核心组件

```
┌─────────────────────────────────────────┐
│      Constraint Execution Engine        │
├─────────────────────────────────────────┤
│                                         │
│  ┌───────────────────────────────────┐ │
│  │   Input Constraint Checker        │ │
│  │   - 检查输入文件是否只读          │ │
│  │   - 防止修改上游产物              │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │   Output Validator                │ │
│  │   - Schema 验证                   │ │
│  │   - 语义验证                      │ │
│  │   - 追溯验证                      │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │   Gate Checker                    │ │
│  │   - 检查门控状态                  │ │
│  │   - 自动更新门控                  │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │   Trace Manager                   │ │
│  │   - 自动生成追溯链                │ │
│  │   - 验证追溯完整性                │ │
│  └───────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

### 数据流

```
1. Agent 请求执行
   ↓
2. Input Constraint Checker
   - 加载输入文件列表
   - 标记为只读
   - 创建文件快照（用于检测修改）
   ↓
3. Agent 执行（通过 AI Provider）
   - 读取输入文件（允许）
   - 写入输出文件（允许）
   - 修改输入文件（拒绝）
   ↓
4. Output Validator
   - 验证输出文件格式
   - 验证语义正确性
   - 验证追溯链
   ↓
5. Gate Checker
   - 检查必须的门控
   - 自动更新门控状态
   ↓
6. Trace Manager
   - 更新 trace.yaml
   - 记录产物关系
   ↓
7. 返回结果
```

## 实现计划

### Phase 2.1: Input Constraint Checker（0.5 天）

**文件**：`tools/jispec/constraint-checker.ts`

**功能**：
- 加载阶段的输入文件列表
- 创建文件内容快照（hash）
- 执行后检查文件是否被修改
- 如果被修改，报错并回滚

**接口**：
```typescript
interface InputConstraint {
  files: string[];           // 输入文件路径
  allowRead: boolean;        // 是否允许读取（默认 true）
  allowWrite: boolean;       // 是否允许写入（默认 false）
}

class InputConstraintChecker {
  // 创建约束检查器
  static create(inputs: InputConstraint): InputConstraintChecker;

  // 创建文件快照
  snapshot(): Promise<void>;

  // 验证文件未被修改
  verify(): Promise<ConstraintCheckResult>;
}
```

### Phase 2.2: Output Validator（0.5 天）

**文件**：`tools/jispec/output-validator.ts`

**功能**：
- 验证输出文件存在
- 验证输出文件格式（Schema）
- 验证输出文件语义（跨文件引用）
- 验证追溯链完整性

**接口**：
```typescript
interface OutputConstraint {
  files: string[];           // 输出文件路径
  schemas?: string[];        // 对应的 Schema 文件
  traceRequired: boolean;    // 是否需要追溯链
}

class OutputValidator {
  // 创建验证器
  static create(outputs: OutputConstraint): OutputValidator;

  // 验证输出
  validate(): Promise<ValidationResult>;
}
```

### Phase 2.3: Gate Checker（0.5 天）

**文件**：`tools/jispec/gate-checker.ts`

**功能**：
- 检查当前阶段的门控状态
- 自动更新门控（如果验证通过）
- 检查是否可以推进到下一阶段

**接口**：
```typescript
interface GateConstraint {
  required: string[];        // 必须通过的门控
  optional: string[];        // 可选的门控
  autoUpdate: boolean;       // 是否自动更新门控
}

class GateChecker {
  // 创建门控检查器
  static create(sliceId: string, gates: GateConstraint): GateChecker;

  // 检查门控
  check(): Promise<GateCheckResult>;

  // 更新门控
  update(gate: string, value: boolean): Promise<void>;
}
```

### Phase 2.4: Trace Manager（0.5 天）

**文件**：`tools/jispec/trace-manager.ts`

**功能**：
- 自动生成追溯链条目
- 验证追溯链完整性
- 更新 trace.yaml

**接口**：
```typescript
interface TraceEntry {
  from: string;              // 源产物
  to: string;                // 目标产物
  type: string;              // 关系类型
  metadata?: Record<string, unknown>;
}

class TraceManager {
  // 创建追溯管理器
  static create(sliceId: string): TraceManager;

  // 添加追溯条目
  addTrace(entry: TraceEntry): Promise<void>;

  // 验证追溯完整性
  verify(): Promise<TraceVerifyResult>;

  // 保存追溯链
  save(): Promise<void>;
}
```

### Phase 2.5: 集成到 Agent Runner（0.5 天）

**修改文件**：`tools/jispec/agent-runner.ts`

**功能**：
- 在 Agent 执行前创建约束检查器
- 在 Agent 执行后验证输出
- 在验证通过后更新门控和追溯链

**流程**：
```typescript
async function runAgent(role: string, target: string, options: RunOptions) {
  // 1. 加载配置
  const agentConfig = loadAgentConfig(role);
  const stageConfig = loadStageConfig(role);

  // 2. 创建约束检查器
  const inputChecker = InputConstraintChecker.create(stageConfig.inputs);
  await inputChecker.snapshot();

  // 3. 执行 Agent
  const result = await executeAgent(agentConfig, context);

  // 4. 验证输入未被修改
  const inputCheck = await inputChecker.verify();
  if (!inputCheck.passed) {
    throw new Error(`Input constraint violated: ${inputCheck.violations}`);
  }

  // 5. 验证输出
  const outputValidator = OutputValidator.create(stageConfig.outputs);
  const outputCheck = await outputValidator.validate();
  if (!outputCheck.passed) {
    throw new Error(`Output validation failed: ${outputCheck.errors}`);
  }

  // 6. 检查和更新门控
  const gateChecker = GateChecker.create(target, stageConfig.gates);
  const gateCheck = await gateChecker.check();
  if (gateCheck.passed && stageConfig.gates.autoUpdate) {
    await gateChecker.update(stageConfig.gates.required[0], true);
  }

  // 7. 更新追溯链
  if (stageConfig.traceRequired) {
    const traceManager = TraceManager.create(target);
    await traceManager.addTrace({
      from: result.outputFile,
      to: stageConfig.inputs.files[0],
      type: 'implements'
    });
    await traceManager.save();
  }

  return result;
}
```

## 配置文件扩展

### agents/pipeline.yaml（新增）

定义每个阶段的约束规则：

```yaml
stages:
  - id: requirements
    agent: domain
    inputs:
      files:
        - contexts/{context}/context.yaml
        - contexts/{context}/contracts.yaml
      allowRead: true
      allowWrite: false
    outputs:
      files:
        - contexts/{context}/slices/{slice}/requirements.md
      schemas:
        - schemas/requirements-schema.json
      traceRequired: true
    gates:
      required: [requirements_ready]
      optional: []
      autoUpdate: true
    nextStage: design

  - id: design
    agent: design
    inputs:
      files:
        - contexts/{context}/slices/{slice}/requirements.md
        - contexts/{context}/context.yaml
      allowRead: true
      allowWrite: false
    outputs:
      files:
        - contexts/{context}/slices/{slice}/design.md
      schemas:
        - schemas/design-schema.json
      traceRequired: true
    gates:
      required: [design_ready]
      optional: []
      autoUpdate: true
    nextStage: behavior

  - id: behavior
    agent: behavior
    inputs:
      files:
        - contexts/{context}/slices/{slice}/requirements.md
        - contexts/{context}/slices/{slice}/design.md
      allowRead: true
      allowWrite: false
    outputs:
      files:
        - contexts/{context}/slices/{slice}/behaviors.feature
      schemas:
        - schemas/behavior-schema.json
      traceRequired: true
    gates:
      required: [behavior_ready]
      optional: []
      autoUpdate: true
    nextStage: test

  - id: test
    agent: test
    inputs:
      files:
        - contexts/{context}/slices/{slice}/requirements.md
        - contexts/{context}/slices/{slice}/behaviors.feature
      allowRead: true
      allowWrite: false
    outputs:
      files:
        - contexts/{context}/slices/{slice}/test-spec.yaml
      schemas:
        - schemas/test-spec-schema.json
      traceRequired: true
    gates:
      required: [test_ready]
      optional: []
      autoUpdate: true
    nextStage: implementing
```

## 测试计划

### 单元测试

1. **Input Constraint Checker**
   - 测试文件快照创建
   - 测试文件修改检测
   - 测试只读约束

2. **Output Validator**
   - 测试 Schema 验证
   - 测试语义验证
   - 测试追溯验证

3. **Gate Checker**
   - 测试门控检查
   - 测试门控更新
   - 测试推进条件

4. **Trace Manager**
   - 测试追溯条目添加
   - 测试追溯完整性验证
   - 测试 trace.yaml 更新

### 集成测试

1. **端到端约束测试**
   - 运行 Agent，尝试修改输入文件（应该失败）
   - 运行 Agent，生成无效输出（应该失败）
   - 运行 Agent，生成有效输出（应该成功）

2. **流水线测试**
   - 从 requirements 到 design（应该成功）
   - 跳过 requirements 直接到 design（应该失败）
   - 修改 requirements 后重新生成 design（应该检测到变化）

## 成功标准

Phase 2 完成后，应该能够：

1. ✅ 防止 Agent 修改输入文件
2. ✅ 验证 Agent 输出的正确性
3. ✅ 自动更新门控状态
4. ✅ 自动生成和验证追溯链
5. ✅ 拒绝违反约束的操作
6. ✅ 提供清晰的错误信息

## 下一步

Phase 2 完成后，进入 **Phase 3: 流水线引擎**，实现：
- 多阶段自动串联
- 状态自动推进
- 失败处理和恢复
- 人工介入点

---

**文档版本**：v0.1
**创建日期**：2026-04-24
**作者**：JiSpec Team
