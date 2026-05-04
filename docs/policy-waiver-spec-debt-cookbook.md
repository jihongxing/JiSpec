# Policy, Waiver, And Spec Debt Cookbook

This is now a short index.

Use it for `waiver create`, `waiver renew`, `waiver revoke`, `spec-debt repay`, `spec-debt cancel`, and `spec-debt owner-review`.
It also keeps `release snapshot` and `release compare` visible for release hygiene.
It also points to `console actions` for governance follow-up.

Use these commands when you need the governance surface:

```bash
npm run jispec -- policy migrate --root .
npm run jispec -- waiver list --root .
npm run jispec -- spec-debt owner-review <debt-id> --root .
npm run jispec -- release compare --root . --from v1 --to current
npm run jispec -- console dashboard --root .
```
