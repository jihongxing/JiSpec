# JiSpec MVP Implementation Plan v0.1

## 1. Purpose

This document translates the JiSpec protocol into an implementable MVP plan.

It focuses on four delivery areas:

- CLI
- schema validation
- CI gates
- agent orchestration

The goal is not to build the full platform.
The goal is to prove that one bounded-context feature slice can move through a governed AI-assisted delivery loop inside a repository.

## 2. MVP Success Condition

The MVP succeeds if a team can:

1. initialize a JiSpec repository
2. define or import project and context protocol files
3. create one slice in one bounded context
4. derive slice artifacts through structured commands
5. validate schema and trace rules automatically
6. enforce protocol checks in CI
7. run bounded agent roles against slice artifacts
8. produce merge-ready evidence for one sample slice

## 3. Scope and Non-Goals

### In Scope

- repo-local CLI
- YAML and Markdown protocol files
- JSON Schema validation
- trace integrity checks
- GitHub Actions CI check
- file-based agent orchestration contract
- one sample project with one sample slice

### Out of Scope

- SaaS platform
- multi-user permissions
- visual trace dashboard
- advanced workflow engine
- autonomous multi-slice planning
- deep IDE integration

## 4. Implementation Strategy

Build from the inside out:

1. lock the protocol model
2. validate it with schemas
3. expose it with a CLI
4. enforce it in CI
5. let agents operate on top of the stable contract

Do not start with agent orchestration.
If the protocol is not machine-checkable first, agents will only amplify inconsistency.

## 5. Recommended Technical Shape

For the MVP, keep the runtime simple:

- one CLI package under `tools/jispec/`
- one validation module for schemas and trace rules
- one CI workflow under `.github/workflows/`
- one agent runner abstraction that maps roles to prompt files and file scopes

Suggested implementation language:

- TypeScript if you want strong schema tooling and future editor integration
- Python if you want faster scripting and local iteration

Either is fine.
The important constraint is that the CLI, validators, and agent runner all share the same protocol model.

## 6. Delivery Phases

### Phase 0: Lock the Protocol Baseline

Objective:

Freeze the repository contract enough that tooling can target it.

Deliverables:

- stable file locations
- stable required fields
- stable lifecycle states
- stable gate names
- stable relation types for trace

Tasks:

- review `docs/repo-protocol-v0.1.md`
- confirm required fields in `project.yaml`, `context.yaml`, `slice.yaml`, `trace.yaml`
- confirm ID conventions for requirements, scenarios, tests, tasks, ADRs
- confirm initial lifecycle state machine
- confirm which artifacts are mandatory at each slice state

Acceptance criteria:

- no core file shape changes are needed before coding validators

### Phase 1: Schema and Validation Foundation

Objective:

Make the protocol machine-checkable.

Deliverables:

- schema loader
- YAML parser
- JSON Schema validation runner
- basic semantic validation beyond schema

Tasks:

#### Task Group 1.1: Validation Runtime

- create `tools/jispec/` package scaffold
- add CLI entrypoint placeholder
- add YAML loading utilities
- add path discovery for project, contexts, and slices

#### Task Group 1.2: Schema Validation

- load `schemas/project.schema.json`
- load `schemas/context.schema.json`
- load `schemas/slice.schema.json`
- load `schemas/trace.schema.json`
- load `schemas/contracts.schema.json`
- validate matching files against schemas

#### Task Group 1.3: Semantic Validation

Add checks that schema alone cannot catch:

- `context_id` in a slice must match an existing context
- active slices in `context.yaml` must exist on disk
- `source_documents` must exist
- trace links must reference known IDs where possible
- lifecycle state must be valid for the project
- gate fields must be present and boolean

#### Task Group 1.4: Trace Rule Checks

- verify every slice has `trace.yaml`
- verify each trace link has `from`, `to`, and `relation`
- verify minimum chain coverage
- verify scenarios referenced by tests exist
- verify tests referenced in trace exist in `test-spec.yaml`

Acceptance criteria:

- one command can validate the sample repo and return useful errors

Suggested command:

```bash
jispec validate
```

### Phase 2: CLI MVP

Objective:

Give humans and agents a stable entrypoint into the protocol.

Deliverables:

- project commands
- context commands
- slice commands
- trace commands

Tasks:

#### Task Group 2.1: CLI Structure

