# Commercial Pilot Readiness Checklist

`jispec doctor pilot` checks whether a repository is ready for a team or customer pilot. It is separate from `doctor v1`: engineering readiness proves the JiSpec control layer is healthy, while pilot readiness proves a specific repository has enough local artifacts, governance posture, and sharing hygiene for external adoption.

## Checklist

- Installation entry: repo has a reproducible local JiSpec command path.
- First takeover: a bootstrap takeover is committed or a Greenfield baseline exists.
- CI integration: `ci:verify` exists and the latest `.jispec-ci/verify-report.json` has no blocking issue.
- Policy profile: `.spec/policy.yaml` declares `solo`, `small_team`, or `regulated` with an accountable owner.
- Waiver and spec debt: expired waivers and expired open spec debt are resolved before pilot review.
- Console governance: `.spec/console/governance-snapshot.json` is exported and declares local-only/no-source-upload boundaries.
- Privacy report: `.spec/privacy/privacy-report.json` exists and has no high-severity finding.

## Boundary

The checklist does not promise automatic understanding of an old repository. Legacy takeover still requires owner review, adoption decisions, explicit spec debt, and local verify artifacts.

Every blocker includes:

- the failed check,
- the owner action,
- the next local command,
- the source artifact path that caused or would resolve the blocker.

## Commands

```bash
npm run jispec -- doctor pilot
npm run jispec -- doctor pilot --json
```

Pilot readiness does not replace `verify`, `ci:verify`, policy evaluation, privacy review, release compare, or Console governance. It is a summary for adoption planning.
