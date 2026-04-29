# JiSpec V1 后北极星推进任务

日期：2026-04-29

这份任务安排承接已经发布的 V1 主线，目标不是立刻扩张产品面，而是继续把 JiSpec 推向北极星：

> 把 AI 编程从个人英雄主义的手工作坊，推进到可验证、可审计、可阻断、可回放的现代软件交付流水线。

排序原则：

- `core mainline first, surrounding surfaces second`
- 先让 takeover 和 gate 更强，再让 execute 成为默认姿态
- 机器产物保持完整，人类产物必须足够短、准、可决策
- JiSpec 只调度、约束、记录和验证实现行为，不作为业务代码实现主体
- Console、distributed、collaboration 在核心主线更稳之前只做 contract 预留，不作为当前阻断目标

## P0：发布后稳定与回归护栏

目标：确保 V1 发布后的每次推进都不会把已经证明的主线打散。

### P0-T1 固化 post-release gate

产物：

- 一份固定 release gate 清单，覆盖 `typecheck`、V1 golden path、`doctor v1`、regression runner 和 `ci:verify`
- 在后续任务文档和 PR checklist 中统一引用这组 gate
- 固定入口：`npm run post-release:gate`

验收：

```text
npm run post-release:gate
```

底层 gate 顺序固定为：

```text
npm run typecheck
node --import tsx ./tools/jispec/tests/v1-mainline-golden-path.ts
node --import tsx ./tools/jispec/tests/doctor-v1-readiness.ts
node --import tsx ./tools/jispec/tests/regression-runner.ts
npm run ci:verify
```

### P0-T2 建立真实仓库 retakeover 回归池

产物：

- 至少 3 类真实仓库夹具：
  - 高噪声旧仓库
  - 多语言服务仓库
  - 文档/API/schema 分散仓库
- 每个夹具记录 discover ranking、draft quality、adopt 修正量和 verify verdict
- 固定说明文档：[docs/retakeover-regression-pool.md](retakeover-regression-pool.md)
- 统一回归矩阵独立区域：`retakeover-regression-pool`

验收：

- regression runner 中有独立区域覆盖 retakeover fixtures
- 每个 fixture 能证明 noise suppression 和 boundary ranking 没有退化
- `node --import tsx ./tools/jispec/tests/bootstrap-retakeover-regression.ts` 通过

## P1：Takeover intelligence 继续变强

目标：减少 adopt 阶段的人类修复量，让首次 takeover 更像“审阅关键证据”，而不是“整理扫描噪声”。

### P1-T1 Discover noise suppression 第二轮

产物：

- 扩展默认排除策略：vendor、cache、audit mirror、generated、dependency bundle、build output、coverage、tool mirror
- 支持 explainable exclusion：说明为什么某路径被排除，以及如何 opt in
- 保持 `full-inventory.json` 作为审计底账，避免误删证据不可追溯
- 显式 opt-in 入口：`bootstrap discover --include-noise`

验收：

- 高噪声仓库中 top ranked evidence 不再由非产品资产主导
- `excludedSummary` 能解释主要排除类别
- 新增或扩展 `bootstrap-discover-exclusion-policy.ts`、`bootstrap-discover-signal-filtering.ts`
- `bootstrap-discover-exclusion-policy.ts` 覆盖默认排除和 `--include-noise` forensic scan 两条路径

### P1-T2 Boundary-first ranking

产物：

- ranking 明确偏向 README、governance doc、protocol doc、manifest、controller、service entrypoint、schema truth source
- evidence metadata 区分：
  - `explicit_endpoint`
  - `service_entrypoint`
  - `schema_truth_source`
  - `module_surface_inference`
  - `weak_candidate`
- `adoption-ranked-evidence.json` 使用 `metadata.boundarySignal` 暴露边界优先解释
- draft 默认消费高信号 ranked packet，而不是完整 inventory

验收：

