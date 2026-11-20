import type LanguageDetector from "i18next-browser-languagedetector";
import type { i18n, Resource } from "i18next";
import type dagre from "@dagrejs/dagre";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { normalizeLocale } from "../i18n/locale.js";
import { createLatestProjectLoader } from "./latest-project-loader.js";
import { layoutDiagram, diagramEdgePath } from "./viewer-layout.js";
import { createDiagramLayoutController } from "./viewer-diagram.js";
import type {
  ViewerProjectModel,
  ViewerProjectPayload,
  ViewerProjectReference,
} from "./viewer-page.js";

const require = createRequire(import.meta.url);
const i18nextRoot = dirname(require.resolve("i18next/package.json"));
const detectorRoot = dirname(require.resolve("i18next-browser-languagedetector/package.json"));
const browserDependencies = [
  `/*! i18next (MIT)\n${readFileSync(join(i18nextRoot, "LICENSE"), "utf8")}*/\n${readFileSync(join(i18nextRoot, "dist/umd/i18next.min.js"), "utf8")}`,
  `/*! i18next-browser-languagedetector (MIT)\n${readFileSync(join(detectorRoot, "LICENSE"), "utf8")}*/\n${readFileSync(join(detectorRoot, "i18nextBrowserLanguageDetector.min.js"), "utf8")}`,
  `/*! @dagrejs/dagre (MIT)\n${readFileSync(require.resolve("@dagrejs/dagre/LICENSE"), "utf8")}*/\n${readFileSync(require.resolve("@dagrejs/dagre/dist/dagre.min.js"), "utf8")}`,
];

interface ViewerModel {
  readonly resources: Resource;
  readonly mode: "export" | "web";
  readonly projects: readonly ViewerProjectReference[];
  readonly projectPayloads: readonly ViewerProjectPayload[];
}

interface Camera {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly fitted: boolean;
}

interface NavigationSnapshot {
  readonly flowId: string;
  readonly camera?: Camera;
  readonly selectedId?: string;
}

export function renderViewerBrowserScript(): string {
  return [
    ...browserDependencies,
    normalizeLocale.toString(),
    createLatestProjectLoader.toString(),
    layoutDiagram.toString(),
    diagramEdgePath.toString(),
    createDiagramLayoutController.toString(),
    "globalThis.__atlasRuntime = { createLatestProjectLoader, layoutDiagram, diagramEdgePath, createDiagramLayoutController };",
    `(${viewerBrowserEntry.toString()})(normalizeLocale);`,
  ].join("\n");
}

