import { expect, it } from "vitest";
import { reserveInventory } from "./reserve-inventory.js";

it("rejects zero inventory reservations", () => {
  expect(() => reserveInventory(0)).toThrow();
});
