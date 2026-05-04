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
- external coding tool adapter request packets
- Console governance exports
- SCM and issue tracker integration payload previews
- pilot package and share bundle artifacts
- audit events
- release compare reports
- north-star acceptance packages and scenario packets

Privacy report classifies `.spec/integrations/**` as `integration_payload`, `.spec/pilot/**` as `pilot_package`, and `.jispec/handoff/**` as `handoff`. A classified artifact is not automatically safe to publish; it receives either `shareable` or `review_before_sharing`, and findings produce a redacted companion view.

## Console Export

`console export-governance` redacts sensitive strings before writing `.spec/console/governance-snapshot.json` and records a privacy hint in the snapshot. This keeps multi-repo aggregation and external review safer without mutating the underlying local facts.
North-star acceptance packages are treated as closeout artifacts for privacy scanning, but they remain read-only evidence and do not replace any gate.

## External Tool Boundary

JiSpec can describe a future external graph tool run only through an explicit `run-external-tool`
boundary artifact. That artifact must declare the command, provider, network posture, source upload risk,
model or service provider, source scope, and generation timestamp before any external execution is
considered.

External graph tool output is advisory-only. It cannot replace `verify`, create a blocking issue by
itself, or become the source of truth for contracts. For regulated profiles, sharing or adopting an
external graph summary requires owner approval for `external_graph_summary_sharing` when network access
or source upload risk is present.

Privacy report treats risky external tool run artifacts as `review_before_sharing` when
`networkRequired` is true or `sourceUploadRisk` is not `none`.

## Boundaries

- Redaction is deterministic local string scanning.
- It is not an LLM classifier.
- It does not replace `verify` or `ci:verify`.
- It does not prove that a file is safe to publish publicly.
- A `review_before_sharing` decision means a human should inspect the redacted view before sending it outside the team.
