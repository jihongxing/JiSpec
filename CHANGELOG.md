# Changelog

## v0.2.0

Installable CLI release.

- Package metadata is now ready for an installable npm-style CLI surface: `jispec` exposes repository, homepage, publish access, keywords, and non-private package metadata.
- Root help now advertises product-style shortcuts such as `jispec discover`, `jispec draft`, `jispec dashboard`, `jispec pilot-package`, `jispec value-report`, `jispec privacy-report`, and `jispec acceptance`.
- Added a friendly command normalization layer that maps short product commands onto the existing stable command chains without removing legacy-compatible long-form commands.
- Added installable CLI regression coverage, including `npm pack --dry-run --json` verification that the package includes the bin and CLI implementation while excluding test sources.
- Current release gate baseline: `post-release:gate` passes, with regression matrix baseline at `174 suites / 808 tests`.

## v0.1.2

North Star closeout release.

- `verify` and `ci:verify` now reach a clean `PASS` posture with 0 blocking issues, 0 advisory issues, and 0 unresolved gate gaps.
- Greenfield ratchet scanning now excludes the regression runtime workspace, so generated test copies no longer appear as governed code drift.
- Gate coverage now marks non-Greenfield impact graphs as `not_applicable` instead of treating them as missing debt.
- Gate gap ledger output now separates real freshness debt from artifacts that do not apply to the current project model.
- Current release gate baseline: `post-release:gate` passes, with regression matrix baseline at `173 suites / 800 tests`.

## v0.1.0

Current repository baseline.

- Contract-driven V1 mainline: `bootstrap init-project`, `bootstrap discover`, `bootstrap draft`, `adopt`, `verify`, `change`, `implement`
- Local gates: `verify`, `ci:verify`, `doctor mainline`, `doctor runtime`, `doctor pilot`
- Release and governance surfaces: `release snapshot`, `release compare`, `pilot package`, `console export-governance`
- Current release gate baseline: `post-release:gate` passes, with regression matrix baseline at `158 suites / 718 tests`
- Greenfield truth contract is frozen end-to-end: canonicalization, truth fingerprint, snapshot verifier, adopt write-back, and deterministic regression fixtures are all covered

This file is the lightweight release index and current repository baseline record.
