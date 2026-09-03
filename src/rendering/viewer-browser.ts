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
import { createLatestProjectLoader } from "./latest-project-loader.js";

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
  readonly relatedFlowIds: readonly string[];
}

interface ViewerFlowModel {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly scenario: {
    readonly id: string;
    readonly name: string;
  };
  readonly stepCount: number;
  readonly transitionCount: number;
}

interface ViewerMapModel {
  readonly id: string;
  readonly name: string;
  readonly nodeCount: number;
  readonly relationCount: number;
  readonly nodes: readonly ViewerNodeModel[];
}

interface ViewerProjectReferenceModel {
  readonly id: string;
  readonly name: string;
}

interface ViewerProjectModel extends ViewerProjectReferenceModel {
  readonly views: readonly ViewerMapModel[];
  readonly flows: readonly ViewerFlowModel[];
}

interface ViewerProjectPayloadModel {
  readonly project: ViewerProjectModel;
  readonly markup: string;
}

interface ViewerModel {
  readonly schemaVersion: 1;
  readonly mode: "export" | "web";
  readonly projects: readonly ViewerProjectReferenceModel[];
  readonly projectPayloads: readonly ViewerProjectPayloadModel[];
}

interface WebProjectEnvelope {
  readonly schemaVersion: 1;
  readonly ok: boolean;
  readonly data?: ViewerProjectPayloadModel;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
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
    createLatestProjectLoader.toString(),
    "globalThis.__semanticAtlasCamera = { fitViewBox, zoomViewBoxAt, mapPointFromViewport, panViewBox };",
    "globalThis.__semanticAtlasCreateLatestProjectLoader = createLatestProjectLoader;",
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

type ViewerViewType = "relationships" | "flows";

function viewerBrowserEntry(): void {
  const browserGlobal = globalThis as typeof globalThis & {
    readonly __semanticAtlasCamera: BrowserCameraApi;
    readonly __semanticAtlasCreateLatestProjectLoader: typeof createLatestProjectLoader;
  };
  const cameraApi = browserGlobal.__semanticAtlasCamera;
  const latestProjectLoader = browserGlobal.__semanticAtlasCreateLatestProjectLoader;
  const modelElement = document.querySelector<HTMLScriptElement>("#viewer-model");
  const projectSelect = document.querySelector<HTMLSelectElement>("#project-select");
  const domainSelect = document.querySelector<HTMLSelectElement>("#domain-select");
  const flowSelect = document.querySelector<HTMLSelectElement>("#flow-select");
  const relationshipSelector = document.querySelector<HTMLElement>("#relationship-selector");
  const flowSelector = document.querySelector<HTMLElement>("#flow-selector");
  const viewTypeButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button[data-view-type]"),
  );
  const cameraButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".camera-controls button"),
  );
  const statistics = document.querySelector<HTMLElement>("#map-statistics");
  const viewport = document.querySelector<HTMLElement>("#map-viewport");
  const projectViewHost = document.querySelector<HTMLElement>("#project-view-host");
  const viewerStatus = document.querySelector<HTMLElement>("#viewer-status");
  const statusEyebrow = document.querySelector<HTMLElement>("#viewer-status-eyebrow");
  const statusTitle = document.querySelector<HTMLElement>("#viewer-status-title");
  const statusMessage = document.querySelector<HTMLElement>("#viewer-status-message");
  const nodeDetails = document.querySelector<HTMLElement>("#node-details");
  const detailsKind = document.querySelector<HTMLElement>("#node-details-kind");
  const detailsTitle = document.querySelector<HTMLElement>("#node-details-title");
  const detailsSummary = document.querySelector<HTMLElement>("#node-details-summary");
  const detailsFlows = document.querySelector<HTMLElement>("#node-details-flows");
  const detailsFlowList = document.querySelector<HTMLElement>("#node-details-flow-list");
  const detailsAnchors = document.querySelector<HTMLElement>("#node-details-anchors");
  const detailsAnchorList = document.querySelector<HTMLElement>("#node-details-anchor-list");
  const detailsClose = document.querySelector<HTMLButtonElement>('[data-action="close-details"]');
  if (
    !modelElement
    || !projectSelect
    || !domainSelect
    || !flowSelect
    || !relationshipSelector
    || !flowSelector
    || viewTypeButtons.length !== 2
    || cameraButtons.length !== 3
    || !statistics
    || !viewport
    || !projectViewHost
    || !viewerStatus
    || !statusEyebrow
    || !statusTitle
    || !statusMessage
    || !nodeDetails
    || !detailsKind
    || !detailsTitle
    || !detailsSummary
    || !detailsFlows
    || !detailsFlowList
    || !detailsAnchors
    || !detailsAnchorList
    || !detailsClose
  ) return;

  const model = JSON.parse(modelElement.textContent ?? "{}") as ViewerModel;
  const cameras = new Map<string, MapViewBox>();
  let activeProjectId = model.projects[0]?.id;
  let activeProject: ViewerProjectModel | undefined;
  let activeViewId: string | undefined;
  let activeFlowId: string | undefined;
  let activeViewType: ViewerViewType = "relationships";
  let activeNodeElement: SVGGElement | undefined;
  let dragState: MapDragState | undefined;

  const currentProject = (): ViewerProjectModel | undefined =>
    activeProject?.id === activeProjectId ? activeProject : undefined;
  const currentView = (): ViewerMapModel | undefined =>
    currentProject()?.views.find(({ id }) => id === activeViewId);
  const currentFlow = (): ViewerFlowModel | undefined =>
    currentProject()?.flows.find(({ id }) => id === activeFlowId);
  const activeDiagramId = (): string | undefined =>
    activeViewType === "relationships" ? activeViewId : activeFlowId;
  const cameraKey = (): string =>
    `${activeProjectId ?? ""}:${activeViewType}:${activeDiagramId() ?? ""}`;
  const mapViews = (): readonly HTMLElement[] => Array.from(
    projectViewHost.querySelectorAll<HTMLElement>("[data-project-view]"),
  );
  const activeSvg = (): SVGSVGElement | undefined =>
    mapViews().find((element) =>
      element.dataset.projectId === activeProjectId
      && element.dataset.viewType === activeViewType
      && (activeViewType === "relationships"
        ? element.dataset.mapView === activeViewId
        : element.dataset.flowView === activeFlowId))
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

  const setMapControlsEnabled = (enabled: boolean): void => {
    domainSelect.disabled = !enabled;
    flowSelect.disabled = !enabled;
    for (const button of viewTypeButtons) button.disabled = !enabled;
    for (const button of cameraButtons) button.disabled = !enabled;
  };

  const showStatus = (eyebrow: string, title: string, message: string): void => {
    statusEyebrow.textContent = eyebrow;
    statusTitle.textContent = title;
    statusMessage.textContent = message;
    viewerStatus.hidden = false;
  };

  const clearProject = (): void => {
    closeNodeDetails();
    activeProject = undefined;
    activeViewId = undefined;
    activeFlowId = undefined;
    activeViewType = "relationships";
    dragState = undefined;
    delete viewport.dataset.dragging;
    cameras.clear();
    projectViewHost.replaceChildren();
    domainSelect.replaceChildren();
    flowSelect.replaceChildren();
    relationshipSelector.hidden = false;
    flowSelector.hidden = true;
    statistics.textContent = "";
    setMapControlsEnabled(false);
  };

  const markProjectAvailability = (projectId: string, unavailable: boolean): void => {
    const reference = model.projects.find(({ id }) => id === projectId);
    const option = Array.from(projectSelect.options).find(({ value }) => value === projectId);
    if (!reference || !option) return;
    option.textContent = unavailable ? `${reference.name} - Unavailable` : reference.name;
  };

  const enterLoading = (projectId: string): void => {
    const reference = model.projects.find(({ id }) => id === projectId);
    activeProjectId = projectId;
    clearProject();
    viewport.setAttribute("aria-busy", "true");
    showStatus(
      "Loading project",
      reference?.name ?? "Business map",
      "Loading and validating the selected project's tracked map.",
    );
  };

  const enterUnavailable = (error: unknown, projectId: string): void => {
    if (projectId !== activeProjectId) return;
    viewport.setAttribute("aria-busy", "false");
    markProjectAvailability(projectId, true);
    const message = error instanceof Error
      ? error.message
      : "This project's business map could not be loaded.";
    showStatus("Unavailable", "This project is unavailable", message);
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

  const activateFlow = (flowId: string): void => {
    const project = currentProject();
    if (!project?.flows.some(({ id }) => id === flowId)) return;
    closeNodeDetails();
    activeViewType = "flows";
    activeFlowId = flowId;
    populateFlowSelector();
    activateView();
  };

  const createFlowLink = (flowId: string): HTMLButtonElement => {
    const flow = currentProject()?.flows.find(({ id }) => id === flowId);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "node-details__flow-link";
    button.textContent = flow?.name ?? flowId;
    button.addEventListener("click", () => activateFlow(flowId));
    return button;
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
    detailsFlowList.replaceChildren(...node.relatedFlowIds.map(createFlowLink));
    detailsFlows.hidden = node.relatedFlowIds.length === 0;
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

  const populateFlowSelector = (): void => {
    const project = currentProject();
    flowSelect.replaceChildren(...(project?.flows ?? []).map((flow) => {
      const option = document.createElement("option");
      option.value = flow.id;
      option.textContent = flow.name;
      return option;
    }));
    if (!project?.flows.some(({ id }) => id === activeFlowId)) {
      activeFlowId = project?.flows[0]?.id;
    }
    flowSelect.value = activeFlowId ?? "";
    flowSelect.disabled = (project?.flows.length ?? 0) < 2;
  };

  const activateView = (): void => {
    for (const view of mapViews()) {
      const active = view.dataset.projectId === activeProjectId
        && view.dataset.viewType === activeViewType
        && (activeViewType === "relationships"
          ? view.dataset.mapView === activeViewId
          : view.dataset.flowView === activeFlowId);
      view.hidden = !active;
    }
    relationshipSelector.hidden = activeViewType !== "relationships";
    flowSelector.hidden = activeViewType !== "flows";
    for (const button of viewTypeButtons) {
      const buttonType = button.dataset.viewType as ViewerViewType;
      button.setAttribute("aria-pressed", String(buttonType === activeViewType));
      button.disabled = buttonType === "flows" && (currentProject()?.flows.length ?? 0) === 0;
    }
    const view = currentView();
    const flow = currentFlow();
    statistics.textContent = activeViewType === "relationships"
      ? view
        ? `${view.nodeCount} concepts / ${view.relationCount} relationships`
        : "No business map"
      : flow
        ? `${flow.stepCount} steps / ${flow.transitionCount} transitions / ${flow.scenario.name}`
        : "No business flows";
    const svg = activeSvg();
    if (svg) applyCamera(svg, ensureCamera(svg));
  };

  const enterReady = (payload: ViewerProjectPayloadModel, projectId: string): void => {
    if (projectId !== activeProjectId || payload.project.id !== projectId) return;
    activeProject = payload.project;
    activeViewId = payload.project.views[0]?.id;
    activeFlowId = payload.project.flows[0]?.id;
    if (payload.markup) projectViewHost.innerHTML = payload.markup;
    viewport.setAttribute("aria-busy", "false");
    viewerStatus.hidden = true;
    markProjectAvailability(projectId, false);
    setMapControlsEnabled(true);
    populateDomains();
    populateFlowSelector();
    activateView();
  };

  const fetchProject = async (
    projectId: string,
    signal: AbortSignal,
  ): Promise<ViewerProjectPayloadModel> => {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
    const envelope = await response.json() as WebProjectEnvelope;
    if (!response.ok || !envelope.ok || !envelope.data) {
      throw new Error(
        envelope.error?.message ?? "This project's business map could not be loaded.",
      );
    }
    if (envelope.data.project.id !== projectId) {
      throw new Error("The selected project returned an invalid response.");
    }
    return envelope.data;
  };

  const loadLatestProject = latestProjectLoader(
    fetchProject,
    enterReady,
    enterUnavailable,
  );

  const activateProject = (): void => {
    const projectId = projectSelect.value;
    if (!projectId) return;
    if (model.mode === "web") {
      enterLoading(projectId);
      void loadLatestProject(projectId);
      return;
    }
    closeNodeDetails();
    activeProjectId = projectId;
    activeViewType = "relationships";
    const payload = model.projectPayloads.find(({ project }) => project.id === projectId);
    if (payload) enterReady(payload, projectId);
    else enterUnavailable(new Error("The exported project could not be loaded."), projectId);
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
  flowSelect.addEventListener("change", () => {
    closeNodeDetails();
    activeFlowId = flowSelect.value;
    activateView();
  });
  for (const button of viewTypeButtons) {
    button.addEventListener("click", () => {
      const requested = button.dataset.viewType as ViewerViewType;
      if (requested === "flows" && (currentProject()?.flows.length ?? 0) === 0) return;
      closeNodeDetails();
      activeViewType = requested;
      activateView();
    });
  }
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
    if (event.button !== 0 || !activeSvg()) return;
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
  if (activeProjectId) activateProject();
  else {
    clearProject();
    projectSelect.disabled = true;
    viewport.setAttribute("aria-busy", "false");
    showStatus(
      "Project catalog",
      "No projects registered",
      "Run semantic-atlas project add [path], then restart semantic-atlas web.",
    );
  }
}
