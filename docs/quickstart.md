# JiSpec Quickstart

Use this when you want to know what to run first.

## Run These Three Commands

From the repository you want JiSpec to govern:

```bash
npm install -D jispec
npx jispec first-run
npx jispec discover --init-project
```

What they do:

- `npm install -D jispec` installs the local CLI.
- `first-run` recommends the next stable command for the current repository.
- `discover` scans the repository and writes the first local evidence artifacts.

No cloud account, source upload, or LLM gate is required.

## Guided First Run

When you are unsure which path applies to the current repository:

```bash
npx jispec first-run
```

The guided flow is read-only. It detects empty directories, old repositories, existing `.spec` state, open bootstrap drafts, policy, the latest verify report, and active change sessions, then recommends the next stable CLI command.

It also says which local artifacts the recommended command will write.

## First Legacy Takeover

After discovery, continue with:

```bash
npx jispec draft
npx jispec adopt --session latest --interactive
npx jispec verify
npx jispec ci
```

The first two commands create and review candidate contracts. The final command is the deterministic local gate.

## First Greenfield Project

For a new project from documents:

```bash
npx jispec init --root .tmp/minimal-greenfield --requirements examples/minimal-greenfield/requirements.md --technical-solution examples/minimal-greenfield/technical-solution.md --force
npx jispec verify --root .tmp/minimal-greenfield --policy .spec/policy.yaml
```

Use `.spec/greenfield/initialization-summary.md` and `.spec/greenfield/change-mainline-handoff.md` as the human review packet.

For the empty-directory acceptance smoke that exercises the same Greenfield path end-to-end, see [`examples/greenfield-empty-directory/README.md`](../examples/greenfield-empty-directory/README.md) and `scripts/run-greenfield-empty-directory-demo.ts`.

## What To Read Next

- Full docs map: `docs/README.md`
- Legacy takeover decisions: `docs/user-guide/takeover-guide.md`
- Greenfield input rules: `docs/reference/greenfield-input-contract.md`
- Execute-default workflow: `docs/execute-default-guide.md`
- Governance dashboard: `docs/console-governance-guide.md`
- Policy and governance overview: `docs/user-guide/README.md`
- CI templates: `docs/ci-templates.md`
- Pilot package: `docs/pilot-product-package.md`
- Final acceptance: `docs/architecture/north-star-acceptance.md`
