# C8 Demo Record: ReMirage 真实旧仓库接管

这份记录是 `C8. 做一次真实旧仓库接管演示记录` 的第二个正式落地结果。

执行日期：

- `2026-04-27`

目标仓库：

- [ReMirage](/D:/codeSpace/ReMirage)

执行仓库：

- [JiSpec](/D:/codeSpace/JiSpec)

## 1. 为什么选这个仓库

`ReMirage` 比 `BreathofEarth` 更难，也更适合做第二次真实接管演示，因为它同时满足：

- 是真实多组件 monorepo，而不是单一应用仓库
- 同时包含 `TypeScript + Go + Proto + deploy assets + docs + SDK`
- 有明显的控制平面、数据平面、客户端、CLI、SDK 多边界结构
- 仓内存在大量第三方审计产物，会强烈干扰 discover/draft 的排序结果

从 [README.md](/D:/codeSpace/ReMirage/README.md)、[docs/governance/README.md](/D:/codeSpace/ReMirage/docs/governance/README.md) 和 [docs/protocols/README.md](/D:/codeSpace/ReMirage/docs/protocols/README.md) 可以确认，这不是一个“单点代理工具”，而是一套面向复杂网络环境的基础设施系统，核心目标是：

- 更稳定
- 更低可识别性
- 更容易恢复
- 更适合团队化统一管理

它的关键组件也天然比上一份样本更复杂：

- `mirage-os/`
- `mirage-gateway/`
- `phantom-client/`
- `mirage-cli/`
- `sdk/`
- `deploy/`

这使它非常适合验证另一条更强的产品命题：

即使面对“多组件 + 多语言 + 多真相源 + 大量噪声”的老仓库，JiSpec 能不能仍在几分钟内拉出第一批可接管契约草稿。

## 2. 开始前状态

执行前在 [ReMirage](/D:/codeSpace/ReMirage) 里运行 `git status --short`，结果为空。

这说明：

- 仓库起点是干净的
- 本次接管新增的 `.spec/` 与 `.jispec-ci/` 都是 JiSpec 主线运行后的结果
- 这份演示更容易隔离“工具写入了什么”

## 3. 实际执行命令

以下命令都是从 [JiSpec](/D:/codeSpace/JiSpec) 仓库根目录运行，并显式指向 [ReMirage](/D:/codeSpace/ReMirage)：

```bash
node --import tsx ./tools/jispec/cli.ts bootstrap discover --root D:\codeSpace\ReMirage --json
node --import tsx ./tools/jispec/cli.ts bootstrap draft --root D:\codeSpace\ReMirage --json
node --import tsx ./tools/jispec/cli.ts adopt --root D:\codeSpace\ReMirage --session bootstrap-20260427T070552969Z --interactive --json
node --import tsx ./tools/jispec/cli.ts policy migrate --root D:\codeSpace\ReMirage --json
node --import tsx ./tools/jispec/cli.ts verify --root D:\codeSpace\ReMirage --json --facts-out .spec/facts/verify/remirage-facts.json
node --import tsx ./scripts/check-jispec.ts --root D:\codeSpace\ReMirage
```

## 4. Bootstrap Discover 结果

`bootstrap discover` 成功在 [ReMirage](/D:/codeSpace/ReMirage) 上写出了第一层证据图：

- [evidence-graph.json](/D:/codeSpace/ReMirage/.spec/facts/bootstrap/evidence-graph.json)
- [evidence-summary.txt](/D:/codeSpace/ReMirage/.spec/facts/bootstrap/evidence-summary.txt)

关键统计：

- `17` 条 route candidate
- `1` 条高置信 route
- `2946` 个测试资产
- `5` 个 schema asset
- `6` 个 migration
- `137` 个文档信号
- `26` 个 manifest
- `7634` 个 source file inventory

唯一高置信 route 是：

- `GET /health`

