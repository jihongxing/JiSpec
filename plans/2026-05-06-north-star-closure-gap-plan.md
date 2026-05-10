# JiSpec North Star Closure Gap Plan

Date: 2026-05-06

This plan turns the live `15%-20%` North Star gap into explicit execution work.

Reference audit:

- [docs/architecture/north-star-gap-audit.md](../docs/architecture/north-star-gap-audit.md)

Reference base plan:

- [2026-05-04-global-closure-v1.md](./2026-05-04-global-closure-v1.md)

## Objective

Close the remaining live gap between the current repository state and a `ready: true` North Star closeout by finishing the global-closure loop instead of adding unrelated new surfaces.

Status: complete

Completed on 2026-05-06 for the declared North Star acceptance surface and the audit follow-up hygiene tracked by this plan.

Evidence: `.spec/north-star/acceptance.json` now reports `ready: true`, `npm run jispec-cli -- doctor global --json` now reports `ready: true`, and `npm run verify -- --json` now reports `verdict: PASS`.

## Progress Update

The first closure pass on 2026-05-06 completed the following:

- `A1` complete: source delta artifacts were materialized for `change-1777833201998-l81ium`
- `A2` complete for blocking items: `REQ-ORD-001` now has explicit review history
- `A3` complete for the current blocking item: source adoption updated lifecycle and current baseline
- `C1` complete: Console governance now exposes the expected source-evolution object
- `D1` largely complete: `verify` is now advisory-only and `doctor mainline` is ready

Evidence: the intermediate live repo state had `.spec/deltas/change-1777833201998-l81ium/source-evolution.json`, `.spec/deltas/change-1777833201998-l81ium/source-review.yaml`, `verify` at `WARN_ADVISORY`, and `north-star acceptance` at `12 passed / 3 blocking`.

The second closure pass completed the remaining blockers:

- `B2` complete: release compare now surfaces actionable global-context hints, owner actions, and owner-review recommendations
- `C2` complete: the aggregate now exposes a live owner-action loop with non-zero hint/action counts
- `D2` complete: North Star acceptance now reports `15 passed / 0 blocking`
- `D2` complete: doctor global now reports `8 passed / 0 failed`

Evidence: the live repo now has `.spec/console/multi-repo-governance.json` with `contractDriftHintCount: 1` and `ownerActionCount: 1`, plus `.spec/releases/compare/v1-to-current/compare-report.json` with `1 relevant hint`, `1 relevant owner action`, and `2 owner-review recommendations`.

The final hygiene pass completed the remaining advisory and documentation-facing closure items:

- behavior contract materialized at `.spec/contracts/behaviors.feature`
- `verify` and `ci:verify` now both report `PASS`
- the unmatched active waiver was revoked and approval posture is now satisfied
- governance snapshot and aggregate were refreshed sequentially and now both reflect the cleaned posture
- `repo-group.yaml` was explicitly kept optional for the current single-repo baseline-authority fallback path instead of being added as synthetic metadata

Evidence: `.spec/console/governance-snapshot.json` now reports `verifyVerdict: PASS`, `activeWaivers: 0`, `approvalWorkflowStatus: approval_satisfied`, and `contractRefs` including `.spec/contracts/behaviors.feature`, while `.spec/console/multi-repo-governance.json` now reports `verifyVerdicts.PASS = 1`, `totalActiveWaivers = 0`, and `repoGroup.status = not_available_yet`.

## Workstream A: Source Evolution Closure

Goal:
materialize and complete the real `source refresh -> source review -> source adopt -> verify` loop in the repository itself.

### A1 Materialize Delta Workspace

- Create a current change delta workspace for the active source-governance session.
- Generate `.spec/deltas/<change-id>/source-evolution.json` and its Markdown companion through `source refresh`.
- Confirm `source diff` and `source review list` work against the resulting change.

Done when:

- `jispec-cli source refresh --change <change-id> --json` succeeds for the intended source-governance change
- the source evolution artifact path exists under `.spec/deltas/<change-id>/`
- the change is visible to source governance commands without hidden manual setup

### A2 Review Required Source Evolution Items

- Review all blocking source evolution items for the active change.
- Record explicit `adopt`, `defer`, `waive`, or `reject` decisions in `.spec/deltas/<change-id>/source-review.yaml`.
- Ensure each decision has actor, reason, and owner semantics where required.

Done when:

- `source review list` no longer leaves blocking required items in `proposed` state
- the review artifact is machine-readable and replayable

### A3 Promote Reviewed Source Truth

- Run `source adopt` after required review items are resolved.
- Update lifecycle and baseline metadata so the active source snapshot, last adopted change, and review trail align.
- Re-run `verify` and capture whether the original blocking issues are cleared or narrowed.

Done when:

- `last_adopted_change_id` is no longer `null` for the adopted source change when appropriate
- `verify` no longer reports undeclared source evolution for the addressed item set

## Workstream B: Release Compare Global Context

Goal:
make the live release compare artifacts explain drift through lifecycle and aggregate context instead of only existing structurally.

### B1 Rebuild Release Compare After Source Adoption

- Refresh `release compare` after Workstream A completes.
- Verify that the compare report now carries the global-context contract in live artifacts, not only in tests.

Done when:

- `.spec/releases/compare/*/compare-report.json` contains the declared global-context shape
- `release_compare_global_context` no longer blocks North Star acceptance

