# Greenfield Walkthrough

This walkthrough is for starting a new repository from product and technical input documents.

Target time: about 15 to 30 minutes for the minimal sample.

## 1. Prepare Inputs

Create or choose:

- requirements document
- technical solution document

Example inputs live under `examples/minimal-greenfield/`.

## 2. Initialize

```bash
npm run jispec -- init \
  --root .tmp/minimal-greenfield \
  --requirements examples/minimal-greenfield/requirements.md \
  --technical-solution examples/minimal-greenfield/technical-solution.md \
  --force
```

Key outputs:

- `jiproject/project.yaml`
- `.spec/greenfield/`
- `.spec/baselines/current.yaml`
- `.spec/policy.yaml`
- `.github/workflows/jispec-verify.yml`

## 3. Review The Handoff

Read:

- `.spec/greenfield/initialization-summary.md`
- `.spec/greenfield/change-mainline-handoff.md`

These are human review companions. The machine source of truth remains the JSON/YAML artifacts under `.spec/`.

## 4. Verify Locally

```bash
npm run jispec -- verify --root .tmp/minimal-greenfield
npm run ci:verify
```

`verify` and `ci:verify` remain the deterministic gates. Greenfield review packets and Console views help owners decide what to change next, but they do not replace the gate.

## 5. Package For Pilot

```bash
npm run jispec -- console export-governance --root .tmp/minimal-greenfield
npm run jispec -- privacy report --root .tmp/minimal-greenfield
npm run jispec -- pilot package --root .tmp/minimal-greenfield
npm run jispec -- doctor pilot --root .tmp/minimal-greenfield
```

The pilot package is local-only and does not upload source.

If you want the empty-directory acceptance smoke that exercises the same path end-to-end, start from [`examples/greenfield-empty-directory/README.md`](../examples/greenfield-empty-directory/README.md) and `scripts/run-greenfield-empty-directory-demo.ts`.