- `adoption-ranked-evidence.json` 中能看出证据类型和置信层级
- 复杂仓库的 domain/api draft 修正量下降
- 覆盖 `bootstrap-adoption-ranked-evidence.ts`、`bootstrap-evidence-ranking-score.ts`
- `bootstrap-evidence-ranking-score.ts` 覆盖强边界 signal 与弱候选排序

### P1-T3 Feature draft confidence gate

状态：已实现，回归锚点为 `bootstrap-feature-confidence-gate.ts`。

产物：

- feature draft 对弱证据降级，不把低置信行为强行写成 adopted-looking scenario
- takeover brief 中明确提示哪些 behavior 候选需要人工确认
- 对高噪声仓库的 feature 输出宁可少而准，不追求满

验收：

- 弱行为证据进入 `spec-debt` 或 review warning，而不是伪装成强契约
- 扩展 `bootstrap-feature-confidence-gate.ts`

## P1：人类可读决策包补齐

目标：让主线每个关键步骤都默认产出人能快速判断的 companion artifact。

### P1-T4 Adopt summary

状态：已实现，回归锚点为 `bootstrap-adopt-handoff.ts`。

产物：

- `.spec/handoffs/adopt-summary.md`
- 内容包含 accepted、edited、rejected、deferred spec debt、人工修改点和下一步 verify 建议
- 与 `bootstrap-takeover.json` 分工清晰：JSON 给机器，Markdown 给人

验收：

- `adopt --interactive` 后稳定写出 summary
- summary 不作为机器 API，只保证人类可读结构
- 新增 adopt summary 测试并纳入 regression runner

### P1-T5 Verify summary

状态：已实现，回归锚点为 `verify-json-contract.ts`、`verify-report-contract.ts`、`ci-summary-markdown.ts` 和 `ci-verify-wrapper.ts`。

产物：

- `.spec/handoffs/verify-summary.md` 或 `.jispec-ci/verify-summary.md`
- 对四态 verdict、blocking issue、advisory issue、waiver/spec debt 影响做紧凑解释
- CI summary 与本地 verify summary 使用一致语言

验收：

- `verify` 和 `ci:verify` 的人类摘要能回答：
  - 当前能不能合并？
  - 如果不能，阻断点是什么？
  - 如果能但有债务，债务在哪里？
- 扩展 `verify-report-contract.ts`、`ci-summary-markdown.ts`

### P1-T6 Bootstrap summary 统一命名

状态：已实现，推荐路径为 `.spec/facts/bootstrap/bootstrap-summary.md`，兼容路径 `.spec/facts/bootstrap/evidence-summary.txt` 保留。

产物：

- 梳理现有 `evidence-summary.txt` 是否升级或并行输出为 `bootstrap-summary.md`
- 明确 `.txt` / `.md` 的稳定性和兼容策略

验收：

- README、V1 stable contract 和测试对 summary 命名一致
- 不破坏已有 `.spec/facts/bootstrap/evidence-summary.txt` 兼容路径

## P2：Execution mediation mainline

目标：让 `change -> implement -> verify` 从“相邻命令”升级为真正连贯的实现中介主线。这里的 `implement` 不表示 JiSpec 自己写业务代码，而是把人类或外部 LLM/AI coding tool 的实现尝试纳入可约束、可追溯、可验证的协议。

### P2-T1 Patch mediation loop 第一版

状态：已实现，回归锚点为 `implement-patch-mediation.ts`、`implement-handoff-mainline.ts` 和 `implement-mainline-lane.ts`。

产物：

- `implement` 生成并维护一个 patch mediation loop，而不是内置业务代码生成器
- loop 输入来自 change session、lane、contracts、verify facts、blast radius 和 test command
- 输出 implementation request / patch intake / verification result / handoff packet
- 外部实现者可以是人类、Codex、Claude Code、Cursor、Copilot、Devin 或 CI bot
- 预算、stall、失败、越界文件、未验证 patch 和人工接管点都写入 handoff packet
- `--external-patch <path>` 接收外部 patch，JiSpec 只负责 scope check、apply intake、test、verify 和 artifact/handoff

