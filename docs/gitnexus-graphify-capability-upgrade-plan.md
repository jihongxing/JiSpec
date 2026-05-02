# JiSpec 借鉴 GitNexus / Graphify 的能力升级方案

日期：2026-05-02

## 结论

JiSpec 可以借鉴 GitNexus 和 Graphify 的能力，但不能改变自身定位。

JiSpec 的核心仍然是：

```text
需求 / 契约 -> 实现 -> 验证 -> CI gate -> 审计 / 回放
```

GitNexus 和 Graphify 的能力应该进入 JiSpec 的证据层、影响分析层、人类审阅包和未来 Console read model，而不是替代 `verify`、`ci:verify`、policy、baseline、waiver 或 release compare。

升级目标不是把 JiSpec 做成代码理解助手，而是让 JiSpec 在每次 takeover、change、implement 和 release review 时更清楚地回答：

- 这次变更影响哪些契约？
- 哪些证据是明确抽取的，哪些只是推断？
- 哪些验证必须跑，哪些风险只需要 owner review？
- Reviewer 能不能在几分钟内看懂风险、边界和下一步动作？
- 多仓或跨服务场景下，contract drift 是否被及时暴露？

## 借鉴来源和边界

| 来源项目 | 借鉴能力 | JiSpec 化后的落点 | 不直接照搬的部分 |
| --- | --- | --- | --- |
| GitNexus | 代码知识图谱、依赖链、调用链、执行流、impact analysis | `contract-aware impact graph`、change/implement 前后影响分析、verify scope hint、Console governance read model | 不把 GitNexus 式图谱查询变成 JiSpec 的主产品面 |
| GitNexus | MCP 工具、资源、repo/group 多仓视图 | 后续作为可选 external adapter 或 Console 多仓聚合输入 | 不让 MCP 输出直接决定 blocking verdict |
| GitNexus | 多仓 group、跨 repo 查询、staleness check | `console export-governance` 和未来 multi-repo contract drift 聚合 | 不在 V1 主线里引入远程服务依赖 |
| GitNexus | CI、cross-platform、coverage、E2E、release supply-chain discipline | 强化 JiSpec 自身 gate、post-release gate、发布验证说明 | 不引入大规模发布基础设施作为近期核心任务 |
| Graphify | `GRAPH_REPORT.md` 式紧凑结构报告 | `takeover-review-packet.md`、`change-impact-summary.md`、`implementation-review-packet.md` | 不把 token compression 作为 JiSpec 核心卖点 |
| Graphify | `EXTRACTED / INFERRED / AMBIGUOUS` 证据标签 | evidence provenance、owner review、spec debt、overclaim control | 不让 LLM semantic edge 进入 blocking gate |
| Graphify | token-budgeted query、subgraph 查询 | reviewer packet 和 handoff packet 的预算化上下文 | 不要求 agent 读取完整 graph JSON |
| Graphify | cache / update / watch / hook 思路 | source collector cache、change session refresh hint、stale evidence warning | 不默认安装侵入式 git hook |

## 非目标

- 不把 JiSpec 改造成 GitNexus 或 Graphify 的竞品。
- 不追求通用的 71x token compression 指标。
- 不把 LLM、semantic graph、embedding 或 inferred edge 放进 blocking verify path。
- 不优先做炫酷图可视化，除非它服务于 contract drift、impact review 或 governance review。
- 不让 Console、MCP、外部 graph service 覆盖本地 deterministic gate。
- 不在短期内引入必须联网、必须上传源码、必须依赖外部数据库的流程。

## 总体架构

升级后的 JiSpec 可以增加一层 `Contract-Aware Evidence Graph`，位于 source scanning 和 deterministic gate 之间。

```text
bootstrap discover / static collector / change diff
        |
        v
Contract-Aware Evidence Graph
        |
        +--> adoption-ranked evidence
        +--> contract-source adapters
        +--> impact graph
        +--> provenance labels
        +--> reviewer packets
        |
        v
verify / ci:verify / policy / baseline / waiver / release compare
```

这层图谱只提供证据、范围、解释和建议。是否 blocking 仍由现有 gate 决定。

## 能力 1：Contract-Aware Impact Graph

### 借鉴对象

主要借鉴 GitNexus 的 impact analysis、call chain、dependency mapping、process-grouped search 和 changed-lines impact 思路。

