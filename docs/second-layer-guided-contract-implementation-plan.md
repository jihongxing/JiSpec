# JiSpec 第二层扩充与引导式契约创建实施计划

日期：2026-05-03

当前状态：in progress

本文是接下来一段开发的执行文档。它把当前已确认的两个方向落成可实施的工作包：

1. 扩充第二层场景，让 JiSpec 对全局性修改的证据、影响面、review 负担和 scope hint 看得更清楚。
2. 强化引导式契约创建，让用户只提供需求文档或需求 + 技术方案，剩余契约草稿由 JiSpec 自动起草，人类只做少量确认和纠偏。

北极星锚点：

> raw evidence for machines, distilled decision packets for humans

## 目标

这项工作的目标不是扩大命令面，而是把现有主线做厚：

- 第二层要能稳定回答“这次变更影响什么、哪些证据明确、哪些只是推断、哪些需要 owner review”
- 第三层要能从最少输入自动起草契约，不要求用户手工搭骨架
- 任何推断都不得直接升级为 blocking gate，blocking 仍由 deterministic verify / policy 决定

## 已知基线

当前仓库已经具备这些基础：

- `bootstrap discover` 能生成 evidence graph、adoption-ranked evidence 和人类摘要
- `bootstrap draft` 能根据 evidence 自动起草 domain / api / feature 候选
- `adopt` 能将草稿采纳、编辑、延期或拒绝
- `change -> implement -> verify` 已经是稳定主线
- `spec-delta`、`impact graph`、`review pack`、`handoff packet` 已经存在雏形

本计划要做的是把这些能力收口成更稳定的协议，而不是另起一套平行流程。

## 工作流总览

```text
需求文档 / 需求+技术方案
        |
        v
bootstrap discover
        |
        v
bootstrap draft
        |
        v
adopt / defer / reject
        |
        v
policy migrate -> verify -> change -> implement -> verify
```

第二层负责“看清楚”，第三层负责“起草出来”。

## 工作流 A: 第二层场景扩充

### 目标

把以下能力统一到同一套控制面：

- 证据来源说明
- 影响面分析
- review packet
- verify scope hint
- freshness / stale 提示
- owner review 与 spec debt 归因

### Milestone A1: Provenance Taxonomy 收口

目标：

- 让 evidence、rank、draft、review packet 使用同一套 provenance 语言
- 明确区分 `EXTRACTED`、`INFERRED`、`AMBIGUOUS`、`OWNER_REVIEW`、`UNKNOWN`

文件范围：

- `tools/jispec/bootstrap/evidence-ranking.ts`
- `tools/jispec/bootstrap/contract-source-adapters.ts`
- `tools/jispec/bootstrap/discover.ts`
- `tools/jispec/bootstrap/takeover.ts`
- `tools/jispec/bootstrap/adopt-summary.ts`
- `tools/jispec/bootstrap/retakeover-metrics.ts`
- `tools/jispec/provenance/evidence-provenance.ts`
- `tools/jispec/greenfield/evidence-graph.ts`
- `tools/jispec/greenfield/project-assets.ts`

怎么做：

- 统一 ranked evidence 的 provenance 字段和 owner-review posture
- 让 discover 输出能说明来源、置信度、证据类型、是否需要 owner review
- 让 Greenfield 的 `source_confidence` 与 bootstrap 的 provenance taxonomy 对齐
- 让旧 artifact 缺字段时降级为 `UNKNOWN`，不崩溃

测试清单：

- bootstrap discover 产物包含 provenance labels
- ranked evidence 里 strong / weak / ambiguous 证据能稳定区分
- 缺 provenance 字段时能降级而不是失败
- Greenfield 和 takeover 共享同一套语言

验收标准：

- 每条 ranked evidence 至少能说明来源、证据类型、置信级别、owner review posture
- 弱证据不会被自动采纳为 blocking contract
- 摘要里能看出明确证据与推断证据的比例

任务卡：

- `A1.1` 定义统一 provenance 枚举与兼容降级策略
  - 状态：done
  - 改动点：`tools/jispec/provenance/evidence-provenance.ts`、`tools/jispec/bootstrap/evidence-ranking.ts`
  - 做什么：收口 `EXTRACTED`、`INFERRED`、`AMBIGUOUS`、`OWNER_REVIEW`、`UNKNOWN`
  - 验收：旧 artifact 缺字段时稳定降级，不影响 discover / draft
