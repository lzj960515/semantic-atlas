import { expect, it } from "vitest";
import { authorizeOrder } from "./authorize-order.js";

it("uses the active policy threshold", () => {
  expect(authorizeOrder(50)).toBe(false);
});
