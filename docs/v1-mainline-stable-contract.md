# JiSpec V1 主线稳定契约

这份文档定义当前仓库对外可依赖的 V1 主线稳定契约。

它回答的是：

- 现在主线到底包含哪些命令
- 这些命令的退出码如何解释
- 会稳定写出哪些关键文件
- 哪个 JSON 面可以被脚本依赖
- `ci:verify` 会稳定产出哪些 artifacts
- 哪些能力当前明确不在 V1 主线承诺内

如果 README、roadmap、task pack 文档与本文档存在表述差异，以本文档为准。

## 1. 适用范围

当前 V1 主线固定指：

`bootstrap init-project -> bootstrap discover -> bootstrap draft -> adopt -> verify -> ci:verify -> change -> implement -> verify --fast/full`

本文档覆盖的稳定命令面包括：

- `bootstrap init-project`
- `bootstrap discover`
- `bootstrap draft`
- `adopt --interactive`
- `policy migrate`
- `verify`
- `ci:verify`
- `change`
- `implement`
- `doctor v1`

本文档不覆盖 legacy `slice/context/trace/artifact/agent/pipeline/template/dependency` 兼容命令面的产品语义，它们仍可用，但不属于 V1 主线稳定契约。

## 2. 主线命令

从仓库根目录运行时，推荐使用下面这些命令：

```bash
npm run jispec-cli -- bootstrap init-project
npm run jispec-cli -- bootstrap discover
npm run jispec-cli -- bootstrap discover --include-noise
npm run jispec-cli -- bootstrap discover --init-project
npm run jispec-cli -- bootstrap draft
npm run jispec-cli -- adopt --interactive
npm run jispec-cli -- policy migrate
npm run jispec-cli -- policy migrate --profile small_team --owner <owner> --reviewer <reviewer>
npm run jispec-cli -- verify
npm run jispec-cli -- verify --json
npm run jispec-cli -- verify --fast
npm run ci:verify
npm run jispec-cli -- change "Add order refund validation"
npm run jispec-cli -- change "Add order refund validation" --mode prompt
npm run jispec-cli -- change "Add order refund validation" --mode execute
npm run jispec-cli -- change default-mode show
npm run jispec-cli -- change default-mode set execute --actor <name> --reason <reason>
npm run jispec-cli -- change default-mode set prompt --actor <name> --reason <reason>
npm run jispec-cli -- change default-mode reset
npm run jispec-cli -- implement
npm run jispec-cli -- implement --fast
npm run jispec-cli -- release snapshot --version v1
npm run jispec-cli -- release compare --from v1 --to current
npm run jispec-cli -- doctor v1
```

命令职责固定为：

| 命令 | 稳定职责 |
| --- | --- |
| `bootstrap init-project` | 显式创建最小 `jiproject/project.yaml`，除非 `--force` 否则不覆盖已有文件 |
| `bootstrap discover` | 扫描仓库并写出 bootstrap evidence graph、full inventory、adoption-ranked evidence 和 readable summary |
| `bootstrap discover --include-noise` | 显式 opt in 到 vendored、generated、cache、build、audit 和 tool-mirror 路径扫描，用于 forensic/exhaustive takeover 调查；默认主线不使用 |
| `bootstrap draft` | 基于 ranked bootstrap evidence 生成首批 draft bundle 和 session manifest；可选 BYOK provider 只能做语义重锚 |
| `adopt --interactive` | 对 draft 做 accept / reject / edit / skip_as_spec_debt 决策，并写入 takeover report、takeover brief 与 adopt summary |
| `policy migrate` | 生成或规范化 `.spec/policy.yaml`，可显式声明 team profile、owner 和 reviewer |
| `verify` | 运行确定性 gate，输出四态 verdict |
| `verify --fast` | 运行本地 fast-lane precheck，必要时可自动提升回 strict 语义 |
| `ci:verify` | 运行 CI 包装层，写出 `.jispec-ci` 报告产物 |
| `change --mode prompt` | 只记录变更意图、lane 和 next commands，不自动继续执行 |
| `change --mode execute` | 尝试继续串联到 `implement -> verify`，但 strict lane 遇到未处理 bootstrap draft 时会停在 adopt 边界 |
| `change` + `jiproject/project.yaml: change.default_mode=execute` | 在未显式传入 `--mode` 时默认进入 execute mediation；显式 CLI mode 优先 |
| `change default-mode show` | 显示当前默认模式、mode 来源和 execute-default readiness |
| `change default-mode set prompt\|execute` | 通过 CLI 写入项目级 `change.default_mode`，并记录审计历史；set execute 前会检查 execute-default readiness blocker，open bootstrap draft 只产生 adopt-boundary 警告 |
| `change default-mode reset` | 删除项目级 `change.default_mode`，回到内置 prompt 默认，并记录审计历史 |
| `implement` | 执行 strict lane 的 implementation mediation，并做 post-implement verify |
| `implement --fast` | 执行 fast lane 的 implementation mediation，并在 post-verify 中保留自动提升能力 |
| `implement --external-patch <path>` | 接入外部 patch，先做 scope check，再 apply / test / verify |
| `implement --from-handoff <path-or-session>` | 从 replayable handoff packet 恢复上一轮 execute/implement 失败上下文，可与 `--external-patch <path>` 组合继续下一次 patch mediation |
| `release snapshot --version <version>` | 冻结当前 baseline，并写出 contract graph、static collector、policy snapshot 和可读摘要 |
| `release compare --from <ref> --to <ref>` | 比较两个 baseline/ref，写出机器可读 compare report、可读 drift summary，并刷新 release drift trend |
| `console export-governance` | 导出当前 repo 的治理 snapshot，供未来多 repo Console 汇总使用 |
| `doctor v1` | 只回答 V1 主线 readiness，不让 deferred surfaces 拖红 |

