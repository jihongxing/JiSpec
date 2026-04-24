# JiSpec 长期愿景规划（Phase 4-6）

## 文档信息

- **版本**：v0.1
- **创建日期**：2026-04-24
- **状态**：Draft
- **范围**：在 Phase 1-3 已完成的基础上，定义 JiSpec 的中长期演进路线

## 当前基线

JiSpec 已经具备三项关键能力：

1. **单 Agent 执行能力**：可以围绕角色、输入、输出和约束执行一次可验证的交付动作。
2. **单切片约束能力**：可以在单个 slice 内强制只读输入、验证输出、更新 gates 和 trace。
3. **单切片/单上下文编排能力**：可以为单个 slice 生成任务、运行 pipeline、查看 context board，并在有限范围内并行执行阶段。

这意味着 JiSpec 已经从“协议定义器”进化成“单切片交付引擎”。下一阶段的目标，不再只是把一个 slice 跑通，而是把**整个仓库作为可编排系统**来运行。

## 北极星目标

JiSpec 的长期目标，是把仓库变成一个可以被人类与 AI 共同操作的 **Delivery Graph**：

- **图谱化**：不仅知道单个 slice 现在卡在哪，还知道它被谁阻塞、会影响谁、优先级为何变化。
- **可分布式执行**：不仅能在一台机器上串行/并行运行，还能把工作分发到不同 worker 和不同执行环境。
- **可实时协作**：不仅能记录结果，还能支持多人、多 agent 同时推进，并在冲突发生时提供结构化解决机制。

Phase 4-6 的关系如下：

- **Phase 4**：先建立仓库级依赖图，让系统“知道全局关系”
- **Phase 5**：再把依赖图变成可调度的执行网络，让系统“跑得动、跑得快”
- **Phase 6**：最后把执行网络升级成多人/多 agent 协作面，让系统“能长期稳定协同”

---

## Phase 4：跨切片依赖管理

### 目标

把 JiSpec 从“单切片生命周期管理”升级为“跨切片交付图管理”。系统不仅要知道一个 slice 的内部任务依赖，还要知道：

- 一个 slice 依赖哪些上游 slice
- 一个 slice 消费了哪些 context contract
- 上游变更后，哪些下游 slice 会变为 stale 或 blocked
- 哪条链路是当前上下文或整个仓库的关键路径

### 要解决的问题

当前系统已经能管理：

- `tasks.yaml` 中的**切片内任务依赖**
- `context.yaml` 中的**上下游上下文关系**
- `context board` 中的**单上下文执行视图**

但它还不能回答以下问题：

- “`ordering-checkout-v1` 是否依赖 `catalog` 的某个特定 slice？”
- “如果我改了 `contracts.yaml`，哪些 slice 的验证结果失效？”
- “当前仓库最值得优先推进的是哪一条依赖链？”
- “哪些 slice 看似 ready，其实被别的 slice 的未发布变更隐性阻塞？”

Phase 4 的本质，就是补上**仓库级因果关系层**。

### 核心能力

#### 4.1 Slice Dependency Graph

新增仓库级 slice 依赖图，支持三类依赖：

1. **显式交付依赖**
   - slice A 必须等待 slice B 到达某生命周期状态才能开始或推进
   - 例如：`ordering-checkout-v1` 依赖 `catalog-pricing-v2` 完成 `design-defined`

2. **契约依赖**
   - 下游 slice 消费上游 context 的 contract、schema、事件或 API
   - 例如：某个 checkout slice 依赖 `catalog/contracts.yaml` 中的价格查询契约

3. **任务级跨切片依赖**
   - 单个任务依赖别的 slice 中的具体任务
   - 例如：`TASK-A-003` 等待 `slice:catalog-pricing-v2#TASK-B-004`

#### 4.2 依赖传播与阻塞解释

系统需要自动推导以下状态：

- **blocked**：被明确上游未完成依赖阻塞
- **stale**：上游工件变更，当前 slice 虽然已完成，但需要重新验证或重新派生
- **ready_with_risk**：依赖满足，但上游存在未发布或兼容性未知变更
- **impacted**：不是直接依赖方，但处于受影响传播链上

每个阻塞状态都必须带有**解释路径**，例如：

`ordering-refund-v1 -> catalog-pricing-v2 -> catalog/contracts.yaml`

这样用户不仅知道“卡住了”，还知道“为什么卡住”。

#### 4.3 影响分析与选择性重跑

当任意一个关键工件变化时，JiSpec 需要支持：

