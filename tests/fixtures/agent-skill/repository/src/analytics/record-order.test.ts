import { expect, it } from "vitest";
import { recordOrder } from "./record-order.js";

it("records the current Order placed contract", () => {
  expect(recordOrder({ orderId: "order-1", totalCents: 800 })).toEqual({
    orderId: "order-1",
    totalCents: 800,
  });
});