## 3. 退出码契约

### 3.1 通用规则

- `0` 表示当前命令按其设计完成，没有触发 blocking gate。
- `1` 表示命令失败、调用无效、实现测试失败，或出现 blocking verify verdict。

当前 V1 主线不使用更细的多值退出码。

### 3.2 各命令退出码

| 命令 | `0` 的含义 | `1` 的含义 |
| --- | --- | --- |
| `bootstrap init-project` | project scaffold 已创建、已存在，或在 `--force` 下刷新成功 | scaffold 写入失败、调用参数无效，或未使用 `--force` 时试图覆盖已有文件 |
| `bootstrap discover` | discover 成功完成 | discover 运行失败 |
| `bootstrap discover --include-noise` | discover 成功完成，并且跳过默认噪声排除策略 | discover 运行失败 |
| `bootstrap draft` | draft 成功完成 | draft 运行失败 |
| `adopt --interactive` | adopt 成功完成并提交或正常结束 | adopt 运行失败、调用参数无效、交互输入不完整 |
| `policy migrate` | policy 文件生成或规范化成功 | policy migrate 失败 |
| `verify` | verdict 为 `PASS`、`WARN_ADVISORY` 或 `ERROR_NONBLOCKING` | verdict 为 `FAIL_BLOCKING`，或 verify 运行异常 |
| `verify --fast` | 同 `verify`，但执行 fast-lane 入口 | 同 `verify` |
| `ci:verify` | verify 结果不 blocking，并成功写出 CI artifacts | verify 为 `FAIL_BLOCKING`，或 wrapper 运行失败 |
| `change --mode prompt` | change session 已记录，命令级规划成功 | change 命令执行失败 |
| `change --mode execute` | 串联成功，或命令按设计停在 `awaiting_adopt` 边界 | downstream implement/tests/post-verify 失败，或 orchestration 运行异常 |
| `change default-mode show` | 当前默认模式和 readiness 已输出 | 命令运行异常 |
| `change default-mode set prompt\|execute` | 项目默认模式已写入并记录 history；open bootstrap draft 时仍可 set execute，但输出 adopt-boundary warning | mode 无效、缺 policy、verify blocking、配置 warning、external patch mediation 不完整阻止 set execute，或写入失败 |
| `change default-mode reset` | 项目默认模式已回到 built-in prompt，并记录 history | 命令运行异常或写入失败 |
| `implement` | outcome 为 `preflight_passed` 或 `patch_verified`，且 post-implement verify 不 blocking | outcome 为 `external_patch_received`、`patch_rejected_out_of_scope`、`budget_exhausted`、`stall_detected`、`verify_blocked`，或命令运行异常 |
| `implement --fast` | 同 `implement` | 同 `implement` |
| `implement --from-handoff <path-or-session>` | replay context 已恢复，且本轮 outcome 满足 `implement` 成功条件 | handoff 不存在、不可回放、存在其它 active session、或本轮 outcome 满足 `implement` 失败条件 |
| `doctor v1` | V1 readiness 为 ready | V1 readiness 不 ready，或 doctor 运行失败 |

额外约定：

- `change --mode execute` 在 strict lane 遇到 open bootstrap draft 时，`execution.state = "awaiting_adopt"` 是设计内暂停，不算命令失败，退出码仍为 `0`。
- `change.default_mode: execute` 只改变未显式传入 `--mode` 的默认编排入口，不表示 JiSpec 生成业务代码，也不绕过 adopt 边界。
- `verify` 的 verdict 与退出码不是一一映射的多值关系；当前只有 `FAIL_BLOCKING` 会把退出码抬到 `1`。

## 4. 关键落盘文件

### 4.1 Bootstrap 与 Adopt

