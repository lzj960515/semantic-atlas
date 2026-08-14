import { describe, expect, it, vi } from "vitest";

import { InvoiceService } from "../../src/billing/invoice.service.js";

describe("InvoiceService", () => {
  it("writes an invoice for an existing customer", async () => {
    const invoices = {
      create: vi.fn((value) => ({ id: "invoice-1", ...value })),
      save: vi.fn(async (value) => value),
    };
    const customers = {
      findOneByOrFail: vi.fn(async () => ({ id: "customer-1" })),
    };
    const service = new InvoiceService(invoices as never, customers as never);

    await expect(service.createInvoice("customer-1", 4200))
      .resolves.toMatchObject({ id: "invoice-1", totalCents: 4200 });
    expect(invoices.save).toHaveBeenCalledOnce();
  });
});
