# JiSpec Repository and Protocol Spec v0.1

## 1. Purpose

This document defines the concrete open-repo form of JiSpec:

- directory structure
- protocol files
- feature slice lifecycle
- CLI commands
- agent roles
- traceability rules

The design goal is to make JiSpec executable in a repository before building a full platform.

## 2. Repository Philosophy

JiSpec is repo-first and protocol-driven.

That means:

- the repository is the execution surface
- artifacts are versioned with code
- AI and humans share the same protocol files
- CI can validate delivery quality
- every slice can be audited after the fact

## 3. Top-Level Directory Structure

```text
/docs
  /product-blueprint-v0.1.md
  /repo-protocol-v0.1.md

/jiproject
  /project.yaml
  /glossary.yaml
  /constraints.yaml
  /context-map.yaml
  /milestones.yaml

/contexts
  /<context-id>
    /context.yaml
    /domain
      /ubiquitous-language.yaml
      /entities.yaml
      /value-objects.yaml
      /events.yaml
      /invariants.yaml
    /design
      /architecture.md
      /modules.yaml
      /contracts.yaml
      /data-model.yaml
      /adrs
        /ADR-001-<title>.md
    /behavior
      /journeys.md
      /scenarios
        /<scenario-id>.feature
      /acceptance.yaml
    /tests
      /test-plan.yaml
      /coverage-map.yaml
    /slices
      /<slice-id>
        /slice.yaml
        /requirements.md
        /design.md
        /behaviors.feature
        /test-spec.yaml
        /tasks.yaml
        /trace.yaml
        /evidence.md

/agents
  /agents.yaml
  /prompts
    /domain-agent.md
    /design-agent.md
    /behavior-agent.md
    /test-agent.md
    /build-agent.md
    /review-agent.md

/schemas
  /project.schema.json
  /context.schema.json
  /slice.schema.json
  /trace.schema.json
  /contracts.schema.json
  /tasks.schema.json

/templates
  /context
  /slice
  /adr
  /scenario

/tools
  /jispec
    /cli
    /checks
    /generators

/.github
  /workflows
    /jispec-check.yml
```

## 4. Core Protocol Files

### 4.1 `jiproject/project.yaml`

Defines project identity and global governance.

Suggested fields:

```yaml
id: commerce-platform
name: Commerce Platform
version: 0.1.0
delivery_model: bounded-context-slice
source_documents:
  requirements: docs/input/requirements.md
  technical_solution: docs/input/technical-solution.md
global_gates:
  - trace_complete
  - scenarios_tested
  - contracts_validated
  - review_passed
```

### 4.2 `jiproject/context-map.yaml`

Defines bounded contexts and relations.

Suggested fields:

```yaml
contexts:
  - id: catalog
    name: Catalog
    type: core
  - id: ordering
    name: Ordering
    type: core
relations:
  - from: ordering
    to: catalog
    relationship: upstream-downstream
```

### 4.3 `contexts/<context-id>/context.yaml`

Defines one bounded context.

Suggested fields:

```yaml
id: ordering
name: Ordering
owner: team-ordering
purpose: Manage carts, checkout, and order lifecycle.
upstream_contexts:
  - catalog
downstream_contexts:
  - fulfillment
active_slices:
  - ordering-checkout-v1
```

### 4.4 `contexts/<context-id>/slices/<slice-id>/slice.yaml`

This is the canonical control file for one feature slice.

Suggested fields:

```yaml
id: ordering-checkout-v1
title: Checkout MVP
context_id: ordering
status: proposed
priority: high
goal: Allow users to submit an order from a valid cart.
source_refs:
  requirement_ids:
    - REQ-ORD-001
  design_refs:
    - TSD-ORD-API-002
owners:
  product: pm-ordering
  engineering: tl-ordering
gates:
  design_ready: false
  behavior_ready: false
  test_ready: false
  implementation_ready: false
  accepted: false
```

### 4.5 `trace.yaml`

Defines the trace links for a slice.

Suggested fields:

```yaml
links:
  - from:
      type: requirement
      id: REQ-ORD-001
    to:
      type: domain_rule
      id: INV-ORDER-001
    relation: refines
  - from:
      type: domain_rule
      id: INV-ORDER-001
    to:
      type: scenario
      id: SCN-ORDER-CHECKOUT-VALID
    relation: verified_by
  - from:
      type: scenario
      id: SCN-ORDER-CHECKOUT-VALID
    to:
      type: test
      id: TEST-ORDER-CHECKOUT-VALID-API
    relation: covered_by
  - from:
      type: test
      id: TEST-ORDER-CHECKOUT-VALID-API
    to:
      type: code
      id: src/order/checkout.ts
    relation: implemented_by
```