- 计算直接影响 slice 列表
- 计算传播后的下游影响范围
- 判断哪些 slice 只需重新验证，哪些必须重新派生产物
- 生成建议动作：
  - `revalidate`
  - `replan`
  - `rerun behavior/test/design`
  - `manual review required`

这会成为后续缓存失效与分布式重跑的前置基础。

#### 4.4 关键路径与组合优先级

在仓库级依赖图建立后，JiSpec 应支持：

- 识别某个 context 的关键路径
- 识别跨 context 的交付瓶颈
- 综合以下因素计算优先级：
  - slice 业务优先级
  - 依赖深度
  - 阻塞 fan-out
  - 生命周期成熟度
  - 当前验证健康度

这会让 `context next` 从“局部推荐”升级成“全局最优先动作推荐”。

### 关键数据模型

建议在 Phase 4 引入以下数据扩展：

#### 1. `slice.yaml` 增强字段

```yaml
dependencies:
  slices:
    - slice_id: catalog-pricing-v2
      required_state: design-defined
      reason: "需要稳定的定价规则和字段定义"
      invalidation: revalidate
  contracts:
    - context_id: catalog
      contract: pricing-query
      version: "^2.1.0"
      compatibility: strict
```

#### 2. `tasks.yaml` 支持跨切片引用

```yaml
depends_on:
  - TASK-ORDERING-CHECKOUT-V1-002
  - slice:catalog-pricing-v2#TASK-CATALOG-PRICING-V2-004
```

#### 3. 新增依赖索引产物

- `.jispec/graphs/slice-dependency-index.json`
- `.jispec/graphs/impact-index.json`

这些文件不作为手工维护源，而是由 CLI 生成，用于加速查询和后续调度。

### CLI / 查询面设计

建议新增以下命令：

```bash
# 查看一个 slice 的上下游依赖
npm run jispec -- slice deps ordering-checkout-v1

# 查看一个 slice 的受影响范围
npm run jispec -- slice impact ordering-checkout-v1

# 渲染仓库级依赖图
npm run jispec -- repo graph --format mermaid

# 查看某个 context 的关键路径
npm run jispec -- context critical-path ordering
```

### 推荐实施拆分

#### Phase 4.1：依赖声明与 Schema
- 扩展 `slice.schema.json` 和 `tasks.schema.json`
- 为 slice 增加显式依赖声明
- 支持跨切片 task 引用

#### Phase 4.2：依赖图构建器
- 扫描仓库生成统一依赖图
- 检测循环依赖、非法引用、缺失 slice
- 输出标准化 graph snapshot

#### Phase 4.3：阻塞与影响分析器
- 计算 blocked/stale/impacted 状态
- 输出解释链和影响链
- 支持变更后的差量分析

#### Phase 4.4：全局视图升级
- 升级 `context board`
- 增加 repo 级 board / graph 视图
- 增加关键路径和 fan-out 排序

#### Phase 4.5：推荐动作引擎升级
- 升级 `slice next` / `context next`
- 引入跨切片优先级
- 生成更可靠的“先做什么”建议

### 验收标准

- 能声明并校验跨切片依赖
- 能检测仓库级循环依赖和非法引用
- 任意 slice 变更后，能在 5 秒内给出直接影响列表（中型仓库）
- `context next` 的推荐结果能解释依赖原因
- 对上游 contract 变更，系统能区分“重新验证”与“必须重跑”

### 成功指标

- **依赖可见性**：90% 以上活跃 slice 具备显式上游声明
- **阻塞解释率**：95% 以上 blocked 状态可生成解释链
- **误触发重跑率**：低于 10%

### 风险与护栏

- **风险**：依赖声明过重，维护成本高
  - **护栏**：优先自动推断，再允许显式覆盖
- **风险**：图过于复杂，用户理解成本高
  - **护栏**：默认只展示与当前 slice 或当前 context 相关的局部子图
- **风险**：依赖不准确导致错误调度
  - **护栏**：所有自动推断结果标注 `derived` 或 `declared`

---

## Phase 5：分布式执行和缓存

### 目标

把 JiSpec 从“本地编排器”升级成“分布式执行平面”。系统不仅能理解依赖关系，还能：

- 把任务分发到不同 worker
- 根据执行能力和成本选择执行位置
- 对可重复阶段进行内容寻址缓存
- 在失败、中断、重试后恢复进度
- 对整个仓库的运行成本、吞吐量和命中率有统一观测

### 要解决的问题

