# JiSpec 借鉴 Superpowers 的 Agent Discipline Layer 方案

日期：2026-05-02

## 结论

JiSpec 已经拥有契约、`verify`、CI、policy、baseline、waiver、审计和回放。它解决的是“交付结果是否可信”。Superpowers 最值得借鉴的是另一层能力：让 AI 在写代码前、写代码中、调试时、完成前都必须经过可检查的步骤。它解决的是“做事过程是否规矩”。

因此 JiSpec 不应该把 Superpowers 照搬成一组提示词或 agent 习惯，而应该把它收束成一个本地优先、机器可读、可审计的 `Agent Discipline Layer`。

目标是：

```text
让 AI 交付不只在最后被 verify 拦住，而是在每个关键动作前后都有 phase、scope、evidence、test、debug、completion 约束。
```

## 定位

`Agent Discipline Layer` 是 JiSpec 的过程纪律层，位于 `change -> implement -> verify` 主线之间。

它不替代：

- `verify`
- `ci:verify`
- policy
- baseline
- waiver
- release compare
- implementation handoff
- external patch mediation

它新增的是：

- 阶段约束
- 测试优先约束
- 调试路径约束
- 完成证据约束
- 事实来源约束
- 工作隔离约束
- review 纪律约束

核心原则：

```text
不要相信 AI 说自己很规矩；让规矩变成 artifact，再由 JiSpec 检查 artifact。
```

## 总体工作流

推荐方向：

```text
change
  -> discipline preflight
  -> implement / external patch mediation
  -> discipline completion check
  -> verify
  -> ci:verify
```

可选产物：

```text
.jispec/agent-run/<session-id>/session.json
.jispec/agent-run/<session-id>/discipline-report.json
.jispec/agent-run/<session-id>/discipline-summary.md
.jispec/agent-run/<session-id>/debug-packet.md
.jispec/agent-run/<session-id>/completion-evidence.json
```

这些产物只提供过程证据和 advisory / gating hints。最终 blocking authority 仍由现有 deterministic gate 决定。

## 能力 1：硬阶段门禁

### 借鉴点

Superpowers 明确区分 brainstorming、planning、implementation、debugging、verification。它的强项是防止 agent 在需求不清、计划未定、验证缺失时直接动手。

### JiSpec 要做什么

JiSpec 应该把 agent run 拆成明确阶段，并记录每个阶段允许做什么、已经完成什么、下一步是什么。

建议阶段：

| 阶段 | 目的 | 允许动作 |
| --- | --- | --- |
| `intent` | 记录变更目的和 owner intent | 读取上下文、生成 change session |
| `design` | 明确契约、范围、风险和成功条件 | 写设计说明、绑定 truth source |
| `plan` | 拆执行步骤和验证策略 | 写 implementation plan、测试计划 |
| `implement` | 接入外部实现或 patch mediation | 修改允许范围内的文件、记录 patch |
| `debug` | 系统化处理失败 | 复现、定位、验证假设 |
| `verify` | 执行完成前验证 | 跑 test / typecheck / verify |
| `handoff` | 输出下一步和完成证据 | 写 handoff / summary |

### 怎么做

- 在 `change` 或 `implement` 开始时创建 `.jispec/agent-run/<session-id>/session.json`。
- 每次阶段切换追加记录：actor、timestamp、source command、allowed next phases、truth sources。
- strict lane 要求 `plan` 或等价 handoff 存在后才能进入 implementation mediation。
- fast lane 可以降级，但必须在 summary 中明确 `disciplineMode: fast_advisory`。

### 怎么验证

- fixture：缺少 `plan` 阶段时，strict implementation preflight 给出 discipline warning 或 blocker。
- fixture：阶段顺序非法，例如 `intent -> implement -> done`，应被记录为 `phase_order_invalid`。
- fixture：fast lane 可以继续，但报告必须包含降级原因。
- 回归测试应覆盖阶段恢复：从 handoff replay 时能恢复上一次 stop point 和 phase。

### 非目标

- 不把阶段门禁做成人工流程负担。
- 不要求所有小改动都有长篇设计。
- 不让阶段文档替代 `verify` 结果。

## 能力 2：TDD 优先

### 借鉴点

Superpowers 的 TDD 能力要求先明确失败测试或验证目标，再写实现。它降低了“先改代码再找理由”的概率。

### JiSpec 要做什么

JiSpec 不一定强制所有项目都写单元测试，但应该强制每次实现前有测试或验证策略。

