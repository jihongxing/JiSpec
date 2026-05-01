# JiSpec

中文 | [English](./README.md)

JiSpec 正在为小型 AI 原生工程团队构建一条 `contract-driven assembly line for AI-native software delivery`。

项目北极星：

> 把 AI 编程从个人英雄主义的手工作坊，推进到可验证、可审计、可阻断、可回放的现代软件交付流水线。

大模型和 AI coding tools 是高端机床；JiSpec 的目标不是再造一台机床，而是成为贯穿需求、契约、实现、验证、CI 和团队治理的流水线控制层。

详见：[docs/north-star.md](docs/north-star.md)

当前产品面正在收敛到：

- `JiSpec-CLI`
  本地优先的契约验证与开发者工作流命令面
- `JiSpec-Console`
  团队级 policy、audit、waiver 与 contract drift 控制平面

当前仓库已经包含较深的协议层与流水线引擎能力。代码库仍然暴露 legacy `slice/context` 命令面，但主要产品方向已经收敛为：

`bootstrap discover -> bootstrap draft -> adopt -> verify -> change -> implement`

## V1 发布状态

基于当前主线、黄金路径 E2E 验收以及两次真实旧仓库接管演示，这个仓库现在已经处于可以发布为一个**范围明确的 V1 主线版本**的状态。

这意味着：

- V1 主线已经真实存在并且可运行：
  `bootstrap discover -> bootstrap draft -> adopt -> verify -> ci:verify -> change -> implement`
- 产品已经在真实仓库上证明了 V1 的 `Aha Moment`：
  它可以足够快地生成第一批契约草稿，让人类做认领和重锚，而不是从零手写整套规范
- `verify` 已经能理解历史债务、延后 spec debt 和当前 blocking issue 之间的区别

这**不**意味着：

- 这还不是一个“高质量全自动契约生成”的发布版本
- 在复杂仓库里，`domain/api` 在 adopt 阶段仍然需要人类引导纠偏
- 在高噪声仓库里，`feature` 草稿目前明显弱于 `domain` 和 `api`，证据薄时会被 review gate 降级

这版产品的正确发布口径应该是：

- `V1 mainline`
- `human-guided legacy repo takeover`
- `local-first contract verification and CI gate`

而不应该是：

- `fully automatic legacy repo understanding`
- `LLM-first blocking gate`
- `mature console/distributed/collaboration product suite`

发布说明：

- [docs/releases/v0.1.0.md](docs/releases/v0.1.0.md)

## 人类可读产物缺口

两次 `C8` 还暴露出了另一个重要事实：

主线现在已经能够写出正确的产物，但其中很多产物仍然是 `machine-first`，而不是 `human-first`。

当前 JiSpec 已经能够落盘：

- 完整的 bootstrap evidence graph
- 非排除资产的 full inventory
- adoption-ranked evidence packet
- draft session manifest
- adopted contract 和 spec-debt record
- takeover report、takeover brief 和 adopt summary
- verify JSON report、verify summary
- CI summary

这在技术上很有价值，并且 takeover 路径现在已经把机器产物与人类决策产物分开：

- `evidence-graph.json` 和 `full-inventory.json` 是 machine-first 的系统底账
- `adoption-ranked-evidence.json` 是 draft 和 takeover review 使用的高信号证据包
- `bootstrap-summary.md` 是推荐的人类可读 discover 摘要；`evidence-summary.txt` 作为兼容路径保留
- `takeover-brief.md` 是 reviewer 几分钟内可以扫完的人类决策包
- `adopt-summary.md` 是 accepted、edited、rejected、deferred draft 决策的紧凑认领摘要
- `verify-summary.md` 是对能否合并、阻断点、advisory/debt 和下一步动作的紧凑验证摘要

Post-v1 北极星推进任务已经把 adopt summary、verify summary、bootstrap summary 命名和 Greenfield verify summary 语言对齐收口。剩余工作不再是“补齐摘要有无”，而是继续把主线摘要质量打磨得更短、更准、更接近 reviewer 的实际决策路径。

