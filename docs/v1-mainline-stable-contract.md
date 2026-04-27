# JiSpec V1 主线稳定契约

这份文档定义当前仓库对外可依赖的 V1 主线稳定契约。

它回答的是：

- 现在主线到底包含哪些命令
- 这些命令的退出码如何解释
- 会稳定写出哪些关键文件
- 哪个 JSON 面可以被脚本依赖
- `ci:verify` 会稳定产出哪些 artifacts
- 哪些能力当前明确不在 V1 主线承诺内

如果 README、roadmap、task pack 文档与本文档存在表述差异，以本文档为准。

## 1. 适用范围

当前 V1 主线固定指：

`bootstrap discover -> bootstrap draft -> adopt -> verify -> ci:verify -> change -> implement -> verify --fast/full`

本文档覆盖的稳定命令面包括：

- `bootstrap discover`
- `bootstrap draft`
- `adopt --interactive`
- `policy migrate`
- `verify`
- `ci:verify`
- `change`
- `implement`
- `doctor v1`

本文档不覆盖 legacy `slice/context/trace/artifact/agent/pipeline/template/dependency` 兼容命令面的产品语义，它们仍可用，但不属于 V1 主线稳定契约。

## 2. 主线命令

从仓库根目录运行时，推荐使用下面这些命令：

```bash
npm run jispec-cli -- bootstrap discover
npm run jispec-cli -- bootstrap draft
npm run jispec-cli -- adopt --interactive
npm run jispec-cli -- policy migrate
npm run jispec-cli -- verify
npm run jispec-cli -- verify --json
npm run jispec-cli -- verify --fast
npm run ci:verify
npm run jispec-cli -- change "Add order refund validation"
npm run jispec-cli -- change "Add order refund validation" --mode prompt
npm run jispec-cli -- change "Add order refund validation" --mode execute
npm run jispec-cli -- implement
npm run jispec-cli -- implement --fast
npm run jispec-cli -- doctor v1
```

命令职责固定为：

| 命令 | 稳定职责 |
| --- | --- |
| `bootstrap discover` | 扫描仓库并写出 bootstrap evidence graph |
| `bootstrap draft` | 基于 evidence graph 生成首批 draft bundle 和 session manifest |
| `adopt --interactive` | 对 draft 做 accept / reject / edit / skip_as_spec_debt 决策，并写入 takeover 结果 |
| `policy migrate` | 生成或规范化 `.spec/policy.yaml` |
| `verify` | 运行确定性 gate，输出四态 verdict |
| `verify --fast` | 运行本地 fast-lane precheck，必要时可自动提升回 strict 语义 |
| `ci:verify` | 运行 CI 包装层，写出 `.jispec-ci` 报告产物 |
| `change --mode prompt` | 只记录变更意图、lane 和 next commands，不自动继续执行 |
| `change --mode execute` | 尝试继续串联到 `implement -> verify`，但 strict lane 遇到未处理 bootstrap draft 时会停在 adopt 边界 |
| `implement` | 执行 strict lane 的本地实现循环，并做 post-implement verify |
| `implement --fast` | 执行 fast lane 的本地实现循环，并在 post-verify 中保留自动提升能力 |
| `doctor v1` | 只回答 V1 主线 readiness，不让 deferred surfaces 拖红 |

## 3. 退出码契约

### 3.1 通用规则

- `0` 表示当前命令按其设计完成，没有触发 blocking gate。
- `1` 表示命令失败、调用无效、实现测试失败，或出现 blocking verify verdict。

当前 V1 主线不使用更细的多值退出码。

### 3.2 各命令退出码

| 命令 | `0` 的含义 | `1` 的含义 |
| --- | --- | --- |
| `bootstrap discover` | discover 成功完成 | discover 运行失败 |
| `bootstrap draft` | draft 成功完成 | draft 运行失败 |
| `adopt --interactive` | adopt 成功完成并提交或正常结束 | adopt 运行失败、调用参数无效、交互输入不完整 |
| `policy migrate` | policy 文件生成或规范化成功 | policy migrate 失败 |
| `verify` | verdict 为 `PASS`、`WARN_ADVISORY` 或 `ERROR_NONBLOCKING` | verdict 为 `FAIL_BLOCKING`，或 verify 运行异常 |
| `verify --fast` | 同 `verify`，但执行 fast-lane 入口 | 同 `verify` |
| `ci:verify` | verify 结果不 blocking，并成功写出 CI artifacts | verify 为 `FAIL_BLOCKING`，或 wrapper 运行失败 |
| `change --mode prompt` | change session 已记录，命令级规划成功 | change 命令执行失败 |
| `change --mode execute` | 串联成功，或命令按设计停在 `awaiting_adopt` 边界 | downstream implement/tests/post-verify 失败，或 orchestration 运行异常 |
| `implement` | tests 通过，且 post-implement verify 不 blocking | tests 失败、post-implement verify 为 `FAIL_BLOCKING`，或命令运行异常 |
| `implement --fast` | 同 `implement` | 同 `implement` |
| `doctor v1` | V1 readiness 为 ready | V1 readiness 不 ready，或 doctor 运行失败 |