### JiSpec 改造目标

让 `change`、`implement`、`verify` 能够理解本次变更与契约之间的关系：

- changed files / changed symbols 影响哪些 contracts、API surfaces、behavior scenarios、schemas、tests。
- 哪些影响是 direct，哪些是 transitive。
- 哪些 contract 需要重新验证。
- 哪些影响只需要 owner review 或 spec debt follow-up。
- 哪些 impact evidence 不足，不能自动升级为 blocking。

### 可能新增产物

```text
.spec/facts/impact/impact-graph.json
.spec/facts/impact/change-impact.json
.spec/handoffs/change-impact-summary.md
.spec/handoffs/implementation-review-packet.md
```

### 影响模块

| 模块 / 文件区域 | 改造内容 |
| --- | --- |
| `tools/jispec/change/` | 在 change session 中记录 changed files、declared intent、expected contract refs、impact hints |
| `tools/jispec/implement/implement-runner.ts` | 在 preflight 和 post-verify 之间读取 impact summary，输出 patch 是否覆盖影响范围 |
| `tools/jispec/implement/handoff-packet.ts` | 在 handoff packet 中增加 impacted contracts、impacted files、missing verification hints、replay commands |
| `tools/jispec/verify/verify-runner.ts` | 使用 impact graph 生成 advisory / required scope hints，但不让图谱单独制造 blocking |
| `tools/jispec/ci/verify-report.ts` | 在 CI report 中展示 impacted contract count、unreviewed impact count、scope freshness |
| `tools/jispec/tests/` | 增加 change-impact、implement-impact、verify-impact integration tests |

### 验收标准

- 修改某个 API handler 时，JiSpec 能指出受影响的 API contract、schema 和相关 behavior scenario。
- 修改只影响文档或非产品资产时，不应误报大量 blocking impact。
- impact graph 缺失或过期时，`verify` 仍可运行，但报告 `impact_graph: not_available_yet` 或 `stale`。
- impact graph 只产生 advisory 或 scope hint；blocking 仍必须来自 deterministic verify / policy。
- 至少覆盖 5 类 fixture：API route、schema drift、frontend route、service function、test-only change。

## 能力 2：Evidence Graph v2 和 Provenance Labels

### 借鉴对象

借鉴 Graphify 的 `EXTRACTED / INFERRED / AMBIGUOUS` 标签，以及 GitNexus 的 language-aware structural edges。

### JiSpec 改造目标

让 bootstrap evidence graph 和 contract-source adapters 能清楚说明证据来源：

- `EXTRACTED`: 从代码、schema、OpenAPI、tests、docs、config 明确抽取。
- `INFERRED`: 从目录、命名、引用关系、弱模式推断。
- `AMBIGUOUS`: 存在冲突、证据不足或多种解释。
- `OWNER_REVIEW`: 不能自动采纳，必须进入 owner review 或 spec debt。

### 可能新增或扩展产物

```text
.spec/facts/bootstrap/evidence-graph.json
.spec/facts/bootstrap/adoption-ranked-evidence.json
.spec/facts/bootstrap/contract-source-adapters.json
.spec/handoffs/bootstrap-takeover.json
```

现有文件可以演进 schema，不一定新增平行 v2 文件。为了兼容，建议先增加可选字段：

```json
{
  "provenance": "extracted",
  "confidence": "strong",
  "evidenceKinds": ["route", "schema", "test"],
  "sourceLocations": ["src/api/orders.ts:42"],
  "ownerReviewRequired": false
}
```

### 影响模块

| 模块 / 文件区域 | 改造内容 |
| --- | --- |
| `tools/jispec/bootstrap/discover.ts` | 输出结构边、证据类型、source location、provenance label |
| `tools/jispec/bootstrap/draft.ts` | 只把 strong extracted evidence 直接用于 draft，weak inferred evidence 默认 owner review |
| `tools/jispec/bootstrap/takeover-brief.ts` | 人类摘要展示 extracted / inferred / ambiguous 占比 |
| `tools/jispec/bootstrap/retakeover-metrics.ts` | 增加 evidence provenance precision、ambiguous evidence count、owner-review evidence count |
| `tools/jispec/bootstrap/contract-source-adapters.ts` | 统一 adapters 输出的 provenance model |
| `schemas/` | 增加或扩展 evidence graph schema |

