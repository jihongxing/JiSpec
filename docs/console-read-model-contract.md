# Console Read Model Contract

Status: P4-T1 local contract prelude.

This document defines the local artifacts that a future JiSpec Console may read. It does not define a Console UI, remote execution service, or upload protocol.

Console is a read-only view over local JiSpec artifacts:

- It must not replace `verify`, `ci:verify`, policy evaluation, release compare, or any CLI gate.
- It must not require source upload. The stable read model is built from JiSpec artifacts already written under `.spec/` and `.jispec-ci/`.
- It must treat JSON, YAML, and lock files as machine-readable inputs.
- It may render Markdown companion artifacts, but must not parse Markdown as an automation contract.
- It may add remote sync later, but local artifacts remain the source of truth for the V1 mainline.

The code-level contract lives in `tools/jispec/console/read-model-contract.ts`.
The local snapshot collector lives in `tools/jispec/console/read-model-snapshot.ts`; it reads only the declared artifacts below and returns missing inputs as `not_available_yet`.
The governance dashboard shell lives in `tools/jispec/console/governance-dashboard.ts` and is exposed by `jispec-cli console dashboard`.
The governance action planner lives in `tools/jispec/console/governance-actions.ts` and is exposed by `jispec-cli console actions`.
The governance export command lives in `tools/jispec/console/governance-export.ts` and is exposed by `jispec-cli console export-governance`.

## Stable Read Model

| Artifact | Path pattern | Producer | Format | Stability | Console use |
| --- | --- | --- | --- | --- | --- |
| CI verify report | `.jispec-ci/verify-report.json` | `ci:verify` | JSON | stable machine API | CI verdict, issue counts, issue fingerprints, matched policy rules, modes, links, and provider context |
| CI verify summary | `.jispec-ci/verify-summary.md` | `ci:verify` | Markdown | human companion | Render mergeability, blockers, advisory debt, waiver effects, and next action |
| CI step summary | `.jispec-ci/ci-summary.md` | `ci:verify` | Markdown | human companion | Render provider-facing CI step summary |
| Local verify summary | `.spec/handoffs/verify-summary.md` | `verify` | Markdown | human companion | Render local verify decision digest aligned with CI language |
| Verify policy | `.spec/policy.yaml` | `policy migrate` or Greenfield init | YAML | local contract | Team profile, facts contract requirement, waiver/release/execute-default posture, Greenfield review gates, and verify rules |
| Verify waivers | `.spec/waivers/*.json` | `waiver create\|revoke` | JSON | local contract | Auditable waiver lifecycle records |
| Verify baseline | `.spec/baselines/verify-baseline.json` | `verify --write-baseline` | JSON | local contract | Historical verify issue baseline |
| Current Greenfield baseline | `.spec/baselines/current.yaml` | Greenfield init and explicit baseline adoption | YAML | local contract | Current requirements, contexts, contracts, scenarios, slices, assets, and handoff refs |
| Greenfield spec debt ledger | `.spec/spec-debt/ledger.yaml` | Greenfield review workflow | YAML | local contract | Open, expired, repaid, and cancelled spec debt |
| Bootstrap spec debt records | `.spec/spec-debt/<session-id>/*.json` | `adopt --interactive` | JSON | local contract | Deferred takeover draft decisions and source evidence |
| Release baseline | `.spec/baselines/releases/<version>.yaml` | `release snapshot` | YAML | local contract | Frozen release baseline with graph, static collector, policy snapshot, and tracked assets |
| Release compare report | `.spec/releases/compare/<from>-to-<to>/compare-report.json` | `release compare` | JSON | local contract | Drift summary split into contract graph, static collector, and policy drift |
| Release compare summary | `.spec/releases/compare/<from>-to-<to>/compare-report.md` | `release compare` | Markdown | human companion | Render human release comparison summary |
| Release drift trend | `.spec/releases/drift-trend.json` | `release compare` | JSON | local contract | Historical release drift trend across compare reports, split into contract graph, static collector, and policy drift |
| Release drift trend summary | `.spec/releases/drift-trend.md` | `release compare` | Markdown | human companion | Render human release drift trend summary |
| Multi-repo governance snapshot | `.spec/console/governance-snapshot.json` | `console export-governance` | JSON | local contract | Exported repo-level governance snapshot intended for future multi-repo aggregation |
| Multi-repo governance snapshot summary | `.spec/console/governance-snapshot.md` | `console export-governance` | Markdown | human companion | Render the exported repo-level governance snapshot summary |
| Retakeover metrics | `.spec/handoffs/retakeover-metrics.json` | retakeover regression | JSON | local contract | Single-repository takeover quality scorecard, risk notes, feature overclaim risk, and next action |
| Retakeover pool metrics | `.spec/handoffs/retakeover-pool-metrics.json` | retakeover regression pool | JSON | local contract | Pool-level takeover quality trend across real and synthetic retakeover fixtures |
| Value report | `.spec/metrics/value-report.json` | `metrics value-report` | JSON | local contract | Repo-local ROI and adoption metrics: manual sorting reduction, surfaced risks, waiver/debt aging, and execute mediation stop points |
| Implementation handoff packets | `.jispec/handoff/*.json` | `implement` | JSON | local contract | Execute/implement outcomes, stop points, replay state, next-action owner, and external handoff requests |
| Implementation patch mediation | `.jispec/implement/<session-id>/patch-mediation.json` | `implement --external-patch` | JSON | local contract | External patch scope, apply, test, and verify intake records |
| Policy approvals | `.spec/approvals/*.json` | `policy approval record` | JSON | local contract | Structured local approval decisions for policy, waiver, release drift, and execute-default changes |
| Audit event ledger | `.spec/audit/events.jsonl` | governance commands | JSONL | local contract | Append-only local audit events for approvals, exceptions, boundary changes, release comparisons, and patch intake |

