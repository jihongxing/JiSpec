# JiSpec

English | [中文](./README.zh-CN.md)

JiSpec is building a `contract-driven assembly line for AI-native software delivery` for small AI-native engineering teams.

North star:

> Move AI coding from a heroic craft workshop into a verifiable, auditable, blockable, and replayable modern software delivery line.

Large language models and AI coding tools are high-end machine tools. JiSpec is not trying to be another machine tool; it aims to become the control layer across requirements, contracts, implementation, verification, CI, and team governance.

See: [docs/north-star.md](docs/north-star.md)

The product surface is converging on:

- `JiSpec-CLI`
  Local-first contract verification and developer-facing workflow commands
- `JiSpec-Console`
  Team policy, audit, waiver, and contract-drift control plane

Today, this repository already contains a deep protocol and pipeline engine. The current codebase still exposes a legacy `slice/context` command surface, but the primary product direction is:

`bootstrap discover -> bootstrap draft -> adopt -> verify -> change -> implement`

## V1 release status

Based on the current mainline, the golden-path E2E, and two real legacy-repo takeover demos, this repository is now in a state where it can be released as a **scoped V1 mainline build**.

What that means:

- the V1 mainline is real and working:
  `bootstrap discover -> bootstrap draft -> adopt -> verify -> ci:verify -> change -> implement`
- the product already proves the V1 `Aha Moment` on real repositories:
  it can generate the first contract draft bundle quickly enough that a human adopts and re-anchors it instead of authoring everything from scratch
- `verify` already understands the difference between historical debt, deferred spec debt, and current blocking issues

What that does **not** mean:

- this is not yet a "high-quality fully automatic contract generation" release
- complex repositories still need human-guided `domain/api` correction during adopt
- `feature` drafts are still materially weaker than `domain` and `api` drafts on noisy repos
  and are review-gated when the supporting evidence is thin

The right release framing for this build is:

- `V1 mainline`
- `human-guided legacy repo takeover`
- `local-first contract verification and CI gate`

Not the wrong framing:

- `fully automatic legacy repo understanding`
- `LLM-first blocking gate`
- `mature console/distributed/collaboration product suite`

Release notes:

- [docs/releases/v0.1.0.md](docs/releases/v0.1.0.md)

## Human-readable artifact gap

The two `C8` runs exposed one more important product truth:

the mainline can already write the right artifacts, but many of those artifacts are still `machine-first`, not `human-first`.

Today, JiSpec can already persist:

- full bootstrap evidence graphs
- non-excluded full inventories
- adoption-ranked evidence packets
- draft session manifests
- adopted contracts and spec-debt records
- takeover reports, takeover briefs, and adopt summaries
- verify JSON reports, verify summaries, and CI summaries

That is technically valuable, and the takeover path now makes the split explicit:

- `evidence-graph.json` and `full-inventory.json` are machine-first system records
- `adoption-ranked-evidence.json` is the high-signal packet used by draft and takeover review
- `bootstrap-summary.md` is the preferred human-readable discover summary; `evidence-summary.txt` remains a compatibility alias
- `takeover-brief.md` is the human decision packet a reviewer can scan in minutes
- `adopt-summary.md` is the compact adoption digest for accepted, edited, rejected, and deferred draft decisions
- `verify-summary.md` is the compact decision digest for mergeability, blockers, advisory debt, and next action; Greenfield reports use the same language for policy, contract graph, spec delta, spec debt, and implementation fact ratchets

The post-V1 north-star task plan has closed the adopt summary, verify summary, bootstrap-summary naming, and Greenfield verify-summary language work. The remaining work is no longer "make summaries exist"; it is to keep making mainline summaries shorter, sharper, and closer to the reviewer's actual decision path.

The desired output model should become:

1. `Machine-readable artifacts`

- exhaustive JSON and contract files remain the system of record
- automation, CI, and future policy engines continue to depend on them

2. `Human-readable companion artifacts`

- every major mainline step should also emit a compact explanation layer by default
- examples:
  `bootstrap-summary.md`
  `adopt-summary.md`
  `verify-summary.md`
  `takeover-brief.md`

The end-state rule is:

`raw evidence for machines, distilled decision packets for humans`

## Discover optimization plan

The biggest gap exposed by the two `C8` runs is not "mainline missing", but "discover evidence quality still too noisy on hard repos".