- `A1.2` 让 discover 输出 provenance
  - 状态：done
  - 改动点：`tools/jispec/bootstrap/discover.ts`、`tools/jispec/bootstrap/contract-source-adapters.ts`
  - 做什么：给 evidence、adapter、ranking 增加 source path、confidence、owner review posture
  - 验收：bootstrap discover 产物能说明证据来源和置信层级
- `A1.3` 让 takeover / adopt 摘要显式展示证据分布
  - 改动点：`tools/jispec/bootstrap/takeover.ts`、`tools/jispec/bootstrap/takeover-brief.ts`、`tools/jispec/bootstrap/adopt-summary.ts`
  - 做什么：在 human summary 中展示 extracted / inferred / ambiguous 占比
  - 状态：done
  - 验收：reviewer 一眼能看出哪些是强证据、哪些是推断
- `A1.4` 把 provenance 回归接进测试矩阵
  - 改动点：`tools/jispec/tests/bootstrap-takeover-brief.ts`、`tools/jispec/tests/bootstrap-adopt-handoff.ts`、`tools/jispec/tests/p9-evidence-provenance-labels.ts`
  - 做什么：补 strong / weak / ambiguous / unknown fixture
  - 状态：done
  - 验收：缺字段、弱证据、冲突证据都有稳定回归

### Milestone A2: Impact Graph 与 Scope Hint 扩充

目标：

- 让 change / implement / verify 能消费统一的 contract-aware impact 结果
- 让影响面提示进入 review packet，但不直接制造 blocking

文件范围：

- `tools/jispec/change/spec-delta.ts`
- `tools/jispec/change/change-session.ts`
- `tools/jispec/change/change-command.ts`
- `tools/jispec/change/blast-radius.ts`
- `tools/jispec/change/impact-summary.ts`
- `tools/jispec/impact-analysis.ts`
- `tools/jispec/verify/verify-runner.ts`
- `tools/jispec/ci/verify-report.ts`
- `tools/jispec/ci/verify-summary.ts`

怎么做：

- 从 changed files / changed symbols / contract refs 构建 impact 结果
- 将 impact graph 作为 advisory / required scope hint 输入 verify
- 让 verify 报告 impact freshness、scope coverage、missing hint
- 继续保持 blocking 只能来自 deterministic verify / policy

测试清单：

- API route 变更能指向相关 contract / schema / behavior
- 文档变更不会误报大量 blocking impact
- impact graph 缺失或过期时 verify 仍可运行
- scope hint 只影响提示，不改变 blocking 决策源

验收标准：

- 修改路径能稳定产出受影响契约集合
- verify summary 能说明影响、 freshness 和下一步动作
- 外部图谱、LLM 推断、弱证据都不能单独升级为 blocking

任务卡：

- `A2.1` 定义统一 impact result 结构
  - 改动点：`tools/jispec/change/impact-summary.ts`、`tools/jispec/change/spec-delta.ts`、`tools/jispec/change/change-session.ts`
  - 做什么：统一 changed files、contract refs、freshness、scope hint 的输出字段
  - 状态：done
  - 验收：change/implement/verify 共享同一套 impact 结构
- `A2.2` 扩展 change 侧影响面收集
  - 改动点：`tools/jispec/change/change-command.ts`、`tools/jispec/change/spec-delta.ts`
  - 做什么：从变更摘要和目标文件构建可读 impact seeds
  - 状态：done
  - 验收：API / schema / behavior 变更能稳定指向受影响契约
- `A2.3` 让 verify 消费 freshness 与 scope hint
  - 改动点：`tools/jispec/verify/verify-runner.ts`、`tools/jispec/ci/verify-report.ts`、`tools/jispec/ci/verify-summary.ts`
  - 做什么：把 impact freshness、missing hint、coverage hint 写进 verify 结果
  - 状态：done
  - 验收：impact 缺失或过期时只降级提示，不阻断 verify
- `A2.4` 把 impact 回归接入场景 fixture
  - 改动点：`tools/jispec/tests/p9-change-impact-summary.ts`、`tools/jispec/change/change-command.ts`
  - 做什么：新增 route change、schema drift、doc-only、stale graph fixture
  - 状态：done
  - 验收：scope hint 只影响提示，不改变 blocking 源

### Milestone A3: Reviewer Packet 与 Human Summary 统一

目标：

- 让 takeover brief、adopt summary、change impact summary、implementation handoff 使用同一套 Decision Snapshot 结构

