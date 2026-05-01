# JiSpec Privacy And Local-First Boundary

JiSpec core CLI workflows are local-first. They do not require source upload, cloud credentials, or an LLM service to run deterministic governance gates such as `verify`, `ci:verify`, policy checks, waiver lifecycle, spec debt, release compare, Console dashboard, or privacy reporting.

## Privacy Report

```bash
npm run jispec -- privacy report
npm run jispec -- privacy report --json
```

This writes:

- `.spec/privacy/privacy-report.json`
- `.spec/privacy/privacy-report.md`
- `.spec/privacy/redacted/**` companion files when findings are detected

The report scans JiSpec artifacts under `.spec`, `.jispec`, and `.jispec-ci`. It does not scan arbitrary source files, and it does not upload artifacts.

## What It Checks

The redaction pass looks for common high-risk values:

- private key blocks
- AWS access keys
- OpenAI-style API keys
- GitHub tokens
- JWT-like tokens
- credential-bearing connection strings
- assignment patterns such as `api_key=...`, `token: ...`, `password=...`, `client_secret=...`

Findings include type, severity, line, column, a hash of the matched secret, and a redacted preview. Raw secret values are not written into the report.

## Shareable Views

Redacted files under `.spec/privacy/redacted/` are companion views for sharing with external tools or vendors. They are not machine facts and must not replace the original artifact.

Original artifacts remain unchanged:

- discover/session evidence
- verify summaries
- implementation handoff packets
- Console governance exports
- audit events
- release compare reports

## Console Export

`console export-governance` redacts sensitive strings before writing `.spec/console/governance-snapshot.json` and records a privacy hint in the snapshot. This keeps multi-repo aggregation and external review safer without mutating the underlying local facts.

## Boundaries

- Redaction is deterministic local string scanning.
- It is not an LLM classifier.
- It does not replace `verify` or `ci:verify`.
- It does not prove that a file is safe to publish publicly.
- A `review_before_sharing` decision means a human should inspect the redacted view before sending it outside the team.
