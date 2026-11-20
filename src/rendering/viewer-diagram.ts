import type dagre from "@dagrejs/dagre";
import type {
  DiagramLayout,
  DiagramLayoutSpec,
  DiagramPoint,
  DiagramSize,
} from "./viewer-layout.js";

/** 只维护当前流程的实际文字尺寸和连接线，不保存用户编辑状态。 */
export function createDiagramLayoutController(
  dagreApi: Pick<typeof dagre, "graphlib" | "layout">,
  arrange: (
    api: Pick<typeof dagre, "graphlib" | "layout">,
    spec: DiagramLayoutSpec,
    sizes: Readonly<Record<string, DiagramSize>>,
    viewport?: DiagramSize,
  ) => DiagramLayout,
  edgePath: (points: readonly DiagramPoint[]) => string,
  onLayout: (view: HTMLElement) => void,
): { observe(view: HTMLElement, spec: DiagramLayoutSpec): void; disconnect(): void } {
  let observer: ResizeObserver | undefined;
  let frame: number | undefined;
  const disconnect = (): void => {
    observer?.disconnect();
    observer = undefined;
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
  };
  const observe = (view: HTMLElement, spec: DiagramLayoutSpec): void => {
    disconnect();
    const world = view.querySelector<HTMLElement>(".diagram-world");
    const svg = view.querySelector<SVGSVGElement>("svg");
    const root = svg?.querySelector<SVGGElement>("[data-layout-root]");
    if (!world || !svg || !root) return;
    const cards = Array.from(view.querySelectorAll<HTMLElement>("[data-layout-node]"));
    const labels = Array.from(view.querySelectorAll<HTMLElement>(".diagram-label"));
    const labelById = new Map(labels.map((label) => [label.dataset.layoutEdge!, label]));
    const edgeById = new Map(
      Array.from(root.querySelectorAll<SVGPathElement>("[data-layout-edge]")).map((edge) => [
        edge.dataset.layoutEdge!,
        edge,
      ]),
    );
    let previous = "";
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
      const viewport = { width: view.clientWidth, height: view.clientHeight };
      const measurement = JSON.stringify([sizes, edges, viewport]);
      if (measurement === previous) return;
      previous = measurement;
      const layout = arrange(dagreApi, { ...spec, edges }, sizes, viewport);
      world.dataset.canvasWidth = String(layout.width);
      world.dataset.canvasHeight = String(layout.height);
      world.style.width = `${layout.width}px`;
      world.style.height = `${layout.height}px`;
      svg.setAttribute("width", String(layout.width));
      svg.setAttribute("height", String(layout.height));
      svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
      root.setAttribute("transform", `translate(${layout.offsetX} ${layout.offsetY})`);
      for (const node of layout.nodes) {
        const card = cards.find((item) => item.dataset.layoutNode === node.id);
        if (!card) continue;
        card.style.left = `${node.x - node.width / 2 + layout.offsetX}px`;
        card.style.top = `${node.y - node.height / 2 + layout.offsetY}px`;
      }
      for (const edge of layout.edges) {
        edgeById.get(edge.id)?.setAttribute("d", edgePath(edge.points));
        const label = labelById.get(edge.id);
        if (!label) continue;
        label.style.left = `${edge.x + layout.offsetX}px`;
        label.style.top = `${edge.y + layout.offsetY}px`;
      }
      onLayout(view);
    };
    observer = new ResizeObserver(() => {
      if (frame === undefined) frame = requestAnimationFrame(update);
    });
    for (const element of [...cards, ...labels]) observer.observe(element);
    observer.observe(view);
    update();
  };
  return { observe, disconnect };
}