验收：

- 至少覆盖 docs-only 外部 patch、small code external patch intake、test failure handoff 三类 fixture
- `implement-handoff-mainline.ts` 和 `implement-mainline-lane.ts` 能证明 JiSpec 约束、记录和验证外部 patch，而不是自己生成业务代码
- 文档明确 `implement` 是 implementation mediation，不是 autonomous code implementation

### P2-T2 Implementation mediation outcome 命名修正

状态：已实现，回归锚点为 `implement-mainline-lane.ts`、`implement-patch-mediation.ts` 和 `implement-handoff-mainline.ts`。

产物：

- 区分：
  - `preflight_passed`
  - `external_patch_received`
  - `patch_verified`
  - `patch_rejected_out_of_scope`
  - `budget_exhausted`
  - `stall_detected`
  - `verify_blocked`
- 当前 preflight pass 场景不再被描述成误导性的 implement success 或代码实现成功

验收：

- CLI 文案、JSON、README 和测试命名一致
- v0.1.0 release notes 中提到的命名缺口关闭

### P2-T3 Execute-default mediation 切换预备

状态：已实现，回归锚点为 `change-dual-mode.ts`、`doctor-v1-readiness.ts` 和 `cli-help-surface.ts`。

产物：

- 保留 `--mode prompt`
- 增加配置或实验开关，使项目可以选择默认 `execute`
- strict lane 遇到 open bootstrap draft 仍必须停在 adopt 边界
- execute 默认只表示自动进入 implementation mediation / verify 编排，不表示 JiSpec 自动写业务代码

验收：

- `change-dual-mode.ts` 覆盖默认值、显式 prompt、显式 execute 三类行为
- `doctor v1` 能报告 execute-default 是否满足切换条件

## P2：Policy、waiver、facts 治理面

目标：在不急着做 Console UI 的前提下，把未来控制室需要的本地 contract surface 先打稳。

### P2-T4 Waiver lifecycle hardening

状态：已实现，回归锚点为 `verify-waiver-hardening.ts`、`verify-report-contract.ts` 和 `ci-summary-markdown.ts`。

产物：

- waiver 的创建、匹配、过期、漂移、撤销规则更明确
- verify summary 中解释 waiver 对 verdict 的影响
- waiver lifecycle metadata 暴露 active、expired、revoked、invalid、unmatched active waiver
- `waiver revoke` 保留审计记录，但撤销后不再参与匹配

验收：

- 扩展 `verify-waiver-hardening.ts`
- waiver 不得静默吞掉新 blocking issue

### P2-T5 Baseline drift 与 release compare 可读化

状态：已实现，回归锚点为 `greenfield-baseline-snapshot.ts`。

产物：

- baseline snapshot / release compare 输出短摘要
- 明确 contract graph drift、static collector drift、policy drift 的区别

验收：

- release/baseline 测试能覆盖 drift summary
- CI artifact 能被 Console 未来读取，但当前不依赖 Console

### P2-T6 Policy migrate 下一轮

状态：已实现，回归锚点为 `policy-engine-basic.ts`、`policy-unknown-fact.ts` 和 `verify-policy-integration.ts`。

产物：

- `.spec/policy.yaml` 支持最小 team profile
- policy facts contract 版本清晰可迁移
- unknown fact、unknown policy key 和 deprecated key 的行为稳定

验收：

- 覆盖 `policy-engine-basic.ts`、`policy-unknown-fact.ts`、`verify-policy-integration.ts`

## P3：Greenfield 与 takeover 主线汇合

目标：让新项目和旧仓库最终进入同一套 contract-aware delivery line。

### P3-T1 Greenfield -> change mainline handoff

