# Dimension 5 Org Operations Plan

日期：2026-05-22

## 目标

将第 5 维“多人协作/组织级运营系统”从 9.4 推进到 9.7，拉伸目标 9.8-9.9。阶段 11-15 不引入远程协作依赖，不要求源码上传，不替代 `verify` / `ci:verify` / `doctor mainline` / `doctor global`，只把现有本地 artifact 组织成可审计、可分派、可复盘的运营证据层。

## 守门边界

- 本地 artifact 是事实源，Markdown 只做人类伴随说明。
- 不要求实时协作服务；异步协作证据来自本地 audit ledger / operations packet。
- 不上传源码，不扫描未声明源码路径。
- 不执行命令，只给 owner action 和 runbook command。
- 不替代 verify、CI gate、doctor mainline、doctor global。
- deferred collaboration surfaces 保持 diagnostic-only。

## 阶段 11：Org Topology & Responsibility Graph

目标：把 global operations packet 中的 repo、owner action、cross-repo drift 进一步连接到 team、reviewer、escalation path，形成组织可运营的责任图。

交付：

- `.spec/operations/org-responsibility-graph.json`
- `.spec/operations/org-responsibility-graph.md`
- `doctor global --write-org-graph`
- Console read model object：`org_responsibility_graph`
- North Star scenario：`org_responsibility_graph`
- 回归 suite：`tools/jispec/tests/org-responsibility-graph.ts`

验收：

- graph 必须证明每个 owner action 有 repo、team、owner、reviewer、escalation path。
- graph 必须引用 audit evidence。
- graph boundary 必须保持 no-upload、no-realtime、no-execute、no-verify-replacement。
- `runtime-extended` 注册 `North-Star-Score-Phase-11`。

预期评分影响：第 5 维 9.4 -> 9.55/9.6。

## 阶段 12：Async Review Inbox

目标：在责任图基础上生成异步 reviewer inbox，把 owner actions、waiver/debt/release drift review 请求汇总成按人分派的 inbox。

交付方向：

- `.spec/operations/async-review-inbox.json`
- 每个 reviewer 的 pending/accepted/blocked/expired 视图。
- Console 展示 reviewer load、过期 review、缺失 reviewer。
- North Star 验证异步 review 不依赖实时协作。

预期评分影响：第 5 维 9.6 -> 9.68。

阶段 12 实施记录：

- 运行 artifact：`.spec/operations/async-review-inbox.json`
- 人类伴随说明：`.spec/operations/async-review-inbox.md`
- CLI 入口：`doctor global --write-review-inbox`
- Doctor 诊断：`Async Review Inbox Readiness`
- Console 对象：`async_review_inbox`
- North Star 场景：`async_review_inbox`，任务号 `North-Star-Score-Phase-12`
- 回归保护：`tools/jispec/tests/async-review-inbox.ts`，归入 `runtime-extended`

## 阶段 13：Ops SLA / Aging Ledger

目标：给 owner actions、review requests、waivers、spec debt、release drift 加入 aging/SLA 视角，形成可运营的 aging ledger。

交付方向：

- `.spec/operations/ops-aging-ledger.json`
- SLA buckets：fresh / due-soon / overdue / escalated。
- escalation path 来自阶段 11 的 org responsibility graph。
- Doctor global 只诊断，不替代 gate。

预期评分影响：第 5 维 9.68 -> 9.74。

阶段 13 实施记录：

- 运行 artifact：`.spec/operations/ops-aging-ledger.json`
- 人类伴随说明：`.spec/operations/ops-aging-ledger.md`
- CLI 入口：`doctor global --write-aging-ledger`
- Doctor 诊断：`Ops Aging Ledger Readiness`
- Console 对象：`ops_aging_ledger`
- North Star 场景：`ops_aging_ledger`，任务号 `North-Star-Score-Phase-13`
- 回归保护：`tools/jispec/tests/ops-aging-ledger.ts`，归入 `runtime-extended`

## 阶段 14：Release Train Coordination

目标：将 multi-repo promotion、release compare、owner actions 和 org graph 汇总成 release train readiness packet。

交付方向：

- `.spec/operations/release-train-packet.json`
- train readiness：blocked repos、owner assignments、required reviews、safe next command。
- 仍然不执行 release、不替代 post-release gate。

预期评分影响：第 5 维 9.74 -> 9.82。

阶段 14 实施记录：

- 运行 artifact：`.spec/operations/release-train-packet.json`
- 人类伴随说明：`.spec/operations/release-train-packet.md`
- CLI 入口：`doctor global --write-release-train`
- Doctor 诊断：`Release Train Packet Readiness`
- Console 对象：`release_train_packet`
- North Star 场景：`release_train_packet`，任务号 `North-Star-Score-Phase-14`
- 回归保护：`tools/jispec/tests/release-train-packet.ts`，归入 `runtime-extended`
- 边界：只做本地 release train coordination；不执行 release、不替代 post-release gate、不上传源码、不替代 verify / doctor global。

## 阶段 15：Org Operations Console

目标：把阶段 11-14 的组织运营 artifact 汇成 Console 的组织运营面板，支持工程负责人看到责任、review、SLA、release train 四条线。

交付方向：

- Console read model 中新增组织运营 summary。
- Static Console 首屏展示 org ops health。
- North Star 验证组织级运营不是“实时协作系统”，而是本地可审计控制台。

预期评分影响：第 5 维 9.82 -> 9.9。

阶段 15 实施记录：

- Console read model 新增：`governance.orgOperations`
- Static Console 首屏：新增 `Org Operations` 面板，汇总 responsibility、reviews、SLA、release train 四条线
- Console JSON payload：输出 `orgOperations`
- North Star 场景：`org_operations_console`，任务号 `North-Star-Score-Phase-15`
- 回归保护：`tools/jispec/tests/org-operations-console.ts`，归入 `runtime-extended`
- 边界：只做本地静态组织运营控制台；不执行命令、不上传源码、不要求实时协作、不替代 verify / doctor global / post-release gate。