验证策略可以是：

- unit test
- integration test
- fixture
- schema validation
- contract scenario
- `verify --fast`
- `verify`
- 手工 owner review，且必须登记为 waiver / spec debt / advisory

### 怎么做

- 在 discipline preflight 中要求 `testStrategy`。
- `testStrategy` 至少包含 command、scope、expected signal、why sufficient。
- 对 contract-critical change，strict lane 要求至少一个 deterministic command。
- 无法自动测试时，必须产生 `ownerReviewRequired: true`，不能静默当作完成。

### 怎么验证

- fixture：contract-critical change 没有 test strategy，strict lane 阻止进入 completion。
- fixture：文档-only change 可以使用 verify-only 策略。
- fixture：无法自动测试的 UI/流程变更必须进入 owner review，而不是 pass。
- 回归矩阵新增 `agent-discipline-tdd.ts`，覆盖测试策略的强弱分级。

### 非目标

- 不把 TDD 绝对化成“必须先写某个测试文件”。
- 不要求 JiSpec 生成业务测试代码。
- 不让 LLM 声称“已人工检查”成为 deterministic evidence。

## 能力 3：系统化调试

### 借鉴点

Superpowers 的 debugging 强调先复现、再定位、再提出假设、再最小修改、再验证。它反对无证据的反复试错。

### JiSpec 要做什么

当 test、typecheck、scope check、patch apply 或 verify 失败时，JiSpec 应该产出 debug packet，记录失败证据和下一步，而不是只输出失败日志。

### 怎么做

在 `.jispec/agent-run/<session-id>/debug-packet.md` 和 JSON 中记录：

- failed command
- exit code
- failing check
- minimal reproduction command
- observed evidence
- current hypothesis
- files likely involved
- next allowed action
- retry command

如果连续失败，应记录 repeated failure count，并在达到阈值后进入 `stall_detected` 或 `needs_owner_review`。

### 怎么验证

- fixture：测试失败后生成 debug packet。
- fixture：连续两次同类失败时，packet 能显示 repeated failure。
- fixture：debug packet 必须引用真实命令和 source artifact。
- fixture：没有复现命令的 debug packet 应标记为 incomplete。

### 非目标

- 不让 debug packet 自动诊断根因。
- 不把 LLM 假设当成事实。
- 不用 debug packet 覆盖 handoff packet。

## 能力 4：完成前验证

### 借鉴点

Superpowers 的 verification-before-completion 要求 agent 在声称完成之前必须提供真实验证证据。

### JiSpec 要做什么

JiSpec 应该禁止“没有证据的 done”。任何 completion / handoff / adapter request 都必须带 completion evidence。

### 怎么做

新增 `.jispec/agent-run/<session-id>/completion-evidence.json`，建议字段：

```json
{
  "schemaVersion": 1,
  "sessionId": "change-123",
  "status": "ready_for_verify",
  "commands": [
    {
      "command": "npm run typecheck",
      "exitCode": 0,
      "ranAt": "2026-05-02T00:00:00.000Z",
      "evidenceKind": "typecheck"
    }
  ],
  "verifyCommand": "npm run verify",
  "verifyVerdict": "PASS",
  "missingEvidence": [],
  "truthSources": [
    ".jispec/handoff/change-123.json",
    ".spec/handoffs/verify-summary.md"
  ]
}
```

Completion status 建议：

- `incomplete`
- `ready_for_verify`
- `verified`
- `verified_with_advisory`
- `blocked`
- `owner_review_required`

### 怎么验证

- fixture：没有 completion evidence 时，handoff summary 不得显示 ready。
- fixture：命令失败时，completion status 必须是 `blocked` 或 `owner_review_required`。
- fixture：`verify` 为 `WARN_ADVISORY` 时可以是 `verified_with_advisory`，并列出 advisory。
- fixture：summary 中的完成声明必须能追溯到 JSON evidence。

### 非目标

- 不重复实现 CI。
- 不把 Markdown summary 作为机器事实。
- 不允许 agent 手写伪造命令结果作为 evidence。

## 能力 5：事实来源约束

### 借鉴点

Superpowers 的流程精神是不要依靠模型记忆。对 JiSpec 来说，这可以进一步确定性化：关键判断必须有 source path、artifact 或 command evidence。

### JiSpec 要做什么

所有 discipline report 中的关键断言都要标注事实来源和置信姿态。

建议 provenance：

