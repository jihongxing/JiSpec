# Greenfield Empty Directory Demo

This example proves the Greenfield initialization path from an empty target directory.

Run from the repository root:

```bash
node --import tsx scripts/run-greenfield-empty-directory-demo.ts --root .tmp/greenfield-empty-directory-demo --force
```

The demo uses `requirements.md` and `technical-solution.md` in this directory, initializes the target, runs JiSpec verify, and reports the first generated slice.

It writes the Greenfield review packet at:

- `.spec/greenfield/initialization-summary.md`
- `.spec/greenfield/change-mainline-handoff.md`
- `.spec/greenfield/change-mainline-handoff.json`

Use the summary and Markdown handoff as the human review packet. The JSON handoff remains the machine source of truth for the first `change` intent.
