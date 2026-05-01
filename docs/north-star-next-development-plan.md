# JiSpec 北极星下一阶段开发任务

日期：2026-05-01

当前前提：V1 已发布完成。后续工作不再是补齐 V1，而是继续把 JiSpec 推向北极星：

> 把 AI 编程从个人英雄主义的手工作坊，推进到可验证、可审计、可阻断、可回放的现代软件交付流水线。

本阶段方向：

```text
takeover quality first -> execute by default -> Console as governance control room
```

## 已确认产品判断

- V1 主线已经成立，后续开发应围绕北极星继续推进。
- 下一阶段重点放在 takeover 质量，而不是扩散更多 surface。
- `execute` 从可选模式推进到默认模式是必须演化，最终状态应是默认 `execute`。
- Console 不做轻量 artifact viewer 终局，而是直接朝团队治理台设计。
- 安装、样例 repo、CI 模板和文档体验重要，但放到产品核心继续成型之后处理。

## 排序原则

1. Takeover 质量优先于新增命令面。
2. Execute 默认化优先于安装与包装体验。
3. Console 围绕 governance、audit、waiver、policy、spec debt 和 drift 建模，不替代 CLI gate。
4. LLM 仍不能成为 blocking gate 的唯一裁判。
5. JiSpec 继续做 implementation mediation，不变成 autonomous business-code generator。
6. 每个任务必须有稳定落盘产物、回归测试和可审计的人类决策包。

## P0：Takeover 质量继续提升

目标：让 JiSpec 接管真实旧仓库时更少噪声、更少过度声明、更少人工修正，并能量化质量改善。

### P0-T1 扩充真实 retakeover 回归池

状态：已实现

范围：

- 增加更多真实或真实形态夹具，覆盖：
  - 多语言 monorepo
  - 微服务仓库
  - API/schema/doc 分散仓库
  - 高历史债务仓库
  - 前后端混合仓库
  - 测试薄弱但业务入口明显的仓库
- 每个 fixture 必须记录 takeover scorecard、人工修正量、弱证据候选和 verify safety。
- 回归池继续保留 synthetic messy legacy stress，但不能只靠 synthetic fixture 证明质量。

预期文件：

- `docs/retakeover-regression-pool.md`
- `tools/jispec/tests/bootstrap-retakeover-regression.ts`
- `tools/jispec/tests/bootstrap-messy-legacy-takeover.ts`
- 新增 fixture builder 或 retained-output demo runner，按实现需要命名

验收：

```bash
node --import tsx ./tools/jispec/tests/bootstrap-retakeover-regression.ts
node --import tsx ./tools/jispec/tests/regression-runner.ts
```

完成记录：

- 真实形态 retakeover 回归池从 3 类扩展到 6 类 fixture。
- 新增覆盖：
  - `retail-ops-monorepo-like`：多语言 monorepo / 微服务仓库。
  - `member-portal-fullstack-like`：前后端混合产品仓库。
  - `legacy-saas-debt-like`：历史债务 SaaS 服务仓库。
- 新增 fixture 均记录 discover ranking、draft quality、adopt correction、verify verdict 和 human-readable retakeover summary。
- 新增 fixture 的 feature 行为保持在 owner-review/spec-debt 路径上，避免把证据串联误判为可自动采纳行为契约。

### P0-T2 Takeover quality scorecard v2

状态：已实现

范围：

- 在现有 scorecard 基础上加入更强的审计指标：
  - `contractSignalPrecision`
  - `behaviorEvidenceStrength`
  - `humanCorrectionHotspots`
  - `overclaimBlockRate`
  - `adoptionReadyArtifactCount`
  - `needsOwnerDecisionCount`
- 支持 pool-level trend summary，能回答 takeover 质量是否比上一轮更好。
- 保持 deterministic scoring，不引入 LLM gate。

预期产物：

- fixture-level JSON scorecard
- pool-level JSON scorecard
- `.spec/handoffs/retakeover-summary.md`
- `.spec/handoffs/retakeover-pool-summary.md`

验收：

- 噪声仓库不能被误判为高质量 takeover。
- 弱行为证据必须被计入 feature overclaim risk 或 owner decision。
- scorecard Markdown 能让 reviewer 在几分钟内判断主要风险。

