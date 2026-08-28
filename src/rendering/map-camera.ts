export interface MapViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MapPoint {
  readonly x: number;
  readonly y: number;
}

export interface MapViewport {
  readonly width: number;
  readonly height: number;
}

export const MAP_SCALE_LIMITS = {
  minimum: 0.2,
  maximum: 4.8,
} as const;

export function fitViewBox(bounds: MapViewBox): MapViewBox {
  return { ...bounds };
}

export function zoomViewBoxAt(
  current: MapViewBox,
  bounds: MapViewBox,
  factor: number,
  anchor: MapPoint,
): MapViewBox {
  const currentScale = bounds.width / current.width;
  const targetScale = clamp(
    currentScale * factor,
    MAP_SCALE_LIMITS.minimum,
    MAP_SCALE_LIMITS.maximum,
  );
  const targetWidth = bounds.width / targetScale;
  const targetHeight = bounds.height / targetScale;
  const anchorRatioX = (anchor.x - current.x) / current.width;
  const anchorRatioY = (anchor.y - current.y) / current.height;

  return {
    x: anchor.x - anchorRatioX * targetWidth,
    y: anchor.y - anchorRatioY * targetHeight,
    width: targetWidth,
    height: targetHeight,
  };
}

export function panViewBox(
  current: MapViewBox,
  pointerDelta: MapPoint,
  viewport: MapViewport,
): MapViewBox {
  const scale = viewportScale(current, viewport);
  return {
    ...current,
    x: current.x - pointerDelta.x / scale,
    y: current.y - pointerDelta.y / scale,
  };
}

export function mapPointFromViewport(
  viewportPoint: MapPoint,
  viewBox: MapViewBox,
  viewport: MapViewport,
): MapPoint {
  const scale = viewportScale(viewBox, viewport);
  const renderedWidth = viewBox.width * scale;
  const renderedHeight = viewBox.height * scale;
  const offsetX = (viewport.width - renderedWidth) / 2;
  const offsetY = (viewport.height - renderedHeight) / 2;

  return {
    x: viewBox.x + (viewportPoint.x - offsetX) / scale,
    y: viewBox.y + (viewportPoint.y - offsetY) / scale,
  };
}

export function viewportScale(viewBox: MapViewBox, viewport: MapViewport): number {
  return Math.min(
    viewport.width / viewBox.width,
    viewport.height / viewBox.height,
  );
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