Current failure pattern:

- vendored dependencies, audit mirrors, cache directories, and generated assets can dominate evidence ranking
- `discover` is still better at producing a broad inventory than a sharp takeover summary
- `draft` quality degrades when the evidence graph is numerically dominated by non-product files

The optimization path should evolve in three steps:

1. `Noise suppression`

- aggressively ignore vendored, mirrored, cache, build, audit, and dependency-bundle directories by default
- treat repositories like `artifacts/dpi-audit/.pydeps/**` as exclusion candidates unless the user explicitly opts in
- separate `inventory evidence` from `adoption-ranked evidence` so large repositories do not drown the first takeover loop

2. `Boundary-first ranking`

- rank `README`, governance docs, protocol docs, manifests, controllers, service entrypoints, and schema truth sources above bulk file count
- infer candidate bounded contexts from component structure, not just route/file frequency
- distinguish `explicit endpoint`, `module surface inference`, and `weak candidate` so drafts stop flattening all evidence into the same class

3. `Takeover-grade summaries`

- write a compact "top evidence for first adoption" artifact alongside the full evidence graph
- cap default draft input to the highest-value contract signals unless the user asks for exhaustive mode
- emit a human-readable takeover brief by default, not only a large machine-oriented evidence graph
- make `discover` answer:
  "what are the first 3-10 assets this team should adopt?"
  instead of only:
  "what files did the scanner see?"

The short version:

`discover` should evolve from `repository inventory` toward `takeover-oriented evidence prioritization`.

## Product end state evolution

The product should be read as an intentionally staged evolution, not as a pile of unrelated surfaces.

### Stage 1: Current V1 mainline

Goal:

- help a small AI-native team take over an old repo without writing the first contract set from scratch

Working loop:

- `discover -> draft -> adopt -> verify -> ci:verify`
- daily changes continue through `change -> implement -> verify`

Human role:

- review and re-anchor the first contracts
- decide what becomes adopted contract vs spec debt

### Stage 2: Better takeover intelligence

Goal:

- reduce the amount of manual repair needed during adopt

Expected improvements:

- higher-signal discover ranking
- stronger deterministic draft quality
- better behavior-contract synthesis
- feature scenarios stay review-gated or deferred when behavior evidence is thin
- fewer noisy artifacts entering the first adoption bundle
- human-readable summaries become first-class outputs rather than after-the-fact interpretation docs

Human role:

- still in the loop, but editing becomes lighter and more selective

### Stage 3: Execute-default mainline

Goal:

- make `change / implement` feel like one coherent workflow instead of two adjacent commands

Expected product shape:

- `prompt` and `execute` both remain available
- `execute` becomes the default product posture
- bootstrap state, verify gate, lane choice, and implementation handoff all speak one stable contract

Human role:

- choose mode and approve boundaries, not manually chain every step

### Stage 4: End-state product

Goal:

- JiSpec becomes the contract control layer for an AI-native team operating real repositories over time

End-state characteristics:

- first takeover is fast
- ongoing change stays inside contract-aware lanes
- verify is deterministic and CI-native
- policy, waiver, and facts form the stable governance surface
- console and collaboration surfaces sit on top of an already-proven mainline instead of compensating for a weak core

The key sequencing rule is:

`core mainline first, surrounding surfaces second`

That is why `console / distributed / collaboration / direct LLM blocking path` remain intentionally de-prioritized until the takeover-and-gate core is stronger.

## What works today

The current first-class entry points in this build are:

```bash
npm run verify
npm run jispec-cli -- change "Update checkout copy"
npm run jispec-cli -- change default-mode show
npm run jispec-cli -- change default-mode set execute --actor <name> --reason <reason>
npm run jispec-cli -- change default-mode reset
npm run jispec-cli -- implement
npm run jispec-cli -- implement --fast
npm run jispec-cli -- bootstrap init-project
npm run jispec-cli -- bootstrap discover
npm run jispec-cli -- bootstrap draft
npm run jispec-cli -- adopt --interactive
npm run jispec-cli -- verify --json
npm run jispec-cli -- policy migrate
npm run jispec-cli -- release snapshot --version v1
npm run jispec-cli -- release compare --from v1 --to current
npm run jispec-cli -- doctor v1
npm run jispec-cli -- doctor runtime
npm run jispec-cli -- doctor pilot
npm run jispec-cli -- metrics value-report
npm run ci:verify
```