| 路径 | 何时出现 | 稳定语义 |
| --- | --- | --- |
| `jiproject/project.yaml` | `bootstrap init-project` 后，或 `bootstrap discover --init-project` 后 | 最小项目脚手架；用于消除缺失项目协议带来的 takeover 噪声 |
| `.spec/facts/bootstrap/evidence-graph.json` | `bootstrap discover` 后 | discover 的结构化 evidence graph 主产物，包含 routes/tests/schemas/documents/manifests/sourceFiles/excludedSummary |
| `.spec/facts/bootstrap/full-inventory.json` | `bootstrap discover` 后 | 非排除资产的完整机器底账，用于审计扫描范围，不作为默认 draft 主上下文 |
| `.spec/facts/bootstrap/adoption-ranked-evidence.json` | `bootstrap discover` 后 | 高信号接管证据包；默认供 draft、takeover brief 和人工 review 优先使用 |
| `.spec/facts/bootstrap/bootstrap-summary.md` | `bootstrap discover` 后 | 推荐的人类可读 discover 摘要，包含 top ranked evidence 与 excluded noise 摘要 |
| `.spec/facts/bootstrap/evidence-summary.txt` | `bootstrap discover` 后 | 兼容保留的 discover 可读摘要；新文档和人工入口应优先引用 `bootstrap-summary.md` |
| `.spec/sessions/<session-id>/manifest.json` | `bootstrap draft` 后 | draft / adopt session 的主状态文件，包含 providerName、generationMode 和 qualitySummary |
| `.spec/sessions/<session-id>/drafts/domain.yaml` | `bootstrap draft` 后 | domain draft |
| `.spec/sessions/<session-id>/drafts/api_spec.json` | `bootstrap draft` 后 | api draft |
| `.spec/sessions/<session-id>/drafts/behaviors.feature` | `bootstrap draft` 后 | feature draft |
| `.spec/contracts/domain.yaml` | adopt 选择 accept 或 edit 后 | 已接管 domain contract |
| `.spec/contracts/api_spec.json` | adopt 选择 accept 或 edit 后 | 已接管 api contract |
| `.spec/contracts/behaviors.feature` | adopt 选择 accept 或 edit 后 | 已接管 feature contract |
| `.spec/spec-debt/<session-id>/<artifact>.json` | adopt 选择 `skip_as_spec_debt` 后 | 暂缓接管但已登记的历史契约债务 |
| `.spec/handoffs/bootstrap-takeover.json` | adopt 产生 committed takeover 后 | takeover 汇总报告，供 verify / implement / demo 读取 |
| `.spec/handoffs/takeover-brief.md` | adopt 产生 committed takeover 后 | 人类可读 takeover decision packet，列出边界候选、已接管契约、spec debt、强证据、排除噪声和下一步动作 |
| `.spec/handoffs/adopt-summary.md` | adopt 产生 committed takeover 后 | 人类可读 adopt 决策摘要，列出 accepted、edited、rejected、deferred spec debt、人工修改点和下一步 verify 建议 |
| `.spec/greenfield/change-mainline-handoff.json` | Greenfield init 后 | 初始 slice queue 到 `change -> implement -> verify` 主线的机器可读 handoff，包含 first slice、review gate、change intent 和 next commands |
| `.spec/greenfield/change-mainline-handoff.md` | Greenfield init 后 | 人类可读 Greenfield change handoff，解释首个 slice、review gate 和下一步 change 命令 |

### 4.2 Bootstrap 产物语义

`evidence-graph.json`、`full-inventory.json`、`adoption-ranked-evidence.json`、`bootstrap-summary.md`、`evidence-summary.txt` 与 `bootstrap-takeover.json` 的路径和粗粒度语义属于 V1 稳定契约。它们可以新增字段，但不应静默改变已有字段的含义。

`full-inventory.json` 稳定包含：

- `version`
- `repoRoot`
- `generatedAt`
- `summary`
- `files`
- `excludedSummary`

`adoption-ranked-evidence.json` 稳定包含：

- `version`
- `repoRoot`
- `generatedAt`
- `summary`
- `evidence`
- `excludedSummary`

每条 `evidence[]` 稳定包含：

| 字段 | 类型 | 语义 |
| --- | --- | --- |
| `rank` | `number` | 排名，从 1 开始 |
| `kind` | `route \| schema \| document \| manifest \| test \| migration \| source` | 证据类型 |
| `path` | `string` | 主要证据路径或路由路径 |
| `score` | `number` | 业务语义权重分数 |
| `reason` | `string` | 排名原因摘要 |
| `source` | `string` | 来源集合，例如 `bootstrap.schemas` |
| `confidenceScore` | `number` 可选 | 原始证据置信度 |
| `sourceFiles` | `string[]` | 支撑该证据的文件 |
| `metadata` | `object` 可选 | 可扩展归一化元数据 |

P1-T2 之后，`metadata.boundarySignal` 可用于解释 adoption ranking 的边界优先语义。当前已知值包括：

- `governance_document`
- `protocol_document`
- `schema_truth_source`
- `explicit_endpoint`
- `service_entrypoint`
- `module_surface_inference`
- `weak_candidate`
- `runtime_manifest`
- `supporting_evidence`

这些值用于帮助 draft、takeover brief 和人工 review 区分强边界证据与弱候选；它们是 metadata 扩展，不改变 V1 既有字段含义。

`takeover-brief.md` 和 `adopt-summary.md` 是人类决策包，不是机器 API。机器消费者应读取 `.spec/handoffs/bootstrap-takeover.json`。

Greenfield 初始化后的 `.spec/greenfield/change-mainline-handoff.json` 是机器 API；它只生成可追溯的 change intent 和执行中介入口，不表示 JiSpec 自动实现业务代码。首个 slice 进入 `change` 后，dirty graph / verify focus 会成为后续 implementation mediation 的约束输入。

