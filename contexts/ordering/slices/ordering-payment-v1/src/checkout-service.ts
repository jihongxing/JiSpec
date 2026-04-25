// Mock implementation for ordering-payment-v1

export class CheckoutService {
  async checkout(cartId: string): Promise<string> {
    // Mock implementation
    return "order-123";
  }
}
