import { getTranslator } from "../i18n/index.js";
import type { toBlob } from "html-to-image";
import type { DiagramSize } from "./viewer-layout.js";

const t = getTranslator("en");

// A local alias keeps serialized functions independent of module-loader rewrites.
const defaultTranslate = t;

export interface DiagramImagePlan extends DiagramSize {
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

/** 只使用完整布局尺寸，屏幕大小和相机缩放不参与图片分辨率计算。 */
export function planDiagramImage(bounds: DiagramSize, translate?: typeof t): DiagramImagePlan {
  const width = Math.ceil(bounds.width);
  const height = Math.ceil(bounds.height);
  if (![width, height].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error((translate ?? defaultTranslate)("viewer.imageInvalidDimensions"));
  }
  // 同时限制边长和像素总量，避免大图分配数百 MB 以上的单个像素缓冲。
  const scale = Math.min(
    2,
    16384 / width,
    16384 / height,
    Math.sqrt(64_000_000 / (width * height)),
  );
  if (scale < 1) {
    throw new Error((translate ?? defaultTranslate)("viewer.imageTooLarge"));
  }
  return {
    width,
    height,
    pixelWidth: Math.floor(width * scale),
    pixelHeight: Math.floor(height * scale),
  };
}

/** 与布局入口一样，此函数会序列化到离线 Viewer，运行时依赖由参数传入。 */
export async function renderDiagramImage(
  view: HTMLElement,
  rasterize: typeof toBlob,
  planImage: typeof planDiagramImage,
  translate?: typeof t,
): Promise<{ blob: Blob; width: number; height: number }> {
  await document.fonts.ready;
  // 字体或翻译刚改变尺寸时，让 ResizeObserver 和布局帧先完成。
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  if (!view.isConnected || view.hidden) {
    throw new Error((translate ?? defaultTranslate)("viewer.imageSelectionChanged"));
  }
  const sourceSvg = view.querySelector<SVGSVGElement>("svg");
  if (!sourceSvg) throw new Error((translate ?? defaultTranslate)("viewer.imageNoDiagram"));
  const plan = planImage(
    {
      width: Number(sourceSvg.dataset.canvasWidth),
      height: Number(sourceSvg.dataset.canvasHeight),
    },
    translate,
  );
  const snapshot = view.cloneNode(true) as HTMLElement;
  const svg = snapshot.querySelector<SVGSVGElement>("svg")!;
  const textLayer = snapshot.querySelector<HTMLElement>(".diagram-text-layer")!;

  // html-to-image 深克隆 SVG 时不复制子元素样式，先固定图形的实际绘制样式。
  const sourceShapes = Array.from(sourceSvg.querySelectorAll<SVGElement>("*"));
  const shapes = Array.from(svg.querySelectorAll<SVGElement>("*"));
  const paintProperties = [
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-width",
    "stroke-opacity",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-linecap",
    "stroke-linejoin",
    "opacity",
  ];
  sourceShapes.forEach((source, index) => {
    const computed = getComputedStyle(source);
    for (const property of paintProperties) {
      const value = computed.getPropertyValue(property);
      const fragment = value.match(/url\(["']?[^)]*#([^"')]+)["']?\)/u);
      shapes[index]!.style.setProperty(property, fragment ? `url(#${fragment[1]})` : value);
    }
    shapes[index]!.style.transition = "none";
  });
  svg.setAttribute("viewBox", `0 0 ${plan.width} ${plan.height}`);
  textLayer.style.transform = "none";
  Object.assign(snapshot.style, {
    position: "fixed",
    inset: "auto",
    left: "-100000px",
    top: "0",
    width: `${plan.width}px`,
    height: `${plan.height}px`,
    pointerEvents: "none",
  });
  snapshot.setAttribute("aria-hidden", "true");
  snapshot.setAttribute("inert", "");
  document.body.append(snapshot);

  try {
    const blob = await rasterize(snapshot, {
      width: plan.width,
      height: plan.height,
      canvasWidth: plan.pixelWidth,
      canvasHeight: plan.pixelHeight,
      pixelRatio: 1,
      skipAutoScale: true,
      // Viewer 使用系统字体；导出无需扫描其他扩展注入的远程字体样式表。
      skipFonts: true,
      backgroundColor: "#f8f5ed",
      // 同时清除物理和逻辑偏移，避免计算样式里的 inset-inline 把图片移出画布。
      style: { position: "relative", inset: "auto", insetInline: "auto", insetBlock: "auto" },
    });
    if (!blob || blob.size === 0)
      throw new Error((translate ?? defaultTranslate)("viewer.imageCreationFailed"));
    return { blob, width: plan.pixelWidth, height: plan.pixelHeight };
  } finally {
    snapshot.remove();
  }
}
