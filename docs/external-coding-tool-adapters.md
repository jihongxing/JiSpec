# External Coding Tool Handoff Adapters

JiSpec can export a replayable implementation handoff into a focused request packet for external coding tools such as Codex, Claude Code, Cursor, GitHub Copilot, and Devin.

Adapters change request format only. They do not change JiSpec authority.

## Command

```bash
npm run jispec -- handoff adapter \
  --from-handoff .jispec/handoff/change-123.json \
  --tool codex
```

Supported tools:

- `codex`
- `claude_code`
- `cursor`
- `copilot`
- `devin`

The command writes:

- `.jispec/handoff/adapters/<session>/<tool>-request.json`
- `.jispec/handoff/adapters/<session>/<tool>-request.md`

The JSON packet follows `schemas/implementation-handoff.schema.json`.

## Request Packet

The adapter packet includes:

- allowed paths
- files needing attention
- contract focus
- test command
- verify command
- failed check
- stop point
- replay commands
- the command for returning a patch through JiSpec

The external tool should produce a unified diff patch for the allowed paths only.

## Authority Boundary

External tool output cannot bypass JiSpec mediation. The returned patch must go through:

```bash
npm run jispec-cli -- implement --from-handoff <handoff> --external-patch <path>
```

JiSpec then runs:

- scope check
- patch apply
- mediated tests
- post-implement verify

The adapter does not upload source, does not run as final authority, and does not make an LLM the blocking judge. `verify` and `ci:verify` remain the merge gate.

## Replay

The source handoff remains the replay root. Adapter output references the same replay commands and does not mutate the original handoff packet. If a patch fails scope, apply, tests, or verify, JiSpec writes the normal mediation artifacts and can generate a fresh handoff for the next attempt.
