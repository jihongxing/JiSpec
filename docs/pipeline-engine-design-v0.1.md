# JiSpec 流水线引擎设计文档 v0.1

## 概述

流水线引擎（Pipeline Engine）是 JiSpec 编排系统的最高层组件，负责实现 **DDD → SDD → BDD → TDD 的全自动串联**。它基于 Phase 1 的 Agent 运行器和 Phase 2 的约束执行器，提供一键执行完整流水线的能力。

## 设计目标

### 核心目标

1. **全自动串联**：一个命令完成从需求到验收的完整流程
2. **状态驱动**：根据生命周期状态自动推进
3. **失败恢复**：支持回滚、重试、人工介入
4. **并行执行**：支持多个切片并行处理
5. **可观测性**：清晰的进度、日志、报告

### 非目标

- 不支持跨切片依赖（Phase 4）
- 不支持分布式执行（Phase 5）
- 不支持实时协作（Phase 6）

## 流水线定义

### 标准流水线

```
requirements (DDD) → design (SDD) → behavior (BDD) → test (TDD) → implementation → verification
```

每个阶段：
- **输入**：上游阶段的产物（只读）
- **Agent**：对应的 Agent 角色
- **输出**：本阶段的产物（可写）
- **门控**：必须通过的质量门控
- **推进条件**：门控通过 + 验证通过

### 阶段映射