### 验收标准

- 每条 ranked evidence 都能说明来源、证据类型、置信级别和是否需要 owner review。
- 弱 behavior evidence 不会被自动采纳为 blocking contract。
- contract drift fixture 中，冲突证据必须进入 reviewer packet，而不是被 ranking 静默吞掉。
- retakeover regression pool 能统计 extracted / inferred / ambiguous 的比例。
- schema 兼容旧产物，缺失 provenance 字段时应降级为 `unknown` 而不是崩溃。

## 能力 3：Reviewer Decision Packets

### 借鉴对象

借鉴 Graphify 的 `GRAPH_REPORT.md`、god nodes、surprising connections、suggested questions、token-budgeted query 思路。

### JiSpec 改造目标

为每个关键节点生成短、准、可审阅的人类决策包：

- takeover review packet
- change impact packet
- implementation review packet
- release drift packet
- multi-repo governance packet

这些 packet 是 Markdown companion artifacts，不是机器 truth source。

### 可能新增产物

```text
.spec/handoffs/takeover-review-packet.md
.spec/handoffs/change-impact-summary.md
.spec/handoffs/implementation-review-packet.md
.spec/releases/compare/<from>-to-<to>/release-drift-packet.md
.spec/console/multi-repo-governance-summary.md
```

### 内容格式建议

每份 packet 固定回答：

1. 本次判断对象是什么？
2. 最强证据是什么？
3. 哪些证据只是推断？
4. 哪些地方存在冲突或 drift？
5. 哪些契约、测试、owner action 被影响？
6. 下一步是 merge、owner review、spec debt、修 patch，还是 rerun verify？

### 影响模块

| 模块 / 文件区域 | 改造内容 |
| --- | --- |
| `tools/jispec/bootstrap/takeover-brief.ts` | 从 takeover brief 扩展出更稳定的 decision packet 模板 |
| `tools/jispec/change/` | 在 change session 生成 change-impact summary |
| `tools/jispec/implement/handoff-packet.ts` | 输出 implementation review packet |
| `tools/jispec/release/` | release compare 增加 reviewer packet |
| `tools/jispec/console/read-model-snapshot.ts` | Console 可读取 packet 路径，但不得解析 Markdown 作为 gate |

### 验收标准

- packet 控制在 reviewer 可快速阅读的长度内，默认不超过约 150 行。
- packet 必须引用机器产物路径，例如 verify report、impact graph、takeover metrics。
- packet 不得包含无法由机器产物追溯的 blocking 结论。
- Console 只能显示 packet，不能把 packet 当作 machine API。
- 每个 packet 都有对应 JSON/YAML truth source。

## 能力 4：多仓 Contract Governance

### 借鉴对象

借鉴 GitNexus 的 multi-repo / group 概念，以及 repo registry、group status、cross-repo query 的产品形态。

### JiSpec 改造目标

把 JiSpec 现有 `console export-governance` 推进为多仓治理读模型：

- 收集多个 repo 的 governance snapshot。
- 展示哪些 repo verify 非 pass。
- 展示跨 repo contract drift。
- 展示 upstream / downstream contract 关系。
- 展示哪些 policy approval、waiver、release compare 缺失或过期。

### 可能新增产物

```text
.spec/console/repo-group.yaml
.spec/console/repo-group-governance.json
.spec/console/repo-group-governance-summary.md
```

### 影响模块

| 模块 / 文件区域 | 改造内容 |
| --- | --- |
| `tools/jispec/console/governance-dashboard.ts` | 增加 repo group 视图 |
| `tools/jispec/console/read-model-snapshot.ts` | 支持读取多个 exported governance snapshot |
| `tools/jispec/console/governance-actions.ts` | 为多仓 drift 输出建议命令，但不执行命令 |
| `docs/multi-repo-governance.md` | 明确 repo group 配置、输入、输出和隐私边界 |
| `tools/jispec/tests/console-multi-repo-governance.ts` | 扩展多仓 drift 和 missing approval tests |

### 验收标准