完成记录：

- `qualityScorecard` 增加 v2 审计信号：
  - `contractSignalPrecision`
  - `behaviorEvidenceStrength`
  - `humanCorrectionHotspots`
  - `overclaimBlockRate`
  - `adoptionReadyArtifactCount`
  - `needsOwnerDecisionCount`
- Pool-level metrics 聚合 v2 趋势字段：
  - `averageContractSignalPrecision`
  - `averageBehaviorEvidenceStrength`
  - `averageOverclaimBlockRate`
  - `totalAdoptionReadyArtifactCount`
  - `totalNeedsOwnerDecisionCount`
  - `fixturesWithHumanCorrectionHotspots`
- `retakeover-summary.md` 和 `retakeover-pool-summary.md` 都显示 v2 scorecard 信息，继续保持 Markdown 为 human companion artifact，JSON 为机器真相源。

### P0-T3 Behavior evidence extraction 强化

状态：已实现

范围：

- 强化从测试、路由、schema、docs、example payload 和命名约定中提取行为证据。
- 明确区分：
  - strong scenario evidence
  - partial behavior evidence
  - weak candidate
  - unsupported inference
- 证据不足时 feature draft 应进入 review gate 或 spec debt，而不是写成 adopted-looking scenario。

预期文件：

- `tools/jispec/bootstrap/draft.ts`
- `tools/jispec/bootstrap/evidence-ranking.ts`
- `tools/jispec/tests/bootstrap-draft-feature-scenarios.ts`
- `tools/jispec/tests/bootstrap-feature-confidence-gate.ts`

验收：

- 有测试/路由/schema 交叉支撑的行为能生成更强 scenario。
- 只有名称或 README 暗示的行为不得被过度声明。
- takeover brief 中清晰标出 owner 需要确认的 feature 候选。

完成记录：

- Behavior draft scenario 增加 `# evidence_level`，区分 `strong`、`partial`、`weak`、`unsupported`。
- Behavior draft scenario 增加 `# evidence_kinds`，显式暴露 route、test、schema、document、proto、aggregate 等支撑来源。
- 行为证据匹配不再只看 evidence path；domain group 已经关联的 source files 也会参与 document/schema/test 匹配。
- 强证据 scenario 需要跨 implementation、contract、business anchor 形成交叉支撑；弱证据仍进入 `@behavior_needs_human_review` 和 `defer_as_spec_debt`。

### P0-T4 Adopt correction loop metrics

状态：已完成

范围：

- 记录 adopt 阶段的人类 edit/reject/defer 热点。
- 把 correction load 回流到 retakeover quality metrics。
- 摘要中显示哪些 artifact 类型最需要人工修正。

预期产物：

- adopt session correction summary
- retakeover scorecard correction section
- regression fixture 中的 correction expectations

验收：

- reviewer 能看到“为什么这次 takeover 还不够好”。
- 后续优化能用 correction load 证明是否减少人工负担。

完成记录：

- `adopt-summary.md` 新增 `Correction Loop` 区块，按 artifact 展示 final state、是否 edited、是否仍需 owner review 和 reviewer note。
- `retakeover-metrics.json` 的 `adoptCorrection` 扩展为 correction loop 指标：accepted/edited/deferred/rejected artifacts、decision counts、per-artifact correction load、correction hotspots 和 owner-review artifact count。
- `qualityScorecard.adoptCorrectionLoad` 从单纯 deferred 占比升级为 edit/defer/reject 加权负担；edit 计入半负担，defer/reject 计入完整负担。
- Pool-level metrics 聚合 edited/deferred/rejected artifact count、total correction load、owner-review artifact count、fixtures with edited/rejected/deferred artifacts 和 top correction hotspots。
- 真实 retakeover 回归池加入 correction expectations：`remirage-like` 覆盖人工 edit，`retail-ops-monorepo-like` 覆盖 reject，其余弱行为继续覆盖 defer/spec-debt。

## P1：Execute 默认化

目标：把 `change -> implement -> verify` 从可选串联推进为默认产品姿态，同时保持 adopt boundary、scope check、verify gate 和人工接管点明确。

