# JiSpec Global Closure Advancement Plan V1

Status: proposed

Date: 2026-05-04

This plan intentionally lives outside `docs/`. It is the execution plan for pushing JiSpec from an already-working mainline closure into a broader global closure:

`source evolution -> change -> implement -> verify -> console -> multi-repo -> release -> acceptance`

The plan is split into `P11`, `P12`, and `P13` so we can keep the rollout deterministic and avoid promoting support surfaces into blockers too early.

## Goal

JiSpec should reach a state where requirement evolution, contract drift, implementation mediation, governance review, cross-repo impact, release comparison, and final acceptance all belong to one explicit, auditable, replayable loop.

Global closure does not mean "everything blocks merge".

Global closure means:

- every meaningful change enters an explicit proposal path
- every proposal produces machine-readable artifacts plus human decision packets
- every open governance item has an owner and a next command
- single-repo truth and cross-repo visibility stay connected
- release and acceptance consume the same declared artifact language
- no support surface is allowed to bypass deterministic local verify

## Current Starting Point

The repository already has a strong single-repo mainline:

- `bootstrap discover -> bootstrap draft -> adopt -> verify -> change -> implement`
- Greenfield source evolution is implemented through `source refresh`, `source review`, and `source adopt`
- `verify` already distinguishes undeclared change, unreviewed change, advisory debt, and expired exceptions
- Console, multi-repo aggregation, release compare, and acceptance contracts already exist as adjacent surfaces

The current gap is not "missing core capability". The gap is that these adjacent surfaces are still only partially stitched into one end-to-end operating loop.

## Guardrails

These constraints apply to all three packages:

1. `verify` and `ci:verify` remain the deterministic merge gate.
2. Console, multi-repo, collaboration, and release surfaces may recommend actions, but must not invent truth from source code.
3. Markdown remains a human companion. JSON and YAML remain machine-readable contracts.
4. Global closure must be built by extending declared artifacts, not by introducing hidden state.
5. Deferred surfaces must not be promoted into blockers until they have stable artifact contracts, audit evidence, and explicit acceptance coverage.

## Package Ordering

The delivery order is strict:

1. `P11` closes the single-repo workflow gaps.
2. `P12` upgrades governance and aggregation from read-only adjacency into actionable closure surfaces.
3. `P13` connects release and acceptance into the same global loop, while defining the promotion contract for deferred surfaces.

---

## P11: Single-Repo Mainline Closure Hardening

### Objective

Turn the current Greenfield and change mainline into a fully explicit single-repo closure with no hidden reviewer work.

### Scope

`P11` covers:

- explicit `source diff` command surface
- unified decision packet language across source review, spec debt, waivers, implement handoff, and verify summary
- full requirement lifecycle regression coverage for `modified / deprecated / split / merged / replaced`
- tighter closure between `source evolution`, `spec delta`, `dirty graph`, and `verify`

### P11-T1 Source Diff As A First-Class CLI Surface

#### Goal

Make source evolution diff a first-class review entry point instead of requiring users to manually inspect `.spec/deltas/<change-id>/source-evolution.json` and `.md`.

#### Target files

Create:

- `tools/jispec/greenfield/source-diff.ts`
- `tools/jispec/tests/p11-source-diff.ts`

Modify:

- `tools/jispec/cli.ts`
- `tools/jispec/greenfield/source-refresh.ts`
- `tools/jispec/greenfield/source-governance.ts`
- `tools/jispec/tests/regression-runner.ts`
- `tools/jispec/tests/regression-matrix-contract.ts`

#### Command surface

Add:

```bash
jispec-cli source diff --root . --change <id|latest>
jispec-cli source diff --root . --change <id|latest> --json
```

Expected behavior:

- reads the active snapshot and proposed snapshot for the target change
- renders lifecycle-oriented diff sections:
  - added
  - modified
  - deprecated
  - split
  - merged
  - reanchored
- includes next commands for `source review adopt|reject|defer|waive`
- returns JSON that is stable enough for Console and future action planning

#### Test surface

Add contract coverage for:

- diff output with no changes
- diff output with added and modified requirements
- diff output with split and merged successor mapping
- diff output with layout-only reanchoring
- CLI text and JSON parity

#### Acceptance

