# JiSpec 一致性修复计划

## 目标
修复 Phase 1-5 的一致性问题，建立稳定的单机单切片执行闭环。

## 核心问题分析

### 1. 状态机不统一 ⚠️ CRITICAL

**问题：**
- validator.ts 定义：proposed → framed → designed → behavior-defined → test-defined → implementing → reviewing → accepted → released
- pipeline-executor.ts 使用：requirements-defined → design-defined → behavior-defined → test-defined → implementing → verifying → accepted
- slice.yaml 使用顶层 status 字段
- stage-runner.ts 写入 lifecycle.state 字段

**修复：**
1. 统一使用 pipeline.yaml 状态作为单一真相源
2. 更新 validator.ts LIFECYCLE_ORDER
3. 统一 slice.yaml 使用 lifecycle.state
4. 更新示例切片

### 2. Gate 语义反了 ⚠️ CRITICAL

**问题：**
- pipeline.yaml 要求 requirements 阶段前置条件是 requirements_ready=true
- stage-runner.ts 在运行前检查 gate
- 死锁：运行 requirements 需要 requirements_ready，但这应该是完成后设置的

**修复：**
1. Gate 改为"阶段完成后应满足的条件"
2. 阶段完成后检查和更新 gate
3. 前置条件检查上一阶段的 gate

### 3. Agent I/O 模型不完整 ⚠️ HIGH

**问题：**
- agents.yaml 使用 <context-id>/<slice-id>
- agent-runner.ts 支持 {context}/{slice}/{root}
- 只写第一个输出路径
- 无法处理多文件输出

**修复：**
1. 统一占位符为 {context}/{slice}/{root}
2. 实现多文件输出支持
3. 更新 agent prompts

### 4. 验证链路断裂 ⚠️ HIGH

**问题：**
- agent-runner.ts 查找不存在的 jiproject.yaml
- output-validator.ts 期待 result.valid 但返回 result.ok
- trace schema 不匹配

**修复：**
1. 移除 jiproject.yaml 依赖
2. 统一验证接口
3. 统一 trace schema

### 5. Pipeline 配置未驱动执行 ⚠️ HIGH

**问题：**
- stage-runner.ts 只传递 role 给 runAgent
- inputs/outputs/gates/traceRequired 未传递

**修复：**
1. 定义 ResolvedStageContract
2. 编译 pipeline 配置为契约
3. 传递完整契约给 agent

## 实施步骤

### Step 1: 统一状态机（30分钟）
### Step 2: 修复 Gate 语义（45分钟）
### Step 3: Pipeline 驱动执行（60分钟）
### Step 4: 修复 Agent I/O（45分钟）
### Step 5: 修复验证链路（30分钟）
### Step 6: 修复根路径（20分钟）
### Step 7: 修复运行基线（30分钟）

## 成功标准

1. npm run build 成功
2. npm run jispec -- validate 通过
3. npm run jispec -- pipeline run --dry-run 成功
4. 单切片完整闭环跑通

总计时间：约 4 小时