理想的输出模型应该变成：

1. `Machine-readable artifacts`

- 完整 JSON 和 contract 文件仍然是系统记录真相源
- 自动化、CI 和未来的 policy engine 继续依赖它们

2. `Human-readable companion artifacts`

- 主线的每一个关键步骤，都应默认额外产出一层紧凑解释材料
- 例如：
  `bootstrap-summary.md`
  `adopt-summary.md`
  `verify-summary.md`
  `takeover-brief.md`

终局规则是：

`raw evidence for machines, distilled decision packets for humans`

## Discover 优化路线

两次 `C8` 暴露出的最大缺口，不是“主线缺失”，而是“在复杂仓库里 discover 的证据质量仍然太吵”。

当前的失败模式：

- vendor 依赖、审计镜像、缓存目录和生成资产会主导 evidence ranking
- `discover` 目前更擅长生成广义 inventory，而不是尖锐的 takeover summary
- 当 evidence graph 被非产品文件数量主导时，`draft` 质量就会明显下降

优化路线应该分三步走：

1. `Noise suppression`

- 默认更激进地忽略 vendored、mirrored、cache、build、audit、dependency-bundle 目录
- 像 `artifacts/dpi-audit/.pydeps/**` 这类目录，除非用户显式 opt in，否则应视作默认排除候选
- 将 `inventory evidence` 与 `adoption-ranked evidence` 分层，避免大仓库淹没首次 takeover 回路

2. `Boundary-first ranking`

- 让 `README`、governance doc、protocol doc、manifest、controller、service entrypoint、schema truth source 的权重高于单纯文件数量
- bounded context 的推断应更多依赖组件结构，而不是 route/file 频率
- 明确区分 `explicit endpoint`、`module surface inference` 与 `weak candidate`，避免 draft 把所有证据压成同一类

3. `Takeover-grade summaries`

- 在完整 evidence graph 之外，再生成一个紧凑的“首次接管关键证据”产物
- 默认 draft 输入应限制在最高价值的 contract signal 上，除非用户显式要求 exhaustive mode
- 默认输出一份人类可读的 takeover brief，而不是只落一个大体量 machine-oriented evidence graph
- 让 `discover` 回答：
  “这次最值得接管的 3-10 个资产是什么？”
  而不只是：
  “扫描器看到了哪些文件？”

简短总结：

`discover` 应该从 `repository inventory` 演进为 `takeover-oriented evidence prioritization`。

## 产品终局演化

这个产品应该被理解为一条有意分阶段推进的演化路线，而不是一堆彼此孤立的能力表面。

### Stage 1: 当前 V1 主线

目标：

- 帮助一个小型 AI 原生团队接管旧仓库，而不是要求他们先从零手写第一批契约

工作闭环：

- `discover -> draft -> adopt -> verify -> ci:verify`
- 日常小改动继续走 `change -> implement -> verify`

人类角色：

- 审阅并重锚第一批契约
- 决定哪些进入 adopted contract，哪些进入 spec debt

### Stage 2: 更强的 takeover intelligence

目标：

- 减少 adopt 阶段需要的人类修复量

预期改进：

- 更高信号的 discover ranking
- 更强的 deterministic draft 质量
- 更好的 behavior-contract synthesis
- 行为证据薄时，feature scenario 保持 review-gated 或 deferred
- 更少的噪声资产进入首次 adoption bundle
- 人类可读摘要成为一等输出，而不是事后解释文档

人类角色：

- 仍然在环，但编辑工作会更轻、更聚焦

### Stage 3: Execute-default mainline

目标：

- 让 `change / implement` 变成一条真正连贯的工作流，而不是两个相邻命令

预期产品形态：

- `prompt` 与 `execute` 都保留
- `execute` 成为默认产品姿态
- bootstrap 状态、verify gate、lane 决策和 implementation handoff 全部说同一套稳定契约语言

人类角色：

- 选择模式、确认边界，而不是手工串起每一步

### Stage 4: 终局产品

