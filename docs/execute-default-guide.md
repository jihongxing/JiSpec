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
npm run jispec -- doctor mainline
npm run jispec -- change default-mode show
```

`doctor mainline` explains blockers and owner actions. Missing policy, blocking verify results, damaged project config, or incomplete patch mediation should stop execute-default promotion.

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

External patch intake writes append-only audit evidence:

- an initial `external_patch_intake` event records scope/apply intake
- a completion `external_patch_intake` event records final test, post-verify, decision, and replay summaries

Reviewers can use the completion event to see the owner, stop point, failed check, next command, allowed paths, verify command, and replay command without treating the audit ledger as a blocking gate.

## Replay A Failed Attempt

```bash
npm run jispec -- implement --from-handoff .jispec/handoff/<change-session-id>.json --external-patch .jispec/patches/refund-v2.patch
```

The handoff packet records the stop point, failed check, test command, verify command, and retry commands.

The formatted handoff includes a `Decision snapshot` with current state, risk, evidence, owner, and next command. That block is for humans deciding the next action; the JSON handoff packet remains the replayable machine artifact.

## Common Stop Points

- `scope_check`: patch touched paths outside the allowed change scope
- `test`: configured test command failed
- `post_verify`: deterministic verify gate returned blocking issues, or verified the patch; the implementation outcome is `verify_blocked` when blockers remain
- `budget`: mediation budget was reached
- `stall`: repeated attempts did not improve the outcome

The right next action is visible in the handoff packet. JiSpec should tell the reviewer whether to adopt, update policy, repay spec debt, revise the patch, or run verify again.