- choose command framework
- implement command registry
- implement shared output format
- support machine-readable JSON output for automation

#### Task Group 2.2: Core Commands

Implement:

```bash
jispec init
jispec validate
jispec doctor
jispec context list
jispec context show <context-id>
jispec slice show <slice-id>
jispec slice status <slice-id>
jispec trace show <slice-id>
jispec trace check <slice-id>
```

#### Task Group 2.3: Creation Commands

Implement:

```bash
jispec context add <context-id>
jispec slice create <context-id> <slice-id>
```

These should:

- clone from `templates/`
- fill basic IDs and paths
- update `context.yaml` active slices

#### Task Group 2.4: Lifecycle Commands

Implement:

```bash
jispec slice advance <slice-id> --to <state>
jispec slice check <slice-id>
```

Rules:

- state transitions must be explicit
- state transitions should fail if mandatory artifacts are missing
- gate checks should explain what is still incomplete

Acceptance criteria:

- a developer can create a new slice from the CLI and inspect its status

### Phase 3: CI and Gate Enforcement

Objective:

Make protocol compliance part of normal delivery flow.

Deliverables:

- GitHub Actions workflow
- repository validation step
- slice-level check step
- PR guardrails

Tasks:

#### Task Group 3.1: CI Workflow

Create:

- `.github/workflows/jispec-check.yml`

Workflow responsibilities:

- install runtime
- run `jispec validate`
- fail on schema or semantic errors

#### Task Group 3.2: Slice-Aware Checks

Add checks for:

- changed slice files
- changed trace files
- changed contracts
- missing evidence for accepted slices

#### Task Group 3.3: PR Policy

Validate:

- PR title contains slice ID or PR body includes it
- referenced slice exists
- slice state permits current work
- trace file remains valid after changes

Acceptance criteria:

- a broken trace or invalid slice file fails CI

### Phase 4: Artifact Derivation Helpers

Objective:

Reduce manual effort in moving from one protocol stage to the next.

Deliverables:

- generation helpers for design, behavior, and tests
- controlled template filling

Tasks:

Implement:

```bash
jispec artifact derive-design <slice-id>
jispec artifact derive-behavior <slice-id>
jispec artifact derive-tests <slice-id>
jispec artifact sync-trace <slice-id>
```

Behavior:

- derive from existing files only
- preserve human edits where possible
- require explicit overwrite flags when regenerating

Acceptance criteria:

- the sample slice can be scaffolded forward through design, behavior, and test stages

### Phase 5: Agent Orchestration MVP

Objective:

Let bounded agents execute against the protocol safely.

Deliverables:

- agent role registry
- role-to-prompt mapping
- input/output file scope rules
- run logs

Tasks:

#### Task Group 5.1: Agent Contract Loader

- load `agents/agents.yaml`
- resolve prompt files
- resolve allowed input and output scopes

#### Task Group 5.2: Agent Runner Interface

Implement:

```bash
jispec agent run domain <target>
jispec agent run design <slice-id>
jispec agent run behavior <slice-id>
jispec agent run test <slice-id>
jispec agent run build <slice-id>
jispec agent run review <slice-id>
```

The MVP version can:

- assemble prompt context from files
- print or emit a structured task package
- optionally invoke a local model wrapper later

Important:

The first version does not need deep model execution integration.
It is acceptable for the runner to stop at producing a deterministic work package for an external agent.

#### Task Group 5.3: Agent Guardrails

Enforce:

- role-specific file access
- required artifact preconditions
- expected artifact outputs
- logging of source files used

#### Task Group 5.4: Review Agent Checks

The review role should explicitly run:

- schema validation
- semantic validation
- trace validation
- slice gate completeness check

Acceptance criteria:

- each agent role can be invoked with a deterministic contract and file scope

### Phase 6: Demo Flow and Hardening

Objective:

Prove the full loop end to end on the sample repository.

Deliverables:

- one documented demo flow
- one walkthrough script
- one regression checklist

Tasks:

- create a new sample slice from CLI
- derive artifacts through helper commands
- run validation and trace checks
- simulate agent role execution
- mark the slice through lifecycle states
- document expected outputs and failure modes

Acceptance criteria:

- a new user can follow the repo and reproduce the closed loop

## 7. Suggested Work Breakdown Structure

Below is a practical development backlog.

### Workstream A: Protocol Runtime