What they do:

- `bootstrap init-project`
  Creates a minimal `jiproject/project.yaml` scaffold; existing files are protected unless `--force` is passed.
- `bootstrap discover`
  Scans the repository and writes `.spec/facts/bootstrap/evidence-graph.json`, `full-inventory.json`, `adoption-ranked-evidence.json`, `bootstrap-summary.md`, and the compatibility `evidence-summary.txt`; use `--init-project` to create the project scaffold first when it is missing.
  By default it excludes vendor, cache, build, coverage, audit mirror, generated, and tool-mirror noise; use `--include-noise` for explicit forensic/exhaustive scans.
- `bootstrap draft`
  Converts ranked bootstrap evidence into a session-scoped draft bundle under `.spec/sessions/`; deterministic generation is always available, and a configured BYOK provider may only re-anchor draft content.
- `adopt --interactive`
  Lets you accept, reject, edit, or defer that draft bundle into `.spec/contracts/` and `.spec/spec-debt/`, then writes `.spec/handoffs/bootstrap-takeover.json`, `.spec/handoffs/takeover-brief.md`, and `.spec/handoffs/adopt-summary.md`.
- `change`
  Records change intent, classifies the active diff into fast or strict lane, and writes the active change session.
- `implement`
  Mediates an active change session through bounded handoff or an external patch file, then returns to verify. JiSpec does not generate business code.
  JiSpec also records Agent Discipline evidence for AI or external coding tool attempts. The artifacts under `.jispec/agent-run/<session-id>/` show whether the work followed phase, scope, test strategy, debug, completion, and review discipline. They make "done" evidence-based, while `verify` and `ci:verify` remain the deterministic delivery gate.
- `verify`
  Runs the current deterministic repository verification path, auto-loads `.spec/policy.yaml` when present, emits the four-state verdict surface, and writes `.spec/handoffs/verify-summary.md`.
- `policy migrate`
  Scaffolds or normalizes the minimal YAML policy surface at `.spec/policy.yaml`, pins it to the current facts contract version, and adds the minimal `team.profile` governance surface.
- `waiver create|list|revoke`
  Records, inspects, or revokes auditable verify waivers. Waivers downgrade only matching issues; unmatched blocking issues remain blocking.
- `release snapshot|compare`
  Freezes release baselines and compares baseline refs with a compact drift summary across contract graph, static collector, and policy surfaces.
- `doctor v1`
  Runs the V1 mainline readiness checks without letting deferred distributed or collaboration surfaces block the result.
- `doctor runtime`
  Runs broader runtime and compatibility health diagnostics outside the V1 mainline readiness gate.
- `doctor pilot`
  Checks commercial pilot readiness for a repository: installation path, first takeover baseline, CI verify, policy profile, waiver/spec debt hygiene, Console governance snapshot, and privacy report.
- `pilot package`
  Writes `.spec/pilot/package.json` and a Markdown companion that bundle install, first-run, first baseline, CI verify, Console governance, privacy report, and `doctor pilot` into a local adoption path.
- `north-star acceptance`
  Writes `.spec/north-star/acceptance.json`, `.spec/north-star/acceptance.md`, and per-scenario decision packets for the final local acceptance suite. It covers legacy takeover, Greenfield, daily change, external patch mediation, policy waiver, release drift, Console governance, multi-repo aggregation, and privacy report without replacing existing gates.
- `pilot:ready`
  Runs the repeatable pilot readiness gate for local or CI use; failures print blocker owner actions and next commands, and `--json` returns the underlying `doctor pilot` report.
- `metrics value-report`
  Writes a repo-local ROI and adoption report under `.spec/metrics/`, with traceable local artifact sources and no default network access.
- `ci:verify`
  Wraps the repository verification path for CI usage and writes `.jispec-ci/verify-report.json`, `.jispec-ci/ci-summary.md`, and `.jispec-ci/verify-summary.md`.

## AI boundary rule

LLMs may assist draft, explanation, and repair. Blocking gates remain deterministic.

In the bootstrap path, a BYOK provider is treated as a semantic re-anchoring helper: it can improve human-readable draft `content`, but the deterministic baseline owns `relativePath`, `sourceFiles`, `confidenceScore`, and `provenanceNote`. If the provider is unavailable or returns malformed output, JiSpec falls back to deterministic draft generation and records `generationMode = "provider-fallback"`.