目标：

- 让 JiSpec 成为 AI 原生团队在真实仓库上长期运行的 contract control layer

终局特征：

- 首次 takeover 足够快
- 持续变更始终运行在 contract-aware lane 内
- verify 是确定性的、CI 原生的
- policy、waiver、facts 构成稳定治理面
- console 与 collaboration 建立在已经被证明的主线之上，而不是用来弥补薄弱核心

关键排序规则是：

`core mainline first, surrounding surfaces second`

这也是为什么在 takeover-and-gate 核心更强之前，`console / distributed / collaboration / direct LLM blocking path` 会被有意延后。

## 当前可用能力

当前构建中的一等 CLI 入口是：

```bash
npm run verify
npm run jispec-cli -- change "Update checkout copy"
npm run jispec-cli -- change default-mode show
npm run jispec-cli -- change default-mode set execute --actor <name> --reason <reason>
npm run jispec-cli -- change default-mode reset
npm run jispec-cli -- implement
npm run jispec-cli -- implement --fast
npm run jispec-cli -- bootstrap init-project
npm run jispec-cli -- bootstrap discover
npm run jispec-cli -- bootstrap draft
npm run jispec-cli -- adopt --interactive
npm run jispec-cli -- verify --json
npm run jispec-cli -- policy migrate
npm run jispec-cli -- release snapshot --version v1
npm run jispec-cli -- release compare --from v1 --to current
npm run jispec-cli -- doctor v1
npm run jispec-cli -- doctor runtime
npm run ci:verify
```

它们分别做什么：

- `bootstrap init-project`
  创建最小 `jiproject/project.yaml` 脚手架；除非传入 `--force`，否则不会覆盖已有文件。
- `bootstrap discover`
  扫描仓库，并写出 `.spec/facts/bootstrap/evidence-graph.json`、`full-inventory.json`、`adoption-ranked-evidence.json`、`bootstrap-summary.md` 和兼容路径 `evidence-summary.txt`；缺少项目脚手架时可以用 `--init-project` 先显式创建。
  默认会排除 vendor、cache、build、coverage、audit mirror、generated 和 tool-mirror 噪声；需要 forensic/exhaustive 扫描时可显式使用 `--include-noise`。
- `bootstrap draft`
  将 ranked bootstrap evidence 转成 session 级别的 draft bundle，写入 `.spec/sessions/`；确定性生成始终可用，配置 BYOK provider 后只能做 draft content 的语义重锚。
- `adopt --interactive`
  允许你将这批草稿 accept、reject、edit 或 defer 到 `.spec/contracts/` 与 `.spec/spec-debt/`，随后写出 `.spec/handoffs/bootstrap-takeover.json`、`.spec/handoffs/takeover-brief.md` 和 `.spec/handoffs/adopt-summary.md`。
- `change`
  记录 change intent，对当前 diff 做 fast/strict lane 分类，并写出 active change session。
- `implement`
  针对当前 active change session 做有边界的 handoff 或外部 patch 中介，然后回到 verify。JiSpec 不生成业务代码。
- `verify`
  运行当前确定性的仓库验证路径；若存在 `.spec/policy.yaml` 会自动加载，输出四态 verdict 面，并写出 `.spec/handoffs/verify-summary.md`。
- `policy migrate`
  在 `.spec/policy.yaml` 脚手架化或标准化最小 YAML policy 面，把它固定到当前 facts contract 版本，并补齐最小 `team.profile` 治理面。
- `waiver create|list|revoke`
  记录、查看或撤销可审计的 verify waiver。waiver 只会降级匹配到的问题；未匹配的新 blocking issue 仍保持 blocking。
- `release snapshot|compare`
  冻结 release baseline，并在 compare 时用紧凑摘要区分 contract graph、static collector 和 policy 三类漂移。
- `doctor v1`
  运行 V1 主线 readiness 检查，不让延后的 distributed/collaboration surface 直接阻断结果。
- `doctor runtime`
  运行 V1 主线 readiness gate 之外的扩展 runtime 与兼容层健康诊断。
