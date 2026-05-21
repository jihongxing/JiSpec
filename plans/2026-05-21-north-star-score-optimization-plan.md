# North Star 评分优化计划

Date: 2026-05-21

## 目的

这份计划用于指导后续把 JiSpec 北极星 5 个维度全部提升到 `9.0+`，优先追求 `9.5`。

当前判断不再只看北极星愿景文本，而是以代码、门禁、回归测试和稳定契约为依据。

当前状态锚点：

- [docs/reference/v1-mainline-stable-contract.md](../docs/reference/v1-mainline-stable-contract.md)
- [docs/architecture/absolute-terminal-checklist.md](../docs/architecture/absolute-terminal-checklist.md)
- [docs/development/collaboration-surface-freeze.md](../docs/development/collaboration-surface-freeze.md)
- [docs/architecture/north-star-acceptance.md](../docs/architecture/north-star-acceptance.md)

## 当前评分与目标

| 维度 | 当前评分 | 目标评分 | 主要缺口 |
| --- | ---: | ---: | --- |
| 1. 主线交付闭环 | 9.5 | 9.7 | 中断恢复、状态路由、stale artifact 处理还可更强 |
| 2. 确定性门禁 | 9.5 | 9.7 | 多技术栈事实覆盖、artifact freshness、规则稳定性还可补强 |
| 3. 接管与契约生成质量 | 8.0 | 9.2-9.5 | 复杂旧仓库的人工修正量仍偏高，feature draft 仍需更保守 |
| 4. 治理与可观测性 | 8.8 | 9.3-9.5 | Console 需要从读模型进一步变成决策工作台 |
| 5. 终局控制平面 / 协作面 | 6.0 | 9.0+ | multi-repo/global closure 需要 promotion 级证明，协作面仍明确 deferred |

## 总体策略

不要平均用力。优先级固定为：

1. 维度 3：接管质量和人工修正量
2. 维度 5：global closure 和 multi-repo control plane
3. 维度 4：Console 决策工作台
4. 维度 1：主线恢复力
5. 维度 2：门禁覆盖面

理由：

- 维度 1 和 2 已经接近 9.5，继续加分主要靠更强证明材料。
- 维度 3 直接决定用户是否相信 JiSpec 能接管真实仓库。
- 维度 5 决定 JiSpec 是否真的从 CLI 引擎跃迁为控制平面。
- 维度 4 是维度 5 的产品化展示层。

## 维度 1：主线交付闭环

目标：从 `9.5` 提升到 `9.7`。

### 改进任务

- 扩展 `doctor mainline` 或新增 `doctor flow`，回答当前仓库应该从哪个中断点继续。
- 增加主线恢复场景：
  - active session 损坏
  - handoff 缺失
  - external patch 半失败
  - verify 阻断后修复再恢复
  - stale `.jispec/change-session.json`
- 强化 `first-run` 状态路由，让它能明确推荐 takeover、verify、repay debt、release compare、north-star acceptance 等下一步。

### 验收标准

- 任意主线中断状态都能输出 `owner`、`next command`、`source artifact`。
- 新增至少 5 个 replay / resume / stale artifact 测试。
- `doctor mainline` 不只回答 ready，还能回答继续路径。

## 维度 2：确定性门禁

目标：从 `9.5` 提升到 `9.7`。

### 改进任务

- 增加多技术栈 collector fixture：
  - Node / TypeScript
  - Python
  - Go 或 Java
- 增加 policy 规则稳定性检查：blocking rule 只能依赖 stable facts。
- 给 verify report 增加 artifact freshness：
  - CI report 是否过期
  - policy 是否过期
  - baseline 是否过期
  - release compare 是否过期
- 增加 drift 和 mitigation 测试：
  - 契约变了但实现没跟
  - 实现变了但契约没跟
  - waiver 过期
  - approval stale

### 验收标准

- `verify` 稳定区分当前阻断、历史债务、已批准例外、过期治理。
- 多技术栈 fixture 至少覆盖 3 类项目结构。
- 所有门禁失败都给出可执行下一步，而不是只报错。

## 维度 3：接管与契约生成质量

