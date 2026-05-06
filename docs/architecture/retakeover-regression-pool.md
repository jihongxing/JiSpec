# JiSpec Retakeover 回归池

JiSpec keeps takeover quality honest with two complementary surfaces:

- the real-like retakeover pool in `tools/jispec/tests/bootstrap-retakeover-regression.ts`
- the synthetic stress demo in `tools/jispec/tests/bootstrap-messy-legacy-takeover.ts`

Run them with:

```bash
node --import tsx ./tools/jispec/tests/bootstrap-retakeover-regression.ts
node --import tsx ./tools/jispec/tests/bootstrap-messy-legacy-takeover.ts
node --import tsx ./scripts/run-messy-legacy-takeover-demo.ts --force
```

## What The Pool Covers

The real-like pool currently exercises six repository shapes:

- `remirage-like` -> `high-noise-protocol-repo`
- `breathofearth-like` -> `multilingual-finance-service-repo`
- `scattered-contracts-like` -> `docs-api-schema-scattered-repo`
- `retail-ops-monorepo-like` -> `multi-language-monorepo-repo`
- `member-portal-fullstack-like` -> `frontend-backend-mixed-repo`
- `legacy-saas-debt-like` -> `historical-debt-service-repo`

The synthetic stress demo still covers the remaining explicit synthetic classes:

- `synthetic-god-file-monolith`
- `synthetic-contract-drift`
- `synthetic-noise-heavy-hidden-signal`
- `synthetic-thin-behavior-evidence`

That split is intentional. The pool tracks realistic takeover packets. The stress demo keeps worst-case noise and drift failure modes from creeping back in.

## Generated Artifacts

The pool writes two artifacts:

- `.spec/handoffs/retakeover-pool-metrics.json`
- `.spec/handoffs/retakeover-pool-summary.md`

The JSON file is the machine contract. The Markdown file is a reviewer companion.

## What To Check

Start with `.spec/handoffs/retakeover-pool-summary.md` for a fast read:

- `Decision` tells you if the pool is non-blocking or if a fixture regressed.
- `Coverage` shows how many fixture classes are currently covered by the real-like pool and which classes are still only covered by the synthetic stress lane.
- `Quality Scorecard` shows readiness, verify safety, feature overclaim risk, and next action per fixture.
- `Coverage` and `Fixture Matrix` together answer whether the pool is still testing the repo shapes you care about.

Then inspect `.spec/handoffs/retakeover-pool-metrics.json` if you need the exact contract:

- `coverage.fixtureCatalog`: normalized catalog entry per fixture, including coverage signals, decision-path markers, and a small top-evidence sample.
- `coverage.classCoverage`: known class count, covered class count, coverage rate, per-class counts, and missing classes.
- `coverage.qualityBaseline`: pool thresholds plus observed low-water marks for takeover readiness, contract signal precision, and behavior evidence strength.
- `fixtures`: the raw per-fixture takeover metrics already used by Console and value metrics.

## Regression Intent

This pool is not trying to prove that every repository becomes adoptable with zero human review. It is trying to prove four narrower things:

- noise stays suppressed, especially mirrors, caches, build output, and vendor gravity
- top-ranked evidence stays boundary-first instead of inventory-first
- weak behavior evidence gets deferred or owner-reviewed instead of overclaimed
- verify stays non-blocking after the adopt/defer/reject loop

## When To Add A Fixture

Add or expand a fixture when:

- a discover ranking change improves one repo shape but weakens another
- a new contract-source adapter changes boundary evidence selection
- a takeover brief or feature draft starts overclaiming behavior
- a real customer repo exposes a shape not represented in `coverage.classCoverage`

If the new shape is realistic, add it to the real-like pool. If it is mostly adversarial noise or a pathological edge case, keep it in the synthetic stress lane.
