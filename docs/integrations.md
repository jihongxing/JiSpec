# Integrations

JiSpec integration payloads are local previews for SCM and issue tracker systems. They do not call cloud APIs, require tokens, upload source, or become a new source of truth.

## Command

```bash
npm run jispec -- integrations payload --provider github --kind scm_comment
npm run jispec -- integrations payload --provider gitlab --kind scm_comment
npm run jispec -- integrations payload --provider jira --kind issue_link
npm run jispec -- integrations payload --provider linear --kind issue_link
```

The command writes JSON plus a Markdown companion under `.spec/integrations/`.

## SCM Comment Payloads

GitHub and GitLab payloads summarize:

- verify verdict
- blocking and advisory issue counts
- top verify issues
- next action using the same language as the local verify summary
- waiver posture
- spec debt posture
- latest implementation handoff next action
- change intent when available

The payload is a preview for a PR comment or MR note. It is not posted automatically.

## Issue Link Payloads

Jira and Linear payloads include:

- suggested issue title
- body Markdown
- change intent backfill
- labels
- local artifact references

They are meant to help a team copy or later automate an issue-link preview without making the tracker a machine-truth source.

## Boundary

Local JiSpec artifacts remain authoritative:

- `.jispec-ci/verify-report.json`
- `.jispec-ci/verify-summary.md`
- `.spec/waivers/*.json`
- `.spec/spec-debt/*`
- `.jispec/handoff/*.json`

Integration payloads are derived views. They do not replace `verify`, `ci:verify`, policy evaluation, waiver lifecycle, spec debt review, or implementation mediation.
