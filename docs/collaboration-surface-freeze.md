# Collaboration Surface Freeze

Status: P4-T2 deferred surface boundary.

This document freezes the boundary for distributed execution, collaboration, and presence work after V1. These surfaces may keep regression coverage so old experiments do not rot, but they are not V1 product promises and they must not affect V1 readiness.

The code-level contract lives in `tools/jispec/runtime/deferred-surface-contract.ts`.

## Frozen Rule

- `doctor v1` must not include distributed, collaboration, or presence checks.
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
