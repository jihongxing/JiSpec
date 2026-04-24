# Commerce Platform Technical Solution

## Architecture Direction

Use bounded contexts for `catalog` and `ordering`.

- `catalog` owns product availability and price read models
- `ordering` owns cart validation, checkout orchestration, and order persistence

## Integration Rule

`ordering` may consume published product availability information from `catalog`, but it may not write to catalog-owned models.

## Checkout Flow

1. Receive checkout request with cart identifier.
2. Load cart and cart items.
3. Validate product availability.
4. Calculate order total.
5. Persist order.
6. Emit `OrderCreated`.

## Testing Strategy

- Unit tests for validation and calculation logic
- Integration tests for checkout application service
- Contract tests for upstream availability data assumptions

## Constraints

- No direct table sharing between bounded contexts
- Domain invariants must be explicit in context artifacts
- All delivery must be traceable to requirements and tests
