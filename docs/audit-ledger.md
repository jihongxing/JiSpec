# JiSpec Audit Ledger

JiSpec records governance decisions in `.spec/audit/events.jsonl`. The ledger is local-first and append-only: commands append events, and reviewers keep the file in the repo with the rest of the JiSpec artifacts.

## Event Chain

New audit events include:

- `sequence`
- `previousHash`
- `eventHash`
- `signature`

`eventHash` is a SHA-256 hash of the canonical event content, excluding `eventHash` and the signature placeholder. `previousHash` points to the previous event hash, or `null` for the first event.

The `signature` field is reserved as:

```json
{ "algorithm": "reserved-none", "value": null }
```

This keeps the event contract ready for future signing without requiring keys in the current local workflow.

## Integrity Checks

JiSpec can inspect the ledger for:

- unparsable JSONL rows
- missing required event fields
- sequence gaps
- previous-hash mismatches
- event-hash mismatches
- timestamps that move backward
- legacy events without hash-chain fields

Legacy unchained events are reported as warnings. Damaged or inconsistent rows are reported as invalid integrity.

Approval decisions, including pilot risk acceptance, append `policy_approval_decision` events with actor, reason, source artifact, affected contract refs, and the approval boundary. Commands refuse to append on an invalid ledger so damaged history is reviewed instead of being silently extended.

## Console Behavior

Console reads the audit ledger as a governance artifact. If integrity is `warning` or `invalid`, Console surfaces audit traceability attention instead of silently treating the ledger as clean.

This does not replace `verify` or `ci:verify`. Audit integrity is governance evidence for reviewers; single-repo gate authority remains with the local verify/policy workflow.

## Append-Only Boundary

Do not edit existing ledger lines to fix history. Add new audited governance actions through local JiSpec CLI commands, and review damaged ledgers explicitly when integrity warnings appear.