目标：从 `8.0` 提升到 `9.2-9.5`。

这是最关键的提分项。

### 改进任务

- 建立 `retakeover benchmark pool`，覆盖 10-20 个真实或半真实旧仓库 fixture。
- 为每次 takeover 输出质量分：
  - evidence noise ratio
  - top evidence precision
  - adopted without edit rate
  - edited draft rate
  - deferred spec debt rate
  - feature overclaim risk
- 强化 `bootstrap discover` ranking：
  - README、schema、route、service entrypoint、migration、tests 权重更清晰
  - generated / vendor / cache / audit mirror 默认降噪更激进
  - `boundarySignal` 成为 takeover brief 的一等解释
- 强化 feature draft：
  - 行为证据不足时不硬生成高置信 scenario
  - 降级为 open decision、weak candidate 或 owner-review prompt
- 改进 adopt review：
  - reviewer 一屏看到推荐采纳、建议延期、证据不足、疑似技术噪声
  - 人工修正量可被度量

### 验收标准

- benchmark pool 中 `domain/api` 草稿多数可直接 adopt 或轻编辑。
- feature draft 保守，宁可 defer，也不高置信幻觉。
- `retakeover-metrics` 能证明 correction load 下降。
- takeover brief 支持 reviewer 5 分钟内判断第一批契约。

## 维度 4：治理与可观测性

目标：从 `8.8` 提升到 `9.3-9.5`。

### 改进任务

- 将 `console ui` 从静态汇总增强为本地决策台，第一屏回答：
  - 能不能 merge
  - 最大风险是什么
  - 谁应该行动
  - 下一条命令是什么
  - 证据 artifact 在哪里
- 每个治理对象都保持统一字段：
  - current state
  - risk
  - owner
  - next command
  - evidence artifacts
- 增强 `console actions` 优先级排序：
  - blocking issue
  - stale approval
  - expiring waiver
  - open spec debt
  - release drift
- 将 `metrics value-report` 接入 Console，展示本周节省、风险阻断和治理债务趋势。

### 验收标准

- Console 第一屏能直接回答 mergeability、owner action 和证据来源。
- 所有治理建议都只生成本地命令，不绕过 `verify`。
- 缺 artifact 时显示 unknown / not_available_yet，不伪造状态。

## 维度 5：终局控制平面 / 协作面

目标：从 `6.0` 提升到 `9.0+`。

这个维度不应该直接追求完整实时协作平台。正确路线是先把若干 support surface 提升到 global closure 级别。

### 改进任务

第一阶段：提升 `multi-repo governance aggregate`

- 增加 repo group 配置。
- 增加 upstream / downstream contract refs。
- 增强 owner action lifecycle。
- 让跨仓 drift 产生明确 owner action，而不是只有 hint。

第二阶段：提升 `Console governance export`

- 将其作为团队共享的本地控制面 artifact。
- 保持不上传源码，只导出治理摘要、状态和 artifact refs。
- 增强 redaction / privacy posture。

第三阶段：谨慎处理 collaboration / presence

- 不先做实时协作。
- 先做异步协作记录：
  - 谁 review 了什么
  - 谁 approve 了 waiver
  - 谁 repay 了 debt
  - 谁处理了 release drift
- 复用 audit ledger 和 approval workflow。

### 验收标准

至少 2 个 support surface 满足 promotion checklist：

- stable machine artifact
- audit evidence
- owner + next command
- cannot override `verify`
- dedicated acceptance scenario
- deterministic local-first behavior

`doctor global` 不只是健康检查，而是能证明 global closure loop 真能运营。

deferred surfaces 继续不误伤主线，不成为意外 blocker。

## 推荐执行顺序

### 阶段 1：Retakeover 质量基准

目标：提升维度 3。

交付：

- benchmark pool
- takeover quality score
- feature overclaim risk
- correction load trend

退出标准：

- 至少 10 个 fixture 有稳定评分。
- 新增回归测试进入 regression matrix。

当前落地锚点（2026-05-21）：

