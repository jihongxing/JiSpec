# 真相契约与规范化编码可执行任务清单

Date: 2026-05-10

状态：已完成

Reference:

- [docs/reference/truth-contract-and-canonical-encoding.md](../docs/reference/truth-contract-and-canonical-encoding.md)
- [plans/2026-05-10-truth-contract-canonical-encoding-plan.md](./2026-05-10-truth-contract-canonical-encoding-plan.md)
- [docs/requirement-evolution-workflow.md](../docs/requirement-evolution-workflow.md)

## 用法

这份文档是实施计划的可执行拆解版，面向直接派工、落实现和补测试。

- `plan` 负责阶段和顺序
- `task list` 负责具体文件、测试和验收
- 任何会改变 truth source 的任务，必须先补测试再补实现

## 拆解原则

- 先冻结契约，再拆分数据模型，再做编码和指纹，最后接 verifier 和回写。
- `change`、`source review`、`source adopt` 的边界不能被实现任务打穿。
- canonicalization 不是工具细节，而是协议实现，必须有明确 schema 约束。
- `replay_seed` 只能影响确定性，不能污染业务语义。

## 任务总表

| ID | 任务 | 状态 | 主要文件范围 | 依赖 | 测试 | 完成标准 |
|---|---|---|---|---|---|---|
| TC-01 | 冻结真相契约文档 | 已完成 | `docs/reference/truth-contract-and-canonical-encoding.md`，`docs/reference/README.md` | 无 | 文档链接检查，术语一致性检查 | 契约边界、术语和 truth promotion 规则可稳定引用 |
| TC-02 | 定义 snapshot 分层模型 | 已完成 | `tools/jispec/greenfield/source-documents.ts`，`tools/jispec/greenfield/source-governance.ts`，必要时新增共享类型层 | TC-01 | 类型测试，round-trip 测试，分层边界测试 | `semantic_snapshot` 与 `replay_seed` 明确分层，业务层不能读取 replay seed |
| TC-03 | 实现 schema-aware canonicalizer | 已完成 | 新增 canonicalization 模块，优先放在 `tools/jispec/greenfield/*` 或共享工具层 | TC-02 | canonicalization fixture，Unicode NFC 测试，数组 kind 测试，非法值 fail-fast 测试 | 同语义输入在不同 runtime 下输出同字节 |
| TC-04 | 规范化数值与字符串编码 | 已完成 | canonicalizer 内部子模块，必要时补工具函数 | TC-03 | 数值规范化测试，NFC 测试，转义形式等价测试 | 数值、字符串、布尔和 null 的编码规则固定 |
| TC-05 | 生成 truth fingerprint | 已完成 | 新增 fingerprint 生成模块，接入 `source refresh` / `source adopt` 产物 | TC-03，TC-04 | hash 回放测试，hash 稳定性测试，schema/version 绑定测试 | `truth_fingerprint` 由 canonical bytes 生成，且可稳定重算 |
| TC-06 | 建独立 snapshot verifier | 已完成 | 新增 verifier 模块，接入 `verify` 或独立命令入口 | TC-05 | valid/invalid 测试，schema/version 不匹配测试，错误消息测试 | verifier 可独立校验 truth fingerprint，不依赖隐式上下文 |
| TC-07 | 把 canonical metadata 写回 adopt 路径 | 已完成 | `tools/jispec/greenfield/source-governance.ts`，audit/event ledger 相关模块 | TC-05，TC-06 | adopt 回写测试，审计记录测试，回放一致性测试 | adopted truth 能回溯到构造条件和 canonicalization 版本 |
| TC-08 | 补回放与回归夹具 | 已完成 | `tools/jispec/tests/greenfield-deterministic-fixtures.ts`，`tools/jispec/tests/regression-runner.ts` | TC-03，TC-05，TC-06 | 固定输入回放测试，跨版本兼容测试，反例测试 | 任何 deterministic contract 违背都会被 fixture 捕获 |

## 任务详单

### TC-01 冻结真相契约文档

做什么：

- 把 `change` / `source review` / `source adopt` 的边界写成稳定参考。
- 明确真相提交边界、确定性构造契约和必须钉死的边界。

怎么做：

- 只改文档，不引入实现分叉。
- 保持文件名和引用路径不变。

怎么测：

- 检查引用是否能从 `docs/reference/README.md` 访问到。
- 检查术语是否与 `requirement-evolution-workflow.md` 一致。

怎么验收：

- 文档成为后续实现的唯一契约引用源。

### TC-02 定义 snapshot 分层模型

做什么：

