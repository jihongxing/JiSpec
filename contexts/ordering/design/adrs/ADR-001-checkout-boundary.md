# ADR-001 Checkout Boundary

## Status

Accepted

## Context

Ordering must validate product availability during checkout without taking ownership of product master data.

## Decision

Ordering will read a published availability snapshot from Catalog through an explicit gateway contract.

## Consequences

- Ordering keeps checkout orchestration local.
- Catalog remains the authority on product sellability.
- Integration testing must verify availability contract assumptions.