The gate side stays deliberately boring: `verify`, `ci:verify`, policy checks, schema validation, and future AST-backed blockers must remain deterministic and scriptable.

Waivers are lifecycle records, not silent ignores. Created waivers carry owner, reason, matcher, status, optional expiration, and optional revocation metadata. Verify summaries report matched waivers and lifecycle counts so teams can see expired, revoked, invalid, and unmatched active waivers.

## Quickstart

Install dependencies:

```bash
npm install
```

See the current CLI surface:

```bash
npm run jispec-cli -- --help
```

Run repository verification locally:

```bash
npm run verify
```

This also writes `.spec/handoffs/verify-summary.md`, a human-readable companion summary. The machine-readable contract remains `verify --json`.

Record a change and let JiSpec decide the lane:

```bash
npm run jispec-cli -- change "Add order refund validation"
```

Record a change in prompt mode and review next-step hints manually:

```bash
npm run jispec-cli -- change "Add order refund validation" --mode prompt
```

Record a change in execute mode and let JiSpec continue into implement/verify when the lane allows it:

```bash
npm run jispec-cli -- change "Add order refund validation" --mode execute
```

This repository now uses execute-default for `change` calls that omit `--mode`:

```yaml
change:
  default_mode: execute
```

in `jiproject/project.yaml`. Explicit `--mode prompt` or `--mode execute` still wins over project config, and strict-lane changes still pause at the adopt boundary when an open bootstrap draft exists.

Run strict implementation mediation:

```bash
npm run jispec-cli -- implement
```

Run fast implementation mediation for a session that stayed on fast lane:

```bash
npm run jispec-cli -- implement --fast
```

Mediate an external patch produced by a human or AI coding tool:

```bash
npm run jispec-cli -- implement --external-patch .jispec/patches/refund.patch
```

Resume a failed execute/implement attempt from its handoff packet:

```bash
npm run jispec-cli -- implement --from-handoff .jispec/handoff/<change-session-id>.json --external-patch .jispec/patches/refund.patch
```

Implementation mediation JSON uses stable outcome names:

`preflight_passed`, `external_patch_received`, `patch_verified`, `patch_rejected_out_of_scope`, `budget_exhausted`, `stall_detected`, `verify_blocked`.

Inspect the machine-readable verify contract:

```bash
npm run jispec-cli -- verify --json
```

Scaffold or refresh the minimal policy file:

```bash
npm run jispec-cli -- policy migrate
```

The migrated policy pins `requires.facts_contract`, includes `team.profile`, and normalizes known deprecated keys such as `facts_contract` and `team_profile`. Unknown facts, unknown policy keys, and deprecated keys are reported as deterministic nonblocking policy issues during `verify`.

Create the explicit project scaffold when taking over a legacy repo:

```bash
npm run jispec-cli -- bootstrap init-project
```

Run bootstrap discovery:

```bash
npm run jispec-cli -- bootstrap discover
```

This writes the machine inventory, ranked takeover packet, and `bootstrap-summary.md` under `.spec/facts/bootstrap/`.

Draft the first contract bundle:

```bash
npm run jispec-cli -- bootstrap draft
```

This works without an LLM provider. If BYOK draft assistance is configured, it can re-anchor draft language while deterministic provenance stays authoritative.

Adopt the drafted bundle:

```bash
npm run jispec-cli -- adopt --interactive
```

This writes adopted contracts, deferred spec debt, the machine takeover report, the human-readable takeover brief, and the compact adopt summary.

For Greenfield projects, initialization also writes `.spec/greenfield/change-mainline-handoff.json` and `.spec/greenfield/change-mainline-handoff.md`. These files turn the first generated slice into a traceable `change` intent for implementation mediation; JiSpec still only constrains, records, and verifies external implementation work. Greenfield verify and CI summaries use the shared verify-summary decision vocabulary rather than a separate explanation model.

Run the CI wrapper:

```bash
npm run ci:verify
```

This writes `.jispec-ci/verify-report.json`, `.jispec-ci/ci-summary.md`, and `.jispec-ci/verify-summary.md`.

Freeze and compare release baselines:

```bash
npm run jispec-cli -- release snapshot --version v1
npm run jispec-cli -- release compare --from v1 --to current
```

`release compare` writes JSON and Markdown reports under `.spec/releases/compare/`, with drift split into contract graph, static collector, and policy categories.

