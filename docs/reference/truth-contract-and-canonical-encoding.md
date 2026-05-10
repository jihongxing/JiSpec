# 真相契约与规范化编码

Date: 2026-05-10

状态：已冻结

本文把本轮会话讨论的系统真相契约收敛为一份稳定参考。

## 范围

本契约覆盖：

- `change` 何时成为系统真相
- `source review` 与真相升格的区别
- 如何构造确定性的 proposed snapshot
- 如何定义规范化编码和 truth fingerprint
- 还需要钉死的边界是什么

## 真相契约

当前代码已经表达了核心规则：

- `change` 是意图，不是真相
- 已 review 的 change 仍不是真相
- 已 adopted 的 review 仍不是真相
- 只有成功执行 `source adopt` 才会把 proposed snapshot 提升为 active truth

在代码里，`source adopt` 是提交边界，它会：

- 检查未解决的 blocking evolution item
- 把 proposed snapshot 提升为 active snapshot
- 更新 lifecycle 和 baseline 元数据
- 记录 lineage 和 audit 事件

相关实现：

- [source-governance.ts](../../tools/jispec/greenfield/source-governance.ts)
- [requirement-evolution-workflow.md](../requirement-evolution-workflow.md)

## 形式化规则

`change` 成为系统真相，当且仅当：

1. 该 change 已完成分类和 review。
2. 所有 blocking evolution item 都已被处理为 `adopted`、`deferred` 或 `waived`。
3. `source adopt` 成功执行。
4. proposed snapshot 被提升为 active snapshot。
5. lifecycle、baseline 和 lineage 指针被原子更新。

## 确定性构造契约

proposed snapshot 必须是以下输入的确定性函数：

- `change`
- active baseline
- source facts
- `replay_seed`

`replay_seed` 是显式承载非事实熵的容器。它必须包含所有不会改变业务语义、但会影响构造结果的输入，包括时间、引擎版本、排序种子以及其他执行描述符。

## 规范化快照编码

系统需要的是规范化字节，不只是稳定 JSON 文本。

### 必备属性

- 确定性
- 完整性
- 跨语言无关
- 跨 runtime 无关
- 可回放

### 规范化规则

- 对象 key 必须递归排序。
- 数组必须是 schema-aware。
- 字符串必须规范化为 Unicode NFC。
- 数值必须规范化为 canonical decimal form。
- `undefined`、函数、symbol 都是非法输入。
- Boolean 和 `null` 必须保留原生形式。

### 数组语义

数组不能全局排序，必须由 schema 声明其语义类型：

- `set` 表示顺序不承载语义，必须规范化排序。
- `list` 表示顺序承载语义，必须保序。
- `timeline` 表示必须按声明的时间 key 排序。

没有 schema，就不允许做规范化。

## 指纹

truth fingerprint 应计算为：

```text
truth_fingerprint = sha256(canonical_bytes(semantic_snapshot, replay_seed))
```

snapshot id 应该是内容寻址的，不应由时间戳派生。

## 必须钉死的边界

剩下需要钉死的边界，不是真相升格本身，而是规范化契约版本。

verifier 必须绑定：

- snapshot hash
- canonicalization schema hash 或 version
- engine version

如果 canonicalization 规则发生变化，系统必须能够区分：

- 相同 semantic snapshot + 相同 canonical rules
- 相同 semantic snapshot + 不同 canonical rules

否则 replay 和 audit 比对会在不同版本之间悄悄漂移。

## 当前代码映射

当前实现已经体现了正确分工：

- `source refresh` 负责构造 proposed snapshot 和 diff
- `source review` 负责分类每个 evolution item
- `source adopt` 负责执行 active truth 升格

相关文件：

- [source-refresh.ts](../../tools/jispec/greenfield/source-refresh.ts)
- [source-documents.ts](../../tools/jispec/greenfield/source-documents.ts)
- [source-governance.ts](../../tools/jispec/greenfield/source-governance.ts)

## 已落地实现

当前代码已经补齐真相编码器、指纹和 verifier，以及 adopt 回写路径：

- [canonicalization.ts](../../tools/jispec/greenfield/canonicalization.ts)
- [truth-fingerprint.ts](../../tools/jispec/greenfield/truth-fingerprint.ts)
- [snapshot-verifier.ts](../../tools/jispec/greenfield/snapshot-verifier.ts)
- [source-governance.ts](../../tools/jispec/greenfield/source-governance.ts)

对应测试：

- [greenfield-canonicalization.ts](../../tools/jispec/tests/greenfield-canonicalization.ts)
- [greenfield-truth-fingerprint.ts](../../tools/jispec/tests/greenfield-truth-fingerprint.ts)
- [greenfield-snapshot-verifier.ts](../../tools/jispec/tests/greenfield-snapshot-verifier.ts)
- [greenfield-deterministic-fixtures.ts](../../tools/jispec/tests/greenfield-deterministic-fixtures.ts)

## 实现含义

这套能力已经落地为稳定闭环：

- 规范化快照编码器保证同语义同字节
- truth fingerprint 作为内容寻址标识
- snapshot verifier 独立校验 truth
- audit 和 replay 元数据绑定 schema/version

## 小结

操作规则是：

`change` 表达意图，`source review` 分类证据，`source adopt` 提交真相。

证明规则是：

`truth` 必须可由规范化字节重现，而不是依赖运行时偶然性。
