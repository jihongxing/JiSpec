# P13 Hardening Follow-Up

Status: in_progress

Date: 2026-05-04

This plan intentionally lives outside `docs/`. It converts the P13 closeout hardening suggestions into explicit follow-up tasks and starts execution immediately.

## Goal

Close the remaining gap between the newly landed global-closure artifacts and the operator-facing daily surfaces, while keeping `verify` and `ci:verify` as deterministic local gates.

## H1 Release Global Context In Verify Surfaces

Status: in_progress

### Objective

Make `verify-summary` and `ci-summary` consume the latest release compare global context, so global-closure posture is visible in the same decision packet language already used for verify, impact graph, and waivers.

### Target files

Modify:

- `tools/jispec/ci/verify-report.ts`
- `tools/jispec/ci/verify-summary.ts`
- `tools/jispec/ci/ci-summary.ts`
- `tools/jispec/tests/ci-summary-markdown.ts`
- `tools/jispec/tests/p13-release-global-context.ts`
- `tools/jispec/tests/verify-report-contract.ts`

### Command surface affected

- `npm run jispec-cli -- verify`
- `npm run ci:verify`

### Required behavior

- `buildVerifyReport(...)` discovers the latest release compare artifact from declared release outputs only.
- Discovery prefers `.spec/releases/drift-trend.json`, with fallback to the newest `.spec/releases/compare/*/compare-report.json`.
- Verify report modes include machine-readable release compare snapshot fields:
  - `releaseCompareReportPath`
  - `releaseCompareOverallStatus`
  - `releaseCompareGlobalContextStatus`
  - `releaseCompareAggregatePath`
  - `releaseCompareOwnerReviewRecommendationCount`
  - `releaseCompareRelevantContractDriftHintCount`
  - `releaseCompareRelevantOwnerActionCount`
  - representative artifact / replay command / summary signals when available
- `verify-summary` and `ci-summary` surface this as:
  - stronger Decision Snapshot evidence
  - explicit `Release Global Context` operator section

### Acceptance

- verify-facing summaries no longer ignore P13 release global context
- all data comes from declared artifacts rather than source scanning
- tests prove both ingestion and rendering paths

## H2 Promotion Candidate Audit Evidence Health

Status: proposed

### Objective

Strengthen deferred-surface promotion readiness so promotion candidates are not considered healthy only because a static contract lists required artifacts.

### Target files

Modify:

- `tools/jispec/doctor.ts`
- `tools/jispec/runtime/deferred-surface-contract.ts`
- related promotion / doctor tests

### Required behavior

- promotion-candidate diagnostics check that required audit evidence artifacts actually exist and are consumable
- diagnostics distinguish:
  - declared contract only
  - artifact missing
  - artifact present but unreadable
  - artifact healthy

### Acceptance

- promotion readiness reflects real audit evidence health
- deferred surfaces still remain diagnostics-only unless explicitly promoted

## Execution Order

1. Finish `H1`
2. Run targeted verification
3. Start `H2`
