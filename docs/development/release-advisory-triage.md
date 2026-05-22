# Release Advisory Triage

Date: 2026-05-22

Purpose: explain the current `verify` / `ci:verify` release posture and preserve the reasoning behind the advisory and gate-gap cleanup.

## Current Conclusion

The repository currently passes:

- `npm run build`
- `npm run ci:verify`
- `npx jispec ci`
- `npm run post-release:gate`
- `npm run jispec -- doctor mainline --root .`
- `npm run jispec -- doctor runtime --root .`
- `npm run jispec -- doctor pilot --root .`
- `npm run jispec -- doctor global --root .`
- `npm run jispec -- north-star acceptance --root . --json`

Current `npm run ci:verify` result:

- verdict: `PASS`
- blocking: `0`
- advisory: `0`
- runtime error: `0`
- unresolved gate gaps: `0`

This means the release is not merely mergeable with follow-up. It is clean from the deterministic verify point of view.

## What Was Fixed

The prior advisory flood did not mean the product had dozens of real capability failures. It mostly came from overly broad scanning boundaries:

- repo-internal support paths such as `tools/jispec/`, `examples/`, `templates/`, and `scripts/`
- CI and generated support files
- `.tmp-regression-runtime/`, the compiled regression workspace created while tests run
- impact graph freshness being reported for project models where Greenfield Spec Delta impact graphs do not apply

The current release separates those cases:

- governed implementation facts still produce drift when they are real product surfaces
- repo-internal support paths stay outside governed ratchet noise
- `.tmp-regression-runtime/` is skipped by the static collector
- non-Greenfield impact graphs are reported as `not_applicable`
- `not_applicable` artifacts do not enter `.spec/gates/gap-ledger.json`

## Implementation Points

- [`static-collector.ts`](../../tools/jispec/greenfield/static-collector.ts): excludes `.tmp-regression-runtime/`.
- [`gate-coverage.ts`](../../tools/jispec/verify/gate-coverage.ts): marks non-Greenfield impact graphs as `not_applicable`.
- [`gate-gap-ledger.ts`](../../tools/jispec/verify/gate-gap-ledger.ts): excludes `not_applicable` artifacts from unresolved gap accounting.
- [`verify-runner.ts`](../../tools/jispec/verify/verify-runner.ts): aligns verify metadata with the `not_applicable` impact graph posture.

## Release Language

Use this wording for v0.2.0:

- `post-release:gate` passes.
- `verify`, `ci:verify`, and `jispec ci` are `PASS`.
- There are `0` blocking issues, `0` advisory issues, and `0` unresolved gate gaps.
- The regression matrix baseline is `174 suites / 808 tests`.
- The release distinguishes real governance debt from artifacts that do not apply to the current project model.

## Follow-Up Guardrails

Future releases should keep these boundaries intact:

1. Do not let generated regression workspaces, support fixtures, or repo-internal tooling re-enter governed drift as product code.
2. Keep missing, stale, invalid, unavailable, and not-applicable artifacts distinct in gate coverage.
3. Treat `not_applicable` as an explanation, not as hidden debt.

## Verification Commands

Use these commands to reproduce the current conclusion:

```bash
npm run build
npm run ci:verify
npx jispec ci
npm run post-release:gate
npm run jispec -- doctor mainline --root .
npm run jispec -- doctor runtime --root .
npm run jispec -- doctor pilot --root .
npm run jispec -- doctor global --root .
npm run jispec -- north-star acceptance --root . --json
```