文件范围：

- `tools/jispec/human-decision-packet.ts`
- `tools/jispec/bootstrap/takeover-brief.ts`
- `tools/jispec/bootstrap/adopt-summary.ts`
- `tools/jispec/change/impact-summary.ts`
- `tools/jispec/implement/handoff-packet.ts`
- `tools/jispec/greenfield/review-pack.ts`
- `tools/jispec/greenfield/ai-implement-handoff.ts`

怎么做：

- 统一 Markdown companion 的章节顺序
- 让关键摘要都能回答：当前状态、风险、证据、owner、下一步命令
- 保持 Markdown 只是 companion artifact，机器仍读 JSON / YAML / JSONL

测试清单：

- takeover brief 与 adopt summary 共享相同首屏语义
- verify summary 和 CI summary 使用同一套控制上下文语言
- implementation handoff 能清楚标出 stop point、owner、next command

验收标准：

- 人类可以在几分钟内判断下一步动作
- Markdown 与机器产物职责分离清楚
- 摘要语言不漂移

任务卡：

- `A3.1` 统一 Decision Snapshot 结构
  - 改动点：`tools/jispec/human-decision-packet.ts`
  - 做什么：抽出共用的 current state / risk / evidence / owner / next command 结构
  - 状态：done
  - 验收：所有关键 summary 的首屏语义一致
- `A3.2` 对齐 takeover / adopt / change / implement 摘要
  - 改动点：`tools/jispec/bootstrap/takeover-brief.ts`、`tools/jispec/bootstrap/adopt-summary.ts`、`tools/jispec/change/change-command.ts`、`tools/jispec/implement/handoff-packet.ts`
  - 做什么：把不同流程的 companion 文本改成同一章节顺序
  - 状态：done
  - 验收：reviewer 不用切换阅读模式
- `A3.3` 对齐 Greenfield review 和 handoff 语言
  - 改动点：`tools/jispec/greenfield/review-pack.ts`、`tools/jispec/greenfield/ai-implement-handoff.ts`
  - 做什么：让 review pack 和 implement handoff 共享同一组字段
  - 状态：done
  - 验收：同一条决策在不同阶段的表述一致
- `A3.4` 增加摘要一致性回归
  - 改动点：`tools/jispec/tests/greenfield-verify-policy-ci-gate.ts`、`tools/jispec/tests/implement-handoff-mainline.ts`
  - 做什么：校验 summary、CI summary、handoff 的核心短语对齐
  - 状态：done
  - 验收：Markdown 不是第二套事实源

## 工作流 B: 引导式契约创建

### 目标

把用户输入压缩到最少：

- 需求文档
- 需求 + 技术方案

其余部分由 JiSpec 自动起草，用户只在关键分歧上决策。

### Milestone B1: 输入协议与草稿骨架

目标：

- 明确两种标准输入：requirements only、requirements + technical solution
- 让 draft 自动生成 domain / api / behavior 草稿、open questions、confidence、review posture

文件范围：

- `tools/jispec/bootstrap/draft.ts`
- `tools/jispec/greenfield/domain-draft.ts`
- `tools/jispec/greenfield/api-contract-draft.ts`
- `tools/jispec/greenfield/behavior-draft.ts`
- `tools/jispec/greenfield/project-assets.ts`
- `tools/jispec/greenfield/source-documents.ts`

怎么做：

- 让 draft 更像“起草器”，不是“扫描器输出拼接器”
- 对需求-only 场景优先生成保守草稿
- 对需求 + 技术方案场景提升结构化程度和置信度
- 保留 open questions，不把不确定性偷偷抹平

测试清单：

- requirements-only fixture
- requirements + technical solution fixture
- domain/api/behavior 三类草稿均能生成
- open questions 能落盘到 manifest / companion artifact

验收标准：

- 用户不需要手工搭契约骨架
- 草稿质量随输入强度变化，不伪装确定性
- 低置信草稿会自然进入 owner review 或 spec debt 候选

任务卡：

- `B1.1` 明确输入契约
  - 状态：done
  - 改动点：`tools/jispec/greenfield/source-documents.ts`、`tools/jispec/bootstrap/draft.ts`
  - 做什么：把 requirements only 与 requirements + technical solution 作为标准输入面
  - 验收：两种输入都能被稳定识别并进入同一条 draft 流程
