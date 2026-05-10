# 真相契约与规范化编码实施计划

Date: 2026-05-10

状态：已完成

Reference:

- [docs/reference/truth-contract-and-canonical-encoding.md](../docs/reference/truth-contract-and-canonical-encoding.md)
- [plans/2026-05-10-truth-contract-canonical-encoding-task-list.md](./2026-05-10-truth-contract-canonical-encoding-task-list.md)
- [docs/requirement-evolution-workflow.md](../docs/requirement-evolution-workflow.md)
- [tools/jispec/greenfield/source-governance.ts](../tools/jispec/greenfield/source-governance.ts)
- [tools/jispec/greenfield/source-documents.ts](../tools/jispec/greenfield/source-documents.ts)

## 目标

把本轮讨论落成可验证、可审计、可回放的正式契约，并把 proposed snapshot 的确定性与 canonical encoding 变成可测试的实现能力。

## 核心结论

- `change` 不是真相
- `source review` 不是真相
- `source adopt` 才是真相提交边界
- proposed snapshot 必须是确定性构造
- truth fingerprint 必须是内容寻址的
- canonicalization 必须 schema-aware

## 阶段划分

| 阶段 | 目标 | 主要产物 | 完成标准 |
|---|---|---|---|
| 1 | 契约冻结 | 真相契约文档、术语、边界说明 | 文档可作为后续实现引用源 |
| 2 | 语义分层 | semantic snapshot / replay_seed 分层模型 | replay_seed 不污染业务语义 |
| 3 | 规范化编码 | schema-aware canonicalizer、UTF-8/NFC、稳定数值规范化 | 同输入同字节 |
| 4 | 指纹 | snapshot hash、schema/version 绑定 | hash 可重算且可比对 |
| 5 | Verifier | snapshot verifier、失败原因结构化输出 | 可独立校验 truth fingerprint |
| 6 | 集成回写 | source refresh / source adopt / audit metadata 接入 | truth promotion 可审计、可回放 |

## 详细任务

### 1. 契约冻结

做什么：

- 将真相契约、确定性构造、规范化编码写成稳定参考文档。
- 明确 `source adopt` 是系统 truth commit boundary。

验收：

- 文档可直接引用。
- 术语与现有 `source refresh` / `source review` / `source adopt` 流程一致。

### 2. 语义分层

做什么：

- 定义 `semantic_snapshot` 与 `replay_seed` 的结构边界。
- 禁止业务逻辑读取 `replay_seed`。

验收：

- snapshot 构造入口明确分层。
- `replay_seed` 只影响可重复性，不影响业务语义。

### 3. 规范化编码

做什么：

- 实现 schema-aware canonicalizer。
- 处理对象键排序、数组 kind、NFC、数值规范化、非法值 fail-fast。

验收：

- 同一语义输入在不同运行时输出相同字节。
- 反例 fixture 覆盖 `undefined`、不同 Unicode 形态、数组顺序差异、数值格式差异。

### 4. 指纹

做什么：

- 基于 canonical bytes 生成 `truth_fingerprint`。
- 将 canonicalization version / schema hash / engine version 纳入校验上下文。

验收：

- hash 可稳定重算。
- 规范升级后可以区分不同 canonical rules。

### 5. Verifier

做什么：

- 建独立 snapshot verifier。
- 输入 snapshot、expected hash、schema/version 元信息。
- 输出 valid / invalid 和结构化原因。

验收：

- verifier 可单独运行。
- verifier 不依赖隐式上下文。

### 6. 集成回写

做什么：

- 把 fingerprint / schema version / engine version 写入 adopt 产物与 audit 元数据。
- 必要时在 `source refresh` 产出中携带 replay seed 记录。

验收：

- 任何 adopted truth 都能回溯到构造条件。
- verify 可以消费权威 truth metadata，而不是重建隐式状态。

## 风险

- 时间、随机数、排序、序列化差异会污染 truth fingerprint。
- 数组语义如果不 schema-aware，会把 list 当 set 或把 set 当 list。
- canonicalization version 不入账会导致跨版本 replay 结果不可比。

## 推荐实施顺序

1. 冻结契约文档
2. 定义 snapshot 分层
3. 实现 canonicalizer
4. 接入 fingerprint
5. 增加 verifier
6. 回写 adopt / audit / verify

## 结束标准

当以下条件全部满足时，这项计划可以收口：

- 同一输入可重放出同一 proposed snapshot
- 同一 proposed snapshot 可得到同一 fingerprint
- `source adopt` 只在 blocking items 全部处理后执行
- verifier 可以独立验证 truth fingerprint
- canonicalization version 变化不会造成静默误判

## 收口结果

以上条件已满足，本实施计划已完成并进入冻结状态。