- 指标结构：`tools/jispec/bootstrap/retakeover-metrics.ts` 已新增 `benchmarkReadiness`，用于记录 phase、ready 状态、稳定评分 fixture 数、class coverage、non-blocking rate、quality baseline 与 score impact evidence。
- 基准池：`tools/jispec/tests/retakeover-benchmark-pool.ts` 覆盖 10 个 fixture class，并验证稳定评分、非阻断、质量基线、summary artifact 与 phase 标识。
- 矩阵入口：`tools/jispec/tests/regression-runner.ts` 已注册 `Retakeover Benchmark Pool`，归入 `retakeover-regression-pool`。
- 架构说明：`docs/architecture/retakeover-regression-pool.md` 记录该 pool 是评分 harness，不替代 `verify`、CI 或 north-star acceptance gate。
- 验收命令：`node --import tsx ./tools/jispec/tests/regression-runner.ts --area retakeover-regression-pool` 应保持 3/3 suites、24/24 tests 通过。

### 阶段 2：Multi-repo Promotion

目标：提升维度 5。

交付：

- repo group 配置
- cross-repo contract refs
- owner action lifecycle
- promotion checklist 测试

退出标准：

- `doctor global` 能证明 multi-repo closure loop operational。
- `north-star acceptance` 增加或强化对应场景。

当前落地锚点（2026-05-21）：

- 指标结构：`tools/jispec/console/multi-repo.ts` 已新增 `promotionReadiness`，用于记录 `north-star-score-optimization-phase-2`、repo group 拓扑、cross-repo contract refs、owner-action lifecycle、verify 边界与 North Star 场景覆盖。
- Doctor 入口：`tools/jispec/doctor.ts` 的 `Multi-Repo Aggregate Contract Readiness` 现在要求 aggregate 显式达到 phase-2 promotion readiness，旧式“只有 aggregate 文件”的状态不再算 global closure ready。
- North Star 入口：`tools/jispec/north-star/acceptance.ts` 的 `multi_repo_owner_action` / `doctor_global_health` 场景会读取 aggregate promotion readiness；ready 不是仅靠 owner action 数量推断。
- 基准回归：`tools/jispec/tests/multi-repo-promotion-readiness.ts` 覆盖 ready aggregate、缺失显式 repo group 的 blocker、doctor global 读取 readiness、legacy aggregate 阻断。
- 矩阵入口：`tools/jispec/tests/regression-runner.ts` 已注册 `Multi-Repo Promotion Readiness`，归入 `runtime-extended`。
- 验收命令：`node --import tsx ./tools/jispec/tests/multi-repo-promotion-readiness.ts` 应保持 5/5 通过；`node --import tsx ./tools/jispec/tests/north-star-acceptance.ts` 与 `node --import tsx ./tools/jispec/tests/p13-global-closure-acceptance.ts` 应继续证明 global closure 场景。

### 阶段 3：Console 决策台

目标：提升维度 4。

交付：

- 更完整的 local HTML governance console
- owner action 优先级
- value-report 可视化入口

退出标准：

- Console 第一屏可回答 mergeability、risk、owner、next command、evidence。

当前落地锚点（2026-05-21）：

- 决策台模型：`tools/jispec/console/governance-dashboard.ts` 已新增 `decisionDeck`，第一屏显式输出 mergeability、top risk、owner、next command、evidence 与 value-report 摘要。
- 行动优先级：`tools/jispec/console/governance-actions.ts` 已为每个治理 action 增加 `priority`，并按 `p0_blocking`、`p1_owner_review`、`p2_attention`、`p3_informational` 的可解释 rank 排序。
- 本地 HTML 控制面：`tools/jispec/console/ui/static-dashboard.ts` 已把 Decision Deck、Value Report 与 action priority 写入首屏 HTML 和 embedded JSON；`console ui --json` 也暴露同一决策模型。
- 基准回归：`tools/jispec/tests/console-decision-deck.ts` 覆盖 decision deck、priority sorting、HTML 渲染、JSON 输出与 value-report 接入。
- 矩阵入口：`tools/jispec/tests/regression-runner.ts` 已注册 `Console Decision Deck`，归入 `runtime-extended`。
- 验收命令：`node --import tsx ./tools/jispec/tests/console-decision-deck.ts` 应保持 5/5 通过；`node --import tsx ./tools/jispec/tests/regression-runner.ts --area runtime-extended` 应继续包含该 suite。

