export function createOrder(): { orderId: string; status: string } {
  return {
    orderId: "legacy-order",
    status: "queued",
  };
}