- `B1.2` 强化 domain/api/behavior 草稿起草
  - 状态：done
  - 改动点：`tools/jispec/greenfield/domain-draft.ts`、`tools/jispec/greenfield/api-contract-draft.ts`、`tools/jispec/greenfield/behavior-draft.ts`
  - 做什么：把候选契约、字段、场景、开放问题起草得更完整
  - 验收：草稿不是空壳，且能表达不确定性
- `B1.3` 把 open questions 落成结构化产物
  - 改动点：`tools/jispec/greenfield/project-assets.ts`
  - 做什么：把未决问题写入 manifest / companion，而不是散在文本里
  - 状态：done
  - 验收：用户能知道还缺什么决策
- `B1.4` 增加输入协议回归
  - 改动点：`tools/jispec/tests/greenfield-source-document-loader.ts`、`tools/jispec/tests/greenfield-project-asset-writer.ts`
  - 做什么：补 requirements-only 与 requirements + technical solution fixture
  - 状态：done
  - 验收：不同输入强度下草稿质量变化符合预期

### Milestone B2: Adopt 交互收口

目标：

- 让 adopt 成为“定稿器”
- 用户只做 accept / edit / defer / reject / waives 的少量决策

文件范围：

- `tools/jispec/bootstrap/adopt.ts`
- `tools/jispec/bootstrap/takeover.ts`
- `tools/jispec/bootstrap/adopt-summary.ts`
- `tools/jispec/greenfield/review-workflow.ts`
- `tools/jispec/greenfield/review-pack.ts`
- `tools/jispec/greenfield/spec-debt-ledger.ts`

怎么做：

- 将低置信或冲突项明确导向 review / spec debt
- 将高信号项优先收口为 adopted contract
- 让 adopt summary 直接呈现哪些草稿被接管、哪些被延期、哪些被拒绝

测试清单：

- 低置信行为证据不会被当成 adopted contract
- 冲突证据会进入 review packet 而不是静默吞掉
- spec debt 记录能被 verify 稳定消费

验收标准：

- 用户可以从最少输入完成契约接管
- adopt 结果能稳定进入 verify / CI 主线
- review / debt / adopted 三种落位清晰可追踪

任务卡：

- `B2.1` 明确 review disposition 映射
  - 改动点：`tools/jispec/greenfield/review-workflow.ts`、`tools/jispec/greenfield/review-pack.ts`
  - 做什么：让 low confidence、conflict、blocking、advisory 各自有稳定落位
  - 状态：done
  - 验收：冲突项不会误进 adopted
- `B2.2` 收紧 adopt commit 语义
  - 改动点：`tools/jispec/bootstrap/adopt.ts`、`tools/jispec/bootstrap/takeover.ts`
  - 做什么：让 accepted / edited / deferred / rejected 的 commit 结果稳定写出
  - 状态：done
  - 验收：契约、spec debt、takeover report 同步更新
- `B2.3` 对齐 adopt summary 与 spec debt ledger
  - 改动点：`tools/jispec/bootstrap/adopt-summary.ts`、`tools/jispec/greenfield/spec-debt-ledger.ts`
  - 做什么：让延期、债务、owner review 的解释一致
  - 状态：done
  - 验收：adopt summary 能直接指导下一步 verify 或 owner review
- `B2.4` 增加 adopt 回归
  - 改动点：`tools/jispec/tests/greenfield-review-pack-collector.ts`、`tools/jispec/tests/bootstrap-adopt-handoff.ts`
  - 做什么：覆盖 low-confidence、conflict、spec debt 三条路径
  - 状态：done
  - 验收：review / debt / adopted 三种落位可回归验证

### Milestone B3: 端到端引导式创建闭环

目标：

- 跑通从输入到草稿到 adopt 到 verify 的完整闭环

文件范围：

- `tools/jispec/cli.ts`
- `tools/jispec/tests/*`
- `tools/jispec/verify/verify-runner.ts`
- `tools/jispec/ci/verify-report.ts`
- `tools/jispec/ci/verify-summary.ts`

怎么做：

- 以现有 Greenfield / takeover fixture 为主，扩展新场景 fixture
- 让 CLI、summary、report、policy 的语言完全对齐

测试清单：

- takeover golden path
- greenfield input contract path
- low-confidence review path
- deferred spec debt path
- missing contract blocking path

验收标准：

- 从需求到契约到 verify 的主链路可重复
- 用户不需要从零创建所有契约文件
- 规则和证据的职责分离稳定

任务卡：

