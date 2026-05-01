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

## What It Shows

- highest-risk repos
- verify verdict inventory
- policy profile inventory
- expiring soon, expired, and unmatched active waivers
- open Greenfield and bootstrap spec debt
- release drift hotspots
- latest audit actors

## Boundaries

- Aggregation consumes exported snapshots only.
- It does not scan source code.
- It does not run verify.
- It does not upload source.
- It does not replace single-repo `verify` or `ci:verify`.
- Markdown is a human companion. JSON is the machine-readable aggregate.
