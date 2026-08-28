import {
  clamp,
  fitViewBox,
  MAP_SCALE_LIMITS,
  mapPointFromViewport,
  panViewBox,
  viewportScale,
  zoomViewBoxAt,
  type MapPoint,
  type MapViewBox,
  type MapViewport,
} from "./map-camera.js";

interface ViewerNavigationAnchorModel {
  readonly kind: string;
  readonly value: string;
  readonly description: string;
}

interface ViewerNodeModel {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly summary: string;
  readonly boundary: boolean;
  readonly anchors: readonly ViewerNavigationAnchorModel[];
}

interface ViewerMapModel {
  readonly id: string;
  readonly name: string;
  readonly nodeCount: number;
  readonly relationCount: number;
  readonly nodes: readonly ViewerNodeModel[];
}

interface ViewerProjectModel {
  readonly id: string;
  readonly name: string;
  readonly views: readonly ViewerMapModel[];
}

interface ViewerModel {
  readonly projects: readonly ViewerProjectModel[];
}

export function renderViewerBrowserScript(): string {
  return [
    `const MAP_SCALE_LIMITS = ${JSON.stringify(MAP_SCALE_LIMITS)};`,
    clamp.toString(),
    viewportScale.toString(),
    fitViewBox.toString(),
    zoomViewBoxAt.toString(),
    mapPointFromViewport.toString(),
    panViewBox.toString(),
    "globalThis.__semanticAtlasCamera = { fitViewBox, zoomViewBoxAt, mapPointFromViewport, panViewBox };",
    `(${viewerBrowserEntry.toString()})();`,
  ].join("\n");
}

interface BrowserCameraApi {
  fitViewBox(bounds: MapViewBox): MapViewBox;
  zoomViewBoxAt(
    current: MapViewBox,
    bounds: MapViewBox,
    factor: number,
    anchor: MapPoint,
  ): MapViewBox;
  mapPointFromViewport(
    viewportPoint: MapPoint,
    viewBox: MapViewBox,
    viewport: MapViewport,
  ): MapPoint;
  panViewBox(current: MapViewBox, pointerDelta: MapPoint, viewport: MapViewport): MapViewBox;
}

interface MapDragState {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly x: number;
  readonly y: number;
  readonly moved: boolean;
  readonly nodeElement?: SVGGElement;
}

