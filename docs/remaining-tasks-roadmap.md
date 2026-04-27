# JiSpec V1 剩余任务路线图

## 文档信息

- 版本: v2.0
- 更新日期: 2026-04-27
- 作用: 把商业计划里的 V1 主线，映射为当前仓库接下来真正要收口的工程任务

## 一句话结论

V1 现在不是继续往 `Task Pack 9+` 线性推进，而是把已经存在的底层能力重新收口成这条主线：

`bootstrap -> verify -> change -> implement`

其中：

1. `Bootstrap` 负责冷启动，把老仓库逆向整理成第一批可审契约草稿
2. `Verify` 负责确定性门禁，把接管后的契约放进本地和 CI 的稳定检查里
3. `Change` 和 `Implement` 已经有基础实现，但要等前两步稳定后才能真正形成闭环

## 当前真实状态

### 已经存在且可复用的能力

- `tools/jispec/bootstrap/`
  已有 `discover / draft / adopt / spec-debt` 骨架与基础测试
- `tools/jispec/verify/`
  已有 `verify-runner / verdict / baseline / waiver / observe` 骨架
- `tools/jispec/change/`
  已完成变更意图记录、lane 决策、fast lane 预判
- `tools/jispec/implement/`
  已完成预算受控 FSM、stall detection、handoff packet
- `tools/jispec/ci/`
  已有 CI wrapper 与平台输出适配雏形

### 当前还没有真正收口的地方

- `Bootstrap Discover` 能跑，但证据质量还不够高，噪声会直接污染后续草稿
- `Bootstrap Draft` 已能产出草稿，但还需要更强的 evidence ranking 与产物质量收敛
- `Adopt` 已有事务骨架，但还没有和 `Verify` 的 baseline / takeover 语义完全接上
- `Verify` 目前仍偏向 legacy validator 包装层，缺少“已认领契约 + 新增 drift”视角
- CI surface 已有入口，但还没有成为真正稳定的 required check 交付面
- 当前多数落盘产物仍偏 `machine-first`，人类理解接管结果仍要阅读高成本 JSON / manifest / debt 文件

## V1 闭环定义

本轮不是把所有蓝图做完，而是把下面 5 个动作变成可演示、可回归、可接入的主线：

1. 老仓库运行 `jispec-cli bootstrap discover`
2. 继续运行 `jispec-cli bootstrap draft`，拿到第一批可审草稿
3. 用户运行 `jispec-cli adopt --interactive` 完成第一轮接管
4. 仓库运行 `jispec-cli verify` 或 `npm run ci:verify`，在本地和 CI 中得到稳定结论
5. 日常小改动继续走 `change / implement --fast / verify --fast`

## 剩余任务总排序

1. `Task Pack 1A` Bootstrap Discover Hardening
2. `Task Pack 1B` Bootstrap Draft Quality
3. `Task Pack 1C` Bootstrap Adopt + Baseline Handoff
4. `Task Pack 2A` Verify Contract-Aware Core
5. `Task Pack 2B` Verify Baseline / Waiver / Observe Hardening
6. `Task Pack 2C` CI-Native Verify Gate
7. `Task Pack 3` Change / Implement 主线串联
8. `Task Pack 4` Facts Contract 与最小 Policy DSL

下面的工作在 V1 闭环跑通前明确延后：

- Console UI 扩面
- 分布式 / 协作 / presence 新功能
- 把 LLM 放进 blocking 路径

## Task Pack 1A: Bootstrap Discover Hardening

### 目标

把 `discover` 从“能扫出一些文件”提升为“能给 draft 提供高信噪比证据底座”。

### 用户动作

- `jispec-cli bootstrap discover`
- `jispec-cli bootstrap discover --json`
- `jispec-cli bootstrap discover --no-write`

### 当前缺口

- 会把测试夹具、模板、说明文档里的假路由当成真实候选
- test heuristic 过宽，`test-runner.ts` 这类实现文件也可能被误判
- 输出更像扫描日志，不像“仓库接管摘要”
- evidence graph 对后续排序缺少明确的 confidence / provenance 信号
- 默认落盘仍以大体量 JSON graph 为主，不够适合作为首次接管的人类阅读入口

### 本阶段实施点

- 为 `route / test / schema / migration` 增加 confidence 与 provenance
- 过滤 tests / templates / fixtures / docs 中的非生产路由信号
- 显式采集 README / architecture docs / project manifests，补充冷启动上下文
- 调整 evidence graph 排序，让高置信证据优先被 `draft` 消费
- 除完整 graph 外，再生成一份人类可快速浏览的 `bootstrap summary / takeover brief`
- 增加信号过滤回归测试

### 验收标准

- 真实仓库中的生产路由优先于测试夹具和模板中的伪路由
- discover 输出能直接展示“最值得接管的 API/contract signals”
- `draft` 读取同一 evidence graph 时，优先使用高置信信号
- 人类无需先打开大 JSON，也能知道“这次 discover 最值得接管的内容是什么”
- 输出 JSON 兼容旧 graph，没有破坏现有 `draft / adopt` 流程

## Task Pack 1B: Bootstrap Draft Quality

### 目标

让 `draft` 真正产出“可认领”的第一批契约，而不是仅有占位意义的草稿文件。

### 用户动作

- `jispec-cli bootstrap draft`
- `jispec-cli bootstrap draft --session latest`

### 实施点

- 基于 discover 的 confidence 对 route / schema / test 做优先级加权
- 优化 deterministic draft，让无 LLM 模式也能给出像样的 `domain / api / feature` 草稿
- 保持 LLM 只在草稿生成层出现，不进入阻断路径
- 强化 session manifest，便于后续 adopt / verify / debt 对接

### 验收标准