### P1-T1 Execute-default readiness gate 收紧

状态：已完成

范围：

- 定义从 `prompt` 默认切到 `execute` 默认的前置条件。
- `doctor v1` 必须能解释为什么可以或不可以默认 `execute`。
- open bootstrap draft、缺 policy、verify 不稳定、外部 patch mediation 不完整时，要给出明确下一步动作。

预期文件：

- `tools/jispec/doctor.ts`
- `tools/jispec/change/default-mode-command.ts`
- `tools/jispec/tests/doctor-v1-readiness.ts`
- `tools/jispec/tests/change-default-mode-config.ts`

验收：

- readiness 不只是报告当前模式，还能作为切换默认值的决策包。
- 不满足条件时阻止或警告切换，并说明 owner action。

完成记录：

- `evaluateChangeExecuteDefaultReadiness` 新增 `canSetExecuteDefault`、`preconditions`、`blockers`、`warnings` 和 `ownerActions`。
- `change default-mode set execute` 在写入配置前先执行 readiness gate；缺 `.spec/policy.yaml`、verify 当前 blocking、project config 损坏、external patch mediation 面不完整都会阻止切换。
- open bootstrap draft 保持 warning/adopt-boundary 语义：允许切换，但明确提示 strict-lane execute-default 会暂停在 `adopt --interactive --session <id>`。
- `doctor v1` 的 Execute-Default Mediation Readiness 现在输出 precondition 决策包；当前仍为 `prompt` 默认时，blocker 不会拖红 V1 主线，但若项目已设为 `execute` 且 blocker 存在会失败。
- `change-default-mode-config` 和 `doctor-v1-readiness` 回归覆盖缺 policy blocker、open draft warning、history 中的 readiness 摘要和 execute-ready 成功路径。

### P1-T2 将项目默认模式切换为 execute

状态：已完成

范围：

- 在仓库自身通过受控命令或配置把 `change.default_mode` 推进到 `execute`。
- 更新 V1 stable contract、README 和 release gate 口径。
- 保留显式 `--mode prompt` 作为降级路径。

预期文件：

- `jiproject/project.yaml`
- `docs/v1-mainline-stable-contract.md`
- `README.md`
- `README.zh-CN.md`
- `tools/jispec/tests/change-dual-mode.ts`
- `tools/jispec/tests/change-default-mode-config.ts`

验收：

```bash
npm run jispec-cli -- change default-mode show
node --import tsx ./tools/jispec/tests/change-dual-mode.ts
node --import tsx ./tools/jispec/tests/change-default-mode-config.ts
node --import tsx ./tools/jispec/tests/doctor-v1-readiness.ts
```

完成记录：

- 通过 `npm run jispec-cli -- policy migrate` 创建 `.spec/policy.yaml`，让 execute-default readiness 的 policy gate 在干净 checkout 中可复现。
- `.gitignore` 改为继续忽略 `.spec` 运行产物，但允许 `.spec/policy.yaml` 进入仓库。
- 通过 `npm run jispec-cli -- change default-mode set execute --actor codex --reason "P1-T2 promote project default to execute"` 把仓库自身 `jiproject/project.yaml` 推进到 `change.default_mode: execute`。
- README、README.zh-CN 和 V1 stable contract 已更新为当前仓库默认 execute，同时保留显式 `--mode prompt` 作为降级路径。
- `doctor-v1-readiness` 现在验证仓库自身处于 execute-ready 状态，且 readiness blocker 为 none。

### P1-T3 Execute handoff 下一步动作质量

状态：已完成

范围：

- 每个 execute mediation outcome 都必须给出明确 owner、stop point、failed check、next command 或 external tool handoff。
- 对外部 coding tool 的 request packet 更聚焦，避免把机器底账直接甩给实现者。
- verify blocked、scope rejected、stall、budget exhausted 都要有短摘要。

完成记录：

