# Policy, Waiver, And Spec Debt Cookbook

This cookbook covers the common governance commands a team needs after first takeover.

## Policy

Create or normalize policy:

```bash
npm run jispec -- policy migrate --root . --profile solo --owner <owner> --reviewer <reviewer> --actor <name> --reason "Initialize JiSpec policy"
```

Profiles:

- `solo` for one-person or prototype repos
- `small_team` for shared ownership and lightweight review
- `regulated` for stricter reviewer and waiver posture

Check the result:

```bash
npm run jispec -- verify --root . --json
npm run jispec -- console dashboard --root .
```

Unknown or deprecated policy keys should be explainable and nonblocking unless a current policy rule explicitly makes them blocking.

## Waiver

Create a waiver for a known verify issue:

```bash
npm run jispec -- waiver create --root . --code POLICY_REQUIRE_API_CONTRACT --path .spec/contracts/api.yaml --owner <owner> --reason "API contract owner review pending" --expires-at 2026-06-01
```

List waivers:

```bash
npm run jispec -- waiver list --root .
```

Renew a waiver:

```bash
npm run jispec -- waiver renew <waiver-id> --root . --actor <name> --reason "Owner review still pending" --expires-at 2026-07-01
```

Revoke a waiver:

```bash
npm run jispec -- waiver revoke <waiver-id> --root . --actor <name> --reason "Contract adopted"
```

Waivers are for known, owned exceptions. They should have owners, reasons, and expiration dates.

## Spec Debt

Mark a spec debt item for owner review:

```bash
npm run jispec -- spec-debt owner-review <debt-id> --root . --actor <name> --reason "Needs product owner decision"
```

Repay spec debt:

```bash
npm run jispec -- spec-debt repay <debt-id> --root . --actor <name> --reason "Contract adopted"
```

Cancel spec debt:

```bash
npm run jispec -- spec-debt cancel <debt-id> --root . --actor <name> --reason "No longer part of scope"
```

Spec debt is not failure by itself. It is unresolved contract work that must stay visible.

## Release Drift

Freeze a release baseline:

```bash
npm run jispec -- release snapshot --root . --version v1 --actor <name> --reason "Freeze V1 baseline"
```

Compare drift:

```bash
npm run jispec -- release compare --root . --from v1 --to current --actor <name> --reason "Pre-release drift review"
```

Review:

- `.spec/releases/compare/`
- `.spec/releases/drift-trend.json`
- `.spec/releases/drift-trend.md`

Release compare is evidence for review. It does not replace `verify`.

## Console Entry

Use Console to see suggested governance actions:

```bash
npm run jispec -- console dashboard --root .
npm run jispec -- console actions --root .
```

Console suggestions are read-only. Run the explicit CLI command when a human decides to write.
