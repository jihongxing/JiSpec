# Phase 5.2 TypeCheck 修复

## 执行日期
2026-04-26

## 修复内容

### 1. 添加 statSync() 到 FilesystemStorage ✅

**修改文件：** `tools/jispec/filesystem-storage.ts` (line 203)

**问题：**
- transaction-manager.ts 的递归 getSliceFiles() 调用了 storage.statSync()
- FilesystemStorage 没有实现 statSync() 方法
- 导致 typecheck 失败

**修复：**
```typescript
/**
 * Synchronous stat (for compatibility with existing code)
 */
statSync(filePath: string): fs.Stats {
  return fs.statSync(filePath);
}
```

---

### 2. 修复 doctor.ts 环境变量和类型 ✅

**修改文件：** `tools/jispec/doctor.ts` (line 530)

**问题 1：环境变量错误**
- 使用了 `JISPEC_USE_TRANSACTION_MANAGER=1`
- 应该使用 `JISPEC_USE_TRANSACTION_MANAGER=true`
- 导致 smoke gate 是假阳性（没有真正启用事务模式）

**问题 2：map 类型错误**
- `lines.map(l => ...)` 缺少参数类型
- TypeScript 无法推断 l 的类型

**修复：**
```typescript
execSync("npx cross-env JISPEC_USE_TRANSACTION_MANAGER=true npx tsx tools/jispec/tests/regression-runner.ts", {
  cwd: this.root,
  stdio: "pipe",
  timeout: 120000,
});
// ...
details.push(...lines.map((l: string) => `  ${l}`));
```

---

## 验证步骤

```bash
# 1. 类型检查
npm run typecheck

# 2. Doctor 检查（真实事务模式）
node --import tsx ./tools/jispec/cli.ts doctor phase5 --json

# 3. 事务模式回归测试
JISPEC_USE_TRANSACTION_MANAGER=true npx tsx tools/jispec/tests/regression-runner.ts
```

---

## 修复总结

**修改文件：**
1. `tools/jispec/filesystem-storage.ts` - 添加 statSync() 方法
2. `tools/jispec/doctor.ts` - 修复环境变量和类型标注

**预期结果：**
- ✅ npm run typecheck 通过
- ✅ doctor phase5 真实测试事务模式
- ✅ 事务模式 55/55 测试通过
