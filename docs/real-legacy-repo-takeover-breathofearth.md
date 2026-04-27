# C8 Demo Record: BreathofEarth 真实旧仓库接管

这份记录是 `C8. 做一次真实旧仓库接管演示记录` 的正式落地结果。

执行日期：

- `2026-04-27`

目标仓库：

- [BreathofEarth](/D:/codeSpace/BreathofEarth)

执行仓库：

- [JiSpec](/D:/codeSpace/JiSpec)

## 1. 为什么选这个仓库

`BreathofEarth` 是一个很适合做 V1 主线演示的真实旧仓库样本，因为它同时满足：

- 有清晰的业务叙事和真实边界约束
- 有较完整的 Python 后端、路由、引擎、runner、测试和文档目录
- 不是按 JiSpec 协议原生搭建，因此能真实暴露冷启动噪声
- 仓库里已经存在历史脏改动，能检验接管过程是否与用户现有工作状态共存

从仓库 README 可以确认，它不是“自动下单的交易机器人”，而是一个强调：

- `稳定 > 抗通胀 > 收益`
- 手工审批出金
- Alpha 独立账本
- Broker Sync / Shadow Run / 执行后对账

的家族资产控制系统。

## 2. 开始前状态

执行前 `git status --short` 显示的已有脏改动是：

- `data/raw/510300.SS.csv`
- `data/raw/511010.SS.csv`
- `data/raw/513500.SS.csv`
- `data/raw/518880.SS.csv`
- `data/raw/SHV.csv`
- `data/raw/SPY.csv`
- `data/raw/TLT.csv`

这些都是仓库原本就存在的数据文件修改，本次接管没有回滚或覆盖它们。

## 3. 实际执行命令

以下命令都是从 [JiSpec](/D:/codeSpace/JiSpec) 仓库根目录运行，并显式指向 [BreathofEarth](/D:/codeSpace/BreathofEarth)：

```bash
node --import tsx ./tools/jispec/cli.ts bootstrap discover --root D:\codeSpace\BreathofEarth --json
node --import tsx ./tools/jispec/cli.ts bootstrap draft --root D:\codeSpace\BreathofEarth --json
node --import tsx ./tools/jispec/cli.ts adopt --root D:\codeSpace\BreathofEarth --session bootstrap-20260427T065715730Z --interactive --json
node --import tsx ./tools/jispec/cli.ts policy migrate --root D:\codeSpace\BreathofEarth --json
node --import tsx ./tools/jispec/cli.ts verify --root D:\codeSpace\BreathofEarth --json --facts-out .spec/facts/verify/breathofearth-facts.json
node --import tsx ./scripts/check-jispec.ts --root D:\codeSpace\BreathofEarth
```

## 4. Bootstrap Discover 结果

`bootstrap discover` 成功在几分钟内为这个旧仓库逆向建立了第一层证据图。

关键结果：

- `52` 条高置信 API route
- `13` 个测试文件
- `27` 个文档信号
- `1` 个运行时 manifest
- `0` 个 schema signal
- `193` 个 source file inventory

关键产物：

- [evidence-graph.json](/D:/codeSpace/BreathofEarth/.spec/facts/bootstrap/evidence-graph.json)
- [evidence-summary.txt](/D:/codeSpace/BreathofEarth/.spec/facts/bootstrap/evidence-summary.txt)

高价值信号是：

- 它快速抓到了大量真实 route surface
- 它把 README 和设计文档一并纳入了证据图
- 它能识别出 `alpha / governance / report / dashboard` 一带的行为入口

暴露出的真实噪声是：

- 旧协议缺失：`jiproject/project.yaml`
- 旧协议 schema 缺失：`context/contracts/project/slice/tasks/trace`
- `.pytest_cache/README.md` 被错误当成高价值 readme 文档信号

这类噪声非常真实，也正是“老仓库接管”必须面对的问题。

## 5. Bootstrap Draft 结果

`bootstrap draft` 成功生成了第一批可审草稿：

- [draft domain](/D:/codeSpace/BreathofEarth/.spec/sessions/bootstrap-20260427T065715730Z/drafts/domain.yaml)
- [draft api_spec](/D:/codeSpace/BreathofEarth/.spec/sessions/bootstrap-20260427T065715730Z/drafts/api_spec.json)
- [draft behaviors](/D:/codeSpace/BreathofEarth/.spec/sessions/bootstrap-20260427T065715730Z/drafts/behaviors.feature)
- [draft manifest](/D:/codeSpace/BreathofEarth/.spec/sessions/bootstrap-20260427T065715730Z/manifest.json)