### 4.3 Policy、Verify 与 CI

| 路径 | 何时出现 | 稳定语义 |
| --- | --- | --- |
| `.spec/policy.yaml` | `policy migrate` 后 | verify 默认读取的 policy 文件 |
| `.spec/handoffs/verify-summary.md` | `verify` 后 | 本地 verify 的人类可读摘要，解释 verdict、是否可合并、blocking/advisory/debt 和下一步动作 |
| `<facts-out 指定路径>` | `verify --facts-out <path>` 后 | 当前 canonical facts snapshot |
| `.jispec-ci/verify-report.json` | `ci:verify` 后 | CI 机器可读报告主产物 |
| `.jispec-ci/ci-summary.md` | `ci:verify` 后 | CI 可读摘要主产物 |
| `.jispec-ci/verify-summary.md` | `ci:verify` 后 | CI verify 的人类可读决策摘要，与本地 verify summary 使用同一语言 |

### 4.4 Change 与 Implement

| 路径 | 何时出现 | 稳定语义 |
| --- | --- | --- |
| `.jispec/change-session.json` | `change` 后 | 当前 active change session |
| `.jispec/change-sessions/<change-session-id>.json` | successful post-implement verify 后 | 已归档的 change session |
| `.jispec/change-default-mode-history.jsonl` | `change default-mode set/reset` 后 | execute-default 项目开关审计记录；每行包含 timestamp、previousMode、nextMode、source、可选 actor/reason 和 readiness 摘要 |
| `.jispec/handoff/<change-session-id>.json` | implement 出现 `budget_exhausted`、`stall_detected`、`verify_blocked`、`patch_rejected_out_of_scope` 或未验证成功的 `external_patch_received` 时 | implementation mediation handoff packet；包含 next action owner、failed check、next command、聚焦 external tool handoff request 和 replay state |
| `.jispec/handoff/adapters/<change-session-id>/<tool>-request.json` | `handoff adapter --from-handoff <path-or-session> --tool <tool>` 后 | 外部 coding tool focused request packet；遵循 `schemas/implementation-handoff.schema.json`，声明 `integrationContractVersion: 1`，只改变请求格式，patch 必须回到 `implement --external-patch` |
| `.jispec/implement/<change-session-id>/patch-mediation.json` | `implement --external-patch <path>` 后 | 外部 patch 的 scope、apply、test 和 verify 审计记录 |
| `.spec/integrations/scm/<provider>-scm_comment.json` | `integrations payload --provider github|gitlab --kind scm_comment` 后 | SCM PR/MR comment preview；遵循 `schemas/integration-payload.schema.json`，引用本地 verify、waiver、spec debt、handoff artifact refs，不替代 verify |
| `.spec/integrations/issues/<provider>-issue_link.json` | `integrations payload --provider jira|linear --kind issue_link` 后 | issue link preview；遵循 `schemas/integration-payload.schema.json`，包含 change intent backfill、labels 和本地 artifact refs，不执行云端写入 |

Bootstrap discover、takeover brief、adopt summary、verify summary、release summary、Console actions 和格式化后的 implementation handoff 都共享同一套人类首屏 `Decision Snapshot`：current state、risk、evidence、owner、next command。Markdown/text 是 companion artifact，不作为机器 API；自动化仍读取表中对应 JSON/YAML/JSONL/lock artifact。

### 4.5 Release / Baseline

| 路径 | 何时出现 | 稳定语义 |
| --- | --- | --- |
| `.spec/baselines/releases/<version>.yaml` | `release snapshot --version <version>` 后 | 冻结的 release baseline，包含当前 baseline、contract graph 引用、static collector manifest 引用和 policy snapshot |
| `.spec/releases/<version>/release-summary.md` | `release snapshot --version <version>` 后 | 人类可读 release baseline 摘要，包含 counts、spec debt、contract graph、static collector 和 policy 概览 |
| `.spec/releases/<version>/contract-graph.json` | release snapshot 能构建 contract graph 时 | release 时刻的 canonical deterministic contract graph |
| `.spec/releases/<version>/contract-graph.lock` | release snapshot 能构建 contract graph 时 | Merkle Contract DAG lock，用于 release compare 判定 contract graph drift |
| `.spec/releases/<version>/static-collector-manifest.json` | `release snapshot --version <version>` 后 | release 时刻的 deterministic static collector manifest |
| `.spec/releases/compare/<from>-to-<to>/compare-report.json` | `release compare --from <ref> --to <ref>` 后 | 机器可读 compare artifact，包含 `driftSummary`，可供未来 Console 只读消费 |
| `.spec/releases/compare/<from>-to-<to>/compare-report.md` | `release compare --from <ref> --to <ref>` 后 | 人类可读 compare report，包含短 drift summary 和详细 graph/baseline diff |
| `.spec/releases/drift-trend.json` | `release compare --from <ref> --to <ref>` 后刷新 | 机器可读 release drift trend，按 compare report 汇总 overall、contract graph、static collector、behavior 和 policy drift 历史 |
| `.spec/releases/drift-trend.md` | `release compare --from <ref> --to <ref>` 后刷新 | 人类可读 drift trend 摘要；不作为自动化解析契约 |
| `.spec/console/governance-snapshot.json` | `console export-governance` 后 | Repo 级 governance snapshot，供未来多 repo Console 汇总 policy、waiver、debt 和 drift；包含 multi-repo snapshot contract version 1 |
| `.spec/console/governance-snapshot.md` | `console export-governance` 后 | Repo 级 governance snapshot 摘要；不作为自动化解析契约 |

