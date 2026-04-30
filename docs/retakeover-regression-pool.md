# JiSpec Retakeover 回归池

这份文档定义 P0-T2 的真实仓库 retakeover 回归池。

回归池入口：

```bash
node --import tsx ./tools/jispec/tests/bootstrap-retakeover-regression.ts
```

统一回归矩阵中，该测试位于独立区域：

```text
retakeover-regression-pool
```

## 覆盖的旧仓库类型

当前回归池固定覆盖三类 real-like fixture：

| Fixture | 类型 | 主要风险 |
| --- | --- | --- |
| `remirage-like` | 高噪声 protocol/proto 旧仓库 | audit mirror、dependency bundle、vendor 和 build output 淹没真实协议证据 |
| `breathofearth-like` | 多语言金融服务仓库 | Python cache 噪声、SQL schema、中文业务文档和行为草稿置信度混杂 |
| `scattered-contracts-like` | 文档/API/schema 分散仓库 | 产品文档、OpenAPI、JSON schema、Node/Python/Go 实现分布在不同目录，需要汇成同一 takeover packet |

这些 fixture 不依赖外部仓库下载。测试会在临时目录中构造真实仓库形态，保证本地和 CI 可重复。

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
  - `deferredArtifacts`
- `verifyVerdict`
- `verifyOk`

`retakeover-summary.md` 是人类可读 companion artifact，不作为机器 API。它从同一份 metrics 渲染，帮助 reviewer 快速判断：

- 这次 takeover 的旧仓库风险类型是什么？
- top ranked evidence 是否由真实产品资产主导？
- draft quality 是否足够进入人工 review？
- adopt 阶段哪些 artifact 已接管，哪些被延期为 spec debt？
- takeover 后 verify 是否保持 non-blocking？

这些指标用来回答四个问题：

- discover ranking 是否仍能把高价值证据推到首次 takeover 上下文里？
- draft quality 是否仍能生成可审阅的 domain/API/feature 候选？
- adopt 阶段需要哪些修正、延期或 spec debt 决策？
- takeover 后 verify 是否保持 non-blocking？

## 扩展规则

新增 fixture 时必须满足：

- 代表一种新的旧仓库风险，而不是重复已有路径
- 覆盖 discover ranking、draft quality、adopt correction 和 verify verdict
- 在 `retakeover-regression-pool` 区域登记 expected test count
- 不依赖网络、外部服务或本机专属路径
- 通过 `npm run post-release:gate`
