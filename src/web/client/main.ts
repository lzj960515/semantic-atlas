import "./styles.css";
import { loadCachedValue } from "./map-cache.js";
import { BUSINESS_MAP_WORLD, layoutBusinessMap, type BusinessMapLayoutNode } from "./map-layout.js";
import {
  fitMapCamera,
  isMapConnectionVisible,
  isMapNodeVisible,
  panMapCamera,
  semanticRevealScale,
  zoomMapCameraAt,
  type MapCamera,
} from "./map-camera.js";

type Freshness = "current" | "stale" | "missing";
type PublicationStatus = "missing" | "building" | "current" | "failed";

interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly root: string;
  readonly branch: "main" | "master";
  readonly headCommit: string;
  readonly snapshotId: string | null;
  readonly freshness: Freshness;
  readonly status: PublicationStatus;
}

interface BusinessNode {
  readonly domain: "business";
  readonly key: string;
  readonly kind: string;
  readonly label: string;
  readonly summary: string;
  readonly aliases: readonly string[];
  readonly certainty: "exact" | "inferred" | "hypothesis";
  readonly validity: "valid" | "stale";
  readonly evidence: readonly Evidence[];
}

interface Evidence {
  readonly symbolId: string;
  readonly file: string;
  readonly range: {
    readonly start: { readonly line: number; readonly column: number };
    readonly end: { readonly line: number; readonly column: number };
  };
}

interface MapRegion {
  readonly node: BusinessNode;
  readonly role: "root" | "child" | "context";
  readonly childCount: number;
  readonly expandable: boolean;
}

interface MapConnection {
  readonly from: { readonly key: string };
  readonly to: { readonly key: string };
  readonly relations: readonly {
    readonly type: string;
    readonly directCount: number;
    readonly aggregatedCount: number;
  }[];
}

interface BusinessMap {
  readonly focus: BusinessNode | null;
  readonly breadcrumbs: readonly BusinessNode[];
  readonly regions: readonly MapRegion[];
  readonly connections: readonly MapConnection[];
}

interface SearchResult {
  readonly score: number;
  readonly node: BusinessNode;
}

interface BusinessSearch {
  readonly query: string;
  readonly limit: number;
  readonly results: readonly SearchResult[];
}

interface GraphNeighbor {
  readonly direction: "incoming" | "outgoing";
  readonly relation: { readonly type: string; readonly certainty: string; readonly validity: string };
  readonly node: { readonly label: string; readonly kind: string };
}

interface BusinessNodeView {
  readonly node: BusinessNode;
  readonly relations: readonly GraphNeighbor[];
}

interface ApiEnvelope<Data> {
  readonly schemaVersion: 1;
  readonly data: Data;
}

interface ApiErrorEnvelope {
  readonly schemaVersion: 1;
  readonly error: { readonly code: string; readonly message: string };
}

class ApiRequestError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
  }
}

interface MapViewportController {
  fit(): void;
  focus(key: string, scale?: number): void;
  refresh(): void;
}

interface CachedMapNode extends MapRegion {
  readonly parentKey: string | undefined;
}

interface InteractiveMapState {
  readonly projectId: string;
  readonly maps: Map<string, BusinessMap>;
  readonly mapRequests: Map<string, Promise<BusinessMap>>;
  readonly nodes: Map<string, CachedMapNode>;
  readonly connections: Map<string, MapConnection>;
  positions: Map<string, BusinessMapLayoutNode>;
  camera: MapCamera | undefined;
}

const projectList = requireElement<HTMLElement>("project-list");
const breadcrumbs = requireElement<HTMLElement>("breadcrumbs");
const mapSurface = requireElement<HTMLElement>("map-surface");
const detailPanel = requireElement<HTMLElement>("detail-panel");
const searchForm = requireElement<HTMLFormElement>("search-form");
const searchInput = requireElement<HTMLInputElement>("business-search");
const searchResults = requireElement<HTMLElement>("search-results");
const notice = requireElement<HTMLElement>("notice");