### 阶段 4：主线恢复力

目标：提升维度 1。

交付：

- flow diagnosis
- stale artifact detection
- replay/resume fixture

退出标准：

- 所有已知中断点都有恢复命令和 owner action。

当前落地锚点（2026-05-21）：

- 诊断模型：`tools/jispec/change/mainline-flow.ts` 已新增 `diagnoseMainlineFlow()`，统一读取 `.jispec/change-session.json`、`.jispec/handoff/*.json`、`.jispec/implement/<session>/patch-mediation.json` 与 impact freshness。
- Doctor 入口：`tools/jispec/doctor.ts` 的 `doctor mainline` 已新增 `Mainline Flow Recovery` 检查，输出 owner action、next command、source artifacts，不再只回答 readiness。
- 已覆盖中断点：active prompt/execute session、stale impact artifact、patch mediation apply/scope failure、缺 active session 但存在 replayable handoff、malformed `.jispec/change-session.json`。
- 基准回归：`tools/jispec/tests/mainline-flow-recovery.ts` 覆盖 7 个场景，其中至少 5 个是 replay / resume / stale / malformed 恢复路径。
- 矩阵入口：`tools/jispec/tests/regression-runner.ts` 已注册 `Mainline Flow Recovery`，归入 `change-implement`。
- 验收命令：`node --import tsx ./tools/jispec/tests/mainline-flow-recovery.ts` 应保持 7/7 通过；`node --import tsx ./tools/jispec/tests/regression-runner.ts --area change-implement` 应包含该 suite。

### 阶段 5：门禁覆盖面

目标：提升维度 2。

交付：

- 多技术栈 collector fixture
- freshness checks
- policy stable-fact guard

退出标准：

- verify failure 全部给出确定性 next action。

当前落地锚点（2026-05-21）：

- 覆盖模型：`tools/jispec/verify/gate-coverage.ts` 已新增 `buildVerifyGateCoverageReport()`，把阶段 5 固化为 `north-star-score-optimization-phase-5` metadata。
- 多栈 fixture：`stackCoverage` 现在稳定检测 `node_typescript`、`python`、`go_or_java` 三类仓库表面，并记录实际 evidence。
- Freshness checks：`artifactFreshness` 覆盖 `.jispec-ci/verify-report.json`、`.spec/policy.yaml`、`.spec/baselines/verify-baseline.json`、release compare report 和 impact graph；缺失、过期、无效、尚不可用都会给出确定性 `nextCommand`。
- Policy stable-fact guard：`policyStableFactGuard` 汇总 blocking policy rule、unstable fact 使用、unknown fact，并把修复入口稳定指向 `policy migrate` 或 `verify`。
- Failure next action：`issueNextActions` 为每个 verify issue 生成 owner、source artifact、rationale 和 deterministic next command，避免只给出裸 failure。
- Stable read model：`runFullVerify()` 已把 `gateCoverage` 写入 `verify --json` 的 `metadata`；`renderVerifySummaryMarkdown()` 已新增 `Gate Coverage` 人类摘要段落。
- 边界声明：gate coverage 是 review/CI UX 的 advisory evidence，不替代 `verify` verdict、issue severity 或现有 exit code 语义。
- 基准回归：`tools/jispec/tests/verify-gate-coverage.ts` 覆盖 6 个场景：多栈检测、freshness、stable-fact guard、issue next actions、report/summary 暴露、matrix 注册。
- 矩阵入口：`tools/jispec/tests/regression-runner.ts` 已注册 `Verify Gate Coverage`，归入 `verify-ci-gates`，task 为 `North-Star-Score-Phase-5`。
- 验收命令：`node --import tsx ./tools/jispec/tests/verify-gate-coverage.ts` 应保持 6/6 通过；`node --import tsx ./tools/jispec/tests/regression-runner.ts --area verify-ci-gates` 应包含该 suite。

## 下一轮提升空间与任务罗盘

当前五维重新评分已经达到：

