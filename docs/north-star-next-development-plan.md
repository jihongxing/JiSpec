# JiSpec 北极星下一阶段开发任务

日期：2026-05-01

当前前提：V1 已发布完成。后续工作不再是补齐 V1，而是继续把 JiSpec 推向北极星：

> 把 AI 编程从个人英雄主义的手工作坊，推进到可验证、可审计、可阻断、可回放的现代软件交付流水线。

本阶段方向：

```text
takeover quality first -> execute by default -> Console as governance control room
```

下一阶段商业化方向：

```text
governance productization -> adoption packaging -> ecosystem integration -> enterprise trust
```

## 已确认产品判断

- V1 主线已经成立，后续开发应围绕北极星继续推进。
- 下一阶段重点放在 takeover 质量，而不是扩散更多 surface。
- `execute` 从可选模式推进到默认模式是必须演化，最终状态应是默认 `execute`。
- Console 不做轻量 artifact viewer 终局，而是直接朝团队治理台设计。
- 安装、样例 repo、CI 模板和文档体验重要，但放到产品核心继续成型之后处理。
- 当前项目已经具备 AI 原生软件交付控制内核的雏形；下一阶段要把这个内核推进到可安装、可试用、可运营、可审计、可商业化的产品形态。
- 商业化增强不能改变北极星边界：JiSpec 仍是 contract control layer，不是 autonomous code implementation agent，也不是 LLM-first blocking judge。

## V1.1 / pilot-grade 周执行计划

起始日期：2026-05-04
状态：frozen，除非通过对应任务和回归门禁，否则不调整场景范围、任务顺序和矩阵口径。

节拍：8 周滚动收口

目标：

- 把 `north-star acceptance` 从当前 `2/9` 推到 `9/9`。
- 把 takeover quality、execute mediation、Console / governance、release / replay / regression 四个增强块加固到 pilot-grade。
- 让每周交付都同时留下机器产物、人类 decision packet 和可回归的验收命令。

执行原则：

- 每周只保留一条主线、一个主负责人和一组验收命令。
- 场景补齐优先于新增 surface，四个增强块优先于体验装饰。
- 周末若没有稳定 artifact、decision packet 和 regression 测试，就不算完成。
- 任何新 surface 都必须服务 `bootstrap discover -> bootstrap draft -> adopt -> verify -> change -> implement -> verify -> ci:verify` 这条主线。

| 周次 | 日期 | 优先级 | 负责人 | 依赖 | 本周目标 | 验收命令 |
| --- | --- | --- | --- | --- | --- | --- |
| W1 | 2026-05-04 ~ 2026-05-10 | P0 | Test Owner + Docs / Release Owner | 当前 `doctor v1`、`doctor runtime`、`post-release:gate` 绿线；`north-star acceptance` 的 2/9 基线 | 冻结周计划口径，清点 7 个缺失场景和 4 个增强块，补齐回归矩阵与命名口径 | `node --import tsx ./tools/jispec/tests/regression-matrix-contract.ts`；`npm run typecheck` |
| W2 | 2026-05-11 ~ 2026-05-17 | P0 | Change / Implement Owner + Greenfield Owner | W1 的计划口径与矩阵契约冻结 | 补齐 `greenfield` 和 `daily_change` 两个场景的机器产物、decision packet 和回归覆盖 | `node --import tsx ./tools/jispec/tests/greenfield-empty-directory-acceptance-demo.ts`；`node --import tsx ./tools/jispec/tests/greenfield-baseline-snapshot.ts` |
| W3 | 2026-05-18 ~ 2026-05-24 | P0 | Implement Runtime Owner + Audit & Integration Owner | W2 的 greenfield / change-session 基线 | 补齐 `external_patch_mediation` 和 `policy_waiver`，把 approval、audit、waiver 语义写实 | `node --import tsx ./tools/jispec/tests/implement-patch-mediation.ts`；`node --import tsx ./tools/jispec/tests/policy-approval-workflow.ts` |
| W4 | 2026-05-25 ~ 2026-05-31 | P0 | Console Governance Owner + Release / QA Owner | W3 的 mediation / approval / audit 产物 | 补齐 `release_drift` 和 `multi_repo_aggregation`，把 Console 的只读治理面稳定下来 | `node --import tsx ./tools/jispec/tests/console-multi-repo-governance.ts`；`node --import tsx ./tools/jispec/tests/release-drift-trend.ts` |
| W5 | 2026-06-01 ~ 2026-06-07 | P1 | Privacy Owner + Docs / Release Owner | W4 的 release / multi-repo 基线 | 补齐 `privacy_report` 和 `pilot_package`，把可分享边界和试点包收口 | `node --import tsx ./tools/jispec/tests/privacy-redaction.ts`；`node --import tsx ./tools/jispec/tests/pilot-product-package.ts` |
| W6 | 2026-06-08 ~ 2026-06-14 | P0 | Bootstrap Ranking Owner + Test Owner | W1/W2 的 takeover 基线 | 加固 takeover quality，把 noise suppression、boundary ranking、adopt summary 和 feature confidence 再压稳 | `node --import tsx ./tools/jispec/tests/bootstrap-retakeover-regression.ts`；`node --import tsx ./tools/jispec/tests/bootstrap-ranking-regression.ts` |
| W7 | 2026-06-15 ~ 2026-06-21 | P0 | Implement Runtime Owner + Console Governance Owner | W3-W6 的 mediation / governance / takeover 基线 | 加固 execute-default、implement mediation、governance actionability 和 audit-readiness | `node --import tsx ./tools/jispec/tests/change-default-mode-config.ts`；`node --import tsx ./tools/jispec/tests/implement-mainline-lane.ts`；`node --import tsx ./tools/jispec/tests/implement-patch-mediation.ts` |
| W8 | 2026-06-22 ~ 2026-06-28 | P0 | Docs / Release Owner + Test Owner | W1-W7 的全部周产物 | 绑定 `north-star acceptance` 9/9、`post-release:gate`、`doctor pilot`，完成 pilot-grade 收口 | `npm run jispec -- north-star acceptance --json`；`npm run post-release:gate`；`npm run jispec-cli -- doctor pilot --json` |

### 任务拆分（可直接执行）

| 任务 ID | 周次 | 优先级 | 负责人 | 依赖 | 交付物 | 验收命令 |
| --- | --- | --- | --- | --- | --- | --- |
| W1-T1 | W1 | P0 | Test Owner + Docs / Release Owner | 当前 `doctor v1`、`doctor runtime`、`post-release:gate` 绿线 | 冻结周计划口径、场景范围和矩阵契约；更新本段周计划的状态口径 | `node --import tsx ./tools/jispec/tests/regression-matrix-contract.ts` |
| W1-T2 | W1 | P0 | Test Owner | W1-T1 | 把 `north-star acceptance` 的 7 个缺失场景写成明确任务条目和验收路径 | `npm run jispec -- north-star acceptance --json` |
| W2-T1 | W2 | P0 | Greenfield Owner | W1-T1、W1-T2 | 补齐 `greenfield` 场景的机器产物、decision packet、README / guide 口径 | `node --import tsx ./tools/jispec/tests/greenfield-empty-directory-acceptance-demo.ts` |
| W2-T2 | W2 | P0 | Change / Implement Owner | W1-T1、W1-T2 | 补齐 `daily_change` 场景的 change session、verify 记录和回放命令 | `node --import tsx ./tools/jispec/tests/p9-change-impact-summary.ts` |
| W3-T1 | W3 | P0 | Implement Runtime Owner | W2-T1、W2-T2 | 补齐 `external_patch_mediation` 的 patch mediation、scope check、post-verify 产物 | `node --import tsx ./tools/jispec/tests/implement-patch-mediation.ts` |
| W3-T2 | W3 | P0 | Audit & Integration Owner | W2-T1、W2-T2 | 补齐 `policy_waiver` 的 approval、audit、waiver lifecycle 语义 | `node --import tsx ./tools/jispec/tests/policy-approval-workflow.ts` |
| W4-T1 | W4 | P0 | Release / QA Owner | W3-T1、W3-T2 | 补齐 `release_drift` 的 snapshot、compare 和 drift trend | `node --import tsx ./tools/jispec/tests/release-drift-trend.ts` |
| W4-T2 | W4 | P0 | Console Governance Owner | W3-T1、W3-T2 | 补齐 `multi_repo_aggregation` 的 export / aggregate contract | `node --import tsx ./tools/jispec/tests/console-multi-repo-governance.ts` |
| W5-T1 | W5 | P1 | Privacy Owner | W4-T1、W4-T2 | 补齐 `privacy_report` 和 redaction companion，确认可分享边界 | `node --import tsx ./tools/jispec/tests/privacy-redaction.ts` |
| W5-T2 | W5 | P1 | Docs / Release Owner | W4-T1、W4-T2 | 补齐 `pilot_package`，把 install / first-run / verify / governance / privacy 绑成试点包 | `node --import tsx ./tools/jispec/tests/pilot-product-package.ts` |
| W6-T1 | W6 | P0 | Bootstrap Ranking Owner | W1-T1、W1-T2 | 加固 takeover quality，继续降低 noise suppression 失败率和边界误判 | `node --import tsx ./tools/jispec/tests/bootstrap-retakeover-regression.ts` |
| W6-T2 | W6 | P0 | Test Owner | W6-T1 | 加固 boundary-first ranking、adopt summary、feature confidence gate | `node --import tsx ./tools/jispec/tests/bootstrap-ranking-regression.ts` |
| W7-T1 | W7 | P0 | Implement Runtime Owner | W3-T1、W6-T1、W6-T2 | 加固 execute-default readiness、hand-off replay、implement stop point 语义 | `node --import tsx ./tools/jispec/tests/change-default-mode-config.ts` |
| W7-T2 | W7 | P0 | Console Governance Owner | W4-T2、W6-T1、W6-T2 | 加固 governance actionability、audit readiness、owner action 输出 | `node --import tsx ./tools/jispec/tests/implement-mainline-lane.ts`；`node --import tsx ./tools/jispec/tests/implement-patch-mediation.ts` |
| W8-T1 | W8 | P0 | Test Owner + Docs / Release Owner | W2-T1 到 W7-T2 全部完成 | 让 `north-star acceptance` 到达 `9/9`，并补齐缺失场景的机器产物和 decision packet | `npm run jispec -- north-star acceptance --json` |
| W8-T2 | W8 | P0 | Release / QA Owner | W8-T1 | 连续跑通收口门禁，确认没有文档 / 测试 / CLI help 口径漂移 | `npm run post-release:gate`；`npm run jispec-cli -- doctor pilot --json` |

### 执行记录

