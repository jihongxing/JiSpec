# North Star Acceptance

`jispec north-star acceptance` writes a local final acceptance package for the North Star closeout. It gathers existing JiSpec artifacts into one machine-readable aggregate and one human decision packet per scenario.

This is the final local acceptance surface for the project. It is local-only and does not replace `verify`, `ci:verify`, `doctor mainline`, `doctor runtime`, `doctor pilot`, or `post-release:gate`.

This acceptance now has two layers:

- current closeout acceptance for the contract-driven delivery pipeline
- current closeout extension for the completed Change Kernel stack

```bash
npm run jispec -- north-star acceptance --root .
npm run jispec -- north-star acceptance --root . --json
```

## Scenario Suite

The `north-star acceptance` suite covers:

- legacy takeover
- Greenfield
- daily change
- external patch mediation
- policy waiver
- release drift
- Console governance
- multi-repo aggregation
- privacy report
- source evolution reviewed and adopted
- source evolution deferred and later repaid
- Console source evolution governance visibility
- multi-repo owner-action generation
- release compare with source evolution context
- doctor global artifact health
- mainline recovery drill
- global operations packet
- org responsibility graph
- async review inbox
- ops aging ledger
- release train packet
- org operations console

## Current Score Snapshot

As of 2026-05-22, the implemented North Star score optimization phases 1-15 put the repository at this release-readiness posture:

| Dimension | Original score | Current score | Evidence surface |
| --- | ---: | ---: | --- |
| Mainline delivery loop | 9.5 | 9.8 | `Mainline Flow Recovery`, `Mainline Recovery Drill`, `doctor mainline` recovery summary |
| Deterministic gates | 9.5 | 9.8 | `Verify Gate Coverage`, `Verify Gate Gap Ledger`, `verify` metadata and CI summaries |
| Retakeover and contract generation quality | 8.0 | 9.5 | `Retakeover Benchmark Pool`, `Retakeover Realism Ladder`, correction budget evidence |
| Governance and observability | 8.8 | 9.6 | Console Decision Deck, Console Runbook Mode, static Console JSON and HTML |
| Multi-person / org operations system | 6.0 | 9.85 | global operations packet, responsibility graph, async review inbox, SLA aging ledger, release train packet, org operations console |

The average score moved from `8.36` to `9.71`. This is not a claim that JiSpec is a remote realtime collaboration platform. The score reflects the current local-first, auditable control plane: artifacts, owner actions, runbooks, doctor summaries, Console summaries, and deterministic regression coverage.

For the v0.1.2 closeout, `verify` and `ci:verify` are clean `PASS` results with `0` blocking issues, `0` advisory issues, and `0` unresolved gate gaps. The full `post-release:gate` baseline is `173 suites / 800 tests`.

## Pre-release Validation

Before cutting a release from the current line, run these checks from the repository root:

```bash
npm run build
node --import tsx ./tools/jispec/tests/north-star-acceptance.ts
node --import tsx ./tools/jispec/tests/regression-runner.ts --area retakeover-regression-pool
node --import tsx ./tools/jispec/tests/regression-runner.ts --area verify-ci-gates
node --import tsx ./tools/jispec/tests/regression-runner.ts --area change-implement
node --import tsx ./tools/jispec/tests/regression-runner.ts --area runtime-extended
```

Release-blocking interpretation:

- `npm run build` must pass.
- `north-star-acceptance` must pass all tests because it protects the closeout scenario contract.
- `retakeover-regression-pool` must pass because it protects the takeover-quality score and realism ladder.
- `verify-ci-gates` must pass because it protects deterministic merge and CI gate behavior.
- `change-implement` must pass because it protects the mainline recovery and implementation mediation loop.
- `runtime-extended` must pass before a release that advertises Console, global closure, or org operations evidence.

Optional but recommended release artifacts:

```bash
npm run jispec -- north-star acceptance --root .
npm run jispec -- doctor mainline --root .
npm run jispec -- doctor global --root .
npm run pilot:ready
```

These commands refresh the human-readable closeout and readiness surfaces. They still do not replace `verify`, `ci:verify`, doctor profiles, or `post-release:gate`.

其中 `release drift` 场景现在不仅检查 drift trend artifact 是否存在，还会把 requirement evolution 的治理证据一起挂出来，包括：

- lifecycle registry path / version
- active source snapshot id
- last adopted source change id
- source evolution / source review artifact

这样它表达的是“这次 release drift 背后是否存在已治理的需求迁移”，而不是单纯存在一个 compare 报告。

## Global Closure Layer

`P13-T2` 把 `north-star acceptance` 从“本地主链收尾清单”扩成“global closure 是否真的运转”的验收层。