- `B3.1` 串联 CLI 到草稿到 adopt
  - 改动点：`tools/jispec/cli.ts`、`tools/jispec/bootstrap/draft.ts`、`tools/jispec/bootstrap/adopt.ts`
  - 做什么：把输入协议贯穿到 CLI 主线
  - 验收：最少输入可以跑通草稿和接管
- `B3.2` 对齐 verify / CI 输出
  - 改动点：`tools/jispec/verify/verify-runner.ts`、`tools/jispec/ci/verify-report.ts`、`tools/jispec/ci/verify-summary.ts`
  - 做什么：让 verify 能读懂 adopt 后的契约状态和 spec debt
  - 验收：blocking / advisory / debt 在 summary 中一致
- `B3.3` 补齐端到端 fixture
  - 改动点：`tools/jispec/tests/*`
  - 做什么：补 takeover golden path、greenfield path、missing contract path
  - 验收：每条输入路径都有稳定回归
- `B3.4` 收口最终验收口径
  - 改动点：`docs/second-layer-guided-contract-implementation-plan.md`
  - 做什么：把交付验收转成可执行 checklist
  - 验收：后续开发按文档逐卡推进即可

## 建议执行顺序

1. 先做 A1，统一证据语言
2. 再做 A2，把影响面收口成可消费的 scope hint
3. 同步做 B1，让草稿入口更稳
4. 然后做 B2，把 adopt 变成定稿器
5. 最后做 A3 和 B3 的端到端闭环

## 可执行清单

### P0

- [x] A1.1 定义统一 provenance 枚举与兼容降级策略
- [x] A1.2 让 discover 输出 provenance
- [x] B1.1 明确输入契约
- [x] B1.2 强化 domain/api/behavior 草稿起草

### P1

- [x] A2.1 定义统一 impact result 结构
- [x] A2.2 扩展 change 侧影响面收集
- [x] B2.1 明确 review disposition 映射
- [x] B2.2 收紧 adopt commit 语义

### P2

- [x] A3.1 统一 Decision Snapshot 结构
- [x] A3.2 对齐 takeover / adopt / change / implement 摘要
- [x] B3.1 串联 CLI 到草稿到 adopt
- [x] B3.2 对齐 verify / CI 输出

### P3

- [x] A1.3 takeover / adopt 摘要显式展示证据分布
- [x] A1.4 provenance 回归接入测试矩阵
- [x] A2.3 verify 消费 freshness 与 scope hint
- [x] A2.4 impact 回归接入场景 fixture
- [x] A3.3 对齐 Greenfield review 和 handoff 语言
- [x] A3.4 增加摘要一致性回归
- [x] B1.3 把 open questions 落成结构化产物
- [x] B1.4 增加输入协议回归
- [x] B2.3 对齐 adopt summary 与 spec debt ledger
- [x] B2.4 增加 adopt 回归
- [x] B3.3 补齐端到端 fixture
- [x] B3.4 收口最终验收口径

## 统一测试矩阵

建议至少覆盖这些 fixture：

- requirements only
- requirements + technical solution
- API route change
- schema drift
- behavior weakness
- doc-only change
- impact graph missing
- impact graph stale
- adoption defer to spec debt
- review conflict

建议必跑命令：

```bash
npm run typecheck
npm run jispec-cli -- bootstrap discover --json
npm run jispec-cli -- bootstrap draft --json
npm run jispec-cli -- adopt --interactive --json
npm run jispec-cli -- verify --json
npm run ci:verify
```

建议新增或扩展的回归：

- `tools/jispec/tests/bootstrap-draft-quality.ts`
- `tools/jispec/tests/bootstrap-adoption-ranked-evidence.ts`
- `tools/jispec/tests/greenfield-verify-policy-ci-gate.ts`
- `tools/jispec/tests/implement-mainline-lane.ts`
- `tools/jispec/tests/verify-json-contract.ts`

## 交付验收

完成这份计划时，应该满足：

- 第二层能稳定说明证据、影响、freshness、scope hint、owner review posture
- 第三层能从最少输入自动起草契约
- 用户主要做确认和纠偏，不做骨架工作
- `verify` 仍是唯一 blocking gate
- Markdown companion 和 JSON/YAML 机器产物职责清晰分离
- 新增能力不破坏现有 V1 主线契约

## 备注

本文是开发指导文档，不是机器契约。若实现与本文冲突，以 `verify`、`ci:verify` 和主线稳定契约为准。