| 阶段 | 生命周期状态 | Agent | 输入 | 输出 | 门控 |
|------|-------------|-------|------|------|------|
| requirements | requirements-defined | domain | context.yaml, contracts.yaml | requirements.md | requirements_ready |
| design | design-defined | design | requirements.md, context.yaml | design.md | design_ready |
| behavior | behavior-defined | behavior | requirements.md, design.md | behaviors.feature | behavior_ready |
| test | test-defined | test | requirements.md, behaviors.feature | test-spec.yaml | test_ready |
| implementation | implementing | implement | requirements.md, behaviors.feature, test-spec.yaml | src/* | implementation_ready |
| verification | verifying | verify | requirements.md, behaviors.feature, test-spec.yaml, src/* | evidence.md | verification_ready |

## 架构设计

### 核心组件

```
┌─────────────────────────────────────────┐
│         Pipeline Engine                 │
├─────────────────────────────────────────┤
│                                         │
│  ┌───────────────────────────────────┐ │
│  │   Pipeline Executor               │ │
│  │   - 加载流水线配置                │ │
│  │   - 执行阶段序列                  │ │
│  │   - 状态推进                      │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │   Stage Runner                    │ │
│  │   - 运行单个阶段                  │ │
│  │   - 调用 Agent Runner             │ │
│  │   - 应用约束检查                  │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │   Progress Tracker                │ │
│  │   - 跟踪执行进度                  │ │
│  │   - 记录日志                      │ │
│  │   - 生成报告                      │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │   Failure Handler                 │ │
│  │   - 失败检测                      │ │
│  │   - 回滚策略                      │ │
│  │   - 重试逻辑                      │ │
│  └───────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

### 执行流程

```
1. 加载流水线配置 (pipeline.yaml)
   ↓
2. 检查切片当前状态
   ↓
3. 确定起始阶段
   ↓
4. For each stage:
   ├─ 检查前置条件（门控）
   ├─ 运行 Agent (Phase 1)
   ├─ 应用约束检查 (Phase 2)
   ├─ 验证输出
   ├─ 更新门控
   ├─ 更新追溯链
   ├─ 推进生命周期状态
   └─ 记录进度
   ↓
5. 生成执行报告
   ↓
6. 返回结果
```

## 配置文件

### agents/pipeline.yaml

定义流水线的阶段、依赖、约束：

```yaml
# 流水线定义
pipeline:
  name: "Standard DDD → SDD → BDD → TDD Pipeline"
  version: "1.0"

  # 阶段定义
  stages:
    - id: requirements
      name: "Requirements Definition (DDD)"
      agent: domain
      lifecycle_state: requirements-defined
      inputs:
        files:
          - "{context}/context.yaml"
          - "{context}/contracts.yaml"
        allowRead: true
        allowWrite: false
      outputs:
        files:
          - "{slice}/requirements.md"
        schemas:
          - "schemas/requirements-schema.json"
        traceRequired: true
      gates:
        required: [requirements_ready]
        optional: []
        autoUpdate: true
      nextStage: design

    - id: design
      name: "Design Definition (SDD)"
      agent: design
      lifecycle_state: design-defined
      inputs:
        files:
          - "{slice}/requirements.md"
          - "{context}/context.yaml"
        allowRead: true
        allowWrite: false
      outputs:
        files:
          - "{slice}/design.md"
        schemas:
          - "schemas/design-schema.json"
        traceRequired: true
      gates:
        required: [design_ready]
        optional: []
        autoUpdate: true
      nextStage: behavior

    - id: behavior
      name: "Behavior Definition (BDD)"
      agent: behavior
      lifecycle_state: behavior-defined
      inputs:
        files:
          - "{slice}/requirements.md"
          - "{slice}/design.md"
        allowRead: true
        allowWrite: false
      outputs:
        files:
          - "{slice}/behaviors.feature"
        schemas:
          - "schemas/behavior-schema.json"
        traceRequired: true
      gates:
        required: [behavior_ready]
        optional: []
        autoUpdate: true
      nextStage: test

    - id: test
      name: "Test Definition (TDD)"
      agent: test
      lifecycle_state: test-defined
      inputs:
        files:
          - "{slice}/requirements.md"
          - "{slice}/behaviors.feature"
        allowRead: true
        allowWrite: false
      outputs:
        files:
          - "{slice}/test-spec.yaml"
        schemas:
          - "schemas/test-spec-schema.json"
        traceRequired: true
      gates:
        required: [test_ready]
        optional: []
        autoUpdate: true
      nextStage: implementing

    - id: implementing
      name: "Implementation"
      agent: implement
      lifecycle_state: implementing
      inputs:
        files:
          - "{slice}/requirements.md"
          - "{slice}/behaviors.feature"
          - "{slice}/test-spec.yaml"
        allowRead: true
        allowWrite: false
      outputs:
        files:
          - "{slice}/src/*"
        traceRequired: true
      gates:
        required: [implementation_ready]
        optional: []
        autoUpdate: true
      nextStage: verifying

    - id: verifying
      name: "Verification"
      agent: verify
      lifecycle_state: verifying
      inputs:
        files:
          - "{slice}/requirements.md"
          - "{slice}/behaviors.feature"
          - "{slice}/test-spec.yaml"
          - "{slice}/src/*"
        allowRead: true
        allowWrite: false
      outputs:
        files:
          - "{slice}/evidence.md"
        traceRequired: true
      gates:
        required: [verification_ready]
        optional: []
        autoUpdate: true
      nextStage: accepted

  # 失败处理策略
  failure_handling:
    # 自动重试
    retry:
      enabled: true
      max_attempts: 3
      backoff: exponential  # linear, exponential, fixed
      initial_delay: 1000   # ms
      max_delay: 10000      # ms

    # 回滚策略
    rollback:
      enabled: true
      strategy: state_only  # state_only, full, none

    # 人工介入
    human_intervention:
      enabled: true
      prompt_on_failure: true
      allow_skip: false
      allow_manual_fix: true

  # 并行执行配置
  parallel:
    enabled: true
    max_concurrent: 4

  # 进度跟踪
  progress:
    log_level: info  # debug, info, warn, error
    log_file: ".jispec/pipeline.log"
    report_format: markdown  # markdown, json, html
```

## 实现计划

### Phase 3.1: Pipeline Executor（1 天）

**文件**：`tools/jispec/pipeline-executor.ts`

**功能**：
- 加载 pipeline.yaml 配置
- 解析阶段定义
- 执行阶段序列
- 状态推进逻辑

**接口**：
```typescript
interface PipelineConfig {
  name: string;
  version: string;
  stages: StageConfig[];
  failure_handling: FailureHandlingConfig;
  parallel: ParallelConfig;
  progress: ProgressConfig;
}

interface StageConfig {
  id: string;
  name: string;
  agent: AgentRole;
  lifecycle_state: string;
  inputs: InputConstraint;
  outputs: OutputConstraint;
  gates: GateConstraint;
  nextStage?: string;
}

class PipelineExecutor {
  static create(config: PipelineConfig): PipelineExecutor;
  async run(sliceId: string, options: PipelineRunOptions): Promise<PipelineResult>;
  async runStage(sliceId: string, stageId: string): Promise<StageResult>;
  async resume(sliceId: string): Promise<PipelineResult>;
}
```

### Phase 3.2: Stage Runner（1 天）

**文件**：`tools/jispec/stage-runner.ts`

**功能**：
- 运行单个阶段
- 调用 Agent Runner（Phase 1）
- 应用约束检查（Phase 2）
- 更新状态和门控

**接口**：
```typescript
interface StageRunOptions {
  sliceId: string;
  stageConfig: StageConfig;
  dryRun?: boolean;
  skipValidation?: boolean;
}

class StageRunner {
  static create(root: string): StageRunner;
  async run(options: StageRunOptions): Promise<StageResult>;
}
```

### Phase 3.3: Progress Tracker（0.5 天）

**文件**：`tools/jispec/progress-tracker.ts`

**功能**：
- 跟踪执行进度
- 记录结构化日志
- 生成执行报告

**接口**：
```typescript
interface ProgressEvent {
  timestamp: string;
  type: "stage_start" | "stage_complete" | "stage_failed" | "pipeline_complete";
  sliceId: string;
  stageId?: string;
  message: string;
  data?: unknown;
}

class ProgressTracker {
  static create(logFile: string): ProgressTracker;
  logEvent(event: ProgressEvent): void;
  getProgress(sliceId: string): PipelineProgress;
  generateReport(sliceId: string): string;
}
```

### Phase 3.4: Failure Handler（0.5 天）

**文件**：`tools/jispec/failure-handler.ts`

**功能**：
- 失败检测
- 自动重试
- 回滚策略
- 人工介入提示

**接口**：
```typescript
interface FailureHandlingConfig {
  retry: RetryConfig;
  rollback: RollbackConfig;
  human_intervention: HumanInterventionConfig;
}

class FailureHandler {
  static create(config: FailureHandlingConfig): FailureHandler;
  async handleFailure(error: Error, context: FailureContext): Promise<FailureResolution>;
  async retry(fn: () => Promise<unknown>, attempts: number): Promise<unknown>;
  async rollback(sliceId: string, toState: string): Promise<void>;
  async promptHumanIntervention(error: Error): Promise<HumanDecision>;
}
```

### Phase 3.5: CLI 集成（1 天）

**修改文件**：`tools/jispec/cli.ts`

**新增命令**：
```bash
# 运行完整流水线
jispec pipeline run <slice-id>

# 从特定阶段开始
jispec pipeline run <slice-id> --from <stage-id>

# 运行到特定阶段
jispec pipeline run <slice-id> --to <stage-id>

# Dry-run 模式
jispec pipeline run <slice-id> --dry-run

# 跳过验证（危险）
jispec pipeline run <slice-id> --skip-validation

# 并行运行多个切片
jispec pipeline run --all --parallel

# 恢复失败的流水线
jispec pipeline resume <slice-id>

# 查看流水线状态
jispec pipeline status <slice-id>

# 查看流水线日志
jispec pipeline logs <slice-id>
```

## 执行示例

### 示例 1：完整流水线

```bash
$ jispec pipeline run ordering-checkout-v1

[Pipeline] Starting pipeline for slice: ordering-checkout-v1
[Pipeline] Current state: behavior-defined
[Pipeline] Starting from stage: test

[Stage: test] Test Definition (TDD)
[Stage: test] Loading agent: test
[Stage: test] Inputs: requirements.md, behaviors.feature
[Stage: test] Outputs: test-spec.yaml
[Constraint] Creating input file snapshots...
[Constraint] ✓ Input snapshots created
[Agent] Calling AI provider...
[Agent] ✓ AI generation completed
[Constraint] Verifying input files...
[Constraint] ✓ Input files unchanged
[Output] Saving to test-spec.yaml...
[Output] ✓ Output saved
[Validation] Validating output...
[Validation] ✓ Output validation passed
[Gates] Checking gates...
[Gates] ✓ test_ready: true
[Trace] Adding trace: test-spec.yaml → behaviors.feature
[Trace] ✓ Trace updated
[Stage: test] ✓ Stage completed
[Lifecycle] Advancing to: test-defined

[Stage: implementing] Implementation
[Stage: implementing] Loading agent: implement
...

[Pipeline] ✓ Pipeline completed successfully
[Pipeline] Total time: 2m 34s
[Pipeline] Report saved to: .jispec/pipeline-report-ordering-checkout-v1.md
```

### 示例 2：失败和重试

```bash
$ jispec pipeline run ordering-checkout-v1

[Pipeline] Starting pipeline for slice: ordering-checkout-v1
[Stage: design] Design Definition (SDD)
[Agent] Calling AI provider...
[Agent] ✗ AI generation failed: Connection timeout
[Retry] Attempt 1/3 failed, retrying in 1s...
[Agent] Calling AI provider...
[Agent] ✗ AI generation failed: Connection timeout
[Retry] Attempt 2/3 failed, retrying in 2s...
[Agent] Calling AI provider...
[Agent] ✓ AI generation completed
[Stage: design] ✓ Stage completed

[Pipeline] ✓ Pipeline completed with 2 retries
```

### 示例 3：人工介入

```bash
$ jispec pipeline run ordering-checkout-v1

[Pipeline] Starting pipeline for slice: ordering-checkout-v1
[Stage: behavior] Behavior Definition (BDD)
[Validation] ✗ Output validation failed:
  - behaviors.feature: Missing scenario for REQ-ORD-002

[Failure] Stage failed: behavior
[Failure] Retry attempts exhausted (3/3)

? How would you like to proceed?
  > Fix manually and retry
    Skip this stage (not recommended)
    Abort pipeline

[Human] Selected: Fix manually and retry
[Human] Please fix the issue and press Enter to continue...
[Human] Retrying stage: behavior
[Stage: behavior] ✓ Stage completed

[Pipeline] ✓ Pipeline completed with human intervention
```

## 测试计划

### 单元测试

1. **Pipeline Executor**
   - 测试阶段序列执行
   - 测试状态推进
   - 测试配置加载

2. **Stage Runner**
   - 测试单个阶段执行
   - 测试约束应用
   - 测试门控更新

3. **Progress Tracker**
   - 测试事件记录
   - 测试进度查询
   - 测试报告生成

4. **Failure Handler**
   - 测试重试逻辑
   - 测试回滚策略
   - 测试人工介入

### 集成测试

1. **端到端流水线**
   - 从 requirements 到 accepted
   - 验证每个阶段的输出
   - 验证追溯链完整性

2. **失败恢复**
   - 模拟 Agent 失败
   - 验证自动重试
   - 验证回滚

3. **并行执行**
   - 运行多个切片
   - 验证并发控制
   - 验证资源隔离

## 成功标准

Phase 3 完成后，应该能够：

1. ✅ 一键执行完整流水线（DDD → SDD → BDD → TDD → Implementation → Verification）
2. ✅ 自动推进生命周期状态
3. ✅ 自动重试失败的阶段
4. ✅ 支持人工介入和修复
5. ✅ 生成详细的执行报告
6. ✅ 支持并行执行多个切片
7. ✅ 提供清晰的进度和日志

## 下一步

Phase 3 完成后，JiSpec 的核心编排能力已经完整。后续可以考虑：

- **Phase 4**: 跨切片依赖管理
- **Phase 5**: 分布式执行和缓存
- **Phase 6**: 实时协作和冲突解决
- **Phase 7**: 可视化 UI 和仪表板

---

**文档版本**：v0.1
**创建日期**：2026-04-24
**作者**：JiSpec Team