本次 draft 运行模式：

- `providerName = deterministic-fallback`
- `generationMode = deterministic`

原因很直接：

- 目标仓库没有 `jiproject/project.yaml`
- 因此没有 AI config
- JiSpec 改走了本地 deterministic fallback

这说明即使没有额外 AI 配置，主线仍然能完成“先给出第一批草稿”的冷启动动作。

### 草稿质量判断

这批草稿是“有用但不够干净”的真实首稿。

有用的地方：

- API draft 抓住了大量真实 route surface
- Feature draft 至少把一批 route-backed behaviors 固定成了可讨论文本
- Domain draft 确实反映出这是一个路由、治理、报告、alpha 混合存在的业务系统

不够干净的地方：

- domain context 被压缩成了 `init / report / arena / create`
- `.pytest_cache/README.md` 被错误拉进高价值文档信号
- feature draft 更像 route review 清单，不足以代表真正的治理行为故事
- api draft 仍然偏“路由枚举”，还不是最终业务接口契约

这正是 V1 要证明的主张：

用户不需要先手写完整规范，工具先给出第一批可接管草稿，然后人类再认领、修改、延后。

## 6. Adopt 决策

本次真实接管没有盲目全收，而是按“先把最有价值的接管进门，再把噪声延后”的原则执行。

最终决策：

| Artifact | 决策 | 理由 |
| --- | --- | --- |
| `domain` | `edit` | 原 draft 的业务上下文过于被 route verb 和缓存文档噪声主导，需要人工改写成真实业务边界 |
| `api` | `accept` | 虽然仍然 route-centric，但已经足够成为第一批可审 API surface |
| `feature` | `skip_as_spec_debt` | 当前 feature 草稿更像 route review，不足以代表治理/执行/账本行为故事，适合延后 |

### Domain 的人工改写

最终接管后的 domain contract 是：

- [domain.yaml](/D:/codeSpace/BreathofEarth/.spec/contracts/domain.yaml)

它把业务边界修正为：

- `core_portfolio_control`
- `governance_and_manual_withdrawal`
- `broker_sync_and_shadow_run`
- `alpha_experiment_ledger`
- `reporting_and_observability`

并明确写入了核心 invariants：

- 出金只能申请、人工审批、人工执行
- Alpha 与主仓独立账本运行
- 真实执行默认关闭，必须显式开启并通过同步、风控与对账硬闸门

这一步非常关键，因为它证明：

JiSpec 的真正价值不是“一次性自动写对所有规范”，而是“把人类从零开始写规范，降级为对第一批草稿做认领和纠偏”。

### Adopt 落盘结果

接管后写出的关键产物：

- [adopted domain](/D:/codeSpace/BreathofEarth/.spec/contracts/domain.yaml)
- [adopted api contract](/D:/codeSpace/BreathofEarth/.spec/contracts/api_spec.json)
- [deferred feature spec debt](/D:/codeSpace/BreathofEarth/.spec/spec-debt/bootstrap-20260427T065715730Z/feature.json)
- [bootstrap takeover report](/D:/codeSpace/BreathofEarth/.spec/handoffs/bootstrap-takeover.json)

takeover report 说明：

- 已接管：`domain + api`
- 已延后：`feature`
- 没有 reject

## 7. Verify 与 CI Gate 结果

### Verify 结果

机器可读输出：

- [verify facts](/D:/codeSpace/BreathofEarth/.spec/facts/verify/breathofearth-facts.json)

本次 `verify --json` 结果是：

- `verdict = WARN_ADVISORY`
- `exit_code = 0`
- `issue_count = 9`
- `blocking_issue_count = 0`
- `advisory_issue_count = 9`

这一步是整个演示里最重要的证据之一。

原因不是“0 issue”，而是：

- 原本会把老仓库直接打死的历史协议缺口
- 在 Bootstrap + Adopt 之后
- 被降级成了可审历史债务
- 而不是继续阻断第一次接入

这就是 V1 Aha Moment 成立的核心信号。

### Advisory 的组成

9 条 advisory 由三类组成：

1. 历史协议债务

- 缺失 `jiproject/project.yaml`
- 缺失 `context/contracts/project/slice/tasks/trace` schema

2. 当前有意延后的行为契约

- `POLICY_REQUIRE_BEHAVIOR_CONTRACT`
- `BOOTSTRAP_SPEC_DEBT_PENDING`

