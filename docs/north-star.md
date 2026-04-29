# JiSpec 北极星

## 一句话目标

JiSpec 要成为 **AI 原生软件交付的契约驱动流水线**。

AI 编程工具加速代码生产。JiSpec 控制 AI 原生软件交付。

## 中文定位

JiSpec 的北极星目标是：

> 把 AI 编程从个人英雄主义的手工作坊，推进到可验证、可审计、可阻断、可回放的现代软件交付流水线。

在这个定位里：

- 大模型、Cursor、Codex、Claude Code、Copilot、Devin 等工具是高端机床。
- JiSpec 不是另一台机床，而是贯穿需求、契约、实现、验证、CI 和团队治理的流水线控制层。
- JiSpec 的核心价值不是“替代开发者写更多代码”，而是让 AI 写出的代码始终运行在稳定的契约、节拍、质检和追溯体系里。

## 全局共识

后续实现 JiSpec 时，必须遵守这些共识。它们用于防止产品方向偏移，也用于判断一个功能是否应该进入主线。

### 1. 跨语言、跨平台、跨 LLM

JiSpec 不绑定某一种语言、框架、运行平台或 LLM provider。语言、平台和模型都只是被接入的生产设备；JiSpec 要稳定表达的是需求、契约、事实、策略、变更、验证和审计。

任何核心能力都不应该只在某个 LLM、某个 IDE、某个云平台或某个语言栈下才成立。特定生态适配可以存在，但不能成为主线语义的唯一来源。

### 2. 旧仓库接管与新项目创建同等重要

JiSpec 必须同时服务两种入口：

- 接管已有项目：从真实仓库证据中提炼契约，允许人类采纳、修正、延期和登记历史债务。
- 从零创建项目：从 PRD、技术方案和初始边界中生成第一批契约、policy、CI gate 和实现 handoff。

两条入口最终必须汇入同一条 contract-aware delivery line，而不是形成两套互相割裂的产品。

### 3. 约束 LLM，而不是依赖 LLM 自由发挥

LLM 可以起草、解释、重锚语言、提出修复建议和执行受控实现尝试，但它不能成为事实来源、契约权威或 blocking gate 的唯一裁判。

所有 LLM 输出都必须被契约、schema、policy、facts、provenance、预算、测试和 deterministic verify 约束。模型能力越强，越需要更清晰的边界、输入包和验收规则。

### 4. 确定性能力大于发散性能力

JiSpec 的核心竞争力是确定性控制，而不是更多生成可能性。面对取舍时，优先级固定为：

1. 可验证
2. 可审计
3. 可回放
4. 可阻断
5. 可解释
6. 更强生成能力

如果某个功能让系统更会生成，但削弱了确定性、追溯性或 CI 可复现性，它不应该进入核心主线。

### 5. JiSpec 不作为代码实现主体

JiSpec 是用户、人类开发者、LLM、AI coding tool 和 CI 之间的中间件、约束层、审计层与验证层，不应该演化成又一个独立代码实现 agent。

代码生成、代码编辑和业务实现可以由人类、Codex、Claude Code、Cursor、Copilot、Devin 或其他外部执行者完成。JiSpec 的职责是：

- 定义变更意图、契约边界、blast radius 和验收条件
- 生成可交给外部实现者的 implementation request / handoff
- 接收外部实现者产生的 patch、diff、测试结果或实现说明
- 用 deterministic checks 验证文件范围、契约一致性、policy、facts、测试和 verify verdict
- 记录 provenance、预算、失败、stall、waiver、spec debt 和 human decision

换句话说，JiSpec 可以调度、约束、记录和验证实现行为，但不应把“自己写业务代码”作为核心产品能力。任何 `implement` 相关能力都必须被理解为 implementation mediation，而不是 autonomous code implementation。

### 6. 所有变更都必须可追溯、可审计、可验证

每一次变更都应该能回答：

- 变更意图是什么？
- 触碰了哪些契约、事实、policy、waiver 或 spec debt？
- 使用了哪些输入证据？
- 谁或哪个 agent 做出了采纳、延期、豁免或实现决策？
- 哪些验证通过，哪些验证阻断，哪些问题被明确登记为债务？

没有 provenance 的自动化结果不能被视为可信交付结果。

### 7. 契约是控制面，不只是文档

契约不是写给人看的静态说明，而是贯穿 discover、draft、adopt、change、implement、verify 和 CI 的控制面。

文档可以解释契约，LLM 可以生成契约候选，但真正驱动 gate、handoff、policy 和 audit 的必须是结构化、版本化、可验证的 contract artifacts。

### 8. 人类负责边界和例外，机器负责执行和校验

JiSpec 不追求把人完全移出流程。人类应该在高价值位置做判断：边界确认、契约采纳、例外批准、waiver、spec debt、release 风险接受。

机器应该负责重复执行、事实收集、稳定排序、schema 校验、policy 评估、CI 阻断和审计记录。人类不应该被迫在大量机器底账里手工找结论。

### 9. 本地优先，隐私和可移植性优先

