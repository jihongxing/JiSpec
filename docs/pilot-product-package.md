# JiSpec Pilot Product Package

The pilot product package is a local adoption companion for teams trying JiSpec for the first time. It bundles the install path, guided first run, first baseline, CI verify, Console governance, privacy report, and `doctor pilot` gate into one reviewable artifact.

```bash
npm run jispec -- pilot package --root .
npm run jispec -- pilot package --root . --json
```

This writes:

- `.spec/pilot/package.json`
- `.spec/pilot/package.md`

The package does not upload source, require cloud tokens, replace `verify`, or replace `doctor pilot`.

## Mainline Gates

These steps decide whether the repo is actually ready:

- first baseline: bootstrap takeover or Greenfield current baseline
- CI verify: `npm run ci:verify`
- pilot gate: `npm run pilot:ready` or `npm run jispec -- doctor pilot`

## Governance Companions

These steps help reviewers decide what to do, but they are not gate authority:

- guided first-run
- Console governance snapshot
- privacy report and redacted companions
- pilot product package

## Adoption Path

The package records seven stable steps:

1. install local CLI entry
2. run guided first-run
3. commit the first baseline
4. run CI verify
5. export Console governance
6. generate privacy report
7. run `doctor pilot`

Every missing step includes an owner action, next command, and source artifact references.