`driftSummary` 稳定区分三类漂移：

| 类别 | 语义 |
| --- | --- |
| `contract_graph_drift` | contract graph / Merkle DAG 层面的节点、边、闭包、覆盖关系或 root hash 变化 |
| `static_collector_drift` | deterministic static collector 看到的实现事实、未解析 surface 或 manifest 内容变化 |
| `behavior_drift` | behavior scenarios、behavior graph nodes 或 scenario coverage 的变化 |
| `policy_drift` | verify policy 的路径、内容 hash、facts contract 或 rule id 集合变化 |

这些 release/baseline JSON 产物可以新增字段，但 Console 和 CI 不应解析 Markdown；Markdown 只作为人类 companion artifact。

P3-T2 后，`release compare` 会维护 `.spec/releases/drift-trend.json`。趋势文件不重新执行 compare，也不替代 release gate；它只汇总已经写出的 compare reports，让 Console 可以只读展示 contract graph drift、static collector drift、behavior drift 和 policy drift 的历史变化。

P3-T3 后，`console export-governance` 会写出 repo 级 governance snapshot，供未来多仓 Console 汇总。这个导出只聚合本地治理对象，不扫描源码、不执行 verify，也不改变任何 gating 语义。

M7-T1 后，`console aggregate-governance` 的 JSON 会保留显式缺失的 snapshot 输入：`summary.missingSnapshotCount` 计数，`missingSnapshots[]` 记录 `inputPath`、`resolvedPath` 和 `snapshot_not_found`。因此多仓治理不会把缺 snapshot 的仓库静默当作不存在。

### 4.6 Console Read Model Contract

P4-T1 固定了未来 JiSpec Console 可以只读读取的本地产物集合；P2-T1 在此基础上增加团队治理对象域模型；P2-T2 启用本地 audit event ledger；P2-T3 增加只读治理 dashboard shell；P2-T4 增加只读治理 action planner。详见 [docs/console-read-model-contract.md](/D:/codeSpace/JiSpec/docs/console-read-model-contract.md)。代码级契约位于 `tools/jispec/console/read-model-contract.ts`，本地聚合入口位于 `tools/jispec/console/read-model-snapshot.ts`，治理台入口位于 `tools/jispec/console/governance-dashboard.ts`，动作建议入口位于 `tools/jispec/console/governance-actions.ts`。

稳定边界：

- Console read model 只读取本地 JiSpec artifacts，不替代 `verify`、`ci:verify`、policy evaluation 或 release compare。
- Console read model 不要求上传源码；缺失 artifact 应显示为 `not available yet`，而不是扫描源码自行推断。
- JSON、YAML、JSONL 和 lock 文件可作为机器输入；Markdown 只作为 human companion artifact 展示，不作为自动化解析契约。
- 当前承诺的核心读取面包括 verify report、verify summary、CI summary、policy、waiver records、verify baseline、Greenfield current baseline、spec debt ledger、release baseline、release compare report、release drift trend、retakeover metrics、implementation handoff/patch mediation records 和 audit event ledger。
- Console governance snapshot 聚合九类对象：policy posture、waiver lifecycle、spec debt ledger、contract drift、release baseline、verify trend、takeover quality trend、implementation mediation outcomes 和 audit events。缺失对象必须显示为 `not_available_yet`。
- Audit event ledger 使用 `.spec/audit/events.jsonl`，每条事件包含 actor、reason、timestamp、source artifact 和 affected contract；它只提供治理追溯，不参与 blocking gate。
- `jispec-cli console dashboard` 的第一屏是治理状态，围绕 mergeability、waiver、spec debt、contract drift、execute mediation 和 audit traceability 组织；它不上传源码、不运行 verify、不覆盖 `ci:verify` 结论。
- `jispec-cli console actions` 只生成本地 CLI 动作建议和决策包，不执行命令、不写 artifact；实际写入仍必须经过 `waiver`、`spec-debt`、`policy`、`release` 等本地 CLI 命令并留下 audit event。

## 5. Verify JSON 契约

`npm run jispec-cli -- verify --json` 是当前 V1 主线唯一明确对外承诺的稳定 stdout 机器可读命令面。

Waiver 只是一种可审计 mitigation，不是永久忽略规则。匹配到的 waiver 会把对应 issue 降级为 advisory，并在 issue details 中记录 `matched_by = "waiver"`、`waiver_id`、`waiver_owner`、`waiver_reason` 和 `waiver_matcher`；未匹配的新 blocking issue 仍保持 blocking。Verify metadata 中的 `waiverLifecycle` 汇总 active、expired、revoked、invalid waiver，`unmatchedActiveWaiverIds` 暴露当前没有匹配任何 issue 的 active waiver。

