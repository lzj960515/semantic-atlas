import { describe, expect, it } from "vitest";

import {
  MAP_CAMERA_LIMITS,
  fitMapCamera,
  isMapConnectionVisible,
  isMapNodeVisible,
  panMapCamera,
  semanticRevealScale,
  zoomMapCameraAt,
} from "../../src/web/client/map-camera.js";

describe("business map camera", () => {
  it("zooms around the pointer without moving the world point under it", () => {
    const camera = { scale: 1, x: 120, y: 80 };
    const pointer = { x: 340, y: 260 };
    const before = worldPoint(camera, pointer);
    const after = zoomMapCameraAt(camera, 1.6, pointer);

    expect(worldPoint(after, pointer)).toEqual(before);
    expect(after.scale).toBe(1.6);
  });

  it("clamps scale and fits all loaded map bounds into the viewport", () => {
    expect(zoomMapCameraAt({ scale: 4.7, x: 0, y: 0 }, 2, { x: 10, y: 10 }).scale)
      .toBe(MAP_CAMERA_LIMITS.maxScale);
    const fitted = fitMapCamera(
      { width: 900, height: 620 },
      { left: 400, top: 250, right: 1_600, bottom: 1_000 },
    );

    expect(fitted.scale).toBeGreaterThanOrEqual(MAP_CAMERA_LIMITS.minScale);
    expect(fitted.scale).toBeLessThanOrEqual(MAP_CAMERA_LIMITS.maxScale);
    expect(fitted.x + 400 * fitted.scale).toBeGreaterThan(0);
    expect(fitted.x + 1_600 * fitted.scale).toBeLessThan(900);
    expect(fitted.y + 250 * fitted.scale).toBeGreaterThan(0);
    expect(fitted.y + 1_000 * fitted.scale).toBeLessThan(620);
  });

  it("pans without changing the current zoom level", () => {
    expect(panMapCamera({ scale: 1.4, x: 80, y: -10 }, { x: 35, y: 42 })).toEqual({
      scale: 1.4,
      x: 115,
      y: 32,
    });
  });

  it("reveals progressively deeper business levels without hiding roots", () => {
    expect(semanticRevealScale(1)).toBe(MAP_CAMERA_LIMITS.minScale);
    expect(semanticRevealScale(2)).toBeCloseTo(0.88);
    expect(semanticRevealScale(3)).toBeCloseTo(1.408);
    expect(isMapNodeVisible(1, MAP_CAMERA_LIMITS.minScale)).toBe(true);
    expect(isMapNodeVisible(2, 0.87)).toBe(false);
    expect(isMapNodeVisible(2, semanticRevealScale(2))).toBe(true);
  });

  it("hides a connection whenever either endpoint is semantically hidden", () => {
    expect(isMapConnectionVisible(1, 1, MAP_CAMERA_LIMITS.minScale)).toBe(true);
    expect(isMapConnectionVisible(1, 2, 0.87)).toBe(false);
    expect(isMapConnectionVisible(1, 2, semanticRevealScale(2))).toBe(true);
    expect(isMapConnectionVisible(2, 3, 1)).toBe(false);
  });
});

function worldPoint(
  camera: { readonly scale: number; readonly x: number; readonly y: number },
  point: { readonly x: number; readonly y: number },
): { x: number; y: number } {
  return {
    x: (point.x - camera.x) / camera.scale,
    y: (point.y - camera.y) / camera.scale,
  };
}