- `ci:verify`
  为 CI 使用包装仓库 verify 路径，并写出 `.jispec-ci/verify-report.json`、`.jispec-ci/ci-summary.md` 和 `.jispec-ci/verify-summary.md`。

## AI 边界规则

LLM 可以辅助 draft、解释和 repair。Blocking gate 必须保持确定性。

在 bootstrap 路径里，BYOK provider 被视为语义重锚助手：它可以改善草稿里给人看的 `content`，但 `relativePath`、`sourceFiles`、`confidenceScore` 和 `provenanceNote` 仍由确定性 baseline 负责。如果 provider 不可用或返回 malformed output，JiSpec 会回退到确定性 draft，并记录 `generationMode = "provider-fallback"`。

Gate 侧保持刻意朴素：`verify`、`ci:verify`、policy check、schema validation，以及未来 AST-backed blocker，都必须保持 deterministic 和 scriptable。

Waiver 是生命周期记录，不是静默忽略。创建后的 waiver 会携带 owner、reason、matcher、status、可选 expiration 和可选 revoke metadata。Verify summary 会报告匹配到的 waiver 和 lifecycle 计数，让团队看到 expired、revoked、invalid 和 unmatched active waiver。

## Quickstart

安装依赖：

```bash
npm install
```

查看当前 CLI 命令面：

```bash
npm run jispec-cli -- --help
```

本地运行仓库验证：

```bash
npm run verify
```

这也会写出 `.spec/handoffs/verify-summary.md` 作为人类可读 companion summary；机器契约仍然是 `verify --json`。

记录一个 change，让 JiSpec 判定 lane：

```bash
npm run jispec-cli -- change "Add order refund validation"
```

以 prompt 模式记录 change，并手工查看下一步提示：

```bash
npm run jispec-cli -- change "Add order refund validation" --mode prompt
```

以 execute 模式记录 change，让 JiSpec 在 lane 允许时继续进入 implement/verify：

```bash
npm run jispec-cli -- change "Add order refund validation" --mode execute
```

当前仓库已经使用 execute-default；未显式传入 `--mode` 的 `change` 会默认进入 execute mediation：

```yaml
change:
  default_mode: execute
```

配置位置是 `jiproject/project.yaml`。显式 `--mode prompt` 或 `--mode execute` 仍然优先于项目配置；strict lane 遇到 open bootstrap draft 时仍必须停在 adopt 边界。

运行 strict implementation mediation：

```bash
npm run jispec-cli -- implement
```

对停留在 fast lane 的 session 运行 fast implementation mediation：

```bash
npm run jispec-cli -- implement --fast
```

接入由人类或 AI coding tool 产生的外部 patch：

```bash
npm run jispec-cli -- implement --external-patch .jispec/patches/refund.patch
```

从 handoff packet 恢复失败的 execute/implement 尝试：

```bash
npm run jispec-cli -- implement --from-handoff .jispec/handoff/<change-session-id>.json --external-patch .jispec/patches/refund.patch
```

Implementation mediation JSON 使用稳定 outcome 名称：

`preflight_passed`、`external_patch_received`、`patch_verified`、`patch_rejected_out_of_scope`、`budget_exhausted`、`stall_detected`、`verify_blocked`。

查看机器可读的 verify contract：

```bash
npm run jispec-cli -- verify --json
```

生成或刷新最小 policy 文件：

```bash
npm run jispec-cli -- policy migrate
```

迁移后的 policy 会固定 `requires.facts_contract`，包含 `team.profile`，并规范化 `facts_contract`、`team_profile` 等已知 deprecated key。unknown fact、unknown policy key 和 deprecated key 会在 `verify` 中以确定性的 nonblocking policy issue 呈现。

接管旧仓库时创建显式 project scaffold：

```bash
npm run jispec-cli -- bootstrap init-project
```

运行 bootstrap discovery：

```bash
npm run jispec-cli -- bootstrap discover
```

