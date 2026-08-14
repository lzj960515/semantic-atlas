import { describe, expect, it, vi } from "vitest";

import { OrderService } from "../../src/orders/order.service.js";

describe("OrderService", () => {
  it("persists a newly placed order", async () => {
    const repository = {
      create: vi.fn((value) => ({ id: "order-1", ...value })),
      save: vi.fn(async (value) => value),
    };
    const service = new OrderService(repository as never);

    await expect(service.placeOrder({ customerId: "customer-1", totalCents: 4200 }))
      .resolves.toMatchObject({ id: "order-1", totalCents: 4200 });
    expect(repository.save).toHaveBeenCalledOnce();
  });
});
