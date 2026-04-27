# 商业计划书与发展路线图：AI 驱动的规范化工程流水线

## 文档目的

这份文档不再只是商业概念描述，而是当前项目的统一北极星文档，明确回答四个问题：

1. 这个项目真正要卖给谁。
2. 为什么这条商业模式成立，以及上一版为什么不够成立。
3. 产品和技术应该如何分层，才能既可信又高频可用。
4. 基于当前仓库已经实现的代码，下一步应该如何改造，才能收敛成一个真正可卖的产品。

---

## 一、战略结论

### 1. 核心判断

这个项目的方向成立，但必须完成一次关键修正：

- 它不应该再把“独立开发者”作为主要付费对象。
- 它应该把主要商业化目标上移到 `2-10 人、高度依赖 AI 的敏捷产品团队`。
- 独立开发者和一人公司仍然是极佳的开源拉新入口，但不是最稳定的早期付费核心。

### 2. 项目新定位

项目定位从：

> 面向一人公司与独立全栈开发者的“超级单兵”战术指挥系统

修正为：

> 面向 `2-10 人 AI 原生敏捷团队` 的规范门禁与实现加速系统，用可验证的契约流水线防止“AI 写得很快，但系统逐渐失控”。

### 3. 产品核心主张

我们不是要做“更强的 AI 程序员”，而是要做：

- `AI 时代的工程护栏`
- `契约驱动的软件交付引擎`
- `让 AI 输出可验证、可审计、可阻断、可回放的基础设施`

### 4. 战略总纲

产品必须同时拥有两个闭环：

- `外环：Verify`
  用确定性的事实提取、规则判定和 CI 门禁保证系统不失控。
- `内环：Implement`
  用本地 AI 助手在已确认的规范边界内执行红绿循环，提升真实交付速度。

一句话概括：

> 外环定边界，内环踩油门。

---

## 二、市场痛点与机会修正

### 1. 真正的市场痛点

今天的大多数 AI 编程工具在“局部编码提速”上已经很强，但在“跨文件、跨服务、跨仓库的一致性收敛”上仍然不够强。

当团队开始高频使用 Cursor、Copilot、Claude Code、Devin 类工具时，真正的痛点会从“写得慢”切换成：

- 前后端各自让 AI 写代码，接口契约开始漂移
- 测试、文档、领域模型和实现之间快速撕裂
- 代码能生成，架构却越来越难维护
- 合并前才发现变更没有遵守团队约定
- 多个 AI 会话并行工作，但没有统一的“合同”约束行为

这类痛点对单人开发者也存在，但对 `2-10 人` 小团队更尖锐，因为：

- 他们已经有协作摩擦
- 他们已经依赖 CI/CD
- 他们更愿意为“避免返工”和“减少冲突”付费

### 2. 上一版商业模式的核心裂痕

上一版方案的最大问题是：

- 用 solo developer 的痛点做市场叙事
- 用小团队 / 多仓协作 / 审计留存做收费设计

这会导致典型的商业化错位：

- 最认可产品理念的人不一定愿意付费
- 最可能付费的人又不会把它当成第一优先工具

所以必须明确：

- `独立开发者` 是免费层的传播入口
- `AI 原生敏捷小团队` 是第一批付费核心

### 3. 为什么这个窗口现在值得做

这个项目成立，不是因为“AI 编程”本身新鲜，而是因为市场正在进入下一个阶段：

- 第一阶段卖“写代码更快”
- 第二阶段卖“团队在 AI 参与下仍然不失控”

前者已经拥挤，后者仍有明显产品空档。

---

## 三、目标客户与商业切入点

### 1. 核心 ICP

第一优先目标客户：

- 团队规模：`2-10 人`
- 团队形态：产品研发团队、创业团队、技术合伙人团队、外包管理团队
- 工具现状：已经在用 Cursor / Copilot / Claude Code / Devin 等 AI 工具
- 工程现状：已有 GitHub Actions / GitLab CI / Jenkins 中至少一种
- 组织痛点：前后端接口漂移、AI 生成代码质量不稳、缺少统一审计和门禁

### 2. 次级 ICP

次级用户群体：

- 高水平独立开发者
- 一人公司创始人
- 愿意拥抱协议化开发的开源极客

他们适合成为：

- 开源社区贡献者
- 早期口碑传播者
- 模板、分析器和规则生态的建设者

但不应作为商业模型的唯一支点。

### 3. 不应优先追求的客户

以下用户群体不应作为最早阶段主攻目标：

- 完全没有 CI 的纯脚本型项目
- 大型企业复杂组织
- 需要立刻支持十几种语言和所有框架的“全能平台”诉求
- 希望“无需任何约束直接自动写完全部代码”的用户

---

## 四、产品定义：Open Core + SaaS Control Plane

### 4.1 开源数据面：JiSpec-CLI

### 定位

`JiSpec-CLI` 是本地优先、可离线运行、可接入 CI 的执行引擎。

它负责：

- 扫描仓库
- 提取确定性事实
- 生成规范草稿
- 执行本地红绿循环
- 在 CI 中返回可靠的门禁结论

### 产品边界

`JiSpec-CLI` 必须具备以下特征：

- 本地优先
- 离线可运行
- 支持 `BYOK`
- 不依赖云端才能得出阻断结论
- 对同一代码快照可重放

### 数据边界

需要区分两类资产：

1. 人类可审阅的规范资产
   例如：
   - `domain.yaml`
   - `api_spec.json`
   - `.feature`
   - 设计/需求/测试派生产物

2. 机器运行态资产
   放在 `.spec/` 下，例如：
   - `toolchain.lock`
   - `facts/`
   - `baselines/`
   - `waivers/`
   - `snapshots/`
   - `cache/`
   - `spec-debt/`

也就是说：

- `规范资产` 应该纳入代码仓库、可进 PR、可审查
- `.spec/` 应该承载运行态、缓存态和审计态

### 4.2 商业控制面：JiSpec-Console

### 定位

`JiSpec-Console` 不是普通看板，而是 `策略脑 + 审计脑 + 组织协作脑`。

它不负责最终物理阻断，但负责：

- 策略分发
- 规则治理
- 例外审批
- 审计留存
- 跨仓依赖图
- 规范债务治理
- 历史趋势归因
- CI / PR 深度反馈注入
- 团队级 Token 成本审计

### 不做什么

在最早阶段，控制面不应该优先投入到：

- 花哨 UI
- 多主题切换
- 多语言国际化
- 聊天式 AI 控制台
- 自建 merge 网关

最早阶段的 SaaS 价值不在“看板”，而在“控制”。

### 真正的收费点

控制面应该卖的是：

- `Policy Bundle`
- `Audit Trail`
- `Waiver Workflow`
- `Cross-Repo Consistency`
- `Spec Debt Dashboard`
- `PR Comment Deep Link Workflow`
- `Team Token Analytics`
- `Org-Level Rollout`
- `Private Deployment`

而不是只卖一层“漂亮的统计页面”。

---

## 五、核心工作流：Bootstrap -> Change -> Adopt -> Implement -> Verify

### 1. 冷启动工作流

旧仓库和新仓库都不应该被要求“一开始就把规范写全”。

正确姿势是 `Reverse Spec Bootstrapping`：

1. `Discover`
   - 扫描路由、类型、迁移、测试、调用关系、README、注释
   - 抽取 evidence graph
2. `Draft`
   - 让本地 AI 在证据约束下生成最小规范草稿
3. `Adopt`
   - 人类逐项确认、拒绝、跳过或编辑
4. `Enforce`
   - 只有被认领的资产才进入 baseline 和后续门禁

### 2. 日常开发工作流

在冷启动完成后，日常工作流应收敛为：

1. `change`
   - 定义本次变更的规范边界
2. `adopt`
   - 确认规范增量
3. `implement`
   - 本地 AI 助手在规范约束下实现代码
4. `verify`
   - 用确定性规则收口

推荐的 CLI 表面应该尽量贴近开发者日常：

- `Strict Lane`
  - `jispec-cli change "新增订单退款"`
  - `jispec-cli adopt`
  - `jispec-cli implement`
  - `jispec-cli verify`
- `Fast Lane`
  - 开发者直接改代码
  - `jispec-cli implement --fast`
  - `jispec-cli verify --fast`

### 3. 双车道体验

并非所有改动都值得走完整的重流程，所以必须提供：

- `Fast Lane`
  - 文案、小改动、局部逻辑修复
  - 跑轻量事实提取和局部回归
  - 自动判断本次变更未触及核心契约时，跳过完整 Adopt 流程
- `Strict Lane`
  - 新增聚合根
  - 新增 API
  - 修改核心表
  - 影响上下游契约
  - 强制完整规范链路

这解决了“规范工具太重”的问题。

---

## 六、Verify：确定性门禁架构

### 1. 基本原则

任何会阻断合并的结论，都必须满足：

- 不依赖 LLM 才能成立
- 可在本地和 CI 中重放
- 由同一份代码快照得出同一结论

换言之：

> LLM 可以帮忙生成候选产物、解释失败、修复失败，但不能直接担任 CI 法官。

### 2. CI 落地策略

优先路线不是自建拦截网关，而是：

- 在 GitHub Actions / GitLab CI / Jenkins 中运行 `jispec-cli verify`
- 由现有代码托管平台承担最终 merge 阻断
- 由控制台负责策略和审计，而不是抢占代码平台的闸门位置

这样能显著降低：

- 运维复杂度
- 平台迁移阻力
- 早期产品的信任门槛

### 3. 四态判定

`verify` 不能只有 pass / fail 两态，而应设计为：

- `PASS`
- `FAIL_BLOCKING`
- `WARN_ADVISORY`
- `ERROR_NONBLOCKING`

其核心意义：

- `FAIL_BLOCKING`
  只能来源于确定性规则
- `WARN_ADVISORY`
  适合启发式规则和 AI 辅助分析
- `ERROR_NONBLOCKING`
  用于控制面不可达、插件异常、网络不可用等情况

### 4. Baseline / Observe / Waiver

为了让老仓库可接入，必须提供三套减震机制：

- `Baseline`
  冻结历史现状，只拦截新增 drift
- `Observe Mode`
  新规则先告警，不立刻阻断
- `Waiver`
  允许责任人带原因、范围和过期时间显式放行

### 5. Policy Engine 选型

策略引擎不应在 V1 直接暴露 Rego / OPA / CUE 给普通团队。

更适合的路线是：

- 底层分析器和事实提取器硬编码
- 上层规则用极简 YAML DSL 表达
- DSL 只负责布尔判断，不负责事实提取

推荐能力范围：

- `all / any / not`
- `== != > >= < <=`
- `contains / intersects / in / subset_of`
- `lane / path / branch / repo` 作用域
- `pass / warn / fail_blocking` 动作

### 6. Facts Contract

必须把分析器输出分成三层：

1. `Raw Facts`
   - 插件原始输出
   - 允许版本演进
2. `Canonical Facts`
   - 核心引擎归一化后的稳定事实
   - 策略只读取这一层
3. `Policy DSL`
   - 只依赖稳定事实，不碰分析器内部细节

这样可以保证：

- 插件可以升级
- 规则不轻易断裂
- CI 判定可长期稳定

### 7. Toolchain Lock

为了保证门禁可重放，必须为仓库生成 `.spec/toolchain.lock`，锁定：

- `jispec-cli` 版本
- analyzer pack 版本
- facts contract 版本
- policy bundle 版本

一旦锁定：

- 任何规则升级都必须通过显式 PR 进入仓库
- 不允许“今天跑得过，明天因为工具浮动版本突然挂掉”

### 8. Hybrid Offline-First Analyzers

分析器运行时应采用混合离线优先路线：

- 主二进制内置高频分析器
- 冷门语言用预装插件扩展
- `verify` 路径绝不联网拉包

推荐策略：

- 内置：
  - OpenAPI / JSON Schema
  - Gherkin
  - YAML / JSON canonicalizer
  - Git diff classifier
  - TypeScript / JavaScript / Python / Go / Java / Rust
- 扩展：
  - PHP / Ruby / C# / C++ / Kotlin / Swift 等

插件形式更适合：

- 本地预安装
- 离线加载
- 有签名和 checksum
- 只允许产出 facts，不允许直接返回 verdict

---

## 七、Implement：受控的本地红绿循环

### 1. 基本原则

`implement` 不应设计成“无限聊天修 Bug”，而应设计成：

> 预算受控、上下文重建、失败可交接的本地有限状态机。

### 2. 有限状态机思路

每一轮实现循环必须：

- 重新组装最小上下文
- 跑测试
- 提取首因错误
- 生成 patch
- 评估是否有实质进展
- 命中预算或停滞阈值时强制退出

### 3. 上下文裁切

上下文应拆成四层：

1. `Immutable Contract Pack`
   - 相关的 `domain.yaml`
   - 相关的 `OpenAPI` 片段
   - 相关的 `.feature`
   - 当前变更 delta
2. `Working Set`
   - 失败测试对应文件
   - 当前改动文件
   - 必要的 symbol 定义和调用点
3. `Failure Pack`
   - 首个编译错误
   - 首个断言失败
   - 去噪后的错误签名
4. `Episode Memory`
   - 已尝试方案
   - 明确失败假设
   - 当前剩余问题摘要

关键点：

- 每轮 prompt 重建，而不是累加聊天历史
- 不把完整日志和整仓代码不断滚进上下文

### 4. 预算阻断机制

必须设置硬阈值：

- `max_iterations`
- `max_input_tokens`
- `max_output_tokens`
- `max_cost`
- `max_stall_count`

一旦连续多轮：

- 错误签名不变
- 失败数不降
- 在相同文件位置来回震荡
- 重复相同修复思路

则必须停机。

### 5. 结束态

`implement` 应有四种明确结束态：

- `SUCCESS`
- `BLOCKED_NEEDS_HUMAN`
- `BUDGET_EXHAUSTED`
- `STALLED_NO_PROGRESS`

停机后应交付：

- 当前 patch
- 剩余失败
- 已试过但无效的路径
- 推荐人工接手点

### 6. 模型分层

为了控制 `BYOK` 成本，应采用模型分层：

- 小模型负责：
  - 日志压缩
  - 错误归因
  - 上下文裁切
  - 相关文件选择
- 大模型负责：
  - 生成跨文件 patch
  - 做实现决策

### 7. 预估价机制

在启动 `implement` 前，应给出：

- 预计改动复杂度
- 预计轮次
- 预计 Token 消耗
- 预计美元成本

让用户在本地执行前明确授权预算。

---

## 八、Bootstrapping：让老仓库低摩擦接管

### 1. 为什么这是生死线

如果工具要求团队第一天就：

- 手写完整 DDD
- 手写全量 OpenAPI
- 手写完整 BDD

那么绝大多数团队会直接放弃。

所以：

> Bootstrapping 不是要求用户补文档，而是工具先替用户从现有仓库中逆向拼出一份可接管的规范草稿。

### 2. 证据优先

Bootstrapping 阶段的 AI 必须被严格降级为“书记员”：

- 它只能根据本地仓库证据生成草稿
- 每一项草稿都必须带来源路径
- 每一项草稿都应该带置信度

推荐提供：

- `x-provenance`
- `source_files`
- `confidence_score`
- `adoption_status`

### 3. Adopt 交互

`jispec-cli adopt --interactive` 是冷启动体验的核心。

它必须像一个极简的“收割闸机”：

- 高亮展示草稿差异
- 展示来源证据
- 允许极少决策：
  - `Accept`
  - `Reject`
  - `Skip as Spec Debt`
  - `Edit`

### 4. 原子提交

整个 Adopt 过程应构建一个影子状态，直到用户最终确认时，才：

- 一次性写入规范资产
- 一次性刷新 `.spec/` 中的 baseline / debt / lock / snapshots

不能留下半完成、半认领的撕裂状态。

### 5. Spec Debt 不是失败，而是产品机会

未被当场认领的历史问题，不应立刻阻断，而应沉淀为：

- `spec debt`
- `unknown ownership`
- `missing coverage`
- `low-confidence artifact`

这不仅改善 Day 1 接入体验，也自然成为未来 SaaS 控制台的高价值卖点。

---

## 九、商业模式重构

### 1. 免费层：Open Core / Free

免费层应该提供：

- 开源 `JiSpec-CLI`
- 本地 `bootstrap`
- 本地 `verify`
- 本地 `change`
- 基础 `implement`
- GitHub / GitLab / Jenkins 集成模板
- 短期本地历史和 baseline

战略目标：

- 占领开发者桌面
- 让团队在不改主流程的情况下接入一个 required check
- 培养“先有合同，再让 AI 写代码”的习惯

### 2. 团队层：Pro / Team

这才是第一批真正付费的主战场。

收费点不应只按席位，而应采用混合模式：

- 基础席位费
- 活跃仓库数
- 高级策略包
- 审计留存时长

付费能力应包括：

- Policy Bundle 分发
- Cross-Repo Contract Sync
- Waiver Workflow
- 审计留存
- Spec Debt Dashboard
- PR Comment 卡片与 Deep Link 跳转
- Team Token Analytics
- Org-Level Rule Rollout
- CI 级策略管理

### 3. 企业层：Enterprise

企业层应该卖：

- 私有化控制面
- SSO / RBAC
- 审批流
- 合规留存
- 内网分发 analyzer packs
- 自定义策略集成
- 可选的 OPA / Enterprise Policy 适配

### 4. 不要把收费点放错地方

早期不要把主要收费押在：

- 图表 UI
- 多主题体验
- 一般性的开发效率分析

真正值钱的是：

- 组织级约束执行
- 审计与例外治理
- 跨仓契约一致性
- 规范债务治理
- AI 预算与 Token 成本治理

---

## 十、竞争与护城河修正

### 1. 正确的竞争认知

当前竞品不再只是“单点代码生成”。

主流工具正在快速补齐：

- agent
- instructions / rules
- repo context
- team analytics
- cloud execution

所以不能再把竞争优势表述为：

> 对手只会写代码，我们会工程化

这已经不够锋利。

### 2. 真正的差异化

我们的核心差异化应该定义为：

- `Contract-Driven`
  AI 施工前先确认变更边界
- `Deterministic Gate`
  任何阻断结论都可重放
- `Bootstrap-Friendly`
  老仓库也能低摩擦接管
- `Policy Brain`
  真正卖规则治理，而不是卖看板
- `Local-First`
  源码不必上传，门禁仍然成立

### 3. 真正的护城河

护城河不在于几个 YAML 文件名，而在于四层组合：

1. 稳定的 `Canonical Facts Contract`
2. 围绕 facts 建立的规则和升级工具链
3. 已经嵌入团队 CI 的 required checks
4. 历史审计、例外流和跨仓依赖图

这四者叠加起来，才会形成迁移成本和生态粘性。

---

## 十一、当前代码基线评估

当前仓库并不是从零开始，已经有一批非常有价值的基础设施。问题不在于“没有代码”，而在于“产品主线还没有完全收束”。

### 1. 已有代码的真实价值

| 现有模块 | 当前能力 | 未来定位 | 处理建议 |
| --- | --- | --- | --- |
| `tools/jispec/cli.ts` | 已有较完整 CLI 面 | 新旧命令共存的入口层 | 保留，逐步增加 `bootstrap / verify / change / implement` 新入口 |
| `tools/jispec/validator.ts` | 仓库、slice、trace 校验 | Verify 核心基石之一 | 继续强化，抽象为确定性规则内核 |
| `tools/jispec/semantic-validator.ts` | 语义一致性校验 | Canonical Facts 和规则校验的早期形态 | 保留，未来融入 facts-based verifier |
| `tools/jispec/output-validator.ts` / `gate-checker.ts` / `trace-manager.ts` | 输出校验、门控、可追溯 | Verify 的约束执行层 | 保留并重构为统一判定引擎 |
| `tools/jispec/artifact-ops.ts` | 派生行为、测试、设计 | Bootstrap / Change 阶段的派生器底座 | 强化，接入 evidence-first 工作流 |
| `tools/jispec/agent-runner.ts` / `ai-provider*` / `providers/` | AI provider 抽象和角色执行 | Implement 运行时与 Bootstrap 草稿器 | 保留，收敛成受控 worker 模式 |
| `tools/jispec/pipeline-executor.ts` / `stage-runner.ts` | 阶段编排与合约执行 | Change/Implement 流水线调度内核 | 保留，但要从“slice 生命周期”转向“规范变更状态机” |
| `tools/jispec/cache-manager.ts` / `transaction-manager.ts` | 缓存、快照、事务性提交 | Verify 快照、Bootstrap 原子 adopt、Implement 原子 patch | 高价值，优先复用 |
| `tools/jispec/failure-handler.ts` / `fault-recovery.ts` | 回滚与恢复 | Implement 停机与 graceful handoff | 保留并产品化 |
| `tools/jispec/dependency-graph.ts` / `impact-analysis.ts` / `cross-slice-scheduler.ts` | 依赖图与影响分析 | Cross-repo contract / spec drift / dependency lane | 保留，转向契约依赖图 |
| `tools/jispec/doctor.ts` | 自检和 readiness 报告 | 未来的 `jispec-cli doctor` | 保留，并扩展 analyzer / lock / policy 健康检查 |
| `tools/jispec/distributed-*` / `collaboration-*` / `presence-*` / `notification-*` | 分布式和协作原型 | 控制面远期能力实验田 | 保留为实验分支，不应阻塞 V1 主线 |

### 2. 当前代码的方向偏差

当前代码存在一个典型特征：

- 在工程基础设施上，已经做得比一个普通原型深很多
- 但在市场主线和 CLI 产品主线的命名与交互上，还没有完全收束

尤其体现在：

- 当前仓库更偏 `JiSpec` 与 `slice 生命周期引擎`
- 商业目标要收束成 `JiSpec-CLI + JiSpec-Console`
- 当前能力已经有 pipeline、distributed、collaboration 原型
- 但最先能卖的，其实是 `bootstrap + verify + change + implement`

因此，改造重点不是推翻重写，而是：

> 保留底层运行时资产，重构产品入口和能力优先级。

---

## 十二、明确的发展方向：从 JiSpec 到 Spec-Driven AI Pipeline

### 1. 命名与产品表面

建议采用双层命名策略：

- 仓库与内部工程名：`JiSpec`
- 对外产品名：
- `JiSpec-CLI`
- `JiSpec-Console`

这样做的原因是：

- `JiSpec-` 前缀能显著降低与通用 `Spec-*` 命名发生品牌、包名、可执行文件名冲突的概率
- 对外传播时仍然简洁，但比 `Spec-CLI` / `Spec-Console` 更具唯一性
- 后续无论是 npm 包名、可执行文件名、GitHub Action 名称还是 SaaS 产品名，都更容易保持统一

兼容策略：

- 短期保留 `jispec` 命令
- 新增 `jispec-cli` 作为正式对外入口
- 文档、官网、BP、定价页统一使用 `JiSpec-CLI`

### 2. 产品主线重新排序

从现在开始，能力优先级应当明确为：

1. `Bootstrap`
2. `Verify`
3. `Change`
4. `Implement`
5. `Console`
6. `Distributed / Collaboration / Presence`

这意味着：

- 协作与分布式不再是最前线卖点
- 它们是未来组织级控制面的储备能力
- 不应抢占 V1 研发资源

### 3. 术语切换原则

从产品化开始，外部语境必须尽量从内部遗留心智中脱钩。

对外优先使用：

- `Contract`
- `Asset`
- `Policy`
- `Fact`
- `Lane`
- `Waiver`

对内可以继续保留、逐步迁移的遗留工程术语：

- `slice`
- `stage`

建议明确一条规则：

- CLI 帮助文档、官网文案、控制台文案、PR 注释中优先使用 `Contract / Asset / Policy / Fact`
- `slice / stage` 只保留在源码、迁移说明和兼容层中，避免把内部实现概念泄露给最终用户

---

## 十三、完整改造流程

下面这条路线，是基于当前已实现代码的最合理改造顺序。关键修正是：

> V1 的真正 Aha Moment 不是“门禁有多严格”，而是“一个脏老仓库能否在几分钟内被逆向整理出第一批可接管的契约草稿”。

因此，`Bootstrap` 不是后置增强项，而是必须前置到 V1 主线的冷启动引擎。

### Phase 0：统一战略、命名与术语边界

### 目标

在不推翻现有代码的前提下，先把概念、目录、术语和对外产品表面统一。

### 具体动作

1. 明确目录职责：
   - `contexts/`, `jiproject/`, `schemas/` 继续作为规范源
   - `.spec/` 作为运行态目录
2. 对外产品术语统一为：
   - `JiSpec-CLI`
   - `JiSpec-Console`
3. 在 `README.md` 和主文档中重写产品叙事：
   - 从 “repo-first protocol CLI” 转向 “contract-driven AI delivery gate”
4. 明确术语切换边界：
   - 外部产品文案用 `Contract / Asset / Policy / Fact`
   - 内部兼容层保留 `slice / stage`
5. 冻结非主线功能扩张：
   - collaboration
   - presence
   - notification
   - distributed scheduler 的新需求

### 产出

- 一份统一的产品叙事
- 一份统一的目录职责定义
- 一份统一的术语与命名准则

### Phase 1：前置 Bootstrap，建立 V1 的 Aha Moment

### 目标

把项目从“你先写规范再来用我”改造成“把仓库给我，我先帮你把规范草稿整理出来”。

### 可复用模块

- `artifact-ops.ts`
- `agent-runner.ts`
- `ai-provider*`
- `providers/`
- `validator.ts`
- `transaction-manager.ts`

### 改造动作

1. 新增命令：
   - `jispec-cli bootstrap discover`
   - `jispec-cli bootstrap draft`
   - `jispec-cli adopt --interactive`
2. 定义 evidence graph 数据结构。
3. 为生成草稿加入 provenance 和 confidence。
4. Adopt 过程使用事务提交，防止半状态写入。
5. 首次接入时自动创建 baseline 和 spec debt。
6. 让 CLI 输出第一批“可认领契约草稿”，而不是原始分析日志。

### 交付标准

- 老仓库首次接入无需手工补全全量文档
- 开发者能在短时间内看到第一批 `domain / api / feature` 草稿
- Adopt 过程可审、可回滚、可一次性提交
- 未认领历史问题转化为 spec debt，而不是首次就阻断

### Phase 2：抽取 Verify 核心，和 Bootstrap 组成 V1 双核

### 目标

把当前的校验、门控、追踪、语义检查统一收束成新的 `verify` 内核，并让它只对已认领资产和增量 drift 负责。

### 可复用模块

- `validator.ts`
- `semantic-validator.ts`
- `output-validator.ts`
- `gate-checker.ts`
- `trace-manager.ts`
- `dependency-graph.ts`
- `impact-analysis.ts`

### 改造动作