let projects: readonly ProjectSummary[] = [];
let activeProject: ProjectSummary | undefined;
let activeMapViewport: MapViewportController | undefined;
let selectedBusinessKey: string | undefined;
let interactiveMap: InteractiveMapState | undefined;
let searchSequence = 0;
let noticeTimer: number | undefined;

void initialize();

async function initialize(): Promise<void> {
  installInteractions();
  try {
    projects = (await api<{ readonly projects: readonly ProjectSummary[] }>("/api/v1/projects"))
      .projects;
    renderProjects();
    const requestedProject = new URLSearchParams(location.search).get("project");
    const initialProject = projects.find(({ id }) => id === requestedProject)
      ?? projects.find(({ freshness }) => freshness === "current")
      ?? projects[0];
    if (initialProject !== undefined) {
      await selectProject(initialProject.id);
    } else {
      renderNoProjects();
    }
  } catch (error) {
    renderFatalError("项目列表暂时无法显示", errorMessage(error));
  }
}

function installInteractions(): void {
  searchForm.addEventListener("submit", (event) => event.preventDefault());
  let debounceTimer: number | undefined;
  searchInput.addEventListener("input", () => {
    window.clearTimeout(debounceTimer);
    const query = searchInput.value.trim();
    if (query.length === 0) {
      hideSearchResults();
      return;
    }
    debounceTimer = window.setTimeout(() => void runSearch(query), 170);
  });
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideSearchResults();
      searchInput.blur();
    }
  });
  document.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement | null;
    if (event.key === "Escape" && document.body.classList.contains("is-immersive-map")) {
      event.preventDefault();
      setImmersiveMap(false);
      return;
    }
    if (event.key === "/" && target?.tagName !== "INPUT" && activeProject !== undefined) {
      event.preventDefault();
      searchInput.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!searchForm.contains(event.target as Node)) hideSearchResults();
  });
  window.addEventListener("resize", () => activeMapViewport?.fit());
}

async function selectProject(projectId: string): Promise<void> {
  const project = projects.find(({ id }) => id === projectId);
  if (project === undefined) return;
  activeProject = project;
  activeMapViewport = undefined;
  selectedBusinessKey = undefined;
  interactiveMap = {
    projectId: project.id,
    maps: new Map(),
    mapRequests: new Map(),
    nodes: new Map(),
    connections: new Map(),
    positions: new Map(),
    camera: undefined,
  };
  searchInput.disabled = false;
  searchInput.value = "";
  hideSearchResults();
  renderProjects();
  renderLoading(mapSurface, "正在加载业务地图");
  renderDetailPlaceholder();
  replaceLocationProject(project.id);

  try {
    const map = await readMap();
    renderMap(map);
  } catch (error) {
    renderMapError(error);
  }
}

async function loadMap(focusKey?: string): Promise<void> {
  if (activeProject === undefined) return;
  try {
    const map = await readMap(focusKey);
    renderMap(map);
  } catch (error) {
    renderMapError(error);
  }
}

async function readMap(focusKey?: string): Promise<BusinessMap> {
  const project = activeProject;
  const state = interactiveMap;
  if (project === undefined || state === undefined) {
    throw new Error("请先选择一个项目。");
  }
  const cacheKey = focusKey ?? "";
  return loadCachedValue(
    state.maps,
    state.mapRequests,
    cacheKey,
    async () => {
      const query = focusKey === undefined ? "" : `?focus=${encodeURIComponent(focusKey)}`;
      const map = await api<BusinessMap>(`/api/v1/projects/${project.id}/map${query}`);
      mergeMap(state, map);
      return map;
    },
  );
}

