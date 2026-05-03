# North Star Acceptance

`jispec north-star acceptance` writes a local final acceptance package for the North Star closeout. It gathers existing JiSpec artifacts into one machine-readable aggregate and one human decision packet per scenario.

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

其中 `release drift` 场景现在不仅检查 drift trend artifact 是否存在，还会把 requirement evolution 的治理证据一起挂出来，包括：

- lifecycle registry path / version
- active source snapshot id
- last adopted source change id
- source evolution / source review artifact

这样它表达的是“这次 release drift 背后是否存在已治理的需求迁移”，而不是单纯存在一个 compare 报告。

Each scenario writes:

- `.spec/north-star/scenarios/<scenario>.json`
- `.spec/north-star/scenarios/<scenario>-decision.md`

The aggregate writes:

- `.spec/north-star/acceptance.json`
- `.spec/north-star/acceptance.md`

## Boundary

This suite is local-only. It does not upload source, does not use an LLM as a blocking decision source, and does not replace `verify`, `ci:verify`, `doctor v1`, `doctor runtime`, `doctor pilot`, or `post-release:gate`.

The suite proves the closeout claims by checking existing local artifacts for verifiability, auditability, blocking behavior, replayability, local-first operation, and controlled external-tool intake.