| 维度 | 当前评分 | 下一轮目标 | 主要提升空间 |
| --- | ---: | ---: | --- |
| 主线交付闭环 | 9.7 | 9.8 | 从“已知中断点可恢复”提升到“恢复路径可演练、可度量、可回归趋势化” |
| 确定性门禁 | 9.7 | 9.8 | 从“门禁覆盖面可解释”提升到“门禁覆盖缺口可自动建账、可持续收敛” |
| 接管与契约生成质量 | 9.3 | 9.5 | 从“benchmark pool 证明”提升到“真实复杂仓库分层基准和 correction budget” |
| 治理与可观测性 | 9.4 | 9.6 | 从“决策台第一屏”提升到“可执行治理 runbook 和趋势回放” |
| 终局控制平面 / 协作面 | 9.1 | 9.4 | 从“local-first global closure”提升到“多仓运营包、异步协作审计和 promotion 证据链” |

原则：

- 继续避免把 deferred collaboration / presence / distributed surface 误升为 V1 blocking gate。
- 每一阶段都必须落到机器 artifact、回归 suite、stable contract 或 doctor / console 可读入口。
- 评分提升不靠口号，必须能被 regression matrix、north-star acceptance 或 doctor 输出证明。

### 阶段 6：Retakeover Realism Ladder

目标：把维度 3 从 `9.3` 提升到 `9.5`。

为什么还有空间：

- 阶段 1 已有 benchmark pool，但更多证明来自 fixture class，而不是明确分层的真实复杂仓库等级。
- 当前能证明 correction load 下降，但还缺“不同复杂度仓库的可接受人工修正预算”。
- feature draft 已更保守，但还可以把 overclaim risk 变成 release / console 可持续观测指标。

交付：

- 建立 `retakeover realism ladder`，把旧仓库 fixture 分成：
  - `simple_service`
  - `monolith`
  - `polyglot_service`
  - `legacy_with_generated_noise`
  - `weak_documentation`
- 为每层定义 correction budget：
  - accepted without edit target
  - edited draft ceiling
  - deferred spec debt ceiling
  - feature overclaim ceiling
  - evidence noise ceiling
- 将 `retakeover-metrics` 输出扩展为 realism ladder summary。
- Console / north-star acceptance 能读取 takeover quality trend，而不是只引用一次性 benchmark。

退出标准：

- 至少 5 个 realism class 都有独立 fixture 和稳定评分。
- 任一 class 分数退化时能产生 owner action 和 next command。
- `retakeover-regression-pool` 不只证明“能跑”，还证明 correction budget 没被突破。

建议验收命令：

- `node --import tsx ./tools/jispec/tests/retakeover-realism-ladder.ts`
- `node --import tsx ./tools/jispec/tests/regression-runner.ts --area retakeover-regression-pool`

当前落地锚点（2026-05-22）：

- 指标结构：`tools/jispec/bootstrap/retakeover-metrics.ts` 已新增 `coverage.realismLadder`，phase 固定为 `north-star-score-optimization-phase-6`。
- Realism classes：当前分层为 `simple_service`、`monolith`、`polyglot_service`、`legacy_with_generated_noise`、`weak_documentation`。
- Correction budget：每层都记录 fixture count、stable scored fixture count、accepted-without-edit、edited draft、deferred spec debt、feature overclaim、evidence noise、takeover readiness 的预算阈值和实际值。
- Owner action：任一 realism class 预算退化时，`ownerAction` 会给出 owner、source artifact、reason 和 deterministic next command。
- Console 入口：`tools/jispec/console/read-model-snapshot.ts` 与 `tools/jispec/console/governance-dashboard.ts` 已把 realism ladder ready/coverage/blockers 接入 `retakeover_pool_health`。
- 基准回归：`tools/jispec/tests/retakeover-realism-ladder.ts` 覆盖 4 个场景：五类 realism coverage、budget miss owner action、pool artifact/summary 暴露、matrix 注册。
- 矩阵入口：`tools/jispec/tests/regression-runner.ts` 已注册 `Retakeover Realism Ladder`，归入 `retakeover-regression-pool`，task 为 `North-Star-Score-Phase-6`。
- 架构说明：`docs/architecture/retakeover-regression-pool.md` 已记录 Phase-6 realism ladder 是评分证据，不替代 `verify`、CI 或 North Star acceptance。