1. 在现有 CLI 中新增 `verify` 命令别名。
2. 定义四态输出协议：
   - `PASS`
   - `FAIL_BLOCKING`
   - `WARN_ADVISORY`
   - `ERROR_NONBLOCKING`
3. 把当前基于 slice 的校验，抽象成基于 facts 的判定接口。
4. 为 CI 输出提供稳定 JSON 模式，便于 GitHub Action / GitLab job 消费。
5. 增加 `baseline`, `observe`, `waiver` 机制的最小实现。
6. 默认先验证“已接管契约 + 新增 drift”，不追杀全仓历史债务。

### 交付标准

- 可以在不依赖 SaaS 的情况下本地跑 `verify`
- 可以在 CI 中作为 required check 跑通
- 对未支持语言和未接入 analyzer 的情况默认降级，不要硬炸
- 和 Bootstrap 串起来后，首次接入不会出现“全仓爆红”

### Phase 3：定义 Facts Contract 与 YAML Policy DSL

### 目标

把规则系统从“写死在代码里的特例逻辑”升级成“可组合、可治理、可审计”的策略内核。

### 改造动作

1. 定义 `Raw Facts` / `Canonical Facts` / `Policy` 三层。
2. 制定稳定 facts contract。
3. 为 facts 增加稳定性等级：
   - `stable`
   - `beta`
   - `experimental`
4. 实现极简 YAML DSL。
5. 实现 toolchain lock。
6. 提供 policy migration / doctor 检查。

### 可复用模块

- `doctor.ts`
- `cache-key.ts`
- `cache-manager.ts`
- `artifact-identity.ts`
- `version-resolver.ts`

### 交付标准

- 旧策略不会因分析器升级而突然全部失效
- blocking rule 只能依赖 stable facts
- 同一份代码快照可以完整重放结果

### Phase 4：建立 CI-Native Gate，并植入 PLG 增长钩子

### 目标

让产品真正进入团队主流程，同时让未安装 CLI 的队友也能在 PR 场景感知到 `JiSpec-Console` 的存在。

### 改造动作

1. 提供官方 GitHub Action。
2. 提供 GitLab CI 模板。
3. 提供 Jenkins shell wrapper。
4. 输出稳定的：
   - 机器可读 JSON
   - 人类可读解释日志
5. 支持 PR Comment / MR Note 反馈注入：
   - 失败规则摘要
   - 原因解释
   - 指向 `JiSpec-Console` 的 Deep Link
   - 例如：查看审计详情、申请 waiver、查看 spec debt
6. 在 `doctor` 中增加 CI readiness 检查。

### 注意事项

- 不做自建拦截网关
- 不让 SaaS 成为单点阻断依赖
- 优先吃透 required status check 场景
- PR 注释必须是增长钩子，不只是日志镜像

### 交付标准

- 团队能以最低改动将 `verify` 接入现有 CI
- 不需要迁移到新工作台或新代码托管入口
- 其他开发者可以通过 PR Deep Link 自然进入控制台

### Phase 5：引入 Change / Adopt 规范增量流与双车道命令面

### 目标

在冷启动完成后，让团队用规范增量而不是自由 prompt 来描述需求变更，并把 Fast Lane 做成真正的低摩擦终端路径。

### 可复用模块

- `pipeline-executor.ts`
- `stage-runner.ts`
- `slice-ops.ts`
- `tasks.ts`
- `next-report.ts`

### 改造动作

1. 新增：
   - `jispec-cli change "<自然语言需求>"`
2. 对变更做 lane 分类：
   - Fast Lane
   - Strict Lane
3. `Strict Lane` 默认走：
   - `change -> adopt -> implement -> verify`
4. `Fast Lane` 允许短路：
   - 开发者直接改代码
   - `jispec-cli implement --fast`
   - `jispec-cli verify --fast`
5. 自动检测本次变更是否触及核心契约：
   - 若未触及，则跳过完整 Adopt
   - 若触及，则自动升级到 Strict Lane
6. 将当前 slice/stage 思想收敛为“规范变更状态机”。

### 交付标准

- AI 在实现前先收敛变更边界
- 团队不再依赖模糊 prompt 直接改代码
- 修文案、修局部 Bug 时不必强行走完整规范流程

### Phase 6：落地 Implement 本地红绿循环

### 目标

让产品从“只会拦截错误”升级到“可以在可信边界内高频帮团队干活”。

### 可复用模块

- `agent-runner.ts`
- `pipeline-executor.ts`
- `stage-runner.ts`
- `parallel-executor.ts`
- `failure-handler.ts`
- `fault-recovery.ts`
- `transaction-manager.ts`
- `cache-manager.ts`

### 改造动作

1. 新增：
   - `jispec-cli implement`
   - `jispec-cli implement --fast`
2. 实现预算受控 FSM。
3. 实现 context pruning。
4. 引入 stall detection。
5. 输出标准化 handoff packet。
6. 最终回到 `verify` 收口。

### 交付标准

- 实现循环不会无限烧 token
- 本地失败能够体面停机和交接
- 代码写得快，但不脱离规范边界

### Phase 7：推出 Team 控制面

### 目标

把开源工具获得的单仓使用，升级成团队级付费能力。

### 可复用模块

- `collaboration-analytics.ts`
- `notification-service.ts`
- `permission-manager.ts`
- `presence-manager.ts`
- `collaboration-server.ts`
- `distributed-runtime.ts`
- `remote-runtime.ts`

### 改造动作

1. 先做最薄的控制面：
   - policy bundle
   - waiver 审批
   - audit trail
   - spec debt dashboard
   - PR / MR Deep Link 落地页
   - Team Token Analytics
2. 只上传脱敏元数据，不上传核心源码。
3. 支持跨仓 contract drift 可视化。
4. 支持策略分批 rollout。
5. 支持按仓库、按成员、按命令类型审计 Token 消耗。

### 注意事项

- 控制面先做“组织控制”，不要先做“聊天 UI”
- 当前协作/分布式能力应作为增强件，不应重压 V1 时间线

### 交付标准

- 团队愿意为策略治理和审计留存付费
- 队友可以从 PR 反馈自然被拉入控制台
- Token 成本审计能成为团队管理者的真实付费理由

### Phase 8：插件生态与企业化能力

### 目标

在不破坏 V1 简洁性的前提下，拓展语言支持和企业集成能力。

### 改造动作

1. 引入 analyzer packs。
2. 提供本地离线插件安装机制。
3. 为企业版提供：
   - 私有化部署
   - SSO / RBAC
   - OPA 适配器
   - 内部策略注册表
4. 提供 `migrate-policy`, `doctor`, `lock refresh` 等升级工具。

### 交付标准

- 支持更多技术栈而不压垮主 CLI
- 兼容性治理形成系统化产品能力

---

## 十四、近期研发优先级建议

如果只看接下来最有价值的三段工程投入，优先级应该是：

### Priority 1

- 重写 CLI 产品入口和 README 叙事
- 落地 `bootstrap discover / draft / adopt`
- 打磨首个冷启动 Aha Moment
- 同步落地最小 `verify` 四态输出骨架

### Priority 2

- 完成 `verify` 的 baseline / observe / waiver
- 定义 facts contract
- 做 YAML policy DSL
- 搭起最小 CI-native gate 与 PR Comment 反馈注入

### Priority 3

- 做 `change` 与双车道命令面
- 做 `implement --fast` 与 Strict Lane 的闭环打通
- 把现有 artifact derivation 真正产品化

在这三段跑通前：

- 不应该把主要研发资源放到控制台 UI
- 不应该继续扩张分布式协作功能面
- 不应该把大模型直接放到 blocking 路径里

---

## 十五、阶段性成功指标

### 1. 免费层激活指标

- 新用户在 15 分钟内完成首次 `bootstrap`
- 新仓库在 30 分钟内完成首次 `verify`
- 首次接入后不需要大规模手工补规范

### 2. 团队层转化指标

- 至少一个 required check 被接入 CI
- 团队开始使用 waiver 和 baseline
- 团队在一个 sprint 内触发跨仓或跨模块 drift 发现

### 3. 商业层验证指标

- 组织愿意为 audit trail 和 policy rollout 付费
- 控制台不只是被看，而是参与日常放行和例外决策
- Spec Debt Dashboard 能成为迭代计划的输入

---

## 十六、最终方向总结

这个项目的未来，不是做另一个“聊天更聪明的 AI IDE”，而是做一套：

- 可以从老仓库低摩擦冷启动
- 可以在本地和 CI 中给出确定性门禁
- 可以在边界清晰后让 AI 高速实现
- 可以在团队层治理策略、例外、债务和跨仓依赖

的工程操作系统。

基于当前代码现实，最正确的路线不是推倒重来，而是：

- 保住已经很强的底层运行时能力
- 收缩产品叙事和 CLI 入口
- 先把 `bootstrap + verify + change + implement` 做成主线
- 再把控制面和协作能力叠上去

一句话定性：

> 当前仓库已经有足够多的底层发动机，接下来最重要的不是继续加零件，而是把整台机器改造成一辆真正能上路、能收费、能规模化复制的车。

---

## 十七、把 BP 变成开发执行任务

从这一节开始，这份文档不再只是战略材料，也作为当前项目的开发执行手册使用。

执行原则只有四条：

1. 不推翻底层运行时，优先做 `表面收口 + 新能力前插 + 旧能力兼容层`。
2. 新能力先通过 `新增模块` 接入，不先全量搬迁老文件。
3. 每一阶段都必须有 `可演示命令 + 可回归测试 + 可验收样例仓库输出`。
4. 所有阻断路径优先 deterministic，所有 LLM 能力先放在草稿生成、解释和修复辅助层。

### 17.1 开发任务的交付模板

后续所有任务都按下面模板执行：

- `目标`
  这项任务要解决什么问题
- `用户动作`
  用户在终端或 CI 里会怎么触发
- `代码改造点`
  具体要动哪些文件、模块、命名边界
- `实施步骤`
  先做什么，后做什么
- `验收标准`
  做到什么才算完成
- `测试要求`
  单测、集成测试、回归测试分别覆盖什么
- `不做什么`
  当前阶段明确不扩张的范围

### 17.2 本轮开发的总目标

目标不是“把所有蓝图一次性写完”，而是先完成一个真正可演示、可接入、可继续迭代的 V1 核心闭环：

1. 一个老仓库可以先 `bootstrap`
2. 生成第一批可审的契约草稿
3. 用户认领后可以 `verify`
4. CI 中可以稳定跑 required check
5. 日常小改动可以走 `--fast`

只要这个闭环成立，后面的 `change / implement / console` 都是增强，不再是空中楼阁。

---

## 十八、建议的代码重构骨架

当前 `tools/jispec/` 已经有大量底层能力，但结构是按历史阶段自然长出来的。为了让新主线开发不把老能力搅乱，推荐采用 `并排新建、逐步迁移` 的改造策略。

### 18.1 不要一次性大搬家

不建议现在立刻把所有旧文件整体移动到新目录，因为这样会：

- 破坏现有运行面
- 拉高回归成本
- 让真正的产品能力开发被重构工作淹没

正确策略是：

- 先保留现有文件位置
- 在 `tools/jispec/` 下增加新的子目录
- 让新命令先依赖新模块
- 旧模块通过 adapter 被新模块调用
- 等新主线稳定后，再做物理迁移

### 18.2 推荐的新目录骨架

建议逐步演进到如下结构：

```text
tools/jispec/
  cli.ts
  commands/
    verify-command.ts
    bootstrap-command.ts
    adopt-command.ts
    doctor-command.ts
    legacy/
      slice-command.ts
      context-command.ts
      trace-command.ts
      artifact-command.ts
      pipeline-command.ts
  bootstrap/
    discover.ts
    draft.ts
    adopt.ts
    evidence-graph.ts
    provenance.ts
    spec-debt.ts
  verify/
    verify-runner.ts
    verdict.ts
    baseline-store.ts
    waiver-store.ts
    observe-mode.ts
    legacy-validator-adapter.ts
  facts/
    raw-facts.ts
    canonical-facts.ts
    facts-contract.ts
    fact-stability.ts
  policy/
    policy-loader.ts
    policy-engine.ts
    policy-schema.ts
    migrate-policy.ts
  runtime/
    toolchain-lock.ts
    session-store.ts
    command-output.ts
  implement/
    implement-runner.ts
    context-pruning.ts
    budget-controller.ts
    stall-detector.ts
    handoff-packet.ts
  ci/
    github-action.ts
    pr-comment.ts
    gitlab-note.ts
```

### 18.3 旧模块到新模块的映射策略

| 当前文件 | 新角色 | 改造方式 |
| --- | --- | --- |
| `cli.ts` | 命令注册总入口 | 逐步抽出 command registrars，最后只保留组装逻辑 |
| `validator.ts` | 旧验证器 + Verify adapter 输入 | 不直接改坏，先包一层 `legacy-validator-adapter.ts` |
| `artifact-ops.ts` | Bootstrap draft 和旧派生器桥接层 | 先复用已有派生逻辑，逐步补 evidence-first 语义 |
| `agent-runner.ts` | Bootstrap draft / Implement worker 运行时 | 保留，增加新上下文装配器，不先重写 provider 层 |
| `transaction-manager.ts` | Adopt 原子提交 / Implement 原子 patch | 直接复用，新增 session 元数据 |
| `cache-manager.ts` | Verify 快照 / Implement 工作缓存 | 保留，补 toolchain/facts key 维度 |
| `doctor.ts` | 健康检查总入口 | 保留，逐步加入 bootstrap / verify / CI readiness 检查 |
| `pipeline-executor.ts` / `stage-runner.ts` | Change/Implement 编排内核 | 先作为底层 executor 使用，后续再抽象掉 slice/stage 术语 |

### 18.4 `cli.ts` 的改造边界

当前 `cli.ts` 已经很长，不适合继续直接往里堆新命令。建议分两步：

1. 当前阶段：
   - 保持 `cli.ts` 可运行
   - 在文件内部先把新命令和 legacy 命令分块整理
2. 下一阶段：
   - 抽出 `commands/*.ts`
   - `cli.ts` 只负责：
     - 创建 program
     - 注册新主线命令
     - 注册 legacy 兼容命令
     - 注入 help text

---

## 十九、详细开发任务包

下面这些任务包就是可以直接进入 Sprint 的开发单元。顺序按依赖关系排列。

### Task Pack 0：表面收口与兼容层固定

#### 目标

让仓库的 README、CLI help、npm scripts、产品命名和兼容边界全部对齐到 `JiSpec-CLI` 主线。

#### 当前状态

这一包已经部分完成：

- `README.md` 已重写
- `package.json` 已增加 `jispec-cli` / `verify` / `ci:verify`
- `cli.ts` 已把 `verify` 提升为主入口，并将旧命令标记为 legacy

#### 还需补完

- 将 README 中的“未来命令”与实际实现状态保持持续一致
- 为 legacy 命令输出增加兼容提示
- 在未来新增 `bootstrap` 后，把 help surface 从“roadmap”升级成“current primary surface”

#### 涉及文件

- [README.md](/D:/codeSpace/JiSpec/README.md)
- [package.json](/D:/codeSpace/JiSpec/package.json)
- [tools/jispec/cli.ts](/D:/codeSpace/JiSpec/tools/jispec/cli.ts)

#### 验收标准

- `npm run jispec-cli -- --help` 能清楚区分主入口和兼容入口
- 新用户在 README 前 60 秒内能看懂最先该跑什么命令
- 旧命令依然不被打断

#### 第一批具体代码改动清单

下面这部分按“文件级别 + 函数级别”拆解 `Task Pack 0`，目标不是增加新能力，而是把**当前已经存在的能力正确暴露给用户**，避免 README、CLI help、npm scripts 和真实实现状态彼此打架。

这里有三个关键判断必须先写死：

1. `Task Pack 0` 的目标不是“再做一个功能”，而是先把对外表面收口。
2. 没有真实落地的命令，不应在 README 和 help 里伪装成已可用能力。
3. compatibility surface 必须被明确标注，而不是让新用户误把 legacy 命令当成主线。

也就是说，这一包第一版应该坚持：

- **先校准叙事，再扩张命令面**
- **先统一命名，再新增子目录重构**
- **先保住兼容，再逐步下线旧心智**

##### A. 基于当前仓库现状的切入点

当前仓库在 `Task Pack 0` 上已经完成了一半，但还没有形成“稳定外壳”。

**已经完成的部分**

- [README.md](/D:/codeSpace/JiSpec/README.md) 已经切到 `JiSpec-CLI` / `JiSpec-Console` 叙事
- [package.json](/D:/codeSpace/JiSpec/package.json) 已增加：
  - `jispec-cli`
  - `verify`
  - `ci:verify`
- [tools/jispec/cli.ts](/D:/codeSpace/JiSpec/tools/jispec/cli.ts) 已把 `verify` 提升为主入口
- legacy surface 已被标记为 `slice/context/trace/artifact/agent/pipeline/dependency`

**还没真正收稳的部分**

- `README` 里“未来命令”与真实实现状态还需要持续同步
- `cli.ts` 的 help text 还是硬编码大字符串，后续容易漂
- legacy 命令虽然被标注了，但具体输出还没有统一的“兼容提示”
- `ci:verify` 已存在，但在 README 和 help 里的地位还不够清晰

所以这一包的正确开法不是马上大拆 `cli.ts`，而是：

1. 先把 README / scripts / help text 收敛到一份统一语言
2. 再把 `verify` / `doctor phase5` / `ci:verify` 固定成当前主入口
3. 再把 legacy surface 的提示做成显式且稳定的兼容层

##### B. 第一版必须守住的边界

`Task Pack 0` 第一版必须明确“不做什么”：

- 不在这一包里新增 `bootstrap/change/implement` 的真实执行逻辑
- 不在这一包里大拆 `cli.ts` 到 `commands/*.ts`
- 不在这一包里修改底层验证器
- 不在这一包里做 Console UI 或 SaaS 页面
- 不在这一包里下线任何已有 legacy 命令

第一版只做：

- README 主叙事对齐
- npm scripts 别名与主入口对齐
- CLI help surface 对齐
- legacy 命令的兼容提示统一
- 让新用户 60 秒内知道：
  - 现在能用什么
  - 未来会有什么
  - 兼容层在哪里

##### C. `README.md` 的第一批改动清单

**修改文件**

- [README.md](/D:/codeSpace/JiSpec/README.md)

**要做什么**

让 README 成为“当前产品表面”的唯一可信说明，而不是路线图和现实状态混写。

**建议新增/整理的段落**

1. `What works today`
2. `What is compatibility surface`
3. `What is roadmap only`
4. `How to run verify locally`
5. `How to run ci:verify`

**建议补的内容**

- 在 `Quickstart` 后明确写：
  - 当前最先跑：`npm run verify`
  - 当前 CI 入口：`npm run ci:verify`
- 在 `Product direction being pulled forward` 段落明确标记：
  - `bootstrap / change / implement` 还不是当前 build 里的 first-class command
- 在 `Legacy compatibility surface` 段落明确强调：
  - 这是 compatibility/runtime layer
  - 不是当前产品主入口

**建议新增检查函数（文档层，不一定落代码）**

如果后面愿意做文档一致性检查，可以预留一个极轻量规则：

```ts
function assertReadmePrimaryCommands(): void
```

但第一版不需要新建脚本，只要先把 README 文字对齐即可。

##### D. `package.json` 的第一批改动清单

**修改文件**

- [package.json](/D:/codeSpace/JiSpec/package.json)

**要做什么**

把脚本层语义彻底定下来，让用户和 CI 都只看到一个清晰的主入口层。

**建议保留的主脚本**

```json
"jispec-cli": "node --import tsx ./tools/jispec/cli.ts",
"verify": "node --import tsx ./tools/jispec/cli.ts verify",
"ci:verify": "node --import tsx ./scripts/check-jispec.ts"
```

**建议保留的兼容脚本**

```json
"jispec": "node --import tsx ./tools/jispec/cli.ts",
"validate:repo": "node --import tsx ./tools/jispec/cli.ts verify",
"check:jispec": "node --import tsx ./scripts/check-jispec.ts"
```

**第一版要确认的事情**

- 不新增 `bootstrap` / `change` / `implement` script，除非命令已经真实落地
- 不删除兼容 script
- `description` 字段继续使用 `JiSpec-CLI` 外部产品名

**建议补充约束**

如果未来新增脚本，必须遵循：

- `主脚本 = 用户和 CI 应优先看到的入口`
- `兼容脚本 = 为旧文档、旧团队习惯保底`

##### E. `cli.ts` 的第一批改动清单

**修改文件**

- [tools/jispec/cli.ts](/D:/codeSpace/JiSpec/tools/jispec/cli.ts)

**要做什么**

把现在写死在 `buildProgram()` 里的 help 文本和 surface 分层，先抽成最小可维护结构。

**建议新增函数**

```ts
function buildPrimarySurfaceHelpText(): string
function buildLegacySurfaceHelpText(): string
function buildRoadmapSurfaceHelpText(): string
function buildCombinedHelpText(): string
```

**建议替换位置**

把现在的：

```ts
program.addHelpText("after", `...`)
```

改成：

```ts
program.addHelpText("after", buildCombinedHelpText())
```

**原因**

- 现在 help 是一整段硬编码字符串
- 后面 `bootstrap` / `change` / `implement` 一旦真实落地，很容易忘记同步
- 抽成函数后，至少可以局部维护

##### F. `verify` 主入口的表面稳定化

**修改文件**

- [tools/jispec/cli.ts](/D:/codeSpace/JiSpec/tools/jispec/cli.ts)

**要做什么**

虽然 `Task Pack 3` 才会彻底把 `verify` 切到新 runner，但 `Task Pack 0` 先要把它的外部语义写稳。

**建议新增函数**

```ts
function registerPrimaryVerifyCommand(program: Command): void
function renderRepositoryVerifyResult(result: ReturnType<typeof validateRepository>, json: boolean): void
```

**第一版目的**

- 先把 `verify` 作为“主入口命令”的注册逻辑独立出来
- 不改变底层实现
- 只是先把“产品主入口”和“legacy 命令注册块”分开

**第一版不要做**

- 不要现在就引入 `verify-runner.ts`
- 不要在 `Task Pack 0` 里顺手做 Task Pack 3 的事

##### G. Legacy 命令兼容提示的第一批改动清单

**修改文件**

- [tools/jispec/cli.ts](/D:/codeSpace/JiSpec/tools/jispec/cli.ts)

**要做什么**

当前 legacy surface 在 help 里已经被标成兼容层，但命令实际执行时还缺少一致的用户提示。

**建议新增函数**

```ts
function printLegacySurfaceHint(surface: "slice" | "context" | "trace" | "artifact" | "agent" | "pipeline" | "dependency"): void
function shouldPrintLegacySurfaceHint(argv?: string[]): boolean
```

**第一版提示策略**

- 只在非 JSON 输出模式下打印
- 提示语气要短，不要污染实际结果

例如：

```text
[JiSpec] `slice` is part of the legacy compatibility surface. The current primary entry is `verify`.
```

**第一版接入点**

在这些 command group 初始化后各自第一层 action 前统一调用：

- `slice`
- `context`
- `trace`
- `artifact`
- `agent`
- `pipeline`
- `dependency`

**注意**

- 不要在每个子命令里复制粘贴提示文本
- 用一个 helper 集中管理，后续才好统一关闭或升级

##### H. `doctor phase5` 的主入口地位补强

**修改文件**

- [tools/jispec/cli.ts](/D:/codeSpace/JiSpec/tools/jispec/cli.ts)
- [README.md](/D:/codeSpace/JiSpec/README.md)

**要做什么**

既然当前 help 已经把 `doctor phase5` 放进主表面，那就要让它在 README 和 CLI 里同样一致地被描述。

**建议新增函数**

```ts
function registerDoctorCommands(program: Command): void
```

**第一版目的**

- 不是新增功能
- 是把 `doctor` 从长文件中的散落命令块收口为“主入口之一”

##### I. `scripts/check-jispec.ts` 的表面边界说明

**涉及文件**

- [scripts/check-jispec.ts](/D:/codeSpace/JiSpec/scripts/check-jispec.ts)
- [README.md](/D:/codeSpace/JiSpec/README.md)

**要做什么**

`Task Pack 0` 不要求重写 `ci:verify`，但要把它在对外表面上的定位说清楚：

- 本地 `verify` = 人类开发入口
- `ci:verify` = CI 包装入口

**第一版建议**

- 暂时不改脚本实现
- 只在 README 里补一句：
  - `ci:verify` currently wraps the repository verification path for CI usage

这样可以避免用户误以为 `verify` 和 `ci:verify` 是两套完全无关的系统。

##### J. 第一版测试文件清单

**新增测试文件**

- `tools/jispec/tests/cli-help-surface.ts`
- `tools/jispec/tests/cli-legacy-surface-hint.ts`
- `tools/jispec/tests/package-script-surface.ts`

**测试重点**

`cli-help-surface.ts`

- `buildProgram().helpInformation()` 中必须包含：
  - `Current primary surface`
  - `Legacy compatibility surface`
  - `Roadmap surface being pulled forward`
- `verify` 和 `doctor phase5` 必须在 primary surface 中

`cli-legacy-surface-hint.ts`

- 调用 legacy 命令时会出现兼容提示
- `--json` 模式下不应污染输出

`package-script-surface.ts`

- `package.json` 中主脚本和兼容脚本都存在
- 不应出现指向不存在命令的主脚本

##### K. 建议把部分测试接入回归矩阵

**修改文件**

- [tools/jispec/tests/regression-runner.ts](/D:/codeSpace/JiSpec/tools/jispec/tests/regression-runner.ts)

**建议新增 suites**

- `CLI Help Surface`
- `CLI Legacy Surface Hint`

`package-script-surface` 可以先单跑，因为它更像表面一致性检查，不是运行时核心回归。

##### L. 第一批实施顺序

建议严格按下面顺序推进：

1. 先改 `README.md`
2. 再确认 `package.json` scripts 分层
3. 再改 `cli.ts` 的 help text builder
4. 再补 `verify` / `doctor` 的注册 helper
5. 再补 legacy surface hint helper
6. 最后补 3 份表面一致性测试

**原因**

- `Task Pack 0` 是表面收口，不是底层能力改造
- 先稳文案和入口，再稳命令提示，调试成本最低
- 把 help 和 hints 做成 helper 以后，后面 Task Pack 1/7/8 接新命令时就不容易漂

##### M. 推荐的最小提交切片

如果希望边写边回归，建议按下面三个提交切片推进：

**Commit 1：README 和 scripts 收口**

- 修改 `README.md`
- 必要时微调 `package.json`

**Commit 2：CLI 表面收口**