额外约定：

- `change --mode execute` 在 strict lane 遇到 open bootstrap draft 时，`execution.state = "awaiting_adopt"` 是设计内暂停，不算命令失败，退出码仍为 `0`。
- `verify` 的 verdict 与退出码不是一一映射的多值关系；当前只有 `FAIL_BLOCKING` 会把退出码抬到 `1`。

## 4. 关键落盘文件

### 4.1 Bootstrap 与 Adopt

| 路径 | 何时出现 | 稳定语义 |
| --- | --- | --- |
| `.spec/facts/bootstrap/evidence-graph.json` | `bootstrap discover` 后 | discover 的结构化 evidence graph 主产物 |
| `.spec/facts/bootstrap/evidence-summary.txt` | `bootstrap discover` 后 | discover 的可读摘要 |
| `.spec/sessions/<session-id>/manifest.json` | `bootstrap draft` 后 | draft / adopt session 的主状态文件 |
| `.spec/sessions/<session-id>/drafts/domain.yaml` | `bootstrap draft` 后 | domain draft |
| `.spec/sessions/<session-id>/drafts/api_spec.json` | `bootstrap draft` 后 | api draft |
| `.spec/sessions/<session-id>/drafts/behaviors.feature` | `bootstrap draft` 后 | feature draft |
| `.spec/contracts/domain.yaml` | adopt 选择 accept 或 edit 后 | 已接管 domain contract |
| `.spec/contracts/api_spec.json` | adopt 选择 accept 或 edit 后 | 已接管 api contract |
| `.spec/contracts/behaviors.feature` | adopt 选择 accept 或 edit 后 | 已接管 feature contract |
| `.spec/spec-debt/<session-id>/<artifact>.json` | adopt 选择 `skip_as_spec_debt` 后 | 暂缓接管但已登记的历史契约债务 |
| `.spec/handoffs/bootstrap-takeover.json` | adopt 产生 committed takeover 后 | takeover 汇总报告，供 verify / implement / demo 读取 |

### 4.2 Policy、Verify 与 CI

| 路径 | 何时出现 | 稳定语义 |
| --- | --- | --- |
| `.spec/policy.yaml` | `policy migrate` 后 | verify 默认读取的 policy 文件 |
| `<facts-out 指定路径>` | `verify --facts-out <path>` 后 | 当前 canonical facts snapshot |
| `.jispec-ci/verify-report.json` | `ci:verify` 后 | CI 机器可读报告主产物 |
| `.jispec-ci/ci-summary.md` | `ci:verify` 后 | CI 可读摘要主产物 |

### 4.3 Change 与 Implement

| 路径 | 何时出现 | 稳定语义 |
| --- | --- | --- |
| `.jispec/change-session.json` | `change` 后 | 当前 active change session |
| `.jispec/change-sessions/<change-session-id>.json` | successful post-implement verify 后 | 已归档的 change session |
| `.jispec/handoff/<change-session-id>.json` | implement 出现 `budget_exhausted` 或 `stall_detected` 时 | implement handoff packet |

## 5. Verify JSON 契约

`npm run jispec-cli -- verify --json` 是当前 V1 主线唯一明确对外承诺的稳定机器可读命令面。

### 5.1 顶层字段

顶层 JSON 字段顺序固定为：

1. `root`
2. `verdict`
3. `ok`
4. `exit_code`
5. `issue_count`
6. `blocking_issue_count`
7. `advisory_issue_count`
8. `non_blocking_error_count`
9. `sources`
10. `generated_at`
11. `issues`
12. `metadata`

### 5.2 顶层字段语义

| 字段 | 类型 | 语义 |
| --- | --- | --- |
| `root` | `string` | verify 所针对的仓库根目录 |
| `verdict` | `PASS \| FAIL_BLOCKING \| WARN_ADVISORY \| ERROR_NONBLOCKING` | 稳定四态 verdict |
| `ok` | `boolean` | 是否可视为 non-blocking |
| `exit_code` | `0 \| 1` | 当前 verify 命令退出码 |
| `issue_count` | `number` | 全部 issue 数量 |
| `blocking_issue_count` | `number` | blocking issue 数量 |
| `advisory_issue_count` | `number` | advisory issue 数量 |
| `non_blocking_error_count` | `number` | nonblocking runtime error 数量 |
| `sources` | `string[]` | 本次 verify 使用的 issue source 列表 |
| `generated_at` | `string` | ISO 8601 时间戳 |
| `issues` | `array` | 稳定排序后的 issue 列表 |
| `metadata` | `object` | 附加上下文，例如 facts contract、policy、baseline、waiver、observe、lane 等 |

