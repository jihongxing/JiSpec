# Commerce Platform Requirements

## Objective

Build a commerce platform that supports product browsing, cart validation, checkout, and order creation.

## Core Requirements

### REQ-CAT-001

The system must expose products that are available for sale.

### REQ-ORD-001

A user must be able to submit an order from a valid cart.

### REQ-ORD-002

Checkout must reject carts with unavailable items.

### REQ-ORD-003

An order must not be created unless the cart total is calculable and stock validation passes.

### REQ-ORD-004

The system must emit a domain event when an order is created successfully.

## Non-Functional Requirements

- Checkout response time should be acceptable for synchronous user interaction.
- Validation logic must be testable in isolation.
- Context boundaries should avoid direct persistence coupling.