- `jispec-cli source diff` exists and is discoverable in primary help text
- `source diff` can be used as the default reviewer entry point after `source refresh`
- JSON output contains enough structure for downstream action planning
- regression matrix counts are updated and frozen

### P11-T2 Unified Decision Packet Vocabulary

#### Goal

Use one shared reviewer language across source review, spec debt, waivers, implement mediation, verify summary, and Console actions.

#### Target files

Modify:

- `tools/jispec/companion/decision-sections.ts`
- `tools/jispec/greenfield/source-governance.ts`
- `tools/jispec/greenfield/spec-debt-ledger.ts`
- `tools/jispec/verify/waiver-store.ts`
- `tools/jispec/implement/handoff-packet.ts`
- `tools/jispec/ci/verify-summary.ts`
- `tools/jispec/console/governance-actions.ts`

Create:

- `tools/jispec/tests/p11-decision-packet-language.ts`

#### Required fields

Every human-facing decision packet in this package should answer:

- current state
- risk
- evidence
- owner
- next command

Optional but preferred:

- affected artifact
- expiration
- replay command

#### Test surface

Add coverage for:

- source review adopt packet
- source review defer packet
- waiver renew/revoke packet
- spec debt owner-review packet
- implement verify-blocked handoff packet
- verify summary packet

#### Acceptance

- all affected surfaces render the same five core reviewer fields
- no surface invents a custom summary vocabulary when the shared packet applies
- Console action planning can reuse these fields without special-case parsing

### P11-T3 Full Requirement Lifecycle Regression Matrix

#### Goal

Prove that requirement lifecycle changes are not only modeled in code, but fully closed through review, lifecycle registry, baseline, audit, and verify behavior.

#### Target files

Create:

- `tools/jispec/tests/p11-source-lifecycle-split.ts`
- `tools/jispec/tests/p11-source-lifecycle-merge.ts`
- `tools/jispec/tests/p11-source-lifecycle-deprecate.ts`
- `tools/jispec/tests/p11-source-lifecycle-replace.ts`

Modify:

- `tools/jispec/greenfield/provenance-drift.ts`
- `tools/jispec/greenfield/source-governance.ts`
- `tools/jispec/verify/greenfield-review-pack-collector.ts`
- `tools/jispec/tests/greenfield-source-refresh.ts`
- `tools/jispec/tests/greenfield-spec-delta-model.ts`
- `tools/jispec/tests/regression-runner.ts`
- `tools/jispec/tests/regression-matrix-contract.ts`

#### Required behaviors

- `deprecated` requirement without explicit lifecycle review remains blocking
- `split` requirement must record successor mapping
- `merged` requirement must record predecessor and merged target mapping
- `replaced` requirement must populate `replaced_by`
- expired deferred or waived lifecycle items re-block verify
- lifecycle registry, current baseline, and audit events stay synchronized

#### Test surface

Add end-to-end coverage for:

- refresh -> review adopt -> source adopt -> verify
- refresh -> review defer -> verify advisory
- refresh -> review defer expired -> verify blocking
- source evolution declared but not reviewed
- source evolution removed without successor mapping

#### Acceptance

- all five lifecycle states are exercised by repository tests
- verify emits deterministic issue codes for each broken lifecycle path
- baseline and lifecycle artifacts remain machine-readable source-of-truth surfaces

### P11 Exit Criteria

- `source diff` is shipped
- lifecycle transitions have dedicated regression coverage
- decision packet vocabulary is unified
- single-repo requirement evolution no longer depends on reviewer tribal knowledge

---

## P12: Governance And Multi-Repo Action Closure

### Objective

Upgrade Console and multi-repo aggregation from static visibility surfaces into explicit owner-action closure surfaces without letting them bypass the local gate.

### Scope

`P12` covers:

- Console visibility for source evolution and lifecycle state
- action planning that spans source review, spec debt, waivers, and release drift
- multi-repo owner loops for cross-repo contract drift hints
- a new `doctor global` profile for global readiness without polluting `doctor mainline`

### P12-T1 Console Source Evolution Governance Object

#### Goal

Make source evolution a first-class governance object inside Console instead of a hidden change-side artifact.

#### Target files

Modify:

