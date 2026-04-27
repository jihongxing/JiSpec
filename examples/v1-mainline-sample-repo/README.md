# Legacy Warehouse Ordering Service

This small service predates JiSpec adoption.

Current behavior:

- `GET /health` returns a simple health probe
- `POST /orders` creates a warehouse order request

What is still legacy:

- API behavior is inferred from route handlers and one coarse regression test
- schema ownership exists in `schemas/`, but no explicit JiSpec contracts are checked in yet
- the team has not finished reviewing the order-creation API surface for formal contract adoption
