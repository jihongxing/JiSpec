import { createOrder } from "./services/order-service";

const app = {
  get: (_path: string, _handler: unknown) => undefined,
  post: (_path: string, _handler: unknown) => undefined,
};

app.get("/health", () => ({ status: "ok" }));
app.post("/orders", () => createOrder());
