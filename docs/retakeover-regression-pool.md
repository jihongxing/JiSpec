# JiSpec Retakeover 回归池

This is now a short index.

Run these commands for the pool and its stress demo:

```bash
node --import tsx ./tools/jispec/tests/bootstrap-retakeover-regression.ts
node --import tsx ./tools/jispec/tests/bootstrap-messy-legacy-takeover.ts
node --import tsx ./scripts/run-messy-legacy-takeover-demo.ts --force
```
