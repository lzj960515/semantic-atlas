import { describe, expect, it, vi } from "vitest";

import { ExportProcessor } from "../../src/exports/export.processor.js";
import { ExportResolver } from "../../src/exports/export.resolver.js";

describe("export request flow", () => {
  it("queues and processes one export request", async () => {
    const producer = { enqueue: vi.fn(async () => ({ id: "job-1" })) };
    const resolver = new ExportResolver(producer as never);
    await expect(resolver.requestExport("account-1", "csv", "user-1"))
      .resolves.toBe("job-1");

    const service = { generate: vi.fn(async () => "/exports/account-1.csv") };
    const processor = new ExportProcessor(service as never);
    await expect(processor.process({
      data: { accountId: "account-1", format: "csv", requestedBy: "user-1" },
    } as never)).resolves.toBe("/exports/account-1.csv");
  });
});