### 阶段 7：Gate Gap Ledger

目标：把维度 2 从 `9.7` 提升到 `9.8`。

为什么还有空间：

- 阶段 5 已经把 gate coverage 暴露为 metadata，但缺口仍主要停留在当前 verify report 的上下文里。
- 下一步应该把 missing / stale / invalid / not_available_yet 变成可追踪的 gate gap ledger，持续回答“哪些门禁覆盖缺口还没收敛”。

交付：

- 新增 `.spec/gates/gap-ledger.json` 或等价本地 artifact。
- 将 `metadata.gateCoverage.artifactFreshness`、`policyStableFactGuard`、`issueNextActions` 汇总成 ledger entry。
- 每条 gap 稳定包含：
  - id
  - severity / posture
  - owner
  - source artifact
  - first seen
  - last seen
  - next command
  - resolved / unresolved
- `ci:verify` 和 `verify-summary.md` 显示 gate gap trend。

退出标准：

- gate coverage 不只说明“这次缺什么”，还能说明“这个缺口是否是新出现、持续存在或已经解决”。
- gap ledger 不改变 verify verdict；真正 gate 仍由 verify issue severity 决定。
- 所有 ledger entry 都有 deterministic next command。

建议验收命令：

- `node --import tsx ./tools/jispec/tests/verify-gate-gap-ledger.ts`
- `node --import tsx ./tools/jispec/tests/regression-runner.ts --area verify-ci-gates`

当前落地锚点（2026-05-22）：

- 账本模型：`tools/jispec/verify/gate-gap-ledger.ts` 已新增 `.spec/gates/gap-ledger.json`，phase 固定为 `north-star-score-optimization-phase-7`。
- Gap 来源：账本从 `metadata.gateCoverage.artifactFreshness`、`policyStableFactGuard` 和 `issueNextActions` 生成 entry。
- 生命周期：每条 entry 稳定记录 `firstSeenAt`、`lastSeenAt`、`resolvedAt`、`occurrenceCount`、`status`，可区分 new / persistent / resolved。
- 决策字段：每条 gap 都包含 `owner`、`sourceArtifact`、`reason`、`nextCommand`；账本 summary 提供 `topNextCommand`。
- Verify 接入：`runFullVerify()` 会写回 `.spec/gates/gap-ledger.json`，并把 `gateGapLedger` summary 放入 `verify --json` 的 `metadata`。
- Summary 接入：`renderVerifySummaryMarkdown()` 和 `renderCiSummaryMarkdown/Text()` 已显示 Gate Gap Ledger trend。
- 边界声明：gate gap ledger 只追踪 coverage debt 生命周期，不替代 `verify` verdict、issue severity 或 exit code。
- 基准回归：`tools/jispec/tests/verify-gate-gap-ledger.ts` 覆盖 4 个场景：账本落盘、new/persistent/resolved、summary 暴露、matrix 注册。
- 矩阵入口：`tools/jispec/tests/regression-runner.ts` 已注册 `Verify Gate Gap Ledger`，归入 `verify-ci-gates`，task 为 `North-Star-Score-Phase-7`。

### 阶段 8：Console Runbook Mode

目标：把维度 4 从 `9.4` 提升到 `9.6`。

为什么还有空间：

- 阶段 3 已经有 Decision Deck，但它偏“读当前状态”。
- 真正 9.6 需要 Console 能把治理状态转成稳定 runbook：先做什么、为什么、谁负责、完成后如何验证。

交付：

- 为 Console 新增 `runbook` read model：
  - ordered steps
  - owner
  - command
  - expected artifact
  - verification command
  - rollback / defer option
- `console actions` 输出从单条 action plan 升级为可执行治理 runbook。
- static dashboard 首屏增加 top runbook，不执行命令，只展示本地命令和证据。
- value-report 与 runbook 关联，显示每个 runbook 对风险阻断、节省时间、治理债务的影响。

