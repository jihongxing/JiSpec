# JiSpec Quickstart

Use this when you want to know what to run first.

## Run These Three Commands

From the JiSpec repository root:

```bash
npm install
npm run jispec -- doctor v1
npm run jispec -- bootstrap discover --root examples/minimal-legacy-takeover --init-project
```

What they do:

- `npm install` prepares the local CLI runtime.
- `doctor v1` checks whether the control layer is ready.
- `bootstrap discover` scans a repository and writes the first local evidence artifacts.

No cloud account, source upload, or LLM gate is required.

## Guided First Run

When you are unsure which path applies to the current repository:

```bash
npm run jispec -- first-run --root .
```

The guided flow is read-only. It detects empty directories, old repositories, existing `.spec` state, open bootstrap drafts, policy, the latest verify report, and active change sessions, then recommends the next stable CLI command.

It also says which local artifacts the recommended command will write.

## First Legacy Takeover

After discovery, continue with:

```bash
npm run jispec -- bootstrap draft --root examples/minimal-legacy-takeover
npm run jispec -- adopt --root examples/minimal-legacy-takeover --session latest --interactive
npm run jispec -- verify --root examples/minimal-legacy-takeover
```

The first two commands create and review candidate contracts. The final command is the deterministic local gate.

## First Greenfield Project

For a new project from documents:

```bash
npm run jispec -- init --root .tmp/minimal-greenfield --requirements examples/minimal-greenfield/requirements.md --technical-solution examples/minimal-greenfield/technical-solution.md --force
npm run jispec -- verify --root .tmp/minimal-greenfield --policy .spec/policy.yaml
npm run ci:verify
```

Use `.spec/greenfield/initialization-summary.md` and `.spec/greenfield/change-mainline-handoff.md` as the human review packet.

## What To Read Next

- Legacy takeover decisions: `docs/takeover-guide.md`
- Execute-default workflow: `docs/execute-default-guide.md`
- Governance dashboard: `docs/console-governance-guide.md`
- Policy, waiver, and spec debt operations: `docs/policy-waiver-spec-debt-cookbook.md`
- CI templates: `docs/ci-templates.md`
