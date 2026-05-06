# Policy Presets

Policy presets are starting templates for `.spec/policy.yaml`. They do not create new governance profiles. Every preset is built on one stable base profile:

- `solo`
- `small_team`
- `regulated`

Preset selection is meant to answer: "Which governance posture is the best starting point for this repo?" After applying a preset, teams can still edit the resulting policy file directly.

Use [./policy-waiver-spec-debt-cookbook.md](./policy-waiver-spec-debt-cookbook.md) as the overview page for the broader policy/governance workflow.

## CLI

```bash
npm run jispec-cli -- policy list-presets
npm run jispec-cli -- policy migrate --preset fintech
```

You can still pass `--profile`, but it must agree with the preset base profile:

```bash
npm run jispec-cli -- policy migrate --profile regulated --preset fintech
```

If `--profile` and `--preset` disagree, JiSpec fails instead of silently overriding one with the other.

## How To Choose

- If you need stronger audit, tighter waiver expiry, or conservative release posture, start with a `regulated` preset.
- If you want a balanced product-team default, start with a `small_team` preset.
- If you need the lightest operational posture, stay with a plain `solo` or `small_team` profile instead of overfitting a preset.

Quick guide:

- Financial systems or heavy change control: `fintech`
- SOX-style audit and explicit execution disablement: `sox-compliance`
- Fast-moving startup loops: `startup-fast-iteration`
- General SaaS product delivery: `saas-default`
- Maintainer-led community repositories: `open-source-maintainer`

## Presets

### `fintech`

- Base profile: `regulated`
- Best for: financial systems, approval-heavy changes, audit-sensitive releases
- Main posture:
  - shorter waiver window
  - blocking policy and contract drift
  - clean verify required before execute-default

### `startup-fast-iteration`

- Base profile: `small_team`
- Best for: early-stage product teams, rapid iteration, lightweight governance
- Main posture:
  - relaxed waiver expiration
  - release snapshot and compare can stay off by default
  - higher execute-default budget

### `sox-compliance`

- Base profile: `regulated`
- Best for: SOX-style audit chains and explicit separation of duties
- Main posture:
  - very short waiver window
  - blocking release drift posture
  - `execute_default.allowed: false`

### `saas-default`

- Base profile: `small_team`
- Best for: steady SaaS delivery with moderate governance
- Main posture:
  - release snapshot and compare enabled
  - blocking contract graph drift
  - moderate execute-default budget

### `open-source-maintainer`

- Base profile: `small_team`
- Best for: maintainer-reviewed repositories with public-facing release hygiene
- Main posture:
  - review-friendly waiver and release posture
  - greenfield review gate enabled for lower-confidence changes
  - no new governance profile introduced

## Preset vs Profile

- A `profile` is part of the stable policy contract.
- A `preset` is only a convenience layer that picks one stable profile and adds override values.
- Presets must stay expressible through existing policy fields. They must not require schema changes just to exist.

## Customizing After Apply

The recommended workflow is:

1. Pick the closest preset.
2. Run `policy migrate --preset <id>`.
3. Review the generated `.spec/policy.yaml`.
4. Adjust owner, reviewers, or specific policy fields for the repository.

Presets are intended to lower the cost of choosing a starting posture, not to eliminate policy review.
