# 可追溯性与文档契约设计调整方案

## 目标

把需求 / 技术方案从“按行冻结的文档”调整为“按语义稳定的契约输入”，让真实业务里的排版调整、段落重排、补充说明、术语微调不再直接阻断 `verify`。

当前问题不是“文档可以随便变”，而是“现在的门禁把布局变化当成了契约失效”。

## 现状

当前实现链路主要在这三处：

- `tools/jispec/greenfield/source-documents.ts`
- `tools/jispec/greenfield/provenance-drift.ts`
- `tools/jispec/verify/greenfield-review-pack-collector.ts`

它们把 `expected_line`、`expected_checksum`、`excerpt` 组合成了阻断信号。结果是：

- 段落移动会被当作 drift
- 标题重排会被当作 drift
- 只要 excerpt 找不到，就可能进 blocking

这对审计很强，但对真实业务文档演进太脆。

## 调整原则

1. 语义优先，布局次要。
2. 稳定标识优先于行号。
3. 真正的契约消失才阻断，重排和改写先降级为可恢复漂移。
4. 业务能力门禁和运维证据门禁分开，不混在一起。

## 新模型

### 1. 语义单元替代行号单元

需求和技术方案中的被追踪片段，应该先有稳定语义标识，例如：

- `block_id`
- `semantic_kind`
- `canonical_text_hash`
- `source_path`
- `version`

`line` 只能作为提示信息，不再作为主身份。

### 2. 漂移分级

把当前 drift 分成四类：

- `semantic_removed`：必须阻断
- `semantic_changed`：必须阻断
- `reflow_or_reformat`：只告警，不阻断
- `reanchorable_move`：可自动重锚或降级为告警

`missing_file` 只有在该源文档属于强制输入时才阻断。

### 3. 输入改为快照化

可编辑源文档继续保留给人写，但初始化和 review 应生成一个稳定的契约快照，例如：

- `docs/input/requirements.snapshot.yaml`
- `docs/input/technical-solution.snapshot.yaml`
- 或现有 `source-documents.yaml` 的语义增强版

快照里保存的是“语义片段 + 稳定 id + 哈希”，不是“当前排版的具体行号”。

### 4. 门禁分层

把门禁分成两条线：

- 产品能力线：`verify`、`doctor v1`、`post-release:gate`
- 运维证据线：`agent discipline`、session completion、handoff replay

`AGENT_DISCIPLINE_INCOMPLETE` 不应该和业务文档漂移混成同一种能力失败。

## 对当前 15 个 blocker 的处理预期

- 13 个 `GREENFIELD_PROVENANCE_ANCHOR_DRIFT`：大概率会拆成“真正语义变化”与“纯布局漂移”两类。
- `POLICY_NO_BLOCKING_ISSUES`：会随着前两类处理结果自动消失。
- `AGENT_DISCIPLINE_INCOMPLETE`：应进入独立运维闭环，不再代表产品语义退化。

## 迁移步骤

### Wave 1

给 requirements / technical solution 定义稳定语义块，输出契约快照。

### Wave 2

让 `provenance-drift` 先看语义块 id，再看 checksum 和 line hint。

### Wave 3

把布局漂移从 blocking 降级到 advisory。

### Wave 4

只保留契约删除、契约语义变更、强制输入缺失为 blocking。

### Wave 5

重新跑 verify，回收当前 15 个 blocker 的真实剩余部分。

## 验收标准

- requirements / technical solution 允许重排、补充、改写，不会因为行号变化直接 blocking。
- 稳定语义块仍然可追踪，且能定位到原始来源。
- 真正的需求删除或技术边界删除仍然会阻断。
- `north-star acceptance` 和 `doctor pilot` 不再被布局漂移误伤。

## 相关实现点

后续真正落地时，优先看这三个实现点：

- `tools/jispec/greenfield/source-documents.ts`
- `tools/jispec/greenfield/provenance-drift.ts`
- `tools/jispec/verify/greenfield-review-pack-collector.ts`

## 关联设计

如果要把“文档契约不再脆弱”继续推进到“需求可以持续演进且不打坏主线”，下一步应直接按这份设计落地：

- `docs/requirement-evolution-workflow.md`

它把后续补强拆成了四层：

- 命令层：`source refresh / diff / review / adopt`
- artifact 层：active / proposed source snapshot、lifecycle registry、evolution diff
- verify 语义：把 layout drift、未声明演进、未 review 演进、defer 过期分开
- 迁移策略：从现有 `source-documents.yaml` 兼容演进到 requirement lifecycle 工作流
