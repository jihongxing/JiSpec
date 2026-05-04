# Commerce Platform Technical Solution

## Architecture Direction

Use bounded contexts for `catalog` and `ordering`.

- `catalog` owns product availability and price read models.
- `ordering` owns cart validation, checkout orchestration, and order persistence.

## Bounded Context Hypothesis

- `catalog`
- `ordering`

## Integration Boundaries

`ordering` may consume published product availability information from `catalog`, but it may not write to catalog-owned models.

## Data Ownership

Each bounded context owns persistence and publishes integration contracts instead of sharing tables.

## Testing Strategy

Use unit tests for domain rules, integration tests for checkout flow, and contract tests for catalog availability consumption.

## Operational Constraints

No direct table sharing between bounded contexts.

## Risks And Open Decisions

- Payment is deferred.
- Product pricing promotions are deferred.
- The final persistence technology is not selected in this initialization demo.
