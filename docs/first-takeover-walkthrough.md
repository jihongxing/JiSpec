# First Takeover Walkthrough

This walkthrough is for a small team trying JiSpec on an existing repository for the first time.

Target time: about 15 minutes on the minimal sample.

## 1. Prepare

```bash
npm install
npm run jispec -- --version
npm run jispec -- doctor v1
```

No cloud account or source upload is required.

## 2. Discover Evidence

```bash
npm run jispec -- bootstrap discover --root examples/minimal-legacy-takeover --init-project --json
```

Key outputs:

- `.spec/facts/bootstrap/evidence-graph.json`
- `.spec/facts/bootstrap/bootstrap-summary.md`
- `jiproject/project.yaml`

Use the summary to decide whether the first contracts should start from domain, API, behavior, or a smaller subset.

## 3. Draft Contracts

```bash
npm run jispec -- bootstrap draft --root examples/minimal-legacy-takeover --json
```

Key outputs:

- `.spec/sessions/<session>/manifest.json`
- `.spec/sessions/<session>/drafts/domain.yaml`
- `.spec/sessions/<session>/drafts/api_spec.json`
- `.spec/sessions/<session>/drafts/behaviors.feature`

The drafts are candidates. They are not treated as adopted contracts until a human adopts them.

## 4. Adopt, Defer, Or Reject

```bash
npm run jispec -- adopt --root examples/minimal-legacy-takeover --session latest --interactive
```

Recommended choices for the minimal legacy sample:

- accept the domain draft if the vocabulary matches billing ownership
- defer the API draft as spec debt while the invoice payload is reviewed
- reject weak behavior drafts when the evidence only repeats route names

Key outputs:

- `.spec/contracts/`
- `.spec/spec-debt/`
- `.spec/handoffs/bootstrap-takeover.json`
- `.spec/handoffs/takeover-brief.md`
- `.spec/handoffs/adopt-summary.md`

## 5. Add Policy And Verify

```bash
npm run jispec -- policy migrate --root examples/minimal-legacy-takeover --json
npm run jispec -- verify --root examples/minimal-legacy-takeover --json
```

Pending spec debt should appear as advisory unless a policy marks it blocking. Current contract violations remain blocking.

## 6. Run CI Verify Locally

```bash
node --import tsx ./scripts/check-jispec.ts --root examples/minimal-legacy-takeover
```

Key outputs:

- `.jispec-ci/verify-report.json`
- `.jispec-ci/ci-summary.md`
- `.jispec-ci/verify-summary.md`

CI should call this same wrapper. See `docs/ci-templates.md`.

## 7. Handoff Packet

After `adopt` and later `change` or `implement` runs, use the handoff packet to decide the next owner action:

- reviewer accepts, edits, rejects, or defers first contracts
- implementer receives focused allowed paths, test command, verify command, and stop point
- CI remains the deterministic gate

Human-facing summaries now start with the same decision snapshot shape: current state, risk, evidence, owner, and next command. Use that block for review triage, then use the JSON/YAML artifacts named in the summary as the machine source of truth.

JiSpec does not become the business-code author. It keeps the contract, scope, test, verify, audit, and replay boundary stable.
