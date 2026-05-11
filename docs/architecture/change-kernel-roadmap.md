# Change Kernel 路线图

这份文档记录 Change Kernel 的落地结果和收口状态。`CK-01` 到 `CK-08` 已全部完成。

> 说明：下文的 `MBM`、`IPL`、`KTM`、`Ambiguity Debt`、`Execution Fork Governance Layer` 都已在当前仓库落地。当前代码基线见 [Change Kernel 代码审计](./change-kernel-code-audit.md)。

对应的实施计划见 [2026-05-10-change-kernel-implementation-plan.md](../../plans/2026-05-10-change-kernel-implementation-plan.md)。

## 代码审计结论

当前仓库已经具备这些现成能力：

- `change` 侧会创建并写入 session，决定 lane，并在 execute 模式下串起 `implement`
- `MBM` 已经把外部 mutation 归一化成 `derived_change` / `unmapped_mutation`
- `Ambiguity Debt Register` 已经承接无法归因的现实残留
- `Execution Fork Governance Layer` 已经裁决 canonical execution trace
- `KTM` 已经写出 kernel-log、state snapshot、audit ledger 的同一事务边界
- `verify` 已经按 kernel 输出消费权威状态，不再独立重建 truth
- `ci:verify` 作为 wrapper 继续保留，但不升格为语义入口

当前仓库里已经没有未补齐的核心模块缺口。

## 完成交付

- `CK-01` 共享内核模型
- `CK-02` MBM 归一化
- `CK-03` Ambiguity Debt Register
- `CK-04` IPL provenance 绑定
- `CK-05` Execution Fork Governance Layer
- `CK-06` KTM 运行时
- `CK-07` 执行面收敛
- `CK-08` 接 `verify` / `ci`

## 结论

JiSpec 的目标不是再做一个普通治理工具，而是收敛成一个 `deterministic provenance-bound execution OS`。

核心判断已经明确：

- `change` 是唯一语义入口
- `KTM` 是内部运行时
- `kernel-log`、`audit ledger`、`state snapshot` 是派生输出
- `MBM` 负责把现实世界的非 `change` 变动压缩进 change 语义空间
- `IPL` 负责把所有行为重新绑定到唯一的 `change_id`
- `Ambiguity Debt` 负责承接无法归因的残留现实，并反向影响未来解释

## 当前架构分层

```text
external mutation
  -> MBM normalize
  -> derived_change / unmapped_mutation
  -> Ambiguity Debt
  -> IPL reconcile lineage
  -> KTM transition
  -> kernel-log + ledger + snapshot
  -> feedback to MBM / IPL priors
```

### 每层职责

- `MBM`
  - 处理外部世界输入
  - 把 mutation 翻译成 change hypothesis
  - 不做 auto-adopt，不做 quarantine-only

- `Ambiguity Debt`
  - 已有本地 register 落盘层，保存无法归因的 mutation 残留
  - 记录 owner、confidence、reason、next_review
  - 作为结构性残留参与后续解释

- `IPL`
  - 绑定语义血缘
  - 检查 lineage 一致性
  - 防止 shadow execution surface

- `KTM`
  - 执行 deterministic state transition
  - 负责 atomic commit
  - 保证 single-writer consistency

- `Execution Surface`
  - `change` 是唯一语义入口
  - `implement`、`verify`、`doctor`、`policy`、`console`、`bootstrap` 都是派生操作面
  - `npm run ci:verify` 维持为独立 CI wrapper，不升格为语义入口
  - CLI help 已经显式分区：`Semantic entry surface`、`Derived operational surfaces`、`Mainline workflow shortcuts`、`Current CI wrapper`

## 收尾与维护

这套栈已经完成交付，后续只保留维护项：

- 保持 `change` 的单语义入口不回弹
- 保持 `verify` / `ci` 只消费 kernel 输出
- 保持 `MBM`、`IPL`、`KTM`、`EFGL`、`Ambiguity Debt` 的文档和测试一致
- 新增能力如果会改变 truth source，必须先更新回归再改实现

## 不做什么

- 不把 `verify` 升格成语义入口
- 不把 `CI` 变成 runtime authority
- 不把 `IDE` 变成 canonical truth source
- 不把 `quarantine` 当长期策略
- 不把 `auto-adopt` 当默认路径

## 历史交付顺序

1. `Ambiguity Debt Register`
2. `MBM` 稳定性规则
3. `IPL` feedback 机制
4. `Execution Fork Governance Layer` canonical trace 裁决
5. `KTM` state transition 约束
6. `change` 主入口收口验证

## 细化执行

### 1. Ambiguity Debt Register

#### 做什么

- 把 `unmapped_mutation` 变成可治理对象。
- 给每条残留记录补全 `owner`、`confidence`、`reason`、`next_review`、`source`、`candidate_change_ids`。
- 让它能从 `open -> reclassified -> resolved -> archived` 走完整生命周期。

#### 怎么做

- 先复用现有 `spec debt` / `waiver` 的生命周期和审计写法。
- 新增 ambiguity 类型，不要新建一套完全平行的 debt 系统。
- 将 MBM 的 `unmapped_mutation` 输出写入债务登记表。
- 提供重评命令或内部重评流程，让债务能被再次归因。

#### 怎么测试

- 同一 mutation 在同一 facts/policy 下，债务状态必须稳定。
- 先记录为 `unmapped_mutation`，再补充 facts 后必须能被重新分类或明确保留。
- 债务更新必须写入 audit 事件，不能静默修改。

