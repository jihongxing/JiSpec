# Policy Operations Guide

Use this as the policy and governance landing page.

This page is intentionally the overview layer. It tells you which policy doc to open next and which command family owns each governance task.

## Which Policy Doc Should I Read?

- Choose a starting posture for `.spec/policy.yaml`:
  [policy-presets.md](./policy-presets.md)
- Understand approval records and reviewer posture:
  [policy-approval-workflow.md](./policy-approval-workflow.md)
- Inspect governance state, owner actions, and exports:
  [../console-governance-guide.md](../console-governance-guide.md)

## Main Jobs

### 1. Create Or Normalize Policy

Use this when the repo does not have `.spec/policy.yaml` yet, or when you want to re-anchor it on the current stable facts contract.

```bash
npm run jispec -- policy migrate --root .
npm run jispec -- policy migrate --root . --preset fintech
```

`policy migrate` creates or normalizes the file.
`--preset` chooses a starting posture but does not introduce a new stable profile.

### 2. Manage Waivers

Use waivers when a known issue is temporarily accepted and must stay explicit.

Typical commands:

```bash
npm run jispec -- waiver list --root .
npm run jispec -- waiver create --issue-code <code> --owner <owner> --reason <reason> --root .
npm run jispec -- waiver renew <waiver-id> --reason <reason> --root .
npm run jispec -- waiver revoke <waiver-id> --reason <reason> --root .
```

### 3. Manage Spec Debt

Use spec debt when a contract area is real but not ready to govern implementation yet.

Typical commands:

```bash
npm run jispec -- spec-debt owner-review <debt-id> --root .
npm run jispec -- spec-debt repay <debt-id> --root .
npm run jispec -- spec-debt cancel <debt-id> --root .
```

### 4. Check Release Hygiene

Use release commands when the current state needs to be compared against a named baseline.

```bash
npm run jispec -- release snapshot --root . --version v1
npm run jispec -- release compare --root . --from v1 --to current
```

### 5. Inspect Governance State

Use Console when you want the current local governance state summarized before choosing the next write command.

```bash
npm run jispec -- console dashboard --root .
npm run jispec -- console actions --root .
```

## Suggested Reading Order

1. Start with [policy-presets.md](./policy-presets.md) if the repo has no policy yet.
2. Use [policy-approval-workflow.md](./policy-approval-workflow.md) when the team needs explicit approval records.
3. Return here for waiver, spec debt, release, and Console command families.

## Boundary

These commands help express governance posture, but they do not replace `verify` or `ci:verify`.
