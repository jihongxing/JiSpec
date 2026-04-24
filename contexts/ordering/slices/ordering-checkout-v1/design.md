# Slice Design

## Summary

The slice introduces checkout orchestration that validates availability, calculates totals, creates orders, and emits `OrderCreated`.

## Impacted Modules

- `checkout-application`
- `cart-domain`
- `order-domain`
- `availability-gateway`

## Key Decision

Use a published availability snapshot from Catalog instead of direct ownership or direct persistence access.