#### 怎么验收

- 仓库里能看到统一的 ambiguity debt 记录。
- 每条记录都有 owner 和下一次复评点。
- 未归因现实不再以临时注释或日志碎片形式散落。

### 2. MBM

#### 做什么

- 把外部 mutation 变成 change hypothesis。
- 区分 `derived_change` 和 `unmapped_mutation`。
- 保证归因不是拍脑袋，而是可重复的语义投影。

#### 怎么做

- 固定输入集合：mutation、facts、policy、history。
- 输出保持两类：可映射变化与无法映射残留。
- 把分类逻辑写成稳定函数，避免依赖运行时偶然状态。
- 给每类外部输入建立最小映射规则，而不是一次性追求完备。

#### 怎么测试

- 同一输入重复运行，分类结果必须相同。
- 外部 patch、git commit、CI 自动修正、依赖变动都要有样例。
- 不能出现“今天是 derived_change，明天变成 unmapped”的漂移。

#### 怎么验收

- MBM 的输出是稳定的、可回放的。
- 未知输入不会被伪装成 canonical change。
- 现实被压缩进 change space，但没有被假装消失。

### 3. IPL

#### 做什么

- 把每个 transition、decision、output 绑定到唯一 `change_id`。
- 检查 lineage 是否完整、是否分叉、是否能回放。
- 把 ambiguity debt 的历史信号转成后续解释的先验。

#### 怎么做

- 在 kernel-log、ledger、snapshot、verify/implement 输出里统一写 lineage 引用。
- 引入 provenance 校验，发现断链就失败。
- 将 ambiguity debt 只作为 prior 输入，不直接改写既有决策。

#### 怎么测试

- 所有状态迁移都能回指到一个 change。
- 断链、重影、重复归因都应当被识别。
- 历史 debt 只能影响未来分类权重，不能改写已提交真相。

#### 怎么验收

- 没有不能解释来源的 transition。
- 没有 shadow execution surface。
- 回放时 lineage 和结果一致。

### 4. KTM

#### 做什么

- 作为 deterministic runtime 执行 state transition。
- 提供唯一事务边界，原子提交 kernel-log、audit ledger、state snapshot。
- 保证 single-writer consistency。

#### 怎么做

- 把 `transition(state, change, facts, policy) -> next_state` 做成显式核心。
- 所有写入都从同一个事务边界发出。
- 让 `implement`、`verify`、`ci` 只消费 KTM 产物，不直接定义状态。

#### 怎么测试

- 原子性测试，三类输出要么一起成功，要么一起失败。
- 回放测试，同一输入必须还原同一状态链。
- 绕过测试，不能直接从 implement 或 CI 写出权威状态。

#### 怎么验收

- KTM 能稳定产出 next state。
- 没有双写路径。
- runtime 决策可回放、可审计、可解释。

### 5. Execution Fork Governance Layer

#### 做什么

- 收敛同一 `change_id` 下的多个执行候选。
- 记录 canonical execution trace。
- 记录被拒绝、被合并或需要重放的分叉。
- 让 `verify` 和 `replay` 消费同一条权威执行轨迹。

#### 怎么做

- 给 `implement` 产物补 fork 识别和裁决记录。
- 给 handoff / decision / replay 统一 canonical 指针。
- 给 audit 增加 fork 裁决事件。
- 给 verify 增加 canonical trace 消费约束。

#### 怎么测试

- 同一 `change_id` 的多条执行路径必须产生稳定裁决。
- replay 后 canonical trace 不能漂移。
- verify 不能绕开 canonical trace 直接重建 truth。

#### 怎么验收

- 系统能明确回答“哪条执行轨迹是权威的”。
- 分叉可以审计、回放、解释。
- `change` 仍然是唯一语义入口，EFGL 只是执行治理层。

### 6. Execution Surface

#### 做什么

- 把 `change` 固定成唯一语义入口。
- 阻止 `kernel`、`ci`、`implement`、IDE 插件变成第二入口。

#### 怎么做

- 保留 `change` 作为唯一可见主入口。
- 其他 surface 都写成派生面、验证面或候选生成面。
- 文档和 CLI 都不要泄漏第二套权威入口。

#### 怎么测试

- 只能通过 `change` 触发完整 runtime。
- 其他 surface 不能独立创造 canonical truth。
- 文档、命令帮助、CI 配置中不能出现新的权威入口。

#### 怎么验收

- 团队只需要记住一个语义入口。
- 任意状态变化都能回到 `change`。
- 没有 alias collapse 风险。

## 统一测试集

- `mutation 归因稳定性`
- `ambiguity debt 生命周期`
- `lineage 绑定完整性`
- `transaction 原子性`
- `single entry surface`
- `replay 一致性`
- `shadow surface 防回弹`

## 统一验收标准

- 现实世界输入可以进入系统，但不会伪装成无来源真相。
- 所有状态变化都能回溯到一个 canonical `change_id`。
- `MBM`、`IPL`、`KTM` 三层职责清晰，没有重叠写入。
- `Ambiguity Debt` 能长期存在、可重评、可反馈，但不污染已提交事实。
- `change` 是唯一用户语义入口，其他 surface 都是派生面。

## 一句话总结

JiSpec 现在已经把现实世界的变动、语义血缘、确定性运行时和不确定性残留，压成一条可回放、可治理、可追溯的唯一执行路径。
