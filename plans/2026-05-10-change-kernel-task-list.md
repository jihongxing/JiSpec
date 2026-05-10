# Change Kernel 可执行任务清单（已完成）

Date: 2026-05-10

Reference:

- [change-kernel-roadmap.md](../docs/architecture/change-kernel-roadmap.md)
- [change-kernel-code-audit.md](../docs/architecture/change-kernel-code-audit.md)
- [change-kernel-implementation-plan.md](./2026-05-10-change-kernel-implementation-plan.md)

## 用法

这份文档是 `change-kernel-implementation-plan.md` 的执行拆解版，当前已全部完成并归档。

- `roadmap` 负责方向
- `implementation plan` 负责阶段
- `task list` 负责直接派工

## 拆解原则

- 先做共享模型，再做治理层，再做运行时，再收口执行面。
- 每个任务都要能落到具体文件、测试和验收。
- 任何任务只要会改变 truth source，都必须先补测试再补实现。
- `change` 仍然是唯一语义入口，不新增 `kernel` 顶层命令。

## 任务总表

| ID | 任务 | 状态 | 主要文件范围 | 依赖 | 测试 | 完成标准 |
|---|---|---|---|---|---|---|
| CK-01 | 建共享内核模型 | 已完成 | `tools/jispec/*` 中的共享类型层，必要时新增 `tools/jispec/kernel/*` | 无 | typecheck，round-trip，稳定排序 | 核心类型统一，跨阶段不再各写一套 |
| CK-02 | 落 MBM 归一化 | 已完成 | `tools/jispec/change/*`，新增 mutation/provenance 相关模块 | CK-01 | 固定 fixture 分类，重复运行一致 | 外部 mutation 稳定映射为 `derived_change` / `unmapped_mutation` |
| CK-03 | 落 Ambiguity Debt Register | 已完成 | `tools/jispec/bootstrap/spec-debt.ts`，`tools/jispec/verify/waiver-store.ts`，新增 ambiguity debt 存储/读模型 | CK-01，CK-02 | 生命周期测试，审计测试，复评测试 | 未归因现实成为 first-class object，可追踪、可复审 |
| CK-04 | 落 IPL provenance 绑定 | 已完成 | `tools/jispec/audit/event-ledger.ts`，`tools/jispec/implement/*`，`tools/jispec/verify/*` | CK-01，CK-03 | lineage 闭包，断链失败，replay 一致 | 每个输出都能回指到 canonical `change_id` |
| CK-05 | 落 Execution Fork Governance Layer | 已完成 | `tools/jispec/implement/implement-runner.ts`，`tools/jispec/implement/handoff-packet.ts`，`tools/jispec/verify/*` | CK-04 | 多执行路径裁决，canonical trace 稳定性 | 同一 `change_id` 的执行分叉可裁决、可回放、可审计 |
| CK-06 | 落 KTM 运行时 | 已完成 | 新建/改造 runtime transition 层，必要时新增 `tools/jispec/kernel/*` | CK-04，CK-05 | 原子提交，回放一致，双写阻断 | `kernel-log`、ledger、snapshot 从同一事务边界写出 |
| CK-07 | 收敛执行面 | 已完成 | `tools/jispec/cli.ts`，`tools/jispec/change/change-command.ts`，相关 help 文本 | CK-06 | CLI surface 测试，help 文本测试，入口回归 | `change` 是唯一语义入口，CLI help 已显式区分 semantic entry / derived operational / legacy compatibility / CI wrapper |
| CK-08 | 接 `verify` / `ci` | 已完成 | `tools/jispec/verify/verify-runner.ts`，`tools/jispec/ci/*` | CK-04，CK-05，CK-06 | verify/ci 回归夹具，broken-lineage 测试 | `verify` 和 `ci` 只消费 kernel 输出，不独立重建 truth |

## 任务详单

### CK-01 共享内核模型

做什么：

- 统一 `Mutation`、`ChangeHypothesis`、`AmbiguityDebtRecord`、`ProvenanceLink`、`KernelState`、`KernelTransitionResult` 等基础类型。
- 把稳定 ID、时间戳、状态枚举、置信度、理由字段收口到同一合同。

怎么做：

- 新增一个共享模型层，优先放在现有 `tools/jispec` 下的公共位置。
- 避免在 `change`、`verify`、`implement` 中重复定义同类结构。

怎么测：

- typecheck 通过。
- 每种 record 做 round-trip 序列化测试。
- 稳定排序、稳定 ID 生成测试通过。

怎么验收：

- 新模型被各阶段统一复用。
- 不再出现同一语义多份定义。

### CK-02 MBM 归一化

做什么：

- 把外部 mutation 压成 `derived_change` 或 `unmapped_mutation`。
- 支持 git diff、external patch、CI auto-fix、IDE candidate edit。

