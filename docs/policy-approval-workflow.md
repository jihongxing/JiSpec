# Policy Approval Workflow

JiSpec approval workflow is a local structured contract for governance decisions. It records who approved a policy, waiver, release drift, or execute-default change, but it does not replace `verify`, `ci:verify`, release compare, or the local policy gate.

## Contract

Approval records live at `.spec/approvals/*.json` and follow `schemas/approval.schema.json`.

Each record includes:

- `subject.kind`: `policy_change`, `waiver_change`, `release_drift`, or `execute_default_change`
- `subject.ref` and `subject.hash`: the local artifact and the content hash that was reviewed
- `requirement`: the team profile, owner, reviewers, and reviewer count at decision time
- `decision`: actor, role, reason, decision time, and optional expiration
- `boundary`: local-only, no source upload, no LLM blocking judge, no Console override

Profile defaults:

- `solo`: no reviewer quorum is required by default; an owner approval may still be recorded for traceability.
- `small_team`: one reviewer approval or owner approval.
- `regulated`: two reviewer approvals or owner approval.

## CLI

```bash
npm run jispec -- policy approval status
npm run jispec -- policy approval status --json
```

```bash
npm run jispec -- policy approval record \
  --subject-kind policy_change \
  --actor alice \
  --role reviewer \
  --reason "Reviewed policy change"
```

For waiver and release subjects, pass `--subject-ref` when the default artifact is not the intended review target:

```bash
npm run jispec -- policy approval record \
  --subject-kind waiver_change \
  --subject-ref .spec/waivers/waiver-123.json \
  --actor owner-a \
  --role owner \
  --reason "Approved temporary waiver"
```

Every approval decision appends a `policy_approval_decision` event to `.spec/audit/events.jsonl`.

## Status

Console and `policy approval status` report:

- `approval_missing`: no current owner approval or reviewer quorum exists.
- `approval_stale`: approval exists but is expired or its subject hash no longer matches the reviewed artifact.
- `approval_satisfied`: reviewer quorum or owner approval is current.

Staleness is deterministic. JiSpec compares the recorded subject hash with the current local artifact hash and checks the optional expiration timestamp.

## Boundaries

The workflow is intentionally not an AI judge. An LLM can help draft context for a human reviewer, but the approval contract is the local JSON artifact plus the audit event. Console only displays posture; it does not upload source, run verify, override CI, or turn a missing approval into a pass/fail gate by itself.
