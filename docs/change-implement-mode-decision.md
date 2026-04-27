# Change / Implement 串联模式决策

## 文档目的

这份文档只回答一个问题：

`change / implement` 主线到底是“提示式串联”、还是“执行式串联”，以及它们在 V1 里的关系是什么。

## 一句话结论

JiSpec V1 采用 **双模式设计**：

- 支持 `提示式串联`
- 支持 `执行式串联`
- 由用户显式选择
- 但产品最终默认形态收敛到 `执行式串联`

换句话说：

- `提示式串联` 是保守模式、解释模式、调试模式
- `执行式串联` 是最终产品主形态

## 两种模式分别是什么意思

### 提示式串联

系统负责：

- 记录 change intent
- 做 lane 判定
- 写 change session
- 给出下一步建议命令

系统不负责：

- 自动继续运行后续命令
- 自动串起 adopt / implement / verify

用户体验更像：

`change` 之后，系统告诉你“下一步该做什么”，但不会替你继续执行。

### 执行式串联

系统负责：

- 记录 change intent
- 做 lane 判定
- 根据 lane 自动进入下一步
- 在 strict / fast 两条主线上把后续步骤真正串起来

用户体验更像：

你启动的是一条工作流，而不是只得到几个提示命令。

## 当前仓库的真实状态

当前实现更接近：

- `change` = 提示式串联
- `implement` = 半执行式串联

原因是：

- [change-command.ts](/D:/codeSpace/JiSpec/tools/jispec/change/change-command.ts) 当前主要产出 `nextCommands`
- `change` 目前不会自动继续跑完整主线
- `implement` 在结束后已经会自动回到 verify，因此它不是纯提示式

所以当前仓库不是一个完整的执行式主线，只是已经具备了执行式串联的一部分基础。

## 产品决策

### 固定决策

V1 要求：

1. 两种模式都保留
2. 模式由用户选择
3. 文档、CLI、测试必须明确区分两种语义
4. 最终默认模式收敛为 `execute`
5. `prompt` 模式长期保留，不作为临时兼容 hack 删除

### 为什么不只留一种

只保留 `提示式串联` 的问题：

- 主线会长期停留在“建议系统”层
- 不符合最终产品形态

只保留 `执行式串联` 的问题：

- 调试、演示、排障时不够透明
- 初期实现风险更高

因此最稳妥的产品路径是：

- 能解释
- 能编排
- 最终默认偏向编排

## 目标语义

### Prompt 模式

预期语义：

- `change` 只写会话和建议
- 用户自行决定是否 `adopt`
- 用户自行运行 `implement`
- 用户自行运行 `verify`

预期价值：

- 适合调试
- 适合录屏演示每一步
- 适合排查 lane 判定和 handoff 细节

### Execute 模式

预期语义：

- `change` 或上层 wrapper 进入编排流程
- strict lane 默认走：
  `change -> adopt -> implement -> verify`
- fast lane 默认走：
  `change -> implement --fast -> verify --fast`
- 命中 strict trigger 时，不能继续伪装 fast，必须升级

预期价值：

- 更接近真正产品闭环
- 更适合作为默认主线体验

## 推荐 CLI 落地方式

本轮先把产品语义固定，不强行锁死实现细节。

但推荐的目标命令面是：

```bash
jispec-cli change "..." --mode prompt
jispec-cli change "..." --mode execute
```

或等价地提供：

```bash
jispec-cli change "..."
jispec-cli mainline run "..."
```

只要满足下面 3 条即可：

1. 用户能显式选择 `prompt / execute`
2. 当前命令文案不会误导用户
3. 未来可以把默认值切到 `execute`

## 默认值策略

为了避免“文档先于实现”造成误导，默认值策略明确分成两个阶段。

### 阶段 1：实现刚落地时

- 推荐默认值仍保持保守
- 可以要求用户显式传入模式
- 或默认仍为 `prompt`

目标是先把双模式能力做稳。

### 阶段 2：主线验证完成后

- 默认值切换为 `execute`
- `prompt` 继续保留

目标是让最终产品体验收敛到执行式串联，而不是永远停留在提示式模式。

## 测试与文档要求

实现 C5 时，至少要同时交付：

1. `prompt` 模式验收
2. `execute` 模式验收
3. lane 自动升级验收
4. CLI help / README / 主线稳定契约文档同步更新

至少要固定下面这些语义：

- `prompt` 模式不会偷偷自动执行
- `execute` 模式会明确输出已进入哪条 lane
- fast 命中 strict trigger 时必须升级
- 失败退出点要能定位是 `change / adopt / implement / verify` 哪一段中断

## 当前不在这份决策里解决什么

这份文档不提前决定以下实现细节：

- 是不是一定要新建 `mainline run`
- `change --mode execute` 和 wrapper 谁是主入口
- execute 模式里 adopt 是否允许半自动或必须显式确认
- 是否在 console 中增加对应入口

这些属于实现层选择，不影响这份产品语义决策。
