# 需求渐进演进工作流设计

当前状态：Phase 0 - Phase 4 已完成落地；release compare / release summary / north-star acceptance 的“生命周期迁移解释”叙述层也已接入。

## 目标

把 Greenfield 输入从“一次性初始化快照”升级为“可持续演进的需求契约工作流”，让需求补充、重写、拆分、合并、废弃和边界重构都能进入 JiSpec 的正式治理链，而不是先把 `source-documents.yaml`、锚点、验证和测试打坏，再靠人工回补。

这份设计不是在否定现有 `Spec Delta`、review pack、waiver、spec debt 和 baseline；相反，它的目标是把“需求文档变化”接到现有主线上：

`docs/input/* -> source evolution -> spec delta -> review/adopt/defer/waive -> verify -> baseline`

## 设计原则

1. 可编辑文档和门禁契约分层。
2. 需求变更必须先进入“提案态”，不能直接覆盖 active truth。
3. 真正阻断的是“未经治理的语义变化”，不是排版、行号和自然改写。
4. requirement 生命周期必须是一等对象，至少支持 `active / modified / deprecated / split / merged / replaced`。
5. 现有 `change -> implement -> verify` 主线不推翻，只增强 source evolution 入口。

## 工作流总览

### 1. 人编辑源文档

人继续直接编辑：

- `docs/input/requirements.md`
- `docs/input/technical-solution.md`

这两份文件始终是可写工作区，而不是 gate 直接消费的唯一真相。

### 2. 生成提案态 source snapshot

执行 source refresh，把当前文档重采样为“提案态语义快照”，并和 active snapshot 做 diff。

### 3. 建立 requirement evolution delta

系统识别：

- 哪些 requirement 是新增
- 哪些 requirement 是改写
- 哪些 requirement 被拆分
- 哪些 requirement 被合并
- 哪些 requirement 被废弃
- 哪些技术边界只是重锚 / 重排

然后把它写入当前 change delta。

### 4. 进入 review / governance

reviewer 不再只看“文档变了没有”，而是对每个 evolution unit 进行：

- `adopt`
- `defer`
- `waive`
- `reject`

### 5. verify 判断两层状态

- `active truth` 是否仍然一致
- `proposed evolution` 是否已经被显式治理，并且 downstream contract / scenario / slice / tests 已被纳入 dirty graph

### 6. adopt 后更新 baseline

只有在 evolution 被 adopt 后，active source snapshot、baseline 和 requirement lifecycle 才一起推进。

## 命令层

下面是建议新增或增强的命令面。目标是尽量复用 JiSpec 现有习惯，而不是另起一套产品。

### `jispec-cli source refresh`

用途：

- 读取 `docs/input/requirements.md` 和 `docs/input/technical-solution.md`
- 生成提案态语义快照
- 对比 active snapshot
- 写出 evolution delta 和 review packet

建议参数：

```bash
jispec-cli source refresh \
  --root . \
  --change <change-id|latest> \
  [--requirements docs/input/requirements.md] \
  [--technical-solution docs/input/technical-solution.md] \
  [--json]
```

行为：

- 若没有 active change session，可提示先运行 `jispec-cli change "<summary>" --json`
- 默认写入当前 change delta 目录
- 不直接改 active baseline

### `jispec-cli source diff`

用途：

- 输出 active snapshot 与 proposed snapshot 的 requirement / anchor / boundary diff

建议参数：

```bash
jispec-cli source diff --root . --change <change-id|latest> [--json]
```

输出重点：

- requirement lifecycle 变化
- 技术边界变化
- 仅布局变化
- 需要人工决策的 ambiguous evolution

### `jispec-cli source review list`

用途：

- 列出当前 source evolution 中所有待决策项

建议参数：

```bash
jispec-cli source review list --root . --change <change-id|latest> [--json]
```

### `jispec-cli source review adopt`

用途：

- 接受某个 evolution item
- 允许 requirement rename / split / merge / deprecate 成为新 truth

建议参数：

```bash
jispec-cli source review adopt \
  --root . \
  --change <change-id|latest> \
  --item <item-id> \
  [--maps-to <REQ-NEW-001,REQ-NEW-002>] \
  [--reason "..."] \
  [--json]
```