function mergeMap(state: InteractiveMapState, map: BusinessMap): void {
  let parentKey: string | undefined;
  for (const node of map.breadcrumbs) {
    cacheMapNode(state, node, parentKey === undefined ? "root" : "child", parentKey, 0, true);
    parentKey = node.key;
  }
  const breadcrumbFocus = map.breadcrumbs.at(-1);
  if (map.focus !== null && breadcrumbFocus?.key !== map.focus.key) {
    cacheMapNode(state, map.focus, "child", parentKey, 0, true);
  }
  for (const region of map.regions) {
    cacheMapNode(
      state,
      region.node,
      region.role,
      map.focus?.key,
      region.childCount,
      region.expandable,
    );
  }
  for (const connection of map.connections) {
    state.connections.set(`${connection.from.key}\0${connection.to.key}`, connection);
  }
  const layout = layoutBusinessMap(
    [...state.nodes.values()].map(({ node, role, parentKey: nodeParentKey }) => ({
      key: node.key,
      role,
      parentKey: nodeParentKey,
    })),
    [...state.positions.values()],
  );
  state.positions = new Map(layout.nodes.map((position) => [position.key, position]));
}

function cacheMapNode(
  state: InteractiveMapState,
  node: BusinessNode,
  role: MapRegion["role"],
  parentKey: string | undefined,
  childCount: number,
  expandable: boolean,
): void {
  const existing = state.nodes.get(node.key);
  const keepHierarchy = existing !== undefined && role === "context";
  state.nodes.set(node.key, {
    node,
    role: keepHierarchy ? existing.role : role,
    parentKey: keepHierarchy ? existing.parentKey : parentKey,
    childCount: Math.max(existing?.childCount ?? 0, childCount),
    expandable: (existing?.expandable ?? false) || expandable,
  });
}

function renderProjects(): void {
  projectList.replaceChildren();
  if (projects.length === 0) {
    const empty = element("p", "rail-empty");
    empty.textContent = "暂无可查看的项目。";
    projectList.append(empty);
    return;
  }
  for (const project of projects) {
    const button = element("button", "project-button");
    button.type = "button";
    button.setAttribute("aria-current", String(project.id === activeProject?.id));
    button.setAttribute("aria-label", `${project.name}，${project.branch} 分支`);
    button.addEventListener("click", () => void selectProject(project.id));
    const name = element("span", "project-name");
    name.textContent = project.name;
    button.append(name);
    projectList.append(button);
  }
}

function renderMap(map: BusinessMap): void {
  if (interactiveMap !== undefined) mergeMap(interactiveMap, map);
  renderBreadcrumbs(map);
  mapSurface.replaceChildren();

  if (map.regions.length === 0 && map.focus === null) {
    const empty = element("div", "empty-state");
    const emptyTitle = element("h3");
    emptyTitle.textContent = map.focus === null
      ? "还没有可展示的业务知识"
      : "这里没有更多业务区域";
    const emptyCopy = element("p");
    emptyCopy.textContent = map.focus === null
      ? "业务知识会在日常研发过程中逐步整理。"
      : "这个区域仍可能包含简介和相关业务。";
    empty.append(emptyTitle, emptyCopy);
    mapSurface.append(empty);
    return;
  }
  if (interactiveMap !== undefined) {
    mapSurface.append(renderSpatialMap(interactiveMap));
  }
}

function renderSpatialMap(state: InteractiveMapState): HTMLElement {
  const viewport = element("section", "map-viewport");
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", "交互式业务地图。拖拽移动，滚轮缩放。");
  const world = element("div", "map-world");
  world.style.width = `${BUSINESS_MAP_WORLD.width}px`;
  world.style.height = `${BUSINESS_MAP_WORLD.height}px`;

  const connectionLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  connectionLayer.classList.add("map-connections");
  connectionLayer.setAttribute("viewBox", `0 0 ${BUSINESS_MAP_WORLD.width} ${BUSINESS_MAP_WORLD.height}`);
  connectionLayer.setAttribute("aria-hidden", "true");
  renderMapEdges(connectionLayer, state);
  world.append(connectionLayer, renderMapHub());
  for (const cached of state.nodes.values()) {
    const position = state.positions.get(cached.node.key);
    if (position !== undefined) world.append(renderMapNode(cached, position));
  }

  viewport.append(world, renderMapControls());
  const shouldFitLoadedMap = state.camera === undefined;
  activeMapViewport = installMapViewport(viewport, world, state);
  requestAnimationFrame(() => {
    if (shouldFitLoadedMap) activeMapViewport?.fit();
    else activeMapViewport?.refresh();
  });
  return viewport;
}

