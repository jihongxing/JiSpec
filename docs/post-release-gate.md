# JiSpec V1 后发布门禁

这是 V1 主线发布之后固定使用的 post-release gate。

从仓库根目录运行：

```bash
npm run post-release:gate
```

这个入口会按固定顺序运行：

```text
npm run typecheck
node --import tsx ./tools/jispec/tests/v1-mainline-golden-path.ts
node --import tsx ./tools/jispec/tests/doctor-v1-readiness.ts
node --import tsx ./tools/jispec/tests/regression-runner.ts
npm run ci:verify
```

门禁采用 fail-fast 语义。除非 `npm run post-release:gate` 以 `0` 退出，否则变更不能被视为 post-release ready。

适用场景：

- V1 之后的 release readiness
- 影响 bootstrap、adopt、verify、CI、change、implement、policy、waiver、release/baseline 行为的变更
- 触碰产品主线的 PR checklist 验证

小型纯文档变更可以运行更窄的检查，但 release candidate 发布前必须通过完整 gate。

当前仓库若出现 `WARN_ADVISORY` 但仍通过 release gate，可结合这份 companion 一起解释 advisory posture：

- [docs/release-advisory-triage.md](docs/release-advisory-triage.md)

截至 2026-05-04，仓库自身的 `WARN_ADVISORY` 已收敛到单个 `BOOTSTRAP_SPEC_DEBT_PENDING` 历史治理债务；此前 `132` 个扫描边界噪音已完成收口。