function viewerBrowserEntry(): void {
  const cameraApi = (globalThis as typeof globalThis & {
    readonly __semanticAtlasCamera: BrowserCameraApi;
  }).__semanticAtlasCamera;
  const modelElement = document.querySelector<HTMLScriptElement>("#viewer-model");
  const projectSelect = document.querySelector<HTMLSelectElement>("#project-select");
  const domainSelect = document.querySelector<HTMLSelectElement>("#domain-select");
  const statistics = document.querySelector<HTMLElement>("#map-statistics");
  const viewport = document.querySelector<HTMLElement>("#map-viewport");
  const nodeDetails = document.querySelector<HTMLElement>("#node-details");
  const detailsKind = document.querySelector<HTMLElement>("#node-details-kind");
  const detailsTitle = document.querySelector<HTMLElement>("#node-details-title");
  const detailsSummary = document.querySelector<HTMLElement>("#node-details-summary");
  const detailsAnchors = document.querySelector<HTMLElement>("#node-details-anchors");
  const detailsAnchorList = document.querySelector<HTMLElement>("#node-details-anchor-list");
  const detailsClose = document.querySelector<HTMLButtonElement>('[data-action="close-details"]');
  const mapViews = Array.from(
    document.querySelectorAll<HTMLElement>("[data-project-view]"),
  );
  if (
    !modelElement
    || !projectSelect
    || !domainSelect
    || !statistics
    || !viewport
    || !nodeDetails
    || !detailsKind
    || !detailsTitle
    || !detailsSummary
    || !detailsAnchors
    || !detailsAnchorList
    || !detailsClose
  ) return;

  const model = JSON.parse(modelElement.textContent ?? "{}") as ViewerModel;
  const cameras = new Map<string, MapViewBox>();
  let activeProjectId = model.projects[0]?.id;
  let activeViewId = model.projects[0]?.views[0]?.id;
  let activeNodeElement: SVGGElement | undefined;
  let dragState: MapDragState | undefined;

  const currentProject = (): ViewerProjectModel | undefined =>
    model.projects.find(({ id }) => id === activeProjectId);
  const currentView = (): ViewerMapModel | undefined =>
    currentProject()?.views.find(({ id }) => id === activeViewId);
  const cameraKey = (): string => `${activeProjectId ?? ""}:${activeViewId ?? ""}`;
  const activeSvg = (): SVGSVGElement | undefined =>
    mapViews.find((element) =>
      element.dataset.projectId === activeProjectId && element.dataset.mapView === activeViewId)
      ?.querySelector<SVGSVGElement>("svg") ?? undefined;
  const mapBounds = (svg: SVGSVGElement): MapViewBox => ({
    x: 0,
    y: 0,
    width: Number(svg.dataset.canvasWidth),
    height: Number(svg.dataset.canvasHeight),
  });
  const applyCamera = (svg: SVGSVGElement, camera: MapViewBox): void => {
    cameras.set(cameraKey(), camera);
    svg.setAttribute("viewBox", `${camera.x} ${camera.y} ${camera.width} ${camera.height}`);
  };
  const ensureCamera = (svg: SVGSVGElement): MapViewBox => {
    const stored = cameras.get(cameraKey());
    if (stored) return stored;
    const fitted = cameraApi.fitViewBox(mapBounds(svg));
    cameras.set(cameraKey(), fitted);
    return fitted;
  };

  const closeNodeDetails = (restoreFocus = false): void => {
    const previousNode = activeNodeElement;
    previousNode?.setAttribute("aria-expanded", "false");
    activeNodeElement = undefined;
    nodeDetails.hidden = true;
    if (restoreFocus) previousNode?.focus({ preventScroll: true });
  };

  const createAnchorElement = (anchor: ViewerNavigationAnchorModel): HTMLElement => {
    const element = document.createElement("article");
    element.className = "node-details__anchor";
    const kind = document.createElement("span");
    kind.className = "node-details__anchor-kind";
    kind.textContent = anchor.kind;
    const value = document.createElement("code");
    value.textContent = anchor.value;
    const description = document.createElement("p");
    description.textContent = anchor.description;
    element.append(kind, value, description);
    return element;
  };

  const openNodeDetails = (nodeElement: SVGGElement): void => {
    const nodeId = nodeElement.dataset.nodeId;
    const node = currentView()?.nodes.find(({ id }) => id === nodeId);
    if (!node) return;

    activeNodeElement?.setAttribute("aria-expanded", "false");
    activeNodeElement = nodeElement;
    nodeElement.setAttribute("aria-expanded", "true");
    detailsKind.textContent = node.boundary
      ? `${node.kind} / external boundary`
      : node.kind;
    detailsTitle.textContent = node.name;
    detailsSummary.textContent = node.summary;
    detailsAnchorList.replaceChildren(...node.anchors.map(createAnchorElement));
    detailsAnchors.hidden = node.anchors.length === 0;
    nodeDetails.hidden = false;
    detailsClose.focus({ preventScroll: true });
  };

  const populateDomains = (): void => {
    const project = currentProject();
    domainSelect.replaceChildren(...(project?.views ?? []).map((view) => {
      const option = document.createElement("option");
      option.value = view.id;
      option.textContent = view.name;
      return option;
    }));
    if (!project?.views.some(({ id }) => id === activeViewId)) {
      activeViewId = project?.views[0]?.id;
    }
    domainSelect.value = activeViewId ?? "";
    domainSelect.disabled = (project?.views.length ?? 0) < 2;
  };

  const activateView = (): void => {
    for (const view of mapViews) {
      const active = view.dataset.projectId === activeProjectId
        && view.dataset.mapView === activeViewId;
      view.hidden = !active;
    }
    const view = currentView();
    statistics.textContent = view
      ? `${view.nodeCount} concepts / ${view.relationCount} relationships`
      : "No business map";
    const svg = activeSvg();
    if (svg) applyCamera(svg, ensureCamera(svg));
  };

  const activateProject = (): void => {
    closeNodeDetails();
    activeProjectId = projectSelect.value;
    const project = currentProject();
    activeViewId = project?.views[0]?.id;
    populateDomains();
    activateView();
  };

  const zoom = (factor: number, pointer?: MapPoint): void => {
    const svg = activeSvg();
    if (!svg) return;
    const current = ensureCamera(svg);
    const anchor = pointer ?? {
      x: current.x + current.width / 2,
      y: current.y + current.height / 2,
    };
    applyCamera(svg, cameraApi.zoomViewBoxAt(current, mapBounds(svg), factor, anchor));
  };

  const fit = (): void => {
    const svg = activeSvg();
    if (svg) applyCamera(svg, cameraApi.fitViewBox(mapBounds(svg)));
  };

  projectSelect.addEventListener("change", activateProject);
  domainSelect.addEventListener("change", () => {
    closeNodeDetails();
    activeViewId = domainSelect.value;
    activateView();
  });
  detailsClose.addEventListener("click", () => closeNodeDetails(true));

  document.querySelector<HTMLElement>('[data-action="zoom-in"]')
    ?.addEventListener("click", () => zoom(1.3));
  document.querySelector<HTMLElement>('[data-action="zoom-out"]')
    ?.addEventListener("click", () => zoom(1 / 1.3));
  document.querySelector<HTMLElement>('[data-action="fit"]')
    ?.addEventListener("click", fit);

  viewport.addEventListener("wheel", (event) => {
    const svg = activeSvg();
    if (!svg) return;
    event.preventDefault();
    const bounds = svg.getBoundingClientRect();
    const camera = ensureCamera(svg);
    const pointer = cameraApi.mapPointFromViewport({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    }, camera, {
      width: bounds.width,
      height: bounds.height,
    });
    zoom(Math.exp(-event.deltaY * 0.0015), pointer);
  }, { passive: false });

  const nodeElementFromTarget = (target: EventTarget | null): SVGGElement | undefined =>
    target instanceof Element
      ? target.closest<SVGGElement>(".node-card") ?? undefined
      : undefined;

  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    document.getSelection()?.removeAllRanges();
    const nodeElement = nodeElementFromTarget(event.target);
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      ...(nodeElement ? { nodeElement } : {}),
    };
    viewport.setPointerCapture(event.pointerId);
    viewport.dataset.dragging = "true";
  });

  viewport.addEventListener("pointermove", (event) => {
    const svg = activeSvg();
    if (!svg || !dragState || dragState.pointerId !== event.pointerId) return;
    const moved = dragState.moved
      || Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) >= 4;
    if (!moved) return;

    const current = ensureCamera(svg);
    const viewportBounds = viewport.getBoundingClientRect();
    const pointerDelta = {
      x: event.clientX - (dragState.moved ? dragState.x : dragState.startX),
      y: event.clientY - (dragState.moved ? dragState.y : dragState.startY),
    };
    dragState = {
      ...dragState,
      x: event.clientX,
      y: event.clientY,
      moved: true,
    };
    applyCamera(svg, cameraApi.panViewBox(current, pointerDelta, {
      width: viewportBounds.width,
      height: viewportBounds.height,
    }));
  });

  const finishDrag = (event: PointerEvent, openDetails: boolean): void => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const completed = dragState;
    dragState = undefined;
    delete viewport.dataset.dragging;
    if (openDetails && !completed.moved && completed.nodeElement) {
      openNodeDetails(completed.nodeElement);
    }
  };
  viewport.addEventListener("pointerup", (event) => finishDrag(event, true));
  viewport.addEventListener("pointercancel", (event) => finishDrag(event, false));
  viewport.addEventListener("keydown", (event) => {
    const nodeElement = nodeElementFromTarget(event.target);
    if (!nodeElement || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    openNodeDetails(nodeElement);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !nodeDetails.hidden) {
      event.preventDefault();
      closeNodeDetails(true);
      return;
    }
    if (
      event.target instanceof HTMLInputElement
      || event.target instanceof HTMLSelectElement
      || event.target instanceof HTMLButtonElement
    ) return;
    if (event.key === "+" || event.key === "=") zoom(1.3);
    if (event.key === "-") zoom(1 / 1.3);
    if (event.key === "0") fit();
  });

  projectSelect.disabled = model.projects.length < 2;
  projectSelect.value = activeProjectId ?? "";
  populateDomains();
  activateView();
}
