import type LanguageDetector from "i18next-browser-languagedetector";
import { normalizeLocale } from "../i18n/locale.js";
import type { i18n, Resource } from "i18next";
import { dirname, join } from "node:path";
import {
  clamp,
  fitViewBox,
  MAP_SCALE_LIMITS,
  mapPointFromViewport,
  mapPointToViewport,
  panViewBox,
  viewportScale,
  zoomViewBoxAt,
  type MapPoint,
  type MapViewBox,
  type MapViewport,
} from "./map-camera.js";
import { createLatestProjectLoader } from "./latest-project-loader.js";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { layoutDiagram, type DiagramLayoutSpec } from "./viewer-layout.js";
import { repositionDiagram } from "./manual-layout.js";
import { createDiagramLayoutController } from "./viewer-diagram.js";
import type dagre from "@dagrejs/dagre";
import type * as htmlToImage from "html-to-image";
import { planDiagramImage, renderDiagramImage } from "./diagram-image.js";

const require = createRequire(import.meta.url);
const i18nextRoot = dirname(require.resolve("i18next/package.json"));
const i18nextBrowserScript =
  `/*! i18next (MIT)\n${readFileSync(join(i18nextRoot, "LICENSE"), "utf8")}*/\n` +
  readFileSync(join(i18nextRoot, "dist/umd/i18next.min.js"), "utf8");
const languageDetectorRoot = dirname(
  require.resolve("i18next-browser-languagedetector/package.json"),
);
const languageDetectorBrowserScript =
  `/*! i18next-browser-languagedetector (MIT)\n${readFileSync(join(languageDetectorRoot, "LICENSE"), "utf8")}*/\n` +
  readFileSync(join(languageDetectorRoot, "i18nextBrowserLanguageDetector.min.js"), "utf8");
const dagreLicense = readFileSync(require.resolve("@dagrejs/dagre/LICENSE"), "utf8");
const dagreBrowserScript =
  `/*! @dagrejs/dagre and @dagrejs/graphlib (MIT)\n${dagreLicense}*/\n` +
  readFileSync(require.resolve("@dagrejs/dagre/dist/dagre.min.js"), "utf8");
const imageBrowserScript =
  `/*! html-to-image (MIT)\n${readFileSync(require.resolve("html-to-image/LICENSE"), "utf8")}*/\n` +
  readFileSync(require.resolve("html-to-image/dist/html-to-image.js"), "utf8");

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
  readonly layout: DiagramLayoutSpec;
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
  readonly layout: DiagramLayoutSpec;
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
  readonly resources: Resource;
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
    readonly messageKey?: string;
  };
}

export function renderViewerBrowserScript(): string {
  return [
    i18nextBrowserScript,
    languageDetectorBrowserScript,
    normalizeLocale.toString(),
    dagreBrowserScript,
    imageBrowserScript,
    `const MAP_SCALE_LIMITS = ${JSON.stringify(MAP_SCALE_LIMITS)};`,
    clamp.toString(),
    viewportScale.toString(),
    fitViewBox.toString(),
    zoomViewBoxAt.toString(),
    mapPointFromViewport.toString(),
    mapPointToViewport.toString(),
    panViewBox.toString(),
    createLatestProjectLoader.toString(),
    layoutDiagram.toString(),
    createDiagramLayoutController.toString(),
    repositionDiagram.toString(),
    "const defaultTranslate = globalThis.i18next.t.bind(globalThis.i18next);",
    planDiagramImage.toString(),
    renderDiagramImage.toString(),
    "globalThis.__semanticAtlasDiagramImage = { planDiagramImage, renderDiagramImage };",
    "globalThis.__semanticAtlasCamera = { fitViewBox, zoomViewBoxAt, mapPointFromViewport, mapPointToViewport, viewportScale, panViewBox };",
    "globalThis.__semanticAtlasCreateLatestProjectLoader = createLatestProjectLoader;",
    "globalThis.__semanticAtlasLayoutDiagram = layoutDiagram;",
    "globalThis.__semanticAtlasCreateDiagramLayoutController = createDiagramLayoutController;",
    "globalThis.__semanticAtlasRepositionDiagram = repositionDiagram;",
    `(${viewerBrowserEntry.toString()})(normalizeLocale);`,
  ].join("\n");
}

