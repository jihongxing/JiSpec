export function createInvoice() {
  return {
    invoiceId: "inv-demo-001",
    status: "pending_review",
    amountCents: 4900,
  };
}

export function waiveInvoice() {
  return {
    invoiceId: "inv-demo-001",
    status: "waived",
    reason: "legacy-credit-note",
  };
}