- 修改 `cli.ts`
- 抽 help text builder
- 抽 `verify` / `doctor` 注册 helper
- 加 legacy surface hint

**Commit 3：补表面一致性测试**

- 新增 `cli-help-surface.ts`
- 新增 `cli-legacy-surface-hint.ts`
- 新增 `package-script-surface.ts`
- 修改 `regression-runner.ts`

##### N. 第一批完成后的可演示结果

`Task Pack 0` 完成后，至少要能现场演示：

```bash
npm run jispec-cli -- --help
npm run verify
npm run jispec-cli -- slice list
```

终端输出至少应体现：

- `verify` 和 `doctor phase5` 是当前 primary surface
- `slice/context/trace/artifact/agent/pipeline/dependency` 是 legacy surface
- `bootstrap/change/implement` 是 roadmap surface，不冒充已实现能力

##### O. 第一版完成的真实标准

如果还做不到下面这几件事，`Task Pack 0` 就还没有真正完成：

- README、CLI help、package scripts 说的是同一件事
- 新用户第一眼知道先用什么命令
- 老用户不会因为命令重命名直接被打断
- roadmap、primary、legacy 三层表面已经明确分开

---

### Task Pack 1：Bootstrap Discover 最小闭环

#### 目标

实现 `jispec-cli bootstrap discover`，让用户第一次运行时能拿到一份结构化 evidence graph，而不是一堆原始日志。

#### 用户动作

```bash
npm run jispec-cli -- bootstrap discover
```

#### 代码改造点

优先新增这些模块：

- `tools/jispec/bootstrap/evidence-graph.ts`
- `tools/jispec/bootstrap/discover.ts`
- `tools/jispec/bootstrap/provenance.ts`

同时改造：

- `tools/jispec/cli.ts`
- 复用 `tools/jispec/validator.ts`
- 复用 `tools/jispec/artifact-ops.ts` 中已有的 slice/context 读取逻辑

#### 建议的数据结构

建议先定义一个最小 evidence graph：

```ts
interface EvidenceGraph {
  repoRoot: string;
  generatedAt: string;
  routes: EvidenceRoute[];
  tests: EvidenceTest[];
  schemas: EvidenceSchema[];
  migrations: EvidenceMigration[];
  sourceFiles: EvidenceSourceFile[];
  warnings: string[];
}
```

V1 不要求语义极深，但必须稳定、可序列化、可缓存。

#### 实施步骤

1. 先做文件系统扫描器，只识别：
   - OpenAPI/Swagger 文件
   - `.feature`
   - `test/spec` 目录
   - migration 目录
   - 常见 route/controller 文件
2. 统一输出到 `.spec/facts/bootstrap/evidence-graph.json`
3. 输出同时提供：
   - 机器 JSON
   - 人类摘要文本
4. 对未识别语言或结构给出 warning，不要 fail

#### 测试要求

- 在示例仓库上跑出稳定 JSON 快照
- 回归测试：空目录、部分缺失目录、不认识的语言仓库
- JSON 输出字段顺序保持稳定，便于 snapshot

#### 验收标准

- 第一次运行不需要任何配置
- 用户可以看到仓库里“被发现了什么”
- 结果落盘到 `.spec/`，后续 draft 可直接消费

#### 不做什么

- 不做 LLM 生成
- 不做 Adopt
- 不做阻断

#### 第一批具体代码改动清单

下面这部分直接按“文件级别 + 函数级别”给出第一批实现清单，目标是让 `bootstrap discover` 可以最小可用地跑起来。

##### A. 改造 CLI 入口

**修改文件**

- [tools/jispec/cli.ts](/D:/codeSpace/JiSpec/tools/jispec/cli.ts)

**要做什么**

1. 新增 `bootstrap` 命令组
2. 在 `bootstrap` 下新增 `discover` 子命令
3. 保持现有 `verify / slice / context / artifact ...` 兼容不受影响

**建议新增函数**

在 `cli.ts` 当前阶段可以先直接新增，下一阶段再抽到 `commands/bootstrap-command.ts`：

```ts
function registerBootstrapCommands(program: Command): void
function renderBootstrapDiscoverResult(result: BootstrapDiscoverResult, json: boolean): void
```

**建议命令面**

```bash
jispec-cli bootstrap discover
jispec-cli bootstrap discover --root .
jispec-cli bootstrap discover --json
jispec-cli bootstrap discover --output .spec/facts/bootstrap/evidence-graph.json
```

**命令选项建议**

- `--root <path>`
- `--json`
- `--output <path>`
- `--no-write`

**验收点**

- `jispec-cli --help` 出现 `bootstrap`
- `jispec-cli bootstrap discover --json` 可输出机器可读结果

##### B. 新建 Evidence Graph 类型定义

**新增文件**

- [tools/jispec/bootstrap/evidence-graph.ts](/D:/codeSpace/JiSpec/tools/jispec/bootstrap/evidence-graph.ts)

**要做什么**

定义 V1 的稳定输出类型、摘要类型和序列化辅助方法。

**建议导出类型**

```ts
export interface EvidenceSourceRef
export interface EvidenceRoute
export interface EvidenceTest
export interface EvidenceSchema
export interface EvidenceMigration
export interface EvidenceSourceFile
export interface EvidenceGraph
export interface BootstrapDiscoverResult
```

**建议字段**

```ts
interface EvidenceSourceRef {
  path: string;
  kind: "route" | "test" | "schema" | "migration" | "feature" | "source";
}

interface EvidenceRoute {
  path: string;
  method?: string;
  sourceFiles: string[];
}

interface EvidenceTest {
  path: string;
  frameworkHint?: string;
}

interface EvidenceSchema {
  path: string;
  format: "openapi" | "json-schema" | "protobuf" | "unknown";
}

interface EvidenceMigration {
  path: string;
  toolHint?: string;
}

interface EvidenceSourceFile {
  path: string;
  category: "route" | "controller" | "service" | "test" | "schema" | "migration" | "feature" | "other";
}

interface EvidenceGraph {
  repoRoot: string;
  generatedAt: string;
  routes: EvidenceRoute[];
  tests: EvidenceTest[];
  schemas: EvidenceSchema[];
  migrations: EvidenceMigration[];
  sourceFiles: EvidenceSourceFile[];
  warnings: string[];
}

interface BootstrapDiscoverResult {
  graph: EvidenceGraph;
  writtenFiles: string[];
  warningCount: number;
  summary: {
    routeCount: number;
    testCount: number;
    schemaCount: number;
    migrationCount: number;
    sourceFileCount: number;
  };
}
```

**建议新增辅助函数**

```ts
export function createEmptyEvidenceGraph(repoRoot: string): EvidenceGraph
export function summarizeEvidenceGraph(graph: EvidenceGraph): BootstrapDiscoverResult["summary"]
export function stableSortEvidenceGraph(graph: EvidenceGraph): EvidenceGraph
```

**实现要求**

- 所有数组输出前都排序
- 所有 path 统一成 `/`
- 所有时间统一 ISO string

##### C. 新建 Discover 执行器

**新增文件**

- [tools/jispec/bootstrap/discover.ts](/D:/codeSpace/JiSpec/tools/jispec/bootstrap/discover.ts)

**要做什么**

实现仓库扫描、evidence graph 生成、结果落盘和文本摘要。

**建议导出函数**

```ts
export interface BootstrapDiscoverOptions
export function runBootstrapDiscover(options: BootstrapDiscoverOptions): BootstrapDiscoverResult
export function renderBootstrapDiscoverText(result: BootstrapDiscoverResult): string
```

**建议 options**

```ts
interface BootstrapDiscoverOptions {
  root: string;
  outputPath?: string;
  writeFile?: boolean;
}
```

**建议内部函数拆分**

```ts
function scanRepository(root: string): EvidenceGraph
function collectSchemaEvidence(root: string): EvidenceSchema[]
function collectFeatureEvidence(root: string): EvidenceSourceFile[]
function collectTestEvidence(root: string): EvidenceTest[]
function collectMigrationEvidence(root: string): EvidenceMigration[]
function collectRouteEvidence(root: string): EvidenceRoute[]
function collectSourceFileInventory(root: string): EvidenceSourceFile[]
function writeEvidenceGraph(root: string, outputPath: string, graph: EvidenceGraph): string
function normalizeRepoPath(root: string, absolutePath: string): string
```

**第一版识别规则建议**

- Schema:
  - `openapi*.yaml`, `openapi*.yml`, `openapi*.json`
  - `swagger*.yaml`, `swagger*.json`
  - `*.proto`
- Feature:
  - `*.feature`
- Tests:
  - `test/`, `tests/`, `spec/`, `__tests__/`
  - 文件名包含 `.test.`, `.spec.`
- Migrations:
  - `migrations/`, `db/migrate/`, `prisma/migrations/`
- Routes:
  - 文件名包含 `route`, `routes`, `controller`
  - 内容包含常见 HTTP 动词模式：`get(`, `post(`, `router.`, `app.`

**落盘规则**

默认输出到：

```text
.spec/facts/bootstrap/evidence-graph.json
```

同时建议再写一个摘要文件：

```text
.spec/facts/bootstrap/evidence-summary.txt
```

##### D. 新建 Provenance 辅助层

**新增文件**

- [tools/jispec/bootstrap/provenance.ts](/D:/codeSpace/JiSpec/tools/jispec/bootstrap/provenance.ts)

**要做什么**

虽然 `discover` 阶段还不生成 LLM 草稿，但现在就把 provenance 工具抽出来，避免 `draft` 阶段又重新造一遍。

**建议导出类型/函数**

```ts
export interface ProvenanceNote
export function buildProvenanceNote(paths: string[], note: string): ProvenanceNote
export function normalizeProvenancePaths(paths: string[]): string[]
```

**当前阶段最低要求**

- 先支持 source file 列表标准化
- 不必引入 confidence，那个在 `draft` 再加

##### E. 复用现有 validator 的最小方式

**复用文件**

- [tools/jispec/validator.ts](/D:/codeSpace/JiSpec/tools/jispec/validator.ts)

**建议复用函数**

- `validateRepository(root)`
- `findFiles(root, filename)` 当前是私有函数，先不要强行复用

**具体做法**

1. `bootstrap discover` 完成扫描后，调用一次 `validateRepository(root)`
2. 如果当前仓库存在严重结构问题：
   - 不中断 discover
   - 把问题写入 `warnings`
3. 不要为了复用而去修改 `validator.ts` 的大量内部私有函数

**原因**

当前阶段最重要的是把 discover 跑起来，而不是把 `validator.ts` 重构成公共扫描库。

##### F. 写文件时优先复用存储层

**复用文件**

- [tools/jispec/filesystem-storage.ts](/D:/codeSpace/JiSpec/tools/jispec/filesystem-storage.ts)

**建议用法**

- 扫描读取阶段允许直接使用 `node:fs`
- 结果落盘统一走 `FilesystemStorage`

**原因**

- 现有 `FilesystemStorage` 已经能稳定做 mkdir 和 write
- `discover` 阶段的扫描需要递归遍历和文件内容判断，直接用 `fs` 会更简单
- 但最终输出路径管理最好统一走存储层

##### G. 为未来 Adopt 预留事务对接点

**参考文件**

- [tools/jispec/transaction-manager.ts](/D:/codeSpace/JiSpec/tools/jispec/transaction-manager.ts)

**当前阶段怎么做**

`Task Pack 1` 不需要真正接事务，但 discover 输出结构里应预留：

```ts
interface BootstrapDiscoverResult {
  ...
  writtenFiles: string[];
}
```

这样到了 `Task Pack 2`，`draft` 和 `adopt` 可以自然接进 shadow session 和事务提交。

##### H. 第一批测试文件清单

**新增测试文件**

- `tools/jispec/tests/bootstrap-discover-smoke.ts`
- `tools/jispec/tests/bootstrap-discover-empty-repo.ts`
- `tools/jispec/tests/bootstrap-discover-unknown-layout.ts`

**测试风格建议**

延续当前 `tools/jispec/tests/*.ts` 的脚本式回归风格，不要现在引入新的测试框架。

可参考：

- [tools/jispec/tests/stable-snapshot-gates.ts](/D:/codeSpace/JiSpec/tools/jispec/tests/stable-snapshot-gates.ts)

**每个测试最低验证点**

`bootstrap-discover-smoke.ts`

- 能生成 `.spec/facts/bootstrap/evidence-graph.json`
- JSON 中至少包含 `repoRoot`, `generatedAt`, `warnings`
- 示例仓库上 schema/test/sourceFiles 数量大于 0

`bootstrap-discover-empty-repo.ts`

- 空仓库不应 fail
- 应输出空数组和 warning

`bootstrap-discover-unknown-layout.ts`

- 冷门目录结构不应崩溃
- 应产生 warning，但仍返回成功结果

##### I. 第一批实施顺序

建议严格按下面顺序做，不要并行乱切：

1. 先加 `evidence-graph.ts`
2. 再加 `discover.ts` 的纯扫描逻辑
3. 再把 `bootstrap discover` 命令接到 `cli.ts`
4. 再加 `.spec` 落盘
5. 再补文本摘要 renderer
6. 最后写三份回归测试

原因很简单：

- 先把数据结构固定下来，后续测试才不会反复重写
- 先跑内存结果，再落盘，排查更容易
- 先 CLI 可用，再优化输出体验

##### J. 第一批完成后的可演示结果

`Task Pack 1` 完成后，至少要能现场演示下面这段流程：

```bash
npm run jispec-cli -- bootstrap discover
```

终端输出：

- 发现了多少 schema
- 发现了多少 tests
- 发现了多少疑似 route/controller 文件
- warning 数量
- evidence graph 写到了哪里

文件输出：

```text
.spec/facts/bootstrap/evidence-graph.json
.spec/facts/bootstrap/evidence-summary.txt
```

如果这两个结果都拿不出来，就说明 `Task Pack 1` 还没有真正完成。

---

### Task Pack 2：Bootstrap Draft 与 Adopt 原子提交

#### 目标

实现 `bootstrap draft` 和 `adopt --interactive`，把 evidence graph 转成第一批可认领契约草稿，并能一次性原子提交。

#### 用户动作

```bash
npm run jispec-cli -- bootstrap draft
npm run jispec-cli -- adopt --interactive
```

#### 代码改造点

新增模块：

- `tools/jispec/bootstrap/draft.ts`
- `tools/jispec/bootstrap/adopt.ts`
- `tools/jispec/bootstrap/spec-debt.ts`

复用模块：

- `tools/jispec/agent-runner.ts`
- `tools/jispec/ai-provider*`
- `tools/jispec/providers/*`
- `tools/jispec/transaction-manager.ts`

#### 具体怎么做

1. `bootstrap draft` 输入只允许来自：
   - `evidence-graph.json`
   - 当前仓库文件
   - 明确选择的上下文目录
2. 生成三类草稿：
   - `domain.yaml`
   - `api_spec.json`
   - `.feature`
3. 每条草稿项都带：
   - `source_files`
   - `confidence_score`
   - `provenance_note`
4. `adopt --interactive` 做四种决策：
   - `accept`
   - `reject`
   - `skip_as_spec_debt`
   - `edit`
5. 所有认领结果先写到 shadow session
6. 最后一次性通过 `transaction-manager.ts` 落盘

#### 建议落盘结构

```text
.spec/
  sessions/
  baselines/
  spec-debt/
  facts/bootstrap/
```

#### 测试要求

- Adopt 中途退出不能留下半写入资产
- 重复运行 draft 时输出稳定
- `skip_as_spec_debt` 能被正确记录

#### 验收标准

- 用户第一次就能“看到并认领”契约草稿
- 认领完成后仓库里出现第一批可验证资产
- 历史问题进入 spec debt，而不是阻断接入

#### 第一批具体代码改动清单

下面这部分按“文件级别 + 函数级别”拆解 `Task Pack 2`，目标是让 `bootstrap draft` 和 `adopt --interactive` 具备第一版可用闭环。

有一个关键判断必须先写清楚：

> 当前 `agent-runner.ts` 和 `transaction-manager.ts` 都带有明显的 `slice / stage` 假设，`bootstrap draft` 不能直接生搬它们的主入口，否则会在“仓库尚未被接管、没有 slice”的场景里卡死。

所以第一版策略是：

- **AI provider 层复用**
- **agent-runner 主入口不直接复用**
- **事务思想复用**
- **slice 事务实现不直接复用**

##### A. 改造 CLI 入口

**修改文件**

- [tools/jispec/cli.ts](/D:/codeSpace/JiSpec/tools/jispec/cli.ts)

**要做什么**

1. 在 `bootstrap` 命令组下新增 `draft`
2. 在根命令下新增 `adopt`
3. 保持未来 `bootstrap adopt` 与 `adopt --interactive` 两种表面兼容的可能性，但当前先做顶层 `adopt`

**建议新增函数**

```ts
function registerBootstrapDraftCommand(program: Command): void
function registerAdoptCommand(program: Command): void
function renderBootstrapDraftResult(result: BootstrapDraftResult, json: boolean): void
function renderBootstrapAdoptResult(result: BootstrapAdoptResult, json: boolean): void
```

**建议命令面**

```bash
jispec-cli bootstrap draft
jispec-cli bootstrap draft --session latest
jispec-cli bootstrap draft --json

jispec-cli adopt --interactive
jispec-cli adopt --interactive --session latest
jispec-cli adopt --interactive --json
```

**命令选项建议**

`bootstrap draft`

- `--root <path>`
- `--session <id|latest>`
- `--json`
- `--no-write`

`adopt`

- `--root <path>`
- `--session <id|latest>`
- `--interactive`
- `--json`

**验收点**

- `jispec-cli --help` 出现 `bootstrap draft` 和 `adopt`
- 能指定某一轮 discover 产生的 session 继续往后跑

##### B. 新建 Draft 类型与 Session Manifest

**新增文件**

- [tools/jispec/bootstrap/draft.ts](/D:/codeSpace/JiSpec/tools/jispec/bootstrap/draft.ts)

**要做什么**

定义 draft 阶段的核心类型、session manifest、结果对象和文本摘要。

**建议导出类型**

```ts
export type DraftArtifactKind = "domain" | "api" | "feature";
export interface DraftArtifact
export interface DraftBundle
export interface DraftSessionManifest
export interface BootstrapDraftOptions
export interface BootstrapDraftResult
```

**建议字段**

```ts
interface DraftArtifact {
  kind: DraftArtifactKind;
  relativePath: string;
  content: string;
  sourceFiles: string[];
  confidenceScore: number;
  provenanceNote: string;
}

interface DraftBundle {
  artifacts: DraftArtifact[];
  warnings: string[];
}

interface DraftSessionManifest {
  sessionId: string;
  repoRoot: string;
  sourceEvidenceGraphPath: string;
  createdAt: string;
  status: "drafted" | "adopting" | "committed" | "abandoned";
  artifactPaths: string[];
}

interface BootstrapDraftOptions {
  root: string;
  session?: string;
  writeFile?: boolean;
}

interface BootstrapDraftResult {
  sessionId: string;
  manifestPath: string;
  draftBundle: DraftBundle;
  writtenFiles: string[];
  warningCount: number;
}
```

**建议辅助函数**

```ts
export function runBootstrapDraft(options: BootstrapDraftOptions): Promise<BootstrapDraftResult>
export function renderBootstrapDraftText(result: BootstrapDraftResult): string
function loadEvidenceGraphForDraft(root: string, session: string): EvidenceGraph
function buildDraftSessionId(root: string): string
function createDraftBundle(): DraftBundle
function stableSortDraftBundle(bundle: DraftBundle): DraftBundle
```

##### C. 不直接复用 `runAgent`，而是复用 Provider 层

**复用文件**

- [tools/jispec/ai-provider.ts](/D:/codeSpace/JiSpec/tools/jispec/ai-provider.ts)
- [tools/jispec/ai-provider-factory.ts](/D:/codeSpace/JiSpec/tools/jispec/ai-provider-factory.ts)
- [tools/jispec/providers/mock-provider.ts](/D:/codeSpace/JiSpec/tools/jispec/providers/mock-provider.ts)

**不要直接复用的入口**

- `runAgent(...)`
- `assembleAgentContext(...)`
- `assembleAgentContextFromContract(...)`

**原因**

当前这些入口内部都会：

- `loadAgentConfig(root, role)`
- `findSliceFile(root, sliceId)`
- 假设存在 `slice.yaml`

而 `bootstrap draft` 面向的是“仓库尚未被纳入 slice 生命周期”的阶段，直接调用只会带来额外耦合。

**第一版建议做法**

在 `draft.ts` 内直接：

1. 从 repo root 加载 AI 配置
2. 通过 `AIProviderFactory.create(...)` 创建 provider
3. 组装 bootstrap 专用 prompt
4. 调 `provider.generate(...)`
5. 解析返回 JSON 为 `DraftBundle`

##### D. 新增 Root 级 AI 配置加载器

**建议新增文件**

- `tools/jispec/runtime/load-ai-config.ts`

**要做什么**

把当前 `agent-runner.ts` 里私有的 AI 配置加载逻辑抽成 root 级公共能力。

**建议导出函数**

```ts
export function loadAIConfigFromRoot(root: string): AIConfig | undefined
```

**为什么单独抽文件**

- 避免为了 bootstrap 去改 `agent-runner.ts` 的内部私有函数边界
- 后续 `implement` 和 `change` 也会复用

##### E. 设计 Bootstrap Draft Prompt Builder

**新增位置**

- 先放在 `tools/jispec/bootstrap/draft.ts`
- 若逻辑过长，再拆到 `tools/jispec/bootstrap/draft-prompt.ts`

**建议函数**

```ts
function buildBootstrapDraftPrompt(graph: EvidenceGraph): string
function buildDomainDraftPromptSlice(graph: EvidenceGraph): string
function buildApiDraftPromptSlice(graph: EvidenceGraph): string
function buildFeatureDraftPromptSlice(graph: EvidenceGraph): string
```

**Prompt 输出协议建议**

为了方便 provider 和测试，prompt 中必须显式要求返回 JSON：

```json
{
  "artifacts": [
    {
      "kind": "domain",
      "relativePath": ".spec/sessions/<id>/drafts/domain.yaml",
      "content": "...",
      "sourceFiles": ["..."],
      "confidenceScore": 0.82,
      "provenanceNote": "..."
    }
  ],
  "warnings": []
}
```

**关键约束必须写进 prompt**

- 只能根据 evidence graph 和本地文件推断
- 不允许凭空虚构不存在的接口
- 每个 artifact 必须带 `sourceFiles`
- `confidenceScore` 必须是 `0~1`

##### F. 让 Mock Provider 支持 Bootstrap Draft

**修改文件**

- [tools/jispec/providers/mock-provider.ts](/D:/codeSpace/JiSpec/tools/jispec/providers/mock-provider.ts)

**要做什么**

让 mock provider 能识别 bootstrap draft prompt，并返回结构化 `DraftBundle`，否则测试很难稳定。

**建议改造方式**

在 `MockProvider.generate(...)` 中新增 bootstrap 分支识别：

```ts
if (prompt.includes("## Bootstrap Draft Mode")) {
  return JSON.stringify(mockBootstrapDraftBundle, null, 2);
}
```

**建议新增函数**

```ts
function buildMockBootstrapDraftBundle(prompt: string): unknown
```

**第一版返回什么即可**

- 一个 `domain` 草稿
- 一个 `api` 草稿
- 一个 `feature` 草稿
- 每个草稿都带假但稳定的 `sourceFiles` / `confidenceScore`

##### G. Draft 落盘策略

**第一版建议不要直接写入最终 repo 资产**

因为这时用户还没 Adopt，直接写最终资产风险太高。

**建议第一版落盘目录**

```text
.spec/sessions/<sessionId>/
  manifest.json
  drafts/
    domain.yaml
    api_spec.json
    behaviors.feature
```

**建议函数**

在 `draft.ts` 中新增：

```ts
function writeDraftSession(root: string, sessionId: string, bundle: DraftBundle): string[]
function writeDraftManifest(root: string, manifest: DraftSessionManifest): string
```

**复用文件**

- [tools/jispec/filesystem-storage.ts](/D:/codeSpace/JiSpec/tools/jispec/filesystem-storage.ts)

##### H. 新建 Spec Debt 记录器

**新增文件**

- [tools/jispec/bootstrap/spec-debt.ts](/D:/codeSpace/JiSpec/tools/jispec/bootstrap/spec-debt.ts)

**要做什么**

把 `skip_as_spec_debt` 决策写成结构化记录，而不是散落文本。

**建议导出类型/函数**

```ts
export interface SpecDebtRecord
export function createSpecDebtRecord(sessionId: string, artifact: DraftArtifact, reason?: string): SpecDebtRecord
export function writeSpecDebtRecord(root: string, record: SpecDebtRecord): string
```

**建议字段**

```ts
interface SpecDebtRecord {
  sessionId: string;
  artifactKind: DraftArtifactKind;
  sourceFiles: string[];
  reason?: string;
  createdAt: string;
}
```

**建议落盘位置**

```text
.spec/spec-debt/<sessionId>/<artifactKind>.json
```

##### I. 新建 Adopt 交互器

**新增文件**

- [tools/jispec/bootstrap/adopt.ts](/D:/codeSpace/JiSpec/tools/jispec/bootstrap/adopt.ts)

**要做什么**

实现读取 draft session、逐条展示草稿、收集决策、最终提交。

**建议导出类型**

```ts
export type AdoptDecisionKind = "accept" | "reject" | "skip_as_spec_debt" | "edit";
export interface AdoptDecision
export interface BootstrapAdoptOptions
export interface BootstrapAdoptResult
```

**建议函数**

```ts
export async function runBootstrapAdopt(options: BootstrapAdoptOptions): Promise<BootstrapAdoptResult>
export function renderBootstrapAdoptText(result: BootstrapAdoptResult): string
function loadDraftSession(root: string, session: string): DraftSessionManifest
function loadDraftBundle(root: string, manifest: DraftSessionManifest): DraftBundle
function buildAdoptPreview(artifact: DraftArtifact): string
function applyDecision(decision: AdoptDecision, artifact: DraftArtifact): DraftArtifact | null
```

##### J. Adopt 交互实现建议

**不要引入复杂 TUI**

第一版采用：

- `node:readline/promises`

足够了。

**建议新增函数**

```ts
async function promptAdoptDecision(artifact: DraftArtifact): Promise<AdoptDecisionKind>
async function promptSpecDebtReason(): Promise<string | undefined>
async function editDraftArtifact(artifact: DraftArtifact): Promise<DraftArtifact>
```

**`edit` 的第一版建议**

优先采用最朴素方案：

1. 把当前 artifact 写到临时文件
2. 尝试打开：
   - `$EDITOR`
   - Windows fallback: `notepad`
