# JiSpec V1 主线完成清单

## 文档目的

这份清单只回答一个问题：

当前仓库距离“V1 主线可以宣称完成”还差什么。

这里的 `V1 主线` 固定指：

`bootstrap discover -> bootstrap draft -> adopt -> verify -> ci:verify -> change -> implement -> verify --fast/full`

本清单不继续扩张以下方向：

- `console`
- `distributed`
- `collaboration`
- `presence`
- `direct LLM blocking path`

只有当前主线完成后，这些方向才值得重新排期。

## 完成判定

只有同时满足下面 5 条，才可以认为当前仓库的 V1 主线已经完成：

1. 存在一条单一、可重复的端到端黄金路径验收。
2. `doctor` 能反映 V1 主线 readiness，而不是被延后功能拖红。
3. 主线相关能力全部纳入统一回归矩阵。
4. 存在一个最小接入样板，可以演示老仓库首次接入。
5. 主线命令、落盘文件、退出码、JSON/CI contract 有统一稳定说明。

## 当前判断

当前仓库已经具备：

- `bootstrap / adopt / verify / change / implement / ci:verify / policy migrate` 的 CLI 入口
- `bootstrap`、`verify`、`change`、`implement` 的分层模块和持久化落点
- 覆盖多条主线片段的函数级和场景级测试

当前仓库还不适合直接宣称 “V1 主线已完成” 的原因不是核心代码缺失，而是最后一轮产品级收口尚未完成。

## 优先级 Top 3

下面 3 条是现在最值得先做的工作，按投入产出比排序。

### P1. 增加一条真正的黄金路径 E2E 验收

**为什么最划算**

这是最短路径的“能不能完整演示”证明。
如果没有这一条，当前能力仍然是分段成立，而不是主线成立。

**要交付什么**

- 新增 1 条单独的端到端验收脚本或回归测试
- 固定一个最小仓库夹具
- 从头跑通：
  - `jispec-cli bootstrap discover`
  - `jispec-cli bootstrap draft`
  - `jispec-cli adopt --interactive` 或等价非交互验收路径
  - `jispec-cli verify`
  - `npm run ci:verify`
  - `jispec-cli change "..."`
  - `jispec-cli implement --fast`
  - `jispec-cli verify --fast`

**必须断言**

- `.spec/facts/bootstrap/evidence-graph.json` 被写出
- `.spec/sessions/<sessionId>/manifest.json` 被写出并状态正确
- `.spec/handoffs/bootstrap-takeover.json` 被写出
- `verify` 产出稳定 verdict
- `.jispec-ci/verify-report.json` 与 `.jispec-ci/ci-summary.md` 被写出
- `change` 和 `implement` 产出的 lane / next step / handoff 语义正确

**完成标准**

- 这条测试能单独运行
- 失败时能直接定位主线断点
- 成功时可以作为对外演示脚本

### P2. 重构或补充 V1 专用 doctor readiness

**为什么最划算**

当前 `doctor` 仍带着大量 `distributed / collaboration / presence` 历史检查。
这会让“主线是否完成”与“远期实验功能是否完备”混在一起，严重干扰验收。

**要交付什么**

- 二选一：
  - 新增 `jispec-cli doctor v1`
  - 或把现有 `doctor phase5` 明确拆成 `core mainline` 与 `deferred surfaces`
- 把 V1 readiness 检查聚焦到：
  - bootstrap surface
  - adopt/takeover handoff
  - verify runtime
  - facts/policy surface
  - CI verify surface
  - change/implement mainline surface

**必须避免**

- 不再让 `distributed-*`、`collaboration-*`、`presence-*` 缺失直接阻断 V1 readiness

**完成标准**

- `doctor` 的结果可以直接回答“主线是否 ready”
- 失败项都能对应到本清单中的主线任务

### P3. 把主线能力全部纳入统一回归矩阵

**为什么最划算**

现在已经有很多好测试，但还没有完全收口到同一个“主线可信度”入口。
不纳入统一回归，主线就还没有真正封板。

**要交付什么**

- 更新 [regression-runner.ts](/D:/codeSpace/JiSpec/tools/jispec/tests/regression-runner.ts)
- 至少纳入这些现有关键套件：
  - `bootstrap-draft-quality.ts`
  - `bootstrap-adopt-handoff.ts`
  - `verify-contract-aware-core.ts`
  - `verify-bootstrap-takeover.ts`
  - `verify-baseline-hardening.ts`
  - `verify-waiver-hardening.ts`
  - `verify-mitigation-stacking.ts`
  - `ci-verify-wrapper.ts`
  - `implement-mainline-lane.ts`
  - `implement-handoff-mainline.ts`

**完成标准**

- 一条命令可以跑完主线关键回归
- `doctor` 中的回归统计与实际注册套件一致
- 主线回归失败时能快速定位是 `bootstrap / verify / ci / change / implement` 哪一段出问题

