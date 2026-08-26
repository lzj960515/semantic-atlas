import { expect, it } from "vitest";
import { isRefundEligible } from "./is-refund-eligible.js";

it("keeps gift orders eligible during the return window", () => {
  expect(isRefundEligible(10, true)).toBe(true);
});