- `tools/jispec/console/read-model-contract.ts`
- `tools/jispec/console/read-model-snapshot.ts`
- `tools/jispec/console/governance-dashboard.ts`
- `tools/jispec/console/governance-actions.ts`
- `tools/jispec/console/ui/static-dashboard.ts`

Create:

- `tools/jispec/tests/p12-console-source-evolution.ts`

#### Read-model additions

Console should expose:

- active change id
- source evolution summary
- open source review item counts
- lifecycle delta counts
- last adopted source change
- deferred and expired source evolution items

#### Actions

`console actions` should be able to emit explicit commands for:

- `source review adopt`
- `source review defer`
- `source review waive`
- `source adopt`
- `spec-debt owner-review`

#### Acceptance

- dashboard answers whether source evolution is blocking progress
- actions identify owner and next command
- local UI renders source evolution as governance state, not just raw artifact paths

### P12-T2 Multi-Repo Drift Hint To Owner-Action Loop

#### Goal

Turn cross-repo contract drift hints into explicit owner workflows instead of passive aggregate warnings.

#### Target files

Modify:

- `tools/jispec/console/multi-repo.ts`
- `tools/jispec/console/governance-export.ts`
- `tools/jispec/console/repo-group.ts`
- `tools/jispec/console/governance-actions.ts`
- `tools/jispec/integrations/contract.ts`

Create:

- `tools/jispec/tests/p12-multi-repo-owner-loop.ts`

#### Behavior

When aggregate snapshots expose cross-repo contract drift:

- the aggregate records drift hints
- the aggregate also records owner actions
- each action points to one repo as the next actor
- each action points to an explicit local command, such as:
  - `change`
  - `source refresh`
  - `release compare`
  - `console export-governance`

#### Acceptance

- multi-repo aggregate contains both drift hint and remediation action objects
- missing snapshots remain explicit and reviewable
- no cross-repo aggregate result can silently mark a repo mergeable or blocked

### P12-T3 Doctor Global Profile

#### Goal

Add a global-readiness profile that checks whether the broader closure loop is healthy, without changing the semantics of `doctor mainline`.

#### Target files

Modify:

- `tools/jispec/doctor.ts`
- `tools/jispec/cli.ts`
- `tools/jispec/runtime/deferred-surface-contract.ts`

Create:

- `tools/jispec/tests/p12-doctor-global.ts`

#### Command surface

Add:

```bash
jispec-cli doctor global
jispec-cli doctor global --json
```

#### Checks

`doctor global` should evaluate:

- single-repo mainline readiness
- source evolution governance artifact health
- Console snapshot availability
- governance export readiness
- multi-repo aggregate contract readiness
- release compare contract readiness
- North Star acceptance artifact readiness

It should not:

- replace `verify`
- treat collaboration, presence, or distributed runtime as default blockers
- synthesize missing state from source code

#### Acceptance

- `doctor mainline` remains focused on the proven mainline
- `doctor global` becomes the canonical readiness view for broader control-plane rollout
- output uses decision packet language and names blockers vs advisory gaps clearly

### P12 Exit Criteria

- Console can surface source evolution governance state
- multi-repo aggregation can assign owner actions
- `doctor global` exists and cleanly separates global posture from V1 posture

---

## P13: Release, Acceptance, And Deferred Surface Promotion Contract

### Objective

Close the loop from repository-level and multi-repo governance into release and acceptance, while defining the promotion contract for deferred surfaces so "global closure" does not become "everything is a gate".

### Scope

`P13` covers:

- release compare and release triage consuming source evolution and multi-repo context
- North Star acceptance consuming the new global closure artifacts
- a promotion contract that can elevate specific support surfaces into required global closure surfaces
- keeping collaboration and distributed work opt-in until they satisfy deterministic artifact rules

### P13-T1 Release Compare Consumes Source Evolution And Aggregate Context

#### Goal

Make release drift analysis aware of requirement lifecycle changes and upstream or downstream contract drift context.

#### Target files

Modify:

- `tools/jispec/release/baseline-snapshot.ts`
- `tools/jispec/change/impact-summary.ts`
- `tools/jispec/console/multi-repo.ts`
- `tools/jispec/ci/verify-summary.ts`

Create:

- `tools/jispec/tests/p13-release-global-context.ts`

#### Required behavior

Release compare should expose:

