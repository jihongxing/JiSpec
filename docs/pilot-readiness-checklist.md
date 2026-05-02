# JiSpec 试点就绪检查清单

`jispec doctor pilot` 用来判断某个仓库是否已经适合进入团队试点或客户试点。它和 `doctor v1` 不一样：`doctor v1` 证明 JiSpec 的工程内核健康，`doctor pilot` 证明某个具体仓库已经具备足够的本地产物、治理姿态和分享卫生，可以进入对外采用阶段。

## 检查项

- 安装入口：仓库具备可复现的本地 JiSpec 命令路径。
- 首次接管：已经提交 bootstrap takeover，或者已有 Greenfield baseline。
- CI 集成：`ci:verify` 存在，并且最新的 `.jispec-ci/verify-report.json` 没有 blocking issue。
- Policy 配置：`.spec/policy.yaml` 声明了 `solo`、`small_team` 或 `regulated`，并且有明确 owner。
- Waiver 与 spec debt：过期 waiver 和过期未清理的 open spec debt 已在试点审查前解决。
- Console 治理：已经导出 `.spec/console/governance-snapshot.json`，并声明本地优先、不会上传源码。
- 隐私报告：`.spec/privacy/privacy-report.json` 存在，且没有高严重级别发现。

## 当前状态

当前仓库已经完成 T0-1 到 T0-5，并补齐 Pilot product package 与 North Star acceptance 的本地入口：首次接管基线、带 owner 的 policy 配置、Console governance snapshot、privacy report、试点门禁、adoption package 和最终验收套件均已落盘或具备可重复命令。

最新 `npm run pilot:ready` 与 `doctor pilot --json` 结果为 `ready: true`、`blockerCount: 0`、7/7 检查通过。`post-release:gate`、`doctor v1`、`doctor runtime`、`doctor pilot` 和 `north-star acceptance` 共同构成当前收口验证面。下面的清单继续作为试点模板和后续仓库接入时的执行顺序保留。

1. 首次接管基线

   - 目标：提交 bootstrap takeover 或 Greenfield baseline，让仓库有一个可审阅的起点。
   - 建议命令：`npm run jispec -- first-run --root .`，然后按需执行 `bootstrap discover`、`bootstrap draft`、`adopt --interactive`。
   - 完成标准：已经存在已提交的 takeover 或 baseline，并且有清晰的 owner review 和可回放产物。

2. 带 owner 的 policy 配置

   - 目标：让 `.spec/policy.yaml` 声明真实 team owner，而不是 `unassigned`。
   - 建议命令：`npm run jispec -- policy migrate --profile small_team --owner <owner> --reviewer <reviewer> --root .`。
   - 完成标准：profile、owner 和 reviewer posture 都明确，并且与团队结构一致。

3. Console 治理快照

   - 目标：导出仓库本地治理视图，供外部 reviewer 直接阅读。
   - 建议命令：`npm run jispec -- console export-governance --root .`。
   - 完成标准：`.spec/console/governance-snapshot.json` 及其 Markdown companion 存在，并且仍然只是只读快照。

4. 隐私报告

   - 目标：在任何外部分享前先完成本地隐私扫描。
   - 建议命令：`npm run jispec -- privacy report --root .`。
   - 完成标准：`.spec/privacy/privacy-report.json` 和 `.spec/privacy/privacy-report.md` 存在，并且没有高严重级别发现。
   - 当前仓库状态：已扫描 834 个 JiSpec 本地产物，发现数为 0，高严重级别发现数为 0；因为没有发现敏感项，所以没有生成 redacted companion。

5. 试点门禁

   - 目标：把上述 backlog 收口成一个可重复执行的检查。
   - 建议命令：`npm run pilot:ready`；需要机器报告时执行 `npm run pilot:ready -- --json` 或 `npm run jispec -- doctor pilot --json`。
   - 完成标准：`ready: true` 且 `blockerCount: 0`。
   - 当前仓库状态：已通过，7/7 checks pass；失败时 gate 会直接列出 blocker、owner action、next command 和 source artifacts。

6. Pilot product package

   - 目标：把安装、first-run、first baseline、CI verify、Console governance、privacy report 和 `doctor pilot` 汇成一个可分享的本地 adoption path。
   - 建议命令：`npm run jispec -- pilot package --root .`。
   - 完成标准：`.spec/pilot/package.json` 和 `.spec/pilot/package.md` 存在；package 明确区分 mainline gates 与 governance companions。

7. North Star acceptance

   - 目标：在试点包之后生成最终本地验收套件，证明 legacy takeover、Greenfield、daily change、external patch mediation、policy waiver、release drift、Console governance、multi-repo aggregation 和 privacy report 已经形成同一条可验证交付主线。
   - 建议命令：`npm run jispec -- north-star acceptance --root .`。
   - 完成标准：`.spec/north-star/acceptance.json`、`.spec/north-star/acceptance.md` 和逐场景 decision packet 存在；套件明确不上传源码、不以 LLM 作为 blocking decision source，也不替代 `verify`、doctor profiles 或 `post-release:gate`。

## 边界

这份清单不承诺自动理解旧仓库。Legacy takeover 仍然需要 owner review、adoption decision、明确 spec debt 和本地 verify 产物。

每个 blocker 都应包含：

- 失败的检查项，
- owner action，
- 下一条本地命令，
- 导致或可以解除 blocker 的源产物路径。

## 命令

```bash
npm run pilot:ready
npm run pilot:ready -- --json
npm run jispec -- doctor pilot
npm run jispec -- doctor pilot --json
npm run jispec -- north-star acceptance
npm run jispec -- north-star acceptance --json
```

Pilot readiness 不能替代 `verify`、`ci:verify`、policy evaluation、privacy review、release compare 或 Console governance。它只是一个用于 adoption planning 的摘要。