3. 没有出现 blocking contract breakage

- 已接管的 `domain.yaml`
- 已接管的 `api_spec.json`

都没有触发 blocking 结构性错误

### CI Wrapper 结果

`ci:verify` 结果同样是成功通过：

- `JiSpec Verify: WARN_ADVISORY`
- `exit code = 0`

CI 产物：

- [verify-report.json](/D:/codeSpace/BreathofEarth/.jispec-ci/verify-report.json)
- [ci-summary.md](/D:/codeSpace/BreathofEarth/.jispec-ci/ci-summary.md)

这说明：

- 主线不只是在 CLI 本地成立
- 它已经能把真实旧仓库的第一次接管结果，稳定交给 CI surface

## 8. 本次演示证明了什么

### 已被证明成立的部分

1. `Bootstrap` 的冷启动价值是真的

在没有手写任何初始规范的前提下，JiSpec 成功从一个真实老 Python 仓库里提取出：

- 第一批 domain draft
- 第一批 api draft
- 第一批 feature draft

2. 人类认领成本显著低于“从零写规范”

这次没有要求先人工写 domain/api/feature 三套规范。
真实工作量变成了：

- 修 domain
- 认 api
- 延后 feature

这比从零起草整套 contract 轻得多。

3. Verify 已经能理解“已接管资产”和“历史债务”的区别

这是最关键的产品闭环信号之一。

`BreathofEarth` 上的 verify 没有把旧协议缺口继续当成 blocking fatal，而是把它们变成了：

- `HISTORICAL_*`
- `BOOTSTRAP_SPEC_DEBT_PENDING`

这说明 Verify 已具备 takeover-aware 语义。

4. CI surface 可以承接真实接管结果

不是只在函数级或 demo fixture 里成立，而是已经能在真实仓库上输出 CI artifacts。

### 仍然暴露出的噪声与不足

1. Discover 需要更积极地过滤缓存和辅助目录

本次最明显噪声之一是：

- `.pytest_cache/README.md`

它不应该出现在真实业务文档高优先级信号里。

2. Draft 的 domain context 推断仍过度依赖 route 名称

`init / report / arena / create` 明显不是 `BreathofEarth` 的最佳业务边界表述。
它更像路由和文件名聚类，而不是“业务接管视角”的 bounded context。

3. Feature draft 仍然偏 route review，而不是业务行为契约

这次 feature 被延后成 spec debt，不是因为流程失败，而是因为 draft 质量真实地还不够好。

4. API draft 还不是最终业务接口契约

它已经足够作为第一批 takeover 草稿，但仍然偏：

- route 枚举
- route 优先排序
- 少 schema shape
- 少请求/响应语义

## 9. 对 BreathofEarth 的下一步建议

如果要把这次接管继续推进成更稳定的长期仓内 contract surface，建议按下面顺序做：

1. 新建最小 `jiproject/project.yaml`

这样可以消掉 `HISTORICAL_FILE_MISSING`，并为后续 AI/draft provider 留出配置入口。

2. 把 `feature` 从 spec debt 提升成真正的治理行为契约

优先不该写 route list，而该写这类行为：

- 出金申请 -> 审批 -> 执行 -> 留痕
- Alpha 资金隔离与主仓独立账本
- Broker Sync -> Shadow Run -> Execution -> Reconciliation

3. 调整 discover 的过滤规则

优先忽略：

- `.pytest_cache`
- `.ruff_cache`
- 类似缓存目录下的 README 噪声

4. 逐步把 API contract 从 route inventory 升级成业务 API contract

先围绕：

- governance
- broker sync
- reporting
- alpha ledger

几个高价值面收敛，而不是一次性吞全量 route。

## 10. 结论

这次 `BreathofEarth` 演示可以把 `C8` 视为完成，因为它已经提供了：

- 一个真实旧仓库样本
- 一次完整的 `discover -> draft -> adopt -> policy migrate -> verify -> ci:verify` 记录
- 一份可复盘的 takeover 决策链
- 一份真实噪声清单
- 一个明确结论：V1 Aha Moment 在真实仓库上成立，但 Draft 质量和 Discover 过滤仍值得继续优化

如果要用一句话总结这次演示：

JiSpec 已经能把 `BreathofEarth` 这种真实旧仓库，从“先写完整规范才能用”，降低成“先自动拉出第一批草稿，再人工认领最关键的 domain/api，并把剩余噪声安全延后”。这就是当前 V1 主线最值得保住的产品价值。
