# JiSpec Takeover Guide

Takeover is the path for bringing an existing repository under JiSpec control without pretending the first draft is automatically correct.

The working loop is:

```bash
npm run jispec -- bootstrap discover --root . --init-project
npm run jispec -- bootstrap draft --root .
npm run jispec -- adopt --root . --session latest --interactive
npm run jispec -- policy migrate --root .
npm run jispec -- verify --root .
```

## What Discovery Means

`bootstrap discover` writes local evidence under `.spec/facts/bootstrap/`.

Use the human summary first:

- `.spec/facts/bootstrap/bootstrap-summary.md`
- `.spec/facts/bootstrap/adoption-ranked-evidence.json`
- `.spec/facts/bootstrap/evidence-graph.json`

The evidence graph is not an adopted contract. It is input for review.

## What Draft Means

`bootstrap draft` creates a session under `.spec/sessions/<session>/`.

Common draft kinds:

- `domain` for vocabulary, aggregates, and ownership signals
- `api` for routes, schemas, and integration surfaces
- `feature` for behavior scenarios

Drafts are candidates. They become contract authority only after adoption.

## Adopt Decisions

Use `accept` when the draft is clearly supported by multiple strong signals and the owner agrees with the wording.

Good examples:

- domain vocabulary repeated in docs, routes, tests, and schemas
- API surface backed by route handlers and JSON schemas
- behavior scenario backed by tests and business documentation

Use `edit` when the draft is directionally right but needs owner language, narrower scope, or better names.

Good examples:

- an aggregate name is technical rather than business-owned
- an API draft includes the right endpoint but weak payload language
- a behavior scenario needs clearer Given/When/Then wording

Use `defer` when the signal is real but not ready to govern implementation.

Good examples:

- legacy exception needs product owner review
- schema exists but payload ownership is unclear
- behavior evidence is partial and should become spec debt

Use `reject` when the draft is unsupported, over-claimed, or based only on file names.

Good examples:

- a feature scenario repeats a route name without test or document support
- a domain object is inferred from a utility class
- a technical dependency is mistaken for a bounded context

## After Adopt

The important outputs are:

- `.spec/contracts/` for adopted contract assets
- `.spec/spec-debt/` for deferred work
- `.spec/handoffs/bootstrap-takeover.json` for machine-readable takeover state
- `.spec/handoffs/takeover-brief.md` for reviewer context
- `.spec/handoffs/adopt-summary.md` for the compact decision record

Run:

```bash
npm run jispec -- verify --root .
node --import tsx ./scripts/check-jispec.ts --root .
```

`verify` remains the deterministic local gate. Pending spec debt should be visible, not hidden.
