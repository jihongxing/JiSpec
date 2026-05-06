# JiSpec Multi-Repo Governance

Multi-repo governance aggregates exported JiSpec Console snapshots across repositories. It is a local governance view, not a cloud service and not a replacement for any repo's `verify` or `ci:verify` gate.

## Produce Repo Snapshots

Run this inside each repo:

```bash
npm run jispec -- console export-governance --repo-id billing --repo-name "Billing"
```

This writes:

- `.spec/console/governance-snapshot.json`
- `.spec/console/governance-snapshot.md`

The JSON snapshot is the only machine-readable input for aggregation.

Each exported snapshot declares a small compatibility contract:

- `snapshotContractVersion: 1`
- `compatibleAggregateVersion: 1`
- missing local governance facts use `not_available_yet`
- missing explicit snapshot inputs are reported as `snapshot_not_found`

## Aggregate By Directory

```bash
npm run jispec -- console aggregate-governance --dir ../workspace
```

The directory input looks for exported `.spec/console/governance-snapshot.json` files at the directory root and one repo level below it.

## Aggregate Explicit Snapshots

```bash
npm run jispec -- console aggregate-governance \
  --snapshot repo-a/.spec/console/governance-snapshot.json repo-b/.spec/console/governance-snapshot.json
```

This writes:

- `.spec/console/multi-repo-governance.json`
- `.spec/console/multi-repo-governance.md`

If an explicit `--snapshot` path is missing, the aggregate keeps that input under `missingSnapshots` and increments `summary.missingSnapshotCount`. Missing snapshots are therefore visible governance inputs, not silently ignored repos.

## Optional Repo Group

Add `.spec/console/repo-group.yaml` when a workspace wants to describe known upstream/downstream contract relationships even before every repo has exported a snapshot:

```yaml
repos:
  - id: api
    role: upstream
    repoName: Billing API
    owner: contracts-team
    path: repos/api
    upstreamContractRefs: []
    downstreamContractRefs:
      - web:contracts/payment.yaml
  - id: web
    role: downstream
    repoName: Checkout Web
    owner: frontend-team
    path: repos/web
    upstreamContractRefs:
      - api:contracts/payment.yaml
    downstreamContractRefs: []
```

`repoName` and `owner` are optional metadata used to turn passive drift hints into a named owner-action loop.

Repo group entries are local metadata for the aggregate. If a configured repo has not exported `.spec/console/governance-snapshot.json`, the aggregate records that repo as `not_available_yet`.

## Cross-Repo Contract Drift Hints

When both upstream and downstream snapshots expose matching `aggregateHints.contractRefs` with different hashes, the aggregate writes `contractDriftHints` and `ownerActions` to `.spec/console/multi-repo-governance.json` and renders them in `.spec/console/multi-repo-governance.md`.

`contractDriftHints` stay as passive evidence objects:

- upstream repo, downstream repo, contract ref, and mismatched hashes
- linked `ownerActionId`
- downstream evidence such as snapshot path, repo path, active source change id, and release drift status
- `blockingGateReplacement: false`

`ownerActions` are the explicit remediation packets:

- one downstream repo owner at a time
- a primary repo-local command
- a follow-up `console export-governance` command
- source artifacts and affected contracts for review
- `blockingGateReplacement: false`

Primary command selection is intentionally local and deterministic:

- prefer `source refresh` when the downstream repo already has an active source evolution change
- otherwise prefer `release compare` when the downstream repo already shows release drift
- otherwise open a normal downstream `change`
- after any of the above, re-run `console export-governance` in that repo so the aggregate can be refreshed from local truth

These hints and owner actions are review prompts plus suggested commands only. They do not replace any single-repo `verify` or `ci:verify` gate, and they cannot make a repo mergeable or non-mergeable by themselves.

## What It Shows

- highest-risk repos
- verify verdict inventory
- policy profile inventory
- expiring soon, expired, and unmatched active waivers
- open Greenfield and bootstrap spec debt
- release drift hotspots
- cross-repo contract drift hints
- cross-repo owner actions
- latest audit actors
- missing snapshot inputs

## Boundaries

- Aggregation consumes exported snapshots only.
- It does not scan source code.
- It does not run verify.
- It does not upload source.
- It does not replace single-repo `verify` or `ci:verify`.
- Cross-repo drift hints produce owner actions and suggested commands only.
- Markdown is a human companion. JSON is the machine-readable aggregate.
