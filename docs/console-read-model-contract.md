# Console Read Model Contract

This page moved to [reference/console-read-model-contract.md](./reference/console-read-model-contract.md).

Use the new location for the maintained Console read-model contract.
This compatibility page stays here so older links do not break immediately.
Console is a read-only view over local JiSpec artifacts.
It must not replace `verify`, `ci:verify`, policy evaluation, release compare, or any CLI gate.
It must not require source upload.

The maintained contract still treats `.spec/console/multi-repo-governance.json` as the source of truth and `.spec/console/multi-repo-governance.md` as the human-readable companion.
The read model still includes `.jispec-ci/verify-report.json` as a declared machine artifact.
The read model also includes `.jispec-ci/verify-summary.md` as a declared human-readable companion.
The read model also includes `.jispec-ci/ci-summary.md` as a declared human-readable companion.
The read model also includes `.spec/handoffs/verify-summary.md` as a declared human-readable companion.
The read model also includes `.spec/policy.yaml` as a declared governance artifact.
The read model also includes `.spec/waivers/*.json` as declared governance artifacts.
The read model also includes `.spec/baselines/verify-baseline.json` as a declared governance artifact.
The read model also includes `.spec/baselines/current.yaml` as a declared governance artifact.
The read model also includes `.spec/deltas/<change-id>/source-evolution.json`, `.spec/deltas/<change-id>/source-review.yaml`, `.spec/requirements/lifecycle.yaml`, `.spec/spec-debt/ledger.yaml`, `.spec/ambiguity-debt/ledger.json`, `.spec/spec-debt/<session-id>/*.json`, `.spec/baselines/releases/<version>.yaml`, `.spec/releases/compare/<from>-to-<to>/compare-report.json`, `.spec/releases/drift-trend.json`, `.spec/console/governance-snapshot.json`, `.spec/handoffs/retakeover-metrics.json`, `.spec/handoffs/retakeover-pool-metrics.json`, `.spec/metrics/value-report.json`, `.jispec/change-session.json`, `.jispec/handoff/*.json`, `.jispec/implement/<session-id>/patch-mediation.json`, `.jispec/implement/<session-id>/patch-mediation.md`, `.spec/north-star/acceptance.json`, `.spec/north-star/scenarios/*.json`, `.spec/doctor/global-readiness.json`, `.spec/approvals/*.json`, and `.spec/audit/events.jsonl` as declared governance artifacts.
The read model also includes `.spec/releases/compare/<from>-to-<to>/compare-report.md`, `.spec/releases/drift-trend.md`, `.spec/console/governance-snapshot.md`, `.jispec/implement/<session-id>/patch-mediation.md`, `.spec/north-star/acceptance.md`, and `.spec/north-star/scenarios/*-decision.md` as declared human-readable companions.
