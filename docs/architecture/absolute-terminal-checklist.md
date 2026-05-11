# Absolute Terminal Checklist

This document is the code-level rulebook for deciding whether a JiSpec surface should stay in `保留` or move to `已删除`.

## Decision Rule

A surface stays in `保留` if any of the following are still true:

- It is part of a primary command, doctor profile, or gate path.
- It is a canonical docs entry that still absorbs current traffic.
- It still guards deterministic local-first behavior.
- Removing it would change `verify`, `ci:verify`, `post-release:gate`, or V1 readiness semantics.

A surface moves to `已删除` only when all of the following are true:

- No primary command dispatch reaches it.
- No stable contract or acceptance suite depends on it.
- The remaining references are deleted-history records or tests proving it is gone.

## 保留

These surfaces stay in the current product shape:

| Surface | Why it stays |
| --- | --- |
| `bootstrap init-project -> bootstrap discover -> bootstrap draft -> adopt -> verify -> ci:verify -> change -> implement -> verify` | This is the V1 mainline contract surface. |
| `doctor mainline` | Primary readiness gate for the mainline. |
| `verify`, `verify --fast`, `ci:verify` | Primary blocking / non-blocking verification gates. |
| `doctor runtime` | Diagnostic-only extended runtime gate. |
| `doctor pilot` | Separate pilot readiness gate. |
| `doctor global` | Global closure health gate. |
| `console export-governance` and `console aggregate-governance` | Support surfaces for governance evidence and multi-repo closure. |
| `north-star acceptance` | Final local acceptance package, but still not a replacement gate. |
| `runtime-extended` regression suites | Keep deferred surfaces diagnostic-only. |
| `docs/README.md`, `docs/getting-started/README.md`, `docs/user-guide/README.md`, `docs/reference/README.md`, `docs/architecture/README.md`, `docs/development/README.md` | Current navigation surfaces for the docs tree. |
| `docs/user-guide/takeover-guide.md`, `docs/getting-started/first-takeover-walkthrough.md` | Current adoption and first-run guides. |
| `docs/architecture/north-star-acceptance.md`, `docs/development/collaboration-surface-freeze.md`, `docs/development/pilot-readiness-checklist.md` | Current closeout and frozen-boundary docs. |
| `docs/reference/v1-mainline-stable-contract.md`, `docs/reference/console-read-model-contract.md`, `docs/reference/greenfield-input-contract.md`, `docs/reference/truth-contract-and-canonical-encoding.md` | Stable reference contracts. |

## 已删除

These surfaces are no longer part of the live product shape:

| Surface | Why it is deleted |
| --- | --- |
| `docs/development/releases/v0.1.0.md` | Release note removed from the live tree. |
| `docs/development/superpowers-discipline-layer.md` | Internal background note removed from the live tree. |
| `tools/jispec/cache-manager-old.ts` | Old implementation path removed from the live tree. |
| `Legacy CLI compatibility surface` (`slice/context/trace/artifact/agent/pipeline/template/dependency`) | Removed from the live CLI and kept only as deleted history. |
| `doctor v1 alias` | Retired once `doctor mainline` became canonical. |
| `validate alias` | Retired once `verify` became canonical. |
| `validate:repo script` | Retired once callers switched to `verify` / `ci:verify`. |
| `check:jispec script` | Retired once callers switched to `ci:verify`. |

## Code-Level Check

Before moving a surface out of `保留`, verify all of the following:

1. `rg -n "<surface>" tools/jispec/cli.ts tools/jispec/doctor.ts tools/jispec/tests/regression-runner.ts docs/reference/v1-mainline-stable-contract.md docs/architecture/north-star-acceptance.md` returns no live gate references.
2. `node --import tsx ./tools/jispec/cli.ts --help` does not list the legacy compatibility surface or any retired command names.
3. `rg -n "<surface>" .` returns only deleted-history evidence or tests proving the legacy path is gone.
4. `node --import tsx ./tools/jispec/tests/regression-runner.ts` still passes.
5. `npm run post-release:gate` still passes.
6. Removing the surface does not change the JSON/YAML/Markdown artifact contracts consumed by CI or doctor.

## Practical Interpretation

- If a surface still protects the mainline from ambiguity, keep it in `保留`.
- If a surface still carries compatibility traffic, keep it in `保留` until the traffic is gone.
- If a surface is only documenting old behavior and no command depends on it, delete it and record it in `已删除`.
- If in doubt, freeze first and archive later.
