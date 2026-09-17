import type dagre from "@dagrejs/dagre";
import type {
  DiagramLayout,
  DiagramLayoutSpec,
  DiagramSize,
  DiagramPoint,
} from "./viewer-layout.js";

/** 浏览器直接序列化此入口；所有运行时协作都通过参数传入。 */
export function createDiagramLayoutController(
  dagreApi: Pick<typeof dagre, "graphlib" | "layout">,
  arrange: (
    api: Pick<typeof dagre, "graphlib" | "layout">,
    spec: DiagramLayoutSpec,
    sizes: Readonly<Record<string, DiagramSize>>,
  ) => DiagramLayout,
  onLayout: (svg: SVGSVGElement, previousBounds: DiagramSize, originDelta?: DiagramPoint) => void,
  reposition: (
    base: DiagramLayout,
    spec: DiagramLayoutSpec,
    offsets: Readonly<Record<string, DiagramPoint>>,
  ) => DiagramLayout,
): {
  observe(view: HTMLElement, spec: DiagramLayoutSpec): void;
  disconnect(): void;
  moveNode(id: string, delta: DiagramPoint): void;
  reset(): void;
} {
  let observer: ResizeObserver | undefined;
  let frame: number | undefined;
  const offsetsByView = new WeakMap<HTMLElement, Record<string, DiagramPoint>>();
  let moveNode = (_id: string, _delta: DiagramPoint): void => {};
  let reset = (): void => {};

  const disconnect = (): void => {
    observer?.disconnect();
    observer = undefined;
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    moveNode = () => {};
    reset = () => {};
  };

  const observe = (view: HTMLElement, spec: DiagramLayoutSpec): void => {
    disconnect();
    const svg = view.querySelector<SVGSVGElement>("svg");
    const root = svg?.querySelector<SVGGElement>("[data-layout-root]");
    if (!svg || !root) return;
    const cards = Array.from(
      view.querySelectorAll<HTMLElement>(".diagram-card-text[data-layout-node]"),
    );
    const labels = Array.from(
      view.querySelectorAll<HTMLElement>(".diagram-label[data-layout-edge]"),
    );
    const cardById = new Map(cards.map((card) => [card.dataset.layoutNode!, card]));
    const labelById = new Map(labels.map((label) => [label.dataset.layoutEdge!, label]));
    const shapeById = new Map(
      Array.from(root.querySelectorAll<SVGGElement>("[data-layout-node]")).map((shape) => [
        shape.dataset.layoutNode!,
        shape,
      ]),
    );
    const edgeById = new Map(
      Array.from(root.querySelectorAll<SVGGElement>("[data-layout-edge]")).map((edge) => [
        edge.dataset.layoutEdge!,
        edge,
      ]),
    );
    const definitionById = new Map(spec.nodes.map((node) => [node.id, node]));
    let previousMeasurements = "";
    const offsets = offsetsByView.get(view) ?? {};
    offsetsByView.set(view, offsets);
    let automaticLayout: DiagramLayout;
    let currentLayout: DiagramLayout | undefined;
    let measuredSpec = spec;

    const update = (): void => {
      frame = undefined;
      const sizes = Object.fromEntries(
        cards.map((card) => [
          card.dataset.layoutNode!,
          { width: card.offsetWidth, height: card.offsetHeight },
        ]),
      );
      const edges = spec.edges.map((edge) => {
        const label = labelById.get(edge.id);
        return label ? { ...edge, width: label.offsetWidth, height: label.offsetHeight } : edge;
      });
      const measurements = JSON.stringify([sizes, edges]);
      if (measurements === previousMeasurements) return;
      previousMeasurements = measurements;
      const layout = arrange(dagreApi, { ...spec, edges }, sizes);
      automaticLayout = layout;
      measuredSpec = { ...spec, edges };
      paint(reposition(layout, measuredSpec, offsets), false);
    };

    const paint = (layout: DiagramLayout, manual: boolean): void => {
      const previousBounds = {
        width: Number(svg.dataset.canvasWidth),
        height: Number(svg.dataset.canvasHeight),
      };
      svg.dataset.canvasWidth = String(layout.width);
      svg.dataset.canvasHeight = String(layout.height);
      svg.setAttribute("width", String(layout.width));
      svg.setAttribute("height", String(layout.height));
      root.setAttribute("transform", `translate(${layout.offsetX} ${layout.offsetY})`);

      for (const node of layout.nodes) {
        const definition = definitionById.get(node.id)!;
        const shape = shapeById.get(node.id);
        const card = cardById.get(node.id);
        const decision = definition.kind === "decision";
        const left = node.x - node.width / 2;
        const top = node.y - node.height / 2;
        const surface = shape?.querySelector<SVGElement>(
          ".node-card__surface, .flow-step__surface",
        );
        if (decision) {
          surface?.setAttribute(
            "d",
            `M ${node.x} ${top} L ${left + node.width} ${node.y} L ${node.x} ${top + node.height} L ${left} ${node.y} Z`,
          );
        } else {
          surface?.setAttribute("x", String(left));
          surface?.setAttribute("y", String(top));
          surface?.setAttribute("width", String(node.width));
          surface?.setAttribute("height", String(node.height));
        }
        const rule = shape?.querySelector(".node-card__kind-rule");
        rule?.setAttribute("x", String(left));
        rule?.setAttribute("y", String(top));
        rule?.setAttribute("height", String(node.height));
        if (card) {
          card.style.left = `${node.x - card.offsetWidth / 2 + layout.offsetX}px`;
          card.style.top = `${node.y - card.offsetHeight / 2 + layout.offsetY}px`;
        }
      }
      for (const edge of layout.edges) {
        const path = edge.points
          .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
          .join(" ");
        edgeById.get(edge.id)?.querySelector("path")?.setAttribute("d", path);
        const label = labelById.get(edge.id);
        if (label) {
          label.style.left = `${edge.x + layout.offsetX}px`;
          label.style.top = `${edge.y + layout.offsetY}px`;
        }
      }
      const originDelta =
        manual && currentLayout
          ? { x: layout.offsetX - currentLayout.offsetX, y: layout.offsetY - currentLayout.offsetY }
          : undefined;
      currentLayout = layout;
      onLayout(svg, previousBounds, originDelta);
    };

    moveNode = (id, delta): void => {
      if (!automaticLayout || !definitionById.has(id)) return;
      const previous = offsets[id] ?? { x: 0, y: 0 };
      offsets[id] = { x: previous.x + delta.x, y: previous.y + delta.y };
      paint(reposition(automaticLayout, measuredSpec, offsets), true);
    };
    reset = (): void => {
      for (const id of Object.keys(offsets)) delete offsets[id];
      if (automaticLayout) paint(automaticLayout, false);
    };

    observer = new ResizeObserver(() => {
      if (frame === undefined) frame = requestAnimationFrame(update);
    });
    for (const element of [...cards, ...labels]) observer.observe(element);
    update();
  };

  return {
    observe,
    disconnect,
    moveNode: (id, delta) => moveNode(id, delta),
    reset: () => reset(),
  };
}