- `ImplementationDecisionPacket` 增加 `nextActionDetail`，稳定输出 `type`、`owner`、`failedCheck`、`command` 和可选 `externalToolHandoff`。
- handoff packet 的 `nextSteps` 增加聚焦的 `externalToolHandoff` request，包含 allowed paths、files needing attention、test command 和 verify command。
- `implement` 文本输出和 `change --mode execute` 执行摘要会显示 next action type、failed check、next command 和 external handoff request。
- 覆盖 budget exhausted、scope rejected、patch test failed、verify blocked、ready-to-merge 等 outcome。

预期文件：

- `tools/jispec/implement/handoff-packet.ts`
- `tools/jispec/implement/implement-runner.ts`
- `tools/jispec/tests/implement-handoff-mainline.ts`
- `tools/jispec/tests/implement-patch-mediation.ts`

验收：

- 人类能知道下一步该自己处理、交给外部 coding tool，还是先回 adopt/policy/verify。
- 文案不得暗示 JiSpec 自己生成或拥有业务代码实现。

### P1-T4 Execute fallback 与回放

状态：已完成

范围：

- 支持 execute mediation 失败后的可回放状态。
- 记录失败原因、输入包、外部 patch intake、test command 和 verify verdict。
- 支持从 handoff packet 恢复下一次 implement 尝试。

完成记录：

- handoff packet 增加 `replay` 区块，记录 source session、previous outcome、stop point、failed check、last error、test command、verify command 和 retry commands。
- 新增 `implement --from-handoff <path-or-session>`，可以从 `.jispec/handoff/<session>.json` 恢复 active change session，并复用上一轮 test command 与审计上下文。
- `--from-handoff` 可与 `--external-patch <path>` 一起使用，用于失败后的下一次 patch mediation。
- replay metadata 会写入新的 implement JSON/text 输出，说明来自哪个 handoff、上一轮卡在哪里、是否恢复了 session。

验收：

- execute 失败不能留下不可解释的半成品状态。
- rerun 后能复用上一轮可审计上下文。

## P2：Console 团队治理台

目标：Console 直接按团队治理台推进，而不是停留在 artifact viewer。Console 可以读取和呈现治理状态，但不能替代本地 CLI gate。

### P2-T1 Console governance domain model

状态：已完成

范围：

- 定义 Console 的治理对象：
  - policy posture
  - waiver lifecycle
  - spec debt ledger
  - contract drift
  - release baseline
  - verify trend
  - takeover quality trend
  - implementation mediation outcomes
  - audit events
- 明确每个对象来自哪些本地 artifact。
- 缺失 artifact 继续显示为 `not_available_yet`，不得扫描源码自行推断。

预期文件：

- `docs/console-read-model-contract.md`
- `tools/jispec/console/read-model-contract.ts`
- `tools/jispec/console/read-model-snapshot.ts`
- `tools/jispec/tests/console-read-model-contract.ts`

验收：

- Console snapshot 能表达治理状态，而不只是文件列表。
- JSON/YAML 是机器输入，Markdown 只展示不解析为自动化契约。

完成记录：

- `ConsoleReadModelContract` 增加九类治理对象：policy posture、waiver lifecycle、spec debt ledger、contract drift、release baseline、verify trend、takeover quality trend、implementation mediation outcomes、audit events。
- read model artifact 声明补充 retakeover metrics、implementation handoff packets、patch mediation records 和 audit JSONL ledger。
- `collectConsoleLocalSnapshot` 现在输出 `governance.objects` 与 `governance.summary`，仍只读声明 artifact，缺失显示 `not_available_yet`。
- Markdown artifact 保持 display-only，治理对象只从 JSON/YAML/JSONL 聚合，不扫描源码、不替代 verify/policy/release gate。

### P2-T2 Audit event ledger

状态：已实现

范围：

- 为关键治理动作建立本地审计事件：
  - adopt accept/edit/reject/defer
  - waiver create/revoke/expire
  - policy migrate/change
  - default mode set/reset
  - release snapshot/compare
  - external patch intake
  - spec debt repay/cancel
- 审计事件必须包含 actor、reason、timestamp、source artifact 和 affected contract。

预期产物：

- `.spec/audit/events.jsonl`
- Console snapshot audit section
- audit fixture tests

验收：

- Console 能回答“谁在什么时候批准了什么例外或边界变化”。
- 审计事件不参与 blocking gate，但必须可追溯。

完成记录：