怎么做：

- 先把现有 `git diff` 分类逻辑整理成纯函数种子。
- 为每类输入建立最小规则集。

怎么测：

- 固定 fixture 重复运行结果一致。
- 覆盖 commit / patch / CI patch / IDE patch 样例。

怎么验收：

- 分类稳定，可回放，不漂移。
- 未知输入不会误变成 canonical truth。

### CK-03 Ambiguity Debt Register

做什么：

- 给无法归因的 mutation 建持久记录。
- 让债务可进入、演化、重评、结案。

怎么做：

- 沿用现有 spec debt / waiver 的治理风格。
- 补 `owner`、`confidence`、`reason`、`next_review`、`source`、`candidate_change_ids`。

怎么测：

- `unmapped_mutation -> debt` 测试。
- debt 生命周期测试。
- 每次状态变化都写 audit event。

怎么验收：

- 未归因现实成为可治理对象。
- 不再散落在注释、日志和临时标记里。

### CK-04 IPL provenance 绑定

做什么：

- 把 transition、decision、output 绑定到 canonical `change_id`。
- 检查 lineage 完整性、分叉、回放一致性。

怎么做：

- 在 kernel-log、audit entry、state snapshot、verify、implement 输出中统一写 lineage 引用。
- lineage 断裂时直接失败。

怎么测：

- lineage 闭包测试。
- shadow output 测试。
- replay 一致性测试。

怎么验收：

- 没有不能解释来源的状态变化。
- 已提交事实不会被后续反馈改写。

### CK-05 Execution Fork Governance Layer

做什么：

- 收敛同一 `change_id` 下的多个执行候选。
- 裁决 canonical execution trace。

怎么做：

- 给 `implement` 产物补 fork 识别和裁决记录。
- 给 handoff / decision / replay 统一 canonical 指针。
- 给 audit 增加 fork 裁决事件。

怎么测：

- 同一 `change_id` 的多条执行路径必须产生稳定裁决。
- replay 后 canonical trace 不能漂移。
- verify 不能绕开 canonical trace 直接重建 truth。

怎么验收：

- 系统能明确回答哪条执行轨迹是权威的。
- 分叉可审计、可回放、可解释。

### CK-06 KTM 运行时

做什么：

- 建 deterministic transition engine。
- 一次事务边界写出 kernel-log、audit ledger、state snapshot。

怎么做：

- 把 `transition(state, change, facts, policy) -> next_state` 做成显式核心。
- 所有写入从同一个事务边界发出。

怎么测：

- 原子提交测试。
- 回放测试。
- 绕过测试。

怎么验收：

- 不存在双写路径。
- runtime 决策可回放、可审计、可解释。

### CK-07 执行面收敛

做什么：

- 保持 `change` 为唯一语义入口。
- 阻止 `kernel`、`ci`、`implement`、IDE 插件变成第二入口。
- 把 CLI help 里的执行面明确分层：semantic entry surface、derived operational surfaces、legacy compatibility surface、Current CI wrapper。

怎么做：

- 更新 CLI help 和文档，让 `change` 单独出现在 semantic entry surface。
- 其他命令只作为派生操作面列出，不暗示它们能独立生成 canonical truth。
- 保持 `npm run ci:verify` 为独立 wrapper，而不是语义入口。

怎么测：

- 入口测试只允许 `change` 触发完整语义链。
- help 文本不出现新的权威入口。
- semantic section 只出现 `change`，derived section 才列出 `verify`、`implement` 等操作面。
- CI wrapper 区块必须单独存在，避免和派生操作面混在一起。

怎么验收：

- 操作人员只需要记住一个语义入口。
- `change` 之外的命令不会被文档或 help 描述成权威入口。

### CK-08 Verify / CI 集成

做什么：

- 让 `verify` 和 `ci:verify` 只消费 kernel 输出。

怎么做：

- 更新 verify collectors。
- 补 canonical trace 读取和断链失败逻辑。

怎么测：

- `verify` / `ci` 回归夹具通过。
- broken-lineage 用例失败明确。

怎么验收：

- `verify` 和 `ci` 不需要独立重建 truth。

## 推荐执行顺序

1. CK-01
2. CK-02
3. CK-03
4. CK-04
5. CK-05
6. CK-06
7. CK-07
8. CK-08

## 并行建议

- CK-02 和 CK-03 可以部分并行，前提是共享模型先稳定。
- CK-04 和 CK-05 可以串联推进，但不要拆成相互独立的权威层。
- CK-06 之前不要抢先收口 CLI，否则容易把运行时边界做歪。

## 最后判断

这份清单已经全部完成，JiSpec 现在就是一个可审计、可回放、可裁决执行分叉的变更语义系统。