- A1. create `tools/jispec/` package
- A2. implement config and path discovery
- A3. implement YAML read utilities
- A4. implement schema registry
- A5. implement common error model

### Workstream B: Validators

- B1. validate project file
- B2. validate all contexts
- B3. validate all slices
- B4. validate contracts
- B5. validate trace files
- B6. implement semantic cross-reference checks
- B7. implement lifecycle gate checks

### Workstream C: CLI

- C1. implement `validate`
- C2. implement `doctor`
- C3. implement `context list/show/add`
- C4. implement `slice create/show/status`
- C5. implement `slice advance/check`
- C6. implement `trace show/check`
- C7. implement JSON output mode

### Workstream D: Generators

- D1. implement template loader
- D2. implement `context add`
- D3. implement `slice create`
- D4. implement artifact derivation helpers
- D5. implement safe overwrite rules

### Workstream E: CI

- E1. create GitHub Actions workflow
- E2. install runtime and dependencies
- E3. run `jispec validate`
- E4. add changed-file filtering
- E5. fail on broken trace or missing required artifacts

### Workstream F: Agent Orchestration

- F1. load agent registry
- F2. resolve role prompts
- F3. build task package generator
- F4. add role-specific preflight validation
- F5. add run logs and output capture
- F6. add review-agent flow

### Workstream G: Demo and Documentation

- G1. write usage examples in `README.md`
- G2. add CLI examples
- G3. document slice lifecycle transitions
- G4. document failure messages and remediation
- G5. record sample end-to-end walkthrough

## 8. Dependency Order

The recommended dependency order is:

1. `A1-A5`
2. `B1-B5`
3. `C1`
4. `B6-B7`
5. `C2-C7`
6. `D1-D3`
7. `E1-E3`
8. `D4-D5`
9. `F1-F4`
10. `E4-E5`
11. `F5-F6`
12. `G1-G5`

Reason:

- validators come before orchestration
- CLI visibility comes before derivation
- CI comes before autonomy
- agent runner comes only after guardrails exist

## 9. Suggested Milestone Plan

### Milestone 1: Repository Validator

Target outcome:

- `jispec validate` works on the sample repo

Included tasks:

- `A1-A5`
- `B1-B6`
- `C1`

### Milestone 2: Slice Lifecycle CLI

Target outcome:

- a user can create and inspect a slice from the CLI

Included tasks:

- `B7`
- `C2-C7`
- `D1-D3`

### Milestone 3: CI Gate

Target outcome:

- protocol violations fail pull requests

Included tasks:

- `E1-E5`

### Milestone 4: Agent Runner MVP

Target outcome:

- bounded agent roles can be invoked against slice files safely

Included tasks:

- `F1-F6`

### Milestone 5: End-to-End Demo

Target outcome:

- one documented closed loop from requirements to validated slice

Included tasks:

- `D4-D5`
- `G1-G5`

## 10. Definition of Done by Area

### CLI Done

- commands are discoverable
- commands return stable exit codes
- commands support human-readable output
- commands support machine-readable JSON output where useful

### Schema Done

- required protocol files validate correctly
- errors include file path and field-level detail
- semantic validation catches cross-file mismatches

### CI Done

- CI fails on invalid protocol state
- CI output points to actionable fixes
- accepted slices cannot merge with missing evidence or broken trace

### Agent Orchestration Done

- each role has explicit inputs and outputs
- each run is logged
- roles cannot run when required preconditions are missing
- review role can recommend gate pass or fail

## 11. Risks and Mitigations

### Risk 1: Overbuilding the CLI

Mitigation:

- ship `validate`, `slice create`, and `slice check` first

### Risk 2: Weak Trace Validation

Mitigation:

- treat trace as a first-class validator, not an afterthought

### Risk 3: Agent Runner Too Early

Mitigation:

- keep first orchestration version file-based and deterministic

### Risk 4: Template Drift

Mitigation:

- route creation through CLI generators instead of hand-copying files

## 12. Immediate Next Tasks

If implementation starts now, the highest-value next tasks are:

1. create `tools/jispec/` package scaffold
2. implement YAML loading and schema validation
3. ship `jispec validate`
4. add `jispec slice create`
5. add `.github/workflows/jispec-check.yml`

## 13. One-Sentence Summary

JiSpec MVP should be built as a repo-local validation and orchestration layer: schema first, CLI second, CI third, agents fourth.