- 多仓聚合只读取各 repo 导出的 governance snapshot，不扫描源码。
- 单 repo verify 仍是唯一合并 gate，多仓 Console 只是治理视图。
- 缺失 snapshot 的 repo 显示 `not_available_yet`。
- 跨 repo contract drift 必须显示来源 repo、contract ref、release baseline 和下一步建议。
- 不需要远程服务即可在本地生成 group governance summary。

## 能力 5：External Graph Adapter

### 借鉴对象

借鉴 GitNexus 和 Graphify 的外部图谱产物，但以 adapter 方式接入。

### JiSpec 改造目标

允许团队把外部工具生成的图谱作为 advisory evidence 输入 JiSpec：

- GitNexus graph / impact output
- Graphify `graph.json` / `GRAPH_REPORT.md`
- 未来其他静态分析或架构图谱工具

这些输入必须经过 normalization 和 provenance labeling，不能直接变成 blocking gate。

### 可能新增产物

```text
.spec/facts/external-graphs/<provider>.json
.spec/facts/external-graphs/normalized-evidence.json
.spec/handoffs/external-graph-summary.md
```

### 影响模块

| 模块 / 文件区域 | 改造内容 |
| --- | --- |
| `tools/jispec/integrations/` | 新增 external graph adapter 入口 |
| `tools/jispec/facts/canonical-facts.ts` | 将外部 graph fact 标记为 advisory / external |
| `tools/jispec/verify/verify-runner.ts` | 允许展示 external evidence freshness，不允许外部图谱单独 blocking |
| `tools/jispec/privacy/` | 扫描外部图谱摘要中的敏感字符串 |
| `docs/integrations.md` | 增加外部图谱接入约束 |

### 验收标准

- 外部图谱缺失时 JiSpec 核心流程不受影响。
- 外部图谱格式错误时输出 invalid artifact warning，不中断 deterministic verify。
- 所有 external evidence 必须标记 provider、generatedAt、sourcePath、freshness。
- 外部图谱只能提升 reviewer visibility，不能覆盖本地 facts、policy、baseline。
- privacy report 必须覆盖 shareable external graph summary。

## 推荐实施顺序

### Phase 1：Evidence Provenance Foundation

优先落地 evidence provenance labels 和 schema 扩展。

原因：

- 它最符合 JiSpec 当前 takeover hardening。
- 风险低，不改变 gate 语义。
- 后续 impact graph、reviewer packet、external adapter 都依赖 provenance model。

主要改动：

- `discover` 输出 provenance。
- `draft` 根据 provenance 调整 owner review / spec debt。
- `retakeover metrics` 统计 evidence quality。
- 增加 schema 和 regression tests。

### Phase 2：Contract-Aware Impact Graph

在 `change` 和 `implement` 路径接入影响分析。

原因：

- 直接服务少返工和少漏测。
- 能明显提高 JiSpec 与 GitNexus 类能力的结合价值。
- 对 V1 mainline 有直接产品收益。

主要改动：

- 从 changed files / changed symbols / contract refs 构建 impact graph。
- 在 handoff packet 和 CI summary 中展示影响范围。
- `verify` 使用 impact graph 生成 scope hint。

### Phase 3：Reviewer Decision Packets

把现有 machine-first 产物压缩成稳定的人类判断包。

原因：

- 直接减少 reviewer 负担。
- 与 Graphify 最强能力契合，但不改变 gate。
- 对 pilot 和商业演示价值高。

主要改动：

- takeover、change、implement、release 各生成 packet。
- Console read model 只展示 packet。
- 回归测试固定 packet 必备章节。

### Phase 4：Multi-Repo Governance

增强 Console 的 repo group 能力。

原因：

- 适合 post-v1 / small team / regulated profile。
- 比单仓更接近真实团队治理。
- 但不应阻塞当前 V1 mainline。

### Phase 5：External Graph Adapter

最后做外部 GitNexus / Graphify 输入适配。

原因：

- 这会引入多格式兼容和隐私边界。
- 应在 JiSpec 自己的 evidence / impact model 稳定后再做。
- Adapter 是加分项，不是核心依赖。

## 代码影响总览