function renderMapHub(): HTMLElement {
  const hub = element("div", "map-hub");
  hub.style.left = `${BUSINESS_MAP_WORLD.width / 2}px`;
  hub.style.top = `${BUSINESS_MAP_WORLD.height / 2}px`;
  const label = element("span", "map-hub-label");
  label.textContent = activeProject?.name ?? "项目";
  hub.append(label);
  return hub;
}

function renderMapNode(cached: CachedMapNode, position: BusinessMapLayoutNode): HTMLElement {
  const node = element("article", "map-node");
  node.dataset.key = cached.node.key;
  node.dataset.depth = String(position.depth);
  node.dataset.role = cached.role;
  node.dataset.kind = cached.node.kind.toLowerCase().replaceAll(" ", "-");
  node.dataset.validity = cached.node.validity;
  node.classList.toggle("is-selected", cached.node.key === selectedBusinessKey);
  node.style.left = `${position.x}px`;
  node.style.top = `${position.y}px`;

  const select = element("button", "map-node-core");
  select.type = "button";
  select.title = cached.expandable ? "进入这个业务区域" : "查看这个业务区域";
  select.setAttribute("aria-label", cached.node.label);
  select.addEventListener("click", () => void selectMapNode(cached.node.key));
  const name = element("span", "map-node-label");
  name.textContent = cached.node.label;
  select.append(name);
  if (cached.childCount > 0) {
    const count = element("span", "map-node-count");
    count.textContent = `${cached.childCount} 项`;
    select.append(count);
  }
  node.append(select);
  return node;
}

function renderMapEdges(layer: SVGSVGElement, state: InteractiveMapState): void {
  const center = { x: BUSINESS_MAP_WORLD.width / 2, y: BUSINESS_MAP_WORLD.height / 2 };
  for (const cached of state.nodes.values()) {
    if (cached.role === "context") continue;
    const to = state.positions.get(cached.node.key);
    if (to === undefined) continue;
    const parent = cached.parentKey === undefined
      ? undefined
      : state.positions.get(cached.parentKey);
    const from = parent ?? center;
    if (from !== undefined) {
      appendMapEdge(layer, from, to, "map-hierarchy-edge", parent?.depth ?? 1, to.depth);
    }
  }
  for (const connection of state.connections.values()) {
    const from = state.positions.get(connection.from.key);
    const to = state.positions.get(connection.to.key);
    if (from === undefined || to === undefined) continue;
    appendMapEdge(
      layer,
      from,
      to,
      "map-business-edge",
      from.depth,
      to.depth,
    );
  }
}

function appendMapEdge(
  layer: SVGSVGElement,
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
  className: string,
  fromDepth: number,
  toDepth: number,
): void {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.classList.add(className);
  path.dataset.fromDepth = String(fromDepth);
  path.dataset.toDepth = String(toDepth);
  const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const normal = { x: -(to.y - from.y) * 0.08, y: (to.x - from.x) * 0.08 };
  path.setAttribute("d", `M ${from.x} ${from.y} Q ${midpoint.x + normal.x} ${midpoint.y + normal.y} ${to.x} ${to.y}`);
  layer.append(path);
}

function renderMapControls(): HTMLElement {
  const controls = element("div", "map-controls");
  const immersive = document.body.classList.contains("is-immersive-map");
  for (const [action, label, title] of [
    ["zoom-out", "−", "缩小"],
    ["fit", "适应", "适应当前地图"],
    ["zoom-in", "+", "放大"],
    ["immersive", immersive ? "退出" : "沉浸", immersive ? "退出沉浸查看" : "进入沉浸查看"],
  ] as const) {
    const button = element("button", "map-control");
    button.type = "button";
    button.dataset.action = action;
    button.textContent = label;
    button.title = title;
    if (action === "immersive") button.setAttribute("aria-pressed", String(immersive));
    controls.append(button);
  }
  return controls;
}