当前的 `parallel-executor.ts` 已经具备**单次 pipeline 内部的并发能力**，但依然有明显边界：

- 并发范围局限于单机单进程
- 无法在多个 worker 之间分发工作
- 重复执行不会复用历史产物
- 一旦仓库规模扩大，重新运行成本会快速上升

Phase 5 的目标，是把“执行一次”升级为“持续高效执行很多次”。

### 核心能力

#### 5.1 分布式调度

引入 `Coordinator + Worker` 模式：

- **Coordinator**
  - 负责任务切分、依赖调度、租约分配、结果汇总
- **Worker**
  - 负责实际执行 stage 或 slice 任务
  - 可带能力标签：`local`, `gpu`, `high-memory`, `secure`, `cheap-model`

调度维度至少包含：

- 依赖是否满足
- worker 能力是否匹配
- 当前队列长度
- 成本预算
- 缓存命中概率

#### 5.2 内容寻址缓存

为阶段执行结果建立可复用缓存键。缓存键建议由以下内容共同决定：

- 输入文件内容 hash
- 上游 trace snapshot
- stage config
- agent prompt 模板版本
- tool version
- model/provider 标识
- 环境标签

只有当这些条件一致时，才允许复用已有产物。

这意味着 JiSpec 可以安全回答：

- “这个 test 生成阶段真的要重跑吗？”
- “这次 verify 失败是新问题，还是命中了历史不稳定路径？”

#### 5.3 可恢复执行账本

每次运行都需要有可恢复的 run ledger：

- run id
- 触发来源
- 调度决策
- stage 尝试次数
- cache hit / miss
- worker 分配记录
- 最终产物摘要

推荐目录：

- `.jispec/runs/<run-id>/run.yaml`
- `.jispec/runs/<run-id>/events.log`
- `.jispec/cache/index.json`
- `.jispec/cache/blobs/`

#### 5.4 差量重跑

结合 Phase 4 的影响分析与 Phase 5 的缓存，JiSpec 应支持：

- 只重跑受影响的 stage
- 保留未受影响节点的结果
- 在变更范围小的时候做到秒级恢复
- 为用户解释“为什么这些阶段重跑、那些阶段复用”

#### 5.5 执行治理

随着分布式执行上线，需要内建治理机制：

- 并发配额
- 每 context / 每 user / 每 branch 的预算
- worker 心跳与失联回收
- 最大重试次数
- 大模型与小模型的成本策略
- 敏感 slice 的隔离执行

### 关键数据模型

#### 1. Worker 注册表

建议新增：

`agents/workers.yaml`

```yaml
workers:
  - id: worker-local-01
    labels: [local, cheap-model]
    max_concurrent: 4
    capabilities:
      providers: [stdio, command]
      contexts: [catalog, ordering]
```

#### 2. 缓存条目

```yaml
cache_entry:
  key: sha256:...
  stage_id: behavior
  slice_id: ordering-checkout-v1
  inputs_hash: sha256:...
  config_hash: sha256:...
  producer:
    worker_id: worker-local-01
    provider: command
    model: local-llm
  outputs:
    - path: contexts/ordering/slices/ordering-checkout-v1/behaviors.feature
      hash: sha256:...
```

#### 3. 运行账本

```yaml
run:
  id: run_20260424_001
  trigger: manual
  scope: slice
  target: ordering-checkout-v1
  status: running
  planned_nodes: 6
  completed_nodes: 3
  cache_hits: 2
  worker_allocations:
    - stage: design
      worker: worker-local-01
```

### CLI / 运维面设计

建议新增以下命令：

```bash
# 启动一个 worker
npm run jispec -- worker start --id worker-local-01

# 分发执行一个 slice
npm run jispec -- pipeline dispatch ordering-checkout-v1

# 查看运行状态
npm run jispec -- run status <run-id>

# 查看缓存统计
npm run jispec -- cache stats

# 解释某个阶段为何命中/未命中缓存
npm run jispec -- cache explain ordering-checkout-v1 --stage behavior

# 清理缓存
npm run jispec -- cache prune --older-than 7d
```

### 推荐实施拆分

#### Phase 5.1：运行账本与统一执行 ID
- 为每次 pipeline run 引入 run ledger
- 所有 stage result 绑定 run id
- 让失败恢复和重试有统一定位点

#### Phase 5.2：本地缓存层
- 先做单机内容寻址缓存
- 从最稳定的派生型阶段开始复用
- 先保证正确性，再追求高命中率