- `W6-T1` 已完成：`node --import tsx ./tools/jispec/tests/bootstrap-retakeover-regression.ts` 通过，takeover quality / noise suppression / boundary misclassification 的回归门禁已固化。
- `W6-T2` 已完成：`node --import tsx ./tools/jispec/tests/bootstrap-ranking-regression.ts`、`node --import tsx ./tools/jispec/tests/bootstrap-feature-confidence-gate.ts`、`node --import tsx ./tools/jispec/tests/bootstrap-adopt-handoff.ts`、`node --import tsx ./tools/jispec/tests/bootstrap-takeover-brief.ts` 通过，boundary-first ranking、adopt summary 和 feature confidence gate 已收口。
- `W7-T1` 已完成：`node --import tsx ./tools/jispec/tests/change-default-mode-config.ts`、`node --import tsx ./tools/jispec/tests/doctor-v1-readiness.ts`、`node --import tsx ./tools/jispec/tests/change-dual-mode.ts`、`node --import tsx ./tools/jispec/tests/v1-mainline-golden-path.ts` 通过，execute-default readiness、hand-off replay 和 stop point 语义已收口。
- `W7-T2` 已完成：`node --import tsx ./tools/jispec/tests/implement-mainline-lane.ts`、`node --import tsx ./tools/jispec/tests/implement-patch-mediation.ts`、`node --import tsx ./tools/jispec/tests/console-governance-dashboard.ts`、`node --import tsx ./tools/jispec/tests/console-ui-smoke.ts` 通过，governance actionability、audit readiness 和 owner action 输出已收口。
- `W8-T1` 已完成：`npm run jispec -- north-star acceptance --json` 达到 `9/9`，并已补齐 `policy_waiver`、`external_patch_mediation`、`pilot_package` 的本地证据与 decision packet。
- `W8-T2` 已尝试：`npm run post-release:gate` 当前仍被 `verify --json` 的 blocking drift 阻断，`npm run jispec-cli -- doctor pilot --json` 已通过；在 `verify` 重新转绿前，`W8-T2` 只能保持阻塞态。
- 可追溯性设计调整方案见 `docs/provenance-traceability-adjustment-plan.md`，后续先按语义块和快照层收敛，再回收这批 blocking drift。
- 需求渐进演进工作流已完成 `Phase 0-4`，并补上“生命周期迁移解释”叙述层；对应设计与迁移语义见 `docs/requirement-evolution-workflow.md`。这意味着 `release compare`、release summary 和 `north-star acceptance` 已能把 source snapshot、lifecycle registry、adopted change 与 requirement transition 解释成可读证据链，而不再只输出原始 drift 字段。

执行规则：

- 任务必须按周次顺序推进，除非依赖已明确满足。
- 每个任务完成后，必须同步更新对应的 decision packet、测试和文档口径。
- 如果某个任务只改了文档但没有对应验收命令，那它不算完成。

状态建议：

- `W1-T1` 到 `W2-T2` 是收口地基。
- `W3-T1` 到 `W5-T2` 是场景补齐。
- `W6-T1` 到 `W7-T2` 是质量加固。
- `W8-T1` 到 `W8-T2` 是终局验收。

依赖链：

1. `W2` 依赖 `W1` 的矩阵契约与计划口径冻结。
2. `W3` 依赖 `W2` 的 greenfield / daily change 基线。
3. `W4` 依赖 `W3` 的 mediation、approval 和 audit 语义。
4. `W5` 依赖 `W4` 的 release / multi-repo 治理底座。
5. `W6` 可以与 `W3` 到 `W5` 并行推进，但不能早于 takeover 基线完成。
6. `W7` 依赖 `W3` 到 `W6` 的所有主线产物。
7. `W8` 依赖 `W1` 到 `W7` 全部完成，并且 regression matrix contract 必须保持稳定。

终局导向验收线：

- `north-star acceptance` 必须达到 `9/9` passed，且每个场景都要同时具备机器产物和 human decision packet。
- `post-release:gate` 必须连续通过，不能靠一次性手工修绿。
- `doctor v1`、`doctor runtime`、`doctor pilot` 必须同时通过。
- `verify --json` 仍然必须是可复现的权威 gate；如果存在 advisory，只能是明确 owner-accepted 的非主线阻断项。
- 文档、测试、CLI help 和本地 artifact contract 不能再出现“口径漂移”。

## 三个月北极星收口执行版

这个版本不是普通的下一阶段计划，而是把三个月工作明确为一次北极星收口。完成后，JiSpec 至少要达到“可对外声明已经非常接近北极星”的状态；如果所有终局验收场景都通过，可以视为北极星 V1.0 达成。

收尾状态：已完成。M5-T1 到 M7-T5 均已实现并纳入回归矩阵；当前最终门禁为 `npm run post-release:gate`、`doctor v1`、`doctor runtime`、`doctor pilot` 和 `north-star acceptance`。

北极星收口定义：

- `可验证`：所有主线决策都有结构化契约、facts、policy、schema 或测试支撑；`verify` 和 `ci:verify` 是可复现的权威 gate。
- `可审计`：所有采纳、延期、豁免、策略、release drift、外部 patch intake 和治理动作都有 actor、reason、timestamp、source artifact 和 affected contract。
- `可阻断`：当前变更、契约漂移、policy 违规、未授权 waiver、关键 behavior 缺失、越界 patch 都能进入 deterministic blocking 或明确 debt。
- `可回放`：bootstrap、adopt、change、implement、verify、release compare 和 external handoff 都能从本地 artifact 追溯或恢复上下文。
- `现代交付流水线`：从旧仓库接管或 Greenfield 初始化开始，到 change、implement mediation、verify、CI、Console governance 和多仓治理，形成一条稳定主线，而不是零散工具集合。

硬性完成条件：

- `doctor v1`、`doctor pilot`、`doctor runtime` 全部通过。
- `verify --json` 在仓库自身上达到 `PASS`，或只剩明确 owner-accepted、非主线阻断的 advisory，且没有 `POLICY_REQUIRE_BEHAVIOR_CONTRACT`。
- `post-release:gate` 通过。
- Console 能回答 mergeability、policy、waiver、spec debt、drift、audit、execute mediation、takeover quality、multi-repo risk。
- 外部 coding tool / SCM / issue 集成只消费和输出本地 contract artifacts，不绕过 scope check、test、verify。
- 文档、测试、CLI help 和本地 artifact contract 对齐，不存在“文档承诺大于代码能力”的主线表述。

执行顺序固定为：

1. 2026-05 收硬门槛
2. 2026-06 补控制面
3. 2026-07 做外部化和试点硬化

任务卡约定：

- `做什么` 定义产品行为或契约边界。
- `怎么做` 定义建议修改区域和实现策略，但不预先绑定具体代码形态。
- `验收标准` 是任务完成的最低门槛；没有通过验收标准时不得标记完成。
- 每个任务完成时必须同步更新相关文档、回归测试和人类决策包语言。

月度门禁：

| 月份 | 阶段目标 | 必跑门禁 | 阶段完成定义 |
| --- | --- | --- | --- |
| 2026-05 | 收硬门槛 | `npm run typecheck`、`npm run jispec-cli -- verify --json`、`npm run jispec-cli -- doctor v1`、`npm run jispec-cli -- doctor runtime`、`node --import tsx ./tools/jispec/tests/regression-runner.ts` | 契约、runtime、回归和 takeover evidence 都不再漂移 |
| 2026-06 | 补控制面 | `npm run typecheck`、`npm run jispec-cli -- console dashboard`、`npm run jispec-cli -- console actions`、`npm run jispec-cli -- console export-governance`、`npm run ci:verify` | Console 成为本地治理控制室，但仍不替代本地 gate |
| 2026-07 | 外部化和试点硬化 | `npm run typecheck`、`npm run jispec-cli -- doctor pilot`、`npm run post-release:gate` | 试点包可安装、可验证、可审计、可解释、可集成，且不要求源码上传 |

依赖顺序：

1. `M5-T1` 到 `M5-T5` 必须先于 6 月 Console 深化完成。
2. `M6-T1` 到 `M6-T5` 必须先于 7 月 multi-repo 与外部集成完成。
3. `M7-T2` 外部集成不得绕过 `M6-T2` 的 execute / implement handoff 边界。
4. `M7-T5` 北极星验收不得降低 `doctor v1`、`verify`、`ci:verify` 或 `post-release:gate` 的权威性。

### 2026-05: 收硬门槛

目标：让 JiSpec 的主线从“能跑”升级为“足够硬”。5 月结束时，仓库自身应不再靠宽松 advisory 解释核心契约缺口，runtime 和 regression 也不能再漂。

#### M5-T1 行为契约补齐与阻断语义

状态：已完成

做什么：

- 把当前 behavior contract advisory 收口成稳定契约面。
- 让 behavior contract 贯穿 bootstrap draft、adopt、verify、ci:verify、Console read model 和 release snapshot。
- 明确 behavior 缺失、弱证据、已延期 spec debt、当前变更破坏行为的不同处理方式。

怎么做：

- 在 `tools/jispec/bootstrap/` 中让 behavior draft 继续保留 evidence level、evidence kinds 和 provenance。
- 在 `tools/jispec/verify/` 中区分 adopted behavior missing、deferred behavior debt、changed behavior drift 和 weak candidate。
- 在 `.spec/contracts/`、`.spec/spec-debt/`、`.spec/handoffs/verify-summary.md` 和 `.jispec-ci/verify-report.json` 中保持同一套行为契约语言。
- 增加 `tools/jispec/tests/verify-behavior-contract.ts` 或扩展现有 verify / bootstrap tests，覆盖 PASS、blocking、debt、weak evidence 四类场景。

验收标准：

- 仓库自身运行 `npm run jispec-cli -- verify --json` 不再出现 `POLICY_REQUIRE_BEHAVIOR_CONTRACT`。
- 行为契约缺失不能静默通过；必须进入 blocking、spec debt 或 owner review 三者之一。
- `ci:verify` 和 Console mergeability 能显示 behavior contract 对 merge 的影响。

完成记录：

- verify / policy / facts / Console 的行为契约语言已统一，`POLICY_REQUIRE_BEHAVIOR_CONTRACT` 不再作为当前仓库主线缺口出现。
- 行为缺失、延期 debt、弱证据和 drift 通过 blocking、spec debt、owner review 或 advisory 明确落位。
- 回归覆盖通过 verify JSON/report、policy engine、policy integration、facts roundtrip 和 Console governance 相关套件保持。

#### M5-T2 Facts / policy / contract graph 硬化

状态：已完成

做什么：

- 把需求、domain、api、behavior、policy、facts、spec debt、waiver 和 release graph 的关系收紧成可验证控制面。

怎么做：

- 扩展 facts contract，记录 adopted / deferred / missing / drifted contract assets。
- 让 policy rule 能引用稳定 fact，避免 blocking rule 依赖 unstable fact。
- 让 release snapshot / compare 能看到 behavior、policy 和 spec debt 的 graph impact。
- 增加 facts roundtrip、policy integration、release compare 的交叉测试。

验收标准：

- `verify --facts-out <path>` 能输出覆盖主线契约状态的 canonical facts。
- blocking policy 不引用 unstable fact。
- release compare 能区分 contract graph drift、static collector drift、policy drift 和 behavior drift。

完成记录：

- canonical facts、policy schema、policy migration 和 release baseline / drift trend 已对齐同一事实契约。
- `verify`、`ci:verify`、release snapshot/compare、Console read model 和 policy approval workflow 均读取结构化本地 artifact。
- `facts-contract-roundtrip`、`policy-engine-basic`、`policy-profile-next`、`release-drift-trend`、`greenfield-baseline-snapshot` 等回归套件持续覆盖。

#### M5-T3 Runtime 与回归契约收紧

状态：已完成

做什么：

- 让 `doctor runtime` 和 regression matrix 回到稳定计数与稳定边界。
- 把 V1 主线、runtime-extended、deferred surfaces、pilot readiness 分成互不污染的检查面。

怎么做：

- 对齐 `tools/jispec/tests/regression-runner.ts` 中 suite / test 计数和实际注册情况。
- 修正 `tools/jispec/doctor.ts` 里 runtime expected count 的漂移，或改成从 regression runner 的结构化 manifest 读取。
- 为 deferred surface 保留 runtime diagnostics，但不得进入 V1 / pilot gate。

验收标准：

- `npm run jispec-cli -- doctor runtime` 通过。
- regression runner 的 suite / test 计数与文档、代码一致。
- `doctor v1`、`doctor pilot`、`doctor runtime` 能清楚解释彼此差异。