function installMapViewport(
  viewport: HTMLElement,
  world: HTMLElement,
  state: InteractiveMapState,
): MapViewportController {
  let camera = state.camera ?? { scale: 1, x: 0, y: 0 };
  let drag: { readonly pointerId: number; readonly x: number; readonly y: number } | undefined;
  const controls = new Map(
    [...viewport.querySelectorAll<HTMLButtonElement>("[data-action]")]
      .map((button) => [button.dataset.action!, button]),
  );

  const apply = (animated = false): void => {
    world.classList.toggle("is-animating", animated);
    world.style.transform = `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`;
    state.camera = camera;
    viewport.dataset.zoom = camera.scale < 0.75 ? "overview" : camera.scale < 1.4 ? "region" : "detail";
    updateMapVisibility(viewport, state, camera.scale);
  };
  const fit = (): void => {
    camera = fitMapCamera(viewport.getBoundingClientRect(), mapBounds(state));
    apply(true);
  };
  const focus = (key: string, scale = camera.scale): void => {
    const position = state.positions.get(key);
    if (position === undefined) return;
    const rect = viewport.getBoundingClientRect();
    camera = {
      scale,
      x: rect.width / 2 - position.x * scale,
      y: rect.height / 2 - position.y * scale,
    };
    apply(true);
  };
  const zoom = (factor: number, point: { readonly x: number; readonly y: number }): void => {
    camera = zoomMapCameraAt(camera, factor, point);
    apply();
  };

  controls.get("zoom-in")?.addEventListener("click", () => {
    zoom(1.25, viewportCenter(viewport));
  });
  controls.get("zoom-out")?.addEventListener("click", () => {
    zoom(0.8, viewportCenter(viewport));
  });
  controls.get("fit")?.addEventListener("click", fit);
  controls.get("immersive")?.addEventListener("click", () => {
    setImmersiveMap(!document.body.classList.contains("is-immersive-map"));
  });
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const before = camera.scale;
    zoom(Math.exp(-event.deltaY * 0.0015), point);
    if (camera.scale > before) maybeExpandFromZoom(event.target, state, camera, point);
  }, { passive: false });
  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || (event.target as Element).closest("button")) return;
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("is-panning");
  });
  viewport.addEventListener("pointermove", (event) => {
    if (drag?.pointerId !== event.pointerId) return;
    camera = panMapCamera(camera, {
      x: event.clientX - drag.x,
      y: event.clientY - drag.y,
    });
    drag = { ...drag, x: event.clientX, y: event.clientY };
    apply();
  });
  viewport.addEventListener("pointerup", () => {
    drag = undefined;
    viewport.classList.remove("is-panning");
  });
  viewport.addEventListener("keydown", (event) => {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoom(1.25, viewportCenter(viewport));
    }
    if (event.key === "-") {
      event.preventDefault();
      zoom(0.8, viewportCenter(viewport));
    }
    if (event.key === "0") {
      event.preventDefault();
      fit();
    }
  });
  apply();
  return { fit, focus, refresh: () => apply() };
}

function setImmersiveMap(immersive: boolean): void {
  document.body.classList.toggle("is-immersive-map", immersive);
  const control = document.querySelector<HTMLButtonElement>("[data-action=immersive]");
  if (control !== null) {
    control.textContent = immersive ? "退出" : "沉浸";
    control.title = immersive ? "退出沉浸查看" : "进入沉浸查看";
    control.setAttribute("aria-pressed", String(immersive));
  }
  requestAnimationFrame(() => {
    const camera = interactiveMap?.camera;
    if (selectedBusinessKey !== undefined && camera !== undefined) {
      activeMapViewport?.focus(selectedBusinessKey, camera.scale);
    } else {
      activeMapViewport?.fit();
    }
  });
}

