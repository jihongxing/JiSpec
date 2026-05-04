# JiSpec

English | [中文](./README.zh-CN.md)

JiSpec is a contract-driven control layer for AI-native software delivery.

It keeps the main line local, deterministic, and auditable:
`discover -> draft -> adopt -> verify -> change -> implement`.

See: [docs/north-star.md](docs/north-star.md)

## Current Surface

JiSpec currently centers on:

- `bootstrap init-project`, `bootstrap discover`, `bootstrap draft`, `adopt`
- `verify` and `ci:verify`
- `change` and `implement`
- `doctor v1`, `doctor runtime`, `doctor pilot`
- `release snapshot`, `release compare`
- `pilot package`, `console export-governance`

The legacy `slice/context` surface still exists for compatibility, but it is not the primary entry point.

Current release notes: [docs/releases/v0.1.0.md](docs/releases/v0.1.0.md)

Current focus: tighten ability coverage and stitch the main line end to end until the release path is boring.
Current release gate status: `post-release:gate` passes on the repository baseline, and the regression matrix is currently `143 suites / 648 tests`.

## What Ships Today

- `bootstrap discover` writes the bootstrap evidence graph, full inventory, adoption-ranked evidence, and `bootstrap-summary.md`.
- `bootstrap draft` turns ranked evidence into a session bundle.
- `adopt --interactive` turns candidate drafts into adopted contracts or spec debt.
- `verify` reads `.spec/policy.yaml` when present and produces the deterministic gate result.
- `change` and `implement` mediate controlled implementation work instead of generating business code.
- `doctor v1` checks the V1 mainline. `doctor runtime` and `doctor pilot` cover the broader runtime and pilot-readiness profiles.

## Quickstart

```bash
npm install
npm run jispec -- doctor v1
npm run jispec -- bootstrap discover --root examples/minimal-legacy-takeover --init-project
```

If you are starting from documents instead of an existing repo, see [docs/greenfield-walkthrough.md](docs/greenfield-walkthrough.md).

## Primary Docs

- [docs/north-star.md](docs/north-star.md)
- [docs/v1-mainline-stable-contract.md](docs/v1-mainline-stable-contract.md)
- [docs/quickstart.md](docs/quickstart.md)
- [docs/takeover-guide.md](docs/takeover-guide.md)
- [docs/greenfield-input-contract.md](docs/greenfield-input-contract.md)
- [docs/install.md](docs/install.md)
- [docs/execute-default-guide.md](docs/execute-default-guide.md)
- [docs/pilot-product-package.md](docs/pilot-product-package.md)
- [docs/ci-templates.md](docs/ci-templates.md)
- [docs/policy-waiver-spec-debt-cookbook.md](docs/policy-waiver-spec-debt-cookbook.md)
- [docs/north-star-acceptance.md](docs/north-star-acceptance.md)
- [docs/console-read-model-contract.md](docs/console-read-model-contract.md)
- [docs/collaboration-surface-freeze.md](docs/collaboration-surface-freeze.md)

Final local acceptance surface: north-star acceptance.
Console read model contract.
Collaboration surface freeze.

## More

- [CHANGELOG.md](CHANGELOG.md)
- `npm run jispec-cli -- --help`
- `npm run jispec-cli -- verify --json`
- `npm run ci:verify`