## 5. Artifact Rules

### 5.1 Global DDD Artifacts Must Stay Lightweight

Global artifacts should define:

- project glossary
- high-level domain map
- bounded contexts
- key cross-context invariants
- global constraints

Global artifacts should not attempt to fully design every feature.

### 5.2 Detailed Artifacts Belong to Contexts and Slices

Detailed design and behavior belong below the relevant bounded context and slice.

### 5.3 Every Artifact Must Be Addressable

Every artifact should have stable IDs.

Examples:

- `REQ-ORD-001`
- `CTX-ORDERING`
- `SCN-ORDER-CHECKOUT-VALID`
- `TEST-ORDER-CHECKOUT-VALID-API`

## 6. Feature Slice Lifecycle

JiSpec should treat the following as the default lifecycle:

1. `proposed`
2. `framed`
3. `designed`
4. `behavior-defined`
5. `test-defined`
6. `implementing`
7. `reviewing`
8. `accepted`
9. `released`

### 6.1 `proposed`

The slice exists as an idea tied to a context and source requirements.

Required:

- `slice.yaml`
- requirement references
- business goal

### 6.2 `framed`

The slice has boundary clarity.

Required:

- scope statement
- out-of-scope statement
- domain concepts involved
- upstream and downstream assumptions

Gate:

- no unresolved context ambiguity

### 6.3 `designed`

The slice has concrete technical design.

Required:

- module impact
- interfaces or contract changes
- data model impact
- ADR if architectural tradeoff exists

Gate:

- design artifacts complete
- no unresolved contract ambiguity

### 6.4 `behavior-defined`

The slice has explicit behavior scenarios.

Required:

- Gherkin or equivalent scenarios
- acceptance criteria
- error and edge-case coverage

Gate:

- each major requirement mapped to one or more scenarios

### 6.5 `test-defined`

The slice has a test strategy ready.

Required:

- test matrix
- unit/integration/contract/e2e distribution
- scenario-to-test mapping

Gate:

- each executable scenario mapped to at least one test

### 6.6 `implementing`

Code changes are underway under the slice contract.

Required:

- task breakdown
- target files or modules
- build agent worklog

Gate:

- implementation linked to slice

### 6.7 `reviewing`

The slice is under quality review.

Required:

- trace completeness check
- test results
- design compliance review
- changed files list

### 6.8 `accepted`

The slice passed protocol gates.

Required:

- evidence of passing tests
- behavior acceptance confirmation
- open-risk summary

### 6.9 `released`

The slice is shipped or merged to delivery baseline.

Required:

- release reference
- post-release notes if needed

## 7. Default Gates

Every slice should pass these checks before acceptance:

- `trace_complete`
- `design_ready`
- `behavior_ready`
- `tests_mapped`
- `tests_passing`
- `contracts_valid`
- `context_boundary_clean`
- `review_passed`

## 8. CLI Command Contract

The CLI should be simple, composable, and agent-friendly.

Suggested command set:

### 8.1 Project Commands

```bash
jispec init
jispec validate
jispec doctor
```

Responsibilities:

- initialize repo structure
- validate schema and references
- diagnose missing artifacts

### 8.2 Context Commands

```bash
jispec context list
jispec context add <context-id>
jispec context board <context-id>
jispec context show <context-id>
jispec context check <context-id>
```

Responsibilities:

- manage bounded contexts
- show grouped execution board state
- inspect context completeness
- validate boundary integrity

### 8.3 Slice Commands

```bash
jispec slice create <context-id> <slice-id>
jispec slice show <slice-id>
jispec slice plan <slice-id>
jispec slice status <slice-id>
jispec slice advance <slice-id> --to <state>
jispec slice check <slice-id>
```

Responsibilities:

- create and inspect slices
- move lifecycle state
- run stage gates

### 8.4 Artifact Commands

```bash
jispec artifact derive-design <slice-id>
jispec artifact derive-behavior <slice-id>
jispec artifact derive-tests <slice-id>
jispec artifact sync-trace <slice-id>
```

Responsibilities:

- derive next-stage artifacts
- sync structured lineage

### 8.5 Agent Commands