新增的 global closure 场景会显式检查：

- source review 是否真的 adopt 并回写到了 lifecycle 语义
- deferred source review 是否留下了可追溯、可偿还、已偿还的历史
- Console 是否能把 source evolution governance 讲清楚
- multi-repo aggregate 是否真的生成 owner actions
- multi-repo aggregate 是否显式达到 phase-2 promotion readiness，而不是只存在一个 aggregate 文件
- release compare 是否消费了 source evolution 与 aggregate context
- doctor global 依赖的 artifact 链是否健康
- global operations packet 是否把 repo group topology、cross-repo contract refs、owner action lifecycle、promotion readiness、privacy posture、audit evidence refs 和 verify boundary 打包成可传递的本地运营证据

这些场景仍然只消费本地 artifact，不替代 `verify`、`ci:verify`、`doctor mainline/runtime/pilot` 或 `post-release:gate`。换句话说，acceptance complements but does not replace verify.

`multi_repo_owner_action` 和 `doctor_global_health` 会读取 `.spec/console/multi-repo-governance.json` 中的 `promotionReadiness`。这让 Phase 2 的判断从“有 owner action”提升为“repo group、cross-repo refs、owner-action lifecycle、verify 边界和 dedicated acceptance coverage 都可被机器验证”。

`global_operations_packet` 会读取 `.spec/operations/global-operations-packet.json`。这个场景必须证明 packet 是 local read-only evidence：不上传源码、不要求实时协作、不执行命令、不替代 verify 或 doctor global，并且 deferred collaboration surfaces 继续保持 diagnostic-only。

`org_responsibility_graph` 会读取 `.spec/operations/org-responsibility-graph.json`。这个场景必须证明组织运营责任链已经显式化：repo 归属 team，owner action 归属 owner/reviewer/escalation path，并且 graph 仍然只是 local read-only evidence，不上传源码、不要求实时协作、不执行命令、不替代 verify 或 doctor global。

`async_review_inbox` 会读取 `.spec/operations/async-review-inbox.json`。这个场景必须证明 reviewer 队列、pending/accepted/blocked/expired 状态和升级路径都来自本地 artifact；它不能要求实时协作服务、不能发送远程通知、不能执行命令，也不能替代 verify 或 doctor global。

`ops_aging_ledger` 会读取 `.spec/operations/ops-aging-ledger.json`。这个场景必须证明 SLA aging bucket（fresh、due-soon、overdue、escalated）和 escalation path 覆盖来自本地 artifact；它不能要求实时协作、不能执行命令、不能替代 verify 或 doctor global。

`release_train_packet` 会读取 `.spec/operations/release-train-packet.json`。这个场景必须证明 multi-repo promotion、release compare global context、owner assignments、required reviews、SLA aging 和 safe next command 已经汇成一个本地 release train coordination packet；它不能执行 release、不能替代 post-release gate、不能上传源码，也不能替代 verify 或 doctor global。

`org_operations_console` 会读取 Console read model 中的 `orgOperations` summary 和 `.spec/console/ui/index.html`。这个场景必须证明组织运营控制台把责任、review、SLA、release train 四条线汇总到本地静态 Console 首屏；它不能要求实时协作，不能执行命令，不能上传源码，也不能替代 verify、doctor global 或 post-release gate。

## Change Kernel Closeout Extension

The acceptance story now also proves these higher-order capabilities as part of the current closeout checks, without replacing the contract-driven delivery pipeline story:

- `change` remains the only semantic ingress
- `MBM` normalizes external mutation into change hypotheses
- `Ambiguity Debt` preserves unresolved reality without polluting committed truth
- `IPL` keeps all outputs traceable to a canonical `change_id`
- `KTM` produces deterministic state transitions and atomic commits
- `Execution Fork Governance Layer` resolves canonical execution traces

These are now current acceptance claims because the code and artifacts support them. They extend, rather than replace, the same north-star line.

Each scenario writes:

- `.spec/north-star/scenarios/<scenario>.json`
- `.spec/north-star/scenarios/<scenario>-decision.md`

The aggregate writes:

- `.spec/north-star/acceptance.json`
- `.spec/north-star/acceptance.md`

## Boundary

This suite is local-only. It does not upload source, does not use an LLM as a blocking decision source, and does not replace `verify`, `ci:verify`, `doctor mainline`, `doctor runtime`, `doctor pilot`, or `post-release:gate`.

The suite proves the closeout claims by checking existing local artifacts for verifiability, auditability, blocking behavior, replayability, local-first operation, and controlled external-tool intake.