#### Phase 5.3：Worker 抽象
- 把本地执行器抽象成 worker 接口
- 支持本地 worker 与远程 worker 同构

#### Phase 5.4：协调器与租约
- 引入 coordinator
- 引入任务租约和心跳
- 支持 worker 崩溃后的任务回收

#### Phase 5.5：差量重跑与图调度
- 把 Phase 4 依赖图接入调度器
- 让调度从“线性 pipeline”升级为“图执行”

#### Phase 5.6：治理与成本控制
- 增加预算、配额、队列优先级
- 输出吞吐、成本、命中率报表

### 验收标准

- 同一输入下重复执行可命中缓存并复用结果
- worker 异常退出后，任务能被重新分配
- 对中型仓库进行增量变更时，平均重跑节点数下降 50% 以上
- run ledger 能完整回放一次执行链路
- 缓存解释功能能说明命中/失效原因

### 成功指标

- **缓存命中率**：稳定阶段达到 60%+
- **平均重跑范围**：相对全量执行减少 50%-70%
- **调度恢复时间**：worker 异常后 30 秒内完成回收
- **执行吞吐**：仓库级并发提升 3 倍以上

### 风险与护栏

- **风险**：缓存错误复用导致脏结果
  - **护栏**：缓存键必须包含 prompt/config/model/version
- **风险**：分布式执行增加系统复杂度
  - **护栏**：先本地缓存，后远程 worker，再统一协调
- **风险**：成本失控
  - **护栏**：默认引入预算和配额，所有高成本 provider 需要显式启用

---

## Phase 6：实时协作和冲突解决

### 目标

把 JiSpec 从“分布式执行系统”升级成“多人、多 agent 的实时协作系统”。系统不仅知道谁在跑什么，还知道：

- 谁正在编辑哪个 slice / 哪个工件
- 哪些状态变更会相互冲突
- 哪些冲突可以自动解决，哪些必须人工裁决
- 如何在保持协议一致性的前提下支持并发推进

### 设计原则

Phase 6 不建议一上来把所有文件都做成通用 CRDT。JiSpec 的工件类型差异很大：

- `slice.yaml` / `trace.yaml` / `tasks.yaml` 属于**结构化控制面**
- `requirements.md` / `evidence.md` 属于**文档工件**
- 实现代码属于**源码工件**

因此更合理的策略是**分层冲突模型**：

1. **控制面状态**：乐观并发控制 + revision 校验
2. **结构化工件**：字段级合并 + schema-aware merge
3. **代码和文档**：基于 Git/三方合并 + 语义校验 + AI 辅助解释

这比“一个协议统一吃掉所有冲突”更现实，也更容易落地。

### 核心能力

#### 6.1 Presence 与 Claim

系统要能表达“谁正在做什么”：

- 某个 user / agent 正在操作哪个 slice
- 正在执行哪个阶段
- 正在编辑哪个工件
- 是否持有软锁（claim）

claim 应该是**软锁**而不是强锁：

- 默认用于提示和协商
- 避免因为一个离线客户端把整个 slice 永久锁死
- 与租约机制结合，自动过期

#### 6.2 变更意图与 Revision

每次重要操作都应带 revision：

- 更新 gate
- 更新 lifecycle state
- 更新 tasks
- 写入 trace

如果客户端基于旧 revision 提交更新，系统应返回：

- 冲突字段
- 对方已提交的变更摘要
- 推荐合并策略

这能避免“最后写入覆盖一切”的隐性损坏。

#### 6.3 冲突检测

JiSpec 需要至少支持三类冲突：

1. **状态冲突**
   - 两方同时推进生命周期
   - 一方推进，另一方基于旧状态写 gate

2. **结构化工件冲突**
   - 两方同时修改 `tasks.yaml`、`trace.yaml`
   - 修改内容不违反 schema，但在业务上互相覆盖

3. **语义冲突**
   - 代码合并成功，但 trace 断裂
   - requirements 改了，但 test/evidence 仍引用旧行为

Phase 6 的价值，不只是发现文本冲突，而是发现**协议层冲突**。

#### 6.4 冲突解决工作流

推荐引入结构化冲突对象：

- `.jispec/conflicts/<conflict-id>.yaml`

内容包含：

- 冲突类型
- 涉及的 slice / 文件 / revision
- ours / theirs 摘要
- 自动建议策略
- 是否需要人工介入

可支持的解决策略：

- `ours`
- `theirs`
- `merge`
- `rebase-and-revalidate`
- `ai-assist`

#### 6.5 协作事件流

