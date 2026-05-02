# Integrations

JiSpec integration payloads are local previews for SCM and issue tracker systems. They do not call cloud APIs, require tokens, upload source, or become a new source of truth.

## Command

```bash
npm run jispec -- integrations payload --provider github --kind scm_comment
npm run jispec -- integrations payload --provider gitlab --kind scm_comment
npm run jispec -- integrations payload --provider jira --kind issue_link
npm run jispec -- integrations payload --provider linear --kind issue_link
```

The command writes JSON plus a Markdown companion under `.spec/integrations/`. The JSON payload follows `schemas/integration-payload.schema.json`.

Each payload declares `contract.integrationContractVersion: 1` with one of these roles:

- `scm_comment_preview`
- `issue_link_preview`

The contract is deliberately narrow: local artifacts remain the source of truth, the payload is preview-only, source upload is not required, and patches still return through `implement --external-patch` for `scope_check`, `tests`, and `verify`.

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

## External Graph Import-Only

JiSpec can import a pre-generated external graph artifact from `.spec/integrations/external-graph.json`.
This adapter is import-only:

- no external command execution
- no network access
- no source upload
- no automatic adoption of external findings as gate authority

The artifact follows `schemas/external-graph-import.schema.json` and requires `provider`, `generatedAt`,
`nodes`, and `edges`. Imported nodes are normalized into `externalGraph.normalizedEvidence` as advisory
context only. Each normalized evidence row carries `provenance.label: external_import`, freshness, source
path, provider, and an explicit `blockingEligible: false` posture.

Invalid external graph artifacts produce an advisory `INVALID_EXTERNAL_GRAPH_ARTIFACT` verify warning.
They do not interrupt verify and cannot create a blocking failure by themselves.

External graph summaries and normalized evidence files are included in the privacy report and default to
`review_before_sharing`, even when no common secret pattern is detected.

## External Tool Run Opt-In Boundary

`run-external-tool` is the explicit boundary required before JiSpec can trigger a provider such as
GitNexus, Graphify, or another graph generator. JiSpec does not enable that execution implicitly from
`verify`, `change`, `implement`, or Console surfaces.

An external tool run artifact must record:

- explicit `command`
- explicit `provider`
- `networkRequired`
- `sourceUploadRisk`
- `modelOrServiceProvider`
- `sourceScope`
- `generatedAt`
- audit metadata
- replay metadata

The artifact follows `schemas/external-tool-run-boundary.schema.json` and uses
`kind: jispec-external-tool-run`. External tool output remains advisory-only with
`outputBlockingEligible: false`; it cannot create a blocking issue unless corroborated by JiSpec-owned
deterministic contracts and normal verify policy.

For regulated profiles, sharing or adopting an external graph summary can require owner approval for the
`external_graph_summary_sharing` subject. Risky run artifacts, including networked runs or runs with
`sourceUploadRisk` other than `none`, are classified by the privacy report as `review_before_sharing`.

## Local Artifact Refs

Payloads include both `sourceArtifacts` and structured `sourceArtifactRefs`. Refs classify local fact sources such as:

- `verify_report`
- `verify_summary`
- `waiver_record`
- `spec_debt`
- `implementation_handoff`
- `console_governance`

SCM and issue tracker payloads may quote or link these artifact paths, but they do not become gate authority.

## Boundary

Local JiSpec artifacts remain authoritative:

- `.jispec-ci/verify-report.json`
- `.jispec-ci/verify-summary.md`
- `.spec/waivers/*.json`
- `.spec/spec-debt/*`
- `.jispec/handoff/*.json`

Integration payloads are derived views. They do not replace `verify`, `ci:verify`, policy evaluation, waiver lifecycle, spec debt review, or implementation mediation.
