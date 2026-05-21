# Retakeover Regression Pool

## Purpose

The retakeover regression pool is the benchmark layer for JiSpec's takeover quality work.
It measures whether the repository can produce stable, reviewable takeover packets across a mixed set of real and synthetic legacy shapes.

The pool exists to answer a narrow question:

> Are the discover, draft, adopt, and verify surfaces good enough to support repeatable takeover quality scoring?

## What It Measures

The pool records:

- takeover readiness score
- contract signal precision
- behavior evidence strength
- adopt correction load
- feature overclaim risk
- verify safety
- class coverage across known repository shapes
- benchmark readiness for the phase-1 target
- realism ladder readiness for the phase-6 target

## Phase-1 Benchmark Target

Phase 1 treats the pool as ready when all of the following are true:

- at least 10 fixtures have stable scores
- all known fixture classes are covered
- all fixtures are non-blocking
- the quality baseline thresholds are satisfied
- the pool produces stable summary artifacts and human-readable scorecards

The benchmark layer remains local-only and does not upload source or replace `verify`, `ci:verify`, `doctor mainline`, `doctor global`, or `north-star acceptance`.

## Phase-6 Realism Ladder

Phase 6 upgrades the benchmark pool from fixture-class coverage to realism-class correction budgets.

The ladder groups takeover fixtures into:

- `simple_service`
- `monolith`
- `polyglot_service`
- `legacy_with_generated_noise`
- `weak_documentation`

Each class has an explicit correction budget:

- minimum fixture count
- minimum stable-scored fixture count
- accepted-without-edit floor
- edited draft ceiling
- deferred spec debt ceiling
- feature overclaim risk ceiling
- evidence noise ceiling
- takeover readiness floor

The machine contract lives at `coverage.realismLadder` inside `.spec/handoffs/retakeover-pool-metrics.json`.
It records `phase: north-star-score-optimization-phase-6`, readiness, per-class budget status, owner action, next command, and score impact evidence.

The realism ladder is still advisory scoring evidence. It does not change `verify` verdicts, does not replace CI, and does not turn weak behavior evidence into accepted product truth.

## Artifacts

The pool writes:

- `.spec/handoffs/retakeover-pool-metrics.json`
- `.spec/handoffs/retakeover-pool-summary.md`

Per-fixture metrics remain in:

- `.spec/handoffs/retakeover-metrics.json`
- `.spec/handoffs/retakeover-summary.md`

## Interpretation

- A non-blocking fixture can still be a weak benchmark fixture if it needs owner review or spec-debt follow-up.
- A fixture with good scores but weak evidence should not be treated as a green light for overclaiming.
- The pool is a scoring harness, not a new gate.
- A realism budget miss should create owner action and next command, not silently lower confidence.