interface BrowserCameraApi {
  viewportScale(viewBox: MapViewBox, viewport: MapViewport): number;
  mapPointToViewport(point: MapPoint, viewBox: MapViewBox, viewport: MapViewport): MapPoint;
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

function viewerBrowserEntry(normalizeLocale: (value: string) => "en" | "zh-CN" | undefined): void {
  const browserGlobal = globalThis as typeof globalThis & {
    readonly i18next: i18n;
    readonly i18nextBrowserLanguageDetector: typeof LanguageDetector;
    readonly dagre: typeof dagre;
    readonly htmlToImage: typeof htmlToImage;
    readonly __semanticAtlasDiagramImage: {
      planDiagramImage: typeof planDiagramImage;
      renderDiagramImage: typeof renderDiagramImage;
    };
    readonly __semanticAtlasLayoutDiagram: typeof layoutDiagram;
    readonly __semanticAtlasRepositionDiagram: typeof repositionDiagram;
    readonly __semanticAtlasCreateDiagramLayoutController: typeof createDiagramLayoutController;
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
  const detailsDomain = document.querySelector<HTMLElement>("#node-details-domain");
  const detailsDomainLink = document.querySelector<HTMLButtonElement>("#node-details-domain-link");
  const detailsFlows = document.querySelector<HTMLElement>("#node-details-flows");
  const detailsFlowList = document.querySelector<HTMLElement>("#node-details-flow-list");
  const detailsAnchors = document.querySelector<HTMLElement>("#node-details-anchors");
  const detailsAnchorList = document.querySelector<HTMLElement>("#node-details-anchor-list");
  const detailsClose = document.querySelector<HTMLButtonElement>('[data-action="close-details"]');
  const exportButton = document.querySelector<HTMLButtonElement>('[data-action="export-image"]');
  const exportStatus = document.querySelector<HTMLElement>("#export-status");
  if (
    !modelElement ||
    !projectSelect ||
    !domainSelect ||
    !flowSelect ||
    !relationshipSelector ||
    !flowSelector ||
    viewTypeButtons.length !== 2 ||
    cameraButtons.length !== 4 ||
    !statistics ||
    !viewport ||
    !projectViewHost ||
    !viewerStatus ||
    !statusEyebrow ||
    !statusTitle ||
    !statusMessage ||
    !nodeDetails ||
    !detailsKind ||
    !detailsTitle ||
    !detailsSummary ||
    !detailsDomain ||
    !detailsDomainLink ||
    !detailsFlows ||
    !detailsFlowList ||
    !detailsAnchors ||
    !detailsAnchorList ||
    !detailsClose ||
    !exportButton ||
    !exportStatus
  )
    return;

  const model = JSON.parse(modelElement.textContent ?? "{}") as ViewerModel;
  const translator = browserGlobal.i18next;
  translator.use(browserGlobal.i18nextBrowserLanguageDetector);
  void translator.init({
    resources: model.resources,
    initAsync: false,
    supportedLngs: ["en", "zh-CN"],
    fallbackLng: "en",
    detection: {
      order: ["navigator"],
      caches: [],
      convertDetectedLanguage: (value: string) => normalizeLocale(value) ?? "und",
    },
    interpolation: { escapeValue: false },
  });
  const t = (key: string, values?: Record<string, unknown>): string =>
    translator.t(key, values ?? {});
  document.documentElement.lang = translator.resolvedLanguage ?? "en";
  const translateMarkup = (root: Document | HTMLElement): void => {
    const elements = root.querySelectorAll<HTMLElement>(
      "[data-i18n], [data-i18n-aria-label], [data-i18n-title]",
    );
    for (const element of Array.from(elements)) {
      const values = JSON.parse(element.getAttribute("data-i18n-options") ?? "{}") as Record<
        string,
        unknown
      >;
      const relationKind = element.getAttribute("data-i18n-relation-kind");
      if (relationKind) values.relation = t(`viewer.relationKinds.${relationKind}`);
      const textKey = element.getAttribute("data-i18n");
      if (textKey) element.textContent = t(textKey, values);
      for (const attribute of ["aria-label", "title"] as const) {
        const key = element.getAttribute(`data-i18n-${attribute}`);
        if (key) element.setAttribute(attribute, t(key, values));
      }
    }
  };
  translateMarkup(document);
  const cameras = new Map<string, MapViewBox>();
  let activeProjectId = model.projects[0]?.id;
  let activeProject: ViewerProjectModel | undefined;
  let activeViewId: string | undefined;
  let activeFlowId: string | undefined;
  let activeViewType: ViewerViewType = "relationships";
  let activeNodeElement: SVGGElement | undefined;
  let dragState: MapDragState | undefined;
  let exporting = false;

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
  const mapViews = (): readonly HTMLElement[] =>
    Array.from(projectViewHost.querySelectorAll<HTMLElement>("[data-project-view]"));
  const activeSvg = (): SVGSVGElement | undefined =>
    mapViews()
      .find(
        (element) =>
          element.dataset.projectId === activeProjectId &&
          element.dataset.viewType === activeViewType &&
          (activeViewType === "relationships"
            ? element.dataset.mapView === activeViewId
            : element.dataset.flowView === activeFlowId),
      )
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
    const textLayer = svg.parentElement?.querySelector<HTMLElement>(".diagram-text-layer");
    if (!textLayer) return;
    const bounds = svg.getBoundingClientRect();
    const viewportSize = { width: bounds.width, height: bounds.height };
    const scale = cameraApi.viewportScale(camera, viewportSize);
    const origin = cameraApi.mapPointToViewport({ x: 0, y: 0 }, camera, viewportSize);
    textLayer.style.transform = `translate(${origin.x}px, ${origin.y}px) scale(${scale})`;
  };
  const ensureCamera = (svg: SVGSVGElement): MapViewBox => {
    const stored = cameras.get(cameraKey());
    if (stored) return stored;
    const fitted = cameraApi.fitViewBox(mapBounds(svg));
    cameras.set(cameraKey(), fitted);
    return fitted;
  };

  const diagramLayout = browserGlobal.__semanticAtlasCreateDiagramLayoutController(
    browserGlobal.dagre,
    browserGlobal.__semanticAtlasLayoutDiagram,
    (svg, previousBounds, originDelta) => {
      const current = cameras.get(cameraKey());
      if (originDelta && current) {
        applyCamera(svg, {
          ...current,
          x: current.x + originDelta.x,
          y: current.y + originDelta.y,
        });
        return;
      }
      const wasFitted =
        !current ||
        (current.x === 0 &&
          current.y === 0 &&
          current.width === previousBounds.width &&
          current.height === previousBounds.height);
      applyCamera(svg, wasFitted ? cameraApi.fitViewBox(mapBounds(svg)) : current);
    },
    browserGlobal.__semanticAtlasRepositionDiagram,
  );

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
    exportButton.disabled = !enabled || exporting;
  };