3. 用户保存退出后回读文件内容

如果当前环境不可打开外部编辑器：

- 回退到内联纯文本替换模式
- 或明确提示“当前环境不支持 edit，请 accept/reject/skip”

##### K. 不直接复用 `TransactionManager.begin()`，而是先做 Repo 级写入批次

**为什么**

当前 [tools/jispec/transaction-manager.ts](/D:/codeSpace/JiSpec/tools/jispec/transaction-manager.ts) 的主事务流默认会：

- 要求 `sliceId`
- 查找 `slice.yaml`
- 快照 slice 目录

这不适合 Bootstrap Adopt 的 repo 级资产提交。

**第一版更稳的做法**

在 `adopt.ts` 内先实现一个最小 repo write batch：

```ts
interface RepoWriteBatch {
  writes: Array<{ path: string; content: string }>;
}
```

**建议函数**

```ts
function buildRepoWriteBatch(root: string, adoptedArtifacts: DraftArtifact[]): RepoWriteBatch
function commitRepoWriteBatch(root: string, batch: RepoWriteBatch): string[]
```

**推荐第一版最终落盘位置**

为了不立刻卷入完整 context/slice 建模，建议先把 Adopt 后的第一批契约资产落到：

```text
.spec/contracts/
  domain.yaml
  api_spec.json
  behaviors.feature
```

这是一层过渡性 canonical 区域。

后续在 `verify / change` 成熟后，再决定是否投影回 `contexts/` 或其他 repo-native 目录。

##### L. 为第二版事务化提交预留存储能力

**建议小改动**

可选增强 [tools/jispec/filesystem-storage.ts](/D:/codeSpace/JiSpec/tools/jispec/filesystem-storage.ts)：

新增：

```ts
renameSync(source: string, destination: string): void
```

**原因**

如果后面要把 adopt 升级为“staging dir + rename commit”，这个能力会用到。

但注意：

- `Task Pack 2` 第一版不要求现在就把 repo write batch 做到完美事务化
- 第一版重点是“不要半写入、不要直接污染最终资产”

##### M. 第一批测试文件清单

**新增测试文件**

- `tools/jispec/tests/bootstrap-draft-mock.ts`
- `tools/jispec/tests/bootstrap-adopt-atomic.ts`
- `tools/jispec/tests/bootstrap-spec-debt.ts`

**测试重点**

`bootstrap-draft-mock.ts`

- discover 之后可以跑 draft
- mock provider 返回的 DraftBundle 可被正确解析
- `.spec/sessions/<id>/drafts/*` 正确落盘

`bootstrap-adopt-atomic.ts`

- adopt 接受 3 个 artifact 后，`.spec/contracts/*` 正确写入
- adopt 中途退出时，不出现半写入状态
- session manifest 状态从 `drafted` -> `adopting` -> `committed`

`bootstrap-spec-debt.ts`

- `skip_as_spec_debt` 会产生 debt record
- 被 skip 的 artifact 不应落入 `.spec/contracts/`

##### N. 第一批实施顺序

建议按下面顺序严格推进：

1. 先写 `draft.ts` 的类型和 manifest
2. 再抽 `runtime/load-ai-config.ts`
3. 再做 prompt builder
4. 再改 `mock-provider.ts`
5. 再接 `bootstrap draft` 命令
6. 再实现 `adopt.ts` 的只读预览
7. 再加 interactive 决策
8. 再补 repo write batch
9. 最后补三份回归测试

##### O. 第一批完成后的可演示结果

`Task Pack 2` 完成后，至少要能现场演示下面这段流程：

```bash
npm run jispec-cli -- bootstrap discover
npm run jispec-cli -- bootstrap draft
npm run jispec-cli -- adopt --interactive
```

终端必须能看到：

- draft session id
- 生成了几份契约草稿
- 每份草稿的 confidence 和 source files
- adopt 决策结果
- 哪些资产被接纳、哪些进入 spec debt

文件结果至少包括：

```text
.spec/sessions/<sessionId>/manifest.json
.spec/sessions/<sessionId>/drafts/domain.yaml
.spec/sessions/<sessionId>/drafts/api_spec.json
.spec/sessions/<sessionId>/drafts/behaviors.feature
.spec/contracts/domain.yaml
.spec/contracts/api_spec.json
.spec/contracts/behaviors.feature
```

如果还做不到“看草稿 -> 做决策 -> 有最终 adopted 资产”，那 `Task Pack 2` 还没有真正完成。

---

### Task Pack 3：Verify Runner 四态输出

#### 目标

把现有校验器封装成新的 `verify` 执行器，形成统一 verdict 输出。

#### 用户动作

```bash
npm run verify
npm run jispec-cli -- verify --json
```

#### 代码改造点

新增模块：

- `tools/jispec/verify/verdict.ts`
- `tools/jispec/verify/verify-runner.ts`
- `tools/jispec/verify/legacy-validator-adapter.ts`

复用模块：

- `validator.ts`
- `semantic-validator.ts`
- `output-validator.ts`
- `gate-checker.ts`
- `trace-manager.ts`

#### 具体怎么做

1. 先不要重写所有验证逻辑
2. 先写一个 `verify-runner`，内部调用现有验证器
3. 把现有 issue 聚合成四态：
   - schema/trace/facts 阻断类 -> `FAIL_BLOCKING`
   - 不支持语言/能力缺失 -> `WARN_ADVISORY`
   - 插件异常/外部依赖异常 -> `ERROR_NONBLOCKING`
   - 全部通过 -> `PASS`
4. 新 JSON 输出必须稳定，方便未来 Action 消费

#### 测试要求

- 针对当前 sample repo 保持 `PASS`
- 构造错误仓库，验证四态映射正确
- snapshot 测试 JSON 输出

#### 验收标准

- `verify` 已经拥有新产品需要的返回语义
- 当前老校验器仍然在底层复用
- 接下来可以逐步替换内部实现，而不破坏 CLI 面

#### 第一批具体代码改动清单

下面这部分按“文件级别 + 函数级别”拆解 `Task Pack 3`，目标是让 `verify` 从“旧 validate 命令的别名”升级成“有稳定 verdict 协议的新主入口”。

有一个关键判断必须先写清楚：

> `Task Pack 3` 的第一版目标不是重写所有验证器，而是先做一个新的 `verify-runner` 外壳，把现有 `validateRepository(...)`、语义检查器和追溯检查器统一收口为稳定的 verdict 和 JSON 输出协议。

所以第一版策略是：

- **先包，不先推倒重写**
- **先统一输出语义，再逐步替换内部实现**
- **先让 CLI 和 CI 有稳定契约，再增加更多事实来源**

##### A. 改造 CLI 入口，让 `verify` 走新执行器

**修改文件**

- [tools/jispec/cli.ts](/D:/codeSpace/JiSpec/tools/jispec/cli.ts)

**要做什么**

1. 让当前 `verify|validate` 命令不再直接调用 `validateRepository(...)`
2. 改为调用新的 `runVerify(...)`
3. 保持 `validate` 作为兼容 alias

**建议新增函数**

```ts
function registerVerifyCommand(program: Command): void
function renderVerifyResult(result: VerifyRunResult, json: boolean): void
```

**建议命令面**

```bash
jispec-cli verify
jispec-cli verify --json
jispec-cli verify --root .
jispec-cli verify --strict
```

**第一版命令选项建议**

- `--root <path>`
- `--json`
- `--strict`

其中：

- `--strict` 第一版可以只是预留，不必立刻做复杂语义

##### B. 新建 Verdict 类型文件

**新增文件**

- `tools/jispec/verify/verdict.ts`

**要做什么**

把四态 verdict、issue 分类、exit code 规则集中定义，避免散落在 CLI 和 runner 里。

**建议导出类型**

```ts
export type VerifyVerdict = "PASS" | "FAIL_BLOCKING" | "WARN_ADVISORY" | "ERROR_NONBLOCKING";
export type VerifyIssueKind = "schema" | "trace" | "semantic" | "missing_file" | "unsupported" | "runtime_error";
export interface VerifyIssue
export interface VerifyRunResult
```

**建议字段**

```ts
interface VerifyIssue {
  kind: VerifyIssueKind;
  severity: "blocking" | "advisory" | "nonblocking_error";
  code: string;
  path?: string;
  message: string;
  details?: unknown;
}

interface VerifyRunResult {
  root: string;
  verdict: VerifyVerdict;
  ok: boolean;
  exitCode: number;
  issueCount: number;
  blockingIssueCount: number;
  advisoryIssueCount: number;
  nonBlockingErrorCount: number;
  issues: VerifyIssue[];
  sources: string[];
  generatedAt: string;
}
```

**建议辅助函数**

```ts
export function createVerifyRunResult(root: string, issues: VerifyIssue[]): VerifyRunResult
export function computeVerifyVerdict(issues: VerifyIssue[]): VerifyVerdict
export function computeVerifyExitCode(verdict: VerifyVerdict): number
export function stableSortVerifyIssues(issues: VerifyIssue[]): VerifyIssue[]
```

**第一版 exit code 约定**

- `PASS` -> `0`
- `WARN_ADVISORY` -> `0`
- `FAIL_BLOCKING` -> `1`
- `ERROR_NONBLOCKING` -> `0`

这样 CI 不会因为外部依赖抖动误阻断。

##### C. 新建 Legacy Validator Adapter

**新增文件**

- `tools/jispec/verify/legacy-validator-adapter.ts`

**要做什么**

把当前 [tools/jispec/validator.ts](/D:/codeSpace/JiSpec/tools/jispec/validator.ts) 的 `ValidationResult` 和 `TraceReport` 等旧结构，映射成 `VerifyIssue[]`。

**建议导出函数**

```ts
export function runLegacyRepositoryValidation(root: string): VerifyIssue[]
export function mapLegacyValidationResult(result: ValidationResult): VerifyIssue[]
export function mapLegacyTraceReport(report: TraceReport): VerifyIssue[]
export function classifyLegacyIssue(issue: ValidationIssue): VerifyIssue
```

**第一版映射策略**

- `ValidationIssue` 默认映射成 `blocking`
- `trace` 相关问题默认映射成 `blocking`
- 无法解析或不支持的情况由上层 runner 映射成 `WARN_ADVISORY` 或 `ERROR_NONBLOCKING`

**为什么先这么保守**

当前老验证器本来就是“只要有 issue 就失败”的心智，第一版 adapter 先完整保留这个安全边界，比过早做复杂降级更稳。

##### D. 新建 Verify Runner

**新增文件**

- `tools/jispec/verify/verify-runner.ts`

**要做什么**

这是 `Task Pack 3` 的主执行器，负责：

1. 调 legacy adapter
2. 可选调补充校验器
3. 聚合 issues
4. 计算 verdict
5. 输出稳定结果对象

**建议导出类型/函数**

```ts
export interface VerifyRunOptions
export async function runVerify(options: VerifyRunOptions): Promise<VerifyRunResult>
export function renderVerifyText(result: VerifyRunResult): string
export function renderVerifyJSON(result: VerifyRunResult): string
```

**建议 options**

```ts
interface VerifyRunOptions {
  root: string;
  strict?: boolean;
}
```

**建议内部函数拆分**

```ts
async function collectLegacyIssues(root: string): Promise<VerifyIssue[]>
async function collectSupplementalIssues(root: string, strict: boolean): Promise<VerifyIssue[]>
function mergeVerifyIssues(...issueSets: VerifyIssue[][]): VerifyIssue[]
function normalizeRuntimeError(error: unknown): VerifyIssue
```

##### E. 第一版补充校验器怎么接

**复用文件**

- [tools/jispec/semantic-validator.ts](/D:/codeSpace/JiSpec/tools/jispec/semantic-validator.ts)
- [tools/jispec/output-validator.ts](/D:/codeSpace/JiSpec/tools/jispec/output-validator.ts)
- [tools/jispec/trace-manager.ts](/D:/codeSpace/JiSpec/tools/jispec/trace-manager.ts)
- [tools/jispec/gate-checker.ts](/D:/codeSpace/JiSpec/tools/jispec/gate-checker.ts)

**关键现实**

这些模块当前都强绑定：

- `sliceId`
- `trace.yaml`
- `slice.yaml`
- 阶段门控

因此：

- `semantic-validator.ts` 不适合直接对整个 repo 做无上下文扫描
- `output-validator.ts` 当前更适合 stage 输出检查，不是 repo verify 主入口
- `gate-checker.ts` 当前是 slice 生命周期工具，不应在 `Task Pack 3` 第一版强接
- `trace-manager.ts` 可以在有 trace 文件时作为补充验证器局部复用

**第一版建议**

`Task Pack 3` 只强依赖：

- `validator.ts`

`trace-manager.ts` 作为可选补充：

- 如果发现目标 trace 文件并能构造最小上下文，则跑
- 否则不阻塞 verify 主流程

**建议在文档中明确**

不要为了“复用更多模块”而把 `verify` 第一版做得过重。

##### F. 新建命令输出协议说明

**建议新增文件**

- `tools/jispec/runtime/command-output.ts`

如果当前不想新建，也至少在 `verify-runner.ts` 内统一输出 JSON 结构，不要让 CLI 直接 `console.log(result.toDict())`。

**建议导出函数**

```ts
export function toPrettyJSON(value: unknown): string
export function formatCountSummary(result: VerifyRunResult): string
```

**原因**

后续：

- GitHub Action
- PR comment renderer
- GitLab note renderer

都会依赖这份稳定输出协议。

##### G. 第一版 JSON 输出协议建议

`verify --json` 建议输出结构：

```json
{
  "root": "D:/codeSpace/JiSpec",
  "verdict": "PASS",
  "ok": true,
  "exit_code": 0,
  "issue_count": 0,
  "blocking_issue_count": 0,
  "advisory_issue_count": 0,
  "non_blocking_error_count": 0,
  "sources": ["legacy-validator"],
  "generated_at": "2026-04-27T00:00:00.000Z",
  "issues": []
}
```

**注意点**

- key 命名一旦确定，尽量不要频繁改
- 这份结构未来就是 Action 和控制面的最小消费契约

##### H. 旧 `validator.ts` 不要大动，只包一层

**复用文件**

- [tools/jispec/validator.ts](/D:/codeSpace/JiSpec/tools/jispec/validator.ts)

**建议复用函数**

- `validateRepository(root)`
- `buildTraceReport(root, sliceId)` 暂不强依赖

**不要做什么**

- 不要现在把 `validator.ts` 的私有函数全部拆开放出来
- 不要现在就把 `slice / stage / context` 术语从文件内部全部替换掉

**原因**

`Task Pack 3` 的目标是建立新的 `verify` 产品表面，不是做一次高风险的底层全量重构。

##### I. Doctor 的第一版增强点

**修改文件**

- [tools/jispec/doctor.ts](/D:/codeSpace/JiSpec/tools/jispec/doctor.ts)

**建议新增检查项**

在当前 `phase5` 之外，先加轻量的 verify readiness 检查即可。

**建议新增函数**

```ts
private async checkVerifyRuntimeSurface(): Promise<DoctorCheckResult>
```

**检查内容建议**

- `tools/jispec/verify/verdict.ts` 是否存在
- `tools/jispec/verify/verify-runner.ts` 是否存在
- `verify` 命令是否仍可执行

当前不必为了 `Task Pack 3` 立刻扩展完整 doctor 子命令面。

##### J. 第一批测试文件清单

**新增测试文件**

- `tools/jispec/tests/verify-runner-pass.ts`
- `tools/jispec/tests/verify-runner-fail-blocking.ts`
- `tools/jispec/tests/verify-runner-runtime-soft-fail.ts`
- `tools/jispec/tests/verify-json-contract.ts`

**测试重点**

`verify-runner-pass.ts`

- 对当前 sample repo 运行 `runVerify(...)`
- verdict 应为 `PASS`
- exit code 应为 `0`

`verify-runner-fail-blocking.ts`

- 构造缺失必要协议文件或 schema 错误的仓库
- verdict 应为 `FAIL_BLOCKING`
- issue 中至少有一个 `blocking`

`verify-runner-runtime-soft-fail.ts`

- 模拟 runner 内部某个补充校验器抛异常
- verdict 应为 `ERROR_NONBLOCKING`
- exit code 仍为 `0`

`verify-json-contract.ts`

- 对 `renderVerifyJSON(...)` 做结构快照
- 校验 key 存在性和稳定排序

##### K. 建议把测试接入回归矩阵

**修改文件**

- [tools/jispec/tests/regression-runner.ts](/D:/codeSpace/JiSpec/tools/jispec/tests/regression-runner.ts)

**建议新增 suites**

- `Verify Runner Pass`
- `Verify Runner Fail Blocking`
- `Verify JSON Contract`

当前 `runtime-soft-fail` 可先单跑，不一定第一天就接进总矩阵。

##### L. 第一批实施顺序

建议严格按下面顺序推进：

1. 先写 `verdict.ts`
2. 再写 `legacy-validator-adapter.ts`
3. 再写 `verify-runner.ts`
4. 再把 `cli.ts` 的 `verify` 命令切到新 runner
5. 再补 `renderVerifyJSON(...)`
6. 最后写 4 份回归测试

**原因**

- 先把 verdict 和结果对象稳定下来
- adapter 完成后，runner 基本只是 orchestration
- CLI 最后接入，可以减少调试时来回跑全命令面的摩擦

##### M. 第一批完成后的可演示结果

`Task Pack 3` 完成后，至少要能现场演示：

```bash
npm run jispec-cli -- verify
npm run jispec-cli -- verify --json
```

终端输出至少包含：

- 当前 verdict
- issue 总数
- blocking / advisory / non-blocking-error 分类统计

JSON 输出必须稳定包含：

- `verdict`
- `ok`
- `exit_code`
- `issue_count`
- `issues`

如果还做不到“旧验证器逻辑不丢失，但对外已经长成新的 verify 协议面”，那 `Task Pack 3` 还没有真正完成。

---

### Task Pack 4：Baseline / Observe / Waiver

#### 目标

让 Verify 能够接纳老仓库，而不是第一次就全仓报红。

#### 用户动作

```bash
npm run jispec-cli -- verify --observe
npm run jispec-cli -- verify --baseline
```

后续再补：

```bash
npm run jispec-cli -- waiver create ...
```

#### 代码改造点

新增模块：

- `tools/jispec/verify/baseline-store.ts`
- `tools/jispec/verify/observe-mode.ts`
- `tools/jispec/verify/waiver-store.ts`

复用模块：

- `cache-manager.ts`
- `transaction-manager.ts`
- `doctor.ts`

#### 具体怎么做

1. baseline 先冻结当前验证事实摘要
2. observe 模式只降级 verdict，不改事实收集
3. waiver 先做本地文件版，不先做 SaaS 审批流
4. waiver 数据结构必须预留：
   - rule_id
   - owner
   - reason
   - expires_at

#### 测试要求

- baseline 后重复运行不会误报历史问题
- observe 不会把 block 错误吞掉，只是降级显示
- waiver 到期后能恢复正常阻断

#### 验收标准

- 老仓库接入体验明显变顺
- 历史债务和新增 drift 被清晰区分

#### 第一批具体代码改动清单

下面这部分按“文件级别 + 函数级别”拆解 `Task Pack 4`，目标是让 `baseline / observe / waiver` 真正成为 `verify` 的可落地减震层，而不是概念占位。

先写清楚两个关键判断：

> `baseline` 和 `waiver` 是 repo 级、持久化、可审计的治理状态，不是缓存。

所以：

- **不应直接复用 `.jispec-cache` 作为 baseline/waiver 存储**
- **不应直接复用 `TransactionManager.begin(...)` 做 baseline/waiver 的第一版提交**

`cache-manager.ts` 和 `transaction-manager.ts` 在这里更多是 `思想参考`，不是第一版主实现入口。

第二个判断：

> `observe` 不是重新跑一遍验证，而是在 raw verify result 之上做一个“只降级 verdict、不修改事实收集”的后处理层。

所以第一版顺序必须是：

1. 先跑 raw verify
2. 再应用 waiver
3. 再应用 baseline
4. 最后才应用 observe mode

##### A. 改造 CLI 入口与命令面

**修改文件**

- [tools/jispec/cli.ts](/D:/codeSpace/JiSpec/tools/jispec/cli.ts)

**要做什么**

1. 给 `verify` 增加：
   - `--observe`
   - `--baseline`
   - `--write-baseline`
2. 新增 `waiver` 命令组
3. 第一版只强实现 `waiver create`，`list/show` 可视进度补

**建议新增函数**

```ts
function registerWaiverCommands(program: Command): void
function renderWaiverCreateResult(result: WaiverCreateResult, json: boolean): void
```

**建议命令面**

```bash
jispec-cli verify --baseline
jispec-cli verify --write-baseline
jispec-cli verify --observe

jispec-cli waiver create --code MISSING_FILE --owner alice --reason "Known legacy debt" --expires-at 2026-05-31T00:00:00.000Z
```

**第一版选项建议**

`verify`

- `--baseline`
  使用默认 baseline 文件
- `--write-baseline`
  用当前结果刷新 baseline
- `--observe`
  对剩余 blocking 结果做最终降级

`waiver create`

- `--code <issueCode>`
- `--path <issuePath>`
- `--owner <owner>`
- `--reason <reason>`
- `--expires-at <iso>`
- `--json`

##### B. 新建稳定 issue fingerprint 辅助层

**强烈建议新增文件**

- `tools/jispec/verify/issue-fingerprint.ts`

虽然 `Task Pack 4` 原始列表里没写这个文件，但第一版如果不把 fingerprint 单独抽出来，baseline 和 waiver 很容易各写一套不兼容匹配逻辑。

**建议导出函数**

```ts
export function normalizeIssueFingerprintInput(issue: VerifyIssue): string
export function computeIssueFingerprint(issue: VerifyIssue): string
export function issueMatchesCodeAndPath(issue: VerifyIssue, code: string, path?: string): boolean
```

**建议指纹组成**

- `kind`
- `code`
- `normalized path`
- `normalized message`

**实现要求**

- path 统一 `/`
- message 做基础 trim
- 字符串拼接后再 hash

##### C. 新建 Baseline Store

**新增文件**

- `tools/jispec/verify/baseline-store.ts`

**要做什么**

实现 baseline 的读、写、应用逻辑。

**建议导出类型**

```ts
export interface BaselineEntry
export interface VerifyBaseline
export interface BaselineApplyResult
```

**建议字段**

```ts
interface BaselineEntry {
  fingerprint: string;
  code: string;
  path?: string;
  message: string;
  severity: "blocking" | "advisory" | "nonblocking_error";
}

interface VerifyBaseline {
  version: 1;
  createdAt: string;
  updatedAt: string;
  repoRoot: string;
  sourceVerdict: string;
  entries: BaselineEntry[];
}

interface BaselineApplyResult {
  matchedFingerprints: string[];
  downgradedIssues: VerifyIssue[];
  remainingIssues: VerifyIssue[];
}
```

**建议导出函数**

```ts
export function loadVerifyBaseline(root: string, filePath?: string): VerifyBaseline | null
export function writeVerifyBaseline(root: string, result: VerifyRunResult, filePath?: string): string
export function applyVerifyBaseline(result: VerifyRunResult, baseline: VerifyBaseline): VerifyRunResult
export function buildVerifyBaseline(result: VerifyRunResult): VerifyBaseline
```

**建议默认落盘位置**

```text
.spec/baselines/verify-baseline.json
```

**第一版语义**

- baseline 只记录当前 result 里的 `blocking` issues
- 下次 verify 时，若 issue fingerprint 命中 baseline：
  - 不再计入 blocking
  - 降级为 advisory
  - 在 details 中标注 `matched_by: baseline`

##### D. 新建 Observe Mode 后处理器

**新增文件**

- `tools/jispec/verify/observe-mode.ts`

**要做什么**

实现“最终降级层”。

**建议导出函数**

```ts
export function applyObserveMode(result: VerifyRunResult): VerifyRunResult
export function downgradeBlockingIssuesToAdvisory(result: VerifyRunResult, reason: string): VerifyRunResult
```

**第一版语义**

- 只对当前剩余 `blocking` issues 生效
- 不修改 issue 的 `code/path/message`
- 只修改：
  - `severity`
  - `verdict`
  - 统计计数

**observe 后的期望**

- 有 blocking issue 也能得到 `WARN_ADVISORY`
- JSON 输出里仍然保留完整 issues，方便 CI 和人类理解

##### E. 新建 Waiver Store

**新增文件**

- `tools/jispec/verify/waiver-store.ts`

**要做什么**

实现 waiver 的本地持久化、匹配和应用逻辑。

**建议导出类型**

```ts
export interface VerifyWaiver
export interface WaiverCreateOptions
export interface WaiverCreateResult
```

**建议字段**

```ts
interface VerifyWaiver {
  waiverId: string;
  createdAt: string;
  owner: string;
  reason: string;
  expiresAt: string;
  issueCode: string;
  issuePath?: string;
  issueFingerprint?: string;
  ruleId?: string;
}
```

注意：

- `ruleId` 要预留给 Task Pack 5 之后的 policy/rule 体系
- 但 `Task Pack 4` 第一版主要靠 `issueCode + optional path` 或 `issueFingerprint`

**建议导出函数**

```ts
export function createWaiver(root: string, options: WaiverCreateOptions): WaiverCreateResult
export function listWaivers(root: string): VerifyWaiver[]
export function loadActiveWaivers(root: string, now?: Date): VerifyWaiver[]
export function applyWaivers(result: VerifyRunResult, waivers: VerifyWaiver[]): VerifyRunResult
export function isWaiverExpired(waiver: VerifyWaiver, now?: Date): boolean
```

**建议默认落盘位置**

```text
.spec/waivers/*.json
```

##### F. 让 `verify-runner.ts` 接入 baseline / waiver / observe

**修改文件**

- `tools/jispec/verify/verify-runner.ts`

**要做什么**

在 `Task Pack 3` 的 raw verify 结果之上，接入三段后处理：

1. `applyWaivers(...)`
2. `applyVerifyBaseline(...)`
3. `applyObserveMode(...)`

**建议扩展 options**

```ts
interface VerifyRunOptions {
  root: string;
  strict?: boolean;
  useBaseline?: boolean;
  writeBaseline?: boolean;
  observe?: boolean;
  applyWaivers?: boolean;
}
```

**建议内部函数**

```ts
async function applyPostProcessing(result: VerifyRunResult, options: VerifyRunOptions): Promise<VerifyRunResult>
function annotateResultModes(result: VerifyRunResult, metadata: VerifyResultModeMetadata): VerifyRunResult
```

**建议新增 result metadata**

如果 `Task Pack 3` 的 `VerifyRunResult` 还没扩展，建议现在补一个可选字段：

