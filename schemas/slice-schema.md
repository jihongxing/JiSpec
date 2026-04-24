# Slice Schema

## Standard slice.yaml structure

```yaml
id: string
title: string
context_id: string
priority: high | medium | low

lifecycle:
  state: string
  updated_at: string

goal: string
scope:
  includes: string[]
  excludes: string[]

source_refs:
  requirement_ids: string[]
  design_refs: string[]

owners:
  product: string
  engineering: string

gates:
  requirements_ready: boolean
  design_ready: boolean
  behavior_ready: boolean
  test_ready: boolean
  implementation_ready: boolean
  verification_ready: boolean
  accepted: boolean
```

## Lifecycle States

1. proposed
2. requirements-defined
3. design-defined
4. behavior-defined
5. test-defined
6. implementing
7. verifying
8. accepted
9. released
