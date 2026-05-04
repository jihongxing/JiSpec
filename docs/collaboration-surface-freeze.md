# Collaboration Surface Freeze

Status: P4-T2 deferred surface boundary, expanded by P13-T3 promotion contract.

This document freezes the boundary for distributed execution, collaboration, and presence work after V1. These surfaces may keep regression coverage so old experiments do not rot, but they are not V1 product promises and they must not affect V1 readiness.

The code-level contract lives in `tools/jispec/runtime/deferred-surface-contract.ts`.

## Frozen Rule

- `doctor mainline` must not include distributed, collaboration, or presence checks.
- `doctor runtime` may continue checking these surfaces as extended runtime diagnostics.
- `doctor pilot` must not treat these surfaces as pilot readiness gates; pilot readiness is a separate contract.
- Regression suites for these surfaces must stay in `runtime-extended`.
- These surfaces must not override `verify`, `ci:verify`, policy evaluation, waiver lifecycle, release compare, or implementation mediation.
- These surfaces must not become default CLI gates or release blockers until a future task explicitly promotes them.
- Console, distributed execution, collaboration, presence, notifications, analytics, and conflict resolution remain support surfaces around the mainline, not substitutes for the mainline.

## Deferred Surfaces

| Surface | Status | Allowed regression area | Allowed doctor profile | V1 readiness |
| --- | --- | --- | --- | --- |
| Distributed execution | Deferred | `runtime-extended` | `runtime` | Does not block |
| Collaboration workspace | Deferred | `runtime-extended` | `runtime` | Does not block |
| Presence awareness | Deferred | `runtime-extended` | `runtime` | Does not block |

## Regression Suites Kept

These suites are retained only as extended runtime coverage:

- `distributed-scheduler-mvp.ts`
- `distributed-cache-mvp.ts`
- `distributed-cache-invalidation-warmup.ts`
- `remote-runtime-mvp.ts`
- `collaboration-mvp.ts`
- `conflict-resolution-mvp.ts`
- `collaboration-awareness-mvp.ts`
- `collaboration-locking-mvp.ts`
- `collaboration-notifications-mvp.ts`
- `collaboration-analytics-mvp.ts`

## Promotion Rule

Promoting any deferred surface into V1 or a future stable mainline requires a new task that changes this contract, updates the stable contract, adds explicit mainline acceptance criteria, and proves the surface still preserves deterministic local verification.

`P13-T3` freezes that requirement into a hard promotion checklist. A support surface may become a required global-closure surface only if all of the following are true:

1. It has stable machine-readable artifacts.
2. It records audit evidence for meaningful actions.
3. It exposes clear owner and next-command semantics.
4. It cannot override `verify` or `ci:verify`.
5. It has dedicated North Star acceptance scenarios.
6. It preserves deterministic local-first behavior.

`doctor global` now diagnoses promotion candidates in four explicit states so promotion-readiness is not inferred from the static contract alone:

- declared contract only
- artifact missing
- artifact present but unreadable
- artifact healthy

## Initial Promotion Candidates

These are the first support surfaces allowed to be considered for promotion into the global closure loop:

| Candidate | Current role | Candidate command | Acceptance scenarios | Why it is eligible to be considered |
| --- | --- | --- | --- | --- |
| Console governance export | Support surface | `npm run jispec -- console export-governance --root . --json` | `console_source_evolution`, `doctor_global_health` | Emits a stable local governance snapshot without rescanning source. |
| Multi-repo governance aggregate | Support surface | `npm run jispec -- console aggregate-governance --dir <path> --root . --json` | `multi_repo_owner_action`, `release_compare_global_context`, `doctor_global_health` | Turns exported snapshots into drift hints and owner actions without becoming a hidden gate. This multi-repo governance aggregate is the first cross-repo promotion candidate. |

## Explicitly Deferred After P13

The following remain deferred after `P13` unless a later package proves them ready under the checklist above:

- collaboration workspace
- presence awareness
- distributed execution
- notifications
- conflict resolution

This is deliberate: global closure may expand, but support surfaces must not become accidental blockers.