- `EXTRACTED`
- `INFERRED`
- `AMBIGUOUS`
- `OWNER_REVIEW`
- `UNKNOWN`

这与 JiSpec 已经从 GitNexus / Graphify 借鉴来的 evidence provenance 语言保持一致。

### 怎么做

- 所有 plan、debug、completion、review 断言都可以引用 `truthSources`。
- 无来源的断言不得成为 blocking 依据。
- `INFERRED` 只能进入 advisory / owner review。
- 外部工具输出必须标记 provider、generatedAt、freshness 和 sourcePath。

### 怎么验证

- fixture：completion report 中存在无 source 的 critical claim，应降级为 `UNKNOWN` 或 `OWNER_REVIEW`。
- fixture：LLM inferred claim 不得制造 blocking issue。
- fixture：外部 graph / external coding tool evidence 必须有 provider 和 freshness。
- schema 测试验证 truth source 字段稳定。

### 非目标

- 不要求所有自然语言句子都有引用。
- 不把 provenance 打标变成复杂知识图谱。
- 不让外部工具输出直接进入 blocking gate。

## 能力 6：工作隔离

### 借鉴点

Superpowers 强调隔离工作区、保护用户改动、避免 agent 越界。JiSpec 已经有 allowed paths、external patch mediation、dirty graph 和 handoff 边界，可以继续强化。

### JiSpec 要做什么

每次实现尝试都应该清楚说明：

- 允许修改哪些路径
- 实际修改哪些路径
- 是否触碰未授权文件
- 是否存在用户未处理改动
- 是否从 handoff 或 patch replay 恢复

### 怎么做

- 在 agent run session 中记录 `allowedPaths`、`touchedPaths`、`unexpectedPaths`。
- strict lane 对 unexpected paths 做 scope blocker。
- fast lane 可以 advisory，但必须在 completion evidence 中列出。
- external patch mediation 继续作为 returned patch 的唯一入口。

### 怎么验证

- fixture：patch 修改 allowed path 之外文件，应触发 `scope_check` stop point。
- fixture：dirty worktree 中有 unrelated user changes，不应被 JiSpec 要求回滚。
- fixture：replay handoff 保留上一轮 allowed paths。
- fixture：completion evidence 中 touched paths 与 patch mediation 一致。

### 非目标

- 不自动清理用户工作区。
- 不替用户执行 destructive git 操作。
- 不要求所有用户都必须使用 git worktree。

## 能力 7：代码评审纪律

### 借鉴点

Superpowers 的 requesting-code-review 和 receiving-code-review 能力要求改动完成后主动接受 review，并把反馈当作待验证的技术判断，而不是表演式同意。

### JiSpec 要做什么

JiSpec 应该把 review discipline 纳入 handoff / companion：

- 改动目的是什么
- 影响哪些契约
- 跑了哪些测试
- 哪些风险没有覆盖
- 哪些是 advisory
- 哪些需要 owner decision
- reviewer 下一步看什么

### 怎么做

- 复用现有 decision companion section，不新增平行 Markdown。
- 在 implementation handoff 中增加 `reviewDiscipline` 段。
- 对 code review feedback，可记录 `feedbackId`、decision、accepted/rejected reason、verification command。
- reviewer companion 只做人工辅助，JSON/YAML 仍是 source of truth。

### 怎么验证

- fixture：handoff companion 包含 review discipline 固定章节。
- fixture：feedback 被接受后必须有对应验证命令或 owner review。
- fixture：feedback 被拒绝时必须记录技术理由和 truth source。
- fixture：review summary 不得覆盖 verify verdict。

### 非目标

- 不做通用 PR review 平台。
- 不让 JiSpec 代替 reviewer 做最终业务判断。
- 不把 Markdown comment 当作机器 API。

## 与现有 JiSpec 能力的关系

| 现有能力 | Discipline Layer 的关系 |
| --- | --- |
| `change` | 提供 intent、lane、scope 和 session id |
| `implement` | 读取 discipline preflight，写入 completion/debug evidence |
| external patch mediation | 继续作为外部实现进入 JiSpec 的边界 |
| `verify` | 保持最终 deterministic gate，同时读取 discipline evidence 生成 hints |
| `ci:verify` | 输出 discipline summary link，但不依赖 Markdown |
| audit ledger | 记录 phase transition、scope failure、completion evidence |
| replay | 从 handoff 恢复 phase、debug 和 completion 上下文 |
| Console read model | 只显示 discipline report 状态和路径，不解析 Markdown 作为 gate |

