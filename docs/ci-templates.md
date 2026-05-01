# JiSpec CI Templates

JiSpec CI should run the same local CLI gate that developers run on their machines.

Core rule:

```bash
npm run ci:verify
```

The wrapper runs `verify`, writes `.jispec-ci/verify-report.json`, `.jispec-ci/ci-summary.md`, and `.jispec-ci/verify-summary.md`, then exits non-zero only when the deterministic verify gate is blocking.

## GitHub Actions

Copy `.github/workflows/jispec-verify-template.yml` into the target repository as `.github/workflows/jispec-verify.yml`.

The template:

- uses Node.js 20
- installs with `npm ci`
- runs `npm run ci:verify`
- uploads `.jispec-ci/` as an artifact
- lets `scripts/check-jispec.ts` write GitHub step summary and PR comment drafts when GitHub environment variables are present

## GitLab CI

Copy `.gitlab-ci.jispec-template.yml` into the target repository or merge the job into an existing `.gitlab-ci.yml`.

The template:

- uses `node:20`
- runs `npm ci`
- runs `npm run ci:verify`
- preserves `.jispec-ci/` as an artifact for reviewer inspection

## Boundary

The templates do not upload source code to JiSpec or to an LLM service. They only run local verification against checked-in contracts, policy, facts, waiver records, spec debt, and generated JiSpec artifacts.

CI comments and summaries are display artifacts. The local verify report remains the machine-readable gate result.