这会在 `.spec/facts/bootstrap/` 下写出机器 inventory、ranked takeover packet 和 `bootstrap-summary.md`。

生成第一批 contract bundle：

```bash
npm run jispec-cli -- bootstrap draft
```

这一步不依赖 LLM provider。配置 BYOK draft assistance 时，它只能重锚草稿语言，确定性 provenance 仍然是权威来源。

认领这批 draft：

```bash
npm run jispec-cli -- adopt --interactive
```

这会写出 adopted contract、deferred spec debt、机器可读 takeover report、人类可读 takeover brief，以及紧凑 adopt summary。

对于 Greenfield 项目，初始化还会写出 `.spec/greenfield/change-mainline-handoff.json` 和 `.spec/greenfield/change-mainline-handoff.md`。它们会把首个生成 slice 转成可追溯的 `change` intent，交给 implementation mediation；JiSpec 仍然只约束、记录和验证外部实现工作。

运行 CI wrapper：

```bash
npm run ci:verify
```

这会写出 `.jispec-ci/verify-report.json`、`.jispec-ci/ci-summary.md` 和 `.jispec-ci/verify-summary.md`。

冻结并比较 release baseline：

```bash
npm run jispec-cli -- release snapshot --version v1
npm run jispec-cli -- release compare --from v1 --to current
```

`release compare` 会在 `.spec/releases/compare/` 下写出 JSON 与 Markdown 报告，并把 drift 拆成 contract graph、static collector 和 policy 三类。

重放最小 legacy-repo takeover 样板：

```bash
node --import tsx ./scripts/run-v1-sample-repo.ts --workspace ./.tmp/v1-sample-run
```

运行健康检查：

```bash
npm run jispec-cli -- doctor v1
npm run jispec-cli -- doctor runtime
```

运行更广义的 runtime 与兼容层健康检查：

```bash
npm run jispec-cli -- doctor runtime
```

## Verify verdict

`verify` 现在返回稳定的四态 verdict contract：

- `PASS`
- `FAIL_BLOCKING`
- `WARN_ADVISORY`
- `ERROR_NONBLOCKING`

对于本地脚本与未来的 CI/automation 消费者来说，`npm run jispec-cli -- verify --json` 是稳定的机器可读入口。`npm run ci:verify` 仍然是当前团队工作流使用的 wrapper。

当 `.spec/policy.yaml` 存在时，`verify` 会自动加载它。可以使用 `npm run jispec-cli -- verify --facts-out .spec/facts/latest-canonical.json` 来快照 policy evaluation 实际读取的 canonical facts 面。

## 兼容命令面

当前仓库仍然暴露一个可工作的 legacy protocol/runtime 层，围绕：

- `slice`
- `context`
- `trace`
- `artifact`
- `agent`
- `pipeline`
- `template`
- `dependency`

示例：

```bash
npm run jispec-cli -- slice check ordering-checkout-v1
npm run jispec-cli -- slice plan ordering-checkout-v1 --force
npm run jispec-cli -- context board ordering
npm run jispec-cli -- trace show ordering-checkout-v1
npm run jispec-cli -- artifact derive-all ordering-checkout-v1 --force
npm run jispec-cli -- pipeline run ordering-checkout-v1
```

这套命令面仍然有价值，也依然支持，但应被理解为较新的 `JiSpec-CLI` 产品方向之下的兼容/runtime 层，而不是首要用户入口。

为旧工作流保留的兼容别名：

```bash
npm run jispec -- <command>
npm run validate:repo
npm run check:jispec
npm run jispec-cli -- validate
```

## Change And Implement

`change` 与 `implement` 现在已经进入一等 CLI 工作流。

当前现实状态：

- `change` 支持 `prompt / execute` 双模式；当前仓库已通过 `jiproject/project.yaml` 的 `change.default_mode: execute` 进入项目级 execute-default
- `implement` 是 implementation mediation：它约束、接入、记录和验证外部实现尝试，而不是作为自治业务代码生成器
- 当前下一步重点不是再扩命令面，而是让 execute handoff 质量和 retakeover 决策包更容易被人类判断

