# Phase 5.2 测试固化

## 执行日期
2026-04-26

## 新增专项测试

### 1. Stable Snapshot Gates Preservation Test ✅

**文件：** `tools/jispec/tests/stable-snapshot-gates.ts`

**测试目标：**
验证 post-commit 稳定快照正确保留事务执行期间更新的 gate 状态

**测试场景：**
1. 运行 design stage，更新 gates（design_ready: false → true）
2. 事务成功提交
3. 创建 post-commit 稳定快照
4. 验证快照包含更新后的 gate 状态
5. 验证快照包含正确的 lifecycle 状态

**验证点：**
- ✅ 快照文件存在
- ✅ 快照包含 gates 对象
- ✅ design_ready gate 值为 true
- ✅ lifecycle.state 为 design-complete

**运行命令：**
```bash
npx tsx tools/jispec/tests/stable-snapshot-gates.ts
```

---

### 2. Evidence Cleanup Regression Test ✅

**文件：** `tools/jispec/tests/evidence-cleanup.ts`

**测试目标：**
验证 rollback 正确清理快照后创建的 evidence 文件，同时保留稳定态 evidence

**测试场景 1：基础清理**
1. 运行 design stage 成功（创建 design evidence）
2. 创建稳定快照
3. 运行 behavior stage 失败（创建 behavior evidence）
4. Rollback 到稳定快照
5. 验证 behavior evidence 被删除
6. 验证 design evidence 被保留

**测试场景 2：多文件处理**
1. 创建稳定快照
2. 创建多个稳定态 evidence 文件（快照前）
3. 创建多个失败态 evidence 文件（快照后）
4. Rollback
5. 验证所有稳定态 evidence 被保留
6. 验证所有失败态 evidence 被删除

**验证点：**
- ✅ 快照前的 evidence 文件被保留
- ✅ 快照后的 evidence 文件被删除
- ✅ 时间戳比较逻辑正确
- ✅ 多文件场景处理正确

**运行命令：**
```bash
npx tsx tools/jispec/tests/evidence-cleanup.ts
```

---

## 测试覆盖总结

### 现有回归测试
- regression-runner.ts - 12 suites, 55 tests
- rollback-regression.ts - 5 tests
- semantic-validation-negative.ts
- windows-safe-naming.ts

### 新增专项测试
- stable-snapshot-gates.ts - 1 test
- evidence-cleanup.ts - 2 tests

### 总测试覆盖
- 回归测试：55 tests
- Rollback 测试：5 tests
- 语义验证：多个负例
- 命名安全：多个场景
- Gates 保留：1 test
- Evidence 清理：2 tests

**总计：60+ tests**

---

## 验证步骤

```bash
# 1. 运行新增专项测试
npx tsx tools/jispec/tests/stable-snapshot-gates.ts
npx tsx tools/jispec/tests/evidence-cleanup.ts

# 2. 运行完整回归测试（默认模式）
npx tsx tools/jispec/tests/regression-runner.ts

# 3. 运行完整回归测试（事务模式）
JISPEC_USE_TRANSACTION_MANAGER=true npx tsx tools/jispec/tests/regression-runner.ts

# 4. 类型检查
npm run typecheck

# 5. Doctor 检查
node --import tsx ./tools/jispec/cli.ts doctor phase5 --json
```

---

## 测试固化目标

- ✅ 防止 stable snapshot 丢失 gate 状态回退
- ✅ 防止 rollback 后 evidence 文件残留
- ✅ 确保时间戳比较逻辑正确
- ✅ 确保多文件场景处理正确

**结论：测试固化完成 ✅**