为后续 UI、通知、审计和回放，建议引入统一事件流：

- `.jispec/collab/events.log`

事件类型示例：

- `slice.claimed`
- `stage.started`
- `task.updated`
- `gate.updated`
- `state.advanced`
- `conflict.detected`
- `conflict.resolved`

这会成为实时面板、通知订阅和协作分析的基础。

### CLI / 协作面设计

建议新增以下命令：

```bash
# 认领一个 slice（软锁）
npm run jispec -- slice claim ordering-checkout-v1

# 查看当前协作者和活跃编辑
npm run jispec -- collab presence

# 监听实时事件
npm run jispec -- collab watch

# 查看冲突
npm run jispec -- conflict list

# 解决冲突
npm run jispec -- conflict resolve <conflict-id> --strategy merge
```

### 推荐实施拆分

#### Phase 6.1：Revision 与并发保护
- 为关键控制面文件引入 revision
- 更新操作必须携带 expected revision

#### Phase 6.2：Claim / Presence / Event 流
- 支持 slice claim
- 支持协作者可见性
- 支持事件订阅

#### Phase 6.3：结构化冲突检测
- 先覆盖 `tasks.yaml`、`trace.yaml`、slice 状态
- 对结构化文件做字段级差异分析

#### Phase 6.4：冲突对象与解决器
- 引入 conflict artifact
- 提供合并与回滚策略

#### Phase 6.5：语义冲突校验
- 在合并后自动触发 trace / gate / lifecycle 校验
- 发现“文本已合并但协议已损坏”的问题

#### Phase 6.6：实时协作界面
- 在 TUI 或后续 Web UI 中展示 presence、claims、冲突和运行事件

### 验收标准

- 并发更新同一 slice 状态时，系统能稳定检测 revision 冲突
- `tasks.yaml` / `trace.yaml` 的常见并发修改可自动合并
- 代码层合并后，如引发 trace/gate 断裂，系统能自动报警
- 冲突对象可追溯到具体 actor、revision 和解决动作
- 协作者能实时看到谁正在推进哪个 slice

### 成功指标

- **隐性覆盖率**：关键控制面文件“静默覆盖”事件降至接近 0
- **自动解决率**：结构化冲突 70% 以上可自动处理
- **协作感知延迟**：presence 更新延迟低于 3 秒
- **冲突定位时间**：平均从冲突发生到定位低于 5 分钟

### 风险与护栏

- **风险**：协作机制过重，影响单人使用体验
  - **护栏**：所有实时能力默认可降级为单机模式
- **风险**：AI 自动合并制造错误自信
  - **护栏**：AI 只给建议，不直接跳过验证
- **风险**：presence / claim 变成“假锁”
  - **护栏**：所有 claim 必须带租约和过期时间

---

## Phase 4-6 的里程碑关系

### 推荐落地顺序

1. **先做 Phase 4 的依赖图基础**
   - 没有仓库级依赖图，Phase 5 的调度和缓存失效就没有可靠依据

2. **再做 Phase 5 的本地缓存 + run ledger**
   - 不必一开始就做完整远程调度，可以先把正确的缓存和恢复模型跑通

3. **最后做 Phase 6 的 revision / conflict 模型**
   - 当执行与缓存稳定后，再把多人/多 agent 并发带入，风险最可控

### 建议节奏

- **Phase 4**：1 个版本周期，优先做 schema、graph、impact analysis
- **Phase 5**：1-2 个版本周期，优先做 ledger、本地缓存、worker 抽象
- **Phase 6**：1-2 个版本周期，优先做 revision、presence、结构化冲突解决

---

## 到 Phase 6 结束时，JiSpec 会变成什么

如果 Phase 4-6 按上面的顺序完成，JiSpec 将不只是一个“规范化 repo + CLI”，而会成为一个完整的 **AI 协作交付操作系统**：

- 对内，它是一个**协议驱动的仓库级交付图**
- 对执行，它是一个**可恢复、可缓存、可分布式调度的运行平面**
- 对协作，它是一个**支持多人和多 agent 并发推进的控制平面**

届时，JiSpec 能够支持的不再只是“把一个 slice 做完”，而是：

- 同时推进多个 context
- 在变更发生后精确计算影响范围
- 只重跑真正需要重跑的部分
- 让不同的人和不同的 agent 安全地并发协作
- 在全过程中保持 trace、gate、state 和 evidence 的一致性

这会让 JiSpec 从“可交付协议”进一步升级为“可持续演进的大型项目协作底座”。