#### M5-T4 Takeover intelligence 提纯到 owner-review 级别

状态：已完成

做什么：

- 让 discover / draft / adopt 更像接管优先级引擎，而不是广义扫描器。
- 让复杂仓库第一次 takeover 的输出足够短、准、可决策。

怎么做：

- 继续优化 evidence ranking、noise suppression、feature confidence gate 和 retakeover scorecard。
- takeover brief 默认只展示 top adoption candidates、owner-review candidates、deferred debt 和风险摘要。
- 把 human correction load 回流到 scorecard，作为后续质量提升的量化指标。

验收标准：

- noisy repo 中 top ranked evidence 不再被 vendor、cache、generated assets 主导。
- weak behavior evidence 不会被伪装成 adopted-looking scenario。
- retakeover scorecard 能量化 correction load、overclaim risk、owner decision count。

#### M5-T5 本地 replay / provenance 基线

状态：已完成

做什么：

- 让每条主线动作都能回答“从哪里来、谁决定、用了什么证据、怎么回放”。

怎么做：

- 检查 bootstrap session、adopt summary、change session、handoff packet、patch mediation、verify report、release snapshot 的 replay 字段。
- 缺 replay metadata 的主线 artifact 要补齐 source session、input artifacts、commands、actor/reason、previous outcome。
- 增加 replay smoke test，证明从 handoff 或 session artifact 能恢复下一步命令。

验收标准：

- `implement --from-handoff <path-or-session>` 的 replay 信息能解释上一轮 stop point。
- bootstrap/adopt/verify/release artifacts 均能追溯到输入证据。
- 任何自动化失败都必须写出 next human action 或 handoff。

### 2026-06: 补控制面

目标：让 JiSpec 从 CLI 主线升级为团队治理控制室。6 月结束时，Console 不再只是展示状态，而是能指导 owner 做治理动作，同时仍坚持本地 gate 权威。

#### M6-T1 Console 治理工作台补厚

状态：已完成

做什么：

- 把 Console 从 read-only dashboard 继续推进到可决策的治理工作台。
- 第一屏直接回答 mergeability、risk、owner action 和证据来源。

怎么做：

- 扩展 `tools/jispec/console/` 的 read model、dashboard、static UI 和 action planner。
- 让 dashboard、actions、export、multi-repo prelude 使用同一套治理对象。
- 缺失 artifact 必须显示 `not_available_yet`，不能扫描源码补洞。

验收标准：

- Console 第一屏能稳定回答“能不能合并、为什么、下一步谁处理”。
- Console 对 verify / policy / release / waiver / audit 的展示都能链接到本地 artifact。
- `console dashboard`、`console actions`、`console ui`、`console export-governance` 边界一致。

完成记录：

- Console dashboard、actions、static UI、export-governance 和 multi-repo aggregate 已统一使用本地治理 read model。
- 第一屏围绕 mergeability、risk、owner action、evidence 和 next command 展开；缺失输入显示为 `not_available_yet`。
- Console 明确保持只读治理工作台边界，不上传源码、不运行或替代 `verify`、`ci:verify`、policy evaluation 或 release compare。

#### M6-T2 Execute-default 与 external patch mediation 产品化

状态：已完成

做什么：

- 让 `change -> implement -> verify` 成为稳定默认工作流，而不是相邻命令。
- 让外部 patch intake 有清晰 scope、test、verify、replay 和 audit 语义。

怎么做：

- 收紧 `change/default-mode-command.ts`、`implement/implement-runner.ts`、`implement/handoff-packet.ts` 和 `doctor.ts`。
- 让每个 outcome 都有 owner、stop point、failed check、next command、allowed paths、verify command。
- 对越界 patch、测试失败、verify blocked、budget exhausted、stall detected 写出不同决策包。

验收标准：

- `doctor v1` 能解释 execute-default 是否可用。
- `change` 默认进入 execute mediation 时不会绕过 adopt boundary。
- `implement --external-patch` 不能绕过 scope check、test 和 verify。

完成记录：

- `implement --external-patch` 保留初始 intake 审计事件，并在最终 decision packet 生成后追加 completion 审计事件。
- completion audit 稳定记录 scope/apply/test/post-verify/decision/replay 摘要，包括 owner、stop point、failed check、next command、allowed paths 和 verify command。
- `implement-patch-mediation` 回归测试覆盖外部 patch 从 scope、test、verify 到 audit/provenance 的完整成功路径。
- `execute-default-guide` 明确 external patch audit 是 append-only evidence，不替代本地 blocking gate。

#### M6-T3 审计、债务、漂移、审批闭环

状态：已完成

做什么：

- 把 policy、waiver、spec debt、release drift、approval 和 audit event 串成治理闭环。

怎么做：

- 让 policy approval、waiver lifecycle、spec debt owner review、release drift review 都写入 audit ledger。
- Console actions 只生成建议命令和 decision packet，不直接写入。
- regulated profile 下强化 reviewer quorum、waiver expiration、release drift owner review。

验收标准：

- 每个关键治理动作都能追溯 actor、reason、timestamp、source artifact、affected contract。
- Console 能回答“哪些例外即将过期、哪些 debt 需要 owner、哪些 drift 需要 review”。
- 审计事件不参与 blocking gate，但能支撑治理决策。

完成记录：

- Console action planner 新增 `record_policy_approval` 决策包，针对 missing/stale approval subject 输出显式 `policy approval record` 命令。
- release drift compare report 会进入 approval workflow；regulated profile 下 release drift approval action 标记为 high risk，并指向 `.spec/approvals/*.json` 与 `.spec/audit/events.jsonl`。
- policy approval record、waiver lifecycle、spec debt owner-review/repay/cancel、release compare 均通过本地 CLI 写入 audit event，Console 本身保持 read-only planner。
- `console-governance-actions` 回归扩展到 approval/release drift owner-review 闭环，并同步 regression runner 计数。

#### M6-T4 Greenfield 与 legacy 合流

状态：已完成

做什么：

- 让旧仓库接管和从零创建最终汇入同一条 contract-aware delivery line。

怎么做：

- 对齐 Greenfield init 输出、bootstrap takeover 输出和 change-mainline handoff。
- 让 Greenfield baseline、slice queue、behavior scenario、api contract、policy、ci gate 都能进入同一 verify / Console / release read model。
- 增加 legacy takeover 和 Greenfield 的并行 golden path 测试。

验收标准：

- legacy repo 和 empty-directory Greenfield 都能走到 `change -> implement -> verify -> ci:verify`。
- Console 对两种入口展示同一套治理对象，而不是两套产品。
- release snapshot 能覆盖两种入口的 contract graph。

完成记录：

- `bootstrap adopt` 现在会把 legacy takeover 原子提交到 `.spec/baselines/current.yaml` 和 `.spec/evidence/contract-graph.json`，与 Greenfield init 的 current baseline 保持同一读取面。
- legacy takeover 的 current baseline 记录 `entry_model: legacy_takeover`、bootstrap takeover 来源、change-mainline handoff 和 adopted contract 集合，release snapshot 可以直接冻结成带 contract graph 的 release baseline。
- Greenfield empty-directory demo、v1 legacy mainline golden path、Greenfield baseline snapshot 和 bootstrap adopt handoff 都保持回归通过，证明两条入口已经汇入同一条 verify / Console / release 读模型。

#### M6-T5 Human decision packet 质量收口

状态：已完成

做什么：

- 让每个主线阶段都给人类短、准、可执行的决策包。

怎么做：

- 统一 bootstrap summary、takeover brief、adopt summary、verify summary、handoff packet、release summary、Console action packet 的语言结构。
- 每份 summary 都必须回答：当前状态、风险、证据、owner、下一步命令。
- 减少机器底账直出，保留 JSON 作为事实源，Markdown 作为 companion artifact。

验收标准：

- reviewer 不读大 JSON，也能完成 adopt、waiver、release drift、external patch intake 决策。
- Markdown 不作为机器 API。
- 文档示例与实际 CLI 输出一致。

完成记录：

- 新增共享 `Decision Snapshot` 首屏语言，bootstrap summary、takeover brief、adopt summary、verify summary、release summary、Console action text 和 formatted implementation handoff 都回答 current state、risk、evidence、owner、next command。
- adopt/takeover/verify/release/console/implement 回归测试覆盖人类可决策字段，waiver、release drift 和 external patch handoff 都可不读大 JSON 先完成 owner review triage。
- 文档同步说明 Markdown/text 只是 human companion，JSON/YAML/JSONL/lock artifact 仍是机器事实源和 gate 输入。
- 迭代 3 相关验证已通过：`node --import tsx ./tools/jispec/tests/console-governance-dashboard.ts`、`node --import tsx ./tools/jispec/tests/console-governance-actions.ts`、`node --import tsx ./tools/jispec/tests/console-governance-export.ts`、`node --import tsx ./tools/jispec/tests/console-multi-repo-governance.ts`、`node --import tsx ./tools/jispec/tests/audit-event-ledger.ts`、`node --import tsx ./tools/jispec/tests/collaboration-mvp.ts`、`node --import tsx ./tools/jispec/tests/collaboration-awareness-mvp.ts`、`node --import tsx ./tools/jispec/tests/collaboration-locking-mvp.ts`、`node --import tsx ./tools/jispec/tests/collaboration-notifications-mvp.ts`、`node --import tsx ./tools/jispec/tests/console-ui-smoke.ts`、`node --import tsx ./tools/jispec/tests/policy-approval-workflow.ts`，以及 `npm run typecheck`。

### 2026-07: 外部化和试点硬化

目标：把 JiSpec 推到可对外试点、可安装、可集成、可审计运营的产品形态。7 月结束时，应能用真实或真实形态仓库证明 JiSpec 已经形成 AI 原生交付控制层。

#### M7-T1 Multi-repo governance 固化

状态：已完成

做什么：

- 把多仓治理从概念推进到稳定只读聚合 contract。
- 让导出 snapshot 成为多仓治理的共同输入。

怎么做：

- 固化 governance snapshot 的导出字段、版本、缺失语义和兼容策略。
- 多仓聚合只消费本地导出的 snapshot，不扫描源码、不运行 verify。
- 聚合层展示 repo risk score、verify inventory、policy profile inventory、waiver hotspot、spec debt hotspot、release drift hotspot、latest audit actors。

验收标准：

- 多仓聚合结果能稳定读取多个 repo 的本地治理快照。
- 聚合层不替代单仓 `verify` 结论。
- 缺 snapshot 的 repo 明确显示为缺失，而不是静默忽略。

完成记录：

- `console export-governance` 的 repo snapshot 增加 `contract.snapshotContractVersion: 1`、`compatibleAggregateVersion: 1` 和固定 missing semantics：repo 内缺失事实为 `not_available_yet`。
- `console aggregate-governance` 只消费 exported snapshots，显式缺失的 `--snapshot` 输入会进入 `missingSnapshots[]`，并在 `summary.missingSnapshotCount` 与 Markdown companion 中展示为 `snapshot_not_found`。
- Multi-repo aggregate 继续展示 repo risk score、verify inventory、policy profile inventory、waiver/spec debt/release drift hotspots 和 latest audit actors，同时保持 `runsVerify=false`、`scansSourceCode=false`、`replacesCliGate=false`。
- `console-multi-repo-governance` 回归扩展到 snapshot contract compatibility 与 missing snapshot reviewability，并同步 regression matrix 计数。

#### M7-T2 外部 coding tool、SCM、issue 集成 contract

状态：已完成

做什么：

- 定义外部 coding tool、SCM 和 issue tracker 的只读集成 contract。
- 让外部工具成为生产设备，而不是事实权威。

怎么做：