### `jispec-cli source review defer`

用途：

- 承认需求变化成立，但 downstream contract / scenario / tests 暂不立即补齐

建议参数：

```bash
jispec-cli source review defer \
  --root . \
  --change <change-id|latest> \
  --item <item-id> \
  --owner <owner> \
  --expires-at <ISO-8601> \
  --reason "..." \
  [--json]
```

### `jispec-cli source review waive`

用途：

- 只用于短期接受 source evolution 产生的 verify issue
- 不能替代 requirement lifecycle 本身

建议参数：

```bash
jispec-cli source review waive \
  --root . \
  --change <change-id|latest> \
  --item <item-id> \
  --owner <owner> \
  --expires-at <ISO-8601> \
  --reason "..." \
  [--json]
```

### `jispec-cli source adopt`

用途：

- 在所有必须 review 的 source evolution item 已被 adopt/defer/waive 后
- 提升 proposed snapshot 为 active snapshot
- 更新 baseline 和 lifecycle registry

建议参数：

```bash
jispec-cli source adopt --root . --change <change-id|latest> [--json]
```

行为：

- 更新 active snapshot
- 更新 `.spec/baselines/current.yaml`
- 归档 evolution delta
- 写 audit event

## Artifact 层

### Active Truth

这些文件代表“当前被 verify 视为有效真相”的 source contract。

| 路径 | 角色 | 说明 |
| --- | --- | --- |
| `docs/input/requirements.md` | editable source | 人类编辑的需求原文 |
| `docs/input/technical-solution.md` | editable source | 人类编辑的技术方案原文 |
| `.spec/greenfield/source-documents.active.yaml` | active semantic snapshot | 当前 adopted 的语义快照 |
| `.spec/greenfield/source-documents.yaml` | compatibility view | 对旧读取方保留兼容，可等价指向 active snapshot |
| `.spec/requirements/lifecycle.yaml` | requirement lifecycle registry | requirement 的状态、继承关系、split/merge/deprecate 关系 |
| `.spec/baselines/current.yaml` | active baseline | 指向当前 active source snapshot 版本 |

### Proposed Evolution

这些文件代表“当前 change 中提出但尚未 adopted 的需求演进”。

| 路径 | 角色 | 说明 |
| --- | --- | --- |
| `.spec/deltas/<change-id>/source-documents.proposed.yaml` | proposed semantic snapshot | 当前文档重采样后的提案态快照 |
| `.spec/deltas/<change-id>/source-evolution.json` | machine diff | requirement / boundary / anchor 的结构化 diff |
| `.spec/deltas/<change-id>/source-evolution.md` | human diff | 供 reviewer 快速浏览的人工摘要 |
| `.spec/deltas/<change-id>/source-review.yaml` | decision ledger | 每个 evolution item 的 adopt/defer/waive/reject 状态 |
| `.spec/deltas/<change-id>/verify-focus.yaml` | focused verify | 把 source evolution 影响到的 contracts / scenarios / slices / tests 列出来 |

### Audit / Governance

| 路径 | 角色 | 说明 |
| --- | --- | --- |
| `.spec/audit/events.jsonl` | audit trail | 记录 source refresh、review、adopt、defer、waive |
| `.spec/waivers/*.json` | waiver lifecycle | 只处理 issue 降级，不替代 source lifecycle |
| `.spec/spec-debt/ledger.yaml` | source-related debt | deferred evolution 的偿还计划 |

## Requirement 生命周期模型

`lifecycle.yaml` 建议最少支持如下字段：

```yaml
requirements:
  - id: REQ-ORD-001
    status: active
    source_snapshot: source-20260504-1
    supersedes: []
    replaced_by: []
  - id: REQ-ORD-002
    status: split
    source_snapshot: source-20260504-1
    supersedes: []
    replaced_by:
      - REQ-ORD-002A
      - REQ-ORD-002B
  - id: REQ-ORD-003
    status: deprecated
    deprecated_by_change: chg-20260504-checkout-refactor-ab12cd34
```

支持的状态：

- `active`
- `modified`
- `deprecated`
- `split`
- `merged`
- `replaced`