状态：已实现，回归锚点为 `greenfield-empty-directory-acceptance-demo.ts` 和 `greenfield-initial-slice-queue.ts`。

产物：

- Greenfield 初始化后的 review pack 可以直接生成 change session
- 初始 slice queue 能进入 `change -> implement -> verify`

验收：

- `greenfield-empty-directory-acceptance-demo.ts` 之后能接一段 change/implement smoke

### P3-T2 Greenfield verify summary 对齐

产物：

- Greenfield policy、contract graph、spec delta 的摘要语言与 takeover/verify summary 对齐

验收：

- Greenfield 相关 verify 测试和 CI summary 不再使用另一套解释口径

## P4：Console / distributed / collaboration 的最小前置契约

目标：只做对核心主线有帮助的 contract 预留，不提前进入成熟产品套件。

### P4-T1 Console read model contract

状态：已实现，回归锚点为 `console-read-model-contract.ts`，契约文档为 [docs/console-read-model-contract.md](console-read-model-contract.md)。

产物：

- 定义 Console 未来只读读取的本地产物：
  - verify report
  - verify summary
  - policy
  - waiver ledger
  - baseline snapshot
  - spec debt
  - release compare
- 不建设完整 UI

验收：

- 文档说明 Console 不替代 CLI gate
- read model 不要求上传源码

### P4-T2 Collaboration surface 冻结边界

状态：已实现，回归锚点为 `collaboration-surface-freeze.ts`，冻结文档为 [docs/collaboration-surface-freeze.md](collaboration-surface-freeze.md)。

产物：

- 明确 collaboration/presence/distributed 仍是 deferred surface
- 只保留不会影响 V1 readiness 的回归测试

验收：

- `doctor v1` 继续不让 deferred surfaces 参与 V1 readiness

## 建议执行顺序

### Batch 1：两周内优先

1. P0-T1 post-release gate
2. P0-T2 retakeover 回归池
3. P1-T1 noise suppression 第二轮
4. P1-T2 boundary-first ranking
5. P1-T4 adopt summary
6. P1-T5 verify summary

完成后应能明显改善首次 takeover 体验，并把人类 review 从“翻机器底账”推进到“读决策包”。

### Batch 2：主线实现中介化

1. P1-T3 feature confidence gate
2. P1-T6 bootstrap summary 命名
3. P2-T1 patch mediation loop
4. P2-T2 implementation mediation outcome 命名
5. P2-T3 execute-default mediation 切换预备

完成后再考虑把 `execute` 从显式模式推进到项目可选默认。

### Batch 3：治理面打底

1. P2-T4 waiver lifecycle hardening
2. P2-T5 baseline drift 与 release compare 可读化
3. P2-T6 policy migrate 下一轮
4. P3-T1 Greenfield -> change mainline handoff
5. P3-T2 Greenfield verify summary 对齐

完成后 JiSpec 会更接近“长期运行的 contract control layer”。

### Batch 4：外围面预留

1. P4-T1 Console read model contract
2. P4-T2 Collaboration surface 冻结边界

只有当 Batch 1-3 的主线质量稳定后，才进入 Console UI、distributed execution 或 collaboration productization。

## 当前不做

- 不把 LLM 作为 blocking gate 的唯一裁判
- 不把 Console UI 当作补救主线薄弱的手段
- 不把 distributed/collaboration 纳入 V1 readiness
- 不追求全自动旧仓库理解
- 不把 JiSpec 做成自主业务代码实现 agent
- 不为了更多 surface 牺牲 `discover -> draft -> adopt -> verify -> change -> implement` 主线

## 每个任务的完成定义

一个任务只有同时满足以下条件，才算完成：

- 有稳定落盘产物或明确 CLI 行为
- 有至少一条回归测试覆盖
- 不破坏 V1 stable contract
- 文档更新到 README 或对应 contract doc
- 通过 post-release gate