| 区域 | 主要影响 | 风险 |
| --- | --- | --- |
| `tools/jispec/bootstrap/` | evidence graph provenance、ranking、takeover packet、retakeover metrics | 中 |
| `tools/jispec/change/` | change session 增加 impact 输入和输出 | 中 |
| `tools/jispec/implement/` | handoff packet 增加 impact、review packet、replay metadata | 中 |
| `tools/jispec/verify/` | verify report 增加 impact hints 和 evidence freshness | 中 |
| `tools/jispec/ci/` | CI summary 展示 impact / packet 链接 | 低 |
| `tools/jispec/console/` | read model 读取 packet、multi-repo governance 扩展 | 中 |
| `tools/jispec/facts/` | canonical facts 增加 external/advisory graph fact | 中 |
| `tools/jispec/integrations/` | external graph adapter | 中高 |
| `tools/jispec/privacy/` | 外部图谱和分享包隐私扫描 | 中 |
| `schemas/` | evidence、impact、external graph schema | 中 |
| `docs/` | takeover、change、implement、multi-repo、integrations 文档更新 | 低 |
| `tools/jispec/tests/` | provenance、impact、packet、multi-repo、adapter 回归测试 | 中 |

## Gate 语义约束

所有阶段都必须遵守：

- `verify` 和 `ci:verify` 仍是 deterministic gate。
- evidence graph、impact graph、external graph 只能提供 evidence、scope、freshness、owner action。
- LLM、semantic extraction、Graphify inferred edge、GitNexus MCP answer 都不能单独变成 blocking issue。
- Markdown packet 只给人看，JSON/YAML 才是机器事实。
- 缺失或 stale graph 不能让核心 gate 崩溃，只能降级为 `not_available_yet`、`stale` 或 advisory warning。
- 任何外部图谱输入都必须标记 provider 和 freshness。

## 最终效果

完成后，JiSpec 的能力会从：

```text
contract-driven verify and governance gate
```

增强为：

```text
contract-aware delivery control layer with impact graph, provenance, reviewer packets, and multi-repo governance
```

用户可感知收益：

- takeover 阶段：更少噪声，更清楚的证据来源，更少误采纳。
- change 阶段：变更前就知道影响哪些契约和测试。
- implement 阶段：外部 patch 是否覆盖影响范围更清晰。
- verify / CI 阶段：报告不仅说 pass/fail，还说明影响范围和下一步。
- Console 阶段：团队可以看多仓治理状态，但不会覆盖本地 gate。
- 商业表达：JiSpec 不是又一个代码图谱工具，而是把图谱证据用于稳定交付和审计。

## 验收总标准

### 功能验收

- `bootstrap discover` 产物能输出 provenance labels。
- `change` 或 `implement` 至少一个主线命令能生成 impact summary。
- `verify` report 能显示 impact graph freshness 和 impacted contract hints。
- 至少 3 类 reviewer packet 可生成：takeover、change、implement。
- Console read model 能显示 packet 路径和 missing state。
- 多仓 governance 保持本地 snapshot 聚合，不扫描源码。

### 回归验收

- `npm run typecheck` 通过。
- `node --import tsx ./tools/jispec/tests/regression-runner.ts --manifest-json` consistency valid。
- 新增 provenance / impact / packet tests 纳入 regression runner。
- retakeover regression pool 覆盖 weak evidence、contract drift、noise-heavy hidden signal。
- post-release gate 扩展后仍能一键覆盖主线。

### 安全和隐私验收

- 外部图谱缺失、损坏或过期不会阻塞 deterministic verify。
- shareable packet 和 external graph summary 进入 privacy report 覆盖范围。
- 不上传源码，不默认联网，不引入远程服务作为主线依赖。
- Console 和 Markdown packet 不替代 JSON/YAML truth source。

### 产品验收

- 文档中明确说明 GitNexus / Graphify 是参考来源，不是运行时依赖。
- README 或 V1 stable contract 中说明 JiSpec 的定位没有变化。
- 用户能从 summary 中看出：哪些证据明确、哪些推断、哪些要 owner review。
- 变更前后 reviewer 能更快判断是否需要补测、补契约或修 patch。

## 推荐下一步

建议先立项为：

```text
P9: Contract-Aware Evidence and Impact Graph
```

并拆成三个首批任务：

1. `P9-T1 Evidence Provenance Labels`
2. `P9-T2 Change Impact Summary`
3. `P9-T3 Reviewer Decision Packets`

这三个任务可以在不改变 blocking gate 语义的前提下，为后续 multi-repo governance 和 external graph adapter 打基础。