- 定义 handoff adapter、payload preview、PR/MR comment、issue link、change intent backfill 的字段边界。
- 外部工具只接收 focused request packet：allowed paths、contract focus、test command、verify command、failed check、stop point。
- 所有 patch 必须回到 `implement --external-patch`，经过 scope check、test、verify 和 audit。

验收标准：

- 外部工具集成只产生 preview / payload，不绕过 scope check、test 和 verify。
- SCM / issue payload 引用的都是本地事实源。
- 相关测试能证明 payload 只是请求格式，不是 gate 权威。

完成记录：

- 外部 coding tool handoff request 与 SCM/issue payload 共享 `integrationContractVersion: 1`，固定 `requiredReturnPath: implement_external_patch` 和 mediated checks：`scope_check`、`tests`、`verify`。
- `schemas/implementation-handoff.schema.json` 增加 `contract` 字段；新增 `schemas/integration-payload.schema.json`，用于校验 SCM/issue payload preview，schema 会拒绝把 payload 提升为 gate authority 的字段漂移。
- SCM/issue payload 增加 `sourceArtifactRefs[]`，把 verify report、verify summary、waiver、spec debt、implementation handoff、Console governance 等本地事实源结构化引用出来。
- `integration-payloads` 回归扩展到 contract/schema/bypass rejection，`implement-handoff-adapters` 回归覆盖 handoff request 的统一 integration contract。

#### M7-T3 隐私、redaction、approval、audit hardening

状态：已完成

做什么：

- 把本地优先、隐私、审批和审计从“原则”做成可验证产品边界。

怎么做：

- privacy report 覆盖 Console export、pilot package、SCM/issue payload、handoff packet 的可分享内容。
- audit ledger 增加 hash chain / integrity check / damaged ledger attention。
- approval workflow 覆盖 policy、waiver、release drift、execute-default 和 pilot risk acceptance。

验收标准：

- 试点包可分享内容经过 redaction 或明确风险标记。
- audit ledger 损坏时 Console 显示 attention，不静默视为干净。
- regulated profile 下 approval quorum 能影响 governance posture。

完成记录：

- Privacy report 新增 share artifact 分类覆盖：`.spec/integrations/**` 为 `integration_payload`，`.spec/pilot/**` 为 `pilot_package`，`.jispec/handoff/**` 继续归入 handoff；这些 artifact 会得到 `shareable` 或 `review_before_sharing` 决策，并在发现 secret 时写出 redacted companion。
- Approval workflow 新增 `pilot_risk_acceptance` subject；当 `.spec/privacy/privacy-report.json` 存在高严重级别发现或 review-before-sharing artifact 时，regulated profile 会要求 reviewer quorum 或 owner approval 后 posture 才能 satisfied。
- `schemas/approval.schema.json`、CLI `policy approval record --subject-kind`、Console approval posture 共享新的 subject kind，approval decision 仍写入 audit ledger，不替代 `verify` / `ci:verify`。
- Audit ledger hash-chain / Console attention 语义保持：invalid ledger 不能静默追加，Console read model 暴露 integrity issue count 和 issue 摘要。

#### M7-T4 Pilot product package 与 adoption path

状态：已完成

做什么：

- 把安装、首次接管、Greenfield、CI、Console、privacy、pilot readiness 打包成外部团队能走完的试点路径。

怎么做：

- 固化 install、quickstart、first takeover walkthrough、Greenfield walkthrough、CI templates、pilot checklist。
- `first-run` 按 empty repo、legacy repo、open draft、adopted repo、active change session 给出不同 next action。
- sample repo 和 retained-output demo 证明 15-30 分钟内跑完第一轮 takeover 或 Greenfield baseline。

验收标准：

- 外部试点用户能在不上传源码的前提下完成安装、首次 baseline、CI verify、Console governance review。
- `doctor pilot` 能持续作为试点门禁。
- 试点文档明确说明哪些是主线能力，哪些只是治理辅助能力。

完成记录：

- 新增 `pilot package` 本地命令，写出 `.spec/pilot/package.json` 与 `.spec/pilot/package.md`，把 install、first-run、first baseline、CI verify、Console governance、privacy report 和 `doctor pilot` 固化为一个 adoption path。
- 新增 `tools/jispec/pilot/product-package.ts` 与 `tools/jispec/tests/pilot-product-package.ts`，package contract 明确 `localOnly=true`、`sourceUploadRequired=false`、`replacesVerify=false`、`replacesDoctorPilot=false`，并为缺失步骤输出 owner action、next command 和 source artifacts。
- `first-run` 回归补齐 adopted repo + policy 场景，确认已 adopted 且具备 policy 的仓库下一步进入 deterministic `verify`。
- 新增 `docs/pilot-product-package.md` 和 `docs/greenfield-walkthrough.md`，并同步 quickstart、install、pilot checklist、README / README.zh-CN，明确 mainline gates 与 governance companions 的边界。

#### M7-T5 北极星最终验收场景

状态：已完成

做什么：

- 用端到端场景证明 JiSpec 已经接近或达到北极星，而不是只完成任务列表。

怎么做：

- 建立 `north-star-acceptance` 验收套件，覆盖 legacy takeover、Greenfield、daily change、external patch mediation、policy waiver、release drift、Console governance、multi-repo aggregation、privacy report。
- 每个场景必须写出机器 artifact 和人类 decision packet。
- 验收套件不能依赖 LLM 作为 blocking 判定源。

验收标准：

- `npm run post-release:gate` 通过。
- `npm run jispec-cli -- doctor v1`、`doctor runtime`、`doctor pilot` 全部通过。
- `north-star-acceptance` 场景全部通过，并能证明：可验证、可审计、可阻断、可回放、本地优先、外部工具受控。
- README、V1 stable contract、Console contract、pilot checklist 与实际 CLI 行为一致。

完成记录：

- 新增 `north-star acceptance` 本地命令，写出 `.spec/north-star/acceptance.json`、`.spec/north-star/acceptance.md`，以及每个场景自己的 machine artifact 和 human decision packet。
- 新增 `tools/jispec/north-star/acceptance.ts` 与 `tools/jispec/tests/north-star-acceptance.ts`，覆盖 legacy takeover、Greenfield、daily change、external patch mediation、policy waiver、release drift、Console governance、multi-repo aggregation、privacy report。
- 验收契约明确 `localOnly=true`、`sourceUploadRequired=false`、`llmBlockingDecisionSource=false`，且不替代 `verify`、`doctor v1`、`doctor runtime`、`doctor pilot` 或 `post-release:gate`。
- README、V1 stable contract、Console read model contract、pilot checklist 新增最终验收入口说明，确保文档承诺与 CLI 行为一致。

## 当前仓库的试点闭环状态

`doctor v1`、`doctor runtime`、`doctor pilot` 和 `post-release:gate` 当前均已通过。下面 T0-1 到 T0-5 是已完成的试点闭环记录，继续作为后续仓库接入时的执行模板保留。

### T0-1 首个 takeover baseline 落盘

状态：已完成

目标：

- 让当前仓库至少拥有一份可复查、可回放的 bootstrap takeover 或 Greenfield baseline。
- 让首次接管从“能演示”变成“有归档、有 owner、有后续动作”。

需要补齐的产物：

- `.spec/handoffs/bootstrap-takeover.json`
- `.spec/handoffs/takeover-brief.md`
- `.spec/handoffs/adopt-summary.md`
- 或者 `.spec/baselines/current.yaml` / Greenfield baseline

建议执行顺序：

```bash
npm run jispec -- first-run --root .
npm run jispec -- bootstrap discover --root .
npm run jispec -- bootstrap draft --root .
npm run jispec -- adopt --interactive --root .
```

完成判定：

- `doctor pilot` 的 `Pilot First Takeover` 通过。
- 试点 reviewer 能看到明确的 owner review、adopt decision 和 baseline 来源。

完成记录：

- 当前仓库已写出首个 committed bootstrap takeover baseline，session 为 `bootstrap-20260501T200659806Z`。
- 关键落盘产物：
  - `.spec/handoffs/bootstrap-takeover.json`
  - `.spec/handoffs/takeover-brief.md`
  - `.spec/handoffs/adopt-summary.md`
  - `.spec/contracts/domain.yaml`
  - `.spec/contracts/api_spec.json`
  - `.spec/spec-debt/bootstrap-20260501T200659806Z/feature.json`
- baseline 选择保守边界：`domain` 与 `api` 接管，`feature` 进入 spec debt，避免把薄弱行为证据误写成 blocking contract。

### T0-2 Policy profile 与 accountable owner 补全

状态：已完成

目标：

- 让 `.spec/policy.yaml` 不只声明 profile，还明确 team owner 和 reviewer posture。
- 把 `unassigned` 变成可追踪的责任人，而不是默认占位。

需要补齐的产物：

- `.spec/policy.yaml`
- `team.profile`
- `team.owner`
- `team.reviewers`
- `team.required_reviewers`

建议执行顺序：

```bash
npm run jispec -- policy migrate --profile small_team --owner <owner> --reviewer <reviewer> --root .
```

然后记录必要的 approval / audit 轨迹。

完成判定：

- `doctor pilot` 的 `Pilot Policy Profile` 通过。
- `doctor v1` 和 `policy approval` 看到的治理姿态与实际负责人一致。

完成记录：

- `policy migrate` 已支持 `--owner <owner>` 与 `--reviewer <reviewer...>`，让 pilot policy owner/reviewer posture 可以通过稳定 CLI 重放。
- 当前仓库已通过以下命令把 `.spec/policy.yaml` 更新为 `small_team` 试点姿态：

```bash
npm run jispec -- policy migrate --root . --profile small_team --owner jispec-maintainers --reviewer pilot-reviewer --actor codex --reason "T0-2 declare accountable policy owner for pilot readiness"
```

- 当前 policy owner 为 `jispec-maintainers`，reviewer 为 `pilot-reviewer`，`required_reviewers` 为 `1`。
- 已写入 policy owner approval 记录：`.spec/approvals/approval-ee8c45b8-c7cc-4706-86f6-b436fb48d4c7.json`。
- 已写入 execute-default owner approval 记录：`.spec/approvals/approval-51758cb0-a23d-4081-bfe4-10c07c24675e.json`。
- `policy approval status` 当前为 `approval_satisfied`。

### T0-3 Console governance snapshot 导出

状态：已完成

目标：

- 把当前仓库的治理状态导出成只读快照，供试点 review 直接读取。
- 不扫描源码，不替代 `verify`，只做本地治理读模型。

需要补齐的产物：

- `.spec/console/governance-snapshot.json`
- `.spec/console/governance-snapshot.md`

建议执行顺序：

```bash
npm run jispec -- console export-governance --root .
```

完成判定：

- `doctor pilot` 的 `Pilot Console Governance` 通过。
- Console snapshot 能回答 policy、waiver、spec debt、drift、verify posture 和 takeover quality。

完成记录：

- 当前仓库已通过以下命令导出本地只读治理快照：

```bash
npm run jispec -- console export-governance --root . --repo-id jispec-main --repo-name JiSpec
```

- 关键落盘产物：
  - `.spec/console/governance-snapshot.json`
  - `.spec/console/governance-snapshot.md`
- Snapshot 当前显示 `policyProfile=small_team`、`policyOwner=jispec-maintainers`、`verifyVerdict=WARN_ADVISORY`、`approvalWorkflowStatus=approval_satisfied`、`bootstrapSpecDebt=1`。
- Snapshot boundary 固定为 local-only、read-only、does not scan source、does not run verify、does not replace CLI gate。

### T0-4 Privacy report 与可分享包

状态：已完成。

目标：