```ts
interface VerifyRunResult {
  ...
  modes?: {
    baselineApplied?: boolean;
    observeApplied?: boolean;
    waiverCount?: number;
    baselineMatchCount?: number;
  };
}
```

##### G. 第一版不要直接复用 `CacheManager`

**复用文件**

- [tools/jispec/cache-key.ts](/D:/codeSpace/JiSpec/tools/jispec/cache-key.ts)

**不建议直接复用**

- [tools/jispec/cache-manager.ts](/D:/codeSpace/JiSpec/tools/jispec/cache-manager.ts)

**原因**

`CacheManager` 当前的职责是：

- 临时执行缓存
- manifest/result L1/L2
- `.jispec-cache/`

而 baseline/waiver 是：

- repo 级持久策略状态
- 要进仓库或至少进 `.spec/`
- 不能因为缓存失效语义被误删

**可复用点**

如果想避免重复造 hash 逻辑，可复用：

```ts
computeContentHash(...)
```

来生成 issue fingerprint，但不要把 baseline 直接存进 `.jispec-cache`

##### H. 第一版不要直接复用 `TransactionManager.begin(...)`

**参考文件**

- [tools/jispec/transaction-manager.ts](/D:/codeSpace/JiSpec/tools/jispec/transaction-manager.ts)

**原因**

当前事务流默认假设：

- 有 `sliceId`
- 有 `slice.yaml`
- 要快照 slice 文件树

这不适合 repo 级 baseline / waiver 文件写入。

**第一版建议**

baseline / waiver 的写入先直接用：

- `FilesystemStorage.writeFileSync(...)`

因为它们是单文件、幂等、可覆盖写入的配置状态。

等后续 repo 级写入批次成熟后，再统一事务化。

##### I. 推荐第一版文件结构

```text
.spec/
  baselines/
    verify-baseline.json
  waivers/
    waiver-<timestamp>.json
```

**可选增强**

若想支持多套 baseline，可进一步演进为：

```text
.spec/baselines/
  verify-default.json
  verify-strict.json
```

但第一版不必过度设计。

##### J. Doctor 的增强点

**修改文件**

- [tools/jispec/doctor.ts](/D:/codeSpace/JiSpec/tools/jispec/doctor.ts)

**建议新增函数**

```ts
private async checkVerifyMitigationLayer(): Promise<DoctorCheckResult>
```

**检查内容建议**

- `tools/jispec/verify/baseline-store.ts` 是否存在
- `tools/jispec/verify/observe-mode.ts` 是否存在
- `tools/jispec/verify/waiver-store.ts` 是否存在
- 若 `.spec/baselines/verify-baseline.json` 存在，则 JSON 可解析
- 若 `.spec/waivers/` 存在，则能跳过过期记录

##### K. 第一批测试文件清单

**新增测试文件**

- `tools/jispec/tests/verify-baseline-roundtrip.ts`
- `tools/jispec/tests/verify-baseline-new-drift.ts`
- `tools/jispec/tests/verify-observe-mode.ts`
- `tools/jispec/tests/verify-waiver-expiry.ts`

**测试重点**

`verify-baseline-roundtrip.ts`

- 创建 baseline
- 再次运行同一结果
- verdict 不应再是 `FAIL_BLOCKING`

`verify-baseline-new-drift.ts`

- baseline 只掩盖旧问题
- 新增 blocking issue 仍应触发 `FAIL_BLOCKING`

`verify-observe-mode.ts`

- 原始 blocking issue 在 observe 下变成 advisory
- `issues` 仍然保留

`verify-waiver-expiry.ts`

- 在有效期内 waiver 可以降级 issue
- 过期后同 issue 恢复阻断

##### L. 建议把部分测试接入回归矩阵

**修改文件**

- [tools/jispec/tests/regression-runner.ts](/D:/codeSpace/JiSpec/tools/jispec/tests/regression-runner.ts)

**建议新增 suites**

- `Verify Baseline Roundtrip`
- `Verify Observe Mode`

`waiver-expiry` 可先单独运行，避免第一批把时间敏感测试塞进总矩阵过多。

##### M. 第一批实施顺序

建议严格按下面顺序推进：

1. 先写 `issue-fingerprint.ts`
2. 再写 `baseline-store.ts`
3. 再写 `observe-mode.ts`
4. 再写 `waiver-store.ts`
5. 再把 `verify-runner.ts` 接上后处理链
6. 再修改 `cli.ts` 暴露新选项和 `waiver create`
7. 最后补 4 份回归测试

**原因**

- baseline 和 waiver 的核心都是稳定匹配
- 先把 matching 做稳，后续模式切换才不乱
- `verify-runner` 只负责 orchestration，不应该反过来主导存储模型

##### N. 第一批完成后的可演示结果

`Task Pack 4` 完成后，至少要能现场演示：

```bash
npm run jispec-cli -- verify --write-baseline
npm run jispec-cli -- verify --baseline
npm run jispec-cli -- verify --observe
npm run jispec-cli -- waiver create --code MISSING_FILE --owner alice --reason "Known debt" --expires-at 2026-05-31T00:00:00.000Z
```

终端输出至少包含：

- 当前是否应用了 baseline
- baseline 命中了多少 issues
- 当前是否应用 observe
- 当前生效 waiver 数量

文件结果至少包括：

```text
.spec/baselines/verify-baseline.json
.spec/waivers/waiver-*.json
```

如果还做不到“历史问题被区分为已知债务、新问题仍然阻断、observe 能一键降级、waiver 有本地生命周期”，那 `Task Pack 4` 还没有真正完成。

---

### Task Pack 5：Facts Contract 与 YAML Policy DSL

#### 目标

为后续规则治理和控制面打下稳定契约层。

#### 用户动作

```bash
npm run jispec-cli -- verify --policy .spec/policy.yaml
```

#### 代码改造点

新增模块：

- `tools/jispec/facts/raw-facts.ts`
- `tools/jispec/facts/canonical-facts.ts`
- `tools/jispec/facts/facts-contract.ts`
- `tools/jispec/policy/policy-engine.ts`
- `tools/jispec/policy/policy-schema.ts`

复用模块：

- `doctor.ts`
- `artifact-identity.ts`
- `version-resolver.ts`

#### 具体怎么做

1. 先定义最小 stable facts：
   - `api.new_endpoints`
   - `openapi.breaking_changes`
   - `bdd.missing_scenarios`
   - `git.changed_paths`
2. Policy DSL 先只支持：
   - `all / any / not`
   - 基础比较
   - `pass / warn / fail_blocking`
3. 在 `verify-runner` 里加入 policy evaluation hook
4. 所有 blocking 规则只能读 stable facts

#### 测试要求

- 错误 policy 文件有清晰报错
- stable fact 改名时必须通过 adapter 层兼容
- policy 结果可 snapshot

#### 验收标准

- 规则已经不再全靠硬编码特例
- 未来控制面可以下发 bundle，而不必改 CLI 核心代码

#### 第一批具体代码改动清单

下面这部分按“文件级别 + 函数级别”拆解 `Task Pack 5`，目标是让项目拥有第一版可用的 `facts contract + policy DSL + verify hook`，而不是继续把所有规则散落在硬编码判断里。

先写清楚三个关键判断：

> 第一版 `Task Pack 5` 的目标不是把所有高级 facts 一次性生产出来，而是先把“事实层、契约层、策略层、执行钩子”这四个边界稳定下来。

也就是说：

- **先把 facts schema 和 policy engine 做稳**
- **再逐步增加更丰富的 facts producer**
- **先让 verify 能消费 policy**
- **不要等所有 analyzers 都完美了才开始做规则层**

第二个判断：

> `facts contract` 不应该直接暴露 legacy validator 或具体 analyzer 的内部字段，而应该输出一层新的 canonical facts。

所以：

- **raw facts 允许粗糙和演进**
- **canonical facts 必须稳定**
- **policy 只读 canonical facts**

第三个判断：

> `version-resolver.ts` 和 `artifact-identity.ts` 不是 policy engine 本体，但它们适合作为“版本兼容”和“事实来源标识”的基础件复用。

所以：

- **不要用 `VersionResolver` 直接执行 DSL**
- **但可以借它的思路和数据结构做 contract compatibility**
- **可以用 `ArtifactIdentity` / `toCanonicalId(...)` 表示 fact 来源**

##### A. 改造 CLI 入口与命令面

**修改文件**

- [tools/jispec/cli.ts](/D:/codeSpace/JiSpec/tools/jispec/cli.ts)

**要做什么**

1. 给 `verify` 增加：
   - `--policy <path>`
   - `--facts-out <path>`
2. 保留默认无 policy 也能运行
3. 如果显式传入 `--policy`，则 verify 必须在结果里标明 policy 是否生效

**建议命令面**

```bash
jispec-cli verify --policy .spec/policy.yaml
jispec-cli verify --facts-out .spec/facts/latest-canonical.json
```

**建议新增函数**

```ts
function registerVerifyPolicyFlags(): void
```

当前也可以不单独抽函数，但要保证命令面已经稳定。

##### B. 新建 Raw Facts 快照层

**新增文件**

- `tools/jispec/facts/raw-facts.ts`

**要做什么**

定义 raw facts 的最小存储结构和快照构建器。

**建议导出类型**

```ts
export interface RawFactRecord
export interface RawFactsSnapshot
export interface RawFactsSource
```

**建议字段**

```ts
interface RawFactRecord {
  key: string;
  value: unknown;
  source: string;
}

interface RawFactsSource {
  name: string;
  version?: string;
}

interface RawFactsSnapshot {
  generatedAt: string;
  repoRoot: string;
  sources: RawFactsSource[];
  records: RawFactRecord[];
  warnings: string[];
}
```

**建议导出函数**

```ts
export function createRawFactsSnapshot(root: string): RawFactsSnapshot
export function addRawFact(snapshot: RawFactsSnapshot, key: string, value: unknown, source: string): void
export function stableSortRawFacts(snapshot: RawFactsSnapshot): RawFactsSnapshot
```

**第一版事实来源建议**

`Task Pack 5` 第一版不要追求太多来源，先接这几类：

- `verify-runner`
  - `verify.issue_count`
  - `verify.blocking_issue_count`
  - `verify.issue_codes`
- `.spec/contracts/`
  - `contracts.domain.present`
  - `contracts.api.present`
  - `contracts.behavior.present`
- `git diff / repo inventory`
  - `git.changed_paths` 若可得

##### C. 新建 Canonical Facts 层

**新增文件**

- `tools/jispec/facts/canonical-facts.ts`

**要做什么**

定义 policy 唯一可见的 canonical facts，以及从 raw facts 映射到 canonical facts 的标准过程。

**建议导出类型**

```ts
export type FactStability = "stable" | "beta" | "experimental";
export interface CanonicalFactDefinition
export interface CanonicalFactsSnapshot
```

**建议字段**

```ts
interface CanonicalFactDefinition {
  key: string;
  stability: FactStability;
  description: string;
}

interface CanonicalFactsSnapshot {
  generatedAt: string;
  repoRoot: string;
  contractVersion: string;
  facts: Record<string, unknown>;
  warnings: string[];
}
```

**建议导出函数**

```ts
export function buildCanonicalFacts(raw: RawFactsSnapshot): CanonicalFactsSnapshot
export function getCanonicalFactDefinitions(): CanonicalFactDefinition[]
export function stableSortCanonicalFacts(snapshot: CanonicalFactsSnapshot): CanonicalFactsSnapshot
```

##### D. 第一版事实清单的现实切分

**必须明确一件事**

文档前面提到的目标 facts：

- `api.new_endpoints`
- `openapi.breaking_changes`
- `bdd.missing_scenarios`
- `git.changed_paths`

并不意味着 `Task Pack 5` 第一天就能把这四个都高质量算出来。

第一版建议切成两层：

**第一批真正可落地的 stable facts**

- `verify.issue_count`
- `verify.blocking_issue_count`
- `verify.issue_codes`
- `contracts.domain.present`
- `contracts.api.present`
- `contracts.behavior.present`

**第一批可先定义 contract、但允许后续 producer 补足的 beta facts**

- `api.new_endpoints`
- `openapi.breaking_changes`
- `bdd.missing_scenarios`
- `git.changed_paths`

这样做的好处是：

- contract 先稳定
- richer analyzer 后续再接
- policy engine 今天就可以跑

##### E. 新建 Facts Contract 定义层

**新增文件**

- `tools/jispec/facts/facts-contract.ts`

**要做什么**

管理 facts contract version、定义列表、兼容性判断和 contract hash。

**建议导出类型**

```ts
export interface FactsContract
export interface FactsContractCompatibility
```

**建议字段**

```ts
interface FactsContract {
  version: string;
  facts: CanonicalFactDefinition[];
  contractHash: string;
}

interface FactsContractCompatibility {
  compatible: boolean;
  requiredVersion: string;
  actualVersion: string;
  reason?: string;
}
```

**建议导出函数**

```ts
export function createFactsContract(): FactsContract
export function computeFactsContractHash(contract: FactsContract): string
export function checkFactsContractCompatibility(requiredVersion: string, actualVersion: string): FactsContractCompatibility
export function getStableFactKeys(contract: FactsContract): string[]
```

**复用建议**

可复用：

- [tools/jispec/cache-key.ts](/D:/codeSpace/JiSpec/tools/jispec/cache-key.ts) 中的 `computeContentHash(...)`

可参考但不宜直接套用：

- [tools/jispec/version-resolver.ts](/D:/codeSpace/JiSpec/tools/jispec/version-resolver.ts)

**原因**

`VersionResolver` 更偏依赖约束协商，不适合直接当 facts contract engine，但它的兼容性思路可以借鉴。

##### F. 新建 Policy Schema 与 Loader

**新增文件**

- `tools/jispec/policy/policy-schema.ts`
- 建议补一个 `tools/jispec/policy/policy-loader.ts`

虽然原任务只写了 `policy-schema.ts`，但第一版如果没有 loader，`verify-runner` 很快会把 YAML 加载、校验、默认值逻辑都堆进去。

**建议导出类型**

```ts
export type PolicyAction = "pass" | "warn" | "fail_blocking";
export interface PolicyCondition
export interface PolicyRule
export interface VerifyPolicy
```

**建议 DSL 结构**

```ts
type PolicyCondition =
  | { all: PolicyCondition[] }
  | { any: PolicyCondition[] }
  | { not: PolicyCondition }
  | { fact: string; op: "==" | "!=" | ">" | ">=" | "<" | "<=" | "contains" | "in"; value: unknown };

interface PolicyRule {
  id: string;
  enabled: boolean;
  action: PolicyAction;
  message: string;
  when: PolicyCondition;
}

interface VerifyPolicy {
  version: 1;
  requires?: {
    facts_contract?: string;
  };
  rules: PolicyRule[];
}
```

**建议导出函数**

`policy-schema.ts`

```ts
export function validateVerifyPolicy(policy: unknown): VerifyPolicy
export function createDefaultVerifyPolicy(): VerifyPolicy
```

`policy-loader.ts`

```ts
export function loadVerifyPolicy(root: string, filePath?: string): VerifyPolicy | null
export function resolvePolicyPath(root: string, filePath?: string): string
```

**建议默认路径**

```text
.spec/policy.yaml
```

##### G. 新建 Policy Engine

**新增文件**

- `tools/jispec/policy/policy-engine.ts`

**要做什么**

实现针对 canonical facts 的策略求值，并把规则命中结果变成 `VerifyIssue[]` 或等效 rule result。

**建议导出类型**

```ts
export interface PolicyRuleResult
export interface PolicyEvaluationResult
```

**建议字段**

```ts
interface PolicyRuleResult {
  ruleId: string;
  action: PolicyAction;
  matched: boolean;
  message: string;
}

interface PolicyEvaluationResult {
  matchedRules: PolicyRuleResult[];
  generatedIssues: VerifyIssue[];
  warnings: string[];
}
```

**建议导出函数**

```ts
export function evaluateVerifyPolicy(policy: VerifyPolicy, facts: CanonicalFactsSnapshot): PolicyEvaluationResult
export function evaluatePolicyCondition(condition: PolicyCondition, facts: CanonicalFactsSnapshot): boolean
export function resolveFactValue(facts: CanonicalFactsSnapshot, factKey: string): unknown
export function policyRuleResultToVerifyIssue(result: PolicyRuleResult): VerifyIssue | null
```

**第一版行为建议**

- `fail_blocking`
  生成 `blocking` issue
- `warn`
  生成 `advisory` issue
- `pass`
  不生成 issue

##### H. 第一版不要让 Policy Engine 直接消费 Raw Facts

**原因**

如果 policy 直接读 raw facts，后面任何 producer 结构变化都会把规则打碎。

**必须保持**

- producer 输出 `RawFactsSnapshot`
- normalizer 输出 `CanonicalFactsSnapshot`
- policy engine 只读 `CanonicalFactsSnapshot`

这是这个任务包最重要的架构纪律。

##### I. 让 `verify-runner.ts` 接入 facts 和 policy hook

**修改文件**

- `tools/jispec/verify/verify-runner.ts`

**要做什么**

在 `Task Pack 3` 的 raw verify + mitigation 链路之上，插入：

1. raw facts 生成
2. canonical facts 生成
3. 可选 policy 加载
4. policy evaluation
5. rule-generated issues merge

**建议顺序**

```text
legacy verify issues
-> supplemental issues
-> raw verify result
-> raw facts snapshot
-> canonical facts snapshot
-> policy evaluation
-> merge policy-generated issues
-> waivers
-> baseline
-> observe
```

**建议扩展 options**

```ts
interface VerifyRunOptions {
  root: string;
  strict?: boolean;
  useBaseline?: boolean;
  writeBaseline?: boolean;
  observe?: boolean;
  applyWaivers?: boolean;
  policyPath?: string;
  factsOutPath?: string;
}
```

**建议新增函数**

```ts
async function buildRawFactsSnapshot(result: VerifyRunResult, options: VerifyRunOptions): Promise<RawFactsSnapshot>
async function buildCanonicalFactsSnapshot(raw: RawFactsSnapshot): Promise<CanonicalFactsSnapshot>
async function applyPolicyHook(result: VerifyRunResult, facts: CanonicalFactsSnapshot, options: VerifyRunOptions): Promise<VerifyRunResult>
```

##### J. 让 Facts 结果可选落盘

**建议默认输出路径**

```text
.spec/facts/latest-raw.json
.spec/facts/latest-canonical.json
```

**落盘规则建议**

- 默认不强制写盘
- 当传入 `--facts-out` 时至少输出 canonical facts
- 若后续需要调试，可加 `--write-facts`

**复用文件**

- [tools/jispec/filesystem-storage.ts](/D:/codeSpace/JiSpec/tools/jispec/filesystem-storage.ts)

##### K. 复用 `artifact-identity.ts` 的正确边界

**复用文件**

- [tools/jispec/artifact-identity.ts](/D:/codeSpace/JiSpec/tools/jispec/artifact-identity.ts)

**建议复用点**

- `toCanonicalId(...)`
- `fromPath(...)` 的设计思路

**第一版用法建议**

如果某个 fact 明确来自一个 canonical asset 文件，例如：

- `.spec/contracts/domain.yaml`
- `.spec/contracts/api_spec.json`

可以在 raw facts 的 `source` 字段里使用规范化标识，而不是随意字符串。

但注意：

- 不要为了接入 `ArtifactIdentity` 而强行把 facts 结构复杂化
- 第一版只把它作为来源命名规范，不把 policy 求值绑定到它

##### L. 复用 `version-resolver.ts` 的正确边界

**复用文件**

- [tools/jispec/version-resolver.ts](/D:/codeSpace/JiSpec/tools/jispec/version-resolver.ts)

**不建议直接复用**

- `VersionResolver.resolveVersion(...)`

**建议复用方式**

- 借鉴其“required vs actual compatibility”思路
- 如果后续需要更复杂的版本约束，再抽共用比较器

第一版 `facts_contract` 兼容判断完全可以先做成简单字符串版本比较或完全一致匹配，不要过度工程化。

##### M. Doctor 的增强点

**修改文件**

- [tools/jispec/doctor.ts](/D:/codeSpace/JiSpec/tools/jispec/doctor.ts)

**建议新增函数**

```ts
private async checkFactsAndPolicySurface(): Promise<DoctorCheckResult>
```

**检查内容建议**

- `tools/jispec/facts/raw-facts.ts` 是否存在
- `tools/jispec/facts/canonical-facts.ts` 是否存在
- `tools/jispec/facts/facts-contract.ts` 是否存在
- `tools/jispec/policy/policy-engine.ts` 是否存在
- `tools/jispec/policy/policy-schema.ts` 是否存在
- 若 `.spec/policy.yaml` 存在，则它能被正确解析

##### N. 第一批测试文件清单

**新增测试文件**

- `tools/jispec/tests/facts-contract-roundtrip.ts`
- `tools/jispec/tests/policy-engine-basic.ts`
- `tools/jispec/tests/policy-engine-nested-conditions.ts`
- `tools/jispec/tests/verify-policy-integration.ts`
- `tools/jispec/tests/policy-unknown-fact.ts`

**测试重点**

`facts-contract-roundtrip.ts`

- stable fact definitions 顺序稳定
- contract hash 可重放
- canonical facts snapshot 序列化稳定

`policy-engine-basic.ts`

- 基础比较 `== != > >= < <=`
- `pass / warn / fail_blocking`

`policy-engine-nested-conditions.ts`

- `all / any / not`
- 嵌套求值正确

`verify-policy-integration.ts`

- `verify-runner` 加载 policy 后会生成附加 issues
- baseline/waiver/observe 仍然按既定顺序工作

`policy-unknown-fact.ts`

- 引用不存在 fact 时给出清晰 warning
- 第一版建议：
  - 不直接抛异常炸掉 verify
  - 生成 `ERROR_NONBLOCKING` 或 advisory warning

##### O. 建议把部分测试接入回归矩阵

**修改文件**

- [tools/jispec/tests/regression-runner.ts](/D:/codeSpace/JiSpec/tools/jispec/tests/regression-runner.ts)

**建议新增 suites**

- `Facts Contract Roundtrip`
- `Policy Engine Basic`
- `Verify Policy Integration`

`policy-unknown-fact` 可先单跑，避免第一版矩阵过于复杂。

##### P. 第一批实施顺序

建议严格按下面顺序推进：

1. 先写 `raw-facts.ts`
2. 再写 `canonical-facts.ts`
3. 再写 `facts-contract.ts`
4. 再写 `policy-schema.ts`
5. 再写 `policy-loader.ts`
6. 再写 `policy-engine.ts`
7. 再把 `verify-runner.ts` 接上 facts + policy hook
8. 再修改 `cli.ts` 暴露 `--policy` / `--facts-out`
9. 最后补 5 份回归测试

**原因**

- facts 层必须先稳定
- contract 层不稳定时，policy schema 就很容易反复改
- 先让 policy engine 能单独测，再挂进 verify-runner，调试成本最低

##### Q. 第一批完成后的可演示结果

`Task Pack 5` 完成后，至少要能现场演示：

```bash
npm run jispec-cli -- verify --policy .spec/policy.yaml --facts-out .spec/facts/latest-canonical.json
```

终端输出至少包含：

- 是否加载了 policy
- facts contract 版本
- 命中了多少 policy rules
- 新增了多少 policy-generated issues

文件结果至少包括：

```text
.spec/facts/latest-canonical.json
.spec/policy.yaml
```

如果还做不到“verify 不只是硬编码校验，还能在稳定 canonical facts 之上执行一套最小 YAML policy”，那 `Task Pack 5` 还没有真正完成。

##### R. 基于当前仓库现状的开工映射

`Task Pack 5` 这里需要再强调一次真实落点：

- 当前仓库里已经有 [tools/jispec/validator.ts](/D:/codeSpace/JiSpec/tools/jispec/validator.ts) 和 [tools/jispec/cli.ts](/D:/codeSpace/JiSpec/tools/jispec/cli.ts)
- 但当前仓库里还没有 `tools/jispec/verify/`、`tools/jispec/facts/`、`tools/jispec/policy/` 这一组新目录
- 所以这一包的正确做法不是“回头重写 `validator.ts`”，而是“在现有验证器外面建立新的 facts/policy 外壳”

这意味着第一批开工时应当明确区分三类文件：

**第一类：保持稳定，只被包一层**

| 文件 | 现状 | Task Pack 5 的处理方式 |
| --- | --- | --- |
| [tools/jispec/validator.ts](/D:/codeSpace/JiSpec/tools/jispec/validator.ts) | 当前 `validateRepository(...)` 是 verify 的事实来源之一 | 不重写验证逻辑；继续通过 `legacy-validator-adapter.ts` 间接消费 |
| [tools/jispec/semantic-validator.ts](/D:/codeSpace/JiSpec/tools/jispec/semantic-validator.ts) | 当前偏 slice/stage 语义校验 | 本包不直接接入 policy；先维持独立 |
| [tools/jispec/output-validator.ts](/D:/codeSpace/JiSpec/tools/jispec/output-validator.ts) | 当前偏单 slice 输出约束 | 本包不强接，避免把 verify 主线拖重 |
| [tools/jispec/gate-checker.ts](/D:/codeSpace/JiSpec/tools/jispec/gate-checker.ts) | 当前偏生命周期 gate | 本包不接入 facts/policy 判定链 |

**第二类：需要改入口，但只做薄改**

| 文件 | 必改函数/位置 | 改法 |
| --- | --- | --- |
| [tools/jispec/cli.ts](/D:/codeSpace/JiSpec/tools/jispec/cli.ts) | `buildProgram()` 里 `.command("verify")` 的 action | 不再直接 `validateRepository(...)`；改为调用 `runVerify(...)`，并新增 `--policy`、`--facts-out` 选项 |
| [tools/jispec/doctor.ts](/D:/codeSpace/JiSpec/tools/jispec/doctor.ts) | `checkPhase5()` 与新增 `checkFactsAndPolicySurface()` | 把 facts/policy 文件存在性和 `.spec/policy.yaml` 可解析性纳入检查 |
| [tools/jispec/tests/regression-runner.ts](/D:/codeSpace/JiSpec/tools/jispec/tests/regression-runner.ts) | suite 注册逻辑 | 新增 `Facts Contract Roundtrip`、`Policy Engine Basic`、`Verify Policy Integration` |

**第三类：本包真正新增的主模块**