退出标准：

- Console 能回答“现在最该做哪 3 步，以及每一步做完看哪个 artifact 证明完成”。
- 缺 artifact 时 runbook 明确显示 blocked / not_available_yet，而不是猜测。
- runbook 不能绕过 `verify`、`ci:verify`、policy、waiver、release compare。

建议验收命令：

- `node --import tsx ./tools/jispec/tests/console-runbook-mode.ts`
- `node --import tsx ./tools/jispec/tests/regression-runner.ts --area runtime-extended`

落地锚点（2026-05-22）：

- Runbook 读模型：`tools/jispec/console/governance-actions.ts` 已在 `ConsoleGovernanceActionPlan` 上新增 `runbook`，包含 top 3 ordered steps、owner、command、expected artifact、verification command、rollback/defer option、evidence 与 value-report impact。
- 决策台引用：`tools/jispec/console/governance-dashboard.ts` 已把 `decisionDeck.runbook` 接到第一屏决策摘要，保持 read-only、no source upload、no verify override。
- 静态 Console：`tools/jispec/console/ui/static-dashboard.ts` 已在首屏增加 Top Runbook，并在嵌入 JSON / `console ui --json` 中暴露完整 `runbook`。
- 回归保护：`tools/jispec/tests/console-runbook-mode.ts` 覆盖 5 项阶段 8 验收；`tools/jispec/tests/regression-runner.ts` 已注册 `Console Runbook Mode`，归入 `runtime-extended`，task 为 `North-Star-Score-Phase-8`。

### 阶段 9：Mainline Recovery Drill

目标：把维度 1 从 `9.7` 提升到 `9.8`。

为什么还有空间：

- 阶段 4 已经能诊断多个中断点并给出恢复命令。
- 下一步应该把 recovery 从“静态诊断”升级为“可演练闭环”：生成 drill packet，证明恢复命令、source artifact 和期望结果能被复核。

交付：

- 新增 mainline recovery drill artifact：
  - `.jispec/recovery/mainline-drill.json`
  - `.jispec/recovery/mainline-drill.md`
- `doctor mainline` 可输出 recovery drill summary。
- 每个 drill step 包含：
  - current state
  - source artifact
  - owner action
  - command
  - expected next state
  - verification command
- 覆盖 active session、handoff replay、patch mediation retry、stale impact refresh、malformed session regeneration。

退出标准：

- 已知中断点不只给 next command，还给 expected next state。
- drill packet 可被 Console / north-star acceptance 引用。
- malformed / stale / retry 类路径有独立回归。

建议验收命令：

- `node --import tsx ./tools/jispec/tests/mainline-recovery-drill.ts`
- `node --import tsx ./tools/jispec/tests/regression-runner.ts --area change-implement`

落地锚点（2026-05-22）：

- Drill 生成器：`tools/jispec/change/mainline-recovery-drill.ts` 已新增 `buildMainlineRecoveryDrill()` 与 `writeMainlineRecoveryDrill()`，从阶段 4 的 `diagnoseMainlineFlow()` 生成 current state、source artifact、owner action、command、expected next state、verification command。
- Doctor 入口：`tools/jispec/doctor.ts` 的 `Mainline Flow Recovery` 检查已包含 `recoveryDrill` summary；`tools/jispec/cli.ts` 的 `doctor mainline --write-drill` 显式写入 `.jispec/recovery/mainline-drill.json` 与 `.jispec/recovery/mainline-drill.md`。
- Console / North Star 引用：`tools/jispec/console/read-model-contract.ts` 与 `tools/jispec/console/read-model-snapshot.ts` 已声明并汇总 `mainline_recovery_drill`；`tools/jispec/north-star/acceptance.ts` 已新增 `mainline_recovery_drill` 场景。
- 回归保护：`tools/jispec/tests/mainline-recovery-drill.ts` 覆盖 6 项阶段 9 验收；`tools/jispec/tests/regression-runner.ts` 已注册 `Mainline Recovery Drill`，归入 `change-implement`，task 为 `North-Star-Score-Phase-9`。

### 阶段 10：Global Operations Packet

