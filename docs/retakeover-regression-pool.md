# JiSpec Retakeover 回归池

这份文档定义 P0-T2 的真实仓库 retakeover 回归池。

回归池入口：

```bash
node --import tsx ./tools/jispec/tests/bootstrap-retakeover-regression.ts
```

Synthetic messy legacy stress 入口：

```bash
node --import tsx ./tools/jispec/tests/bootstrap-messy-legacy-takeover.ts
```

如果要保留一份可以人工打开检查的接管输出，运行 demo：

```bash
node --import tsx ./scripts/run-messy-legacy-takeover-demo.ts --force
```

默认输出目录：

```text
.tmp/messy-legacy-takeover-demo/
```

统一回归矩阵中，该测试位于独立区域：

```text
retakeover-regression-pool
```

回归池还会写出 pool-level 聚合视图：

```text
.spec/handoffs/retakeover-pool-metrics.json
.spec/handoffs/retakeover-pool-summary.md
```

`retakeover-pool-metrics.json` 汇总所有 fixture 的机器指标，包括 fixture count、fixture class 覆盖、verify verdict 分布、draft quality totals、feature recommendation 分布、edit/defer/reject correction loop 概览和 takeover quality scorecard。

`retakeover-pool-summary.md` 是人类可读 companion artifact，不作为机器 API。它帮助 reviewer 快速判断整个回归池是否仍然覆盖三类旧仓库风险、是否全部 non-blocking、哪些 fixture 需要 owner review 或 spec-debt follow-up，以及 top evidence 是否仍然来自产品资产。

## 覆盖的旧仓库类型

当前回归池固定覆盖六类 real-like fixture：

| Fixture | 类型 | 主要风险 |
| --- | --- | --- |
| `remirage-like` | 高噪声 protocol/proto 旧仓库 | audit mirror、dependency bundle、vendor 和 build output 淹没真实协议证据 |
| `breathofearth-like` | 多语言金融服务仓库 | Python cache 噪声、SQL schema、中文业务文档和行为草稿置信度混杂 |
| `scattered-contracts-like` | 文档/API/schema 分散仓库 | 产品文档、OpenAPI、JSON schema、Node/Python/Go 实现分布在不同目录，需要汇成同一 takeover packet |
| `retail-ops-monorepo-like` | 多语言 monorepo / 微服务仓库 | TypeScript、Go、Python 服务各自持有 contract/test/handler，构建产物和生成 client 不能压过服务边界 |
| `member-portal-fullstack-like` | 前后端混合产品仓库 | 产品 journey、React route、OpenAPI、JSON schema、backend handler 和 E2E test 需要汇成一条用户能力边界 |
| `legacy-saas-debt-like` | 历史债务 SaaS 服务仓库 | v2 API、legacy route、migration/schema 和 spec debt ledger 同时存在，行为必须保守进入 owner review |

这些 fixture 不依赖外部仓库下载。测试会在临时目录中构造真实仓库形态，保证本地和 CI 可重复。

P0-T1 扩充后的回归池不再只回答“三类旧仓库风险是否覆盖”，还必须覆盖真实团队常见的三个额外形态：

- monorepo 中服务边界散落在多语言目录里
- fullstack 仓库中用户旅程横跨 UI、API、contract 和 backend handler
- 长期运行的 SaaS 仓库中 legacy boundary 与迁移后 boundary 并存，且已有明确 spec debt

这些新增 fixture 故意把 feature 行为保持在 owner-review/spec-debt 路径上，避免把“证据能连起来”误读为“行为已经可自动采纳”。

## N9 Synthetic Messy Legacy Takeover Stress

N9 额外构造一组 synthetic messy legacy fixture，用来补足没有真实“屎山代码”样本时的接管压力测试。它不是 JiSpec 能全自动理解任意旧系统的承诺，而是验证北极星路径上的保守能力：

- 噪声目录、生成物、依赖包和构建产物不会淹没首次 takeover evidence ranking
- god-file / 大杂烩路由只生成小而可审阅的 domain/API/feature packet，不把糟糕命名美化成确定边界
- 文档、OpenAPI、JSON schema 和代码路由发生 contract drift 时，冲突证据会一起留在 reviewer 面前
- 行为证据薄弱时，feature draft 会带上 human-review 标记并进入 spec debt，而不是伪装成可直接采纳
- adopt + verify 应保持 deterministic、non-blocking；若未来变成 blocking，需要明确说明原因