- 无 AI provider 时也能稳定生成第一批可审草稿
- 有 AI provider 时，provider 失败会优雅回退，不影响流程可用性
- 每个草稿都能说明来自哪些证据，以及可信度大概是多少

## Task Pack 1C: Bootstrap Adopt + Baseline Handoff

### 目标

把“看到草稿”推进到“真正接管仓库的第一批契约”。

### 用户动作

- `jispec-cli adopt --interactive`

### 实施点

- 保持 adopt 原子提交与失败回滚
- 将 accept / edit / reject / skip_as_spec_debt 的结果完整写入 manifest
- 接上初始 baseline 语义：已认领资产进入 verify 视野，未认领项进入 spec debt
- 补齐 adoption report 与后续 verify 所需的 takeover metadata

### 验收标准

- adopt 结束后，`.spec/contracts/`、`.spec/spec-debt/`、session manifest 三者状态一致
- verify 能区分“已接管”和“未接管历史债务”

## Task Pack 2A: Verify Contract-Aware Core

### 目标

把 verify 从 legacy validator 包装层，推进成面向契约接管状态的确定性 gate。

### 用户动作

- `jispec-cli verify`
- `jispec-cli verify --json`
- `jispec-cli verify --fast`

### 实施点

- 从 `.spec/contracts/`、bootstrap/adopt 输出、facts snapshot 中读取已认领资产
- 增加 contract-aware collectors，而不是只消费 legacy repository validation
- 四态输出固定为：
  - `PASS`
  - `FAIL_BLOCKING`
  - `WARN_ADVISORY`
  - `ERROR_NONBLOCKING`
- 对未支持技术栈默认降级，不让 verify 因分析器空缺直接硬炸

### 验收标准

- verify 结果能稳定区分 blocking / advisory / runtime-soft-fail
- 新接入老仓库不会因为历史债务直接全仓爆红

## Task Pack 2B: Verify Baseline / Waiver / Observe Hardening

### 目标

让 verify 具备真正可落地的“首次接入宽容、增量变更严格”的运营语义。

### 实施点

- baseline 指向历史问题，不掩盖新增问题
- waiver 支持 owner / reason / expiry / fingerprint
- observe mode 只降级严重性，不改写底层 issue 事实
- 补齐 JSON contract 回归测试与 issue fingerprint 稳定性测试

### 验收标准

- baseline、waiver、observe 三者可以叠加使用，且结果可预测
- 同一份代码快照可以重跑出一致 verdict

## Task Pack 2C: CI-Native Verify Gate

### 目标

把 verify 从本地命令收口成 CI required check。

### 用户动作

- `npm run ci:verify`

### 实施点

- 固化 JSON 输出协议与人类可读 summary
- 补齐 GitHub / GitLab comment draft 中的深链和解释信息
- 在 `doctor` 中加入 CI readiness 检查
- 为 sample repo 或最小验收仓库提供接入脚本

### 验收标准

- 团队可以在不引入 SaaS 单点依赖的前提下接入 required check
- PR/MR 能看到足够解释性信息，而不是只看到一行失败

## Task Pack 3: Change / Implement 主线串联

### 目标

把已经做完的 `change / implement` 放回新主线，而不是孤立存在。

### 产品决策

这一段不再做“二选一”，而是固定为：

- 支持 `prompt / execute` 双模式
- 模式由用户选择
- 最终默认模式收敛到 `execute`

其中：

- `prompt` = 提示式串联、解释模式、调试模式
- `execute` = 执行式串联、最终产品主形态

参考决策文档：

- [docs/change-implement-mode-decision.md](/D:/codeSpace/JiSpec/docs/change-implement-mode-decision.md)

### 实施点

- 先保留当前 `change` 的提示式基础能力，避免回归
- 新增用户可选的模式面：
  - `prompt` 模式只产出 session / lane / next commands
  - `execute` 模式真正串起主线
- Strict lane 的 `execute` 目标路径：
  `change -> adopt -> implement -> verify`
- Fast lane 的 `execute` 目标路径：
  `change -> implement --fast -> verify --fast`
- 当 diff 命中核心契约时自动从 fast promote 到 strict
- handoff packet 中补上契约上下文与 verify 下一步建议
- 在双模式都稳定后，把默认值切换为 `execute`

### 验收标准

- `prompt` 模式的行为和文案一致
- `execute` 模式能真实跑通，不是文案层编排
- 小改动保持低摩擦
- 核心契约变更会自动收紧流程

## Task Pack 4: Facts Contract 与最小 Policy DSL

### 目标

在 V1 闭环跑通后，再把 verify 规则从代码特例抬升到稳定 contract。

### 实施点

- 固化 `raw facts -> canonical facts -> policy evaluation`
- blocking rule 只允许依赖 stable facts
- 提供最小 YAML policy surface 与 migration/doctor 能力

### 验收标准

- 分析器升级不会让历史策略无故失效
- 同一仓库快照可以被完整重放

## 每一阶段都必须交付的东西

每个 task pack 都必须同时满足这 4 件事：

1. 有一个真实可演示的 CLI 命令
2. 有至少一条新增回归测试
3. 有明确的文件落点和状态持久化
4. 有“当前不做什么”的边界说明

## 当前建议执行顺序

1. 先做 `Task Pack 1A`，把 discover 的证据质量拉高
2. 立刻跟进 `Task Pack 1B`，让 draft 开始真正吃高质量 evidence
3. 然后做 `Task Pack 1C + 2A`，把 adopt 与 verify 打通
4. 最后补 `2B + 2C`，把 required check 和首次接入语义稳定下来

只有这条主线跑通后，`console / distributed / collaboration / direct LLM blocking path` 才值得重新排期。
