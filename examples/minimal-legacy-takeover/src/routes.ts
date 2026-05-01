import { createInvoice, waiveInvoice } from "./services/invoice-service";

const app = {
  get: (_path: string, _handler: unknown) => undefined,
  post: (_path: string, _handler: unknown) => undefined,
};

app.get("/health", () => ({ status: "ok" }));
app.post("/invoices", () => createInvoice());
app.post("/invoices/:invoiceId/waive", () => waiveInvoice());