当前 synthetic fixture：

| Fixture | 类型 | 主要风险 |
| --- | --- | --- |
| `god-file-monolith-like` | synthetic god-file monolith | 单个 `server.js` 混合订单、支付、库存、客户、报表和坏命名函数 |
| `contract-drift-like` | synthetic contract drift | README、OpenAPI、JSON schema 和实际 route 对同一 checkout 行为给出不同路径/命名 |
| `noise-heavy-hidden-signal-like` | synthetic noise-heavy hidden signal | `vendor`、`dist`、`.cache`、`coverage`、`generated` 中有大量噪声，真实合同信号藏在 service 子目录 |
| `thin-behavior-evidence-like` | synthetic thin behavior evidence | 有 route/schema，但缺少测试或行为文档，需要 owner review/spec debt |

## 每个 fixture 必须记录的指标

每次 retakeover 都会写出：

```text
.spec/handoffs/retakeover-metrics.json
.spec/handoffs/retakeover-summary.md
```

`retakeover-metrics.json` 是机器可读指标源，记录：

- `fixtureId`
- `fixtureClass`
- `discoverSummary`
- `topRankedEvidence`
- `draftQuality`
  - `domainContextCount`
  - `aggregateRootCount`
  - `apiSurfaceCount`
  - `featureRecommendation`
- `adoptCorrection`
  - `acceptedArtifacts`
  - `editedArtifacts`
  - `deferredArtifacts`
  - `rejectedArtifacts`
  - `decisionCounts`
  - `artifactCorrectionLoad`
  - `correctionHotspots`
  - `ownerReviewArtifactCount`
- `verifyVerdict`
- `verifyOk`
- `qualityScorecard`
  - `noiseSuppressionRate`
  - `topEvidenceSignalRate`
  - `contractSignalPrecision`
  - `behaviorEvidenceStrength`
  - `adoptCorrectionLoad`
  - `humanCorrectionHotspots`
  - `overclaimBlockRate`
  - `adoptionReadyArtifactCount`
  - `needsOwnerDecisionCount`
  - `featureOverclaimRisk`
  - `verifySafety`
  - `takeoverReadinessScore`
  - `riskNotes`
  - `nextAction`

Scorecard 字段是 deterministic review signal，不是 LLM 评分：

- `noiseSuppressionRate` 用来观察噪声目录、生成物、依赖包、构建产物是否被压下去；没有发现噪声时视为 `1`，表示该 fixture 当前没有噪声压力。
- `topEvidenceSignalRate` 统计 top ranked evidence 中强边界信号占比，例如 governance/protocol doc、schema truth source、explicit endpoint 和 service entrypoint。
- `contractSignalPrecision` 统计全部 ranked takeover evidence 中强边界/契约信号占比，用来观察 evidence pool 是否精确。
- `behaviorEvidenceStrength` 统计 behavior draft 中无需 owner-review fallback 的强 scenario 占比。
- `adoptCorrectionLoad` 统计 adopt 阶段 edit/defer/reject 的加权 artifact 修正负担；edit 代表人工改写负担，defer/reject 代表完整人工决策负担。
- `humanCorrectionHotspots` 标出 reviewer 应优先关注的修正区域，例如 `edited_domain`、`deferred_feature`、`rejected_feature`、`behavior_owner_review`、`contract_signal_precision` 或 `feature_overclaim_risk`。
- `overclaimBlockRate` 记录弱 behavior 证据是否被 defer/spec-debt 挡住，而不是被误采纳为 ready contract。
- `adoptionReadyArtifactCount` 统计经过 overclaim 调整后仍可视为 adoption-ready 的 artifact 数。
- `needsOwnerDecisionCount` 统计 takeover 后仍需要 owner 判断的具体决策数量。
- `featureOverclaimRisk` 标记行为证据是否有被过度采纳的风险；当 feature draft 自己建议 `defer_as_spec_debt` 但被直接 accept 时会升为 `high`。
- `verifySafety` 只表达 takeover 后 deterministic verify 是否 blocking。
- `takeoverReadinessScore` 是 0-100 的保守综合分，供趋势观察和 regression 审计使用，不作为 release gate 的唯一裁判。
- `nextAction` 给 reviewer 一个紧凑动作建议：接管、owner review/spec debt，或先修 blocking verify。

