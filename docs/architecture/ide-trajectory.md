# JiSpec 的长期 IDE 演化路径

这是一条远期产品路径，不是 V1 发布承诺。

## 结论

JiSpec 现在更像 **AI coding IDE 的控制内核**，而不是完整 IDE 本体。
如果未来要长成自己的 coding IDE，最有价值的部分已经在仓库里了，但外层编辑器壳、交互层和协作层还没有补齐。

## 现有支撑能力

- `bootstrap -> draft -> adopt -> verify -> change -> implement` 的契约驱动主线已经存在。
- `verify`、`ci:verify`、policy、waiver、spec debt、audit、provenance 构成了确定性控制面。
- 外部 coding tool 适配器已经支持 `Codex`、`Claude Code`、`Cursor`、`Copilot`、`Devin` 的受控接入。
- `implement --external-patch` 已经把外部实现结果收回 JiSpec 的 mediation 流程。
- Console 已经有本地治理读模型、静态 UI、动作建议和多仓聚合。
- 所有关键产物都已经是本地文件、稳定 schema、可回放命令和人类决策包。

## 还缺的 IDE 外层能力

- 编辑器壳和代码窗口
- 项目树、文件跳转、搜索、打开最近文件
- patch/diff 的可视化审阅与局部接受
- inline diagnostics、code actions、任务栏和状态栏
- agent 会话 UI、上下文选择器、聊天工作区
- 插件/扩展模型
- 协作、presence、distributed workspace

## 远期判断

如果 JiSpec 继续长成 IDE，它应当先做成：

1. 受 JiSpec 主线约束的 coding workspace
2. 再做成带编辑器壳的交付工作台
3. 最后才是完整 IDE 产品

这条路成立的前提是：IDE 壳子只能承载 JiSpec 的控制面，不能反过来削弱 `verify`、`ci:verify` 和本地可审计的确定性门禁。

## 决策规则

只有当下面这些能力足够稳定时，才适合把“自有 IDE”从远期想法推进成产品方向：

- 能在本地打开、浏览和编辑工作区
- 能看懂并审阅 patch / diff
- 能把外部 coding tool 的结果收回同一套 mediation
- 能把 verify、policy、audit、waiver 放进同一个可见工作台
- 能保持 local-first 和 deterministic gate 不变

## 位置关系

JiSpec 的北极星仍然是交付控制层。
IDE 是可能长出来的产品形态之一，但它只能建立在已经证明可用的控制内核之上。
