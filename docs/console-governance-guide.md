# JiSpec Console Governance Guide

Console is the local governance control room over JiSpec artifacts. It is not a replacement for `verify`, `ci:verify`, or the local policy gate.

Console reads declared artifacts such as:

- verify reports
- policy files
- waiver records
- spec debt ledgers
- release drift reports
- takeover quality metrics
- implementation handoff packets
- approval decisions
- audit events
- north-star acceptance packages

Console does not scan source code to invent new truth.

## Dashboard

```bash
npm run jispec -- console dashboard
npm run jispec -- console dashboard --json
```

The dashboard is organized around governance questions:

- Can this repo merge?
- Which waivers need attention?
- Which spec debt blocks takeover or release?
- Which contract drift needs owner review?
- Where did execute mediation stop?
- Are policy approvals missing, stale, or satisfied?
- Is there enough audit evidence to explain decisions?

## Local UI

```bash
npm run jispec -- console ui
npm run jispec -- console ui --json
```

This writes a static local HTML console to `.spec/console/ui/index.html`.

The first screen is governance status, not a file browser. It shows:

- mergeability
- policy posture
- waiver lifecycle
- spec debt
- contract and release drift
- takeover quality
- implementation mediation outcomes
- approval workflow
- audit events

The UI is offline-capable and read-only. It embeds the current Console read model and suggested local commands, but it does not execute commands, run verify, scan source code, upload source, or override CI.

## Actions

```bash
npm run jispec -- console actions
npm run jispec -- console actions --json
```

Actions are command suggestions and human decision packets. Console does not run write commands implicitly.

Examples:

- renew or revoke a waiver
- repay or cancel spec debt
- request owner review
- migrate policy
- compare release drift

Each action packet includes:

- owner
- reason
- risk level and summary
- source artifact
- affected contract or issue reference
- recommended local CLI command
- local artifacts that would be written if the reviewer runs the command

The text output also renders a short `Decision packet` block with the same five reviewer fields used by bootstrap, verify, release, and implementation handoffs: current state, risk, evidence, owner, and next command. JSON remains the machine-readable action contract; Markdown/text output is only the human companion.

The Local UI shows the same decision packet fields and provides a copy control for the recommended command. Copying a command is still not execution. All writes still happen through explicit local CLI commands that record audit events.

## Export Governance Snapshot

```bash
npm run jispec -- console export-governance --repo-id my-repo --repo-name "My Repo"
```

This writes `.spec/console/governance-snapshot.json` and a Markdown companion. Future multi-repo views should consume this exported snapshot rather than scanning repositories.

The exported JSON includes `contract.snapshotContractVersion: 1` and `contract.compatibleAggregateVersion: 1`. Missing governance facts inside a repo remain `not_available_yet`; missing explicit snapshot inputs in an aggregate are represented as `snapshot_not_found`.

## Multi-Repo Aggregate

```bash
npm run jispec -- console aggregate-governance --dir ../workspace --json
npm run jispec -- console aggregate-governance --snapshot repo-a/.spec/console/governance-snapshot.json repo-b/.spec/console/governance-snapshot.json
```

This writes `.spec/console/multi-repo-governance.json` and a Markdown companion. It consumes exported governance snapshots only. It does not enter source trees, run verify for any repo, upload source, or replace the single-repo `verify` verdict.

Explicit snapshot paths that do not exist remain visible in the aggregate under `missingSnapshots` and `summary.missingSnapshotCount`; this keeps missing repos reviewable instead of silently omitting them.

The aggregate shows:

- highest-risk repos
- expiring soon and unmatched active waivers
- open spec debt
- release drift hotspots
- non-pass verify verdicts
- latest audit actors
- missing snapshot inputs

North Star acceptance is the terminal local acceptance package. Console can display it for closeout review, but it stays read-only evidence and does not override `verify`, `ci:verify`, `doctor v1`, `doctor runtime`, `doctor pilot`, or `post-release:gate`.

## Audit Integrity

Console reads `.spec/audit/events.jsonl` as local governance evidence. New audit events include a hash chain (`sequence`, `previousHash`, `eventHash`) plus a signature placeholder. If the ledger has legacy unchained events, parse errors, sequence gaps, hash mismatches, or out-of-order timestamps, Console surfaces audit integrity attention instead of silently treating the ledger as clean.

Audit integrity is a reviewer signal. It does not replace `verify`, `ci:verify`, or the local policy gate.

## Approval Workflow

```bash
npm run jispec -- policy approval status
npm run jispec -- policy approval record --subject-kind policy_change --actor alice --role reviewer --reason "Reviewed policy change"
```

Approval records live under `.spec/approvals/*.json`. Console shows whether the current local subjects are `approval_missing`, `approval_stale`, or `approval_satisfied`. A stale approval means the reviewed artifact hash changed or the approval expired.

When approval is missing or stale, `console actions` emits a `record_policy_approval` decision packet with the subject kind/ref, owner, affected subject hash, recommended local command, and expected writes to `.spec/approvals/*.json` plus `.spec/audit/events.jsonl`. This includes release drift subjects after `release compare` writes a compare report.

Approval decisions are explicit human records. They append audit events and do not make an LLM, Console, or exported snapshot a blocking judge.

## Privacy Report

```bash
npm run jispec -- privacy report
```

Privacy reporting scans local JiSpec artifacts under `.spec`, `.jispec`, and `.jispec-ci` for common secrets before artifacts are shared externally. It writes `.spec/privacy/privacy-report.json`, a Markdown companion, and redacted shareable views when findings are detected.

`console export-governance` redacts sensitive strings before writing the exported governance snapshot. Redaction does not mutate the original machine facts.
Privacy reporting also scans the north-star acceptance package and scenario packets as closeout artifacts, so terminal acceptance evidence stays reviewable without becoming a gate.

## Boundaries

- Console is local-first.
- Console does not upload source code.
- Console does not override `verify` or `ci:verify`.
- Console does not make an LLM the blocking judge.
- Console Markdown is display output. JSON/YAML artifacts remain the machine-readable inputs.

Use Console to decide who should act next. Use `verify` and `ci:verify` to decide whether the gate passes.