JiSpec 的核心 CLI 必须能在不上传源码的情况下运行。Console、云端协作和跨仓库治理可以增强团队工作台，但不能替代本地可运行、可验证、可复现的核心。

核心产物应尽量使用普通文件、稳定 schema 和 scriptable CLI，让项目可以在不同 CI、不同操作系统和不同团队流程中迁移。

### 10. 降级路径必须明确

当 LLM provider 不可用、输出异常、预算耗尽、证据不足或实现循环卡住时，JiSpec 必须安全降级：

- 保留 deterministic baseline
- 写出 handoff 或 summary
- 标记 spec debt 或 blocking issue
- 给出下一步人类可执行动作

失败不能变成静默通过，也不能变成不可解释的半成品状态。

### 11. 主线一致性高于功能数量

任何新功能都必须服务这条主线：

```text
bootstrap discover -> bootstrap draft -> adopt -> verify -> change -> implement -> verify -> ci:verify
```

Console、distributed execution、collaboration、analytics 和 direct LLM orchestration 都只有在强化这条主线时才成立。功能面可以扩展，但主线语义不能漂移。

## 工厂模型

JiSpec 把 AI 原生工程映射为四类生产线职责。

### 1. 标准零件

需求、领域语言、API 形态、行为、事实、策略和变更意图，都必须从松散的 prompt 文本变成结构化资产。

### 2. 传送带

工作应该沿着一条稳定主线流动：

```text
bootstrap discover -> bootstrap draft -> adopt -> verify -> change -> implement -> verify -> ci:verify
```

人类应该决定边界和例外，而不是手工在各个 AI 工具之间搬运每一包上下文。

### 3. 质量闸机

阻断性决策必须是确定性的、本地优先的、CI 原生的、可回放的。LLM 可以起草、解释和修复，但不能成为唯一的阻断裁判。

### 4. 控制室

团队需要跨仓库、跨 agent 看到 policy、waiver、audit、spec debt、contract drift 和预算状态。

## 产品论点

市场正在从：

> “AI 能不能写代码？”

转向：

> “当 AI 写了很多代码之后，团队还能不能安全地持续交付？”

JiSpec 为第二个问题而生。

JiSpec 的主要用户是已经在使用编码 agent、已经有 CI、并且需要共享契约层的小型 AI 原生工程团队。这个契约层要让前端、后端、测试、文档和 agent 不再各自漂移。

## JiSpec 是什么

JiSpec 是：

- 本地优先的契约验证引擎
- 面向旧仓库的逆向规范化 bootstrap 工作流
- 面向 AI 辅助开发的 change / session / lane 系统
- 围绕 canonical facts 和 policy 的确定性 CI gate
- 未来面向团队的 audit、waiver、spec debt 和跨仓库一致性控制平面

## JiSpec 不是什么

JiSpec 不是：

- 更好的独立代码生成器
- prompt 模板库
- LLM 优先的 CI 裁判
- 包在仓库外面的聊天 UI
- 要求团队先彻底重写流程才有价值的工具

## 战略原则

### 1. 契约先于加速

只有当系统知道什么必须保持为真时，速度才有意义。

### 2. 确定性闸机，AI 辅助工作

AI 可以生成候选方案、修复建议、摘要和解释。merge 阻断决策必须来自可回放的规则和事实。

### 3. 接管旧仓库，不羞辱旧仓库

真实团队从来不是从完美系统开始。JiSpec 必须能发现证据、起草契约，并允许人类采纳或延期，而不是要求第一天就有完美文档。

### 4. 给机器保留原始证据，给人类提炼决策包

每个主线阶段都应该保留机器可读事实，同时产出简洁的人类决策摘要。

### 5. 本地优先核心，团队级控制平面

CLI 必须能在不上传源码的情况下工作。Console 应该增加 policy 分发、audit、waiver、analytics 和跨仓库治理，而不是替代本地核心。

### 6. 主线优先，周边表面其次

`discover -> draft -> adopt -> change -> implement -> verify` 是产品脊梁。Console、分布式执行和协作能力应该强化这条脊梁，而不是分散注意力。

## 当前发布焦点

当前与北极星对齐的发布焦点是：

- [V1 主线稳定契约](./v1-mainline-stable-contract.md)
- [v0.1.0 发布说明](./releases/v0.1.0.md)

这两份文档定义当前可对外承诺的主线命令、关键产物、验证边界和已知限制。

## 差异化

Prompt 框架帮助单次 LLM 调用表现得更好。

AI 编码工具帮助单个 agent 更快地产出代码。

传统契约测试工具验证特定 API 或行为契约。

JiSpec 把这些能力组合成仓库级交付主线：

- 契约驱动
- 适合 bootstrap
- 闸机确定性
- 本地优先
- policy-aware
- audit-ready
- 为多个 human 和 agent 围绕同一套演化系统协作而设计

## 北极星测试

判断一个功能是否属于 JiSpec 时，先问：

> 它是否让 AI 辅助软件交付变得更契约化、更确定性、更可审计，并且更容易被小团队运营？

如果答案是否定的，它大概率不属于产品脊梁。
