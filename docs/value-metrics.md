# Value Metrics

`jispec metrics value-report` turns local JiSpec artifacts into a repo-local value report for adoption review, weekly team retrospectives, and commercial pilot conversations.

It writes:

- `.spec/metrics/value-report.json`
- `.spec/metrics/value-report.md`

The report is local-only. It does not upload source, does not default to network access, does not collect personal sensitive information, and does not replace `verify`, `ci:verify`, policy evaluation, release compare, or any blocking gate.

## What It Answers

The report is designed to answer:

- How much manual artifact sorting JiSpec likely avoided this week.
- Which blocking and advisory risks JiSpec surfaced early.
- How much owner-review load came from adopt edits, rejects, and deferred spec debt.
- Whether waivers and spec debt are aging.
- Where execute mediation stopped: scope, patch apply, test, post-verify, budget, or stall.

## Source Artifacts

The report only reads declared local artifacts such as:

- `.spec/facts/bootstrap/evidence-graph.json`
- `.spec/facts/bootstrap/adoption-ranked-evidence.json`
- `.spec/handoffs/bootstrap-takeover.json`
- `.jispec-ci/verify-report.json`
- `.spec/waivers/*.json`
- `.spec/spec-debt/ledger.yaml`
- `.spec/spec-debt/<session-id>/*.json`
- `.jispec/handoff/*.json`
- `.jispec/implement/<session-id>/patch-mediation.json`
- `.spec/handoffs/retakeover-metrics.json`

Markdown companions are display-only; the machine report records its source artifact paths for traceability.

## Console

Console reads `.spec/metrics/value-report.json` through the `takeover_quality_trend` governance object. It may display value trends, but value metrics are not a merge gate and cannot override local verify results.