### B2 Surface Actionable Drift Explanations

- Ensure the compare report includes relevant contract drift hints, owner actions, and owner-review recommendations when source evolution is involved.
- Keep the output local-first and explanatory rather than turning release compare into a hidden gate.

Done when:

- acceptance no longer reports missing relevant hints, owner actions, or owner-review recommendations
- Status: complete
- Evidence: `.spec/releases/compare/v1-to-current/compare-report.json` now reports `1 relevant contract drift hint(s)`, `1 owner action(s)`, and `2 owner-review recommendation(s)`.

## Workstream C: Console And Multi-Repo Owner-Action Loop

Goal:
turn existing governance artifacts into action-complete closure surfaces.

### C1 Re-export Console Governance After Source Adoption

- Rebuild the local governance snapshot after source evolution artifacts exist.
- Verify the source evolution governance object includes source evolution path, source review path, representative artifact, current change state, and last adopted source change.

Done when:

- `console_source_evolution` no longer blocks North Star acceptance

### C2 Rebuild Aggregate Owner Actions

- Re-run multi-repo governance aggregation from the updated snapshot set.
- Validate that the aggregate exposes contract drift hints and explicit owner actions instead of empty counts.

Done when:

- `multi_repo_owner_action` no longer blocks North Star acceptance
- aggregate counts for hints and owner actions are non-empty when appropriate
- Status: complete
- Evidence: `.spec/console/multi-repo-governance.json` now reports `contractDriftHintCount: 1` and `ownerActionCount: 1`.

## Workstream D: Repository Self-Alignment

Goal:
make the JiSpec repo itself pass the governance path it defines for other repos.

### D1 Clear Current Verify Blockers

- Eliminate the live `GREENFIELD_PROVENANCE_ANCHOR_DRIFT` and `GREENFIELD_SOURCE_EVOLUTION_UNDECLARED` blockers through the source-governance loop instead of bypassing them.
- Re-run `verify`, `doctor mainline`, `doctor global`, and `north-star acceptance`.

Done when:

- `verify` is no longer `FAIL_BLOCKING`
- `doctor mainline --json` no longer reports the execute-default readiness blocker caused by current verify posture

### D2 Reconcile Final Acceptance Posture

- Rebuild `.spec/north-star/acceptance.json` after the preceding workstreams.
- Confirm the remaining blockers, if any, are real product gaps rather than stale artifacts.

Done when:

- `north-star acceptance --json` either reports `ready: true` or narrows to a smaller, newly evidenced gap set
- Status: complete on the declared acceptance surface
- Evidence: `.spec/north-star/acceptance.json` now reports `ready: true` and `npm run jispec-cli -- doctor global --json` now reports `ready: true`.

## Execution Order

1. `A1`
2. `A2`
3. `A3`
4. `C1`
5. `B1`
6. `C2`
7. `D1`
8. `D2`

Why this order:

- source evolution must become real before Console can explain it
- Console and source truth must exist before release compare can link back to them cleanly
- the repo should only be judged against final acceptance after the new artifacts have been rebuilt

## Current Remaining Focus

No blocker-class or advisory closure item remains open in this plan.

Evidence: `npm run verify -- --json` now reports `issue_count: 0`, `npm run jispec-cli -- policy approval status --json` now reports `status: approval_satisfied`, and `.spec/console/governance-snapshot.json` now reports `activeWaivers: 0`.

The original follow-up items tracked by this plan are complete:

1. `BOOTSTRAP_SPEC_DEBT_PENDING` was retired through an explicit cancellation record plus audit event
2. the `14` open advisory source-review reanchoring items were all adopted
3. `.spec/contracts/behaviors.feature` was materialized as the live behavior contract
4. the unmatched active waiver and approval-missing posture were reconciled

Evidence: `.spec/spec-debt/bootstrap-20260501T200659806Z/feature.json` now records `status: cancelled`, `source review list --change change-1777833201998-l81ium --json` shows all `15` items as `effectiveStatus: adopted`, `.spec/contracts/behaviors.feature` now exists, and policy approval status now shows `satisfied: 5 / missing: 0`.

The explicit remaining decision is now documented rather than left implicit:

1. `.spec/console/repo-group.yaml` remains intentionally optional and uncommitted for JiSpec's current single-repo aggregate path

Evidence: `.spec/console/multi-repo-governance.json` now reports `repoGroup.status: not_available_yet`, while still emitting `contractDriftHintCount: 1` and `ownerActionCount: 1`.

Operational attention outside this closure plan can still appear in the Console dashboard, but it is no longer counted as a North Star gap blocker:

1. the source evolution change is now reflected as `adopted` rather than still awaiting promotion
2. the retakeover regression pool metrics are now present and non-blocking
3. the latest execute mediation artifact is historical rather than an active attention signal
4. the current release compare still reports drift, but its `release_drift` approval is already satisfied and no longer keeps Console in attention state

Evidence: `npm run jispec-cli -- console dashboard --json` now reports `headline.status: ok`, `source_evolution_progress: ok`, `audit_traceability: ok`, `retakeover_pool_health: ok`, `execute_mediation_status: ok`, and `contract_drift_review: ok`.

## Immediate Next Command

No mandatory North Star closure command remains.

Optional operator follow-up:

```bash
npm run jispec-cli -- console dashboard --json
```

That command now shows only ongoing owner-review posture outside the completed closure plan.