- 在外部试点前，先把本地 JiSpec 产物里的敏感信息识别和脱敏做成固定动作。
- 让共享包、审阅包和 Console 导出保持可控边界。

需要补齐的产物：

- `.spec/privacy/privacy-report.json`
- `.spec/privacy/redacted/**`

建议执行顺序：

```bash
npm run jispec -- privacy report --root .
```

完成判定：

- `doctor pilot` 的 `Pilot Privacy Report` 通过。
- 外部共享包只保留 redacted companion，不泄漏原文 secret。

本仓库完成记录：

- 已执行：

```bash
npm run jispec -- privacy report --root . --json
```

- 关键落盘产物：
  - `.spec/privacy/privacy-report.json`
  - `.spec/privacy/privacy-report.md`
- Privacy report 当前扫描 834 个 JiSpec 本地产物，`findingCount=0`，`highSeverityFindingCount=0`，没有需要额外 redacted companion 的发现。
- 已执行 `npm run jispec -- doctor pilot --json`，当前 `ready=true`、`blockerCount=0`、7/7 检查通过。

### T0-5 Pilot ready gate 收口

状态：已完成。

目标：

- 把上面 4 个缺口收敛成一个可重复执行的试点门禁。
- 让接下来的开发默认围绕 `doctor pilot --json` 的失败项推进，而不是自由扩散 surface。

建议完成定义：

```bash
npm run pilot:ready
npm run jispec -- doctor pilot --json
```

判定标准：

- `ready: true`
- `blockerCount: 0`
- 所有 blocker 都有明确 owner action 和 next command

完成记录：

- 新增 `npm run pilot:ready`，由 `scripts/pilot-ready-gate.ts` 执行 `Doctor.checkCommercialPilotReadiness()`，以 `doctor pilot` 的 ready 结果作为唯一 gate 判定。
- `pilot:ready` 默认输出人工可读摘要；失败时列出 blocker、owner action、next command 和 source artifacts；`--json` 输出底层 `doctor pilot` 机器报告。
- 当前仓库执行 `npm run pilot:ready` 通过，`doctor pilot --json` 仍为 `ready=true`、`blockerCount=0`、7/7 检查通过。
- `tools/jispec/tests/pilot-readiness.ts` 已覆盖 gate 脚本成功、JSON 输出和失败 blocker action；regression matrix 的 Commercial Pilot Readiness 期望测试数更新为 6。

## 排序原则

1. Takeover 质量优先于新增命令面。
2. Execute 默认化优先于安装与包装体验。
3. Console 围绕 governance、audit、waiver、policy、spec debt 和 drift 建模，不替代 CLI gate。
4. LLM 仍不能成为 blocking gate 的唯一裁判。
5. JiSpec 继续做 implementation mediation，不变成 autonomous business-code generator。
6. 每个任务必须有稳定落盘产物、回归测试和可审计的人类决策包。
7. 产品化任务必须降低采用摩擦，但不能绕过本地优先、deterministic gate、audit 和 replay 语义。

## 6 周执行计划（3 个两周迭代）

说明：

- 下面的任务卡是把本文件里的 P0 / P1 / P2 方向拆成可以直接开工的 backlog。
- “推荐负责人” 用角色名表示，不强行绑定个人。
- 默认依赖顺序就是表格顺序；前一项未验收通过，不进入下一项。

推荐负责人角色：

- `Bootstrap Ranking Owner`：负责 `bootstrap discover`、evidence ranking、takeover summary。
- `Implement Runtime Owner`：负责 `change` / `implement` 闭环、patch mediation、replay、budget / stall。
- `Console Governance Owner`：负责 `console` read model、dashboard、action planner、multi-repo 聚合。
- `Audit & Integration Owner`：负责审计、通知、协作事件和外部化接线。
- `Test Owner`：负责回归、fixture、golden path、CLI parity。
- `Docs / Release Owner`：负责 stable contract、guide、release note、README 对齐。

### 迭代 1（第 1-2 周）：接管证据排序

目标：把 `bootstrap discover` 从“扫描到什么”推进到“该先接管什么”。

| 顺序 | 任务 | 推荐负责人 | 依赖 | 做什么 | 怎么做 | 涉及文件 | 怎么测试 | 验收标准 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 噪声压制与权重重排 | Bootstrap Ranking Owner | 无 | 让 README / governance / protocol / schema / entrypoint / manifest 优先于 vendor / cache / build / example / fixture。 | 调整 ranking 权重与排除规则，把第三方、生成物、示例和 fixture 明显降权；保持 deterministic 排序。 | `tools/jispec/bootstrap/discover.ts`、`tools/jispec/bootstrap/evidence-ranking.ts`、`tools/jispec/bootstrap/evidence-graph.ts` | `npm run typecheck`，新增 `node --import tsx ./tools/jispec/tests/bootstrap-ranking-regression.ts` | noisy repo 的前 10 个 adoption candidates 不再被噪声目录主导。 |
| 2 | owner-review 与 adoption-ready 分流 | Bootstrap Ranking Owner | 1 | 把强边界证据和弱候选拆开，不让它们混在一个分数桶里。 | 复用 provenance / owner review posture，把 `weak_candidate` 明确标成需要人工 review；强证据保留可采纳语义。 | `tools/jispec/bootstrap/evidence-ranking.ts`、`tools/jispec/provenance/evidence-provenance.ts`、`tools/jispec/bootstrap/draft.ts` | `node --import tsx ./tools/jispec/tests/bootstrap-feature-confidence-gate.ts`、`node --import tsx ./tools/jispec/tests/bootstrap-draft-feature-scenarios.ts` | 弱证据始终进入 owner review 或 spec debt，不会伪装成 ready contract。 |
| 3 | takeover brief / summary 收敛 | Bootstrap Ranking Owner + Docs / Release Owner | 1,2 | 让 `bootstrap-summary.md` 和 `takeover-brief.md` 直接回答“先接管什么”。 | 缩短 summary，保留 top candidates、excluded noise、next command 和风险摘要；人类读完即可进入 adopt。 | `tools/jispec/bootstrap/discover.ts`、`tools/jispec/human-decision-packet.ts`、`docs/retakeover-regression-pool.md` | 对 noisy fixture 运行 `npm run jispec-cli -- bootstrap discover`，再比对 summary 文本快照 | summary 能稳定给出 3-10 个高价值接管资产，而不是长 inventory。 |
| 4 | 真实噪声 / 真实仓库回归池 | Test Owner | 1,2,3 | 补能证明排序改进的 fixture，而不是只靠 synthetic 小样本。 | 增加 noisy repo 和 real-like repo fixture，记录 correction load、verify safety、owner-review 比例。 | `tools/jispec/tests/bootstrap-ranking-regression.ts`、`tools/jispec/tests/bootstrap-retakeover-regression.ts`、`tools/jispec/tests/regression-runner.ts` | `node --import tsx ./tools/jispec/tests/bootstrap-ranking-regression.ts`、`node --import tsx ./tools/jispec/tests/bootstrap-retakeover-regression.ts` | 回归池能证明排序改动同时降低噪声占比并提高 takeover 可决策性。 |
| 5 | 文档与稳定契约对齐 | Docs / Release Owner | 1-4 | 把新的排序语义写进主文档，避免代码和文档口径漂移。 | 更新 north-star 计划、stable contract、README 摘要和 release note 的排序语言。 | `docs/north-star-next-development-plan.md`、`docs/v1-mainline-stable-contract.md`、`README.md`、`README.zh-CN.md` | `npm run typecheck`、人工核对文档链接与术语 | 文档不再把 discover 描述成广义 inventory，而是 takeover-oriented evidence prioritization。 |

完成状态：已实现。

- `tools/jispec/bootstrap/evidence-ranking.ts` 已加入 `rankTier`、adoption-ready / owner-review 分流、轻量 priority boost 和 summary counts。
- `tools/jispec/bootstrap/discover.ts` 已输出 `Takeover priority`、`Top adoption-ready evidence`、`Owner-review evidence`，并保留 `Top adoption-ranked evidence` 做兼容。
- `tools/jispec/tests/bootstrap-ranking-regression.ts` 已覆盖 noisy repo 的排序、分流和摘要文本。
- `tools/jispec/tests/bootstrap-evidence-ranking-score.ts`、`tools/jispec/tests/regression-runner.ts`、`tools/jispec/tests/regression-matrix-contract.ts` 已同步新的契约。
- 验证通过：`node --import tsx ./tools/jispec/tests/bootstrap-ranking-regression.ts`、`node --import tsx ./tools/jispec/tests/bootstrap-evidence-ranking-score.ts`、`node --import tsx ./tools/jispec/tests/regression-matrix-contract.ts`、`npm run typecheck`。

### 迭代 2（第 3-4 周）：implement 闭环

目标：把 `implement` 从“有流程”变成“可恢复、可重试、可解释”。

| 顺序 | 任务 | 推荐负责人 | 依赖 | 做什么 | 怎么做 | 涉及文件 | 怎么测试 | 验收标准 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | decision packet 状态机收敛 | Implement Runtime Owner | 迭代 1 完成 | 让每个 implement outcome 都稳定映射到 next action、owner、stop point 和 mergeability。 | 收紧 `buildImplementationDecisionPacket` 的分支，统一 `ready_for_verify / ready_to_merge / needs_* / blocked_by_verify` 的落点。 | `tools/jispec/implement/implement-runner.ts`、`tools/jispec/implement/handoff-packet.ts` | `node --import tsx ./tools/jispec/tests/implement-mainline-lane.ts`、`node --import tsx ./tools/jispec/tests/implement-patch-mediation.ts` | 所有 outcome 都能说清楚“下一步做什么、谁来做、现在停在哪”。 |
| 2 | budget / stall / context 收敛 | Implement Runtime Owner | 1 | 让循环控制器尽早停下，避免无意义重复。 | 增强 `BudgetController`、`StallDetector`、`context-pruning`、`episode-memory` 的状态记录和停滞判定。 | `tools/jispec/implement/budget-controller.ts`、`tools/jispec/implement/stall-detector.ts`、`tools/jispec/implement/context-pruning.ts`、`tools/jispec/implement/episode-memory.ts`、`tools/jispec/implement/implement-runner.ts` | 新增 `node --import tsx ./tools/jispec/tests/implement-stall-budget.ts`，并跑现有 implement 回归 | 连续失败会更早进入 `stall_detected` 或 `budget_exhausted`，且有明确恢复建议。 |
| 3 | patch mediation replay / recovery | Implement Runtime Owner + Audit & Integration Owner | 1,2 | 让外部 patch 失败后可以按同一 session 回放，而不是重新猜上下文。 | 保留 replay metadata、allowed paths、failed check、post-verify command，确保 `--from-handoff` 能恢复 active session。 | `tools/jispec/implement/patch-mediation.ts`、`tools/jispec/implement/adapters/handoff-adapter.ts`、`tools/jispec/change/change-command.ts` | `node --import tsx ./tools/jispec/tests/implement-patch-mediation.ts`、`node --import tsx ./tools/jispec/tests/implement-handoff-adapters.ts` | 失败后的 patch mediation 能回放，且审计 / artifact / CLI 输出一致。 |
| 4 | CLI 文本 / JSON / exit code 对齐 | Implement Runtime Owner + Test Owner | 1-3 | 让 `change` / `implement` 的人类输出和机器输出一致。 | 对齐 CLI 文本、JSON 字段和退出码，避免“文本说可合并，退出码却阻断”的情况。 | `tools/jispec/cli.ts`、`tools/jispec/change/change-command.ts`、`tools/jispec/implement/implement-runner.ts` | 新增 `node --import tsx ./tools/jispec/tests/implement-cli-parity.ts` | JSON / 文本 / exit code 三者能指向同一状态机结论。 |
| 5 | post-implement verify 与 archive 语义 | Implement Runtime Owner | 1-4 | 只在真正 ok 时归档 session，失败时保留可恢复状态。 | 明确 archive 条件、verify blocked 条件和 handoff 写出条件。 | `tools/jispec/implement/implement-runner.ts`、`tools/jispec/change/change-session.ts`、`tools/jispec/verify/verify-runner.ts` | 继续跑 `implement-mainline-lane.ts`、`implement-patch-mediation.ts`，并补 verify-blocked 断言 | 成功才 archive，失败必须保留可 replay 的 active session。 |