| 新文件 | 第一批必须落下的函数 |
| --- | --- |
| `tools/jispec/facts/raw-facts.ts` | `buildRawFactsSnapshot(...)` `collectContractPresenceFacts(...)` `collectVerifyIssueFacts(...)` |
| `tools/jispec/facts/canonical-facts.ts` | `buildCanonicalFacts(...)` `stableSortCanonicalFacts(...)` `getCanonicalFactDefinitions()` |
| `tools/jispec/facts/facts-contract.ts` | `createFactsContract()` `computeFactsContractHash(...)` `checkFactsContractCompatibility(...)` |
| `tools/jispec/policy/policy-schema.ts` | `validateVerifyPolicy(...)` `createDefaultVerifyPolicy()` |
| `tools/jispec/policy/policy-loader.ts` | `resolvePolicyPath(...)` `loadVerifyPolicy(...)` |
| `tools/jispec/policy/policy-engine.ts` | `evaluateVerifyPolicy(...)` `evaluatePolicyCondition(...)` `resolveFactValue(...)` |
| `tools/jispec/verify/verify-runner.ts` | `buildRawFactsSnapshot(...)` `buildCanonicalFactsSnapshot(...)` `applyPolicyHook(...)` |

##### S. 文件级别与函数级别的“马上开工”清单

下面这份清单按“先建什么文件，再改什么函数”的顺序写，适合直接开工。

**1. 先确认前置壳存在**

如果 `Task Pack 3` / `Task Pack 4` 代码还没正式落地，先补齐最小 verify 壳：

- `tools/jispec/verify/verdict.ts`
- `tools/jispec/verify/legacy-validator-adapter.ts`
- `tools/jispec/verify/verify-runner.ts`

至少要保证下面这些导出已经存在：

```ts
export interface VerifyIssue
export interface VerifyRunOptions
export interface VerifyRunResult
export async function runVerify(options: VerifyRunOptions): Promise<VerifyRunResult>
```

原因很简单：

- `Task Pack 5` 的 raw facts 输入源是 `VerifyRunResult`
- 如果没有这个稳定壳，facts 和 policy 会直接耦合回 `validator.ts`

**2. 新建 `tools/jispec/facts/raw-facts.ts`**

建议第一批直接写下面这些函数，不要再额外拆更多 helper：

```ts
export interface RawFactsSnapshot
export interface RawFactRecord
export function buildRawFactsSnapshot(result: VerifyRunResult, options: VerifyRunOptions): RawFactsSnapshot
function collectVerifyIssueFacts(result: VerifyRunResult): RawFactRecord[]
function collectContractPresenceFacts(root: string): RawFactRecord[]
function collectGitFacts(root: string): RawFactRecord[]
```

函数职责建议：

- `buildRawFactsSnapshot(...)`
  只负责 orchestration，把几组 collector 拼起来
- `collectVerifyIssueFacts(...)`
  从 `result.issues` 提取：
  - `verify.issue_count`
  - `verify.blocking_issue_count`
  - `verify.issue_codes`
- `collectContractPresenceFacts(...)`
  只检查这三类 canonical 资产是否存在：
  - `.spec/contracts/domain.yaml`
  - `.spec/contracts/api_spec.json`
  - `.spec/contracts/*.feature` 或等效目录
- `collectGitFacts(...)`
  第一版只允许输出 `git.changed_paths`
  取不到时返回空数组，不阻断

**3. 新建 `tools/jispec/facts/canonical-facts.ts`**

建议第一批函数如下：

```ts
export function buildCanonicalFacts(raw: RawFactsSnapshot): CanonicalFactsSnapshot
export function getCanonicalFactDefinitions(): CanonicalFactDefinition[]
export function stableSortCanonicalFacts(snapshot: CanonicalFactsSnapshot): CanonicalFactsSnapshot
function projectStableFacts(raw: RawFactsSnapshot): Record<string, unknown>
function projectBetaFacts(raw: RawFactsSnapshot): Record<string, unknown>
```

函数职责建议：

- `projectStableFacts(...)`
  只产出第一版真正可用的 stable facts：
  - `verify.issue_count`
  - `verify.blocking_issue_count`
  - `verify.issue_codes`
  - `contracts.domain.present`
  - `contracts.api.present`
  - `contracts.behavior.present`
- `projectBetaFacts(...)`
  先把 beta facts 预留出来：
  - `api.new_endpoints`
  - `openapi.breaking_changes`
  - `bdd.missing_scenarios`
  - `git.changed_paths`
- `stableSortCanonicalFacts(...)`
  必须保证 JSON 序列化顺序稳定，否则 contract hash 会漂

**4. 新建 `tools/jispec/facts/facts-contract.ts`**

建议第一批函数如下：

```ts
export function createFactsContract(): FactsContract
export function computeFactsContractHash(contract: FactsContract): string
export function checkFactsContractCompatibility(requiredVersion: string, actualVersion: string): FactsContractCompatibility
export function getStableFactKeys(contract: FactsContract): string[]
```

实现顺序建议：

1. 先用 `getCanonicalFactDefinitions()` 生成 `FactsContract`
2. 再用 `computeContentHash(...)` 算 `contractHash`
3. 第一版兼容性只做：
   - 完全一致通过
   - 不一致返回 `compatible: false`

这里不要急着做复杂 semver 解析。

**5. 新建 `tools/jispec/policy/policy-schema.ts`**

建议第一批函数如下：

```ts
export function validateVerifyPolicy(policy: unknown): VerifyPolicy
export function createDefaultVerifyPolicy(): VerifyPolicy
function validatePolicyCondition(condition: unknown, path: string): void
```

第一批必须覆盖：

- `version`
- `requires.facts_contract`
- `rules[*].id`
- `rules[*].action`
- `rules[*].message`
- `rules[*].when`
- `all / any / not / fact-op-value`

这里建议手写轻量校验，不要为了这一步先引入新 schema runtime。

**6. 新建 `tools/jispec/policy/policy-loader.ts`**

建议第一批函数如下：

```ts
export function resolvePolicyPath(root: string, filePath?: string): string
export function loadVerifyPolicy(root: string, filePath?: string): VerifyPolicy | null
function readPolicyDocument(policyPath: string): unknown
```

实现要点：

- 默认路径固定 `.spec/policy.yaml`
- 文件不存在时返回 `null`
- 语法错或结构错时抛清晰异常
- `verify-runner` 负责把异常转成 `ERROR_NONBLOCKING` 或 advisory warning

**7. 新建 `tools/jispec/policy/policy-engine.ts`**

建议第一批函数如下：

```ts
export function evaluateVerifyPolicy(policy: VerifyPolicy, facts: CanonicalFactsSnapshot): PolicyEvaluationResult
export function evaluatePolicyCondition(condition: PolicyCondition, facts: CanonicalFactsSnapshot): boolean
export function resolveFactValue(facts: CanonicalFactsSnapshot, factKey: string): unknown
export function policyRuleResultToVerifyIssue(result: PolicyRuleResult): VerifyIssue | null
function compareFactValue(left: unknown, op: string, right: unknown): boolean
```

注意这几个边界：

- `resolveFactValue(...)` 只从 `facts.facts` 里取值
- 引用未知 fact 时：
  - 不炸掉整个 verify
  - 记录 `warnings`
  - 该规则视为未命中
- `policyRuleResultToVerifyIssue(...)` 里统一映射 severity：
  - `fail_blocking` -> `blocking`
  - `warn` -> `advisory`
  - `pass` -> `null`

**8. 修改 `tools/jispec/verify/verify-runner.ts`**

如果这个文件已按 `Task Pack 3/4` 建好，`Task Pack 5` 只补下面这些函数：

```ts
async function buildRawFactsSnapshot(result: VerifyRunResult, options: VerifyRunOptions): Promise<RawFactsSnapshot>
async function buildCanonicalFactsSnapshot(raw: RawFactsSnapshot): Promise<CanonicalFactsSnapshot>
async function applyPolicyHook(result: VerifyRunResult, facts: CanonicalFactsSnapshot, options: VerifyRunOptions): Promise<VerifyRunResult>
async function writeFactsArtifactsIfRequested(raw: RawFactsSnapshot, canonical: CanonicalFactsSnapshot, options: VerifyRunOptions): Promise<void>
```

而 `runVerify(...)` 的主流程必须扩成：

```text
legacy validation
-> verify issues aggregation
-> waivers
-> baseline
-> observe
-> raw facts
-> canonical facts
-> policy evaluation
-> merge policy issues
-> optional facts write
-> final verdict recompute
```

这里要特别注意：

- `policy` 生成的新 issue 也必须回到统一的 `VerifyIssue[]`
- merge 后一定要重新计算 verdict 和计数
- `factsOutPath` 只控制落盘，不影响判定

**9. 修改 `tools/jispec/cli.ts`**

当前 `verify` action 是直接：

```ts
const result = validateRepository(path.resolve(options.root));
```

第一批要改成：

```ts
const result = await runVerify({
  root: path.resolve(options.root),
  policyPath: options.policy,
  factsOutPath: options.factsOut,
  ...
});
```

建议在 verify 命令上新增：

- `--policy <path>`
- `--facts-out <path>`

第一批不要顺手把 `cli.ts` 整体拆成 `commands/verify-command.ts`，否则会把任务包从“接 facts/policy”扩大成“CLI 重构”。

**10. 修改 `tools/jispec/doctor.ts`**

建议只补一个检查函数即可：

```ts
private async checkFactsAndPolicySurface(): Promise<DoctorCheckResult>
```

检查内容：

- `tools/jispec/facts/raw-facts.ts`
- `tools/jispec/facts/canonical-facts.ts`
- `tools/jispec/facts/facts-contract.ts`
- `tools/jispec/policy/policy-schema.ts`
- `tools/jispec/policy/policy-engine.ts`
- `.spec/policy.yaml` 若存在则可被解析

然后把它挂进 `checkPhase5()` 的 `checks.push(...)` 队列即可。

**11. 修改测试入口**

建议第一批只补这 5 个测试文件：

- `tools/jispec/tests/facts-contract-roundtrip.ts`
- `tools/jispec/tests/policy-engine-basic.ts`
- `tools/jispec/tests/policy-engine-nested-conditions.ts`
- `tools/jispec/tests/verify-policy-integration.ts`
- `tools/jispec/tests/policy-unknown-fact.ts`

并在 [tools/jispec/tests/regression-runner.ts](/D:/codeSpace/JiSpec/tools/jispec/tests/regression-runner.ts) 里只先挂 3 个稳定套件：

- `Facts Contract Roundtrip`
- `Policy Engine Basic`
- `Verify Policy Integration`

##### T. 推荐的最小提交切片

如果希望边写边可回归，建议按下面四个提交切片推进：

**Commit 1：facts contract 打底**

- 新增 `raw-facts.ts`
- 新增 `canonical-facts.ts`
- 新增 `facts-contract.ts`
- 跑通 `facts-contract-roundtrip.ts`

**Commit 2：policy 单体可运行**

- 新增 `policy-schema.ts`
- 新增 `policy-loader.ts`
- 新增 `policy-engine.ts`
- 跑通 `policy-engine-basic.ts` 与 `policy-engine-nested-conditions.ts`

**Commit 3：接回 verify 主链**

- 修改 `verify-runner.ts`
- 修改 `cli.ts`
- 跑通 `verify-policy-integration.ts`

**Commit 4：补诊断与回归面**

- 修改 `doctor.ts`
- 修改 `regression-runner.ts`
- 增加 `policy-unknown-fact.ts`

这样做的好处是：

- 每一提交都有独立可验的输出
- facts、policy、runner 三层边界不会在一个提交里搅在一起
- 一旦 `verify-policy-integration.ts` 失败，定位范围很清楚

---

### Task Pack 6：CI Native Gate 与 PR 反馈注入

#### 目标

把 `verify` 真正接入团队主流程，并让 PR 成为 `JiSpec-Console` 的增长入口。

#### 用户动作

- GitHub Action
- GitLab CI job
- Jenkins shell step

#### 代码改造点

新增模块：

- `tools/jispec/ci/verify-report.ts`
- `tools/jispec/ci/ci-summary.ts`
- `tools/jispec/ci/pr-comment.ts`
- `tools/jispec/ci/github-action.ts`
- `tools/jispec/ci/gitlab-note.ts`

修改模块：

- `scripts/check-jispec.ts`
- `package.json`
- `README.md`
- `tools/jispec/tests/regression-runner.ts`

视 Task Pack 3/5 落地情况决定是否同步修改：

- `tools/jispec/verify/verify-runner.ts`
- `tools/jispec/cli.ts`

#### 具体怎么做

1. 先定义 verify JSON output contract
2. 用这个 contract 生成：
   - CI 日志摘要
   - PR/MR 评论卡片
3. 评论卡片必须包含：
   - rule title
   - impact summary
   - next action
   - Deep Link placeholder
4. 先做本地 renderer，再接平台 API

#### 测试要求

- PR 卡片渲染为稳定 Markdown
- verify 输出变化后，CI renderer 测试能及时失败

#### 验收标准

- 团队不看终端也能在 PR 里理解为什么被拦
- 队友会第一次被引导到 `JiSpec-Console`

下面这部分继续按“文件级别 + 函数级别”拆解 `Task Pack 6`，目标是让 `ci:verify` 从“单纯跑校验并返回 exit code”升级成“能产出结构化报告、平台摘要和 PR/MR 评论草稿的 CI-native gate”。

这里有一个关键边界必须先写死：

> `Task Pack 6` 的第一版目标不是自己做一套拦截网关，也不是直接依赖 GitHub/GitLab API 发评论，而是先把 `verify` 结果稳定投影成 JSON + Markdown，再借助现有 CI 平台完成最后一公里的物理阻断。

也就是说，第一版仍然坚持：

- **阻断动作 = `verify` exit code**
- **反馈增强 = 结构化报告 + 平台摘要 + 评论草稿**
- **先本地渲染，再平台注入**

##### A. 基于当前仓库现状的切入点

当前仓库里和 `Task Pack 6` 最相关的现实入口有两个：

- [scripts/check-jispec.ts](/D:/codeSpace/JiSpec/scripts/check-jispec.ts)
- [tools/jispec/cli.ts](/D:/codeSpace/JiSpec/tools/jispec/cli.ts)

其中最关键的是：

- `scripts/check-jispec.ts` 现在仍然直接调用 `validateRepository(...)`
- `ci:verify` 目前只是这个脚本的 npm 包装
- 仓库里当前还没有 `tools/jispec/ci/` 目录

因此第一批开工的正确切法不是“先加一堆新 CLI 子命令”，而是：

1. 先把 `scripts/check-jispec.ts` 升级成真正的 CI wrapper
2. 再把 `tools/jispec/ci/*.ts` 这一组 renderer 补出来
3. 最后让 GitHub/GitLab/Jenkins 读取这些稳定产物

这会比一开始就拆 `cli.ts` 更稳，因为：

- `ci:verify` 已经是现成的 CI 入口
- 团队接入成本最低
- 平台反馈的演化不会反复打扰人类本地使用 `jispec-cli verify`

##### B. 第一版必须守住的边界

`Task Pack 6` 第一版必须明确“不做什么”：

- 不自建 SaaS 拦截网关
- 不要求 GitLab Ultimate 的 external status checks
- 不把 GitHub/GitLab API 调用做成 blocking 依赖
- 不要求 JiSpec-Console 在线可用才能继续放行

第一版只做：

- 结构化 `verify` report
- 本地/CI 可重放的 Markdown renderer
- GitHub Step Summary 输出
- GitLab note artifact 输出
- PR/MR comment 草稿文件输出

##### C. 先定义 Verify Report Contract

**新增文件**

- `tools/jispec/ci/verify-report.ts`

**要做什么**

把 `VerifyRunResult` 投影成平台无关的 `VerifyReport`，后面的：

- CI 日志摘要
- GitHub Step Summary
- PR 评论 Markdown
- GitLab Note Markdown

全部只消费这一层，不直接依赖 `VerifyRunResult` 内部结构。

**建议导出类型**

```ts
export interface VerifyReport
export interface VerifyReportCounts
export interface VerifyReportIssue
export interface VerifyReportLinks
export interface VerifyReportContext
```

**建议字段**

```ts
interface VerifyReportCounts {
  total: number;
  blocking: number;
  advisory: number;
  nonblockingError: number;
}

interface VerifyReportIssue {
  code: string;
  severity: "blocking" | "advisory" | "nonblocking_error";
  path?: string;
  message: string;
  ruleId?: string;
  fingerprint?: string;
}

interface VerifyReportLinks {
  consoleUrl?: string;
  waiverUrl?: string;
}

interface VerifyReportContext {
  repoRoot: string;
  repoSlug?: string;
  provider: "local" | "github" | "gitlab" | "jenkins";
  pullRequestNumber?: string;
  mergeRequestIid?: string;
  branch?: string;
  commitSha?: string;
}

interface VerifyReport {
  version: 1;
  generatedAt: string;
  verdict: string;
  ok: boolean;
  counts: VerifyReportCounts;
  issues: VerifyReportIssue[];
  factsContractVersion?: string;
  matchedPolicyRules?: string[];
  modes?: Record<string, unknown>;
  context: VerifyReportContext;
  links?: VerifyReportLinks;
}
```

**建议导出函数**

```ts
export function buildVerifyReport(result: VerifyRunResult, context: VerifyReportContext): VerifyReport
export function renderVerifyReportJSON(report: VerifyReport): string
export function selectHighlightedIssues(report: VerifyReport, limit?: number): VerifyReportIssue[]
export function inferNextAction(report: VerifyReport): string
```

**第一版要求**

- `version` 固定，便于后续 renderer 回归
- `issues` 顺序稳定
- `selectHighlightedIssues(...)` 默认只选前 3~5 个最关键问题

##### D. 新建 CI Summary Renderer

**新增文件**

- `tools/jispec/ci/ci-summary.ts`

**要做什么**

生成：

- 终端日志摘要
- GitHub Step Summary Markdown
- Jenkins 控制台可读摘要

**建议导出函数**

```ts
export function renderCiSummaryText(report: VerifyReport): string
export function renderCiSummaryMarkdown(report: VerifyReport): string
function renderCountsLine(report: VerifyReport): string
function renderHighlightedIssues(report: VerifyReport): string[]
```

**第一版输出要求**

- 顶部必须先给 verdict
- 紧接 issue 计数
- 再列 3~5 个重点问题
- 最后给 next action

**注意**

- CI summary 面向“当前 job 的读者”
- 不要把完整 issue 列表全倒进去
- 全量细节仍保留在 `verify-report.json`

##### E. 新建 PR / MR Comment Renderer

**新增文件**

- `tools/jispec/ci/pr-comment.ts`

**要做什么**

把 `VerifyReport` 渲染成稳定的 Markdown 卡片，供：

- GitHub PR comment
- GitLab MR note
- 本地 artifact 预览

**建议导出函数**

```ts
export interface PrCommentRenderOptions
export function renderPrCommentMarkdown(report: VerifyReport, options?: PrCommentRenderOptions): string
export function buildDeepLinkPlaceholder(report: VerifyReport, options?: PrCommentRenderOptions): string | null
function renderIssueTable(report: VerifyReport): string
function renderNextActionBlock(report: VerifyReport): string
```

**建议字段**

```ts
interface PrCommentRenderOptions {
  includeIssueTable?: boolean;
  includeConsoleLink?: boolean;
  maxIssues?: number;
}
```

**第一版评论卡片必须包含**

- verdict 标题
- blocking/advisory 计数
- top issues
- next action
- waiver / console deep link placeholder

**Deep Link 策略**

第一版允许只是占位链接，例如：

```text
https://console.example.com/waivers/new?repo=<repo>&pr=<number>
```

如果环境变量不全：

- 不抛错
- 不阻断 CI
- 只省略链接区块

##### F. 新建 GitHub Actions 适配层

**新增文件**

- `tools/jispec/ci/github-action.ts`

**要做什么**

利用 GitHub Actions 的现成能力：

- `GITHUB_STEP_SUMMARY`
- workflow logs
- 可选 annotation

实现“无需网络 API 也能让 PR 周边读者看见 JiSpec 结果”的最小闭环。

**建议导出函数**

```ts
export function isGitHubActionsEnv(env?: NodeJS.ProcessEnv): boolean
export function buildGitHubContext(env?: NodeJS.ProcessEnv): VerifyReportContext
export function writeGitHubStepSummary(report: VerifyReport, env?: NodeJS.ProcessEnv): string | null
export function emitGitHubAnnotations(report: VerifyReport): void
export function resolveGitHubCommentArtifactPath(root: string): string
```

**第一版具体行为**

- 如果存在 `GITHUB_STEP_SUMMARY`
  - 写入 `renderCiSummaryMarkdown(report)`
- 对 top blocking issues 打 `::error`
- 对 advisory issues 打 `::warning`
- 如需评论草稿，写到 `.jispec-ci/github-pr-comment.md`

**第一版不要做**

- 不直接调用 GitHub REST API
- 不内嵌 `actions/github-script`
- 不让评论发送失败影响 gate verdict

##### G. 新建 GitLab CI 适配层

**新增文件**

- `tools/jispec/ci/gitlab-note.ts`

**要做什么**

面向 GitLab CI 生成可复用的 note artifact。

**建议导出函数**

```ts
export function isGitLabCiEnv(env?: NodeJS.ProcessEnv): boolean
export function buildGitLabContext(env?: NodeJS.ProcessEnv): VerifyReportContext
export function renderGitLabNoteMarkdown(report: VerifyReport): string
export function resolveGitLabNoteArtifactPath(root: string): string
export function writeGitLabNoteArtifact(report: VerifyReport, root: string): string
```

**第一版具体行为**

- 默认写出 `.jispec-ci/gitlab-mr-note.md`
- 供后续 GitLab job / curl / bot 脚本复用
- 若运行在普通 shell/Jenkins，也不报错，只是不触发 GitLab 特定输出

##### H. 把 `scripts/check-jispec.ts` 升级成真正的 CI Wrapper

**修改文件**

- [scripts/check-jispec.ts](/D:/codeSpace/JiSpec/scripts/check-jispec.ts)

**当前状态**

现在它只是：

- 调 `validateRepository(...)`
- `console.log(result.renderText())`
- 返回 `0/1`

这不足以支撑 CI-native gate。

**第一版应该改成**

1. 调 `runVerify(...)` 而不是 `validateRepository(...)`
2. 组装 `VerifyReportContext`
3. 生成 `VerifyReport`
4. 落盘 JSON artifact
5. 落盘 PR/MR comment artifact
6. 在 GitHub 环境下写 Step Summary
7. 最后仍然以 `result.ok` / `verdict` 决定 exit code

**建议新增函数**

```ts
function detectCiProvider(env?: NodeJS.ProcessEnv): "local" | "github" | "gitlab" | "jenkins"
function buildCiOutputDir(root: string): string
function writeVerifyArtifacts(root: string, report: VerifyReport): {
  reportPath: string;
  summaryPath?: string;
  commentPath?: string;
}
async function maybeEmitPlatformOutputs(root: string, report: VerifyReport): Promise<void>
```

**推荐默认产物路径**

```text
.jispec-ci/verify-report.json
.jispec-ci/ci-summary.md
.jispec-ci/github-pr-comment.md
.jispec-ci/gitlab-mr-note.md
```

##### I. `verify-runner.ts` 在 Task Pack 6 的正确边界

**可能修改文件**

- `tools/jispec/verify/verify-runner.ts`

**这里要特别克制**

`Task Pack 6` 不应该把 renderer 逻辑塞回 `verify-runner.ts`。

`verify-runner.ts` 在这一包里最多只做两件事：

1. 保证 `VerifyRunResult` 的 JSON 可稳定序列化
2. 暴露 facts contract version / matched policy rules / modes 这些给 `VerifyReport` 组装层使用

**建议补的导出**

```ts
export function toVerifySerializable(result: VerifyRunResult): Record<string, unknown>
export function summarizeVerifyCounts(result: VerifyRunResult): {
  total: number;
  blocking: number;
  advisory: number;
  nonblockingError: number;
}
```

不要在这里直接写：

- GitHub env 检测
- Markdown renderer
- 评论卡片模板

##### J. `cli.ts` 在 Task Pack 6 的正确边界

**可能修改文件**

- [tools/jispec/cli.ts](/D:/codeSpace/JiSpec/tools/jispec/cli.ts)

第一版建议非常克制：

- 保留 `jispec-cli verify --json`
- 不急着新增 `ci comment` / `ci summary` 一整组命令

如果要改，也只建议改两点：

1. `verify --json` 明确输出的是稳定机器契约
2. help text 补一句：
   - `npm run ci:verify`

这样可以避免 `Task Pack 6` 膨胀成一次 CLI 大重构。

##### K. `package.json` 与 README 的最小收口

**修改文件**

- [package.json](/D:/codeSpace/JiSpec/package.json)
- [README.md](/D:/codeSpace/JiSpec/README.md)

**`package.json` 第一版建议**

- 保留现有 `ci:verify`
- 脚本实现变更后，无需立刻增加很多新 script

如果确实需要增加，最多只加一个辅助脚本，例如：

```json
"ci:verify:artifacts": "node --import tsx ./scripts/check-jispec.ts"
```

但第一版其实可以不加。

**README 第一版建议补充**

- `ci:verify` 会生成哪些 artifact
- GitHub Actions 下会自动写 Step Summary
- GitLab / Jenkins 下如何消费 `.jispec-ci/*.md`

##### L. 第一版测试文件清单

**新增测试文件**

- `tools/jispec/tests/verify-report-contract.ts`
- `tools/jispec/tests/ci-summary-markdown.ts`
- `tools/jispec/tests/pr-comment-markdown.ts`
- `tools/jispec/tests/github-action-summary.ts`
- `tools/jispec/tests/gitlab-note-rendering.ts`
- `tools/jispec/tests/check-jispec-ci-wrapper.ts`

**测试重点**

`verify-report-contract.ts`

- `VerifyReport` JSON 字段稳定
- `counts` 和 `issues` 映射正确
- facts contract version / modes 不丢

`ci-summary-markdown.ts`

- Markdown 结构稳定
- top issues 数量受控
- next action 始终存在

`pr-comment-markdown.ts`

- verdict 标题稳定
- issue table 或 issue list 可读
- deep link 缺失时不会渲染坏掉

`github-action-summary.ts`

- `GITHUB_STEP_SUMMARY` 存在时会写文件
- annotations 数量和 top issues 对齐
- 评论草稿路径稳定

`gitlab-note-rendering.ts`

- GitLab note markdown 稳定
- artifact 路径稳定

`check-jispec-ci-wrapper.ts`

- `scripts/check-jispec.ts` 能产出 JSON + Markdown artifact
- gate exit code 仍然与 verify verdict 一致

##### M. 建议把部分测试接入回归矩阵

**修改文件**

- [tools/jispec/tests/regression-runner.ts](/D:/codeSpace/JiSpec/tools/jispec/tests/regression-runner.ts)

**建议新增 suites**

- `Verify Report Contract`
- `CI Summary Markdown`
- `PR Comment Markdown`
- `CI Wrapper`