目标：把维度 5 从 `9.1` 提升到 `9.4`。

为什么还有空间：

- 阶段 2 已经证明 multi-repo promotion readiness，但第 5 维仍不是完整协作平台。
- 正确提升方向不是做实时协作，而是把 local-first global closure 变成团队可传递的 operations packet。

交付：

- 新增 global operations packet：
  - repo group topology
  - cross-repo contract refs
  - owner action lifecycle
  - promotion readiness
  - privacy / redaction posture
  - audit evidence refs
  - verify boundary statement
- `doctor global` 输出 operations packet readiness。
- `north-star acceptance` 增加或强化 global operations scenario。
- 异步协作事件接入 audit ledger：
  - reviewer acknowledged
  - waiver approved
  - debt repaid
  - drift owner assigned
  - promotion accepted / rejected

退出标准：

- 至少 2 个 support surface 继续满足 promotion checklist，并被 operations packet 引用。
- packet 可证明团队如何在不上传源码、不引入实时协作、不覆盖 verify 的情况下运营 global closure。
- deferred surfaces 继续保持 diagnostic-only，不进入 V1 / pilot / global blocking profile。

建议验收命令：

- `node --import tsx ./tools/jispec/tests/global-operations-packet.ts`
- `node --import tsx ./tools/jispec/tests/north-star-acceptance.ts`
- `node --import tsx ./tools/jispec/tests/regression-runner.ts --area runtime-extended`

落地状态：

- Packet 生成器：`tools/jispec/operations/global-operations-packet.ts` 已新增 `buildGlobalOperationsPacket()` 与 `writeGlobalOperationsPacket()`，输出 `.spec/operations/global-operations-packet.json` 和 `.spec/operations/global-operations-packet.md`。
- Doctor 入口：`tools/jispec/doctor.ts` 的 `doctor global` 已新增 `Global Operations Packet Readiness`，并通过 `tools/jispec/cli.ts` 的 `doctor global --write-operations` 写入 packet；写入时使用同一轮 doctor report，避免读取旧 `.spec/doctor/global-readiness.json` 造成循环误判。
- Console / North Star 引用：`tools/jispec/console/read-model-contract.ts`、`tools/jispec/console/read-model-snapshot.ts` 和 `tools/jispec/console/ui/static-dashboard.ts` 已声明并展示 `global_operations_packet`；`tools/jispec/north-star/acceptance.ts` 已新增 `global_operations_packet` 场景。
- 审计事件映射：packet 会把 reviewer acknowledged、waiver approved、debt repaid、drift owner assigned、promotion accepted / rejected 映射到 `.spec/audit/events.jsonl` 的本地事件证据。
- 边界证明：packet 明确声明 local-only、sourceUploadRequired=false、realtimeCollaborationRequired=false、executesCommands=false、replacesVerify=false、deferredSurfacesDiagnosticOnly=true。
- 回归保护：`tools/jispec/tests/global-operations-packet.ts` 覆盖 6 项阶段 10 验收；`tools/jispec/tests/regression-runner.ts` 已注册 `Global Operations Packet`，归入 `runtime-extended`，task 为 `North-Star-Score-Phase-10`。

## 下一轮完成定义

阶段 6-10 完成后，重新评分应达到：

| 维度 | 当前评分 | 下一轮目标 |
| --- | ---: | ---: |
| 主线交付闭环 | 9.7 | 9.8 |
| 确定性门禁 | 9.7 | 9.8 |
| 接管与契约生成质量 | 9.3 | 9.5 |
| 治理与可观测性 | 9.4 | 9.6 |
| 终局控制平面 / 协作面 | 9.1 | 9.4 |

整体北极星评分目标从 `9.44` 提升到约 `9.62`。

## 最终完成定义

这份计划完成后，重新评分应达到：

| 维度 | 目标 |
| --- | ---: |
| 主线交付闭环 | 9.7 |
| 确定性门禁 | 9.7 |
| 接管与契约生成质量 | 9.2-9.5 |
| 治理与可观测性 | 9.3-9.5 |
| 终局控制平面 / 协作面 | 9.0+ |

整体北极星评分应达到 `9.3+`。
