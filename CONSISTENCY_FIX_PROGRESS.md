# JiSpec 一致性修复进度报告

## 执行时间
2026-04-25

## 目标
修复 Phase 1-5 的一致性问题，建立稳定的单机单切片执行闭环。

## 已完成的工作

### ✅ Step 1.5: 状态机收口（已完成）

**问题：**
- validator.ts 使用旧状态名：proposed → framed → designed
- slice.yaml 混用顶层 `status` 和 `lifecycle.state`
- REQUIRED_GATES_BY_STATE 使用旧状态名
- slice-report.ts 和 slice-ops.ts 读取旧的 `status` 字段

**解决方案：**
1. ✅ 统一 validator.ts 使用新状态序列
2. ✅ 更新 REQUIRED_GATES_BY_STATE 映射到新状态名
3. ✅ 修复 validator.ts 读取 `lifecycle.state`
4. ✅ 修复 slice-report.ts 读取 `lifecycle.state`
5. ✅ 修复 slice-ops.ts 创建和更新切片使用 `lifecycle` 对象
6. ✅ 所有状态读写现在统一到 `lifecycle.state`

**Git 提交：** commit 0e1f89a

### ✅ Step 3: Pipeline 驱动执行（已完成）

**问题：**
- StageRunner 只传递 `role` 给 runAgent
- pipeline.yaml 的 inputs/outputs/gates 没有真正驱动执行
- 占位符格式不统一

**解决方案：**
1. ✅ 创建 `stage-contract.ts` 定义 `ResolvedStageContract` 接口
2. ✅ 实现 `StageContractResolver` 类解析占位符
3. ✅ 支持新旧两种占位符格式
4. ✅ stage-runner.ts 已集成契约解析
5. ✅ agent-runner.ts 已支持契约驱动执行

**Git 提交：** commit dc3f1f3

## 剩余工作

### Step 4: 结构化阶段结果（P0 CRITICAL）
- 修改 AgentResult 添加 writes/gateUpdates/traceLinks/evidence
- 更新 agent-runner.ts 解析结构化输出
- 更新 stage-runner.ts 应用结构化结果

### Step 5: 修复根路径处理（P1 HIGH）
- ✅ 已添加 root 参数到 GateChecker/TraceManager
- 🔄 需要更新所有调用点

### Step 6: 修复验证链路（P1 HIGH）
- 修复 AI 配置读取路径
- 修复 OutputValidator 验证逻辑
- 统一 trace schema

### Step 7: 建立运行基线（P0 CRITICAL）
- 修复 TypeScript 编译错误
- 修复缺失依赖
- 确保 validate 命令能通过

## 完成度：4/7 步骤（57%）
