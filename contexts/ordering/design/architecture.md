# Ordering Context Architecture

## Purpose

The ordering context owns checkout orchestration and order creation.

## Modules

- `checkout-application`
- `cart-domain`
- `order-domain`
- `availability-gateway`

## Boundary Rules

- Ordering may consume published availability data from Catalog.
- Ordering does not own product master data.
- Checkout orchestration may call the availability gateway, but domain invariants stay inside Ordering.
