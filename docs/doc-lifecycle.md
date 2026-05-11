# 文档生命周期清单

这份清单用来回答一个问题：`docs/` 里哪些文档还应该保留为主入口，哪些只是兼容页，哪些已经删除。

## 1. 直接保留

这些是日常仍然有用的主入口或当前参考：

- `docs/README.md`
- `docs/getting-started/README.md`
- `docs/user-guide/README.md`
- `docs/user-guide/policy-presets.md`
- `docs/user-guide/policy-approval-workflow.md`
- `docs/user-guide/policy-waiver-spec-debt-cookbook.md`
- `docs/reference/README.md`
- `docs/architecture/README.md`
- `docs/development/README.md`
- `docs/install.md`
- `docs/quickstart.md`
- `docs/execute-default-guide.md`
- `docs/console-governance-guide.md`
- `docs/external-coding-tool-adapters.md`
- `docs/contract-source-adapters.md`
- `docs/requirement-evolution-workflow.md`
- `docs/audit-ledger.md`
- `docs/ci-templates.md`
- `docs/integrations.md`
- `docs/privacy-and-local-first.md`
- `docs/greenfield-walkthrough.md`
- `docs/pilot-product-package.md`
- `docs/getting-started/first-takeover-walkthrough.md`
- `docs/user-guide/takeover-guide.md`
- `docs/architecture/north-star.md`
- `docs/architecture/north-star-acceptance.md`
- `docs/architecture/ide-trajectory.md`
- `docs/development/collaboration-surface-freeze.md`
- `docs/development/pilot-readiness-checklist.md`
- `docs/reference/v1-mainline-stable-contract.md`
- `docs/reference/greenfield-input-contract.md`
- `docs/reference/console-read-model-contract.md`
- `docs/reference/truth-contract-and-canonical-encoding.md`
- `docs/architecture/absolute-terminal-checklist.md`

## 2. 兼容别名

这些根目录页保留为旧链接兼容入口，正文会指向当前 canonical 文档：

- `docs/user-guide/takeover-guide.md`
- `docs/getting-started/first-takeover-walkthrough.md`
- `docs/architecture/north-star-acceptance.md`
- `docs/development/collaboration-surface-freeze.md`
- `docs/development/pilot-readiness-checklist.md`

## 3. 已删除

这些旧顶层壳文档已经清理掉，主要入口都在分区页或 reference 页：

- `docs/greenfield-input-contract.md`
- `docs/multi-repo-governance.md`
- `docs/policy-presets.md`
- `docs/policy-approval-workflow.md`
- `docs/user-guide/policy-waiver-spec-debt-cookbook.md`
- `docs/post-release-gate.md`
- `docs/architecture/north-star-gap-audit.md`
- `docs/architecture/retakeover-regression-pool.md`
- `docs/architecture/value-metrics.md`
- `docs/release-advisory-triage.md`
- `docs/value-metrics.md`
- `docs/development/provenance-traceability-adjustment-plan.md`
- `docs/development/v1-sample-repo.md`
- `docs/v1-sample-repo.md`
- `docs/development/releases/v0.1.0.md`
- `docs/development/superpowers-discipline-layer.md`

## 4. 什么时候可以删

先不要直接删兼容页。只有在满足下面条件后，才适合移除：

- `docs/README.md` 和各分区 `README.md` 已经接住主要入口流量。
- 仓库内旧路径已经没有有效引用，或者已经可以批量重写到新路径。
- 你不再需要保留旧链接兼容。

最先考虑删除的候选项，通常是第 2 类兼容页。
