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
    path: repos/api
    upstreamContractRefs: []
    downstreamContractRefs:
      - web:contracts/payment.yaml
  - id: web
    role: downstream
    path: repos/web
    upstreamContractRefs:
      - api:contracts/payment.yaml
    downstreamContractRefs: []
```

Repo group entries are local metadata for the aggregate. If a configured repo has not exported `.spec/console/governance-snapshot.json`, the aggregate records that repo as `not_available_yet`.

## Cross-Repo Contract Drift Hints

When both upstream and downstream snapshots expose matching `aggregateHints.contractRefs` with different hashes, the aggregate writes `contractDriftHints` and `ownerActions` to `.spec/console/multi-repo-governance.json` and renders them in `.spec/console/multi-repo-governance.md`.

These hints are owner-review prompts and suggested commands only. They do not replace any single-repo `verify` or `ci:verify` gate, and they cannot make a repo mergeable or non-mergeable by themselves.

## What It Shows

- highest-risk repos
- verify verdict inventory
- policy profile inventory
- expiring soon, expired, and unmatched active waivers
- open Greenfield and bootstrap spec debt
- release drift hotspots
- cross-repo contract drift hints
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