这组数字很关键，因为它一眼就说明：这个仓库的 discover 并不是“轻松抓出一堆清晰 API”，而是在非常嘈杂的证据环境里工作。

### 本次暴露出的主要噪声

最严重的问题不是缺少信号，而是噪声太强。

被高权重拉进 discover/draft 的典型样本包括：

- `artifacts/dpi-audit/.pydeps/sklearn/externals/array_api_compat/README.md`
- `artifacts/dpi-audit/.pydeps/sklearn/externals/array_api_extra/README.md`
- `artifacts/dpi-audit/.pydeps/pandas/pyproject.toml`

这意味着：

- 第三方依赖镜像被当成了高权重文档信号
- 审计目录里的 vendored files 被当成了高权重源码与 manifest 信号
- 真正的系统边界容易被 `audit artifact gravity` 稀释

这正是 `ReMirage` 比上一个样本更难的地方。

## 5. Bootstrap Draft 结果

`bootstrap draft` 仍然成功生成了第一批可审草稿：

- [draft domain](/D:/codeSpace/ReMirage/.spec/sessions/bootstrap-20260427T070552969Z/drafts/domain.yaml)
- [draft api_spec](/D:/codeSpace/ReMirage/.spec/sessions/bootstrap-20260427T070552969Z/drafts/api_spec.json)
- [draft behaviors](/D:/codeSpace/ReMirage/.spec/sessions/bootstrap-20260427T070552969Z/drafts/behaviors.feature)
- [draft manifest](/D:/codeSpace/ReMirage/.spec/sessions/bootstrap-20260427T070552969Z/manifest.json)

本次 draft 运行模式：

- `providerName = deterministic-fallback`
- `generationMode = deterministic`

原因同样很真实：

- 目标仓库没有 `jiproject/project.yaml`
- JiSpec 走了本地 deterministic fallback

这说明本次演示不是依赖额外 AI 配置“喂出来”的，而是在 V1 当前主线下完成的。

### 草稿质量判断

这批草稿仍然是“有价值，但明显需要人类纠偏”的首稿。

有价值的地方：

- 至少抓住了真实控制平面入口 `GET /health`
- 成功把 `proto` 文件、控制器文件和核心文档纳入了同一批草稿证据
- 能把 `Mirage OS / Gateway / Client / Proto` 这些长期稳定边界先拉进候选集

不够好的地方：

- route 识别非常弱，绝大多数 controller surface 仍然是 `UNKNOWN`
- domain 首稿被 audit artifacts 严重带偏
- feature 首稿更像 controller inventory，而不是可演示的行为契约
- manifest/document ranking 明显过度受第三方依赖镜像影响

所以这次 draft 的真实结论不是“自动草稿已经足够直接上线”，而是：

它已经足够让人类从“零起草全部契约”，降级为“快速重锚第一批最关键契约”。

## 6. Adopt 决策

本次接管采取的是非常明确的“强纠偏接管”策略，而不是盲目接受首稿。

最终决策：

| Artifact | 决策 | 理由 |
| --- | --- | --- |
| `domain` | `edit` | 首稿被审计产物噪声带偏，需要人工改写成真实组件边界 |
| `api` | `edit` | 自动 route 提取太弱，需要人工改写为控制平面表面与 proto-backed seam |
| `feature` | `skip_as_spec_debt` | 首稿更像 inventory，不足以充当真正的行为契约 |

### Domain 的人工改写

最终接管后的 domain contract 是：

- [domain.yaml](/D:/codeSpace/ReMirage/.spec/contracts/domain.yaml)

它把仓库重新锚定到：

- `mirage_os_control_plane`
- `mirage_gateway_data_plane`
- `phantom_client_access_plane`
- `mirage_cli_operations_surface`
- `sdk_and_proto_integration_surface`

并把真实边界写回到 bounded contexts：