- 新增 `tools/jispec/audit/event-ledger.ts`，统一写入 `.spec/audit/events.jsonl`；事件包含 `actor`、`reason`、`timestamp`、`sourceArtifact` 和 `affectedContracts`。
- 已接入 policy migrate、change default-mode set/reset、waiver create/revoke/expire audit、bootstrap adopt accept/edit/reject/defer、Greenfield review transition、spec debt repay/cancel core API、release snapshot/compare 和 external patch intake。
- Console audit governance summary 增加 latest timestamp/reason/source artifact/affected contracts、eventsByType、actors、approval/boundary/exception counts。
- 新增 `tools/jispec/tests/audit-event-ledger.ts`，覆盖 JSONL contract、治理命令写入、adopt 决策审计、release/patch intake 的 Console 聚合。
- Audit ledger 保持本地 append-only read-model evidence，不参与 blocking gate，不替代 verify/policy/release compare。

### P2-T3 Governance dashboard shell

状态：已实现

范围：

- 建立最小 Console shell，直接围绕治理问题组织：
  - 当前能否合并？
  - 哪些 waiver 即将过期或已经漂移？
  - 哪些 spec debt 阻塞 takeover 或 release？
  - 哪些 contract drift 需要 owner review？
  - execute mediation 最近卡在哪里？
- Console 初期可以是本地只读 web/TUI/static report，具体形态以后续实现判断为准。

验收：

- Console 不上传源码。
- Console 不覆盖 `verify` 或 `ci:verify` 结论。
- Console 的第一屏是治理状态，不是 marketing 或文件浏览器。

完成记录：

- 新增 `tools/jispec/console/governance-dashboard.ts`，基于 Console local snapshot 构建本地只读治理 dashboard。
- 新增 `jispec-cli console dashboard [--json]`，文本第一屏直接展示治理状态和六个治理问题，不做 artifact browser。
- Dashboard 覆盖 mergeability、waiver attention、spec debt attention、contract drift owner review、execute mediation stop point、audit traceability。
- Dashboard boundary 明确 `readOnly=true`、`sourceUploadRequired=false`、`overridesVerify=false`、`scansSourceCode=false`。
- 新增 `tools/jispec/tests/console-governance-dashboard.ts`，覆盖缺失 artifact、verify/drift 阻断、waiver/spec debt/execute/audit attention、CLI text/JSON。

### P2-T4 Waiver / spec debt / policy 操作闭环

状态：已实现

范围：

- Console 需要能发起或生成 CLI 操作建议：
  - revoke waiver
  - renew waiver
  - repay spec debt
  - mark spec debt owner review
  - migrate policy
  - compare release drift
- 初期可以先生成命令和决策包，不必在 UI 内直接写入。

验收：

- 人类能从 Console 进入治理动作，而不是只读状态。
- 所有写入仍必须经过本地 CLI 或明确审计路径。

完成记录：

- 新增 `tools/jispec/console/governance-actions.ts`，基于 Console local snapshot 生成只读治理动作计划。
- 新增 `jispec-cli console actions [--json]`，输出 revoke/renew waiver、repay spec debt、mark owner review、policy migrate、release compare 的本地 CLI 命令和决策包。
- 新增 `waiver renew <id>`，通过本地 CLI 更新 waiver expiration，并写入 `waiver_renew` audit event。
- 新增 `spec-debt repay|cancel|owner-review <id>`，通过本地 CLI 更新 spec debt ledger，并写入 `spec_debt_repay`、`spec_debt_cancel`、`spec_debt_owner_review` audit event。
- Console action planner 明确 `executesCommands=false`、`writesLocalArtifacts=false`；写入仍必须由人类显式运行本地 CLI 命令。
- 新增 `tools/jispec/tests/console-governance-actions.ts`，覆盖 policy/release 建议、waiver renew/revoke、spec debt owner-review/repay、CLI 写入 audit path。

## P3：长期治理硬化

目标：把 JiSpec 从“能跑主线”推进到“能被团队长期运营”。

### P3-T1 Policy profile 下一轮

状态：已实现

范围：