function maybeExpandFromZoom(
  target: EventTarget | null,
  state: InteractiveMapState,
  camera: MapCamera,
  pointer: { readonly x: number; readonly y: number },
): void {
  const nodeElement = target instanceof Element ? target.closest<HTMLElement>(".map-node") : null;
  const key = nodeElement?.dataset.key
    ?? nearestExpandableMapNode(state, camera, pointer)
    ?? selectedBusinessKey;
  if (key === undefined || state.maps.has(key) || state.mapRequests.has(key)) return;
  const node = state.nodes.get(key);
  const position = state.positions.get(key);
  if (node?.expandable === true && position !== undefined && camera.scale >= semanticRevealScale(position.depth + 1)) {
    void selectMapNode(key);
  }
}

function nearestExpandableMapNode(
  state: InteractiveMapState,
  camera: MapCamera,
  pointer: { readonly x: number; readonly y: number },
): string | undefined {
  let closest: { readonly key: string; readonly distance: number } | undefined;
  for (const cached of state.nodes.values()) {
    if (!cached.expandable) continue;
    const position = state.positions.get(cached.node.key);
    if (position === undefined) continue;
    const x = position.x * camera.scale + camera.x;
    const y = position.y * camera.scale + camera.y;
    const distance = Math.hypot(pointer.x - x, pointer.y - y);
    if (distance <= 130 && (closest === undefined || distance < closest.distance)) {
      closest = { key: cached.node.key, distance };
    }
  }
  return closest?.key;
}

function updateMapVisibility(viewport: HTMLElement, state: InteractiveMapState, scale: number): void {
  const nodesByKey = new Map(
    [...viewport.querySelectorAll<HTMLElement>(".map-node")]
      .map((element_) => [element_.dataset.key, element_]),
  );
  for (const node of state.nodes.values()) {
    const position = state.positions.get(node.node.key);
    const element_ = nodesByKey.get(node.node.key);
    if (position === undefined || element_ === undefined) continue;
    element_.hidden = !isMapNodeVisible(position.depth, scale);
  }
  viewport.querySelectorAll<SVGElement>("[data-from-depth][data-to-depth]").forEach((element_) => {
    const visible = isMapConnectionVisible(
      Number(element_.dataset.fromDepth),
      Number(element_.dataset.toDepth),
      scale,
    );
    element_.toggleAttribute("hidden", !visible);
    element_.style.display = visible ? "" : "none";
  });
}

function mapBounds(state: InteractiveMapState): { left: number; top: number; right: number; bottom: number } {
  const positions = [...state.positions.values()];
  if (positions.length === 0) {
    const x = BUSINESS_MAP_WORLD.width / 2;
    const y = BUSINESS_MAP_WORLD.height / 2;
    return { left: x - 240, top: y - 160, right: x + 240, bottom: y + 160 };
  }
  return {
    left: Math.min(BUSINESS_MAP_WORLD.width / 2, ...positions.map(({ x }) => x)) - 150,
    top: Math.min(BUSINESS_MAP_WORLD.height / 2, ...positions.map(({ y }) => y)) - 150,
    right: Math.max(BUSINESS_MAP_WORLD.width / 2, ...positions.map(({ x }) => x)) + 150,
    bottom: Math.max(BUSINESS_MAP_WORLD.height / 2, ...positions.map(({ y }) => y)) + 150,
  };
}

function viewportCenter(viewport: HTMLElement): { x: number; y: number } {
  const rect = viewport.getBoundingClientRect();
  return { x: rect.width / 2, y: rect.height / 2 };
}

async function selectMapNode(key: string): Promise<void> {
  const state = interactiveMap;
  if (state === undefined) return;
  selectedBusinessKey = key;
  const cached = state.nodes.get(key);
  const mapPromise = cached?.expandable === true || cached === undefined
    ? readMap(key)
    : Promise.resolve(undefined);
  const nodePromise = loadNode(key);
  const map = await mapPromise;
  if (map !== undefined) renderMap(map);
  await nodePromise;
  const loadedNode = state.nodes.get(key);
  const position = state.positions.get(key);
  const targetScale = position === undefined
    ? state.camera?.scale
    : loadedNode?.expandable === true
      ? semanticRevealScale(position.depth + 1)
      : Math.max(state.camera?.scale ?? 1, semanticRevealScale(position.depth));
  activeMapViewport?.focus(key, targetScale);
}

