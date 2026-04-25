// Mock implementation for ordering-checkout-v1

export class CheckoutService {
  async checkout(cartId: string): Promise<string> {
    // Mock implementation
    return "order-123";
  }
}
