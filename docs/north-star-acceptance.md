# North Star Acceptance

`jispec north-star acceptance` writes a local final acceptance package for the North Star closeout. It gathers existing JiSpec artifacts into one machine-readable aggregate and one human decision packet per scenario.

This is the final local acceptance surface for the project. It is local-only and does not replace `verify`, `ci:verify`, `doctor v1`, `doctor runtime`, `doctor pilot`, or `post-release:gate`.

```bash
npm run jispec -- north-star acceptance --root .
npm run jispec -- north-star acceptance --root . --json
```

## Scenario Suite

The `north-star acceptance` suite covers:

- legacy takeover
- Greenfield
- daily change
- external patch mediation
- policy waiver
- release drift
- Console governance
- multi-repo aggregation
- privacy report
- source evolution reviewed and adopted
- source evolution deferred and later repaid
- Console source evolution governance visibility
- multi-repo owner-action generation
- release compare with source evolution context
- doctor global artifact health

其中 `release drift` 场景现在不仅检查 drift trend artifact 是否存在，还会把 requirement evolution 的治理证据一起挂出来，包括：

- lifecycle registry path / version
- active source snapshot id
- last adopted source change id
- source evolution / source review artifact

这样它表达的是“这次 release drift 背后是否存在已治理的需求迁移”，而不是单纯存在一个 compare 报告。

## Global Closure Layer

`P13-T2` 把 `north-star acceptance` 从“本地主链收尾清单”扩成“global closure 是否真的运转”的验收层。

新增的 global closure 场景会显式检查：

- source review 是否真的 adopt 并回写到了 lifecycle 语义
- deferred source review 是否留下了可追溯、可偿还、已偿还的历史
- Console 是否能把 source evolution governance 讲清楚
- multi-repo aggregate 是否真的生成 owner actions
- release compare 是否消费了 source evolution 与 aggregate context
- doctor global 依赖的 artifact 链是否健康

这些场景仍然只消费本地 artifact，不替代 `verify`、`ci:verify`、`doctor mainline/runtime/pilot` 或 `post-release:gate`。换句话说，acceptance complements but does not replace verify.

Each scenario writes:

- `.spec/north-star/scenarios/<scenario>.json`
- `.spec/north-star/scenarios/<scenario>-decision.md`

The aggregate writes:

- `.spec/north-star/acceptance.json`
- `.spec/north-star/acceptance.md`

## Boundary

This suite is local-only. It does not upload source, does not use an LLM as a blocking decision source, and does not replace `verify`, `ci:verify`, `doctor mainline`, `doctor runtime`, `doctor pilot`, or `post-release:gate`.

The suite proves the closeout claims by checking existing local artifacts for verifiability, auditability, blocking behavior, replayability, local-first operation, and controlled external-tool intake.