async function focusMapRoot(): Promise<void> {
  try {
    const map = await readMap();
    renderMap(map);
    activeMapViewport?.fit();
  } catch (error) {
    renderMapError(error);
  }
}

async function loadNode(businessKey: string): Promise<void> {
  if (activeProject === undefined) return;
  selectedBusinessKey = businessKey;
  mapSurface.querySelectorAll<HTMLElement>(".map-node").forEach((node) => {
    node.classList.toggle("is-selected", node.dataset.key === businessKey);
  });
  renderLoading(detailPanel, "正在加载详情");
  try {
    const view = await api<BusinessNodeView>(
      `/api/v1/projects/${activeProject.id}/node?key=${encodeURIComponent(businessKey)}`,
    );
    renderNode(view);
  } catch (error) {
    const state = element("div", "error-state");
    const title = element("h3");
    title.textContent = "详情暂时无法显示";
    const copy = element("p");
    copy.textContent = errorMessage(error);
    state.append(title, copy);
    detailPanel.replaceChildren(state);
  }
}

function renderNode(view: BusinessNodeView): void {
  const node = view.node;
  detailPanel.replaceChildren();
  const heading = element("header", "detail-heading");
  const kind = element("p", "detail-kind");
  kind.textContent = `类型：${localizeBusinessKind(node.kind)}`;
  const title = element("h3");
  title.textContent = node.label;
  const summary = element("p");
  summary.textContent = node.summary;
  heading.append(kind, title, summary);
  detailPanel.append(heading);

  if (view.relations.length === 0) return;
  const relations = detailSection("相关业务");
  view.relations.forEach((neighbor) => {
    const row = element("div", "relation-item");
    const label = element("span");
    label.textContent = neighbor.node.label;
    row.append(label);
    relations.append(row);
  });
  detailPanel.append(relations);
}

function renderBreadcrumbs(map: BusinessMap): void {
  breadcrumbs.replaceChildren();
  const root = element("button", "breadcrumb-button");
  root.type = "button";
  root.textContent = activeProject?.name ?? "业务地图";
  root.addEventListener("click", () => {
    void focusMapRoot();
    renderDetailPlaceholder();
  });
  breadcrumbs.append(root);
  for (const node of map.breadcrumbs) {
    const separator = element("span", "breadcrumb-separator");
    separator.textContent = "/";
    const button = element("button", "breadcrumb-button");
    button.type = "button";
    button.textContent = node.label;
    button.addEventListener("click", () => {
      void selectMapNode(node.key);
    });
    breadcrumbs.append(separator, button);
  }
}

async function runSearch(query: string): Promise<void> {
  if (activeProject === undefined) return;
  const sequence = ++searchSequence;
  searchResults.hidden = false;
  const loading = element("div", "search-message");
  loading.textContent = "正在搜索业务知识…";
  searchResults.replaceChildren(loading);
  try {
    const result = await api<BusinessSearch>(
      `/api/v1/projects/${activeProject.id}/search?q=${encodeURIComponent(query)}&limit=12`,
    );
    if (sequence !== searchSequence || searchInput.value.trim() !== query) return;
    renderSearchResults(result.results);
  } catch (error) {
    if (sequence !== searchSequence) return;
    const message = element("div", "search-message");
    message.textContent = errorMessage(error);
    searchResults.replaceChildren(message);
  }
}