## 推荐实施顺序

### Phase 1：Completion Evidence

优先做完成前验证，因为它最直接减少虚假完成声明。

目标：

- 任何 handoff / completion 都带真实命令证据。
- 没有证据不得显示 ready。
- `WARN_ADVISORY` 与 `FAIL_BLOCKING` 有清楚区分。

### Phase 2：Phase Gate

把 agent run 拆成可记录阶段。

目标：

- strict lane 不能从 intent 直接跳到 done。
- fast lane 可继续，但必须降级标记。
- replay 能恢复 stop point。

### Phase 3：Test Strategy Discipline

把 TDD 精神落成测试策略契约。

目标：

- contract-critical change 必须有 deterministic verification。
- 无法自动验证的内容必须 owner review。

### Phase 4：Debug Packet

把失败处理从日志升级为可回放的 debug packet。

目标：

- 每个失败 stop point 都有复现命令、证据和下一步。
- 重复失败能进入 stall / owner review。

### Phase 5：Truth Source Discipline

统一 fact provenance。

目标：

- critical claim 都能追溯。
- inferred claim 不进入 blocking gate。

### Phase 6：Isolation Hardening

强化 allowed paths、touched paths 和 dirty worktree 姿态。

目标：

- 外部 patch 和本地 implementation 都不能越界静默通过。
- 用户已有改动不会被误删或误归因。

### Phase 7：Review Discipline

把 review 请求和反馈处理变成可追踪 companion。

目标：

- reviewer 能快速判断是否可合并。
- feedback 有采纳/拒绝理由和验证证据。

## 验收总标准

### 功能验收

- `change` 或 `implement` 至少一个入口能写出 agent run session artifact。
- completion evidence 能记录命令、退出码、verdict、truth sources。
- debug packet 能记录失败命令、stop point、复现命令和下一步。
- discipline report 能区分 strict gate、fast advisory 和 owner review。
- handoff / companion 能展示 discipline summary，但机器事实仍来自 JSON。

### 回归验收

- `npm run typecheck` 通过。
- `npm run verify` 不因缺少 discipline artifact 崩溃。
- `npm run ci:verify` 能继续写出既有 CI artifacts。
- regression runner 中新增 `agent-discipline` area 或纳入 `change-implement` area。
- 至少覆盖：phase gate、test strategy、debug packet、completion evidence、truth source、scope isolation、review discipline。

### 安全和隐私验收

- discipline artifact 不默认包含源码全文。
- shareable summary 进入 privacy redaction 覆盖范围。
- 外部工具输出必须标记 provider、sourcePath、freshness。
- 不联网、不上传源码、不执行外部工具，除非已有 explicit opt-in boundary。

### 产品验收

- README 或 V1 stable contract 能说明：JiSpec 不生成业务代码，只约束、记录、验证实现过程。
- 用户能从 summary 中看到：是否按阶段执行、跑了什么验证、哪里失败、下一步谁负责。
- 项目可以清楚表达：JiSpec 不只帮助团队“看清楚”和“验收通过”，还帮助团队“做事更规矩”。

## 后续工程计划输入

下一步详细工程计划应从本文拆出任务，至少覆盖：

- schema 设计
- artifact path 冻结
- CLI 接入点
- implement runner 接入点
- verify / ci summary 展示方式
- audit / replay 接入方式
- privacy redaction 覆盖
- regression matrix 更新

建议任务名：

```text
P10: Agent Discipline Layer
```

## P10 Implementation Contract

Status: implemented and final-gated on 2026-05-03.

Agent Discipline Layer writes process artifacts under `.jispec/agent-run/<session-id>/`.
These artifacts record phase, test strategy, debug, completion, truth-source, isolation, and review discipline evidence.
They are process evidence consumed by `verify`; strict discipline failures block through `verify`, while fast advisory discipline findings remain advisory. They do not replace `verify`, `ci:verify`, policy, baseline, waiver, audit, or replay.

Final P10 gate passed with `npm run typecheck`, `npm run verify`, `npm run ci:verify`, `npm run pilot:ready`, targeted P10 suites, affected suites, and regression manifest validation. The only repository-level verify advisory at closeout is the existing bootstrap spec debt item.

P10 的目标不是引入一个新的 agent 框架，而是把 Superpowers 的过程纪律转成 JiSpec 可以确定性检查、审计和回放的本地产物。
