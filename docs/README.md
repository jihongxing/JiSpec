# JiSpec Docs Map

This file is the navigation layer for the current docs tree.

The repository still keeps most docs in a flat `docs/` layout so existing links stay stable. Treat the sections below as the logical structure we want readers to experience today, without forcing a large file move first.

If you are deciding what still matters, start with [doc-lifecycle.md](./doc-lifecycle.md).

## Start Here

Read these first if you are new to the repo:

- Canonical section index: [getting-started/README.md](./getting-started/README.md)
- [install.md](./install.md): local install, runtime boundary, and stable entry points
- [quickstart.md](./quickstart.md): the shortest path to a first run
- [getting-started/first-takeover-walkthrough.md](./getting-started/first-takeover-walkthrough.md): step-by-step legacy repo takeover
- [greenfield-walkthrough.md](./greenfield-walkthrough.md): step-by-step Greenfield initialization

## User Guides

Use these once the first run works:

- Canonical section index: [user-guide/README.md](./user-guide/README.md)
- [user-guide/takeover-guide.md](./user-guide/takeover-guide.md): what discover, draft, adopt, defer, and reject mean
- [execute-default-guide.md](./execute-default-guide.md): `change -> implement -> verify` flow and lane behavior
- [console-governance-guide.md](./console-governance-guide.md): local governance dashboard, UI, actions, and export
- [external-coding-tool-adapters.md](./external-coding-tool-adapters.md): Cursor, Claude Code, Copilot, Codex, and Devin handoff packets
- [user-guide/README.md](./user-guide/README.md): policy and governance landing page
- [pilot-product-package.md](./pilot-product-package.md): local adoption package for pilot sharing

## Reference

Use these when you need stable contracts, artifact definitions, or command semantics:

- Canonical section index: [reference/README.md](./reference/README.md)
- [reference/v1-mainline-stable-contract.md](./reference/v1-mainline-stable-contract.md): authoritative V1 contract surface
- [reference/console-read-model-contract.md](./reference/console-read-model-contract.md): declared Console artifact intake
- [contract-source-adapters.md](./contract-source-adapters.md): deterministic import of repo artifacts into takeover evidence
- [requirement-evolution-workflow.md](./requirement-evolution-workflow.md): source evolution lifecycle and review loop
- [audit-ledger.md](./audit-ledger.md): audit event chain rules
- [ci-templates.md](./ci-templates.md): GitHub Actions and GitLab CI entry points
- [integrations.md](./integrations.md): preview-only SCM and issue-tracker payloads
- [privacy-and-local-first.md](./privacy-and-local-first.md): local-first and no-source-upload boundary

## Product, Architecture, And Quality

Use these to understand the bigger product shape:

- Canonical section index: [architecture/README.md](./architecture/README.md)
- [architecture/north-star.md](./architecture/north-star.md): product goal and sequencing rule
- [architecture/north-star-acceptance.md](./architecture/north-star-acceptance.md): final local acceptance suite
- [architecture/ide-trajectory.md](./architecture/ide-trajectory.md): long-term IDE evolution path

## Development And Operations

These are useful for maintainers and release owners:

- Canonical section index: [development/README.md](./development/README.md)
- [development/pilot-readiness-checklist.md](./development/pilot-readiness-checklist.md): pilot gate checklist
- [development/releases/v0.1.0.md](./development/releases/v0.1.0.md): v0.1.0 release notes

## Internal Or Historical

These docs are still useful context, but they are not the first stop for day-to-day users:

- [development/collaboration-surface-freeze.md](./development/collaboration-surface-freeze.md): frozen boundary statement for deferred collaboration surfaces
- [development/superpowers-discipline-layer.md](./development/superpowers-discipline-layer.md): deeper internal discipline-layer notes

The files under [input/](./input/) are source-document examples used by Greenfield flows. They are not general product docs.

## Freshness Signals

As of 2026-05-11, these docs were updated most recently and should be treated as the most current user-facing guidance:

- [user-guide/README.md](./user-guide/README.md)
- [external-coding-tool-adapters.md](./external-coding-tool-adapters.md)
- [getting-started/first-takeover-walkthrough.md](./getting-started/first-takeover-walkthrough.md)
- [greenfield-walkthrough.md](./greenfield-walkthrough.md)

These are still useful, but read them with more context because they are either dated, historical, or intentionally narrow:

- [development/collaboration-surface-freeze.md](./development/collaboration-surface-freeze.md)
- [development/releases/v0.1.0.md](./development/releases/v0.1.0.md)

## Overlap Notes

- `install.md` and `quickstart.md` are both current. `install.md` explains setup and runtime boundaries; `quickstart.md` answers what to run first.
- `getting-started/first-takeover-walkthrough.md` and `user-guide/takeover-guide.md` are both current. The walkthrough is procedural; the guide is about adoption judgment.
- The policy docs are split on purpose:
  `user-guide/README.md` for the governance landing page,
  and `reference/README.md` for stable contracts and read-model references.

## Recommended Next Cleanup

The directory landing pages under `getting-started/`, `user-guide/`, `reference/`, `architecture/`, and `development/` now act as the first physical step toward that structure.
Keep existing flat file paths stable for now. Move individual docs only after the new section landing pages have absorbed the primary entry traffic.
If you want to trim or archive docs, start with [doc-lifecycle.md](./doc-lifecycle.md).