完成状态：已实现。

- `tools/jispec/implement/handoff-packet.ts` 已稳定收敛 `ready_for_verify / ready_to_merge / needs_* / blocked_by_verify` 状态、owner、stop point 和 next action。
- `tools/jispec/implement/implement-runner.ts` 已保留 replay metadata、budget/stall 退出语义、post-implement verify 与 archive 规则。
- `tools/jispec/cli.ts` 已让 `implement --json` 输出纯 JSON，避免诊断日志污染机器消费。
- `tools/jispec/tests/implement-stall-budget.ts`、`tools/jispec/tests/implement-cli-parity.ts` 已把预算收口、stall detector、context bundle、CLI 文本 / JSON / exit code 对齐固定进回归。
- `tools/jispec/tests/regression-runner.ts`、`tools/jispec/tests/regression-matrix-contract.ts` 和相关 P9 冻结测试已同步新矩阵总数。
- 验证通过：`node --import tsx ./tools/jispec/tests/implement-stall-budget.ts`、`node --import tsx ./tools/jispec/tests/implement-cli-parity.ts`、`node --import tsx ./tools/jispec/tests/regression-matrix-contract.ts`、`node --import tsx ./tools/jispec/tests/p9-baseline-contract.ts`、`npm run typecheck`。

### 迭代 3（第 5-6 周）：治理 / 协作层

目标：把本地治理 read model 做厚，并让协作层只服务 JiSpec 语义。

| 顺序 | 任务 | 推荐负责人 | 依赖 | 做什么 | 怎么做 | 涉及文件 | 怎么测试 | 验收标准 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | governance dashboard actionability | Console Governance Owner | 迭代 2 完成 | 让 dashboard 第一屏直接回答 mergeability、risk、owner action 和证据来源。 | 统一 dashboard / actions / snapshot / static UI 的字段，输出明确 next command。 | `tools/jispec/console/governance-dashboard.ts`、`tools/jispec/console/governance-actions.ts`、`tools/jispec/console/read-model-snapshot.ts`、`tools/jispec/console/ui/static-dashboard.ts` | `node --import tsx ./tools/jispec/tests/console-governance-dashboard.ts`、`node --import tsx ./tools/jispec/tests/console-governance-actions.ts`、`node --import tsx ./tools/jispec/tests/console-ui-smoke.ts` | 每个治理问题都能落到明确 owner action，不会只给一段状态描述。 |
| 2 | multi-repo export / aggregate | Console Governance Owner | 1 | 让多仓聚合基于稳定 snapshot，而不是临时拼装。 | 固化 snapshot version、missing snapshot 语义和 aggregate contract。 | `tools/jispec/console/governance-export.ts`、`tools/jispec/console/multi-repo.ts`、`tools/jispec/console/repo-group.ts`、`tools/jispec/console/read-model-contract.ts` | `node --import tsx ./tools/jispec/tests/console-governance-export.ts`、`node --import tsx ./tools/jispec/tests/console-multi-repo-governance.ts` | aggregate 的缺失项显式显示 `not_available_yet`，不靠猜。 |
| 3 | audit / notification 语义接线 | Audit & Integration Owner | 1,2 | 把治理动作、审批和边界变化接到审计与通知流。 | 统一 audit event ledger、notification service、policy/waiver/release/patch intake 的记录字段。 | `tools/jispec/audit/event-ledger.ts`、`tools/jispec/notification-service.ts`、`tools/jispec/presence-manager.ts`、`tools/jispec/collaboration-server.ts` | `node --import tsx ./tools/jispec/tests/audit-event-ledger.ts`、`node --import tsx ./tools/jispec/tests/collaboration-notifications-mvp.ts` | 能追溯谁在何时批准了什么例外或边界变化。 |
| 4 | 协作层只服务治理事件 | Audit & Integration Owner + Console Governance Owner | 1-3 | 避免把协作层做成泛文档协作产品。 | 让 collaboration / presence 只围绕 owner-review、waiver、spec-debt、audit、patch intake 传播。 | `tools/jispec/collaboration-server.ts`、`tools/jispec/presence-manager.ts`、`tools/jispec/notification-service.ts` | `node --import tsx ./tools/jispec/tests/collaboration-mvp.ts`、`node --import tsx ./tools/jispec/tests/collaboration-awareness-mvp.ts`、`node --import tsx ./tools/jispec/tests/collaboration-locking-mvp.ts` | 协作层能服务治理事件，但不会绕开本地 gate。 |
| 5 | 文档 / guide / pilot 对齐 | Docs / Release Owner | 1-4 | 把治理台、审计和协作边界写清楚，避免产品误读。 | 同步 north-star 计划、console read model contract、README 和 release 文案。 | `docs/north-star-next-development-plan.md`、`docs/console-read-model-contract.md`、`README.md`、`README.zh-CN.md` | `npm run typecheck`、`npm run jispec-cli -- console dashboard --json`、`npm run jispec-cli -- console actions --json` | 文档明确写出：Console 是本地只读治理台，不替代 `verify`、`ci:verify` 或本地 policy gate。 |

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

## P4：采用与包装产品化

目标：把已经成型的本地控制内核包装成外部团队可以低摩擦安装、试用、接入 CI 并完成首次 takeover 的产品入口。

### P4-T1 安装入口与 npm/bin 包装

状态：已实现

范围：

- 提供稳定 npm package entry 和 `jispec` bin。
- 明确 `jispec --version`、`jispec doctor`、`jispec init`、`jispec upgrade` 或 `jispec migrate` 的最小语义。
- 增加 Windows、macOS、Linux 的 platform smoke。
- 保持本地优先，不要求云账号或源码上传。

预期文件：

- `package.json`
- `README.md`
- `README.zh-CN.md`
- `docs/install.md`
- `tools/jispec/tests/package-script-surface.ts`
- 新增 platform smoke 测试，按实现需要命名

验收：

```bash
npm run typecheck
npm run jispec -- --version
npm run jispec -- doctor v1
node --import tsx ./tools/jispec/tests/package-script-surface.ts
```

完成定义：

- 新用户能通过一个稳定入口运行 `doctor v1`、`bootstrap discover` 和 `verify`。
- 安装入口不得改变 V1 主线命令的退出码和 artifact 语义。

完成记录：

- `package.json` 增加 `bin`，通过 `bin/jispec.js` 暴露 `jispec` 和 `jispec-cli`。
- CLI 绑定 `package.json` version，支持 `jispec --version` / `npm run jispec -- --version`。
- `tsx` 移入 runtime dependencies，保证 npm bin 安装后能执行 TypeScript CLI。
- 新增 [docs/install.md](install.md)，README 和中文 README 同步说明 package/bin smoke。
- `package-script-surface.ts` 扩展为 P4-T1 回归锚点，覆盖 bin、files、engine、runtime dependency、CLI version 和 bin shim dispatch。

### P4-T2 样例 repo 与 CI 模板

状态：已实现

范围：

- 提供最小 sample repo，覆盖 legacy takeover 与 Greenfield 两条入口。
- 提供 GitHub Actions 和 GitLab CI 模板。
- 提供 first takeover walkthrough，从 `bootstrap discover` 到 `adopt`、`verify`、`ci:verify`。
- 样例必须演示 spec debt、waiver、verify summary 和 handoff packet 的基本用法。

预期文件：

- `examples/minimal-legacy-takeover/`
- `examples/minimal-greenfield/`
- `docs/first-takeover-walkthrough.md`
- `.github/workflows/jispec-verify-template.yml`
- `docs/ci-templates.md`
- 新增样例 smoke 测试，按实现需要命名

验收：

- 一个外部团队可以在 15 分钟内跑完最小 takeover。
- CI 模板只调用本地 CLI gate，不上传源码，不把 LLM 放入 blocking path。
- 样例 repo 的期望输出可回归，避免文档与实际 CLI 漂移。

完成记录：

- 新增 `examples/minimal-legacy-takeover/`，覆盖 `bootstrap discover -> bootstrap draft -> adopt -> policy migrate -> verify -> ci:verify` 的最小 legacy takeover。
- 新增 `examples/minimal-greenfield/`，用 requirements 和 technical solution 输入演示 Greenfield `init -> verify -> ci:verify`。
- 新增 `docs/first-takeover-walkthrough.md`，把首次接管拆成 discover、draft、adopt、policy、verify、ci:verify、handoff packet 七步。
- 新增 GitHub Actions 模板 `.github/workflows/jispec-verify-template.yml` 与 GitLab 模板 `.gitlab-ci.jispec-template.yml`，模板都只调用本地 `npm run ci:verify`，保留 `.jispec-ci/` artifacts，不上传源码，不引入 LLM blocking path。
- 新增 `docs/ci-templates.md`，明确 CI summary/comment 是展示产物，本地 verify report 才是机器 gate 结果。
- 新增 `tools/jispec/tests/p4-sample-ci-templates.ts` 并纳入 regression runner，覆盖 legacy sample 可跑通、Greenfield sample 可初始化验证，以及模板/文档/包发布文件面不漂移。

### P4-T3 文档体验

状态：已实现

范围：

- Quickstart
- takeover guide
- execute-default guide
- Console governance guide
- policy/waiver/spec debt cookbook

预期文件：

- `docs/quickstart.md`
- `docs/takeover-guide.md`
- `docs/execute-default-guide.md`
- `docs/console-governance-guide.md`
- `docs/policy-waiver-spec-debt-cookbook.md`

验收：

- Quickstart 回答“我现在该运行哪三个命令”。
- Takeover guide 回答“哪些草稿应该 accept/edit/defer/reject”。
- Execute guide 明确 JiSpec 只做 implementation mediation。
- Console guide 明确 Console 不替代 `verify`、`ci:verify` 或本地 policy gate。
- Cookbook 必须包含常见 waiver、spec debt、policy migrate 和 release compare 操作。

完成记录：

- 新增 `docs/quickstart.md`，直接回答首次用户应先运行 `npm install`、`doctor v1`、`bootstrap discover` 三条命令，并区分 legacy takeover 与 Greenfield 下一步。
- 新增 `docs/takeover-guide.md`，明确 discovery、draft、adopt、verify 的语义，并给出 `accept`、`edit`、`defer`、`reject` 的判断标准。
- 新增 `docs/execute-default-guide.md`，说明 execute-default 只做 implementation mediation、scope/test/verify/handoff/replay，不拥有业务代码实现。
- 新增 `docs/console-governance-guide.md`，把 Console 定义为本地只读治理台，明确不替代 `verify`、`ci:verify` 或本地 policy gate。
- 新增 `docs/policy-waiver-spec-debt-cookbook.md`，覆盖 policy migrate profile、waiver create/list/renew/revoke、spec debt owner-review/repay/cancel、release snapshot/compare 和 Console actions。
- README、中文 README 与 install 文档已增加 P4-T3 文档入口。
- 新增 `tools/jispec/tests/p4-docs-experience.ts` 并纳入 regression runner，覆盖文档关键承诺与命令面 help 不漂移。

