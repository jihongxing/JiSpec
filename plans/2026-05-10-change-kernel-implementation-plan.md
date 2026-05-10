# Change Kernel 实施计划（已完成）

Date: 2026-05-10

Reference:

- [docs/architecture/change-kernel-roadmap.md](../docs/architecture/change-kernel-roadmap.md)
- [docs/architecture/change-kernel-code-audit.md](../docs/architecture/change-kernel-code-audit.md)
- [plans/2026-05-10-change-kernel-task-list.md](./2026-05-10-change-kernel-task-list.md)

## 当前代码基线

这份计划已经执行完成，当前代码和文档已经对齐到完成态。仓库里已经存在的能力主要是：

- `change`：创建 session、分类 diff、确定 lane、写入 `.jispec/change-session.json`
- `MBM`：把外部 mutation 归一化为 `derived_change` / `unmapped_mutation`
- `Ambiguity Debt Register`：把无法归因的现实残留落盘并可复审
- `IPL`：把输出绑定到 canonical `change_id`
- `Execution Fork Governance Layer`：裁决 canonical execution trace
- `KTM`：写出 kernel-log、state snapshot、audit ledger 的同一事务边界
- `verify` / `ci`：消费 kernel 输出，不再独立重建 truth
- `cli`：help surface 已经把 `change` 单独列成 semantic entry surface，并把其余命令收敛为 derived operational surfaces、legacy compatibility surface 和 Current CI wrapper

## 完成交付摘要

- `CK-01` 到 `CK-08` 已全部完成
- `verify` / `ci` 已接上 kernel artifact 读取和 lineage 断链阻断
- `change` 仍然是唯一语义入口
- `npm run ci:verify` 仍保持为独立 wrapper，不升格为语义入口

## 已补齐的执行分叉治理层

`Execution Fork Governance Layer` 已经落地，当前实现已经做到：

- 同一 `change_id` 下的多条执行路径有 canonical trace 裁决层
- `implement` 产出的 patch mediation、handoff、decision packet、replay 都已统一到分叉治理面
- `verify` 消费 kernel 输出并读取权威执行轨迹，不再自己重建 truth

## 交付结果

Change Kernel 栈的第一版可执行实现已经交付：

- `change` 仍然是唯一语义入口
- `MBM` 已将外部变动转成 change hypothesis
- `Ambiguity Debt` 负责保存无法归因的现实残留
- `IPL` 负责绑定 provenance
- `KTM` 负责执行确定性状态迁移
- 派生面（`implement`、`verify`、`ci`）只消费 kernel 输出
- `Execution Fork Governance Layer` 已统一 canonical execution trace

## 不做什么

- 不新增 `kernel` 顶层命令
- 不对外部变动做 auto-adopt
- 不把未归因变动只做 quarantine 处理
- 不改变现有业务代码所有权模型
- 不尝试把 CI 或 IDE 变成 truth source

## 交付顺序

| 阶段 | 目的 | 主要范围 | 退出标准 |
|---|---|---|---|
| 1 | 共享模型基础 | `tools/jispec/*`, `schemas/*` | 核心类型和 schema 可编译、可回读 |
| 2 | MBM 归一化 | 新 mutation/provenance 模块，`change` 输入路径 | 外部变动稳定映射为 `derived_change` 或 `unmapped_mutation` |
| 3 | Ambiguity Debt Register | 债务存储、audit 事件、console/read-model 支持 | 未归因变动变成可持续、可复审的债务记录 |
| 4 | IPL provenance 绑定 | lineage 图、校验钩子、回放检查 | 每个输出都能追溯到唯一的 `change_id` |
| 5 | Execution Fork Governance Layer | canonical trace、fork record、replay governance | 多条执行路径稳定收敛到同一权威轨迹 |
| 6 | KTM 运行时 | transition engine、原子提交、snapshot 写入 | 一个事务边界拥有 kernel-log、ledger、snapshot 输出 |
| 7 | 执行面收敛 | CLI help、adapter、命令路由 | `change` 仍然是唯一面向用户的语义入口，help surface 已显式分区且没有第二个权威入口 |
| 8 | Verify/CI 集成 | `verify`、`ci:verify`、回归夹具 | 派生面消费 kernel 输出，不独立重建 truth |

## 阶段 1. 共享模型基础

### 做什么

- 增加 `Mutation`、`ChangeHypothesis`、`AmbiguityDebtRecord`、`ProvenanceLink`、`KernelState`、`KernelTransitionResult` 等核心类型。
- 给所有跨阶段记录补上稳定 ID 和时间戳。
- 提供 kernel 输入输出的序列化助手和 schema 定义。

### 怎么做

- 先做一个小而统一的共享模型层，不要把字段散落在 `change`、`verify`、`implement` 各处。
- 模型流向保持单向：mutation -> hypothesis -> debt/transition -> output。
- 增加明确的 `kind` / `status` / `confidence` / `reason` 字段，方便后续阶段使用同一合同。

### 怎么测试

