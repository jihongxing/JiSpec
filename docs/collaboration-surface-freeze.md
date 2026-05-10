# Collaboration Surface Freeze

This page moved to [development/collaboration-surface-freeze.md](./development/collaboration-surface-freeze.md).

Use the new location for the maintained collaboration-surface freeze note.
This compatibility page stays here so older links do not break immediately.

The frozen boundary still covers `collaboration-analytics-mvp.ts`, `collaboration-awareness-mvp.ts`, `collaboration-locking-mvp.ts`, `collaboration-notifications-mvp.ts`, `conflict-resolution-mvp.ts`, and `distributed-scheduler-mvp.ts`.
These deferred surfaces rely on stable machine-readable artifacts and must not be promoted into V1 by accident.
Initial Promotion Candidates stay limited and do not include `collaboration-mvp.ts`.
The deferred set also includes `distributed-cache-mvp.ts`, `distributed-cache-invalidation-warmup.ts`, and `remote-runtime-mvp.ts`.
Promoting any deferred surface into V1 requires explicit proof, not just a label change.
Console governance export remains a promotion candidate, not a V1 surface.
The multi-repo governance aggregate also remains a promotion candidate, not a V1 surface.
These deferred surfaces stay in `runtime-extended` and out of V1 gating by design.
The frozen collaboration boundary still includes conflict resolution as a deferred capability.