- `control_plane_governance_and_state`
- `gateway_transport_and_strategy_execution`
- `client_access_and_session_resilience`
- `protocol_truth_source_and_message_contracts`
- `deployment_security_and_audit`

这一步证明：即使首稿被噪声污染，只要人类能在几分钟内把它重新锚回真实边界，Bootstrap 的产品价值仍然成立。

### API 的人工改写

最终接管后的 API contract 是：

- [api_spec.json](/D:/codeSpace/ReMirage/.spec/contracts/api_spec.json)

它没有继续把第三方 audit artifacts 当成“接口真相”，而是改写成围绕下列真实表面的第一批可审契约：

- `/health`
- `gateways`
- `cells`
- `domains`
- `sessions`
- `threats`
- `billing`
- `auth / users / audit`

并明确把协议真相锚定到：

- [mirage-os/api/proto/gateway.proto](/D:/codeSpace/ReMirage/mirage-os/api/proto/gateway.proto)
- [mirage-os/api/proto/cell.proto](/D:/codeSpace/ReMirage/mirage-os/api/proto/cell.proto)
- [mirage-os/api/proto/billing.proto](/D:/codeSpace/ReMirage/mirage-os/api/proto/billing.proto)
- [mirage-proto/mirage.proto](/D:/codeSpace/ReMirage/mirage-proto/mirage.proto)

### Feature 延后为 Spec Debt

本次没有硬收 feature，而是把它延后成 spec debt：

- [feature.json](/D:/codeSpace/ReMirage/.spec/spec-debt/bootstrap-20260427T070552969Z/feature.json)

原因很明确：

- 它仍然像 route candidate review
- 它没有形成“控制平面治理 / 网关策略执行 / 客户端恢复”这些真正可演示的行为故事

这不是流程失败，而是流程忠实暴露了当前 draft synthesis 的真实上限。

### Adopt 落盘结果

接管后写出的关键产物：

- [adopted domain](/D:/codeSpace/ReMirage/.spec/contracts/domain.yaml)
- [adopted api contract](/D:/codeSpace/ReMirage/.spec/contracts/api_spec.json)
- [deferred feature spec debt](/D:/codeSpace/ReMirage/.spec/spec-debt/bootstrap-20260427T070552969Z/feature.json)
- [bootstrap takeover report](/D:/codeSpace/ReMirage/.spec/handoffs/bootstrap-takeover.json)

takeover report 说明：

- 已接管：`domain + api`
- 已延后：`feature`
- 没有 reject

## 7. Verify 与 CI Gate 结果

### Verify 结果

机器可读输出：

- [verify facts](/D:/codeSpace/ReMirage/.spec/facts/verify/remirage-facts.json)

本次 `verify --json` 结果是：

- `verdict = WARN_ADVISORY`
- `exit_code = 0`
- `issue_count = 8`
- `blocking_issue_count = 0`
- `advisory_issue_count = 8`

8 条 advisory 的组成是：

1. 历史协议债务

- 缺失 `jiproject/project.yaml`
- 缺失 `schemas/context.schema.json`
- 缺失 `schemas/contracts.schema.json`
- 缺失 `schemas/project.schema.json`
- 缺失 `schemas/slice.schema.json`
- 缺失 `schemas/tasks.schema.json`
- 缺失 `schemas/trace.schema.json`

2. 当前有意延后的行为契约

- `BOOTSTRAP_SPEC_DEBT_PENDING`

最关键的结论不是“没有问题”，而是：

- 没有 blocking issue
- 已接管的 `domain` 与 `api` 没有被 verify 打死
- 历史债务与本轮延后项被稳定识别成 advisory

这正是 Verify takeover-aware 语义在真实复杂仓库上的证据。

### CI Wrapper 结果

`ci:verify` 同样成功通过：

- `JiSpec Verify: WARN_ADVISORY`
- `exit code = 0`

CI 产物：

- [verify-report.json](/D:/codeSpace/ReMirage/.jispec-ci/verify-report.json)
- [ci-summary.md](/D:/codeSpace/ReMirage/.jispec-ci/ci-summary.md)

