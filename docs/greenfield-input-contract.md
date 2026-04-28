# Greenfield 输入契约

## 目的

本文档定义 `jispec-cli init` 和 `jispec-cli bootstrap new-project` 的源文档输入契约。

它是 `G1: Greenfield Plan And Input Contract` 的验收产物之一，用来确保后续 `G2-G4` 实现命令、加载器和项目资产生成器时，有明确的输入边界。

Greenfield 初始化的原则是：

> 一句话想法可以启动需求澄清，但不能直接启动项目初始化。
>
> 项目初始化至少需要 PRD，推荐使用 PRD + 技术方案。

## 输入模式

### `strict` 模式

推荐用于真实项目初始化。

必需输入：

- `--requirements <requirements.md>`
- `--technical-solution <technical-solution.md>`

行为：

- 缺少任一文件时，返回 `input_contract_failed`。
- technical solution 存在但结构弱时，允许继续，但写入 open decisions。
- 适合 CI、团队项目和正式 demo。

### `requirements-only` 模式

推荐用于早期产品探索后的第一次初始化。

必需输入：

- `--requirements <requirements.md>`

行为：

- 缺少 technical solution 不阻断。
- `jiproject/project.yaml` 应记录 `input_mode: requirements-only`。
- 初始化摘要必须说明技术方案缺口。
- API、bounded context、constraints 等产物中，来自推断的内容必须标记为 `inferred`。

### `idea-only` 模式

不进入 Greenfield 初始化。

输入示例：

```text
我要做一个面向独立开发者的记账工具
```

行为：

- 不生成完整 JiSpec 项目。
- 返回 `input_contract_failed`，或进入未来的 guided intake。
- MVP 可生成 `docs/input/product-brief.template.md` 和 `docs/input/requirements.template.md`。

## 产品需求文档契约

PRD 是 Greenfield 初始化的最低输入。它不要求篇幅很长，但必须能支撑项目边界、验收场景和第一批实现切片。

### 必需信息

需求文档必须包含：

- 产品名称或工作标题
- 产品目标
- 主要用户或 actors
- 核心用户旅程
- 带稳定编号的功能需求
- 非功能需求
- 非目标或暂不包含范围
- 验收标准或成功信号

### Requirement ID 规则

功能需求必须有稳定 ID。

推荐格式：

```text
REQ-<DOMAIN>-<NNN>
```

示例：

```text
REQ-ORD-001
REQ-CAT-001
REQ-AUTH-003
```

规则：

- ID 在项目生命周期内不能复用。
- 修改需求时保留原 ID，并通过 delta 记录变更。
- 废弃需求时标记 `deprecated`，不要删除历史痕迹。
- 一个需求应尽量描述一个可验收能力，不要把多个能力塞进同一个 ID。

### 最低结构

推荐结构：

```markdown
# <Product Name> Requirements

## Objective

## Users / Actors

## Core Journeys

## Functional Requirements

### REQ-XXX-001

## Non-Functional Requirements

## Out Of Scope

## Acceptance Signals
```

### 质量等级

`strong`：

- 有稳定 requirement IDs。
- 用户旅程和功能需求能互相对应。
- 至少有一个可验收的端到端场景。
- 非功能需求不是空泛口号，而是能影响设计或测试。

`usable`：

- 有产品目标和核心功能需求。
- 部分 requirement IDs 缺失或粒度不稳。
- 可以初始化，但必须写入 open decisions。

`weak`：

- 只有产品描述，没有 actors、旅程或可验收需求。
- 不能直接初始化。
- 应进入 guided intake 或生成模板。

## 技术方案契约

技术方案不是最低必需输入，但它决定 Greenfield 初始化的严谨度。

### 推荐信息

技术方案应该包含：

- 架构方向
- 初始 bounded context 假设
- 集成边界
- 数据所有权规则
- 测试策略
- 运行约束
- 已知风险或开放决策

### 最低结构

推荐结构：

```markdown
# <Product Name> Technical Solution

## Architecture Direction

## Bounded Context Hypothesis

## Integration Boundaries

## Data Ownership

## Testing Strategy

## Operational Constraints

## Risks And Open Decisions
```

### 质量等级

`strong`：

- 明确 bounded contexts 或模块边界。
- 说明上下游集成和数据所有权。
- 测试策略覆盖 unit、integration、contract 或 e2e 中的关键层。
- 风险和开放决策清晰列出。

`usable`：

- 有架构方向和测试策略。
- 部分边界需要 JiSpec 推断。
- 初始化可以继续，但相关 contract confidence 应标记为 `technical_solution` 或 `inferred`。

`missing`：

- 未提供技术方案。
- 初始化可以以 `requirements-only` 模式继续。
- 输出必须显式记录技术方案缺口。

## 初始化输入验证

G2-G4 实现时，输入验证应至少输出以下结果：

```yaml
input_contract:
  status: passed | failed | warning
  mode: strict | requirements-only | idea-only
  requirements:
    path: docs/input/requirements.md
    status: strong | usable | weak | missing
  technical_solution:
    path: docs/input/technical-solution.md
    status: strong | usable | missing
  blocking_issues: []
  warnings: []
  open_decisions: []
```

### Blocking 条件

以下情况应阻断 Greenfield 初始化：

- requirements 文件不存在。
- requirements 文件为空。
- requirements 文件没有产品目标。
- requirements 文件没有任何可识别功能需求。
- 用户只提供一句话 idea，但要求直接生成完整项目。

### Warning 条件

以下情况允许继续，但必须写入 warning 或 open decision：

- technical solution 缺失。
- requirement IDs 缺失或不稳定。
- 用户旅程缺失。
- 非功能需求过于抽象。
- bounded context 只能从 PRD 推断。
- API contract 只能从需求推断，缺少技术方案支撑。

## 源文档 Manifest

Greenfield 初始化必须生成稳定的源文档 manifest，供 trace、verify 和未来 delta 使用。

建议位置：

```text
.spec/greenfield/source-documents.yaml
```

建议结构：

```yaml
source_documents:
  requirements:
    path: docs/input/requirements.md
    role: product_requirements
    status: strong
    checksum: "<sha256>"
  technical_solution:
    path: docs/input/technical-solution.md
    role: technical_solution
    status: usable
    checksum: "<sha256>"
input_mode: strict
generated_at: "2026-04-29T00:00:00Z"
```

MVP 可以先记录路径、角色、状态和时间；checksum 可在后续增强。

## 输出影响

输入质量必须影响输出资产的置信度。

示例：

```yaml
source_confidence: requirements
source_confidence: technical_solution
source_confidence: inferred
```

规则：

- PRD 明确写出的能力，标记为 `requirements`。
- 技术方案明确写出的边界或策略，标记为 `technical_solution`。
- JiSpec 根据命名、上下文或常见模式推断出的内容，标记为 `inferred`。
- `inferred` 内容必须能进入 open decisions 或 adoption review，不能伪装成确定事实。

## G1 验收清单

G1 完成的定义：

- Greenfield 初始化计划已说明为什么 PRD 或 PRD + 技术方案是预期输入。
- 本输入契约已定义三种输入模式：`strict`、`requirements-only`、`idea-only`。
- 本输入契约已定义 PRD 的必需信息、Requirement ID 规则和质量等级。
- 本输入契约已定义 technical solution 的推荐信息和质量等级。
- 本输入契约已定义 blocking、warning 和 open decision 的基本规则。
- 本输入契约已定义 source document manifest 的最小结构。
- 后续 G2-G4 可以直接依据本文档实现 CLI、loader 和 project asset writer。
