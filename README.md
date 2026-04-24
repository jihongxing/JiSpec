# JiSpec

JiSpec is a repo-first protocol for AI collaborative delivery on large projects.

This repository skeleton includes:

- project-level protocol files in `jiproject/`
- bounded context artifacts in `contexts/`
- reusable templates in `templates/`
- machine-checkable schemas in `schemas/`
- sample input documents in `docs/input/`
- protocolized agent definitions in `agents/`

## Current sample

The sample models a commerce project with two bounded contexts:

- `catalog`
- `ordering`

The `ordering` context includes one complete example feature slice:

- `ordering-checkout-v1`

Use this skeleton as the seed for:

- CLI implementation
- schema validation
- CI gate checks
- agent orchestration

## Validation prototype

Install dependencies:

```bash
npm install
```

Validate the full repository:

```bash
npm run validate:repo
```

For machine-readable output:

```bash
npm run jispec -- validate --json
```

Validate one slice against its lifecycle, schema, and trace rules:

```bash
npm run jispec -- slice check ordering-checkout-v1
```

Generate a deterministic task plan for one slice:

```bash
npm run jispec -- slice plan ordering-checkout-v1 --force
```

List slices across the repository or for one context:

```bash
npm run jispec -- slice list --context ordering
```

Show the full observable snapshot for one slice:

```bash
npm run jispec -- slice show ordering-checkout-v1
```

Show what is blocking the next lifecycle step for one slice:

```bash
npm run jispec -- slice status ordering-checkout-v1
```

Recommend the next highest-leverage action for one slice:

```bash
npm run jispec -- slice next ordering-checkout-v1
```

Update one or more slice gates without advancing state:

```bash
npm run jispec -- slice update-gates ordering-checkout-v1 --set-gate test_ready=true
```

Update one or more task execution statuses inside a slice:

```bash
npm run jispec -- slice update-tasks ordering-checkout-v1 --set-status TASK-ORDERING-CHECKOUT-V1-001=in_progress
```

Advance a slice to the next lifecycle state when its gates are satisfied:

```bash
npm run jispec -- slice advance ordering-checkout-v1 --to test-defined --set-gate test_ready=true
```

Inspect a slice trace summary:

```bash
npm run jispec -- trace show ordering-checkout-v1
```

Show the aggregate delivery view for one bounded context:

```bash
npm run jispec -- context show ordering
```

Show the execution board for one bounded context:

```bash
npm run jispec -- context board ordering
```

Recommend the next highest-leverage action inside one bounded context:

```bash
npm run jispec -- context next ordering
```

List bounded contexts and their aggregate delivery state:

```bash
npm run jispec -- context list
```

Show what is blocking progress inside one bounded context:

```bash
npm run jispec -- context status ordering
```

Validate only the trace chain for one slice:

```bash
npm run jispec -- trace check ordering-checkout-v1
```

Derive a slice behavior file from context scenarios:

```bash
npm run jispec -- artifact derive-behavior ordering-checkout-v1 --force
```

Derive slice tests and coverage mappings from scenario IDs:

```bash
npm run jispec -- artifact derive-tests ordering-checkout-v1 --force
```

Synchronize trace links from slice requirements, behaviors, and tests:

```bash
npm run jispec -- artifact sync-trace ordering-checkout-v1
```

Derive a slice design from slice metadata and context design assets:

```bash
npm run jispec -- artifact derive-design ordering-checkout-v1 --force
```

Run the full safe derivation pipeline for one slice:

```bash
npm run jispec -- artifact derive-all ordering-checkout-v1 --force
```

Create a new proposed slice from the repository templates:

```bash
npm run jispec -- slice create ordering ordering-returns-v1 --title "Returns MVP"
```

The CI wrapper uses:

```bash
npm run check:jispec
```

Execution planning artifacts are now part of the protocol surface:

- `schemas/tasks.schema.json` validates `tasks.yaml`
- `jispec slice plan` generates deterministic slice tasks with explicit dependencies
- `jispec slice update-tasks` records execution progress back into `tasks.yaml`
- `jispec context board` renders a priority-sorted execution board with swimlanes
- `jispec slice next` and `jispec context next` turn the board state into executable recommendations

## Roadmap

- Short-term implementation status: `docs/phase-1-summary.md`, `docs/phase-2-summary.md`, `docs/phase-3-summary.md`
- Long-term roadmap for repository-scale orchestration: `docs/long-term-roadmap-v0.1.md`
