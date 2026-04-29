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

## Stable Read Model

| Artifact | Path pattern | Producer | Format | Stability | Console use |
| --- | --- | --- | --- | --- | --- |
| CI verify report | `.jispec-ci/verify-report.json` | `ci:verify` | JSON | stable machine API | CI verdict, issue counts, issue fingerprints, matched policy rules, modes, links, and provider context |
| CI verify summary | `.jispec-ci/verify-summary.md` | `ci:verify` | Markdown | human companion | Render mergeability, blockers, advisory debt, waiver effects, and next action |
| CI step summary | `.jispec-ci/ci-summary.md` | `ci:verify` | Markdown | human companion | Render provider-facing CI step summary |
| Local verify summary | `.spec/handoffs/verify-summary.md` | `verify` | Markdown | human companion | Render local verify decision digest aligned with CI language |
| Verify policy | `.spec/policy.yaml` | `policy migrate` or Greenfield init | YAML | local contract | Team profile, facts contract requirement, Greenfield review gates, and verify rules |
| Verify waivers | `.spec/waivers/*.json` | `waiver create\|revoke` | JSON | local contract | Auditable waiver lifecycle records |
| Verify baseline | `.spec/baselines/verify-baseline.json` | `verify --write-baseline` | JSON | local contract | Historical verify issue baseline |
| Current Greenfield baseline | `.spec/baselines/current.yaml` | Greenfield init and explicit baseline adoption | YAML | local contract | Current requirements, contexts, contracts, scenarios, slices, assets, and handoff refs |
| Greenfield spec debt ledger | `.spec/spec-debt/ledger.yaml` | Greenfield review workflow | YAML | local contract | Open, expired, repaid, and cancelled spec debt |
| Bootstrap spec debt records | `.spec/spec-debt/<session-id>/*.json` | `adopt --interactive` | JSON | local contract | Deferred takeover draft decisions and source evidence |
| Release baseline | `.spec/baselines/releases/<version>.yaml` | `release snapshot` | YAML | local contract | Frozen release baseline with graph, static collector, policy snapshot, and tracked assets |
| Release compare report | `.spec/releases/compare/<from>-to-<to>/compare-report.json` | `release compare` | JSON | local contract | Drift summary split into contract graph, static collector, and policy drift |
| Release compare summary | `.spec/releases/compare/<from>-to-<to>/compare-report.md` | `release compare` | Markdown | human companion | Render human release comparison summary |

## Non-Goals

- No Console UI is promised by this contract.
- No source-code upload is required.
- No Markdown artifact becomes a machine API.
- No remote Console decision may override a local blocking verify result.
- No LLM output may become a blocking gate without deterministic verification.

## Consumer Rules

Console consumers should read `.jispec-ci/verify-report.json` for current CI state, `.spec/policy.yaml` for policy posture, `.spec/waivers/*.json` for waiver lifecycle, `.spec/baselines/*` for baseline state, `.spec/spec-debt/*` for known debt, and `.spec/releases/compare/*/compare-report.json` for release drift.

When an artifact is missing, Console should display it as `not available yet` rather than synthesizing state from source code. The CLI remains responsible for producing or refreshing artifacts.
