import { describe, expect, it } from "vitest";

import { BUSINESS_MAP_WORLD, layoutBusinessMap } from "../../src/web/client/map-layout.js";

describe("business map spatial layout", () => {
  it("places the visible frontier around a stable center instead of a card grid", () => {
    const layout = layoutBusinessMap([
      { key: "orders", role: "root" },
      { key: "billing", role: "root" },
      { key: "fulfillment", role: "root" },
    ]);

    expect(layout.center).toEqual({
      x: BUSINESS_MAP_WORLD.width / 2,
      y: BUSINESS_MAP_WORLD.height / 2,
    });
    expect(layout.nodes.map(({ key }) => key)).toEqual(["orders", "billing", "fulfillment"]);
    expect(new Set(layout.nodes.map(({ x, y }) => `${x}:${y}`)).size).toBe(3);
    expect(layout.nodes.every(({ x, y }) => (
      x > 0
      && x < BUSINESS_MAP_WORLD.width
      && y > 0
      && y < BUSINESS_MAP_WORLD.height
      && (x !== layout.center.x || y !== layout.center.y)
    ))).toBe(true);
  });

  it("keeps context regions on an outer ring and produces deterministic positions", () => {
    const regions = [
      { key: "create-order", role: "child" as const },
      { key: "cancel-order", role: "child" as const },
      { key: "inventory", role: "context" as const },
    ];

    const first = layoutBusinessMap(regions);
    const second = layoutBusinessMap(regions);
    const child = first.nodes.find(({ key }) => key === "create-order")!;
    const context = first.nodes.find(({ key }) => key === "inventory")!;

    expect(second).toEqual(first);
    expect(context.ring).toBeGreaterThan(child.ring);
    expect(distanceFromCenter(context)).toBeGreaterThan(distanceFromCenter(child));
  });

  it("places children outward from their parent while preserving existing regions", () => {
    const roots = layoutBusinessMap([
      { key: "orders", role: "root" },
      { key: "billing", role: "root" },
    ]);
    const orders = roots.nodes.find(({ key }) => key === "orders")!;
    const expanded = layoutBusinessMap([
      { key: "orders", role: "root" },
      { key: "billing", role: "root" },
      { key: "create-order", parentKey: "orders", role: "child" },
      { key: "cancel-order", parentKey: "orders", role: "child" },
      { key: "inventory", parentKey: "orders", role: "context" },
    ], roots.nodes);
    const createOrder = expanded.nodes.find(({ key }) => key === "create-order")!;
    const inventory = expanded.nodes.find(({ key }) => key === "inventory")!;
    const stableOrders = expanded.nodes.find(({ key }) => key === "orders")!;

    expect(stableOrders).toMatchObject({ x: orders.x, y: orders.y });
    expect(distanceFromCenter(createOrder)).toBeGreaterThan(distanceFromCenter(orders));
    expect(distanceFromCenter(inventory)).toBeGreaterThan(distanceFromCenter(createOrder));
    expect(new Set(expanded.nodes.map(({ x, y }) => `${x}:${y}`)).size).toBe(expanded.nodes.length);
  });
});

function distanceFromCenter(point: { readonly x: number; readonly y: number }): number {
  const x = point.x - BUSINESS_MAP_WORLD.width / 2;
  const y = point.y - BUSINESS_MAP_WORLD.height / 2;
  return Math.hypot(x, y);
}