- 新增共享契约的 typecheck。
- 每种新记录类型都要做 round-trip 序列化测试。
- 稳定排序和稳定 ID 生成测试。

### 怎么验收

- 新 kernel 记录可以写入并读回，没有 shape drift。
- 现有代码可以直接导入共享模型，不需要局部重定义。

## 阶段 2. MBM 归一化

### 做什么

- 建一个 mutation 归一化层，接受来自以下来源的外部变动：
  - git diff / commit 派生变更
  - external patch intake
  - CI auto-fix 或 patch-like 变更
  - IDE 生成的候选编辑
- 建一个确定性分类器，只输出两类：
  - `derived_change`
  - `unmapped_mutation`

### 怎么做

- 先从当前已知 mutation 来源出发，做一个窄而明确的规则集。
- 使用已有的 diff 分类逻辑作为种子，但不要只依赖它。
- 尽量把归一化函数写成纯函数，同样输入事实必须得到同样输出分类。
- 即使分类有歧义，也要附带 reason code 和 confidence。

### 怎么测试

- 用固定 mutation fixture 做可重复分类测试。
- 至少覆盖 git commit、IDE patch、CI patch、external diff 各一例。
- 做 drift test，重复跑同一输入，检查输出是否完全一致。

### 怎么验收

- MBM 对已知输入能产出稳定输出。
- 未知输入不会误升格成 canonical truth。

## 阶段 3. Ambiguity Debt Register

### 做什么

- 为未归因 mutation 建一个持久记录。
- 定义生命周期状态，如 `open`、`reclassified`、`resolved`、`archived`。
- 补上 review 元数据：`owner`、`confidence`、`reason`、`next_review`、`source`、`candidate_change_ids`。

### 怎么做

- 沿用现有 debt 和 waiver 的治理风格，不另起一套独立桶。
- 当 MBM 无法确定性归入 canonical change 时，写入 ambiguity debt。
- 增加 re-evaluation 路径，让新 facts 可以 resolve 或 reclassify debt。
- 在 debt 成为 gate 之前，就让它先在 local read model 和 console 中可见。

### 怎么测试

- 从 `unmapped_mutation` 生成 debt 的测试。
- debt 生命周期测试，覆盖 resolve、archive、reclassify。
- audit 测试，确认每次 debt 状态变化都会发 audit event。

### 怎么验收

- 未归因现实被当作 first-class object 追踪，而不是散在注释或隐藏日志里。
- 每条 debt 都有 owner 和下次复评点。
- debt 记录对运维可见，也可用于后续反馈。

## 阶段 4. IPL provenance 绑定

### 做什么

- 建一个 provenance 层，把每个 transition、decision、output 绑定到唯一 `change_id`。
- 做 lineage 校验，识别断链、重复来源、shadow execution。
- 提供反馈管道，让 ambiguity debt 影响未来解释先验，但不重写历史。

### 怎么做

- 在 kernel-log、audit entry、state snapshot、verify 结果、implement 输出里统一写 lineage 引用。
- lineage 校验一旦找不到 canonical change，就直接失败。
- ambiguity debt 只作为 prior 输入，不作为已提交事实的变更来源。

### 怎么测试

- lineage 闭包测试：每个输出都能追溯到一个 change。
- shadow surface 测试：没有 lineage 路径的输出不能出现。
- feedback 测试：债务影响未来分类 confidence，但不影响既有决策。

### 怎么验收

- 没有任何 state transition 缺 provenance chain。
- 同样输入的 replay 会产出同样 lineage 路径。
- provenance 断裂必须是显式失败，不能静默兜底。

## 阶段 5. Execution Fork Governance Layer

### 做什么

- 收敛同一 `change_id` 下的多个执行候选。
- 记录 canonical execution trace。
- 记录被拒绝、被合并或需要重放的分叉。
- 让 `verify` 和 `replay` 消费同一条权威执行轨迹。

### 怎么做

- 给 `implement` 产物补 fork 识别和裁决记录。
- 给 handoff / decision / replay 统一 canonical 指针。
- 给 audit 增加 fork 裁决事件。
- 给 verify 增加 canonical trace 消费约束。

### 怎么测试

- 同一 `change_id` 的多条执行路径必须产生稳定裁决。
- replay 后 canonical trace 不能漂移。
- verify 不能绕开 canonical trace 直接重建 truth。

### 怎么验收

- 系统能明确回答“哪条执行轨迹是权威的”。
- 分叉可以审计、回放、解释。
- `change` 仍然是唯一语义入口，EFGL 只是执行治理层。

## 阶段 6. KTM 运行时

### 做什么

- 建一个确定性的 transition engine：`transition(state, change, facts, policy) -> next_state`。
- 建一个事务边界，一次写出：
  - kernel-log
  - audit ledger
  - state snapshot
- 保证原子性，系统不会看到半写入的权威状态。

### 怎么做

- 所有写入都放在同一个 runtime 入口后面。
- transition 逻辑尽量显式，并且在 commit 前保持无副作用。
- 继续复用现有 audit ledger 作为事实历史，但不能让它变成第二权威。