这层模型的意义是：以后 requirement 变了，不必靠“旧锚点失配”来猜，而是能显式知道这是一次有意的演进。

## Verify 语义

### 1. `verify` 的输入不再只有 workspace docs

`verify` 应同时看三层：

- active snapshot
- proposed snapshot
- review / lifecycle / baseline 状态

也就是说，`verify` 判断的是“当前变更是否被治理清楚”，不是“文档是否还和旧行号一样”。

### 2. 问题分级

建议把现有 provenance / source drift 收敛成下面几类 issue：

| issue code | 含义 | 默认级别 |
| --- | --- | --- |
| `GREENFIELD_SOURCE_LAYOUT_DRIFT` | 标题重排、段落移动、supporting anchor 变化 | advisory |
| `GREENFIELD_SOURCE_REANCHORABLE_MOVE` | 语义未变但锚点可重锚 | advisory |
| `GREENFIELD_SOURCE_EVOLUTION_UNDECLARED` | required requirement / boundary 变了，但没有 source refresh / delta | blocking |
| `GREENFIELD_SOURCE_EVOLUTION_UNREVIEWED` | proposed snapshot 已存在，但关键 item 尚未 adopt/defer/waive | blocking |
| `GREENFIELD_SOURCE_EVOLUTION_DEFERRED` | evolution 被 defer，但尚未到期 | advisory |
| `GREENFIELD_SOURCE_EVOLUTION_DEFERRED_EXPIRED` | defer 已过期 | blocking |
| `GREENFIELD_SOURCE_REQUIREMENT_REMOVED` | adopted requirement 被删除但未通过 lifecycle 显式 deprecated/replaced | blocking |
| `GREENFIELD_SOURCE_REQUIREMENT_SPLIT_UNMAPPED` | requirement split 了，但 successor mapping 缺失 | blocking |
| `GREENFIELD_SOURCE_BOUNDARY_CHANGED` | 技术边界语义变了，未进入 review | blocking |

### 3. 典型场景判定

#### 场景 A：只是排版重写

- docs 变化
- semantic snapshot 等价
- `verify` 出 advisory 或直接 PASS

#### 场景 B：新增 requirement

- docs 变化
- source refresh 识别新 requirement
- 如果没有 change delta / source review：blocking
- 如果已进入 review 但未 adopt：blocking
- adopt 后，downstream dirty graph 接手后续 contract/test 影响

#### 场景 C：旧 requirement 被拆分

- 必须在 lifecycle 里记录 `replaced_by`
- 若 successor mapping 缺失：blocking
- 若 mapping 完整但 contract/test 未补齐：由 dirty graph / spec delta 继续阻断或告警

#### 场景 D：技术方案重构了 bounded context

- supporting heading 改动本身不阻断
- 但若 `data ownership / integration boundary / context ownership` 的 required semantic unit 变化：
  - 未声明 evolution：blocking
  - 已声明但未 review：blocking
  - 已 adopt，但 contracts/scenarios 仍未更新：按 delta dirty graph 阻断

### 4. baseline 语义

baseline 不再只记录“当前有哪些 contracts / scenarios / slices”；
它还必须记录：

- 当前 active source snapshot id
- 当前 lifecycle registry version
- 本次 baseline 采用的 source evolution change id

这样 release compare 才能回答：

- 这次不是普通 drift，而是一次已 adopted 的 requirement evolution
- 哪些 requirement 是新增 / 替换 / 废弃

## 迁移策略

### Phase 0: 兼容读取旧 manifest

状态：已完成

保持现有 `.spec/greenfield/source-documents.yaml` 可读。

规则：

- 若没有 `.active.yaml`，则把旧 manifest 视为 active snapshot
- 旧 `line/checksum/excerpt` 继续兼容读取
- 先不要求 lifecycle registry

### Phase 1: 引入 active / proposed 双快照

状态：已完成

改造点：

- `tools/jispec/greenfield/project-assets.ts`
- `tools/jispec/greenfield/source-documents.ts`

目标：

- 初始化时同时写 `source-documents.active.yaml`
- 保留 `source-documents.yaml` 作为兼容视图
- `source refresh` 开始写 proposed snapshot