Replay the minimal legacy-repo takeover sample:

```bash
node --import tsx ./scripts/run-v1-sample-repo.ts --workspace ./.tmp/v1-sample-run
```

Run the P4 first-adoption samples directly:

```bash
npm run jispec -- bootstrap discover --root examples/minimal-legacy-takeover --init-project --json
npm run jispec -- init --root .tmp/minimal-greenfield --requirements examples/minimal-greenfield/requirements.md --technical-solution examples/minimal-greenfield/technical-solution.md --force --json
```

For a step-by-step first takeover and CI setup, see [docs/first-takeover-walkthrough.md](docs/first-takeover-walkthrough.md) and [docs/ci-templates.md](docs/ci-templates.md).

When unsure where to start in a repository:

```bash
npm run jispec -- first-run --root .
```

Run health checks:

```bash
npm run jispec-cli -- doctor v1
npm run jispec-cli -- doctor runtime
npm run jispec-cli -- doctor pilot
```

Generate a repo-local adoption value report:

```bash
npm run jispec-cli -- metrics value-report
```

Run the broader runtime and compatibility health checks:

```bash
npm run jispec-cli -- doctor runtime
```

## Verify verdicts

`verify` now returns a stable four-state verdict contract:

- `PASS`
- `FAIL_BLOCKING`
- `WARN_ADVISORY`
- `ERROR_NONBLOCKING`

For local and future CI/automation consumers, `npm run jispec-cli -- verify --json` is the stable machine-readable entry point. `npm run ci:verify` remains the current wrapper used by existing team workflows.

When `.spec/policy.yaml` exists, `verify` loads it automatically. Use `npm run jispec-cli -- verify --facts-out .spec/facts/latest-canonical.json` to snapshot the canonical facts surface that policy evaluation reads.

## Compatibility surface

This repository still exposes a working legacy protocol/runtime layer built around `slice`, `context`, `trace`, `artifact`, `agent`, `pipeline`, `template`, and `dependency`.

Examples:

```bash
npm run jispec-cli -- slice check ordering-checkout-v1
npm run jispec-cli -- slice plan ordering-checkout-v1 --force
npm run jispec-cli -- context board ordering
npm run jispec-cli -- trace show ordering-checkout-v1
npm run jispec-cli -- artifact derive-all ordering-checkout-v1 --force
npm run jispec-cli -- pipeline run ordering-checkout-v1
```

This surface is still valuable and supported, but it should be read as the compatibility/runtime layer behind the newer `JiSpec-CLI` product direction, not as the primary user entry point.

Compatibility aliases still kept for older workflows:

```bash
npm run jispec -- <command>
npm run validate:repo
npm run check:jispec
npm run jispec-cli -- validate
```

## Change And Implement

`change` and `implement` are now part of the first-class CLI workflow.

Current reality in this build:

- `change` supports both `prompt` and `execute`; this repository now uses `change.default_mode: execute` in `jiproject/project.yaml`
- `implement` is implementation mediation: it constrains, receives, records, and verifies external implementation attempts rather than acting as an autonomous business-code generator
- the next mainline focus is not more command surface, but making execute handoff quality and retakeover decision packets easier for humans to judge

Current mode split:

- `change --mode prompt`
  Writes the change session, classifies the lane, and returns `nextCommands` without executing downstream steps.
- `change --mode execute`
  Tries to continue the mainline automatically:
  fast lane runs through `implement --fast -> verify --fast`, while strict lane either enters `implement -> verify` or pauses at the explicit `adopt` boundary when a bootstrap draft is still open.
- `jiproject/project.yaml` with `change.default_mode: execute`
  Makes execute mediation the project default for `change` calls that omit `--mode`; explicit CLI mode remains the highest priority.
- `change default-mode show|set|reset`
  Lets teams inspect, enable, roll back, or reset the project default through the CLI while recording each transition in `.jispec/change-default-mode-history.jsonl`; `set execute` is blocked until policy, verify stability, and external patch mediation readiness pass.
- `doctor v1`
  Reports execute-default readiness as a decision packet: current default, mode source, blockers, warnings, owner actions, open-bootstrap-draft adopt boundary, and next action.

- `change`
  Persists the active diff classification and lane decision into `.jispec/change-session.json`.