### 5.3 Issue 字段

每个 `issues[]` 元素稳定包含：

| 字段 | 类型 | 语义 |
| --- | --- | --- |
| `kind` | `schema \| trace \| semantic \| missing_file \| unsupported \| runtime_error` | issue 类别 |
| `severity` | `blocking \| advisory \| nonblocking_error` | issue 严重级别 |
| `code` | `string` | 稳定 issue code |
| `path` | `string` 可选 | 对应文件或逻辑路径 |
| `message` | `string` | 可读说明 |
| `details` | `unknown` 可选 | 附加上下文 |

### 5.4 稳定性说明

- `verdict` 枚举值稳定。
- 顶层 key 顺序稳定。
- `issues` 会按稳定排序规则输出。
- `metadata` 是允许扩展的区域；可以新增字段，但已有语义不会被静默改写。

## 6. CI Artifacts 契约

`npm run ci:verify` 当前稳定保证的本地产物只有两类：

| 路径 | 类型 | 语义 |
| --- | --- | --- |
| `.jispec-ci/verify-report.json` | JSON | CI 机器可读验证报告 |
| `.jispec-ci/ci-summary.md` | Markdown | CI 可读摘要 |

`verify-report.json` 当前稳定包含：

- `version`
- `generatedAt`
- `verdict`
- `ok`
- `counts`
- `issues`
- `factsContractVersion`
- `matchedPolicyRules`
- `modes`
- `context`
- `links`

Provider-specific 附加产物属于“有环境时可用”的补充契约：

| 环境 | 可额外出现的文件 |
| --- | --- |
| GitHub Actions | `.jispec-ci/github-pr-comment.md` |
| GitLab CI | `.jispec-ci/gitlab-mr-note.md` |

这些 provider-specific 文件是受支持能力，但不替代 `.jispec-ci/verify-report.json` 与 `.jispec-ci/ci-summary.md` 这两个主产物。

## 7. Policy 默认路径契约

policy 默认路径固定为：

`.spec/policy.yaml`

稳定规则：

- `verify` 在该文件存在时会自动加载它。
- `policy migrate` 默认写到该路径。
- `verify --policy <path>` 可以覆盖默认路径，但这不改变默认契约。

## 8. Change / Implement 串联语义

当前主线固定支持双模式：

- `prompt`
- `execute`

稳定语义如下：

| 模式 | 稳定语义 |
| --- | --- |
| `change --mode prompt` | 只记录 change session、lane 和 next commands，不自动执行 implement |
| `change --mode execute` | 尝试自动进入 `implement -> verify`，但在 strict lane 存在 open bootstrap draft 时必须停在 adopt 边界 |

当前仓库的目标终态仍然是“以执行式串联为最终产品形态”，但在默认值切到 `execute` 之前，`prompt` 与 `execute` 会继续同时保留。

## 9. 当前明确不做什么

下面这些能力当前不属于 V1 主线稳定契约：

- `JiSpec-Console` 的完整 UI / 治理面
- 分布式执行、远程缓存、presence、多人协作的新产品承诺
- 把 LLM 直接放进 verify blocking path
- 用 legacy `slice/context` 兼容层替代主线 CLI 作为产品入口
- 为了扩展远期能力而改写当前主线退出码语义
- 把除 `verify --json` 外的所有 JSON 输出都宣称为同等级外部 API

换句话说，V1 主线当前承诺的是：

- 可以 bootstrap 一个老仓库
- 可以产生第一批可审契约草稿
- 可以 adopt / defer / reject 这些草稿
- 可以通过 verify 和 ci:verify 获得稳定 gate
- 可以通过 change / implement 完成提示式或执行式串联

它还没有承诺：

- console 级团队工作台已经完成
- distributed / collaboration / presence 已进入 V1 收口
- LLM blocking orchestration 已经成为默认 gate 路径

## 10. 相关文档

- 主线完成清单：
  [docs/v1-mainline-completion-checklist.md](/D:/codeSpace/JiSpec/docs/v1-mainline-completion-checklist.md)
- 最小接入样板：
  [docs/v1-sample-repo.md](/D:/codeSpace/JiSpec/docs/v1-sample-repo.md)
- change / implement 双模式决策：
  [docs/change-implement-mode-decision.md](/D:/codeSpace/JiSpec/docs/change-implement-mode-decision.md)