  const showStatus = (eyebrow: string, title: string, message: string): void => {
    statusEyebrow.textContent = eyebrow;
    statusTitle.textContent = title;
    statusMessage.textContent = message;
    viewerStatus.hidden = false;
  };

  const clearProject = (): void => {
    diagramLayout.disconnect();
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
    option.textContent = unavailable
      ? t("viewer.unavailableProject", { name: reference.name })
      : reference.name;
  };

  const enterLoading = (projectId: string): void => {
    const reference = model.projects.find(({ id }) => id === projectId);
    activeProjectId = projectId;
    clearProject();
    viewport.setAttribute("aria-busy", "true");
    showStatus(
      t("viewer.loadingProject"),
      reference?.name ?? t("viewer.businessMap"),
      t("viewer.loadingMap"),
    );
  };

  const enterUnavailable = (error: unknown, projectId: string): void => {
    if (projectId !== activeProjectId) return;
    viewport.setAttribute("aria-busy", "false");
    markProjectAvailability(projectId, true);
    const message = error instanceof Error ? error.message : t("viewer.loadFailed");
    showStatus(t("viewer.unavailable"), t("viewer.projectUnavailable"), message);
  };

  const createAnchorElement = (anchor: ViewerNavigationAnchorModel): HTMLElement => {
    const element = document.createElement("article");
    element.className = "node-details__anchor";
    const kind = document.createElement("span");
    kind.className = "node-details__anchor-kind";
    kind.textContent = t(`viewer.anchorKinds.${anchor.kind}`);
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

  const openNodeDetails = (nodeElement: SVGGElement, focusDetails = true): void => {
    const nodeId = nodeElement.dataset.nodeId ?? nodeElement.dataset.conceptId;
    const project = currentProject();
    const sourceView =
      activeViewType === "relationships"
        ? currentView()
        : project?.views.find(({ id }) => id === "all");
    const node = sourceView?.nodes.find(({ id }) => id === nodeId);
    if (!node) return;

    activeNodeElement?.setAttribute("aria-expanded", "false");
    activeNodeElement = nodeElement;
    nodeElement.setAttribute("aria-expanded", "true");
    detailsKind.textContent = node.boundary
      ? t("viewer.externalBoundary", { kind: t(`viewer.nodeKinds.${node.kind}`) })
      : t(`viewer.nodeKinds.${node.kind}`);
    detailsTitle.textContent = node.name;
    detailsSummary.textContent = node.summary;
    const owningView = project?.views.find(
      (view) =>
        view.id !== "all" &&
        view.nodes.some((candidate) => candidate.id === node.id && !candidate.boundary),
    );
    const canOpenDomain =
      owningView && (activeViewType === "flows" || owningView.id !== activeViewId);
    detailsDomain.hidden = !canOpenDomain;
    detailsDomainLink.onclick = null;
    if (canOpenDomain) {
      detailsDomainLink.textContent = t("viewer.openBusinessDomain", { name: owningView.name });
      detailsDomainLink.onclick = () => activateConceptDomain(owningView.id, node.id);
    }
    const relatedFlowIds = node.relatedFlowIds.filter(
      (flowId) => activeViewType !== "flows" || flowId !== activeFlowId,
    );
    detailsFlowList.replaceChildren(...relatedFlowIds.map(createFlowLink));
    detailsFlows.hidden = relatedFlowIds.length === 0;
    detailsAnchorList.replaceChildren(...node.anchors.map(createAnchorElement));
    detailsAnchors.hidden = node.anchors.length === 0;
    nodeDetails.hidden = false;
    if (focusDetails) detailsClose.focus({ preventScroll: true });
  };

  const activateConceptDomain = (domainId: string, nodeId: string): void => {
    closeNodeDetails();
    activeViewType = "relationships";
    activeViewId = domainId;
    populateDomains();
    activateView();
    fit();
    const target = Array.from(activeSvg()?.querySelectorAll<SVGGElement>(".node-card") ?? []).find(
      (element) => element.dataset.nodeId === nodeId,
    );
    if (target) openNodeDetails(target);
  };

  const populateDomains = (): void => {
    const project = currentProject();
    domainSelect.replaceChildren(
      ...(project?.views ?? []).map((view) => {
        const option = document.createElement("option");
        option.value = view.id;
        option.textContent = view.id === "all" ? t("viewer.allBusiness") : view.name;
        return option;
      }),
    );
    if (!project?.views.some(({ id }) => id === activeViewId)) {
      activeViewId = project?.views[0]?.id;
    }
    domainSelect.value = activeViewId ?? "";
    domainSelect.disabled = (project?.views.length ?? 0) < 2;
  };

  const populateFlowSelector = (): void => {
    const project = currentProject();
    flowSelect.replaceChildren(
      ...(project?.flows ?? []).map((flow) => {
        const option = document.createElement("option");
        option.value = flow.id;
        option.textContent = flow.name;
        return option;
      }),
    );
    if (!project?.flows.some(({ id }) => id === activeFlowId)) {
      activeFlowId = project?.flows[0]?.id;
    }
    flowSelect.value = activeFlowId ?? "";
    flowSelect.disabled = (project?.flows.length ?? 0) < 2;
  };

  const activateView = (): void => {
    if (!exporting) exportStatus.hidden = true;
    for (const view of mapViews()) {
      const active =
        view.dataset.projectId === activeProjectId &&
        view.dataset.viewType === activeViewType &&
        (activeViewType === "relationships"
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
    statistics.textContent =
      activeViewType === "relationships"
        ? view
          ? t("viewer.mapStatistics", { nodes: view.nodeCount, relations: view.relationCount })
          : t("viewer.noMap")
        : flow
          ? t("viewer.flowStatistics", {
              steps: flow.stepCount,
              transitions: flow.transitionCount,
              scenario: flow.scenario.name,
            })
          : t("viewer.noFlows");
    const svg = activeSvg();
    exportButton.disabled = !svg || exporting;
    const definition = activeViewType === "relationships" ? view : flow;
    if (svg && definition) {
      applyCamera(svg, ensureCamera(svg));
      diagramLayout.observe(svg.parentElement!, definition.layout);
    } else {
      diagramLayout.disconnect();
    }
  };

  const enterReady = (payload: ViewerProjectPayloadModel, projectId: string): void => {
    if (projectId !== activeProjectId || payload.project.id !== projectId) return;
    activeProject = payload.project;
    activeViewId = payload.project.views[0]?.id;
    activeFlowId = payload.project.flows[0]?.id;
    if (payload.markup) projectViewHost.innerHTML = payload.markup;
    translateMarkup(projectViewHost);
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
    const envelope = (await response.json()) as WebProjectEnvelope;
    if (!response.ok || !envelope.ok || !envelope.data) {
      throw new Error(
        envelope.error?.messageKey &&
          [
            "errors.projectMapMissing",
            "errors.projectMapInvalid",
            "errors.projectPathUnavailable",
            "errors.projectMapUnavailable",
            "errors.projectNotFound",
          ].includes(envelope.error.messageKey)
          ? t(envelope.error.messageKey)
          : t("viewer.loadFailed"),
      );
    }
    if (envelope.data.project.id !== projectId) {
      throw new Error(t("viewer.invalidResponse"));
    }
    return envelope.data;
  };

  const loadLatestProject = latestProjectLoader(fetchProject, enterReady, enterUnavailable);

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
    else enterUnavailable(new Error(t("viewer.exportedLoadFailed")), projectId);
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

  const resetLayout = (): void => {
    diagramLayout.reset();
    fit();
  };

  const exportImage = async (): Promise<void> => {
    const svg = activeSvg();
    const view = svg?.parentElement;
    if (!view || exporting) return;
    const diagram = activeViewType === "relationships" ? currentView() : currentFlow();
    const filename = `${currentProject()?.name ?? "business-map"}-${diagram?.id ?? "all"}`
      // 文件名清理需要匹配控制字符，避免生成不可用的下载名称。
      // oxlint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "-");
    exporting = true;
    exportButton.disabled = true;
    exportButton.setAttribute("aria-busy", "true");
    exportStatus.hidden = false;
    exportStatus.textContent = t("viewer.preparingPng");
    try {
      const imageApi = browserGlobal.__semanticAtlasDiagramImage;
      const image = await imageApi.renderDiagramImage(
        view,
        browserGlobal.htmlToImage.toBlob,
        imageApi.planDiagramImage,
        t,
      );
      const url = URL.createObjectURL(image.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}.png`;
      link.click();
      // 下载在浏览器中异步开始，保留 URL 到下载接管之后。
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      exportStatus.textContent = t("viewer.pngReady", { width: image.width, height: image.height });
    } catch (error) {
      exportStatus.textContent = error instanceof Error ? error.message : t("viewer.exportFailed");
    } finally {
      exporting = false;
      exportButton.removeAttribute("aria-busy");
      exportButton.disabled = !activeSvg();
    }
  };
  exportButton.addEventListener("click", () => {
    void exportImage();
  });

  new ResizeObserver(() => {
    const svg = activeSvg();
    if (svg) applyCamera(svg, ensureCamera(svg));
  }).observe(viewport);

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

  document
    .querySelector<HTMLElement>('[data-action="zoom-in"]')
    ?.addEventListener("click", () => zoom(1.3));
  document
    .querySelector<HTMLElement>('[data-action="zoom-out"]')
    ?.addEventListener("click", () => zoom(1 / 1.3));
  document.querySelector<HTMLElement>('[data-action="fit"]')?.addEventListener("click", fit);
  document
    .querySelector<HTMLElement>('[data-action="reset-layout"]')
    ?.addEventListener("click", resetLayout);

  viewport.addEventListener(
    "wheel",
    (event) => {
      const svg = activeSvg();
      if (!svg) return;
      event.preventDefault();
      const bounds = svg.getBoundingClientRect();
      const camera = ensureCamera(svg);
      const pointer = cameraApi.mapPointFromViewport(
        {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        },
        camera,
        {
          width: bounds.width,
          height: bounds.height,
        },
      );
      zoom(Math.exp(-event.deltaY * 0.0015), pointer);
    },
    { passive: false },
  );

  const nodeElementFromTarget = (target: EventTarget | null): SVGGElement | undefined =>
    target instanceof Element
      ? (target.closest<SVGGElement>(".node-card, .flow-step") ?? undefined)
      : undefined;

  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !activeSvg()) return;
    // 文字保留原生选区；卡片空白处移动节点，画布空白处平移视图。
    if (
      event.target instanceof Element &&
      event.target.closest("[data-selectable-text], .diagram-label")
    )
      return;
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
    const moved =
      dragState.moved ||
      Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) >= 4;
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
    const mapViewport = { width: viewportBounds.width, height: viewportBounds.height };
    const nodeId = dragState.nodeElement?.dataset.layoutNode;
    if (nodeId) {
      const scale = cameraApi.viewportScale(current, mapViewport);
      diagramLayout.moveNode(nodeId, { x: pointerDelta.x / scale, y: pointerDelta.y / scale });
    } else {
      applyCamera(svg, cameraApi.panViewBox(current, pointerDelta, mapViewport));
    }
  });

  const finishDrag = (event: PointerEvent, openDetails: boolean): void => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const completed = dragState;
    dragState = undefined;
    delete viewport.dataset.dragging;
    if (viewport.hasPointerCapture(event.pointerId))
      viewport.releasePointerCapture(event.pointerId);
    if (openDetails && !completed.moved && completed.nodeElement) {
      openNodeDetails(completed.nodeElement);
    }
  };
  viewport.addEventListener("pointerup", (event) => finishDrag(event, true));
  viewport.addEventListener("pointercancel", (event) => finishDrag(event, false));
  viewport.addEventListener("lostpointercapture", (event) => finishDrag(event, false));
  viewport.addEventListener("click", (event) => {
    if (document.getSelection()?.isCollapsed === false) return;
    const text =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>(".diagram-card-text[data-layout-node]")
        : null;
    if (!text) return;
    const nodeElement = Array.from(
      activeSvg()?.querySelectorAll<SVGGElement>(".node-card, .flow-step") ?? [],
    ).find((node) => node.dataset.layoutNode === text.dataset.layoutNode);
    if (nodeElement) openNodeDetails(nodeElement, false);
  });
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
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLButtonElement
    )
      return;
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
    showStatus(t("viewer.projectCatalog"), t("viewer.noProjects"), t("viewer.registerProject"));
  }
}