- 将快照拆成 `semantic_snapshot` 与 `replay_seed`。
- 让 `replay_seed` 只承担 determinism 控制，不参与业务语义。

怎么做：

- 调整 `source-documents` 的构造入口。
- 明确哪些字段属于 semantic，哪些字段属于 replay 元数据。

怎么测：

- 相同 semantic + 不同 replay seed 的回放差异测试。
- 业务代码无法直接依赖 replay seed 的边界测试。

怎么验收：

- 分层结构在代码和文档里一致。

### TC-03 实现 schema-aware canonicalizer

做什么：

- 实现对象 key 递归排序。
- 实现数组 kind 语义：`set`、`list`、`timeline`。
- 实现非法值 fail-fast。

怎么做：

- 先定义 canonicalization schema 约定，再实现编码。
- 不允许在没有 schema 的情况下做隐式 canonicalization。

怎么测：

- 固定 fixture 输入重复运行输出相同字节。
- set/list/timeline 三类数组各自覆盖。
- `undefined`、function、symbol、循环引用等负例覆盖。

怎么验收：

- canonicalizer 输出稳定、可回放、跨 runtime 一致。

### TC-04 规范化数值与字符串编码

做什么：

- 数值统一为 canonical decimal form。
- 字符串统一为 Unicode NFC。

怎么做：

- 把字符串规范化放在 canonicalization 第一层。
- 数值编码必须消除 `1`、`1.0`、`1e0` 这类差异。

怎么测：

- Unicode 组合字符与预组合字符等价测试。
- 数值格式差异测试。

怎么验收：

- 同语义值不会因 runtime 或表示法差异产生不同字节。

### TC-05 生成 truth fingerprint

做什么：

- 基于 canonical bytes 生成 `truth_fingerprint`。
- 将 canonicalization version / schema hash / engine version 纳入校验上下文。

怎么做：

- fingerprint 逻辑独立成模块。
- 生成结果应可稳定重算。

怎么测：

- 同输入 hash 一致测试。
- schema/version 变化可区分测试。

怎么验收：

- `truth_fingerprint` 可作为内容寻址标识。

### TC-06 建独立 snapshot verifier

做什么：

- 输入 snapshot、expected hash、schema/version 元信息。
- 输出 valid / invalid 和结构化原因。

怎么做：

- verifier 只做验证，不重建 truth。
- 不读取隐式上下文，不靠 runtime 偶然性。

怎么测：

- hash 匹配通过。
- hash 不匹配失败。
- schema/version 不一致失败。

怎么验收：

- verifier 可独立运行且结果可解释。

### TC-07 把 canonical metadata 写回 adopt 路径

做什么：

- 在 `source adopt` 产物中写入 fingerprint 和 canonicalization 元信息。
- 在 audit 事件中写入可回放所需信息。
- 在 baseline 和 adoption record 中回写 active truth 指纹与上下文字段。

怎么做：

- 对接 `source-governance.ts` 的 adopt 流程。
- 保留 source promotion 的原子边界。
- 复用已构造的 proposed truth fingerprint，不在 adopt 路径重新计算。

怎么测：

- adopted truth 回写测试。
- audit 记录完整性测试。
- baseline / adoption record 断言测试。

怎么验收：

- adopted truth 可回溯到构造条件和编码版本。

### TC-08 补回放与回归夹具

做什么：

- 建固定输入夹具覆盖 deterministic contract。
- 建反例夹具覆盖 entropy 污染、数组语义错误、编码漂移。
- 将夹具挂入 regression matrix 作为独立 runtime suite。

怎么做：

- 把 fixture 分成正例和负例。
- 以“同输入同字节”为核心断言。

怎么测：

- 重放一致性测试。
- 反例必须稳定失败。

怎么验收：

- 以后任何破坏 deterministic contract 的改动都会被测试抓住。

## 依赖顺序

1. `TC-01` 先冻结契约。
2. `TC-02` 再拆分 snapshot 分层。
3. `TC-03` 和 `TC-04` 并行推进。
4. `TC-05` 依赖 canonicalizer 完成。
5. `TC-06` 依赖 fingerprint 完成。
6. `TC-07` 和 `TC-08` 在编码与 verifier 基础上收口。

## 结束标准

当以下条件全部满足时，这份任务清单可以收口：

- 真相边界在文档和实现里一致。
- proposed snapshot 的构造可重放。
- canonical bytes 在不同 runtime 下保持一致。
- truth fingerprint 可稳定重算。
- verifier 能独立验证 truth。
- adopt 路径把 canonical 元信息完整写回。

## 收口结果

全部任务已完成，本任务清单进入冻结状态。
