# Minimal Commerce Technical Solution

## Architecture Direction

Use two bounded contexts:

- `catalog` owns product availability and price read models
- `ordering` owns cart validation, checkout orchestration, and order persistence

## Integration Boundary

`ordering` may consume published product availability information from `catalog`, but it may not write to catalog-owned models.

## Data Ownership

Each bounded context owns persistence and publishes integration contracts instead of sharing tables.

## Testing Strategy

- unit tests for domain rules
- integration tests for checkout flow
- contract tests for catalog availability consumption

## Open Decisions

- final payment provider is not selected
- product pricing promotions are deferred