### P4-T4 Guided first-run flow

状态：已实现

范围：

- 增加一个面向首次用户的 guided command，按仓库状态给出下一步动作。
- 识别 project scaffold、bootstrap evidence、open draft、policy、verify result、active change session。
- 输出短决策包，而不是暴露机器底账。

预期文件：

- `tools/jispec/onboarding/first-run.ts`
- `tools/jispec/tests/onboarding-first-run.ts`
- `docs/quickstart.md`

验收：

- 空目录、旧仓库、已有 `.spec` 仓库和 active change session 都能得到不同 next action。
- guided flow 只推荐现有稳定 CLI，不引入新的绕行主线。
- 输出必须说明哪些动作会写入本地 artifact。

完成记录：

- 新增 `npm run jispec -- first-run --root .`，基于本地状态输出只读 first-run decision packet。
- 新增 `tools/jispec/onboarding/first-run.ts`，识别 empty directory、legacy repo source signals、bootstrap evidence、open draft session、adopted contracts、policy、latest CI verify report 和 active change session。
- Guided flow 只推荐现有稳定 CLI：`init`、`bootstrap discover`、`bootstrap draft`、`adopt`、`policy migrate`、`verify`、`console dashboard`、`implement`。
- 输出包含 `writesLocalArtifacts` 和 `writes`，说明推荐命令会写哪些本地 artifact；`first-run` 自身保持 read-only、不上传源码、不引入 LLM blocking gate。
- Quickstart、README 和中文 README 已加入 guided first-run 入口。
- 新增 `tools/jispec/tests/onboarding-first-run.ts` 并纳入 regression runner，覆盖空目录、旧仓库、open draft、缺 policy、verify blocked 和 active change session。

## P5：Console 产品化与团队治理台

目标：把 Console 从 read model、dashboard shell 和 action planner 推进到真正的团队治理工作台，但仍然不替代本地 CLI gate。

### P5-T1 Local Console UI MVP

状态：已实现

范围：

- 提供本地只读 Web UI 或 TUI，第一屏是治理状态。
- 展示 mergeability、policy posture、waiver lifecycle、spec debt、contract drift、release drift、takeover quality、implementation mediation outcomes 和 audit events。
- UI 只读取 Console read model artifacts，不扫描源码。

预期文件：

- `tools/jispec/console/ui/`
- `docs/console-governance-guide.md`
- `tools/jispec/tests/console-ui-smoke.ts`

验收：

- Console UI 可在无网络情况下运行。
- 第一屏回答“当前能否合并、为什么、下一步谁处理”。
- UI 不执行写入命令；所有写入仍通过本地 CLI 并留下 audit event。

完成记录：

- 新增 `npm run jispec -- console ui`，生成本地静态 HTML：`.spec/console/ui/index.html`。
- 新增 `tools/jispec/console/ui/static-dashboard.ts`，复用 Console dashboard、read model snapshot 和 governance action planner，第一屏直接展示 governance status。
- UI 覆盖 mergeability、policy posture、waiver lifecycle、spec debt、contract drift、release baseline/drift、takeover quality、implementation mediation outcomes 和 audit events。
- UI 边界固定为 read-only、offline-capable、no source upload、does not override verify、does not scan source code、does not execute commands。
- `docs/console-governance-guide.md` 增加 Local UI 使用说明。
- 新增 `tools/jispec/tests/console-ui-smoke.ts` 并纳入 regression runner，覆盖 UI model 边界、HTML 第一屏、静态文件写出和 CLI JSON 输出。

### P5-T2 Governance workflow decision packets

状态：已实现

范围：

- 为 waiver renew/revoke、spec debt repay/cancel/owner-review、policy migrate、release compare 生成更完整的人类决策包。
- 每个建议必须包含 owner、reason、risk、source artifact、affected contract 和推荐 CLI command。
- 支持 reviewer 在 Console 中复制或跳转执行本地 CLI 命令，但 Console 本身不隐式写入。

预期文件：

- `tools/jispec/console/governance-actions.ts`
- `tools/jispec/console/governance-dashboard.ts`
- `docs/console-governance-guide.md`
- `tools/jispec/tests/console-governance-actions.ts`

验收：

- 人类能从 Console 看出“这个 waiver 为什么要撤销或续期”。
- spec debt action 能区分 repay、cancel、owner-review。
- 所有动作建议都可追溯到本地 artifact。

完成记录：

- `ConsoleGovernanceActionPacket` 增加 `owner`、`risk`、`recommendedCommand`、`affectedContracts`、`commandWrites` 和嵌套 `decisionPacket`。
- waiver renew/revoke、spec debt repay/cancel/owner-review、policy migrate 和 release compare 都输出 owner、reason、risk、source artifact、affected contract/reference 和推荐 CLI command。
- 过期 spec debt 同时生成 repay ready packet 与 cancel needs-input packet，避免把“偿还”和“取消”混成同一类治理动作。
- `console actions` 文本和 JSON 输出都保留 read-only planner 边界；执行写入仍必须走显式本地 CLI 并写入 audit event。
- Local Console UI 的 Suggested Local Commands 卡片展示 decision packet 字段，并提供推荐命令复制控件；UI 仍不执行命令、不扫描源码、不替代 `verify`。
- `tools/jispec/tests/console-governance-actions.ts` 和 `tools/jispec/tests/console-ui-smoke.ts` 覆盖 decision packet 字段、spec debt 三分支、source artifact traceability 和 UI 展示。

### P5-T3 Multi-repo governance aggregator

状态：已实现

范围：

- 消费多个 repo 导出的 `.spec/console/governance-snapshot.json`。
- 聚合 policy posture、waiver/debt inventory、release drift trend、verify trend 和 audit activity。
- 不要求云服务；先支持本地目录或显式 snapshot 列表。

预期文件：

- `tools/jispec/console/multi-repo.ts`
- `docs/multi-repo-governance.md`
- `tools/jispec/tests/console-multi-repo-governance.ts`

验收：

- 多仓汇总不得扫描各 repo 源码，只读取导出的 governance snapshot。
- 输出能显示风险最高的 repo、即将过期的 waiver、未偿还 spec debt 和 drift 热点。
- 单仓 `verify` 结论仍是权威 gate，多仓 Console 只做治理聚合。

完成记录：

- 新增 `tools/jispec/console/multi-repo.ts`，只消费导出的 `.spec/console/governance-snapshot.json`，支持显式 snapshot 列表和本地目录发现。
- 新增 `npm run jispec -- console aggregate-governance --snapshot ...` 与 `--dir ...`，默认写出 `.spec/console/multi-repo-governance.json` 和 Markdown companion。
- 聚合结果包含 repo risk score、verify verdict inventory、policy profile inventory、waiver hotspots、spec debt hotspots、release drift hotspots 和 latest audit actors。
- 单仓 export 的 aggregate hints 增加 `expiringSoonWaivers` 与 `expiredWaivers`，多仓层可以直接回答哪些 waiver 即将过期或已经过期。
- 聚合 boundary 固定为 local-only、read-only aggregate、consumes exported snapshots only、does not scan source、does not run verify、does not replace CLI gate。
- 新增 `docs/multi-repo-governance.md` 和 `tools/jispec/tests/console-multi-repo-governance.ts`，覆盖显式 snapshot、目录发现、CLI JSON、风险热点和单仓 verify 权威边界。

## P6：企业可信与合规边界

目标：让 JiSpec 的本地优先、可审计、可回放能力具备团队和企业采用所需的信任边界。

### P6-T1 Audit ledger hardening

状态：已实现

范围：

- 为 `.spec/audit/events.jsonl` 增加 hash chain 或签名预留字段。
- 检测 audit ledger 缺口、乱序、损坏或不可解析事件。
- Console 显示 audit integrity 状态，但不把它作为唯一 merge gate。

预期文件：

- `tools/jispec/audit/event-ledger.ts`
- `tools/jispec/console/read-model-snapshot.ts`
- `tools/jispec/tests/audit-event-ledger.ts`
- `docs/audit-ledger.md`

验收：

- audit event 可证明顺序和来源。
- 损坏 ledger 进入治理 warning，不静默通过。
- 仍保持 append-only 本地 artifact 语义。

完成记录：

- `AuditEvent` 增加 `sequence`、`previousHash`、`eventHash` 和 `signature` 预留字段；新事件以 canonical JSON 内容计算 SHA-256 hash chain。
- 新增 `inspectAuditLedger`，检测 JSONL 不可解析、必填字段缺失、sequence gap、previous hash mismatch、event hash mismatch、timestamp out-of-order 和 legacy unchained event。
- `appendAuditEvent` 在写入前读取当前 ledger integrity，继续保持本地 append-only JSONL 语义；invalid ledger 需要人工 review 后再追加。
- Console read model 的 `audit_events` summary 增加 `integrityStatus`、verified/legacy/parse error counts、latest hash、issue count 和 issue 摘要。
- Governance dashboard 在 audit integrity 为 warning/invalid 时显示 attention，不把损坏 ledger 静默当成可追溯 OK，也不替代 `verify` 或 `ci:verify`。
- 新增 `docs/audit-ledger.md`，说明 hash chain、签名预留、integrity warning 与 append-only 边界。
- `tools/jispec/tests/audit-event-ledger.ts` 覆盖 hash-chain 写入、损坏/乱序/不可解析 ledger 检测，以及 Console audit integrity summary。

### P6-T2 Secret redaction and privacy report

状态：已实现

范围：

- 在 discover、summary、handoff、Console export 中加入 secret redaction 检查。
- 明确哪些 artifact 可能包含路径、摘要、diff、命令输出或错误信息。
- 生成 privacy report，帮助团队判断哪些文件可以分享给外部工具或供应商。

预期文件：

- `tools/jispec/privacy/redaction.ts`
- `tools/jispec/tests/privacy-redaction.ts`
- `docs/privacy-and-local-first.md`

验收：

- 常见 token、key、credential、connection string 不应出现在人类分享包中。
- redaction 不改变机器事实源，只生成可分享视图或 warning。
- 文档明确 JiSpec 核心 CLI 不要求源码上传。

完成记录：

- 新增 `tools/jispec/privacy/redaction.ts`，提供 deterministic local secret scanner、`redactTextForSharing`、`redactJsonForSharing` 和 privacy report writer。
- 新增 `npm run jispec -- privacy report`，扫描 `.spec`、`.jispec`、`.jispec-ci` 下的 JiSpec 产物，默认写出 `.spec/privacy/privacy-report.json`、Markdown companion 和 `.spec/privacy/redacted/**` 可分享视图。
- Redaction 覆盖 private key block、AWS access key、OpenAI-style API key、GitHub token、JWT、credential-bearing connection string 和 credential assignment。
- Privacy report 只记录 finding type、severity、line/column、secret hash 和 redacted preview，不把原始 secret 写入报告。
- `console export-governance` 写出前会对 governance snapshot 做 redaction，并记录 privacy hint；底层 local snapshot、policy、waiver、audit、handoff 等机器事实源不被修改。
- 新增 `docs/privacy-and-local-first.md`，明确 JiSpec 核心 CLI 不要求源码上传，privacy report 是本地 companion，不替代 `verify` 或 `ci:verify`。
- 新增 `tools/jispec/tests/privacy-redaction.ts` 并纳入 regression runner，覆盖常见 secret redaction、报告无原文泄漏、redacted companion、Console export redaction 和 CLI JSON。

### P6-T3 Policy approval workflow contract

状态：已实现

范围：