`github-action-summary` 和 `gitlab-note-rendering` 可以先单跑，避免第一版把环境相关测试过度塞进总矩阵。

##### N. 第一批实施顺序

建议严格按下面顺序推进：

1. 先写 `verify-report.ts`
2. 再写 `ci-summary.ts`
3. 再写 `pr-comment.ts`
4. 再写 `github-action.ts`
5. 再写 `gitlab-note.ts`
6. 再改 `scripts/check-jispec.ts`
7. 再补 `README.md`
8. 最后补 6 份测试和回归矩阵

**原因**

- 先把平台无关的 report contract 稳住
- renderer 稳后再接 wrapper，调试成本最低
- wrapper 最后改，可以避免边改边被 CI 脚本拖着跑

##### O. 推荐的最小提交切片

如果希望边写边回归，建议按下面四个提交切片推进：

**Commit 1：稳定 report contract**

- 新增 `verify-report.ts`
- 新增 `ci-summary.ts`
- 跑通 `verify-report-contract.ts`
- 跑通 `ci-summary-markdown.ts`

**Commit 2：补评论与平台 renderer**

- 新增 `pr-comment.ts`
- 新增 `github-action.ts`
- 新增 `gitlab-note.ts`
- 跑通 `pr-comment-markdown.ts`

**Commit 3：升级 CI wrapper**

- 修改 `scripts/check-jispec.ts`
- 必要时补 `verify-runner.ts` 的可序列化导出
- 跑通 `check-jispec-ci-wrapper.ts`

**Commit 4：补文档与矩阵**

- 修改 `README.md`
- 修改 `regression-runner.ts`
- 挂上稳定 suites

##### P. 第一批完成后的可演示结果

`Task Pack 6` 完成后，至少要能现场演示：

```bash
npm run ci:verify
```

以及在模拟 GitHub 环境下：

```powershell
$env:GITHUB_STEP_SUMMARY='D:\codeSpace\JiSpec\.jispec-ci\gh-summary.md'
npm run ci:verify
```

文件结果至少包括：

```text
.jispec-ci/verify-report.json
.jispec-ci/ci-summary.md
.jispec-ci/github-pr-comment.md
```

终端或 summary 输出至少包含：

- 当前 verdict
- blocking / advisory / nonblocking_error 计数
- top issues
- next action
- JiSpec-Console deep link placeholder（如果环境足够）

##### Q. 第一版完成的真实标准

如果还做不到下面这几件事，`Task Pack 6` 就还没有真正完成：

- `ci:verify` 不再只是打印旧 `validator` 文本，而是产出稳定 JSON report
- GitHub / GitLab / Jenkins 的读者即使不看终端，也能看懂为什么被拦
- 评论/摘要 renderer 不依赖在线 API，离线也能回归
- physical gate 仍然由 exit code 控制，而不是被评论发送这种外围动作绑架

---

### Task Pack 7：Change 命令与 Fast Lane

#### 目标

把“规范增量”变成显式入口，同时让高频小改动有低摩擦短路路径。

#### 用户动作

```bash
npm run jispec-cli -- change "新增订单退款"
npm run jispec-cli -- implement --fast
npm run jispec-cli -- verify --fast
```

#### 代码改造点

新增模块：

- `tools/jispec/commands/change-command.ts`
- `tools/jispec/runtime/session-store.ts`
- `tools/jispec/facts/git-diff-classifier.ts`

复用模块：

- `pipeline-executor.ts`
- `stage-runner.ts`
- `next-report.ts`

#### 具体怎么做

1. `change` 先只做变更记录和 lane 判定
2. `--fast` 先基于 changed paths 和 known facts 判定
3. 若命中 API/domain 关键路径，自动升级为 Strict Lane
4. 若只触及 UI copy / docs / isolated tests，则允许快速回归

#### 测试要求

- 常见文案改动应命中 Fast Lane
- API 变更不能误判成 Fast Lane

#### 验收标准

- 工具不会要求每个小改动都走重流程
- 团队开始感觉到“它不只是拦我，也在尊重我的节奏”

下面这部分继续按“文件级别 + 函数级别”拆解 `Task Pack 7`，目标是把 `change` 从一句产品口号落成一个真实的本地工作流入口，并把 `--fast` 变成**开发者本地短路路径**，而不是冲掉 CI 严格门禁的后门。

这里有一个关键边界必须先写死：

> `Task Pack 7` 的第一版目标不是做“自动实现”，也不是让 `--fast` 取代 `ci:verify`，而是先把“变更意图 -> lane 判定 -> 下一个动作”变成稳定的本地状态机入口。

也就是说，第一版必须坚持：

- **`change` 负责记录与判定，不负责自动写代码**
- **`verify --fast` 只服务本地开发节奏，不替代 CI required check**
- **CI 仍然跑完整 `ci:verify`**
- **宁可把边界模糊的改动升级为 Strict Lane，也不要误判成 Fast Lane**

##### A. 基于当前仓库现状的切入点

当前仓库里和 `Task Pack 7` 最相关的现实基础其实已经不少：

- [tools/jispec/impact-analysis.ts](/D:/codeSpace/JiSpec/tools/jispec/impact-analysis.ts)
- [tools/jispec/next-report.ts](/D:/codeSpace/JiSpec/tools/jispec/next-report.ts)
- [tools/jispec/pipeline-executor.ts](/D:/codeSpace/JiSpec/tools/jispec/pipeline-executor.ts)
- [tools/jispec/stage-runner.ts](/D:/codeSpace/JiSpec/tools/jispec/stage-runner.ts)
- [tools/jispec/cli.ts](/D:/codeSpace/JiSpec/tools/jispec/cli.ts) 里现有的 `dependency impact` / `dependency invalidate`

但同样也要看到当前缺口：

- 仓库里现在还没有 `tools/jispec/commands/` 目录
- 还没有 `runtime/session-store.ts`
- 还没有 `facts/git-diff-classifier.ts`
- 还没有真正的 `change` 命令
- 还没有 lane 判定状态持久化

所以这一包的正确开法不是重写调度器，而是：

1. 先用 `git diff + known facts` 把 lane 判定做出来
2. 再把判定结果持久化成 change session
3. 再把现有的 `impact-analysis` / `next-report` 接进来生成 follow-up
4. 最后给 `verify --fast` 接一个保守的本地短路面

##### B. 第一版必须守住的边界

`Task Pack 7` 第一版必须明确“不做什么”：

- 不做 AI 自动实现
- 不在这一包里强依赖 `implement`
- 不让 `verify --fast` 直接替代 `ci:verify`
- 不为了 lane 判定去引入复杂 AST 语义推理
- 不要求所有仓库立刻拥有完整 canonical facts 才能跑 `change`

第一版只做：

- 变更意图记录
- git diff 分类
- Fast / Strict lane 判定
- 当前 change session 落盘
- 基于 legacy impact/next 能力的 follow-up 建议
- 本地 `verify --fast` 的保守短路

##### C. 新建 Change Session Store

**新增文件**

- `tools/jispec/runtime/session-store.ts`

**要做什么**

为 `change` 和后续 `implement` 提供一个统一的“当前工作会话”持久化层。

这个 session 不是聊天历史，而是一个结构化状态包，至少包含：

- 这次改动的意图摘要
- 当前检测到的 changed paths
- 当前 lane 判定
- 为什么被判成 Fast 或 Strict
- 推荐的下一步命令

**建议导出类型**

```ts
export type ChangeLane = "fast" | "strict";
export type RequestedLane = "auto" | "fast" | "strict";
export type ChangeSessionStatus = "draft" | "ready" | "archived";
export interface LaneDecision
export interface ChangeSession
export interface ChangeSessionCommandHint
```

**建议字段**

```ts
interface LaneDecision {
  requestedLane: RequestedLane;
  effectiveLane: ChangeLane;
  autoPromoted: boolean;
  strictReasons: string[];
  fastReasons: string[];
  unknownPaths: string[];
}

interface ChangeSessionCommandHint {
  label: string;
  command: string;
}

interface ChangeSession {
  version: 1;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  repoRoot: string;
  summary: string;
  status: ChangeSessionStatus;
  requestedLane: RequestedLane;
  laneDecision: LaneDecision;
  targetSliceId?: string;
  targetContextId?: string;
  changedPaths: string[];
  changedArtifacts: string[];
  impactedSlices?: string[];
  commandHints: ChangeSessionCommandHint[];
}
```

**建议导出函数**

```ts
export function resolveActiveChangeSessionPath(root: string): string
export function resolveChangeSessionHistoryDir(root: string): string
export function loadActiveChangeSession(root: string): ChangeSession | null
export function writeActiveChangeSession(root: string, session: ChangeSession): string
export function archiveActiveChangeSession(root: string): string | null
export function clearActiveChangeSession(root: string): void
export function createChangeSession(input: Omit<ChangeSession, "version" | "sessionId" | "createdAt" | "updatedAt" | "status">): ChangeSession
```

**建议默认落盘路径**

```text
.spec/sessions/active-change.json
.spec/sessions/history/change-<timestamp>.json
```

**第一版要求**

- session 写入必须稳定、可覆盖、可回读
- 第一版不需要复杂事务
- 但写出的 JSON 字段顺序和 schema 要稳定，方便后续 Task Pack 8 直接接

##### D. 新建 Git Diff Classifier

**新增文件**

- `tools/jispec/facts/git-diff-classifier.ts`

**要做什么**

把：

- 当前 Git changed paths
- 已知 canonical facts（如果已经有）
- 少量保守的路径规则

组合成一个 deterministic 的 lane 判定器。

这一步是 `Task Pack 7` 的核心。

**建议导出类型**

```ts
export type ChangedPathKind =
  | "contract"
  | "domain_core"
  | "api_surface"
  | "behavior_surface"
  | "test_only"
  | "docs_only"
  | "build_config"
  | "unknown";

export interface ChangedPathClassification
export interface DiffClassificationResult
```

**建议字段**

```ts
interface ChangedPathClassification {
  path: string;
  kind: ChangedPathKind;
  reason: string;
}

interface DiffClassificationResult {
  changedPaths: string[];
  classifiedPaths: ChangedPathClassification[];
  changedArtifacts: string[];
  strictReasons: string[];
  fastReasons: string[];
  unknownPaths: string[];
}
```

**建议导出函数**

```ts
export function collectChangedPathsFromGit(root: string, baseRef?: string): string[]
export function classifyChangedPaths(changedPaths: string[], knownFacts?: Record<string, unknown>): DiffClassificationResult
export function decideLane(result: DiffClassificationResult, requestedLane?: RequestedLane): LaneDecision
export function inferChangedArtifacts(result: DiffClassificationResult): string[]
function classifySinglePath(filePath: string, knownFacts?: Record<string, unknown>): ChangedPathClassification
```

**第一版路径判定建议**

直接进入 Strict Lane 的典型路径：

- `.spec/contracts/domain.yaml`
- `.spec/contracts/api_spec.json`
- `.spec/contracts/**/*.feature`
- `contexts/**/slice.yaml`
- `contexts/**/requirements.md`
- `contexts/**/design.md`
- `contexts/**/behaviors.feature`
- `contexts/**/trace.yaml`
- `contexts/**/test-spec.yaml`
- 任何明显是 API / schema / migration / model / entity / repository / service core 的路径

可以进入 Fast Lane 的保守集合：

- `README.md`
- `docs/**`
- `**/*.md`
- `**/*.txt`
- 纯测试文件：
  - `**/*.test.*`
  - `**/*.spec.*`
  - `**/__tests__/**`

**第一版要非常克制**

像下面这些情况，宁可先判成 Strict 或 Unknown，也不要硬判 Fast：

- `.tsx` / `.vue` / `.jsx` 里的 UI copy 改动
- 同时改了测试和源码
- 改动命中 build config / package manager / CI config

原因很简单：

- Fast Lane 最怕假阳性
- 第一版的目标是“可信地放过少量安全改动”，不是“尽可能多地放过”

##### E. 复用 `impact-analysis.ts` 的正确边界

**修改文件**

- [tools/jispec/impact-analysis.ts](/D:/codeSpace/JiSpec/tools/jispec/impact-analysis.ts)

**要做什么**

不要让 `change-command.ts` 自己去发明第二套 impact 语义。

建议只补一层薄适配，把 `git-diff-classifier` 的结果翻译成现有的 `ChangeEvent` / `ArtifactType[]`。

**建议新增函数**

```ts
export function inferArtifactTypesFromChangedArtifacts(changedArtifacts: string[]): ArtifactType[]
export function buildChangeEventFromLaneDecision(input: {
  sliceId: string;
  changedArtifacts: string[];
  details?: string;
}): ChangeEvent
```

**第一版边界**

- 只有在 `change --slice <sliceId>` 时才强接 impact analyzer
- 没指定 slice 时，不强行做 downstream impact
- 不要为了 repo-level change 硬凑 slice 语义

##### F. 新建 Change Command 主模块

**新增文件**

- `tools/jispec/commands/change-command.ts`

**要做什么**

这是 `Task Pack 7` 的命令层主入口，负责：

1. 读取用户意图
2. 采集 changed paths
3. 计算 lane decision
4. 生成 change session
5. 选配 legacy impact / next 建议
6. 输出稳定文本/JSON

**建议导出类型**

```ts
export interface ChangeCommandOptions
export interface ChangeCommandResult
```

**建议字段**

```ts
interface ChangeCommandOptions {
  root: string;
  summary: string;
  requestedLane?: RequestedLane;
  sliceId?: string;
  contextId?: string;
  baseRef?: string;
  json?: boolean;
}

interface ChangeCommandResult {
  session: ChangeSession;
  nextCommands: ChangeSessionCommandHint[];
  impactSummary?: string[];
}
```

**建议导出函数**

```ts
export function runChangeCommand(options: ChangeCommandOptions): ChangeCommandResult
export function renderChangeCommandText(result: ChangeCommandResult): string
export function renderChangeCommandJSON(result: ChangeCommandResult): string
function buildNextCommandHints(root: string, session: ChangeSession): ChangeSessionCommandHint[]
function buildImpactSummary(root: string, session: ChangeSession): string[]
```

**第一版输出建议**

终端必须一眼告诉开发者：

- 当前被判成 `FAST` 还是 `STRICT`
- 为什么
- 下一步该敲什么命令

例如：

```text
Lane: STRICT
Why:
- changed path hits api surface: src/routes/refund.ts
- changed path hits contract asset: .spec/contracts/api_spec.json

Next:
- jispec-cli verify
- jispec-cli change "..." --slice ordering-checkout-v1
```

##### G. `next-report.ts` 在 Task Pack 7 的复用边界

**复用文件**

- [tools/jispec/next-report.ts](/D:/codeSpace/JiSpec/tools/jispec/next-report.ts)

**推荐复用函数**

```ts
buildSliceNextReport(root, sliceId)
buildContextNextReport(root, contextId)
```

**正确用法**

- 当 `change` 明确绑定到一个 legacy slice 时：
  - 用 `buildSliceNextReport(...)` 生成 follow-up hint
- 当只给了 `contextId` 时：
  - 用 `buildContextNextReport(...)` 生成 dispatch hint

**不要做**

- 不要把 `next-report.ts` 的旧术语直接外露给最终用户
- 只把它的结果投影成：
  - “推荐下一步命令”
  - “当前 legacy 运行时里最接近的可执行动作”

##### H. `pipeline-executor.ts` / `stage-runner.ts` 在 Task Pack 7 的正确边界

**复用文件**

- [tools/jispec/pipeline-executor.ts](/D:/codeSpace/JiSpec/tools/jispec/pipeline-executor.ts)
- [tools/jispec/stage-runner.ts](/D:/codeSpace/JiSpec/tools/jispec/stage-runner.ts)

**这里必须克制**

`Task Pack 7` 还不是执行期，不应该一上来让 `change` 直接驱动整个 pipeline。

第一版只建议做两件事：

1. 在 `ChangeCommandResult` 里预留 `recommended pipeline entry` 文案
2. 在后续 Task Pack 8 的 `implement` 到来前，不直接调 `PipelineExecutor.run(...)`

**原因**

- 一旦 `change` 直接执行 pipeline，就会把“意图确认层”和“执行层”搅在一起
- `Task Pack 7` 应该先把 lane 和 session 稳下来

##### I. `verify-runner.ts` 接入 Fast Lane 的正确边界

**可能修改文件**

- `tools/jispec/verify/verify-runner.ts`

`Task Pack 7` 第一版对 `verify-runner.ts` 的要求应该非常克制。

**建议扩展类型**

```ts
interface VerifyRunOptions {
  ...
  fast?: boolean;
}
```

**建议新增函数**

```ts
function resolveRequestedLane(root: string, options: VerifyRunOptions): LaneDecision | null
function annotateLaneDecision(result: VerifyRunResult, laneDecision: LaneDecision): VerifyRunResult
function maybeAutoPromoteFastToStrict(result: VerifyRunResult, laneDecision: LaneDecision): VerifyRunResult
```

**第一版真实语义建议**

- `verify --fast` 先做 lane precheck
- 如果判定仍然是 `fast`
  - 允许继续执行本地 verify
  - 但在结果里标记 `modes.lane = "fast"`
- 如果命中 strict trigger
  - 不允许继续假装 Fast Lane
  - 要么自动升级成 strict verify
  - 要么直接输出“已升级为 Strict Lane”的清晰说明

**关键原则**

第一版不要为了做 `--fast` 再造一个完全不同的 verify engine。

更现实的做法是：

- 先把 `--fast` 做成“本地 lane 入口 + 语义短路”
- 后续再逐步把更细粒度的增量校验补进来

##### J. `cli.ts` 的命令面改造

**修改文件**

- [tools/jispec/cli.ts](/D:/codeSpace/JiSpec/tools/jispec/cli.ts)

**要做什么**

1. 新增 `change` 命令
2. 给 `verify` 增加 `--fast`
3. help text 里把：
   - `bootstrap -> verify -> change -> implement`
   再向前推进成真实入口

**建议 `change` 命令选项**

```ts
.command("change")
.argument("<summary>", "Human summary of the intended change.")
.option("--root <path>", "Repository root.", ".")
.option("--lane <lane>", "Requested lane: auto|fast|strict.", "auto")
.option("--slice <sliceId>", "Optional legacy slice binding.")
.option("--context <contextId>", "Optional legacy context binding.")
.option("--base-ref <ref>", "Optional git base ref for diff classification.")
.option("--json", "Emit machine-readable JSON output.", false)
```

**建议 `verify` 命令增加**

```ts
.option("--fast", "Run local fast-lane precheck and auto-promote to strict when needed.", false)
```

**第一版不要做**

- 不要在这一包里同时引入 `implement` 主命令
- 不要一口气把 `cli.ts` 全拆成所有 commands
- 只把 `change` 作为第一个真正落地的新主线命令接进去

##### K. `package.json` 与 README 的最小收口

**修改文件**

- [package.json](/D:/codeSpace/JiSpec/package.json)
- [README.md](/D:/codeSpace/JiSpec/README.md)

**`package.json` 建议**

第一版不一定要加很多新 scripts。

如果需要，最多只加一个：

```json
"change": "node --import tsx ./tools/jispec/cli.ts change"
```

但其实完全可以先不加，继续统一走：

```bash
npm run jispec-cli -- change "..."
```

**README 第一版建议补充**

- `change` 是什么
- `verify --fast` 是本地短路入口，不替代 CI
- `ci:verify` 仍然是团队 required check

##### L. 第一版测试文件清单

**新增测试文件**

- `tools/jispec/tests/change-session-store-roundtrip.ts`
- `tools/jispec/tests/git-diff-classifier-fast-docs.ts`
- `tools/jispec/tests/git-diff-classifier-strict-api.ts`
- `tools/jispec/tests/change-command-auto-lane.ts`
- `tools/jispec/tests/change-command-impact-hints.ts`
- `tools/jispec/tests/verify-fast-auto-promote.ts`

**测试重点**

`change-session-store-roundtrip.ts`

- active session 能写入、回读、归档
- JSON 结构稳定

`git-diff-classifier-fast-docs.ts`

- 纯 docs / markdown 改动命中 Fast Lane
- strictReasons 为空

`git-diff-classifier-strict-api.ts`

- 命中 API / contract / schema 路径时必须进 Strict Lane
- 不允许被 `requestedLane=fast` 强行压过去

`change-command-auto-lane.ts`

- `change "..."` 能产出 session
- follow-up commands 不为空
- lane 说明清晰

`change-command-impact-hints.ts`

- 提供 `--slice` 时会带出 impact summary 或 next hints
- 不提供 slice 时也不会崩

`verify-fast-auto-promote.ts`

- `verify --fast` 命中 strict trigger 时不会继续伪装 Fast Lane
- 结果里能看到 auto-promote 提示

##### M. 建议把部分测试接入回归矩阵

**修改文件**

- [tools/jispec/tests/regression-runner.ts](/D:/codeSpace/JiSpec/tools/jispec/tests/regression-runner.ts)

**建议新增 suites**

- `Change Session Store`
- `Git Diff Classifier Fast Docs`
- `Git Diff Classifier Strict API`
- `Change Command Auto Lane`

`verify-fast-auto-promote` 可以先单独运行，避免在 verify 主线尚未完全稳定前把矩阵绑得过紧。

##### N. 第一批实施顺序

建议严格按下面顺序推进：

1. 先写 `runtime/session-store.ts`
2. 再写 `facts/git-diff-classifier.ts`
3. 再补 `impact-analysis.ts` 的薄适配函数
4. 再写 `commands/change-command.ts`
5. 再把 `cli.ts` 接上 `change`
6. 再给 `verify-runner.ts` 接上 `--fast`
7. 再补 README 和回归测试

**原因**

- session 和 lane 判定先稳定，change 命令才不会变成空壳
- `change-command.ts` 是 orchestrator，必须建立在 session/classifier 之上
- `verify --fast` 最后接，能避免调试时多条命令面一起漂

##### O. 推荐的最小提交切片

如果希望边写边回归，建议按下面四个提交切片推进：

**Commit 1：先稳定 lane 状态层**

- 新增 `session-store.ts`
- 新增 `git-diff-classifier.ts`
- 跑通 `change-session-store-roundtrip.ts`
- 跑通 `git-diff-classifier-fast-docs.ts`
- 跑通 `git-diff-classifier-strict-api.ts`

**Commit 2：把 change 命令接起来**

- 修改 `impact-analysis.ts`
- 新增 `change-command.ts`
- 修改 `cli.ts`
- 跑通 `change-command-auto-lane.ts`

**Commit 3：接本地 Fast Lane verify**

- 修改 `verify-runner.ts`
- 必要时补 `cli.ts` 的 `--fast`
- 跑通 `verify-fast-auto-promote.ts`

**Commit 4：补文档与矩阵**

- 修改 `README.md`
- 修改 `regression-runner.ts`
- 挂上稳定 suites

##### P. 第一批完成后的可演示结果

`Task Pack 7` 完成后，至少要能现场演示：

```bash
npm run jispec-cli -- change "新增订单退款"
npm run jispec-cli -- verify --fast
```

如果要演示 legacy slice 绑定：

```bash
npm run jispec-cli -- change "更新结账文案" --slice ordering-checkout-v1
```

终端输出至少包含：

- 当前 lane：`FAST` 或 `STRICT`
- 为什么
- changed paths / changed artifact summary
- 推荐下一步命令

文件结果至少包括：

```text
.spec/sessions/active-change.json
```

##### Q. 第一版完成的真实标准

如果还做不到下面这几件事，`Task Pack 7` 就还没有真正完成：

- `change` 不再只是概念，而是真能产出结构化 change session
- lane 判定是 deterministic 的，并且宁可保守升级 strict，也不误判 fast
- `verify --fast` 只作为本地短路入口，不会削弱 `ci:verify` 的严格门禁
- legacy runtime 的 `impact-analysis` / `next-report` 已经被接成 follow-up hint，而不是继续悬空

---

### Task Pack 8：Implement FSM 最小版本

#### 目标

把 AI 实现闭环做成预算受控的本地有限状态机，而不是无限聊天。

#### 用户动作

```bash
npm run jispec-cli -- implement
npm run jispec-cli -- implement --fast
```

#### 代码改造点

新增模块：

- `tools/jispec/implement/implement-runner.ts`
- `tools/jispec/implement/context-pruning.ts`
- `tools/jispec/implement/budget-controller.ts`
- `tools/jispec/implement/stall-detector.ts`
- `tools/jispec/implement/handoff-packet.ts`

复用模块：

- `agent-runner.ts`
- `failure-handler.ts`
- `fault-recovery.ts`
- `cache-manager.ts`
- `transaction-manager.ts`

#### 具体怎么做

1. 先不要做“自动写所有代码”
2. 最小版本只要做到：
   - 选择 working set
   - 提取首因错误
   - 跑 1~N 轮 patch
   - 在 stall/budget hit 时停机
3. 输出 handoff packet
4. 最终回到 `verify`

#### 测试要求

- stall 条件触发正确
- budget 耗尽时不会继续请求模型
- handoff packet 可序列化

#### 验收标准

- `implement` 不会无限烧 token
- 人类接手时能看懂 AI 已经做了什么

下面这部分继续按“文件级别 + 函数级别”拆解 `Task Pack 8`，目标是把 `implement` 从“未来会有的 AI 能力”落成一个真实可执行的本地有限状态机，并且让它在当前仓库结构下就能开工，而不是等所有理想架构一次性到位。

这里有一个关键边界必须先写死：

> `Task Pack 8` 的第一版目标不是做“会自动完成一切代码”的黑盒程序员，而是做一个**预算受控、上下文重建、失败可交接**的本地 worker loop。

也就是说，第一版必须坚持：

- **`implement` 只解决一个受限工作集里的实现问题**
- **每轮都重建上下文，不滚雪球式累加聊天历史**
- **命中预算或停滞阈值就必须停机**
- **停机后必须交出 handoff packet**
- **`implement --fast` 是本地开发加速，不取代 `verify`/`ci:verify`**

##### A. 基于当前仓库现状的切入点

当前仓库里 `Task Pack 8` 最值得复用的现实基础有：

- [tools/jispec/agent-runner.ts](/D:/codeSpace/JiSpec/tools/jispec/agent-runner.ts)
- [tools/jispec/ai-provider.ts](/D:/codeSpace/JiSpec/tools/jispec/ai-provider.ts)
- [tools/jispec/ai-provider-factory.ts](/D:/codeSpace/JiSpec/tools/jispec/ai-provider-factory.ts)
- [tools/jispec/providers/mock-provider.ts](/D:/codeSpace/JiSpec/tools/jispec/providers/mock-provider.ts)
- [tools/jispec/failure-handler.ts](/D:/codeSpace/JiSpec/tools/jispec/failure-handler.ts)
- [tools/jispec/fault-recovery.ts](/D:/codeSpace/JiSpec/tools/jispec/fault-recovery.ts)
- [tools/jispec/cache-manager.ts](/D:/codeSpace/JiSpec/tools/jispec/cache-manager.ts)
- [tools/jispec/transaction-manager.ts](/D:/codeSpace/JiSpec/tools/jispec/transaction-manager.ts)
- [tools/jispec/cli.ts](/D:/codeSpace/JiSpec/tools/jispec/cli.ts) 里已经存在的 `agent run implement`

