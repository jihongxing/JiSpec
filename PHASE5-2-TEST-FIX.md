# Phase 5.2 测试修复记录

## 执行日期
2026-04-26

## 问题诊断

### 本地验证结果
- ❌ npm run typecheck - 失败（新测试文件类型错误）
- ❌ npx tsx tools/jispec/tests/stable-snapshot-gates.ts - 0/1 失败
- ❌ npx tsx tools/jispec/tests/evidence-cleanup.ts - 0/2 失败
- ❌ node --import tsx ./tools/jispec/cli.ts doctor phase5 --json - ready: false
- ✅ JISPEC_USE_TRANSACTION_MANAGER=true npx tsx tools/jispec/tests/regression-runner.ts - 12/12 suites, 55/55 tests 通过（主线功能正常）

### 问题根因
1. **stable-snapshot-gates.ts** - 调用了私有构造器 `new StageRunner()`，应使用 `StageRunner.create()`
2. **stable-snapshot-gates.ts** - 缺少 `StageExecutionResult` 类型导入和 `writeOperations` 字段
3. **evidence-cleanup.ts** - FailureHandler 构造器调用正确，但需要验证运行时行为

## 已修复

### 1. stable-snapshot-gates.ts ✅

**修复内容：**
- 移除 `StageRunner` 导入（不需要直接实例化）
- 添加 `StageExecutionResult` 类型导入
- 修复 mockExecutionResult 结构，添加 `writeOperations: []`

**修改：**
```typescript
// 修改前
import { StageRunner } from "../stage-runner.js";
const runner = new StageRunner(TEST_ROOT, storage);
const mockExecutionResult = {
  writes: [...],
  gateUpdates: [...],
  traceLinks: [],
  evidence: [],
};

// 修改后
import type { StageExecutionResult } from "../stage-execution-result.js";
const mockExecutionResult: StageExecutionResult = {
  writes: [...],
  gateUpdates: [...],
  traceLinks: [],
  evidence: [],
  writeOperations: [],
};
```

## 待验证

### 2. evidence-cleanup.ts ⚠️

**当前状态：**
- FailureHandler 构造器调用已正确
- 需要运行测试验证实际行为

## 下一步

1. 运行 `npm run typecheck` 验证类型错误已修复
2. 运行 `npx tsx tools/jispec/tests/stable-snapshot-gates.ts` 验证测试通过
3. 运行 `npx tsx tools/jispec/tests/evidence-cleanup.ts` 验证测试通过
4. 运行 `node --import tsx ./tools/jispec/cli.ts doctor phase5 --json` 验证 ready: true
5. 更新 PHASE5-2-COMPLETION-SUMMARY.md 为最终状态
