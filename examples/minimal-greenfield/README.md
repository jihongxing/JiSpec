# Minimal Greenfield Example

This example starts from product input documents instead of an existing codebase.

Run from the JiSpec repository root:

```bash
npm run jispec -- init --root .tmp/minimal-greenfield --requirements examples/minimal-greenfield/requirements.md --technical-solution examples/minimal-greenfield/technical-solution.md --force --json
npm run jispec -- verify --root .tmp/minimal-greenfield --policy .spec/policy.yaml --json
node --import tsx ./scripts/check-jispec.ts --root .tmp/minimal-greenfield
```

Expected first review:

- inspect `.spec/greenfield/initialization-summary.md`
- review `.spec/greenfield/change-mainline-handoff.md`
- keep uncertain behavior or integration questions in spec debt until the owner confirms them

The generated `.github/workflows/jispec-verify.yml` remains a local CLI gate wrapper. It does not upload source code or put an LLM in the blocking path.
