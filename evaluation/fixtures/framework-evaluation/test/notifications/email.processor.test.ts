import { describe, expect, it, vi } from "vitest";

import { EmailProcessor } from "../../src/notifications/email.processor.js";

describe("EmailProcessor", () => {
  it("delivers the send-email job payload", async () => {
    const delivery = { send: vi.fn(async () => "message-1") };
    const processor = new EmailProcessor(delivery as never);
    const job = {
      data: {
        recipient: "buyer@example.test",
        template: "order-confirmation",
        variables: { orderId: "order-1" },
      },
    };

    await expect(processor.process(job as never)).resolves.toBe("message-1");
    expect(delivery.send).toHaveBeenCalledWith(job.data);
  });
});
