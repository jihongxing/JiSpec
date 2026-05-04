# 发布 Advisory 分层收口

日期：2026-05-04

目标：解释当前仓库 `verify` / `ci:verify` 的 advisory posture，并记录“132 个治理噪音”是如何被压回扫描边界内的。

## 当前结论

当前仓库已经通过：

- `npm run typecheck`
- `npm run ci:verify`
- `npm run post-release:gate`
- `npm run jispec-cli -- doctor mainline --json`
- `npm run jispec-cli -- doctor pilot --json`
- `npm run jispec -- north-star acceptance --json`

当前 `npm run ci:verify` 结果为：

- verdict: `WARN_ADVISORY`
- blocking: `0`
- advisory: `1`
- runtime error: `0`

唯一剩余 advisory：

| Issue code | 路径 | 说明 | 判断 |
| --- | --- | --- | --- |
| `BOOTSTRAP_SPEC_DEBT_PENDING` | `.spec/spec-debt/bootstrap-20260501T200659806Z/feature.json` | bootstrap takeover 把历史 contract area 延期到 spec debt，仍待 owner review | 历史治理债务，不是当前主线能力故障 |

这意味着当前仓库已经不再存在“扫描边界过宽导致的 advisory 洪水”。当前 release 仍是可发布状态，剩余问题只是一条明确暴露出来的 bootstrap 历史 spec debt。

## 本轮收口后的分层结果

### A. 影响真实能力：0 个

此前 3 个真实能力项已经收口：

| Issue code | 收口结果 |
| --- | --- |
| `GREENFIELD_REVIEW_SIGNAL_CONTEXT_UNEXPLAINED` | 已消失 |
| `GREENFIELD_SPEC_DRIFT_IMPLEMENTATION_MISSING` | 已消失 |
| `AGENT_DISCIPLINE_INCOMPLETE` | 已消失 |

当前 `verify` 中已经没有“产品主线能力坏了”的 advisory。

### B. 扫描边界噪音：已从 132 个压到 0 个

之前的 `132` 个 advisory 并不代表 `132` 个真实能力问题，它们主要来自：

- `tools/jispec/` 内部实现与测试 fixture
- `examples/`
- `templates/`
- `scripts/`
- `.jispec-ci/`
- `tsconfig.json`

这些路径在旧逻辑里被 static collector / ratchet 误判为当前 governed implementation surface，于是产生了大量：

- `GREENFIELD_CODE_DRIFT`
- `GREENFIELD_UNRESOLVED_SURFACE`

本轮边界压缩后，这类 repo-internal supporting paths 已降级为 advisory-only supporting metadata，不再进入当前 governed drift / unresolved candidate 池。

## 设计调整

实现位置：

- [tools/jispec/greenfield/static-collector.ts](D:/codeSpace/JiSpec/tools/jispec/greenfield/static-collector.ts)
- [tools/jispec/verify/greenfield-ratchet-collector.ts](D:/codeSpace/JiSpec/tools/jispec/verify/greenfield-ratchet-collector.ts)

本轮调整口径：

1. 为 repo-internal supporting paths 增加 advisory-only demotion
2. `isGovernedStaticFact()` 不再把这些路径视为 governed static fact
3. `GREENFIELD_UNRESOLVED_SURFACE` 不再对这些非 governed / advisory-only 路径发 issue
4. 保留 metadata，显式标记 `advisory_only: true` 和 `governance_scope: "repo_internal_supporting_path"`

这层设计的目标不是“隐藏问题”，而是把 verify 的注意力重新聚焦到真实业务治理面：

- governed contract source
- adopted implementation surface
- policy / waiver / spec debt / audit evidence
- 当前 change / release / replay 主线

## 发布口径

当前 release 可以使用下面口径：

- 发布通过：`post-release:gate` 已通过
- 主线能力状态：`north-star acceptance = 9/9`，`doctor mainline` / `doctor pilot` 通过
- verify 状态：`WARN_ADVISORY`
- advisory 拆解：`0` 个真实能力缺口，`0` 个扫描边界噪音，`1` 个历史 bootstrap spec debt

这比“还有 132 个 advisory”更接近真实状态，也更贴近业务解释。

## 后续收口顺序

当前后续工作已经不再是“继续压 repo-internal 扫描噪音”，因为这层已经完成。后续只剩两类动作：

1. 继续保持 governed scope 边界，不让 `tools/`、`examples/`、`templates/`、`scripts/`、生成产物重新回流为 drift 噪音
2. 决定如何处理剩余的 `BOOTSTRAP_SPEC_DEBT_PENDING`

第二项不是代码扫描边界问题，而是 owner 是否要：

- 审核这条历史 spec debt
- 继续延期
- 偿还并收口成 adopted contract

## 验证命令

复核当前结论时使用：

```bash
npm run typecheck
npm run ci:verify
npm run post-release:gate
npm run jispec-cli -- doctor pilot --json
npm run jispec -- north-star acceptance --json
```

## 最终判断

当前仓库不应再被描述为“还有 132 个 advisory 噪音待处理”。

更准确的判断是：

- 影响真实能力的 advisory 已清空
- 扫描边界噪音已从 `132` 个压到 `0` 个
- 当前只剩 `1` 个 bootstrap 历史 spec debt advisory
- 当前仓库已经达到“可发布、可解释、接近干净 verify posture”的状态
