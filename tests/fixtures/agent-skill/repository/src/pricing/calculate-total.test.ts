import { expect, it } from "vitest";
import { calculateTotal } from "./calculate-total.js";

it("applies a coupon as a percentage of subtotal", () => {
  expect(calculateTotal(1_000, 20)).toBe(800);
});
