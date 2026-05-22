# JiSpec Install

JiSpec v0.2.0 is the installable CLI release. The intended user path is no longer "run the JiSpec source repository"; it is "install the CLI in the repository you want to govern."

## Project Install

```bash
npm install -D jispec
npx jispec --version
npx jispec first-run
```

No cloud account, source upload, or LLM gate is required for the core CLI.

## Source Checkout

Use this path only when developing JiSpec itself:

```bash
npm install
npm run jispec -- --version
npm run jispec -- doctor mainline
```

The package exposes both `jispec` and `jispec-cli` bin names through `bin/jispec.js`. The bin shim dispatches to the same TypeScript CLI used by the repository scripts, so `npm run jispec -- <command>` and an installed `jispec <command>` share the same command surface.

## Stable Product Entry Points

```bash
npx jispec first-run
npx jispec discover --init-project
npx jispec draft
npx jispec adopt --interactive
npx jispec verify
npx jispec ci
npx jispec change "Describe the intended change"
npx jispec implement
npx jispec dashboard
npx jispec actions
npx jispec pilot-package
npx jispec value-report
npx jispec privacy-report
```

The old long-form routes remain available. For example, `jispec discover` maps to `jispec bootstrap discover`, and `jispec dashboard` maps to `jispec console dashboard`.

The install surface does not change V1 semantics: `verify` and `ci:verify` remain deterministic local gates, Console surfaces remain read-only unless a human runs an explicit CLI write command, and JiSpec still mediates implementation rather than owning business-code generation.

## First Adoption Assets

- `examples/minimal-legacy-takeover/` shows the smallest legacy takeover path.
- `examples/minimal-greenfield/` shows Greenfield initialization from input documents.
- `docs/quickstart.md` answers which three commands to run first.
- `docs/user-guide/takeover-guide.md` covers takeover decisions and adoption shapes.
- `docs/reference/greenfield-input-contract.md` defines the input contract for new project initialization.
- `docs/pilot-product-package.md` explains the local adoption package and the line between gates and companions.
- `docs/ci-templates.md` explains the GitHub Actions and GitLab CI templates.

## Runtime Boundary

- Node.js `>=20` is required.
- `tsx` is a runtime dependency because the current package bin executes the TypeScript CLI directly.
- No cloud account or source upload is required for the core CLI.