function renderSearchResults(results: readonly SearchResult[]): void {
  searchResults.replaceChildren();
  searchResults.hidden = false;
  if (results.length === 0) {
    const message = element("div", "search-message");
    message.textContent = "没有找到匹配的业务知识。";
    searchResults.append(message);
    return;
  }
  for (const result of results) {
    const button = element("button", "search-result");
    button.type = "button";
    const label = element("strong");
    label.textContent = result.node.label;
    const meta = element("span");
    meta.textContent = `类型：${localizeBusinessKind(result.node.kind)}`;
    button.append(label, meta);
    button.addEventListener("click", () => {
      searchInput.value = "";
      hideSearchResults();
      void selectMapNode(result.node.key);
    });
    searchResults.append(button);
  }
}

function hideSearchResults(): void {
  searchSequence += 1;
  searchResults.hidden = true;
  searchResults.replaceChildren();
}

function renderNoProjects(): void {
  searchInput.disabled = true;
  const state = element("div", "empty-state");
  const title = element("h3");
  title.textContent = "没有可查看的项目";
  const copy = element("p");
  copy.textContent = "请先为主分支项目准备业务知识。";
  state.append(title, copy);
  mapSurface.replaceChildren(state);
}

function renderMapError(error: unknown): void {
  breadcrumbs.replaceChildren();
  const root = element("span", "breadcrumb-button");
  root.textContent = activeProject?.name ?? "业务地图";
  breadcrumbs.append(root);
  const state = element("div", "error-state");
  const title = element("h3");
  title.textContent = error instanceof ApiRequestError && error.code === "ATLAS_STATE_UNAVAILABLE"
    ? "地图尚未准备好"
    : "业务地图暂时无法显示";
  const copy = element("p");
  copy.textContent = errorMessage(error);
  state.append(title, copy);
  mapSurface.replaceChildren(state);
}

function renderFatalError(titleText: string, message: string): void {
  const state = element("div", "error-state");
  const title = element("h3");
  title.textContent = titleText;
  const copy = element("p");
  copy.textContent = message;
  state.append(title, copy);
  mapSurface.replaceChildren(state);
  showNotice(message);
}

function renderDetailPlaceholder(): void {
  const placeholder = element("div", "detail-placeholder");
  const title = element("h3");
  title.textContent = "选择一个业务区域";
  const copy = element("p");
  copy.textContent = "在地图上点击节点查看简介和相关业务。";
  placeholder.append(title, copy);
  detailPanel.replaceChildren(placeholder);
}

function renderLoading(target: HTMLElement, label: string): void {
  const state = element("div", "loading-state");
  state.textContent = label;
  target.replaceChildren(state);
}

function detailSection(titleText: string): HTMLElement {
  const section = element("section", "detail-section");
  const title = element("h4");
  title.textContent = titleText;
  section.append(title);
  return section;
}

async function api<Data>(path: string): Promise<Data> {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  const envelope = await response.json() as ApiEnvelope<Data> | ApiErrorEnvelope;
  if (!response.ok || "error" in envelope) {
    const error = "error" in envelope
      ? envelope.error
      : { code: "INVALID_RESPONSE", message: "The local API returned an invalid response." };
    throw new ApiRequestError(error.code, error.message);
  }
  return envelope.data;
}

function replaceLocationProject(projectId: string): void {
  const url = new URL(location.href);
  url.searchParams.set("project", projectId);
  history.replaceState(null, "", url);
}

function showNotice(message: string): void {
  window.clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.hidden = false;
  noticeTimer = window.setTimeout(() => { notice.hidden = true; }, 4500);
}

function localizeBusinessKind(kind: string): string {
  const labels: Readonly<Record<string, string>> = {
    Capability: "能力",
    Scenario: "场景",
    Operation: "操作",
    Invariant: "规则",
    Interface: "接口",
    Data: "数据",
  };
  return labels[kind] ?? kind;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireElement<ElementType extends HTMLElement>(id: string): ElementType {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`Missing required interface element ${id}`);
  return found as ElementType;
}

function element<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className?: string,
): HTMLElementTagNameMap[Tag] {
  const created = document.createElement(tag);
  if (className !== undefined) created.className = className;
  return created;
}
