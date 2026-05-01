# Billing Operations Notes

The billing service creates invoices after an order is approved.

Known first-takeover decisions:

- invoice creation is a candidate adopted domain contract
- invoice waiver remains a legacy exception until billing ownership reviews it
- the waiver path should be tracked as spec debt, not silently treated as an adopted behavior

Suggested waiver exercise:

```bash
npm run jispec -- waiver create BOOTSTRAP_SPEC_DEBT_PENDING --root . --path .spec/spec-debt/latest/api.json --reason "Billing owner review pending"
```
