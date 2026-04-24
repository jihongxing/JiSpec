# Ordering User Journeys

## Checkout Happy Path

1. User initiates checkout from a valid cart.
2. System validates availability for all cart items.
3. System calculates cart total.
4. System creates an order.
5. System confirms order creation.

## Checkout Rejection Path

1. User initiates checkout from a cart containing unavailable items.
2. System detects the invalid condition.
3. System rejects checkout without creating an order.