### Phase 2: provenance drift 升级为 source evolution diff

状态：已完成

改造点：

- `tools/jispec/greenfield/provenance-drift.ts`
- `tools/jispec/change/spec-delta.ts`

目标：

- 不再只报告 anchor drift
- 生成 evolution item：`added / modified / deprecated / split / merged / reanchored`

### Phase 3: verify 接入新语义

状态：已完成

改造点：

- `tools/jispec/verify/greenfield-review-pack-collector.ts`
- `tools/jispec/verify/verify-runner.ts`

目标：

- `verify` 基于 active/proposed/review 三层做判定
- 旧 `GREENFIELD_PROVENANCE_ANCHOR_DRIFT` 逐步退役为更细 issue code

### Phase 4: lifecycle registry 和 adopt 流程落地

状态：已完成

改造点：

- source review / adopt CLI
- baseline writer
- audit ledger

目标：

- 让 requirement evolution 成为一等治理对象
- 让 baseline、release compare、north-star acceptance 都能读懂 requirement 迁移关系

已实现补充：

- `source review list / adopt / reject / defer / waive` 与 `source adopt` 已形成闭环
- baseline 会记录 `active source snapshot id`、`lifecycle registry version`、`last adopted change id`
- release compare / release summary 会把新增、改写、替换、拆分、合并、废弃、重锚和 adopted delta 解释成专门叙述层，而不是只给原始 diff
- north-star acceptance 的 `release_drift` 场景会引用 lifecycle registry、active snapshot、last adopted change、source evolution/source review artifact

## 生命周期迁移解释层

这层是对 Phase 4 的专门补强，目标不是新增一个独立工作流，而是让已经存在的治理链可以被人类直接理解。

它现在回答的不是“有没有 drift”，而是：

- 这是不是一次已治理的 requirement evolution
- 当前 active source snapshot 和上一个 baseline 相比推进到了哪里
- 哪个 adopted change 导致了这次迁移
- requirement 是新增、改写、替换、拆分、合并、废弃，还是只是 advisory re-anchor

当前出口：

- release summary：解释冻结时的 source snapshot / lifecycle / adopted change 状态
- release compare：新增 `Requirement Evolution` 专节，输出 requirement lifecycle migration narrative
- north-star acceptance：`release_drift` 场景附带 `Lifecycle Migration Evidence`

## 与现有主线的关系

这套设计不要求推翻现有主线，而是把 source evolution 接到现有节点上：

- `change` 负责建立 change session 和 delta 外壳
- `source refresh` 负责把文档变化编译为 semantic delta
- `review/adopt/defer/waive` 负责治理 source evolution
- `verify` 负责 gate
- `baseline` 负责把 adopted evolution 变成 active truth

换句话说，新增的是：

`change -> source refresh -> source review -> source adopt -> verify`

而不是另起一条和 JiSpec 脱节的新流程。

## 建议优先实现顺序

1. `source refresh`
2. active / proposed 双快照
3. `source-evolution.json` 与 `source-evolution.md`
4. `verify` 新 issue code 与 gating
5. `source review adopt/defer/waive`
6. `lifecycle.yaml`
7. baseline / release compare 接 requirement evolution

## 验收标准

- 文档排版变化不再直接打坏 gate。
- 需求新增、拆分、合并、废弃都能进入显式 lifecycle。
- `verify` 能区分“未声明的需求变化”和“已声明但未完成的 downstream 更新”。
- `Spec Delta` 能把 source evolution 和 contract/test impact 串起来。
- baseline、release compare、north-star acceptance 能引用 source snapshot version 与 lifecycle version。
- reviewer 不需要手工改 `.spec/greenfield/source-documents.yaml` 才能继续工作。

## 直接相关实现点

- `tools/jispec/greenfield/source-documents.ts`
- `tools/jispec/greenfield/project-assets.ts`
- `tools/jispec/greenfield/provenance-drift.ts`
- `tools/jispec/change/spec-delta.ts`
- `tools/jispec/verify/greenfield-review-pack-collector.ts`
- `tools/jispec/verify/verify-runner.ts`
- `tools/jispec/release/baseline-snapshot.ts`