## 其余必须完成项

下面这些不是前 3 名，但仍然属于 V1 主线完成前必须收掉的工作。

### C4. 提供最小接入样板或 sample repo

**目标**

把 “首次接入老仓库” 从测试夹具提升为可复用的演示样板。

**要交付什么**

- 一个最小验收仓库，或仓内固定 sample repo 目录
- 一份接入脚本或 README
- 明确展示：
  - discover 扫出什么
  - draft 生成什么
  - adopt 后哪些资产进入 `.spec/contracts/`
  - verify 如何区分已接管与历史债务
  - `ci:verify` 在 CI 中产出哪些 artifacts

**完成标准**

- 新成员可以按文档独立跑通
- 该样板可用于录制产品演示

### C5. 固定 change / implement 的双模式串联语义

**目标**

避免主线语义停留在文案层，同时把最终产品形态固定下来。

**当前现状**

[change-command.ts](/D:/codeSpace/JiSpec/tools/jispec/change/change-command.ts) 当前主要生成 `nextCommands`，而不是自动执行整条链。

**要交付什么**

- 先固定产品决策文档：
  - 支持 `prompt / execute` 双模式
  - 模式由用户选择
  - 最终默认形态收敛到 `execute`
- 再在实现中兑现这份决策：
  - `prompt` 模式明确只给建议，不自动继续执行
  - `execute` 模式提供真正的编排入口或 wrapper
- 把这份语义同步到主线文档、CLI help、README、回归测试

**参考决策文档**

- [docs/change-implement-mode-decision.md](/D:/codeSpace/JiSpec/docs/change-implement-mode-decision.md)

**完成标准**

- 用户能明确知道自己当前选的是 `prompt` 还是 `execute`
- `prompt` 不会伪装成自动执行
- `execute` 不是只有 `nextCommands` 的文案假象
- 最终可以安全把默认模式切到 `execute`

### C6. 增加 CLI 级 adopt 验收

**目标**

把 adopt 从函数级可靠，提升到命令级可靠。

**要交付什么**

- 一条从 CLI 入口触发的 adopt 验收测试
- 覆盖：
  - session 解析
  - 结果落盘
  - takeover report 写入
  - 失败时退出语义

**完成标准**

- `adopt --interactive` 或等价可测试入口有命令级保障

### C7. 固定 V1 主线稳定契约文档

**目标**

把当前散落在 README、roadmap、task pack 文档里的规则收口。

**当前落点**

- [docs/v1-mainline-stable-contract.md](/D:/codeSpace/JiSpec/docs/v1-mainline-stable-contract.md)

**要交付什么**

- 一页稳定说明文档，至少包含：
  - 主线命令
  - 退出码
  - 关键落盘文件
  - verify JSON contract
  - CI artifacts
  - policy 默认路径
  - 当前明确不做什么

**完成标准**

- 新成员不需要在多份文档之间来回拼接主线语义

### C8. 做一次真实旧仓库接管演示记录

**目标**

验证“V1 Aha Moment”不是只在夹具中成立。

**当前落点**

- [docs/real-legacy-repo-takeover-breathofearth.md](/D:/codeSpace/JiSpec/docs/real-legacy-repo-takeover-breathofearth.md)
- [docs/real-legacy-repo-takeover-remirage.md](/D:/codeSpace/JiSpec/docs/real-legacy-repo-takeover-remirage.md)

**要交付什么**

- 选一个真实旧仓库
- 记录一次完整接管过程
- 输出一份演示记录或 demo notes

**完成标准**

- 能证明这条主线对真实老仓库也成立
- 能清楚暴露 discover/draft 的剩余噪声问题

`ReMirage` 这份样本比 `BreathofEarth` 更强，因为它额外验证了：

- 多组件 monorepo 接管
- `Go + TypeScript + Proto + deploy assets` 混合表面
- 严重 audit artifact 噪声下的首轮接管

## 建议执行顺序

按最稳妥的收口路径，建议这样推进：

1. 先做 `P1 黄金路径 E2E`
2. 立刻做 `P3 统一回归矩阵`
3. 然后做 `P2 V1 专用 doctor readiness`
4. 再补 `C4 最小接入样板`
5. 再明确 `C5 change/implement 串联语义`
6. 最后补 `C6/C7/C8`

## 完成后不该再犹豫的事情

如果本清单全部完成，就应该默认进入下面的产品判断：

- 当前仓库的 V1 主线已完成
- 下一轮资源不再优先补主线基础闭环
- `console / distributed / collaboration / direct LLM blocking path` 才重新进入排期讨论

## 当前不做什么

为了避免主线再次失焦，完成本清单之前不主动扩张：

- Console UI 新页面或新治理流程
- 分布式执行、远程缓存、presence、多人协作新能力
- 把 LLM 接到 verify blocking path
- 为了“看起来更完整”而进行的大规模 CLI 重构