当前模式拆分：

- `change --mode prompt`
  写出 change session，完成 lane 分类，并返回 `nextCommands`，但不会执行下游步骤。
- `change --mode execute`
  尝试自动继续主线：
  fast lane 会运行 `implement --fast -> verify --fast`，而 strict lane 会进入 `implement -> verify`，或者在仍有 bootstrap draft 未处理时停在显式 `adopt` 边界。
- `jiproject/project.yaml` 中的 `change.default_mode: execute`
  让未显式传入 `--mode` 的 `change` 默认进入 execute mediation；显式 CLI mode 仍然最高优先级。
- `change default-mode show|set|reset`
  通过 CLI 查看、启用、回退或重置项目级默认模式，并把每次切换写入 `.jispec/change-default-mode-history.jsonl`；`set execute` 会在 policy、verify 稳定性和外部 patch mediation readiness 通过前被阻止。
- `doctor v1`
  会用决策包语言报告 execute-default readiness：当前默认模式、mode 来源、blocker、warning、owner action、open bootstrap draft adopt 边界和下一步动作。

- `change`
  将当前 diff 分类与 lane 决策持久化到 `.jispec/change-session.json`。
- `implement`
  使用 active change session，遵守 strict/fast lane；当提供 `--external-patch` 时接入外部 patch，并在结束后自动运行 post-implement verify。
- `implement --fast`
  只是本地开发加速器。若 verify 发现 contract-critical change，它仍然可能自动升级回 strict。

## 命令语言

对外，JiSpec 正在向以下用户语言收敛：

- `Contract`
- `Asset`
- `Policy`
- `Fact`
- `Lane`
- `Waiver`

对内，你仍然会看到一些 legacy 实现术语，例如：

- `slice`
- `stage`

这在当前阶段是预期内的；仓库正处于从旧 runtime 词汇向新产品命令面受控迁移的过程中。

## Scripts

主脚本：

```bash
npm run jispec-cli -- <command>
npm run verify
npm run ci:verify
```

兼容脚本：

```bash
npm run jispec -- <command>
npm run validate:repo
npm run check:jispec
```

## 当前仓库状态

当前仓库包含：

- `jiproject/` 中的 project-level protocol file
- `contexts/` 中的 bounded context asset
- `templates/` 中的可复用模板
- `schemas/` 中的 machine-checkable schema
- `docs/input/` 中的样例输入文档
- `agents/` 中的 AI 与 pipeline 定义
- `tools/jispec/` 中的 CLI/runtime 实现

当前样例建模了一个 commerce 项目，包含两个 bounded context：

- `catalog`
- `ordering`

其中 `ordering` context 包含一个完整样例 slice：

- `ordering-checkout-v1`

## 核心文档

- 北极星：
  [docs/north-star.md](docs/north-star.md)
- V1 后北极星推进任务（已完成记录）：
  [docs/post-v1-north-star-plan.md](docs/post-v1-north-star-plan.md)
- 北极星下一阶段开发任务：
  [docs/north-star-next-development-plan.md](docs/north-star-next-development-plan.md)
- V1 后发布门禁：
  [docs/post-release-gate.md](docs/post-release-gate.md)
- Retakeover 回归池：
  [docs/retakeover-regression-pool.md](docs/retakeover-regression-pool.md)
- Console read model contract：
  [docs/console-read-model-contract.md](docs/console-read-model-contract.md)
- Collaboration surface freeze：
  [docs/collaboration-surface-freeze.md](docs/collaboration-surface-freeze.md)
- V1 主线稳定契约：
  [docs/v1-mainline-stable-contract.md](docs/v1-mainline-stable-contract.md)
- Greenfield 输入契约：
  [docs/greenfield-input-contract.md](docs/greenfield-input-contract.md)
- V1 最小样板仓库：
  [docs/v1-sample-repo.md](docs/v1-sample-repo.md)
- 发布说明：
  [docs/releases/v0.1.0.md](docs/releases/v0.1.0.md)