- 强化 `solo`、`small_team`、`regulated` 的差异。
- 支持 owner、reviewer、waiver policy、release policy、execute-default policy。
- unknown/deprecated policy 行为保持 nonblocking explainable。

完成说明：

- `.spec/policy.yaml` 新增 `waivers`、`release`、`execute_default` 和 `team.required_reviewers` schema。
- `policy migrate --profile solo|small_team|regulated` 可按团队治理姿态补齐默认值；`solo`、`small_team`、`regulated` 在 reviewer、waiver expiration、release compare 和 execute clean verify 上有可审计差异。
- `waiver_policy`、`release_policy`、`executeDefault` 会迁移到当前 key；verify 对 unknown/deprecated policy key 仍保持 nonblocking explainable。
- Console policy posture 摘要暴露 required reviewers、waiver、release 和 execute-default profile 字段，供治理台只读审计。
- 回归套件：`tools/jispec/tests/policy-profile-next.ts`。

### P3-T2 Release drift 趋势化

状态：已实现

范围：

- release compare 不只比较两个点，还能支持 trend summary。
- Console 能显示 contract graph drift、static collector drift、policy drift 的历史变化。

完成说明：

- `release compare` 在写出 pair compare report 后，会刷新 `.spec/releases/drift-trend.json` 和 `.spec/releases/drift-trend.md`。
- trend summary 按 compare report 汇总 overall changed/unchanged/not_tracked，并分别统计 contract graph、static collector、policy drift 历史。
- Console read model 新增 `release-drift-trend` artifact；`contract_drift` governance object 优先读取 trend，缺失时回退到最新 compare report。
- 治理 dashboard 在 release drift 问题中展示 trend comparison count 和 changed comparison count。
- 回归套件：`tools/jispec/tests/release-drift-trend.ts`。

### P3-T3 Multi-repo governance prelude

状态：已实现

范围：

- 只定义多仓治理 contract，不急着做云服务。
- 明确多个本地 repo 如何导出治理 snapshot。
- 后续 Console 可以汇总多个 repo 的 policy、waiver、debt 和 drift。

完成说明：

- 新增 `jispec-cli console export-governance`，将当前 repo 的 Console snapshot 导出为 `.spec/console/governance-snapshot.json` 和 `.spec/console/governance-snapshot.md`。
- 导出快照只包含本地治理对象摘要与聚合提示，不扫描源码、不运行 verify，也不替代任何 CLI gate。
- Console read model 新增 `multi-repo-governance-snapshot` artifact 与 `multi_repo_export` governance object，为未来多 repo 汇总提供统一本地契约。
- 回归套件：`tools/jispec/tests/console-governance-export.ts`。

## P4：最后处理的产品包装

目标：在核心产品继续成型后，再打磨对外采用体验。

### P4-T1 安装入口与 npm/bin 包装

状态：暂缓

范围：

- npm package entry
- `jispec` bin
- platform smoke
- version/migration command

### P4-T2 样例 repo 与 CI 模板

状态：暂缓

范围：

- 最小 sample repo
- GitHub Actions template
- GitLab CI template
- first takeover walkthrough

### P4-T3 文档体验

状态：暂缓

范围：

- Quickstart
- takeover guide
- execute-default guide
- Console governance guide
- policy/waiver/spec debt cookbook

## 当前不做

- 不把安装体验放到 takeover 质量之前。
- 不把 Console 做成只看 artifact 的终局产品。
- 不把 LLM 输出放进 blocking verify path。
- 不把 JiSpec 做成自主业务代码实现 agent。
- 不让 distributed/collaboration/presence 绕过 V1 主线和本地 gate。
- 不为了表面功能数量牺牲 deterministic、audit、replay 和 blocking semantics。

## 阶段验收门禁

每个完成批次至少运行：

```bash
npm run typecheck
node --import tsx ./tools/jispec/tests/regression-runner.ts
npm run ci:verify
```

优先批次完成后运行完整门禁：

```bash
npm run post-release:gate
```

新增任务必须满足：

- 有稳定落盘产物或明确 CLI 行为。
- 有至少一条回归测试覆盖。
- 不破坏 V1 stable contract。
- 人类决策包能回答 reviewer 的下一步动作。
- Console 相关能力不替代本地 CLI gate。
