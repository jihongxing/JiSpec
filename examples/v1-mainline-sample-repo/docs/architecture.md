# Architecture

The ordering service is still a legacy warehouse slice.

- `/health` is used by platform health checks
- `/orders` is the first contract candidate the team wants to formalize
- schema shape exists in `schemas/order.schema.json`
- API edge cases are still under manual review, so the first JiSpec takeover keeps some debt deferred
