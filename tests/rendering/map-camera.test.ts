import { describe, expect, it } from "vitest";
import {
  fitViewBox,
  mapPointFromViewport,
  panViewBox,
  zoomViewBoxAt,
  type MapViewBox,
} from "../../src/rendering/map-camera.js";

const bounds: MapViewBox = { x: 0, y: 0, width: 1_200, height: 800 };

describe("map camera", () => {
  it("zooms around the pointer while respecting the supported scale range", () => {
    const zoomed = zoomViewBoxAt(bounds, bounds, 2, { x: 300, y: 200 });

    expect(zoomed).toEqual({ x: 150, y: 100, width: 600, height: 400 });
    const maximumZoom = zoomViewBoxAt(zoomed, bounds, 100, { x: 300, y: 200 });
    expect(maximumZoom.x).toBeCloseTo(237.5);
    expect(maximumZoom.y).toBeCloseTo(158.33333333333334);
    expect(maximumZoom.width).toBeCloseTo(250);
    expect(maximumZoom.height).toBeCloseTo(166.66666666666666);
  });

  it("pans in world coordinates and restores the complete graph", () => {
    const current = { x: 150, y: 100, width: 600, height: 400 };

    expect(panViewBox(current, { x: 120, y: -80 }, { width: 1_200, height: 800 }))
      .toEqual({ x: 90, y: 140, width: 600, height: 400 });
    expect(fitViewBox(bounds)).toEqual(bounds);
    expect(fitViewBox(bounds)).not.toBe(bounds);
  });

  it("maps the pointer through SVG aspect-ratio letterboxing", () => {
    const portraitMap = { x: 0, y: 0, width: 2_944.8, height: 3_643.75 };

    const point = mapPointFromViewport(
      { x: 896, y: 326 },
      portraitMap,
      { width: 1_280, height: 652 },
    );

    expect(point.x).toBeCloseTo(2_903.0748466257673);
    expect(point.y).toBeCloseTo(1_821.875);

    const panned = panViewBox(
      portraitMap,
      { x: 100, y: 0 },
      { width: 1_280, height: 652 },
    );
    expect(panned.x).toBeCloseTo(-558.8573619631902);
  });
});