function viewerBrowserEntry(normalizeLocale: (value: string) => "en" | "zh-CN" | undefined): void {
  const browser = globalThis as typeof globalThis & {
    readonly i18next: i18n;
    readonly i18nextBrowserLanguageDetector: typeof LanguageDetector;
    readonly dagre: typeof dagre;
    readonly __atlasRuntime: {
      readonly createLatestProjectLoader: typeof createLatestProjectLoader;
      readonly layoutDiagram: typeof layoutDiagram;
      readonly diagramEdgePath: typeof diagramEdgePath;
      readonly createDiagramLayoutController: typeof createDiagramLayoutController;
    };
  };
  const modelElement = document.querySelector<HTMLScriptElement>("#viewer-model");
  const projectSelect = document.querySelector<HTMLSelectElement>("#project-select");
  const diagramSelect = document.querySelector<HTMLButtonElement>("#diagram-select");
  const flowDirectory = document.querySelector<HTMLElement>("#flow-directory");
  const childFlowMenu = document.querySelector<HTMLElement>("#child-flow-menu");
  const backButton = document.querySelector<HTMLButtonElement>("#back-button");
  const title = document.querySelector<HTMLElement>("#diagram-title");
  const summary = document.querySelector<HTMLElement>("#diagram-summary");
  const viewport = document.querySelector<HTMLElement>("#map-viewport");
  const host = document.querySelector<HTMLElement>("#project-view-host");
  const status = document.querySelector<HTMLElement>("#viewer-status");
  const statusTitle = document.querySelector<HTMLElement>("#viewer-status-title");
  const statusMessage = document.querySelector<HTMLElement>("#viewer-status-message");
  const details = document.querySelector<HTMLElement>("#node-details");
  const detailsTitle = document.querySelector<HTMLElement>("#node-details-title");
  const detailsNotes = document.querySelector<HTMLElement>("#node-details-notes");
  const detailsClose = document.querySelector<HTMLButtonElement>('[data-action="close-details"]');
  if (
    !modelElement ||
    !projectSelect ||
    !diagramSelect ||
    !flowDirectory ||
    !childFlowMenu ||
    !backButton ||
    !title ||
    !summary ||
    !viewport ||
    !host ||
    !status ||
    !statusTitle ||
    !statusMessage ||
    !details ||
    !detailsTitle ||
    !detailsNotes ||
    !detailsClose
  )
    return;

  const model = JSON.parse(modelElement.textContent ?? "{}") as ViewerModel;
  const translator = browser.i18next;
  translator.use(browser.i18nextBrowserLanguageDetector);
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
  const t = (key: string, values: Record<string, unknown> = {}): string =>
    translator.t(key, values);
  document.documentElement.lang = translator.resolvedLanguage ?? "en";
  const translateMarkup = (root: Document | HTMLElement): void => {
    for (const element of Array.from(
      root.querySelectorAll<HTMLElement>("[data-i18n], [data-i18n-aria-label]"),
    )) {
      const textKey = element.getAttribute("data-i18n");
      if (textKey) element.textContent = t(textKey);
      const labelKey = element.getAttribute("data-i18n-aria-label");
      if (labelKey) element.setAttribute("aria-label", t(labelKey));
    }
  };
  translateMarkup(document);

  const runtime = browser.__atlasRuntime;
  const cameras = new Map<string, Camera>();
  const history: NavigationSnapshot[] = [];
  let projectId = model.projects[0]?.id;
  let project: ViewerProjectModel | undefined;
  let flowId: string | undefined;
  let selected: HTMLElement | undefined;
  let directoryPath: string[] = [];
  let childMenuTrigger: HTMLButtonElement | undefined;
  let drag:
    | { pointerId: number; x: number; y: number; moved: boolean; startX: number; startY: number }
    | undefined;
  const cameraKey = (): string => `${projectId ?? ""}:${flowId ?? ""}`;
  const currentFlow = () => project?.flows.find((flow) => flow.id === flowId);
  const allViews = (): HTMLElement[] =>
    Array.from(host.querySelectorAll<HTMLElement>("[data-project-view]"));
  const currentView = (): HTMLElement | undefined =>
    allViews().find(
      (view) => view.dataset.projectId === projectId && view.dataset.flowId === flowId,
    );
  const world = (): HTMLElement | null | undefined =>
    currentView()?.querySelector<HTMLElement>(".diagram-world");
  const applyCamera = (camera: Camera): void => {
    cameras.set(cameraKey(), camera);
    const element = world();
    if (element)
      element.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
  };
  const fit = (): void => {
    const element = world();
    if (!element) return;
    const width = Number(element.dataset.canvasWidth);
    const height = Number(element.dataset.canvasHeight);
    const bounds = viewport.getBoundingClientRect();
    const scale = Math.min(1, (bounds.width - 48) / width, (bounds.height - 56) / height);
    applyCamera({
      x: (bounds.width - width * scale) / 2,
      y: (bounds.height - height * scale) / 2,
      scale,
      fitted: true,
    });
  };
  const layout = runtime.createDiagramLayoutController(
    browser.dagre,
    runtime.layoutDiagram,
    runtime.diagramEdgePath,
    (view) => {
      if (view !== currentView()) return;
      const camera = cameras.get(cameraKey());
      if (!camera || camera.fitted) fit();
      else applyCamera(camera);
    },
  );
  const closeDetails = (restoreFocus = false): void => {
    const previous = selected;
    previous?.classList.remove("flow-card--selected");
    previous?.querySelector(".flow-card__body")?.setAttribute("aria-expanded", "false");
    selected = undefined;
    details.hidden = true;
    if (restoreFocus)
      previous?.querySelector<HTMLElement>(".flow-card__body")?.focus({ preventScroll: true });
  };
  const controls = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".camera-controls button"),
  );
  const setControls = (enabled: boolean): void => {
    diagramSelect.disabled = !enabled;
    backButton.disabled = !enabled || history.length === 0;
    backButton.hidden = backButton.disabled;
    for (const button of controls) button.disabled = !enabled;
  };
  const showStatus = (heading: string, message: string): void => {
    statusTitle.textContent = heading;
    statusMessage.textContent = message;
    status.hidden = false;
  };
  const closeDirectory = (restoreFocus = false): void => {
    flowDirectory.hidden = true;
    diagramSelect.setAttribute("aria-expanded", "false");
    if (restoreFocus) diagramSelect.focus({ preventScroll: true });
  };
  const closeChildMenu = (restoreFocus = false): void => {
    const trigger = childMenuTrigger;
    childMenuTrigger = undefined;
    trigger?.setAttribute("aria-expanded", "false");
    childFlowMenu.hidden = true;
    if (restoreFocus) trigger?.focus({ preventScroll: true });
  };
  const closeMenus = (): void => {
    closeDirectory();
    closeChildMenu();
  };
  const directoryFlow = (id: string) => project?.navigation.flows.find((flow) => flow.id === id);
  const renderDirectory = (preserveThrough = -1): void => {
    const columns: HTMLElement[] = [];
    let ids = project?.navigation.roots ?? [];
    for (let level = 0; ids.length > 0; level += 1) {
      const column = document.createElement("section");
      column.className = "flow-directory__column";
      column.dataset.column = String(level);
      column.setAttribute("role", "group");
      column.setAttribute(
        "aria-label",
        level === 0 ? t("viewer.jumpToDiagram") : directoryFlow(directoryPath[level - 1]!)!.name,
      );
      for (const id of ids) {
        const flow = directoryFlow(id);
        if (!flow) continue;
        const row = document.createElement("div");
        row.className = "flow-directory__row";
        row.dataset.active = String(directoryPath[level] === id);
        const open = document.createElement("button");
        open.type = "button";
        open.className = "flow-directory__open";
        open.dataset.flowId = id;
        open.textContent = flow.name;
        if (id === flowId) open.setAttribute("aria-current", "page");
        open.addEventListener("click", () => {
          closeDirectory();
          navigate(id);
        });
        row.append(open);
        row.addEventListener("pointerenter", (event) => {
          if (event.pointerType !== "mouse" || directoryPath[level] === id) return;
          directoryPath = [...directoryPath.slice(0, level), id];
          renderDirectory(level);
        });
        if (flow.childFlows.length > 0 && !directoryPath.slice(0, level).includes(id)) {
          const expand = document.createElement("button");
          expand.type = "button";
          expand.className = "flow-directory__expand";
          expand.dataset.expandFlow = id;
          expand.textContent = "›";
          expand.setAttribute("aria-label", t("viewer.expandFlow", { name: flow.name }));
          expand.setAttribute("aria-expanded", String(directoryPath[level] === id));
          expand.addEventListener("click", () => expandDirectory(id, level));
          row.append(expand);
        }
        column.append(row);
      }
      columns.push(column);
      const selectedId = directoryPath[level];
      if (!selectedId || directoryPath.slice(0, level).includes(selectedId)) break;
      ids = directoryFlow(selectedId)?.childFlows ?? [];
    }
    if (preserveThrough < 0) {
      flowDirectory.replaceChildren(...columns);
      return;
    }
    // 保留鼠标所在行，不因展开下一列打断悬停、焦点或随后的名称点击。
    const previous = Array.from(flowDirectory.children);
    for (let index = 0; index <= preserveThrough; index += 1) {
      for (const row of Array.from(
        previous[index]?.querySelectorAll<HTMLElement>(".flow-directory__row") ?? [],
      )) {
        const id = row.querySelector<HTMLButtonElement>(".flow-directory__open")?.dataset.flowId;
        const active = directoryPath[index] === id;
        row.dataset.active = String(active);
        row.querySelector(".flow-directory__expand")?.setAttribute("aria-expanded", String(active));
      }
    }
    for (const column of previous.slice(preserveThrough + 1)) column.remove();
    flowDirectory.append(...columns.slice(preserveThrough + 1));
  };
  const focusDirectoryColumn = (level: number, last = false): void => {
    const column = flowDirectory.querySelectorAll<HTMLElement>(".flow-directory__column")[level];
    const buttons = Array.from(
      column?.querySelectorAll<HTMLButtonElement>(".flow-directory__open") ?? [],
    );
    (last ? buttons.at(-1) : buttons[0])?.focus({ preventScroll: true });
    column?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  const expandDirectory = (id: string, level: number): void => {
    directoryPath = [...directoryPath.slice(0, level), id];
    renderDirectory(level);
    focusDirectoryColumn(level + 1);
  };
  const openDirectory = (): void => {
    closeChildMenu();
    directoryPath = [];
    renderDirectory();
    flowDirectory.hidden = false;
    const anchor = diagramSelect.getBoundingClientRect();
    flowDirectory.style.setProperty(
      "--directory-max-width",
      `${Math.max(0, window.innerWidth - anchor.left - 16)}px`,
    );
    diagramSelect.setAttribute("aria-expanded", "true");
    focusDirectoryColumn(0);
  };
  diagramSelect.addEventListener("click", () => {
    if (flowDirectory.hidden) openDirectory();
    else closeDirectory();
  });
  flowDirectory.addEventListener("keydown", (event) => {
    const target =
      event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
    const column = target?.closest<HTMLElement>(".flow-directory__column");
    if (!target || !column) return;
    const level = Number(column.dataset.column);
    const buttons = Array.from(column.querySelectorAll<HTMLButtonElement>(".flow-directory__open"));
    const rowButton = target.classList.contains("flow-directory__open")
      ? target
      : target.parentElement?.querySelector<HTMLButtonElement>(".flow-directory__open");
    const index = buttons.indexOf(rowButton!);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      buttons[
        (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length
      ]?.focus({ preventScroll: true });
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusDirectoryColumn(level, event.key === "End");
    } else if (event.key === "ArrowRight") {
      const expand =
        target.parentElement?.querySelector<HTMLButtonElement>(".flow-directory__expand");
      if (expand?.dataset.expandFlow) {
        event.preventDefault();
        expandDirectory(expand.dataset.expandFlow, level);
      }
    } else if (event.key === "ArrowLeft" && level > 0) {
      event.preventDefault();
      const parentId = directoryPath[level - 1];
      directoryPath = directoryPath.slice(0, level - 1);
      renderDirectory();
      Array.from(flowDirectory.querySelectorAll<HTMLButtonElement>(".flow-directory__open"))
        .find((button) => button.dataset.flowId === parentId)
        ?.focus({ preventScroll: true });
    }
  });
  const openChildFlows = (trigger: HTMLButtonElement): void => {
    const card = trigger.closest<HTMLElement>(".flow-card");
    const node = currentFlow()?.nodes.find((item) => item.id === card?.dataset.nodeId);
    const children =
      node?.childFlows.filter((child) => project?.flows.some((flow) => flow.id === child.id)) ?? [];
    if (children.length === 0) return;
    if (children.length === 1) {
      navigate(children[0]!.id);
      return;
    }
    if (childMenuTrigger === trigger && !childFlowMenu.hidden) {
      closeChildMenu();
      return;
    }
    closeMenus();
    childMenuTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");
    childFlowMenu.replaceChildren(
      ...children.map((child) => {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "menuitem");
        button.textContent = child.name;
        button.addEventListener("click", () => navigate(child.id));
        return button;
      }),
    );
    childFlowMenu.hidden = false;
    const anchor = trigger.getBoundingClientRect();
    const bounds = childFlowMenu.getBoundingClientRect();
    childFlowMenu.style.left = `${Math.max(12, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 12))}px`;
    childFlowMenu.style.top = `${Math.max(12, Math.min(anchor.bottom + 6, window.innerHeight - bounds.height - 12))}px`;
    childFlowMenu.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  };
  childFlowMenu.addEventListener("keydown", (event) => {
    const buttons = Array.from(childFlowMenu.querySelectorAll<HTMLButtonElement>("button"));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      buttons[
        (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length
      ]?.focus({ preventScroll: true });
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      (event.key === "Home" ? buttons[0] : buttons.at(-1))?.focus({ preventScroll: true });
    }
  });
  const openDetails = (card: HTMLElement, focus = false): void => {
    const node = currentFlow()?.nodes.find((item) => item.id === card.dataset.nodeId);
    if (!node) return;
    if (!node.notes?.trim()) return;
    closeDetails();
    selected = card;
    card.classList.add("flow-card--selected");
    card.querySelector(".flow-card__body")?.setAttribute("aria-expanded", "true");
    detailsTitle.textContent = node.name;
    detailsNotes.textContent = node.notes ?? "";
    detailsNotes.hidden = !node.notes?.trim();
    details.hidden = false;
    if (focus) detailsClose.focus({ preventScroll: true });
  };
  const activateFlow = (): void => {
    const flow = currentFlow();
    for (const view of allViews())
      view.hidden = view.dataset.projectId !== projectId || view.dataset.flowId !== flowId;
    title.textContent = flow?.name ?? "";
    summary.textContent = flow?.summary ?? "";
    summary.hidden = !flow?.summary;
    setControls(Boolean(flow));
    const view = currentView();
    if (flow && view) {
      status.hidden = true;
      layout.observe(view, flow.layout);
      const camera = cameras.get(cameraKey());
      if (!camera || camera.fitted) fit();
      else applyCamera(camera);
    } else {
      layout.disconnect();
      showStatus(t("viewer.noFlows"), t("viewer.addFlow"));
    }
  };
  const navigate = (nextId: string): void => {
    if (nextId === flowId || !project?.flows.some((flow) => flow.id === nextId)) return;
    if (flowId) {
      const camera = cameras.get(cameraKey());
      const selectedId = selected?.dataset.nodeId;
      history.push({
        flowId,
        ...(camera ? { camera } : {}),
        ...(selectedId ? { selectedId } : {}),
      });
    }
    closeMenus();
    closeDetails();
    flowId = nextId;
    activateFlow();
    title.focus({ preventScroll: true });
  };
  backButton.addEventListener("click", () => {
    const previous = history.pop();
    if (!previous) return;
    closeMenus();
    closeDetails();
    flowId = previous.flowId;
    if (previous.camera) cameras.set(cameraKey(), previous.camera);
    activateFlow();
    const card = Array.from(currentView()?.querySelectorAll<HTMLElement>(".flow-card") ?? []).find(
      (item) => item.dataset.nodeId === previous.selectedId,
    );
    if (card) openDetails(card);
    title.focus({ preventScroll: true });
  });
  detailsClose.addEventListener("click", () => closeDetails(true));

  const clearProject = (removeMarkup: boolean): void => {
    layout.disconnect();
    closeMenus();
    closeDetails();
    project = undefined;
    flowId = undefined;
    history.length = 0;
    cameras.clear();
    if (removeMarkup) host.replaceChildren();
    title.textContent = "";
    summary.textContent = "";
    summary.hidden = true;
    setControls(false);
  };
  const markAvailability = (id: string, unavailable: boolean): void => {
    const reference = model.projects.find((item) => item.id === id);
    const option = Array.from(projectSelect.options).find((item) => item.value === id);
    if (reference && option)
      option.textContent = unavailable
        ? t("viewer.unavailableProject", { name: reference.name })
        : reference.name;
  };
  const enterReady = (payload: ViewerProjectPayload, id: string): void => {
    if (id !== projectId || payload.project.id !== id) return;
    project = payload.project;
    if (payload.markup) host.innerHTML = payload.markup;
    translateMarkup(host);
    flowId = project.flows[0]?.id;
    viewport.setAttribute("aria-busy", "false");
    markAvailability(id, false);
    activateFlow();
  };
  const enterUnavailable = (error: unknown, id: string): void => {
    if (id !== projectId) return;
    viewport.setAttribute("aria-busy", "false");
    markAvailability(id, true);
    showStatus(
      t("viewer.projectUnavailable"),
      error instanceof Error ? error.message : t("viewer.loadFailed"),
    );
  };
  const fetchProject = async (id: string, signal: AbortSignal): Promise<ViewerProjectPayload> => {
    const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
    const envelope = (await response.json()) as {
      ok: boolean;
      data?: ViewerProjectPayload;
      error?: { messageKey?: string };
    };
    if (!response.ok || !envelope.ok || !envelope.data) {
      const key = envelope.error?.messageKey;
      throw new Error(
        key &&
          [
            "errors.projectMapMissing",
            "errors.projectMapInvalid",
            "errors.projectPathUnavailable",
            "errors.projectMapUnavailable",
            "errors.projectNotFound",
          ].includes(key)
          ? t(key)
          : t("viewer.loadFailed"),
      );
    }
    if (envelope.data.project.id !== id) throw new Error(t("viewer.invalidResponse"));
    return envelope.data;
  };
  const loadLatest = runtime.createLatestProjectLoader(fetchProject, enterReady, enterUnavailable);
  const activateProject = (): void => {
    const id = projectSelect.value;
    if (!id) return;
    projectId = id;
    clearProject(model.mode === "web");
    if (model.mode === "web") {
      viewport.setAttribute("aria-busy", "true");
      showStatus(t("viewer.loadingProject"), t("viewer.readingMap"));
      void loadLatest(id);
    } else {
      const payload = model.projectPayloads.find((item) => item.project.id === id);
      if (payload) enterReady(payload, id);
      else enterUnavailable(new Error(t("viewer.exportedLoadFailed")), id);
    }
  };
  projectSelect.addEventListener("change", activateProject);
  const zoom = (factor: number, pointer?: { x: number; y: number }): void => {
    const camera = cameras.get(cameraKey());
    if (!camera) return;
    const bounds = viewport.getBoundingClientRect();
    const anchor = pointer ?? { x: bounds.width / 2, y: bounds.height / 2 };
    const scale = Math.max(0.2, Math.min(3, camera.scale * factor));
    applyCamera({
      x: anchor.x - ((anchor.x - camera.x) * scale) / camera.scale,
      y: anchor.y - ((anchor.y - camera.y) * scale) / camera.scale,
      scale,
      fitted: false,
    });
  };
  document.querySelector('[data-action="zoom-in"]')?.addEventListener("click", () => zoom(1.2));
  document
    .querySelector('[data-action="zoom-out"]')
    ?.addEventListener("click", () => zoom(1 / 1.2));
  document.querySelector('[data-action="fit"]')?.addEventListener("click", fit);
  viewport.addEventListener(
    "wheel",
    (event) => {
      if (!currentFlow()) return;
      event.preventDefault();
      const bounds = viewport.getBoundingClientRect();
      zoom(Math.exp(-event.deltaY * 0.0015), {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
    },
    { passive: false },
  );
  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !currentFlow()) return;
    if (
      event.target instanceof Element &&
      event.target.closest(".flow-card, .diagram-label, button")
    )
      return;
    event.preventDefault();
    drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener("pointermove", (event) => {
    const camera = cameras.get(cameraKey());
    if (!drag || drag.pointerId !== event.pointerId || !camera) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4)
      return;
    applyCamera({
      ...camera,
      x: camera.x + event.clientX - drag.x,
      y: camera.y + event.clientY - drag.y,
      fitted: false,
    });
    drag = { ...drag, x: event.clientX, y: event.clientY, moved: true };
    viewport.dataset.dragging = "true";
  });
  const finishDrag = (event: PointerEvent): void => {
    if (drag?.pointerId !== event.pointerId) return;
    drag = undefined;
    delete viewport.dataset.dragging;
    if (viewport.hasPointerCapture(event.pointerId))
      viewport.releasePointerCapture(event.pointerId);
  };
  viewport.addEventListener("pointerup", finishDrag);
  viewport.addEventListener("pointercancel", finishDrag);
  viewport.addEventListener("lostpointercapture", finishDrag);
  viewport.addEventListener("click", (event) => {
    const childTrigger =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-action="open-child-flow"]')
        : null;
    if (childTrigger) {
      event.stopPropagation();
      openChildFlows(childTrigger);
      return;
    }
    if (document.getSelection()?.isCollapsed === false) return;
    const card =
      event.target instanceof Element ? event.target.closest<HTMLElement>(".flow-card") : null;
    if (card) openDetails(card);
  });
  viewport.addEventListener("keydown", (event) => {
    const body =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('.flow-card__body[role="button"]')
        : null;
    const card = body?.closest<HTMLElement>(".flow-card");
    if (card && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openDetails(card, true);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape" && !childFlowMenu.hidden) {
      event.preventDefault();
      closeChildMenu(true);
      return;
    }
    if (event.key === "Escape" && !flowDirectory.hidden) {
      event.preventDefault();
      closeDirectory(true);
      return;
    }
    if (event.key === "Escape" && !details.hidden) {
      closeDetails(true);
      return;
    }
    if (event.target instanceof Element && event.target.closest("button, select, input")) return;
    if (event.key === "+" || event.key === "=") zoom(1.2);
    if (event.key === "-") zoom(1 / 1.2);
    if (event.key === "0") fit();
  });
  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!flowDirectory.hidden && !flowDirectory.contains(target) && !diagramSelect.contains(target))
      closeDirectory();
    if (
      !childFlowMenu.hidden &&
      !childFlowMenu.contains(target) &&
      !childMenuTrigger?.contains(target)
    )
      closeChildMenu();
  });
  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!flowDirectory.hidden && !flowDirectory.contains(target) && !diagramSelect.contains(target))
      closeDirectory();
    if (
      !childFlowMenu.hidden &&
      !childFlowMenu.contains(target) &&
      !childMenuTrigger?.contains(target)
    )
      closeChildMenu();
  });
  new ResizeObserver(() => {
    closeChildMenu();
    const camera = cameras.get(cameraKey());
    if (!camera || camera.fitted) fit();
    else applyCamera(camera);
  }).observe(viewport);
  projectSelect.disabled = model.projects.length < 2;
  projectSelect.value = projectId ?? "";
  if (projectId) activateProject();
  else {
    clearProject(false);
    showStatus(t("viewer.noProjects"), t("viewer.registerProject"));
  }
}