### 5.1 顶层字段

顶层 JSON 字段顺序固定为：

1. `root`
2. `verdict`
3. `ok`
4. `exit_code`
5. `issue_count`
6. `blocking_issue_count`
7. `advisory_issue_count`
8. `non_blocking_error_count`
9. `sources`
10. `generated_at`
11. `issues`
12. `metadata`

### 5.2 顶层字段语义

| 字段 | 类型 | 语义 |
| --- | --- | --- |
| `root` | `string` | verify 所针对的仓库根目录 |
| `verdict` | `PASS \| FAIL_BLOCKING \| WARN_ADVISORY \| ERROR_NONBLOCKING` | 稳定四态 verdict |
| `ok` | `boolean` | 是否可视为 non-blocking |
| `exit_code` | `0 \| 1` | 当前 verify 命令退出码 |
| `issue_count` | `number` | 全部 issue 数量 |
| `blocking_issue_count` | `number` | blocking issue 数量 |
| `advisory_issue_count` | `number` | advisory issue 数量 |
| `non_blocking_error_count` | `number` | nonblocking runtime error 数量 |
| `sources` | `string[]` | 本次 verify 使用的 issue source 列表 |
| `generated_at` | `string` | ISO 8601 时间戳 |
| `issues` | `array` | 稳定排序后的 issue 列表 |
| `metadata` | `object` | 附加上下文，例如 facts contract、policy、baseline、waiver、observe、lane 等 |

### 5.3 Issue 字段

每个 `issues[]` 元素稳定包含：

| 字段 | 类型 | 语义 |
| --- | --- | --- |
| `kind` | `schema \| trace \| semantic \| missing_file \| unsupported \| runtime_error` | issue 类别 |
| `severity` | `blocking \| advisory \| nonblocking_error` | issue 严重级别 |
| `code` | `string` | 稳定 issue code |
| `path` | `string` 可选 | 对应文件或逻辑路径 |
| `message` | `string` | 可读说明 |
| `details` | `unknown` 可选 | 附加上下文 |

### 5.4 稳定性说明

- `verdict` 枚举值稳定。
- 顶层 key 顺序稳定。
- `issues` 会按稳定排序规则输出。
- `metadata` 是允许扩展的区域；可以新增字段，但已有语义不会被静默改写。

## 6. CI Artifacts 契约

`npm run ci:verify` 当前稳定保证的本地产物包括：

| 路径 | 类型 | 语义 |
| --- | --- | --- |
| `.jispec-ci/verify-report.json` | JSON | CI 机器可读验证报告 |
| `.jispec-ci/ci-summary.md` | Markdown | CI 可读摘要 |
| `.jispec-ci/verify-summary.md` | Markdown | 与本地 verify 对齐的人类决策摘要 |

`verify-report.json` 当前稳定包含：

- `version`
- `generatedAt`
- `verdict`
- `ok`
- `counts`
- `issues`
- `factsContractVersion`
- `matchedPolicyRules`
- `modes`
- `context`
- `links`

Provider-specific 附加产物属于“有环境时可用”的补充契约：

| 环境 | 可额外出现的文件 |
| --- | --- |
| GitHub Actions | `.jispec-ci/github-pr-comment.md` |
| GitLab CI | `.jispec-ci/gitlab-mr-note.md` |

这些 provider-specific 文件是受支持能力，但不替代 `.jispec-ci/verify-report.json`、`.jispec-ci/ci-summary.md` 与 `.jispec-ci/verify-summary.md` 这些主产物。

`verify-summary.md` 是人类 companion artifact，不是机器 API。机器消费者仍应读取 `verify --json` stdout 或 `.jispec-ci/verify-report.json`。

## 7. Policy 默认路径契约

policy 默认路径固定为：

`.spec/policy.yaml`

稳定规则：

- `verify` 在该文件存在时会自动加载它。
- `policy migrate` 默认写到该路径。
- `verify --policy <path>` 可以覆盖默认路径，但这不改变默认契约。

当前 policy YAML 的稳定最小面包括：

```yaml
version: 1
requires:
  facts_contract: "1.0"
team:
  profile: small_team
  owner: <owner>
  reviewers:
    - <reviewer>
  required_reviewers: 1
waivers:
  require_owner: true
  require_reason: true
  require_expiration: true
  max_active_days: 60
  expiring_soon_days: 14
  unmatched_active_severity: advisory
release:
  require_snapshot: true
  require_compare: true
  drift_requires_owner_review: true
  policy_drift_severity: advisory
  static_collector_drift_severity: advisory
  behavior_drift_severity: advisory
  contract_graph_drift_severity: blocking
execute_default:
  allowed: true
  require_policy: true
  require_clear_adopt_boundary: true
  require_clean_verify: false
  max_cost_usd: 5
  max_iterations: 10
rules:
  - id: require-behavior-contract
    enabled: true
    action: warn
    message: Behavior contract is missing
    when:
      all:
        - fact: contracts.behavior.present
          op: "=="
          value: false
        - fact: contracts.behavior.deferred
          op: "=="
          value: false
```

