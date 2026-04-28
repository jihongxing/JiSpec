# Greenfield Empty Directory Demo

This example proves the Greenfield initialization path from an empty target directory.

Run from the repository root:

```bash
node --import tsx scripts/run-greenfield-empty-directory-demo.ts --root .tmp/greenfield-empty-directory-demo --force
```

The demo uses `requirements.md` and `technical-solution.md` in this directory, initializes the target, runs JiSpec verify, and reports the first generated slice.
