# Change Kernel 代码审计

日期：2026-05-10

审计范围：

- `tools/jispec/change/change-command.ts`
- `tools/jispec/change/orchestration-config.ts`
- `tools/jispec/change/git-diff-classifier.ts`
- `tools/jispec/implement/implement-runner.ts`
- `tools/jispec/verify/verify-runner.ts`
- `tools/jispec/verify/waiver-store.ts`
- `tools/jispec/bootstrap/spec-debt.ts`
- `tools/jispec/greenfield/spec-debt-ledger.ts`
- `tools/jispec/audit/event-ledger.ts`
- `tools/jispec/transaction-manager.ts`
- `tools/jispec/greenfield/provenance-drift.ts`
- `tools/jispec/cli.ts`

## 结论

这份路线图和实施计划里的 `MBM / IPL / KTM / Ambiguity Debt / Execution Fork Governance Layer` 现在都已经落地，不再只是目标态命名。

当前代码已经形成一套完整的治理、回放与运行时链路，它的实际形态是：

- `change` 会创建并记录会话
- `MBM` 会把外部 mutation 归一化为 `derived_change` / `unmapped_mutation`
- `implement` 会做补丁调停、测试、后验验证、handoff、审计，并产出 execution fork 与 KTM 运行时
- `verify` 会汇聚事实、基线、waiver、policy、observe、外部图谱导入，并消费 kernel 输出
- `waiver` 和 `spec debt` 已经是独立的本地治理对象
- `Ambiguity Debt Register` 已经有了本地落盘和审计链路，`change` 会在 `unmapped_mutation` 上自动写入
- `Execution Fork Governance Layer` 已经有 canonical trace 裁决和 replay 归档
- `KTM` 已经把 kernel-log、state snapshot、audit ledger 收敛到同一事务边界
- `audit ledger` 已经是哈希链审计日志

所以，这份文档现在应该被当作“已完成架构说明 + 归档实施记录”。

## 已实现事实

### 1. `change` 是当前主入口，但不是唯一执行面

`change` 负责生成 session、分类 diff、确定 lane、写入 `.jispec/change-session.json`，并可在 execute 模式下继续调起 `implement`。

证据：

- [tools/jispec/change/change-command.ts](../../tools/jispec/change/change-command.ts)
- [tools/jispec/cli.ts](../../tools/jispec/cli.ts)

### 2. `implement` 已经具备独立的 mediation 能力

`implement` 不只是消费下游产物，它还能：

- 接收 `externalPatchPath`
- 做 patch scope mediation
- 运行测试
- 触发 post-verify
- 归档 session
- 写 handoff / discipline / audit 产物
- 写 execution fork、KTM runtime 产物

证据：

- [tools/jispec/implement/implement-runner.ts](../../tools/jispec/implement/implement-runner.ts)

### 3. `verify` 已经是独立的 truth reconstruction / gate surface

`verify` 会：

- 收集 legacy issues
- 收集 supplemental collectors
- 导入 external graph artifact
- 应用 waiver
- 应用 baseline
- 应用 policy
- 应用 observe mode
- 读取 kernel artifact 并校验 lineage
- 产出 replay 元数据

证据：

- [tools/jispec/verify/verify-runner.ts](../../tools/jispec/verify/verify-runner.ts)

### 4. `waiver` 和 `spec debt` 已经是第一类治理对象

它们都不是临时注释，而是可写、可撤销、可重评、可审计的本地文件对象。

证据：

- [tools/jispec/verify/waiver-store.ts](../../tools/jispec/verify/waiver-store.ts)
- [tools/jispec/bootstrap/spec-debt.ts](../../tools/jispec/bootstrap/spec-debt.ts)
- [tools/jispec/greenfield/spec-debt-ledger.ts](../../tools/jispec/greenfield/spec-debt-ledger.ts)

### 5. 审计链已经存在

`audit/event-ledger.ts` 已经实现了 JSONL 事件追加、哈希链、顺序检查和 legacy 兼容。

证据：

- [tools/jispec/audit/event-ledger.ts](../../tools/jispec/audit/event-ledger.ts)

### 6. 有“相似能力”，但不是 Change Kernel

- `tools/jispec/transaction-manager.ts` 提供的是 slice/stage 的事务语义，不是 change 侧的 single-writer kernel。
- `tools/jispec/greenfield/provenance-drift.ts` 提供的是 source document 的 provenance / evolution 追踪，不是执行层的 IPL。

证据：

- [tools/jispec/transaction-manager.ts](../../tools/jispec/transaction-manager.ts)
- [tools/jispec/greenfield/provenance-drift.ts](../../tools/jispec/greenfield/provenance-drift.ts)

## 已实现的点

- 仓库里已经有独立的 `MBM` 模块。
- 仓库里已经有独立的 `IPL` 模块。
- 仓库里已经有独立的 `KTM` change-kernel 运行时。
- 仓库里已经有 `kernel-log` 作为 change 侧权威写入层。
- 仓库里已经实现文档里描述的 single write authority。

## 审计结论

如果按“当前代码是否已经实现 Change Kernel”来问，答案是肯定的。

## 收尾建议

1. 保持这三份文档与代码同步，避免术语回退。
2. 新增能力时先更新回归，再扩写入面。
3. 继续把 `change`、`verify`、`ci:verify`、`implement` 的职责边界钉死在现有完成态上。
