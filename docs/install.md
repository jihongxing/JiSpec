# JiSpec Install

JiSpec currently ships a local npm/bin surface for the repository control layer.

## Local Development

```bash
npm install
npm run jispec -- --version
npm run jispec -- doctor v1
```

The package exposes both `jispec` and `jispec-cli` bin names through `bin/jispec.js`. The bin shim dispatches to the same TypeScript CLI used by the repository scripts, so `npm run jispec -- <command>` and an installed `jispec <command>` share the same command surface.

## Stable Entry Points

```bash
npm run jispec -- bootstrap discover
npm run jispec -- verify
npm run jispec -- change "Describe the intended change"
npm run jispec -- implement
npm run ci:verify
```

The install surface does not change V1 semantics: `verify` and `ci:verify` remain deterministic local gates, Console surfaces remain read-only unless a human runs an explicit CLI write command, and JiSpec still mediates implementation rather than owning business-code generation.

## First Adoption Assets

- `examples/minimal-legacy-takeover/` shows the smallest legacy takeover path.
- `examples/minimal-greenfield/` shows Greenfield initialization from input documents.
- `docs/quickstart.md` answers which three commands to run first.
- `docs/first-takeover-walkthrough.md` walks from `bootstrap discover` to `adopt`, `verify`, `ci:verify`, and handoff packets.
- `docs/ci-templates.md` explains the GitHub Actions and GitLab CI templates.

## Runtime Boundary

- Node.js `>=20` is required.
- `tsx` is a runtime dependency because the current package bin executes the TypeScript CLI directly.
- No cloud account or source upload is required for the core CLI.
