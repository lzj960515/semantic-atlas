export const MAP_CAMERA_LIMITS = {
  minScale: 0.2,
  maxScale: 4.8,
} as const;

export interface MapCamera {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

export interface MapPoint {
  readonly x: number;
  readonly y: number;
}

export interface MapViewport {
  readonly width: number;
  readonly height: number;
}

export interface MapBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export function zoomMapCameraAt(
  camera: MapCamera,
  factor: number,
  pointer: MapPoint,
): MapCamera {
  const scale = clamp(camera.scale * factor, MAP_CAMERA_LIMITS.minScale, MAP_CAMERA_LIMITS.maxScale);
  const worldX = (pointer.x - camera.x) / camera.scale;
  const worldY = (pointer.y - camera.y) / camera.scale;
  return {
    scale,
    x: pointer.x - worldX * scale,
    y: pointer.y - worldY * scale,
  };
}

export function panMapCamera(camera: MapCamera, delta: MapPoint): MapCamera {
  return {
    ...camera,
    x: camera.x + delta.x,
    y: camera.y + delta.y,
  };
}

export function fitMapCamera(
  viewport: MapViewport,
  bounds: MapBounds,
  padding = 80,
): MapCamera {
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const scale = clamp(
    Math.min((viewport.width - padding * 2) / width, (viewport.height - padding * 2) / height),
    MAP_CAMERA_LIMITS.minScale,
    MAP_CAMERA_LIMITS.maxScale,
  );
  return {
    scale,
    x: (viewport.width - width * scale) / 2 - bounds.left * scale,
    y: (viewport.height - height * scale) / 2 - bounds.top * scale,
  };
}

export function semanticRevealScale(depth: number): number {
  if (depth <= 1) return MAP_CAMERA_LIMITS.minScale;
  return clamp(0.55 * 1.6 ** (depth - 1), MAP_CAMERA_LIMITS.minScale, MAP_CAMERA_LIMITS.maxScale);
}

export function isMapNodeVisible(depth: number, scale: number): boolean {
  return depth <= 1 || scale >= semanticRevealScale(depth);
}

export function isMapConnectionVisible(
  fromDepth: number,
  toDepth: number,
  scale: number,
): boolean {
  return isMapNodeVisible(fromDepth, scale) && isMapNodeVisible(toDepth, scale);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