`retakeover-summary.md` 是人类可读 companion artifact，不作为机器 API。它从同一份 metrics 渲染，帮助 reviewer 快速判断：

- 这次 takeover 的旧仓库风险类型是什么？
- top ranked evidence 是否由真实产品资产主导？
- draft quality 是否足够进入人工 review？
- adopt 阶段哪些 artifact 已接管，哪些被延期为 spec debt？
- adopt 阶段哪些 artifact 被人工编辑、拒绝或需要 owner review？
- takeover 后 verify 是否保持 non-blocking？
- 当前 fixture 的 readiness score、verify safety、feature overclaim risk、risk notes 和 next action 是什么？

每份 `retakeover-summary.md` 都包含一个 `Adopt Correction Loop` 区块和一个 `Quality Scorecard` 表格，固定面向人类审计，不作为机器 API。机器消费者应读取 `retakeover-metrics.json` 中的 `adoptCorrection` 和 `qualityScorecard`。

这些指标用来回答四个问题：

- discover ranking 是否仍能把高价值证据推到首次 takeover 上下文里？
- draft quality 是否仍能生成可审阅的 domain/API/feature 候选？
- adopt 阶段需要哪些修正、延期或 spec debt 决策？
- takeover 后 verify 是否保持 non-blocking？

Pool-level summary 额外回答：

- 三类 fixture 风险是否仍然都被覆盖？
- 是否存在 blocking fixture？
- 哪些 fixture 的 behavior evidence 需要 owner review？
- 哪些 top evidence 代表了这次 pool 的 takeover signal？
- 当前平均 takeover readiness score 是多少，最低分 fixture 是哪个风险带？
- feature overclaim risk 是否集中在某类 fixture 上？
- 哪些 fixture 的 next action 是 owner review/spec debt 或 blocking verify fix？

每份 `retakeover-pool-summary.md` 都包含 pool-level `Quality Scorecard` 表格，按 fixture 展示 score、verify safety、feature risk、deferred artifact、next action 和 risk notes。

P0-T2 后，pool summary 还包含 `Quality Scorecard V2` 表格，按 fixture 展示 contract precision、behavior strength、overclaim blocked、adoption-ready artifact、owner decision count 和 human correction hotspots。Pool-level JSON 同步聚合 average contract precision、average behavior evidence strength、average overclaim block rate、total adoption-ready artifact count、total owner decision count 和 fixtures with hotspots。这些字段用于趋势审计，不替代 deterministic verify gate。

P0-T3 后，feature draft 中的每个 scenario 都会暴露 behavior evidence extraction 结果：

- `# evidence_level: strong | partial | weak | unsupported`
- `# evidence_kinds: ["route", "test", "schema", "document", "proto", "aggregate"]`

`strong` 表示行为候选已经被 implementation、contract 和 business evidence 交叉支撑；`partial` 表示有部分非 route 证据但仍需 owner review；`weak` 表示主要只有 route 或命名线索；`unsupported` 表示只剩 fallback 边界推断。弱证据和 unsupported scenario 必须保持 `@behavior_needs_human_review` 或进入 spec debt，不能伪装成可直接采纳的行为契约。

P0-T4 后，adopt correction loop 不再只记录 deferred feature。单 fixture metrics 会记录 accepted、edited、deferred、rejected 四类 artifact 决策、每类 artifact 的 correction load、owner-review artifact count 和 correction hotspots。Pool-level JSON 同步聚合 edited/deferred/rejected artifact count、total correction load、owner-review artifact count、fixtures with edited/rejected/deferred artifacts，以及 top correction hotspots。Pool summary 增加 `Correction Loop` 表格，方便 reviewer 直接看到 takeover 质量还差在哪里，也方便后续优化用 correction load 趋势证明人工负担是否下降。

## 扩展规则

新增 fixture 时必须满足：

- 代表一种新的旧仓库风险，而不是重复已有路径
- 覆盖 discover ranking、draft quality、adopt correction 和 verify verdict
- 在 `retakeover-regression-pool` 区域登记 expected test count
- 不依赖网络、外部服务或本机专属路径
- 通过 `npm run post-release:gate`