但当前也有几个必须正视的现实约束：

- 现在还没有 `tools/jispec/implement/` 目录
- 现在没有统一的 repo `test` script
- `runAgent(...)` 当前更偏“slice/stage 产物生成器”，不是“多轮 patch 修复器”
- `TransactionManager.begin(...)` 当前假设有 `sliceId` / `stageId`
- `MockProvider` 当前更偏阶段产物输出，不是 implement patch loop

所以这一包的正确开法不是把 `implement` 直接塞进 `StageRunner`，而是：

1. 先做一个独立的 `implement-runner.ts`
2. 只复用 provider bootstrap、失败恢复、缓存和可选快照这些底层能力
3. 让 `implement` 和 `change session` / `verify` 形成受控闭环

##### B. 第一版必须守住的边界

`Task Pack 8` 第一版必须明确“不做什么”：

- 不做仓库全局自动编码
- 不在第一版里做多 agent 并行实现
- 不要求自动提交 git commit
- 不让 implement 直接吞掉全部测试日志和全部代码树
- 不为了“更聪明”把大模型放在预算、停滞判定、最终裁决路径里

第一版只做：

- 读取 active change session 或兼容输入
- 解析 test command
- 运行红绿循环
- 每轮构建最小上下文
- 调 provider 生成结构化 patch candidate
- 应用 patch 并重跑测试
- 预算控制
- 停滞检测
- handoff packet 落盘
- 最后回到 `verify`

##### C. 新建 Implement Runner 主模块

**新增文件**

- `tools/jispec/implement/implement-runner.ts`

**要做什么**

这是 `Task Pack 8` 的主执行器，负责：

1. preflight
2. budget preview
3. test command resolve
4. context rebuild
5. provider 调用
6. patch apply
7. red/green loop
8. stall / budget stop
9. handoff packet write
10. 最终 verify

**建议导出类型**

```ts
export type ImplementOutcome =
  | "SUCCESS"
  | "BLOCKED_NEEDS_HUMAN"
  | "BUDGET_EXHAUSTED"
  | "STALLED_NO_PROGRESS";

export interface ImplementRunOptions
export interface ImplementIterationResult
export interface ImplementRunResult
export interface ImplementPatchCandidate
export interface TestExecutionResult
```

**建议字段**

```ts
interface ImplementRunOptions {
  root: string;
  fast?: boolean;
  sliceId?: string;
  sessionId?: string;
  testCommand?: string;
  maxIterations?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxCostUsd?: number;
  maxStallCount?: number;
  dryRun?: boolean;
}

interface ImplementPatchCandidate {
  summary: string;
  hypothesis: string;
  touchedPaths: string[];
  writes: Array<{
    path: string;
    content: string;
    encoding?: string;
  }>;
}

interface TestExecutionResult {
  passed: boolean;
  command: string;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  firstFailureMessage?: string;
  failureSignature?: string;
}

interface ImplementIterationResult {
  iteration: number;
  testResultBefore: TestExecutionResult;
  patchCandidate?: ImplementPatchCandidate;
  appliedPaths: string[];
  testResultAfter?: TestExecutionResult;
  progress: "improved" | "unchanged" | "regressed";
}

interface ImplementRunResult {
  outcome: ImplementOutcome;
  lane: "fast" | "strict";
  iterations: number;
  testCommand: string;
  appliedPaths: string[];
  budget: Record<string, unknown>;
  finalVerifyVerdict?: string;
  lastFailureSignature?: string;
  handoffPacketPath?: string;
  notes: string[];
}
```

**建议导出函数**

```ts
export async function runImplement(options: ImplementRunOptions): Promise<ImplementRunResult>
export function renderImplementText(result: ImplementRunResult): string
export function renderImplementJSON(result: ImplementRunResult): string
async function runImplementLoop(context: ImplementExecutionContext): Promise<ImplementRunResult>
async function executeImplementIteration(context: ImplementExecutionContext, iteration: number): Promise<ImplementIterationResult>
async function runTestCommand(root: string, command: string): Promise<TestExecutionResult>
async function applyPatchCandidate(root: string, candidate: ImplementPatchCandidate): Promise<string[]>
```

**第一版主流程建议**

```text
resolve session / lane
-> resolve test command
-> build budget preview
-> run tests
-> if green => SUCCESS
-> build context bundle
-> call provider
-> parse patch candidate
-> apply writes
-> rerun tests
-> record iteration
-> check budget / stall
-> loop or stop
-> write handoff packet when not success
-> final verify
```

##### D. 新建 Context Pruning 模块

**新增文件**

- `tools/jispec/implement/context-pruning.ts`

**要做什么**

把前面“Immutable Contract Pack / Working Set / Failure Pack / Episode Memory”这四层真正做成 deterministic 的上下文构建器。

第一版不要让小模型参与总结，先全部 deterministic。

**建议导出类型**

```ts
export interface ImmutableContractPack
export interface WorkingSet
export interface FailurePack
export interface EpisodeMemory
export interface ImplementContextBundle
```

**建议字段**

```ts
interface ImmutableContractPack {
  domainPaths: string[];
  apiSpecPaths: string[];
  featurePaths: string[];
  changeSummary: string;
}

interface WorkingSet {
  targetFiles: string[];
  relatedFiles: string[];
  selectedSnippets: Array<{
    path: string;
    content: string;
  }>;
}

interface FailurePack {
  firstFailureMessage: string;
  failureSignature: string;
  command: string;
  compactStdout: string;
  compactStderr: string;
}

interface EpisodeMemory {
  attemptedHypotheses: string[];
  rejectedPaths: string[];
  summaries: string[];
}

interface ImplementContextBundle {
  immutable: ImmutableContractPack;
  workingSet: WorkingSet;
  failurePack: FailurePack;
  episodeMemory: EpisodeMemory;
  prompt: string;
}
```

**建议导出函数**

```ts
export function buildImmutableContractPack(root: string, session: ChangeSession): ImmutableContractPack
export function buildWorkingSet(root: string, input: {
  session: ChangeSession;
  testResult: TestExecutionResult;
  previousTouchedPaths: string[];
}): WorkingSet
export function buildFailurePack(testResult: TestExecutionResult): FailurePack
export function updateEpisodeMemory(previous: EpisodeMemory | null, iteration: ImplementIterationResult): EpisodeMemory
export function assembleImplementPrompt(bundle: ImplementContextBundle): string
export function buildImplementContextBundle(input: {
  root: string;
  session: ChangeSession;
  testResult: TestExecutionResult;
  previousTouchedPaths: string[];
  episodeMemory: EpisodeMemory | null;
}): ImplementContextBundle
```

**第一版工作集策略建议**

- 优先当前 active change session 的 `changedPaths`
- 再补第一条失败里出现的文件路径
- 再补相关测试文件
- 再补最多 2~3 个必要依赖文件

**硬限制建议**

- Working Set 第一版最多 8 个文件
- 单文件截断到固定字符数
- prompt 总长度超预算时优先裁掉：
  - 历史 episode memory
  - 其次相关文件
  - 不裁 failure pack 和 immutable contract pack

##### E. 把“测试命令解析”做成显式 preflight

**修改文件**

- `tools/jispec/implement/implement-runner.ts`

**必须正视一个现实**

当前仓库没有统一 `npm test`。

如果这一点不提前设计好，`implement` 第一天就会卡死。

**建议新增函数**

```ts
function resolveTestCommand(root: string, options: ImplementRunOptions, session: ChangeSession | null): string
function resolvePackageScripts(root: string): Record<string, string>
function createPreflightBlock(message: string): ImplementRunResult
```

**第一版解析顺序建议**

1. 显式 `--test-command`
2. active change session 里已有的 `testCommand`
3. `package.json` 中按顺序探测：
   - `test`
   - `test:unit`
   - `verify`
4. 都找不到则返回 `BLOCKED_NEEDS_HUMAN`

**第一版不要做**

- 不要偷偷默认执行一个你并不确定存在的命令
- 不要把“没有测试命令”伪装成 AI 问题

##### F. 新建 Budget Controller

**新增文件**

- `tools/jispec/implement/budget-controller.ts`

**要做什么**

实现预算预估、预算消耗累计和 stop gate。

**建议导出类型**

```ts
export interface ImplementBudgetConfig
export interface ImplementBudgetLedger
export interface BudgetPreview
export interface BudgetCheckResult
```

**建议字段**

```ts
interface ImplementBudgetConfig {
  maxIterations: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostUsd: number;
  maxStallCount: number;
}

interface ImplementBudgetLedger {
  iterationsUsed: number;
  inputTokensUsed: number;
  outputTokensUsed: number;
  estimatedCostUsd: number;
}

interface BudgetPreview {
  estimatedIterations: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
}

interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
}
```

**建议导出函数**

```ts
export function createDefaultImplementBudgetConfig(options?: Partial<ImplementBudgetConfig>): ImplementBudgetConfig
export function createBudgetPreview(input: {
  lane: "fast" | "strict";
  workingSetFileCount: number;
  hasContractPack: boolean;
}): BudgetPreview
export function createEmptyBudgetLedger(): ImplementBudgetLedger
export function recordBudgetUsage(
  ledger: ImplementBudgetLedger,
  usage: { inputTokens?: number; outputTokens?: number; estimatedCostUsd?: number }
): ImplementBudgetLedger
export function canContinueWithBudget(config: ImplementBudgetConfig, ledger: ImplementBudgetLedger): BudgetCheckResult
```

**第一版注意事项**

- token 统计可以先做估算，不要求 provider 真正返回 token usage
- 估算规则必须 deterministic
- `maxIterations` 是最硬阈值

##### G. 新建 Stall Detector

**新增文件**

- `tools/jispec/implement/stall-detector.ts`

**要做什么**

把“错误签名不变、文件来回震荡、重复相同思路”做成显式 stop rule。

**建议导出类型**

```ts
export interface StallObservation
export interface StallStatus
```

**建议字段**

```ts
interface StallObservation {
  iteration: number;
  failureSignature?: string;
  touchedPaths: string[];
  hypothesis?: string;
  progress: "improved" | "unchanged" | "regressed";
}

interface StallStatus {
  stalled: boolean;
  reason?: string;
  repeatedSignatureCount: number;
  oscillatingPathCount: number;
}
```

**建议导出函数**

```ts
export function createEmptyStallHistory(): StallObservation[]
export function appendStallObservation(history: StallObservation[], observation: StallObservation): StallObservation[]
export function evaluateStall(history: StallObservation[], maxStallCount: number): StallStatus
export function normalizeFailureSignature(message: string | undefined): string
```

**第一版 stall 规则建议**

- 连续 2 轮 `failureSignature` 完全相同
- 连续 2 轮只在同一小组文件里来回修改
- 连续 2 轮 `progress` 都不是 `improved`

命中任一条，就允许进入 `STALLED_NO_PROGRESS`

##### H. 新建 Handoff Packet 模块

**新增文件**

- `tools/jispec/implement/handoff-packet.ts`

**要做什么**

在：

- `BLOCKED_NEEDS_HUMAN`
- `BUDGET_EXHAUSTED`
- `STALLED_NO_PROGRESS`

这三种结束态下，都产出一份稳定可读、可序列化的 handoff packet。

**建议导出类型**

```ts
export interface ImplementHandoffPacket
```

**建议字段**

```ts
interface ImplementHandoffPacket {
  version: 1;
  createdAt: string;
  outcome: ImplementOutcome;
  lane: "fast" | "strict";
  sessionId?: string;
  summary: string;
  testCommand: string;
  lastFailureSignature?: string;
  attemptedHypotheses: string[];
  rejectedPaths: string[];
  changedFiles: string[];
  recommendedHumanSteps: string[];
}
```

**建议导出函数**

```ts
export function buildImplementHandoffPacket(input: {
  outcome: ImplementOutcome;
  session: ChangeSession | null;
  episodeMemory: EpisodeMemory | null;
  lastIteration: ImplementIterationResult | null;
  testCommand: string;
}): ImplementHandoffPacket
export function writeImplementHandoffPacket(root: string, packet: ImplementHandoffPacket): string
export function renderImplementHandoffText(packet: ImplementHandoffPacket): string
```

**建议默认落盘路径**

```text
.spec/handoffs/implement-<timestamp>.json
```

##### I. `runtime/session-store.ts` 在 Task Pack 8 的扩展点

**修改文件**

- `tools/jispec/runtime/session-store.ts`

**要做什么**

Task Pack 7 已经把 `change session` 建起来了，Task Pack 8 不应该另起一套 implement session。

正确做法是对 active change session 做薄扩展。

**建议新增字段**

```ts
interface ChangeSession {
  ...
  implementState?: {
    iterationsUsed?: number;
    lastOutcome?: ImplementOutcome;
    lastHandoffPacketPath?: string;
    testCommand?: string;
    lastFailureSignature?: string;
  };
}
```

**建议新增函数**

```ts
export function attachImplementState(root: string, patch: ChangeSession["implementState"]): ChangeSession | null
export function requireImplementableSession(root: string, options: { sliceId?: string; fast?: boolean }): ChangeSession | null
```

**第一版语义建议**

- 优先使用 active change session
- 没有 session 时：
  - 若传了 `--slice`，可生成兼容 session
  - 否则返回 `BLOCKED_NEEDS_HUMAN`

##### J. `agent-runner.ts` / provider 层的正确复用边界

**修改文件**

- [tools/jispec/agent-runner.ts](/D:/codeSpace/JiSpec/tools/jispec/agent-runner.ts)

**非常关键的判断**

`implement` 第一版**不应该直接复用 `runAgent(...)`**。

原因是当前 `runAgent(...)` 的职责更偏：

- slice/stage prompt 组装
- 输入输出约束校验
- 结构化 stage artifact 产出

而 implement loop 需要的是：

- 多轮 patch candidate 生成
- 每轮重新拼 prompt
- 每轮基于测试结果重建上下文

**正确复用点**

复用 provider bootstrap，而不是复用整套 agent stage 外壳。

**建议新增导出**

```ts
export function loadAIConfigForPath(startPath: string): AIConfig | undefined
export async function callProviderWithPrompt(startPath: string, prompt: string, options?: GenerateOptions): Promise<string>
```

这样 `implement-runner.ts` 可以直接调用 provider，而不必走 `runAgent(...)` 那一整套 slice artifact 流程。

##### K. `providers/mock-provider.ts` 的扩展点

**修改文件**

- [tools/jispec/providers/mock-provider.ts](/D:/codeSpace/JiSpec/tools/jispec/providers/mock-provider.ts)

**要做什么**

为了给 `implement` 做可重复回归测试，现有 `MockProvider` 需要识别 implement prompt，并返回 deterministic 的 patch candidate。

**建议新增行为**

- 当 prompt 中带有明确 `IMPLEMENT_PATCH_CANDIDATE` 标记时：
  - 返回 implement 专用 JSON
- 支持测试钩子环境变量，例如：
  - `JISPEC_TEST_IMPLEMENT_RESPONSE_FILE`
  - `JISPEC_TEST_IMPLEMENT_MODE`

**建议实现结果结构**

```json
{
  "summary": "Apply minimal fix for failing test",
  "hypothesis": "The function returns the wrong value branch",
  "touchedPaths": ["src/example.ts"],
  "writes": [
    {
      "path": "src/example.ts",
      "content": "..."
    }
  ]
}
```

##### L. `failure-handler.ts` / `fault-recovery.ts` 的正确边界

**复用文件**

- [tools/jispec/failure-handler.ts](/D:/codeSpace/JiSpec/tools/jispec/failure-handler.ts)
- [tools/jispec/fault-recovery.ts](/D:/codeSpace/JiSpec/tools/jispec/fault-recovery.ts)

**第一版复用建议**

`failure-handler.ts`

- 可复用其 snapshot / rollback 思路
- 但不要把整套“阶段失败 + 人工提示 + lifecycle 回滚”原样搬到 implement

`fault-recovery.ts`

- 可借鉴其 checkpoint / recovery stats 思路
- 但第一版 implement 不必直接接 distributed recovery 语义

**建议在 implement-runner.ts 里先做的事情**

- 在开始前记录一次 pre-run snapshot / baseline note
- 命中严重异常时保留当前工作区 + handoff packet
- 第一版默认不自动回滚“最佳已达状态”

##### M. `cache-manager.ts` / `transaction-manager.ts` 的正确边界

**复用文件**

- [tools/jispec/cache-manager.ts](/D:/codeSpace/JiSpec/tools/jispec/cache-manager.ts)
- [tools/jispec/transaction-manager.ts](/D:/codeSpace/JiSpec/tools/jispec/transaction-manager.ts)

**这里要非常克制**

`CacheManager`

- 可以缓存：
  - context bundle
  - 文件裁切结果
  - 失败签名到工作集的映射
- 不应该缓存：
  - active implement state
  - budget ledger
  - handoff packet

`TransactionManager.begin(...)`

- 当前强依赖 `sliceId` / `stageId`
- 更适合 structured stage execution
- 不适合直接当 repo-level implement transaction

**第一版建议**

- 不直接把 implement 主循环绑死在 `TransactionManager.begin(...)`
- 先用 `FilesystemStorage` + handoff packet + 可选 pre-run snapshot 维持最小安全性
- 后续如果 `implement` 收敛到 structured writes 再考虑 transaction 化

##### N. `verify-runner.ts` 的集成边界

**可能修改文件**

- `tools/jispec/verify/verify-runner.ts`

**要做什么**

第一版 `implement` 收口时，最终还是要回到 verify。

**建议新增函数**

```ts
async function runPostImplementVerify(root: string, lane: "fast" | "strict"): Promise<VerifyRunResult>
```

**第一版策略建议**

- `implement --fast`
  - 成功后可先跑 `verify --fast`
- Strict Lane implement
  - 成功后必须跑完整 `verify`

实现位置可以在 `implement-runner.ts`，不一定非要改 `verify-runner.ts` 本身。

##### O. `cli.ts` 的命令面改造

**修改文件**

- [tools/jispec/cli.ts](/D:/codeSpace/JiSpec/tools/jispec/cli.ts)

**要做什么**

把当前 help 里的“未来命令”变成真正可执行入口。

**建议新增命令**

```ts
.command("implement")
.description("Run a budget-controlled local implementation loop inside the current contract boundary.")
.option("--root <path>", "Repository root.", ".")
.option("--fast", "Prefer local fast-lane implement flow.", false)
.option("--slice <sliceId>", "Optional legacy slice binding when no active change session exists.")
.option("--test-command <cmd>", "Override the test command used by the red/green loop.")
.option("--max-iterations <n>", "Hard stop after N iterations.", "6")
.option("--max-cost-usd <n>", "Hard stop when estimated cost exceeds the cap.", "2")
.option("--max-stall-count <n>", "Hard stop when no-progress observations accumulate.", "2")
.option("--dry-run", "Show preflight and budget preview without executing.", false)
.option("--json", "Emit machine-readable JSON output.", false)
```

**第一版不要做**

- 不要在这一包里顺手把 `agent run implement` 删掉
- `agent run implement` 继续保留为 legacy surface
- 新 `implement` 才是产品级入口

##### P. `package.json` 与 README 的最小收口

**修改文件**

- [package.json](/D:/codeSpace/JiSpec/package.json)
- [README.md](/D:/codeSpace/JiSpec/README.md)

**`package.json` 建议**

第一版不一定必须新增 script。

如果需要，最多只加一个：

```json
"implement": "node --import tsx ./tools/jispec/cli.ts implement"
```

但也完全可以继续统一走：

```bash
npm run jispec-cli -- implement
```

**README 第一版建议补充**

- `implement` 是什么
- 它需要 active change session 或 `--slice`
- 它不会无限烧 token
- `implement --fast` 是本地开发加速，不取代 CI

##### Q. 第一版测试文件清单

**新增测试文件**

- `tools/jispec/tests/implement-budget-controller.ts`
- `tools/jispec/tests/implement-stall-detector.ts`
- `tools/jispec/tests/implement-context-pruning.ts`
- `tools/jispec/tests/implement-handoff-packet-roundtrip.ts`
- `tools/jispec/tests/implement-test-command-resolution.ts`
- `tools/jispec/tests/implement-runner-budget-exhausted.ts`
- `tools/jispec/tests/implement-runner-stalled-no-progress.ts`
- `tools/jispec/tests/implement-runner-success-mock.ts`

**测试重点**

`implement-budget-controller.ts`

- budget preview 稳定
- 迭代数和成本阈值命中正确

`implement-stall-detector.ts`

- 重复 failure signature 会触发 stall
- 文件震荡能被识别

`implement-context-pruning.ts`

- working set 文件数受控
- prompt 长度受控
- immutable contract pack 不会被裁掉

`implement-handoff-packet-roundtrip.ts`

- handoff packet 可序列化、可回读
- 推荐人工步骤存在

`implement-test-command-resolution.ts`

- `--test-command` 优先级最高
- 没有 test script 时返回清晰 preflight block

`implement-runner-budget-exhausted.ts`

- mock provider 连续返回无效 patch 时，命中预算后停止
- provider 调用次数不超过阈值

`implement-runner-stalled-no-progress.ts`

- 连续相同 failure signature 命中 stall
- 会生成 handoff packet

`implement-runner-success-mock.ts`

- mock provider 返回有效 patch
- rerun tests 后进入 `SUCCESS`
- 最终会回到 verify

##### R. 建议把部分测试接入回归矩阵

**修改文件**

- [tools/jispec/tests/regression-runner.ts](/D:/codeSpace/JiSpec/tools/jispec/tests/regression-runner.ts)

**建议新增 suites**

- `Implement Budget Controller`
- `Implement Stall Detector`
- `Implement Handoff Packet`
- `Implement Runner Success Mock`

`budget-exhausted` 和 `stalled-no-progress` 可先单独运行，避免第一版把时间敏感 / 多轮循环测试全部塞进总矩阵。

##### S. 第一批实施顺序

建议严格按下面顺序推进：

1. 先写 `budget-controller.ts`
2. 再写 `stall-detector.ts`
3. 再写 `handoff-packet.ts`
4. 再写 `context-pruning.ts`
5. 再补 `agent-runner.ts` 的 provider helper 导出
6. 再写 `implement-runner.ts`
7. 再改 `session-store.ts`
8. 再改 `mock-provider.ts`
9. 再把 `cli.ts` 接上 `implement`
10. 最后补 README 和回归测试

**原因**

- 预算、停滞、handoff 是 implement 的宪法层
- 这些 stop rule 不先稳定，主循环很容易越写越散
- runner 是 orchestrator，应该建立在前面几个原语之上

##### T. 推荐的最小提交切片

如果希望边写边回归，建议按下面四个提交切片推进：

**Commit 1：先稳定 implement 原语**

- 新增 `budget-controller.ts`
- 新增 `stall-detector.ts`
- 新增 `handoff-packet.ts`
- 跑通 `implement-budget-controller.ts`
- 跑通 `implement-stall-detector.ts`

**Commit 2：补上下文与 provider 入口**

- 新增 `context-pruning.ts`
- 修改 `agent-runner.ts`
- 修改 `mock-provider.ts`
- 跑通 `implement-context-pruning.ts`

**Commit 3：接主循环**

- 新增 `implement-runner.ts`
- 修改 `session-store.ts`
- 修改 `cli.ts`
- 跑通 `implement-test-command-resolution.ts`
- 跑通 `implement-runner-success-mock.ts`

**Commit 4：补失败路径与矩阵**

- 跑通 `implement-runner-budget-exhausted.ts`
- 跑通 `implement-runner-stalled-no-progress.ts`
- 修改 `README.md`
- 修改 `regression-runner.ts`

##### U. 第一批完成后的可演示结果

`Task Pack 8` 完成后，至少要能现场演示：

```bash
npm run jispec-cli -- implement --dry-run
npm run jispec-cli -- implement --test-command "npm run verify"
```

如果要演示 Fast Lane：

```bash
npm run jispec-cli -- implement --fast --test-command "npm run verify -- --fast"
```

终端输出至少包含：

- 预算预估
- 当前 lane
- 当前 iteration
- 最近 failure signature
- 是否命中 stall / budget
- 最终 outcome
- handoff packet 路径（如果未成功）

文件结果至少包括：

```text
.spec/handoffs/implement-<timestamp>.json
```

##### V. 第一版完成的真实标准

如果还做不到下面这几件事，`Task Pack 8` 就还没有真正完成：

- `implement` 已经不是“单次 agent 调用”，而是多轮有限状态机
- 没有统一 test script 的仓库也能被清晰 preflight，而不是莫名失败
- budget / stall / handoff 三个 stop rule 已经真实生效
- provider 调用被限制在预算框架之内
- 失败时留下的是“值得人类接手的高价值断点”，而不是一团不可解释的烂摊子

---

## 二十、建议的 Sprint 排期

如果按最现实的方式推进，建议按 4 个 Sprint 执行。

### Sprint 1

- 完成 Task Pack 1：Bootstrap Discover
- 开始 Task Pack 2：Draft 骨架
- 目标演示：
  - 一个老仓库能跑出 evidence graph

### Sprint 2

- 完成 Task Pack 2：Draft + Adopt
- 完成 Task Pack 3：Verify Runner 四态输出
- 目标演示：
  - 一个老仓库能被接管并首次 verify

### Sprint 3

- 完成 Task Pack 4：Baseline / Observe / Waiver
- 完成 Task Pack 5：Facts Contract 与最小 Policy DSL
- 完成 Task Pack 6：CI Native Gate 最小版
- 目标演示：
  - GitHub Action 中出现可解释的 verify 结果

### Sprint 4

- 完成 Task Pack 7：Change + Fast Lane
- 完成 Task Pack 8：Implement FSM 最小版
- 目标演示：
  - 小改动走 `--fast`
  - 严格改动走 change + implement + verify

---

## 二十一、Definition of Done

每个任务包完成时，至少满足以下条件：

1. 有真实 CLI 命令可演示
2. 有对应的测试落在 `tools/jispec/tests/` 或等效位置
3. 有失败场景验证，不只测 happy path
4. 有 README 或 help surface 更新
5. 不破坏现有 legacy 命令的基本可用性

如果一个任务只写了代码、没有命令面、没有测试、没有输出样例，就不算完成。