M5-T1 后，`contracts.behavior.deferred` 是稳定 facts contract 的一部分。它表示 behavior contract 没有被 adoption 接管为 `.spec/contracts/behaviors.feature`，但已经被明确延期到 bootstrap spec debt 且 debt record 仍存在。默认 `require-behavior-contract` 规则只在 behavior contract 既未接管、也未显式延期时提示缺失；已延期 behavior debt 仍会通过 `BOOTSTRAP_SPEC_DEBT_PENDING` 暴露为 owner-review advisory。

`team.profile` 当前支持 `solo`、`small_team`、`regulated`。P3-T1 后，`policy migrate --profile <profile>` 会按 profile 补齐 owner/reviewer、waiver、release 和 execute-default 默认治理姿态：`solo` 更宽松、`small_team` 要求 1 名 reviewer、`regulated` 要求 2 名 reviewer 且 execute-default 需要 clean verify。T0-2 后，`policy migrate --owner <owner> --reviewer <reviewer>` 可显式写入 accountable owner 和 reviewer posture。新增 profile / owner / reviewer 字段只描述治理姿态；除既有 policy rules 和 facts contract 校验外，不会隐式改变 verify 的确定性执行方式。

Policy migration 会把已知 deprecated key 迁到当前结构：

| Deprecated key | Replacement |
| --- | --- |
| `facts_contract` | `requires.facts_contract` |
| `requires.factsContract` | `requires.facts_contract` |
| `team_profile` | `team.profile` |
| `waiver_policy` | `waivers` |
| `release_policy` | `release` |
| `executeDefault` | `execute_default` |

稳定错误行为：

| 场景 | 行为 |
| --- | --- |
| unknown fact | `verify` 产生 nonblocking `POLICY_UNKNOWN_FACT` |
| unknown policy key | `verify` 产生 nonblocking `POLICY_UNKNOWN_KEY` |
| deprecated policy key | `verify` 产生 nonblocking `POLICY_DEPRECATED_KEY`，并在 details 中给出 replacement |
| blocking rule 使用 unstable fact | `verify` 产生 nonblocking `POLICY_BLOCKING_RULE_USES_UNSTABLE_FACT` |

## 8. Change / Implement 串联语义

当前主线固定支持双模式：

- `prompt`
- `execute`

稳定语义如下：

| 模式 | 稳定语义 |
| --- | --- |
| `change --mode prompt` | 只记录 change session、lane 和 next commands，不自动执行 implement |
| `change --mode execute` | 尝试自动进入 `implement -> verify`，但在 strict lane 存在 open bootstrap draft 时必须停在 adopt 边界 |
| `change.default_mode: execute` | 当前项目默认值；doctor v1 会报告 execute-default mediation readiness，显式 `--mode prompt` 仍可降级 |
| `change default-mode show\|set\|reset` | 受控管理 `change.default_mode`，并为 set/reset 写入 `.jispec/change-default-mode-history.jsonl` |

`doctor v1` 的 `Execute-Default Mediation Readiness` 检查会以人类决策包语言说明当前默认模式、mode 来源、是否建议使用 execute-default、open bootstrap draft adopt 边界、前置条件、blocker、warning 和 owner action。这个 readiness 只判断是否可以把 `change` 默认入口切到 implementation mediation，不表示 JiSpec 会自动生成业务代码。

`change default-mode set execute` 在写入配置前会检查四类 blocker：`.spec/policy.yaml` 缺失或无效、当前 `verify --json` blocking、项目 `change.default_mode` 配置损坏、external patch mediation/handoff 面不完整。open bootstrap draft 不阻止切换，但会输出 adopt-boundary warning，并要求 strict-lane 变更先执行 `adopt --interactive --session <id>`。

当前仓库已把默认入口切到 `execute`。`prompt` 与 `execute` 仍继续同时保留；显式 `--mode prompt` 是人工暂停和降级路径。

## 9. 回归矩阵

统一回归矩阵入口固定为：

```bash
node --import tsx ./tools/jispec/tests/regression-runner.ts
```

该 runner 覆盖 V1 主线、bootstrap takeover hardening、verify/CI gates、change/implement 串联，以及延后但仍需回归的 runtime surfaces。

Bootstrap takeover hardening 区域必须持续覆盖：

| 任务 | 回归套件 |
| --- | --- |
| Task 1 Bulletproof Exclusion Policy | `bootstrap-discover-exclusion-policy.ts` |
| Task 2 Separate Full Inventory From Adoption Evidence | `bootstrap-adoption-ranked-evidence.ts` |
| Task 3 Business-Semantic Evidence Scoring | `bootstrap-evidence-ranking-score.ts` |
| Task 4 Domain Re-Anchoring | `bootstrap-draft-domain-reanchoring.ts` |
| Task 5 Feature Scenario Synthesis / P1-T3 Feature Confidence Gate | `bootstrap-draft-feature-scenarios.ts` and `bootstrap-feature-confidence-gate.ts` |
| Task 6 API Surface Classification | `bootstrap-api-surface-classification.ts` |
| Task 7 Takeover Brief Decision Packet / P1-T4 Adopt Summary | `bootstrap-takeover-brief.ts` and `bootstrap-adopt-handoff.ts` |
| Task 8 Explicit Project Scaffold | `bootstrap-init-project.ts` |
| Task 9 BYOK Semantic Re-Anchoring | `bootstrap-draft-mock.ts` |
| Task 10 Documentation And Regression Matrix / P1-T6 Bootstrap Summary Naming | `bootstrap-discover-smoke.ts`, `bootstrap-adoption-ranked-evidence.ts`, `regression-runner.ts` area summary and this stable-contract section |