- 定义 policy、waiver、release drift、execute-default 变更所需的 owner/reviewer approval contract。
- `solo`、`small_team`、`regulated` profile 应有不同 approval 要求。
- Console 能显示 approval missing、approval stale 或 approval satisfied。

预期文件：

- `schemas/approval.schema.json`
- `tools/jispec/policy/approval.ts`
- `tools/jispec/tests/policy-approval-workflow.ts`
- `docs/policy-approval-workflow.md`

验收：

- regulated profile 至少能表达双 reviewer 或 owner approval。
- approval contract 不让 LLM 成为 blocking judge。
- 所有 approval 决策写入 audit event。

完成记录：

- 新增 `schemas/approval.schema.json`，固定 `.spec/approvals/*.json` 的本地 approval decision contract。
- 新增 `tools/jispec/policy/approval.ts`，支持 `policy_change`、`waiver_change`、`release_drift`、`execute_default_change` subject，按 `solo`、`small_team`、`regulated` profile 计算 reviewer quorum 或 owner approval。
- 新增 `npm run jispec -- policy approval status|record`，`record` 会写 approval JSON 并追加 `policy_approval_decision` audit event。
- Console read model 新增 `policy-approvals` artifact 与 `approval_workflow` governance object，dashboard 展示 approval missing、approval stale、approval satisfied。
- 新增 `docs/policy-approval-workflow.md` 和 `tools/jispec/tests/policy-approval-workflow.ts`，覆盖 regulated 双 reviewer/owner approval、stale hash/expiration、CLI audit、Console posture 和 no-LLM-boundary。

## P7：生态集成与外部生产设备适配

目标：让 JiSpec 更容易接入真实团队已经使用的 coding agents、CI、issue tracker 和 contract source，而不改变 JiSpec 的控制层定位。

### P7-T1 External coding tool handoff adapters

状态：已实现

范围：

- 为 Codex、Claude Code、Cursor、Copilot、Devin 等外部实现者定义 handoff adapter contract。
- 输出更聚焦的 request packet：allowed paths、contract focus、test command、verify command、failed check、stop point。
- 接收外部 patch 后仍走 `implement --external-patch` 的 scope/test/verify 路径。

预期文件：

- `tools/jispec/implement/adapters/`
- `schemas/implementation-handoff.schema.json`
- `docs/external-coding-tool-adapters.md`
- `tools/jispec/tests/implement-handoff-adapters.ts`

验收：

- adapter 只改变交接格式，不改变 implementation mediation 权威边界。
- 外部工具输出不能直接绕过 scope check、test 和 verify。
- handoff packet 仍可 replay。

完成记录：

- 新增 `tools/jispec/implement/adapters/handoff-adapter.ts`，从 replayable handoff packet 生成 Codex、Claude Code、Cursor、Copilot、Devin 的 focused request packet。
- 新增 `schemas/implementation-handoff.schema.json`，固定外部 coding tool handoff 的 JSON contract，包含 allowed paths、contract focus、test/verify command、failed check、stop point 和 replay commands。
- 新增 `npm run jispec -- handoff adapter --from-handoff <path-or-session> --tool <tool>`，默认写出 `.jispec/handoff/adapters/<session>/<tool>-request.json` 和 Markdown companion。
- 新增 `docs/external-coding-tool-adapters.md`，明确 adapter 只改变请求格式，外部 patch 必须回到 `implement --external-patch` 接受 scope/test/verify mediation。
- 新增 `tools/jispec/tests/implement-handoff-adapters.ts`，覆盖工具枚举、request packet 内容、authority boundary、writer 不修改源 handoff、CLI 和 schema boundary 字段。

### P7-T2 SCM and issue tracker integration contracts

状态：已实现

范围：

- 定义 GitHub/GitLab PR comment、Jira/Linear issue link、change intent 回填的 contract。
- 初期可以生成 Markdown 和 JSON payload，不要求云端 API 写入。
- PR/MR 摘要应引用 verify verdict、blocking issues、waiver/spec debt、handoff next action。

预期文件：

- `tools/jispec/integrations/scm/`
- `tools/jispec/integrations/issues/`
- `docs/integrations.md`
- `tools/jispec/tests/integration-payloads.ts`

验收：

- 集成 payload 不成为新的机器真相源；真相仍来自本地 artifacts。
- CI comment 与 local verify summary 语言一致。
- 不需要云 token 也能生成 payload preview。

完成记录：

- 新增 `tools/jispec/integrations/scm/payload.ts` 和 `tools/jispec/integrations/issues/payload.ts`，从本地 verify report、Console governance read model 和最新 handoff 生成 SCM/issue tracker payload preview。
- 新增 `npm run jispec -- integrations payload --provider github|gitlab|jira|linear --kind scm_comment|issue_link`，默认写出 `.spec/integrations/**` JSON 和 Markdown companion。
- GitHub/GitLab comment payload 引用 verify verdict、blocking/advisory counts、waiver/spec debt posture、handoff next action 和 change intent。
- Jira/Linear issue-link payload 生成 suggested title、body Markdown、change intent backfill、labels 和本地 artifact refs，不要求云 token。
- 新增 `docs/integrations.md` 和 `tools/jispec/tests/integration-payloads.ts`，覆盖 preview-only boundary、local artifacts source of truth、CI comment 与 local verify summary 的 next-action 语言一致性。

### P7-T3 Contract source adapters

状态：已实现

范围：

- 强化 OpenAPI、Protobuf、GraphQL、DB migration、test framework 和 monorepo manifest 的 source adapter。
- 每个 adapter 必须输出 deterministic evidence，不引入 LLM blocking gate。
- adapter evidence 应进入 adoption ranking、contract graph 和 verify facts。

预期文件：

- `tools/jispec/bootstrap/`
- `tools/jispec/greenfield/`
- `tools/jispec/verify/`
- `docs/contract-source-adapters.md`
- 新增 adapter 回归测试，按实现需要命名

验收：

- adapter 能提高 takeover signal precision，而不是增加噪声。
- 弱证据仍进入 owner-review 或 spec debt，不伪装成 adopted contract。
- 多语言 monorepo fixture 的 ranking 和 draft quality 不退化。

完成记录：

- 新增 `tools/jispec/bootstrap/contract-source-adapters.ts`，在 `bootstrap discover` 中写出 `.spec/facts/bootstrap/contract-source-adapters.json`，覆盖 OpenAPI、Protobuf、GraphQL、DB migration、test framework 和 monorepo manifest。
- adapter report 明确标记 `deterministic: true`、`llm_blocking_gate: false`、adoption disposition，以及是否进入 adoption ranking、contract graph、verify facts。
- 扩展 bootstrap schema/manifest 识别与 adoption ranking metadata，使 OpenAPI/Protobuf/GraphQL/database schema 作为强契约源优先于弱 route/module 噪声。
- 扩展 Greenfield static collector，识别 `.proto`、OpenAPI、GraphQL schema 与 monorepo manifest；嵌入式/弱 GraphQL surface 进入 unresolved owner-review 路径，不作为 adopted contract。
- 新增 `docs/contract-source-adapters.md` 和 `tools/jispec/tests/contract-source-adapters.ts`，覆盖 adapter report、ranking precision、contract graph 映射、verify unresolved facts 和多语言 monorepo fixture。

## P8：商业价值证明与运营指标

目标：把工程质量指标转成用户能理解、团队能复盘、商业化能展示的价值指标。

### P8-T1 ROI and adoption metrics

状态：已实现

范围：

- 在不上传源码的前提下统计首次 takeover 时间、adopt correction load、blocking issue caught、waiver/debt aging、execute mediation stop points。
- 输出 repo-local value report。
- Console 显示趋势，但不把商业指标作为 blocking gate。

预期文件：

- `tools/jispec/metrics/value-report.ts`
- `docs/value-metrics.md`
- `tools/jispec/tests/value-report.ts`

验收：

- 报告能回答“JiSpec 本周减少了多少人工整理、提前暴露了哪些风险”。
- 指标来源必须可追溯到本地 artifacts。
- 不采集个人敏感信息，不默认联网。

完成记录：

- 新增 `tools/jispec/metrics/value-report.ts` 和 `npm run jispec -- metrics value-report`，默认写出 `.spec/metrics/value-report.json` 与 Markdown companion。
- Value report 汇总首次 takeover 时间、adopt correction load、blocking/advisory risk surfaced、waiver/debt aging 和 execute mediation stop points。
- 报告只读取 `.spec/`、`.jispec/`、`.jispec-ci/` 下的本地 JiSpec artifacts，记录 source artifact paths，不扫描源码、不默认联网、不采集个人敏感信息。
- Console read model 将 `.spec/metrics/value-report.json` 纳入 `takeover_quality_trend`，用于显示价值趋势，但不替代 `verify`、`ci:verify` 或任何 blocking gate。
- 新增 `docs/value-metrics.md` 和 `tools/jispec/tests/value-report.ts`，覆盖本周人工整理节省、风险提前暴露、artifact traceability、隐私边界、Console trend 显示和 CLI 输出。

### P8-T2 Commercial pilot readiness checklist

状态：已实现

范围：

- 定义一个团队试点 JiSpec 前后的检查清单。
- 覆盖安装、首次 takeover、CI 接入、policy profile、waiver/spec debt、Console governance、privacy report。
- 输出 pilot readiness summary。

预期文件：

- `docs/pilot-readiness-checklist.md`
- `tools/jispec/doctor.ts`
- `tools/jispec/tests/pilot-readiness.ts`

验收：

- `doctor` 能区分 engineering readiness 和 commercial pilot readiness。
- checklist 不承诺全自动理解旧仓库。
- 每个 blocker 都给出 owner action 和下一步命令。

完成记录：

- 新增 `doctor pilot`，与 `doctor v1`/`doctor runtime` 分离：`v1` 继续检查工程主线 readiness，`pilot` 检查商业试点所需的 repo-local artifact 和治理准备度。
- Pilot checklist 覆盖安装入口、首次 takeover/Greenfield baseline、CI verify、policy profile、waiver/spec debt、Console governance snapshot 和 privacy report。
- `DoctorCheckResult` 增加 `ownerAction`、`nextCommand` 和 `sourceArtifacts`，pilot blocker 可直接告诉 owner 下一步本地命令。
- 新增 `docs/pilot-readiness-checklist.md`，明确 checklist 不承诺自动理解旧仓库，legacy takeover 仍需 owner review/adopt/spec debt/verify。
- 新增 `tools/jispec/tests/pilot-readiness.ts` 并纳入 regression runner，覆盖 pilot/v1 区分、blocker owner action、ready fixture、CLI JSON 和文档边界。

### P8 文档状态同步

状态：已同步

- `README.md` 和 `README.zh-CN.md` 已补充 `metrics value-report`、`doctor pilot` 的一等入口说明。
- 核心文档索引已纳入 `docs/value-metrics.md` 与 `docs/pilot-readiness-checklist.md`。
- `docs/console-read-model-contract.md` 已记录 `.spec/metrics/value-report.json` 进入 `takeover_quality_trend`，且不替代本地 verify/CI gate。

## 当前不做

- 不把安装体验放到 takeover 质量之前。
- 不把 Console 做成只看 artifact 的终局产品。
- 不把 LLM 输出放进 blocking verify path。
- 不把 JiSpec 做成自主业务代码实现 agent。
- 不让 distributed/collaboration/presence 绕过 V1 主线和本地 gate。
- 不为了表面功能数量牺牲 deterministic、audit、replay 和 blocking semantics。
- 不为了商业化包装牺牲本地优先、隐私边界或可回放性。
- 不把 Console、多仓聚合或集成 payload 变成新的事实权威；事实权威仍是本地 contract artifacts、facts、policy、verify 和 audit ledger。

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
