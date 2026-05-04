# Commerce Platform Requirements

## Objective

Build a commerce platform that supports product browsing, cart validation, checkout, and order creation.

## Users / Actors

- Shopper
- Catalog operator

## Core Journeys

- Shopper browses available products.
- Shopper checks out a valid cart.
- Shopper receives a clear rejection when a cart contains unavailable items.

## Functional Requirements

### REQ-CAT-001

The system must expose products that are available for sale.

### REQ-ORD-001

A shopper must be able to submit an order from a valid cart.

### REQ-ORD-002

Checkout must reject carts with unavailable items.

### REQ-ORD-003

An order must not be created unless the cart total is calculable and stock validation passes.

### REQ-ORD-004

The system must emit a domain event when an order is created successfully.

## Non-Functional Requirements

- Checkout validation must be testable without external payment infrastructure.
- Product availability decisions must remain traceable to catalog-owned data.

## Out Of Scope

- Refunds.
- Payment capture.
- Shipment orchestration.

## Acceptance Signals

- Available products appear in the product browsing flow.
- Valid checkout creates an order.
- Unavailable cart items block order creation.
- Successful order creation emits an `OrderCreated` domain event.