```bash
jispec agent run domain <target>
jispec agent run design <slice-id>
jispec agent run behavior <slice-id>
jispec agent run test <slice-id>
jispec agent run build <slice-id>
jispec agent run review <slice-id>
```

Responsibilities:

- run protocolized agent roles
- constrain inputs and outputs by file contract

### 8.6 Trace Commands

```bash
jispec trace show <slice-id>
jispec trace check <slice-id>
jispec trace graph <slice-id>
```

Responsibilities:

- inspect lineage
- detect broken links
- render trace graph

## 9. Agent Role Definitions

JiSpec should avoid a single "super agent".
Instead it should define bounded agents with explicit inputs and outputs.

### 9.1 Domain Agent

Input:

- requirement package
- context map
- context artifacts

Output:

- glossary additions
- domain concepts
- invariants
- event candidates

Constraint:

- cannot invent cross-context ownership without explicit evidence

### 9.2 Design Agent

Input:

- slice charter
- domain artifacts
- technical solution package

Output:

- slice design
- module updates
- contracts
- data impact

Constraint:

- must preserve bounded context boundaries

### 9.3 Behavior Agent

Input:

- slice design
- requirements
- acceptance intent

Output:

- scenarios
- acceptance criteria
- edge case list

Constraint:

- every scenario must link back to requirement or design evidence

### 9.4 Test Agent

Input:

- behavior scenarios
- design contracts

Output:

- test matrix
- test specs
- coverage mapping

Constraint:

- no scenario may remain untested without explicit waiver

### 9.5 Build Agent

Input:

- approved slice artifacts
- task list
- target codebase

Output:

- code changes
- test changes
- implementation notes

Constraint:

- must reference slice ID in worklog and changed scope

### 9.6 Review Agent

Input:

- all slice artifacts
- changed files
- test results

Output:

- findings
- drift warnings
- trace violations
- gate decision recommendation

Constraint:

- reviews protocol integrity before style or preference

## 10. Traceability Rules

Traceability is not optional metadata.
It is the backbone of JiSpec.

### 10.1 Required Link Chain

For every accepted slice, JiSpec should be able to traverse:

`requirement -> domain/design artifact -> behavior scenario -> test -> code change -> evidence`

### 10.2 Minimum Link Requirements

Each slice must have:

- at least one requirement link
- at least one scenario link
- at least one test link
- at least one implementation link
- one acceptance evidence entry

### 10.3 Allowed Relation Types

Recommended relations:

- `refines`
- `constrains`
- `realized_by`
- `verified_by`
- `covered_by`
- `implemented_by`
- `accepted_by`

### 10.4 Broken Trace Conditions

Trace should fail if:

- a scenario has no source requirement or design rationale
- a test does not map to a scenario or contract
- accepted code has no slice link
- a slice is marked accepted without evidence

## 11. Protocol Rules for Pull Requests

Every PR associated with a slice should include:

- slice ID
- list of touched contexts
- linked artifacts
- test summary
- open risks

Recommended PR title pattern:

```text
[Slice: ordering-checkout-v1] Implement checkout happy path
```

CI should check:

- referenced slice exists
- slice status allows implementation or review
- trace file is valid
- tests mapped in `test-spec.yaml` are present

## 12. Example Slice Execution Flow

Example:

1. `jispec slice create ordering ordering-checkout-v1`
2. Domain Agent frames the slice against ordering context
3. Design Agent writes `design.md` and updates `contracts.yaml`
4. Behavior Agent writes `behaviors.feature`
5. Test Agent writes `test-spec.yaml` and `coverage-map.yaml`
6. Build Agent implements code and links changed files
7. Review Agent validates trace and gate readiness
8. `jispec slice advance ordering-checkout-v1 --to accepted`

## 13. Recommended Initial Implementation Strategy

The first implementation should prioritize:

- simple YAML/Markdown protocol
- JSON schema validation
- one CLI runtime
- one CI check workflow
- one demo repository

Do not begin with:

- a database-backed platform
- a full collaboration UI
- complex workflow orchestration infrastructure

## 14. Non-Goals for v0.1

These should be explicitly excluded from the first repo version:

- full project portfolio management
- enterprise permissions
- complex approval engines
- autonomous multi-repo rollout
- generic project management replacement

## 15. v0.1 Success Condition

JiSpec v0.1 succeeds if a team can:

1. initialize a repo
2. define bounded contexts
3. create one slice
4. derive design, behavior, and tests through protocolized agents
5. implement code
6. validate full trace before merge

If that works repeatedly, the product idea is real.