### 怎么测试

- 原子提交测试：三个输出要么一起成功，要么一起失败。
- 回放测试：同样输入必须还原同样的 next state。
- 绕过测试：implement / CI 不能在没有 KTM 的情况下写出权威状态。

### 怎么验收

- KTM 是唯一提交权威状态的位置。
- 不存在双写路径。
- runtime 决策可回放、可审计、可解释。

## 阶段 7. 执行面收敛

### 做什么

- 保持 `change` 为唯一面向用户的语义入口。
- 保持 `kernel` 内部化。
- 保持 `implement`、`verify`、`ci`、IDE adapter 只是派生面或验证面。
- 保持 help surface 的语义分区：`Semantic entry surface`、`Derived operational surfaces`、`Legacy compatibility surface`、`Current CI wrapper`。

### 怎么做

- 更新 CLI 帮助和文档，避免暗示存在第二个权威入口。
- adapter 文档和命令 surface 与单入口模型保持一致。
- 确保只有 `change` 能启动完整语义链。
- 不要把 `verify`、`implement`、`doctor`、`policy`、`console`、`bootstrap` 重新写成主入口。

### 怎么测试

- 入口测试：只有 `change` 能触发完整 transition。
- alias 漂移测试：没有其他命令会变成事实上的权威入口。
- 帮助文本测试：文档和命令帮助里不会暴露第二个 truth source。
- help surface 测试要显式验证 semantic section 只保留 `change`，derived section 才包含其余操作命令。

### 怎么验收

- 操作人员只需要记住一个语义入口。
- 所有状态变化都能解释成 `change` 的派生结果。
- CLI help 的分区不会回弹，且不会让 `ci:verify`、`implement` 或 `verify` 误被描述为语义入口。

## 阶段 8. Verify 和 CI 集成

### 做什么

- `verify` 和 `ci:verify` 只消费 kernel 输出，不直接消费原始外部 mutation。
- verification 用 lineage 和 kernel-log 识别漂移、缺失 provenance。
- CI 继续保持为确定性的 enforcement layer，而不是 truth reconstruction engine。

### 怎么做

- 更新 verify collectors，让它们在需要时读取 kernel 输出。
- policy、waiver、spec debt 仍然留在 verification 路径中，但不新增权威层。
- 对于任何缺失 provenance 的情况，给出明确失败和直接操作指引。

### 怎么测试

- 从 kernel 产出的 change 仓库夹具跑 `verify` 集成测试。
- `ci:verify` 夹具要证明它读取的是同一套权威 surface。
- 针对 no-provenance 和 broken-lineage 做回归测试。

### 怎么验收

- `verify` 和 CI 能判断系统状态，但不需要重新从零构建 truth。
- provenance 缺失或错误时，失败信息足够清晰。

## 测试矩阵

| 范围 | 夹具 | 预期结果 |
|---|---|---|
- MBM | git commit、IDE patch、CI patch、external diff | 稳定分类为 `derived_change` 或 `unmapped_mutation` |
- Ambiguity Debt | 未归因 mutation、重新归因 mutation | 生命周期迁移和审计轨迹都保留 |
- IPL | 有效 lineage、断裂 lineage、shadow output | 可追溯输出通过，断裂 lineage 失败 |
- KTM | 一个成功 transition、一个部分失败 case | 原子提交行为保持正确 |
- Execution Surface | `change`、`implement`、`verify`、`ci` 调用 | 只有 `change` 能启动语义链 |
- Verify/CI | kernel 生成的 change 仓库夹具 | 派生面只消费 kernel 输出 |

## 推进顺序

1. 先落共享模型基础。
2. 用夹具推进 MBM 归一化。
3. 加上 ambiguity debt 持久化和可复审能力。
4. 把 IPL lineage 校验接到输出上。
5. 引入 KTM transition 和原子提交。
6. 收紧执行面，移除泄漏。
7. 让 verify 和 CI 适配新的 kernel 输出。

## 风险

- MBM 可能过早拟合少量变更规则。
- Ambiguity debt 如果缺少复审纪律，会持续增长。
- IPL 如果输出里缺少 lineage 字段，会变得噪声很大。
- KTM 如果事务边界太大，会变得过于严格。
- 如果文档或 helper 泄漏第二个权威路径，执行面收敛会回弹。

## 完成定义

- `change` 是唯一语义入口。
- MBM 能确定性分类外部变动。
- Ambiguity debt 以 owner 和 review 追踪未归因现实。
- IPL 把所有输出绑定到 canonical `change_id`。
- KTM 原子提交状态。
- Verify 和 CI 不需要独立重建 truth。

## 最终检查

当这份计划完成时，系统应该表现得像一个单入口、绑定 provenance 的执行 OS，而不是一堆松散拼接的治理工具。

### 当前进度备注

CK-01 到 CK-08 已全部完成。后续只需要维持文档、测试和代码的一致性，防止单语义入口回弹。