## Governance Domain Objects

Console snapshot groups declared artifacts into governance objects. These are display/read-model objects, not gates:

| Governance object | Source artifacts | Missing state | Use |
| --- | --- | --- | --- |
| Policy posture | `.spec/policy.yaml` | `not_available_yet` | Show local policy presence, facts contract, team owner/reviewers, required reviewers, waiver expiration posture, release compare posture, execute-default posture, and rule count |
| Waiver lifecycle | `.spec/waivers/*.json`, `.jispec-ci/verify-report.json` | `not_available_yet` | Show active/revoked/expired/invalid waivers and latest matched/unmatched waiver posture |
| Spec debt ledger | `.spec/spec-debt/ledger.yaml`, `.spec/spec-debt/<session-id>/*.json` | `not_available_yet` | Show known Greenfield and bootstrap spec debt records |
| Contract drift | `.spec/releases/compare/<from>-to-<to>/compare-report.json`, `.spec/releases/drift-trend.json` | `not_available_yet` | Show latest machine-readable release compare drift summary and historical drift trend |
| Multi-repo export | `.spec/console/governance-snapshot.json` | `not_available_yet` | Show the exported repo-level governance snapshot for future multi-repo aggregation |
| Release baseline | `.spec/baselines/releases/<version>.yaml` | `not_available_yet` | Show frozen release baselines available for governance review |
| Verify trend | `.jispec-ci/verify-report.json`, `.spec/baselines/verify-baseline.json` | `not_available_yet` | Show current verify verdict and baseline availability without recomputing verify |
| Takeover quality trend | `.spec/handoffs/retakeover-metrics.json`, `.spec/handoffs/retakeover-pool-metrics.json`, `.spec/metrics/value-report.json` | `not_available_yet` | Show retakeover quality scorecards, value metrics, adoption trend, and next actions |
| Implementation mediation outcomes | `.jispec/handoff/*.json`, `.jispec/implement/<session-id>/patch-mediation.json` | `not_available_yet` | Show execute/implement outcomes, stop points, replayability, and patch mediation posture |
| Approval workflow | `.spec/policy.yaml`, `.spec/approvals/*.json`, `.spec/waivers/*.json`, `.spec/releases/compare/<from>-to-<to>/compare-report.json` | `not_available_yet` | Show approval missing, approval stale, or approval satisfied for policy, waiver, release drift, and execute-default changes |
| Audit events | `.spec/audit/events.jsonl` | `not_available_yet` | Show who approved or changed policy, waivers, adoption decisions, release baselines, and patch intake, with source artifact and affected contract refs |