这说明：

- V1 主线不是只在本地 CLI 上成立
- 它已经可以把真实老仓库的第一次接管结果交给 CI gate

## 8. 本次演示证明了什么

### 已被证明成立的部分

1. `Bootstrap` 的 Aha Moment 在更难的仓库上仍然成立

`ReMirage` 不是整洁样板，而是噪声很重的真实 monorepo。
即便如此，JiSpec 仍然在几分钟内给出了第一批可接管的 `domain/api/feature` 草稿。

2. 人类纠偏成本仍显著低于“从零写规范”

这次真正的工作不是手写所有 contract，而是：

- 重写 domain
- 重写 api
- 延后 feature

这已经足以让仓库进入可验证状态。

3. Verify 能区分“历史债务”“延后契约”和“当前 blocking breakage”

这一点在 `ReMirage` 上尤其重要，因为它的历史缺口和噪声都比上一份样本更大。

4. CI-native gate 也能承接这类真实接管结果

不是只有 fixture 通过，而是复杂真实仓库也能进入 `WARN_ADVISORY / exit 0` 的稳定门禁态。

### 仍然暴露出的关键弱点

1. Discover 需要更强的排除规则

至少应更积极忽略：

- `artifacts/dpi-audit/`
- 第三方依赖镜像目录
- 明显不是仓库主产品面的 vendored README / manifest / test trees

2. Draft 需要更强的 domain re-anchoring

当前聚类仍过度受海量第三方文件数量支配，不够面向“系统边界接管”。

3. Feature synthesis 仍然不够像行为契约

它更像：

- route-backed checklist
- controller inventory

而不够像：

- 控制平面治理流程
- 网关策略执行与切换
- 客户端接入与恢复故事

4. API 提取仍依赖人工把 controller surface 提升成契约表面

这次能完成接管，是因为人类可以快速重锚，并不是因为 route extractor 已经非常强。

## 9. 对 ReMirage 的下一步建议

如果要继续把这次接管推进成长期可维护 contract surface，建议按下面顺序做：

1. 优先补 `jiproject/project.yaml`

这样可以消掉 `HISTORICAL_FILE_MISSING`，并为未来 provider 配置保留入口。

2. 把 feature 从 spec debt 提升成真正行为契约

优先不该继续写 controller inventory，而应写这类故事：

- 控制平面接管节点与策略下发
- Gateway 在复杂网络中的切换、保活与恢复
- Phantom Client 的接入、会话保持与失败恢复

3. 加强 bootstrap discover 的噪声过滤

尤其要压制：

- `artifacts/dpi-audit/.pydeps/**`
- vendored `README.md`
- 审计镜像中的 `pyproject.toml` / `go.mod` / 伪测试树

4. 让 API draft 更明确区分“真实 endpoint”与“模块级 surface inference”

这样在复杂 monorepo 上，首稿会更像真正的第一版接口契约，而不是半路由半文件列表。

## 10. 结论

这次 `ReMirage` 演示可以视为 `C8` 的强化版完成，因为它已经提供了：

- 一个比上一份更复杂、更脏的真实旧仓库样本
- 一次完整的 `discover -> draft -> adopt -> policy migrate -> verify -> ci:verify` 记录
- 一条清晰的“噪声很重，但仍能快速接管第一批契约”的证据链
- 一份对 discover/draft 当前弱点更直接的暴露

如果要用一句话总结这次演示：

JiSpec 已经能把 `ReMirage` 这种多组件、混合语言、审计产物严重污染的真实老仓库，从“必须先手写规范才能开始使用”，降低成“先自动拉出第一批草稿，再由人类快速重锚 domain/api，并把行为契约安全延后到 spec debt”。这说明 V1 的 Aha Moment 不只在轻量样本上成立，在更难的旧仓库上也成立。
