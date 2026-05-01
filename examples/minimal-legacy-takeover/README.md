# Minimal Legacy Takeover Example

This is the smallest legacy-repo shape for a first JiSpec takeover.

It intentionally has implementation clues before JiSpec contracts:

- one route module
- one service module
- one JSON schema
- one coarse test
- one operations note that explains an existing legacy exception

Run from the JiSpec repository root:

```bash
npm run jispec -- bootstrap discover --root examples/minimal-legacy-takeover --init-project --json
npm run jispec -- bootstrap draft --root examples/minimal-legacy-takeover --json
npm run jispec -- adopt --root examples/minimal-legacy-takeover --session latest --interactive
npm run jispec -- policy migrate --root examples/minimal-legacy-takeover --json
npm run jispec -- verify --root examples/minimal-legacy-takeover --json
node --import tsx ./scripts/check-jispec.ts --root examples/minimal-legacy-takeover
```

Recommended first adoption decisions:

- accept the domain draft when it matches the billing vocabulary
- defer the API draft as spec debt until the invoice payload is reviewed
- reject weak behavior drafts if they only repeat route names

The CI gate is local-first. It reads local JiSpec artifacts, writes `.jispec-ci/`, and does not upload source code.