## 10. AI / LLM 边界规则

LLM 可以辅助 draft、explanation 和 repair，但不能成为 blocking gate 的判定源。

稳定规则：

- `bootstrap draft` 在无 provider 时必须完全可用。
- BYOK provider 只能做语义重锚和人类可读内容改善。
- Provider 输出中的 `relativePath`、`sourceFiles`、`confidenceScore`、`provenanceNote` 不具备权威性；这些字段由 deterministic baseline 保留。
- Provider 不可用、异常或 malformed output 时，draft 必须安全回退到 deterministic generation，并记录 `generationMode = "provider-fallback"`。
- `verify`、`ci:verify`、policy evaluation、schema validation 和未来 AST-backed blocking checks 必须保持 deterministic。

## 11. 当前明确不做什么

下面这些能力当前不属于 V1 主线稳定契约：

- `JiSpec-Console` 的完整 UI / 治理面
- 分布式执行、远程缓存、presence、多人协作的新产品承诺
- 把 LLM 直接放进 verify blocking path
- 用 legacy `slice/context` 兼容层替代主线 CLI 作为产品入口
- 为了扩展远期能力而改写当前主线退出码语义
- 把除 `verify --json` 外的所有 JSON 输出都宣称为同等级外部 API

换句话说，V1 主线当前承诺的是：

- 可以 bootstrap 一个老仓库
- 可以产生第一批可审契约草稿
- 可以 adopt / defer / reject 这些草稿
- 可以通过 verify 和 ci:verify 获得稳定 gate
- 可以通过 change / implement 完成提示式或执行式串联

它还没有承诺：

- console 级团队工作台已经完成
- distributed / collaboration / presence 已进入 V1 收口
- LLM blocking orchestration 已经成为默认 gate 路径

### 11.1 Collaboration Surface Freeze

P4-T2 固定了 collaboration / presence / distributed 的冻结边界，详见 [docs/collaboration-surface-freeze.md](/D:/codeSpace/JiSpec/docs/collaboration-surface-freeze.md)。代码级契约位于 `tools/jispec/runtime/deferred-surface-contract.ts`。

稳定规则：

- distributed execution、collaboration workspace 和 presence awareness 仍是 `deferred` surface。
- 这些 surface 的回归测试只允许保留在 `runtime-extended` 区域，用于防止已有实验腐化。
- `doctor runtime` 可以继续诊断这些 surface；`doctor v1` 不得让它们参与 V1 readiness；`doctor pilot` 也不得把它们当作试点 readiness gate。
- 它们不得替代或覆盖 `verify`、`ci:verify`、policy evaluation、waiver lifecycle、release compare 或 implementation mediation。
- 任何 future promotion 都必须显式更新冻结契约、稳定契约和主线验收标准。

### 11.2 North Star Acceptance

M7-T5 增加最终本地验收套件 `north-star acceptance`。它写出 `.spec/north-star/acceptance.json`、`.spec/north-star/acceptance.md`，以及逐场景 machine artifact 和 human decision packet，用来证明 legacy takeover、Greenfield、daily change、external patch mediation、policy waiver、release drift、Console governance、multi-repo aggregation 和 privacy report 已经形成同一条本地交付主线。

稳定规则：

- `north-star acceptance` 只读取和写出本地 JiSpec artifacts，不上传源码。
- LLM 输出不得成为这个套件的 blocking decision source。
- 它不替代 `verify`、`ci:verify`、`doctor v1`、`doctor runtime`、`doctor pilot` 或 `post-release:gate`；这些 gate 继续保留原有权威性。
- Markdown decision packet 是人类 companion；机器消费者读取 JSON artifact。

## 12. 相关文档

- 北极星：
  [docs/north-star.md](/D:/codeSpace/JiSpec/docs/north-star.md)
- 最小接入样板：
  [docs/v1-sample-repo.md](/D:/codeSpace/JiSpec/docs/v1-sample-repo.md)
- Greenfield 输入契约：
  [docs/greenfield-input-contract.md](/D:/codeSpace/JiSpec/docs/greenfield-input-contract.md)
- Console read model contract：
  [docs/console-read-model-contract.md](/D:/codeSpace/JiSpec/docs/console-read-model-contract.md)
- Collaboration surface freeze：
  [docs/collaboration-surface-freeze.md](/D:/codeSpace/JiSpec/docs/collaboration-surface-freeze.md)
- North Star acceptance：
  [docs/north-star-acceptance.md](/D:/codeSpace/JiSpec/docs/north-star-acceptance.md)
- v0.1.0 发布说明：
  [docs/releases/v0.1.0.md](/D:/codeSpace/JiSpec/docs/releases/v0.1.0.md)
