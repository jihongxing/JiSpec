# JiSpec V1 后发布门禁

这是 V1 主线发布之后固定使用的 post-release gate。

从仓库根目录运行：

```bash
npm run post-release:gate
```

这个入口会按固定顺序运行：

```text
npm run typecheck
node --import tsx ./tools/jispec/tests/regression-runner.ts
npm run ci:verify
```

门禁采用 fail-fast 语义。除非 `npm run post-release:gate` 以 `0` 退出，否则变更不能被视为 post-release ready。

适用场景：

- V1 之后的 release readiness
- 影响 bootstrap、adopt、verify、CI、change、implement、policy、waiver、release/baseline 行为的变更
- 触碰产品主线的 PR checklist 验证

小型纯文档变更可以运行更窄的检查，但 release candidate 发布前必须通过完整 gate。

如果未来某个 release candidate 出现 `WARN_ADVISORY` 但仍通过 release gate，可结合这份 companion 一起解释 advisory posture：

- [release-advisory-triage.md](./release-advisory-triage.md)

截至 2026-05-22，仓库自身的 `verify` 和 `ci:verify` 已达到 `PASS`，`0` blocking、`0` advisory、`0` unresolved gate gaps。当前完整 post-release gate 通过，回归矩阵基线为 `173 suites / 800 tests`。
