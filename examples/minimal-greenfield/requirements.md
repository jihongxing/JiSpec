# Minimal Commerce Requirements

## Objective

Create a small commerce service that supports product availability and checkout.

## Actors

- Shopper
- Catalog operator

## Core Journeys

- Shopper browses products that are available for sale.
- Shopper checks out a valid cart.
- Shopper receives a rejection when the cart contains unavailable items.

## Functional Requirements

### REQ-CAT-001

The system must expose products that are available for sale.

### REQ-ORD-001

A shopper must be able to submit an order from a valid cart.

### REQ-ORD-002

Checkout must reject carts with unavailable items.

### REQ-ORD-003

An order must not be created unless the cart total is calculable and stock validation passes.

## Acceptance Signals

- available products appear in the product browsing flow
- valid checkout creates an order
- unavailable cart items block order creation

## Non-Functional Requirements

- checkout validation must be testable without external payment infrastructure
- product availability decisions must remain traceable to catalog-owned data

## Out Of Scope

- payment capture
- refunds
- shipment orchestration
