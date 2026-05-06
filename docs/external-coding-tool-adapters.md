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

Each packet declares `contract.integrationContractVersion: 1` with `payloadRole: external_coding_tool_request`. The contract says the packet is a focused request only: local JiSpec artifacts remain the source of truth, source upload is not required, and returned patches must go back through `implement --external-patch`.

## What Actually Differs By Tool

The adapter does not grant different authority to different tools. The difference is the request ergonomics:

- `prompt`: JiSpec writes tool-specific operator guidance into the generated request so the same handoff reads naturally inside each tool.
- `markdown summary`: JiSpec adds a tool-specific walkthrough to the companion `.md` file so the human operator knows how to drive that tool.
- `docs`: the examples below show how to use the same authority boundary with different chat surfaces.

The following fields stay invariant across tools:

- allowed paths
- replay commands
- contract focus
- mediated tests
- verify requirement
- return path through `implement --external-patch`

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
- the external integration contract fields

The external tool should produce a unified diff patch for the allowed paths only.

## Walkthroughs

### Cursor

Generate the adapter request:

```bash
npm run jispec -- handoff adapter \
  --from-handoff .jispec/handoff/change-123.json \
  --tool cursor
```

Then open `.jispec/handoff/adapters/<session>/cursor-request.md` in Cursor Chat or Agent mode. The generated summary now tells the operator to:

1. drop the Markdown summary into Cursor as the initial brief
2. anchor Cursor on the listed files needing attention first
3. copy the unified diff back into JiSpec mediation

Typical Cursor-oriented request shape inside the generated prompt:

```text
Tool-specific request guidance for Cursor:
1. Treat this as an IDE chat handoff: anchor the request on the files needing attention and ask Cursor to keep the edit set as small as possible.
2. Ask for a patch-ready response that references the contract focus in plain language, then export or copy the unified diff for JiSpec mediation.
```

### Claude Code

Generate the adapter request:

```bash
npm run jispec -- handoff adapter \
  --from-handoff .jispec/handoff/change-123.json \
  --tool claude_code
```

Use `.jispec/handoff/adapters/<session>/claude_code-request.md` as the terminal-session brief. The generated summary now tells the operator to:

1. paste the Markdown summary into Claude Code with the allowed paths visible
2. reason from the failed check toward the minimal fix
3. use the listed test command before packaging the patch

Typical Claude Code-oriented request shape inside the generated prompt:

```text
Tool-specific request guidance for Claude Code:
1. Frame this as a terminal-first repair task: inspect only the listed files, keep changes scoped, and prefer commands that validate the supplied test target.
2. Have Claude Code explain any command it wants to run, then return a unified diff patch rather than an applied workspace state.
```

### GitHub Copilot

Generate the adapter request:

```bash
npm run jispec -- handoff adapter \
  --from-handoff .jispec/handoff/change-123.json \
  --tool copilot
```

Use `.jispec/handoff/adapters/<session>/copilot-request.md` in Copilot Chat or Copilot Workspace. The generated summary now tells the operator to:

1. restate the change intent and failed check up front
2. call out the contract focus artifacts that define the intended behavior
3. ask for a reviewable unified diff instead of broad repo-wide edits

Typical Copilot-oriented request shape inside the generated prompt:

```text
Tool-specific request guidance for GitHub Copilot:
1. Treat this as a pair-programming brief for Copilot Chat or Workspace: restate the change intent, the failed check, and the contract focus before asking for code edits.
2. Have Copilot produce a reviewable unified diff and avoid broad repo-wide refactors or speculative file creation outside the allowed paths.
```

## Return Path

Regardless of tool, the return step is identical:

```bash
npm run jispec-cli -- implement --from-handoff <handoff> --external-patch <path>
```

That keeps the same JiSpec mediation path for Cursor, Claude Code, and GitHub Copilot.

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
