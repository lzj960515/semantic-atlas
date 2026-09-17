import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { planDiagramImage } from "../../src/rendering/diagram-image.js";

describe("diagram image dimensions", () => {
  it("exports small diagrams at twice their full layout size", () => {
    expect(planDiagramImage({ width: 960, height: 1504 })).toEqual({
      width: 960,
      height: 1504,
      pixelWidth: 1920,
      pixelHeight: 3008,
    });
  });

  it("keeps a large business map readable within the raster memory budget", () => {
    const image = planDiagramImage({ width: 5104, height: 8473 });
    expect(image.pixelWidth).toBeGreaterThanOrEqual(5104);
    expect(image.pixelHeight).toBeGreaterThanOrEqual(8473);
    expect(image.pixelWidth * image.pixelHeight).toBeLessThanOrEqual(64_000_000);
    expect(image.pixelWidth / image.pixelHeight).toBeCloseTo(5104 / 8473, 3);
  });

  it("limits long narrow diagrams without clipping their extent", () => {
    const image = planDiagramImage({ width: 960, height: 12000 });
    expect(image).toMatchObject({ width: 960, height: 12000, pixelHeight: 16384 });
    expect(image.pixelWidth / image.pixelHeight).toBeCloseTo(960 / 12000, 3);
  });

  it("reports oversized diagrams instead of silently shrinking text below native size", () => {
    expect(() => planDiagramImage({ width: 10000, height: 10000 })).toThrow(/too large/);
    expect(() => planDiagramImage({ width: 960, height: 17000 })).toThrow(/too large/);
  });

  it.each([0, -1, NaN, Infinity])("rejects invalid canvas bounds: %s", (width) => {
    expect(() => planDiagramImage({ width, height: 100 })).toThrow(/dimensions/);
  });

  it("runs identically in the self-contained offline Viewer", () => {
    const size = { width: 5104, height: 8473 };
    const result = runInNewContext(`(${planDiagramImage.toString()})(size)`, { size });
    expect(JSON.parse(JSON.stringify(result))).toEqual(planDiagramImage(size));
  });
});
