# JiSpec Execute-Default Guide

Execute-default connects `change`, `implement`, and `verify` into one workflow. It does not turn JiSpec into an autonomous business-code generator.

JiSpec owns:

- change intent
- lane decision
- scope boundaries
- test command routing
- external patch mediation
- verify gate feedback
- handoff and replay packets

Humans and external coding tools still own business-code implementation.

## Check Readiness

```bash
npm run jispec -- doctor v1
npm run jispec -- change default-mode show
```

`doctor v1` explains blockers and owner actions. Missing policy, blocking verify results, damaged project config, or incomplete patch mediation should stop execute-default promotion.

## Set Or Reset Default Mode

```bash
npm run jispec -- change default-mode set execute --actor <name> --reason "Promote execute-default"
npm run jispec -- change default-mode set prompt --actor <name> --reason "Use manual orchestration"
npm run jispec -- change default-mode reset --actor <name> --reason "Return to project fallback"
```

The setting is stored in `jiproject/project.yaml`.

Explicit mode flags always win:

```bash
npm run jispec -- change "Add refund validation" --mode prompt
npm run jispec -- change "Add refund validation" --mode execute
```

## Execute A Change

```bash
npm run jispec -- change "Add refund validation" --change-type add --mode execute
```

When the lane allows execution, JiSpec can continue into implementation mediation and verify. When a strict lane meets an open bootstrap draft, it pauses at the adopt boundary.

## Mediate External Implementation

```bash
npm run jispec -- implement --external-patch .jispec/patches/refund.patch
```

The patch is checked against scope, tests, and verify. A patch cannot bypass the local gate just because an external coding tool produced it.

## Replay A Failed Attempt

```bash
npm run jispec -- implement --from-handoff .jispec/handoff/<change-session-id>.json --external-patch .jispec/patches/refund-v2.patch
```

The handoff packet records the stop point, failed check, test command, verify command, and retry commands.

## Common Stop Points

- `scope_rejected`: patch touched paths outside the allowed change scope
- `test_failed`: configured test command failed
- `verify_blocked`: deterministic verify gate returned blocking issues
- `budget_exhausted`: mediation budget was reached
- `stall_detected`: repeated attempts did not improve the outcome

The right next action is visible in the handoff packet. JiSpec should tell the reviewer whether to adopt, update policy, repay spec debt, revise the patch, or run verify again.