- `implement`
  Uses that active change session, honors strict vs fast lane, mediates external patch intake when `--external-patch` is supplied, and runs a post-implement verify step automatically.
- `implement --fast`
  Is a local development accelerator only. It can still auto-promote back to strict when verify sees contract-critical changes.

## Command language

Externally, JiSpec is moving toward the following user-facing terms:

- `Contract`
- `Asset`
- `Policy`
- `Fact`
- `Lane`
- `Waiver`

Internally, you will still see legacy implementation terms such as:

- `slice`
- `stage`

That is expected for now; the repository is in a controlled transition from the old runtime vocabulary to the new product surface.

## Scripts

Primary scripts:

```bash
npm run jispec -- --version
npm run jispec-cli -- <command>
npm run jispec -- <command>
npm run verify
npm run ci:verify
```

Compatibility scripts:

```bash
npm run validate:repo
npm run check:jispec
```

Package/bin surface:

- `package.json` exposes `jispec` and `jispec-cli` through `bin/jispec.js`.
- Local development can smoke-test the package entry with `npm run jispec -- --version` and `npm run jispec -- doctor v1`.
- P4 adoption assets include `examples/minimal-legacy-takeover/`, `examples/minimal-greenfield/`, `.github/workflows/jispec-verify-template.yml`, and `.gitlab-ci.jispec-template.yml`.
- See [docs/install.md](docs/install.md).

## Current repo state

This repository includes:

- project-level protocol files in `jiproject/`
- bounded context assets in `contexts/`
- reusable templates in `templates/`
- machine-checkable schemas in `schemas/`
- sample input documents in `docs/input/`
- AI and pipeline definitions in `agents/`
- the CLI/runtime implementation in `tools/jispec/`

The sample models a commerce project with two bounded contexts:

- `catalog`
- `ordering`

The `ordering` context includes one complete example slice:

- `ordering-checkout-v1`

## Key docs

- North star:
  [docs/north-star.md](docs/north-star.md)
- Post-V1 north-star task plan (completed record):
  [docs/post-v1-north-star-plan.md](docs/post-v1-north-star-plan.md)
- Next north-star development plan:
  [docs/north-star-next-development-plan.md](docs/north-star-next-development-plan.md)
- North Star acceptance suite:
  [docs/north-star-acceptance.md](docs/north-star-acceptance.md)
- Post-release gate:
  [docs/post-release-gate.md](docs/post-release-gate.md)
- Retakeover regression pool:
  [docs/retakeover-regression-pool.md](docs/retakeover-regression-pool.md)
- Console read model contract:
  [docs/console-read-model-contract.md](docs/console-read-model-contract.md)
- Collaboration surface freeze:
  [docs/collaboration-surface-freeze.md](docs/collaboration-surface-freeze.md)
- V1 mainline stable contract:
  [docs/v1-mainline-stable-contract.md](docs/v1-mainline-stable-contract.md)
- Greenfield input contract:
  [docs/greenfield-input-contract.md](docs/greenfield-input-contract.md)
- Greenfield walkthrough:
  [docs/greenfield-walkthrough.md](docs/greenfield-walkthrough.md)
- First takeover walkthrough:
  [docs/first-takeover-walkthrough.md](docs/first-takeover-walkthrough.md)
- Pilot product package:
  [docs/pilot-product-package.md](docs/pilot-product-package.md)
- Quickstart:
  [docs/quickstart.md](docs/quickstart.md)
- Takeover guide:
  [docs/takeover-guide.md](docs/takeover-guide.md)
- Execute-default guide:
  [docs/execute-default-guide.md](docs/execute-default-guide.md)
- Console governance guide:
  [docs/console-governance-guide.md](docs/console-governance-guide.md)
- Policy, waiver, and spec debt cookbook:
  [docs/policy-waiver-spec-debt-cookbook.md](docs/policy-waiver-spec-debt-cookbook.md)
- Value metrics:
  [docs/value-metrics.md](docs/value-metrics.md)
- Pilot readiness checklist:
  [docs/pilot-readiness-checklist.md](docs/pilot-readiness-checklist.md)
- CI templates:
  [docs/ci-templates.md](docs/ci-templates.md)
- V1 minimal sample repo:
  [docs/v1-sample-repo.md](docs/v1-sample-repo.md)
- Release notes:
  [docs/releases/v0.1.0.md](docs/releases/v0.1.0.md)