- source evolution artifact references
- lifecycle registry version deltas
- cross-repo contract drift hints relevant to the compared release
- owner-review recommendations when release drift aligns with unresolved source evolution

#### Acceptance

- release compare remains a declared artifact consumer
- release triage no longer ignores requirement-evolution context
- release reports stay human-readable while machine truth remains JSON and YAML

### P13-T2 North Star Acceptance Global Closure Layer

#### Goal

Extend North Star acceptance so it can verify the global closure loop, not only the existing local scenario set.

#### Target files

Modify:

- `tools/jispec/north-star/acceptance.ts`
- `docs/north-star-acceptance.md`

Create:

- `tools/jispec/tests/p13-global-closure-acceptance.ts`

#### New acceptance scenarios

Add explicit scenarios for:

- source evolution reviewed and adopted
- source evolution deferred and later repaid
- Console source evolution governance visibility
- multi-repo owner-action generation
- release compare with source evolution context
- `doctor global` artifact health

#### Acceptance

- North Star acceptance can answer whether global closure is operational
- scenario packets remain local-first artifacts
- acceptance complements but does not replace verify

### P13-T3 Deferred Surface Promotion Contract V1

#### Goal

Define a hard promotion contract for support surfaces so only mature surfaces become required parts of the global loop.

#### Target files

Modify:

- `docs/collaboration-surface-freeze.md`
- `tools/jispec/runtime/deferred-surface-contract.ts`
- `tools/jispec/doctor.ts`

Create:

- `tools/jispec/tests/p13-deferred-surface-promotion.ts`

#### Promotion rules

A deferred surface may move from support surface to required global-closure surface only if:

1. it has stable machine-readable artifacts
2. it records audit evidence for meaningful actions
3. it has clear owner and next-command semantics
4. it cannot override `verify` or `ci:verify`
5. it has dedicated acceptance scenarios
6. it preserves deterministic local-first behavior

#### Initial promotion target

The first promotion candidates should be:

- Console governance export
- multi-repo governance aggregate

The following remain deferred after `P13` unless a later package proves them ready:

- collaboration workspace
- presence awareness
- distributed execution
- notifications
- conflict resolution

#### Acceptance

- the repository has a written and test-backed rule for promoting support surfaces
- global closure can expand deliberately without turning soft surfaces into accidental blockers

### P13 Exit Criteria

- release compare consumes source evolution and aggregate context
- North Star acceptance can score the global closure path
- deferred surface promotion is explicit, audited, and testable

---

## Regression Matrix Strategy

Each package must register its own suites in `tools/jispec/tests/regression-runner.ts` and update `tools/jispec/tests/regression-matrix-contract.ts`.

Recommended area mapping:

- `P11` -> `change-implement` plus `runtime-extended` where the artifact is a support surface around the mainline
- `P12` -> `runtime-extended`
- `P13` -> `runtime-extended` plus any acceptance-specific bucket already used by North Star acceptance

No package may land without frozen expected counts.

## Definition Of Done For Global Closure V1

Global closure V1 is complete when all of the following are true:

- a source document change can be refreshed, diffed, reviewed, adopted, and verified without hidden reviewer steps
- Console can explain open source evolution, debt, waivers, and next owner actions from declared artifacts
- multi-repo aggregation can expose cross-repo drift and emit explicit remediation actions
- release compare can explain drift in terms of lifecycle and aggregate context
- North Star acceptance can validate the end-to-end global closure loop
- no support surface can silently bypass deterministic local verification

## Recommended Delivery Sequence

1. Land `P11-T1` and `P11-T3` first.
2. Then land `P11-T2` to normalize reviewer language.
3. Ship `P12-T1` before `P12-T2`, because Console needs source evolution as a first-class governance object before cross-repo action loops are worth promoting.
4. Land `P12-T3` only after the new artifacts are stable enough to diagnose.
5. Land `P13-T1` before `P13-T2`, because acceptance should consume real global-closure artifacts, not placeholders.
6. Land `P13-T3` last, so the promotion contract is written against proven surfaces rather than aspirational ones.

## Immediate Next Step

If execution starts from this plan, the first implementation package should be:

- `P11-T1 Source Diff As A First-Class CLI Surface`

That package has the best leverage because it closes the most visible command-surface gap while improving reviewer ergonomics without changing gate semantics.