## Audit Event Ledger

P2-T2 enables `.spec/audit/events.jsonl` as an append-only local ledger. Each line is a JSON event with:

- `version`, `id`, `type`, and `timestamp`
- `actor` and `reason`
- `sourceArtifact.path` and `sourceArtifact.kind`
- `affectedContracts`
- optional structured `details`

Current producers include policy migration, policy approval decisions, default-mode set/reset, waiver create/revoke, bootstrap adopt accept/edit/reject/defer, Greenfield review transitions, release snapshot/compare, and external patch intake. Audit events are read-model evidence only: they do not participate in blocking gates and do not override verify, policy, or release compare.

## Governance Dashboard Shell

P2-T3 adds a local read-only dashboard shell over the Console snapshot. The first screen is governance status, not a marketing page or artifact browser. It answers:

- Can this repo merge right now?
- Which waivers need attention?
- Which spec debt blocks takeover or release?
- Which contract drift needs owner review?
- Where did execute mediation last stop?
- Are policy approvals missing, stale, or satisfied?
- Who approved the latest exception or boundary change?

The dashboard reads only declared Console artifacts, does not upload source, does not run or replace `verify`, and does not synthesize missing gate results. Missing inputs remain `unknown`/`not_available_yet` until the producing CLI command writes a local artifact.

## Governance Action Planner

P2-T4 adds a read-only action planner for the governance dashboard. It generates explicit local CLI commands and decision packets for:

- revoke or renew waiver
- repay spec debt
- mark spec debt owner review
- migrate policy
- compare release drift

`jispec-cli console actions` does not execute commands and does not write artifacts. It only tells a human which local CLI command to run. The write path remains explicit and auditable through commands such as `waiver renew`, `waiver revoke`, `spec-debt repay`, `spec-debt cancel`, `spec-debt owner-review`, `policy migrate`, and `release compare`.

`jispec-cli console export-governance` writes a local repo-level governance snapshot for future multi-repo aggregation. It does not upload source, does not run verify, and does not replace any CLI gate.

## Non-Goals

- No Console UI is promised by this contract.
- No source-code upload is required.
- No Markdown artifact becomes a machine API.
- No remote Console decision may override a local blocking verify result.
- No LLM output may become a blocking gate without deterministic verification.

## Consumer Rules

Console consumers should read `.jispec-ci/verify-report.json` for current CI state, `.spec/policy.yaml` for policy posture, `.spec/waivers/*.json` for waiver lifecycle, `.spec/baselines/*` for baseline state, `.spec/spec-debt/*` for known debt, and `.spec/releases/compare/*/compare-report.json` for release drift.

When an artifact is missing, Console should display it as `not available yet` rather than synthesizing state from source code. The CLI remains responsible for producing or refreshing artifacts.

## Local Snapshot Rules

The local snapshot is a read-only aggregation surface, not a gate:

- It reads only declared JiSpec artifacts from `.spec/` and `.jispec-ci/`.
- It may parse JSON, YAML, and lock artifacts for display state.
- It may carry Markdown text for rendering, but Markdown remains display-only and is not a machine API.
- It marks missing artifacts as `not_available_yet`.
- It does not evaluate policy, override verify, synthesize gate results, scan source code, or replace any CLI command.
