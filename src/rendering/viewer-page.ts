import { getResources, getTranslator } from "../i18n/index.js";
import { escapeHtml } from "./html.js";
import { renderViewerBrowserScript } from "./viewer-browser.js";
import type { DiagramLayoutSpec } from "./viewer-layout.js";
import type { FlowNavigation } from "../contracts/flow-navigation.js";

const t = getTranslator("en");

export interface ViewerProjectReference {
  readonly id: string;
  readonly name: string;
}

export interface ViewerFlowLink {
  readonly id: string;
  readonly name: string;
}

export interface ViewerNodeDetails {
  readonly id: string;
  readonly kind: "action" | "decision" | "outcome";
  readonly name: string;
  readonly summary: string;
  readonly start: boolean;
  readonly notes?: string;
  readonly childFlows: readonly ViewerFlowLink[];
}

export interface ViewerBusinessFlow {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly nodes: readonly ViewerNodeDetails[];
  readonly svg: string;
  readonly textLayer: string;
  readonly layout: DiagramLayoutSpec;
}

export interface ViewerProject extends ViewerProjectReference {
  readonly navigation: FlowNavigation;
  readonly flows: readonly ViewerBusinessFlow[];
}

export interface ViewerProjectModel extends ViewerProjectReference {
  readonly navigation: FlowNavigation;
  readonly flows: readonly Omit<ViewerBusinessFlow, "svg" | "textLayer">[];
}

export interface ViewerProjectPayload {
  readonly project: ViewerProjectModel;
  readonly markup: string;
}

export function renderViewerPage(projects: readonly ViewerProject[]): string {
  const displayed = disambiguateProjectNames(projects);
  return renderViewerShell(
    displayed,
    "export",
    displayed.map((project) => ({
      ...toViewerProjectPayload(project),
      markup: "",
    })),
    displayed.map(renderProjectMarkup).join(""),
  );
}

export function renderWebViewerPage(projects: readonly ViewerProjectReference[]): string {
  return renderViewerShell(disambiguateProjectNames(projects), "web", [], "");
}

export function toViewerProjectPayload(project: ViewerProject): ViewerProjectPayload {
  return {
    project: {
      id: project.id,
      name: project.name,
      navigation: project.navigation,
      flows: project.flows.map(({ svg: _svg, textLayer: _textLayer, ...flow }) => flow),
    },
    markup: renderProjectMarkup(project),
  };
}

function renderViewerShell(
  projects: readonly ViewerProjectReference[],
  mode: "export" | "web",
  payloads: readonly ViewerProjectPayload[],
  markup: string,
): string {
  const model = JSON.stringify({
    resources: getResources(),
    mode,
    projects: projects.map(({ id, name }) => ({ id, name })),
    projectPayloads: payloads,
  }).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title data-i18n="viewer.title">${escapeHtml(t("viewer.title"))}</title>
  <style>${viewerStyles()}</style>
</head>
<body data-viewer-mode="${mode}">
  <main class="viewer-shell">
    <header class="flow-heading">
      <div class="flow-heading__text">
        <div class="flow-heading__title-row">
          <button id="back-button" type="button" class="back-button" hidden disabled data-i18n="viewer.back">${escapeHtml(t("viewer.back"))}</button>
          <h1 id="diagram-title" tabindex="-1"></h1>
          <div class="diagram-picker">
            <button id="diagram-select" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="flow-directory" disabled data-i18n="viewer.jumpToDiagram">${escapeHtml(t("viewer.jumpToDiagram"))}</button>
            <div id="flow-directory" class="flow-directory" role="dialog" aria-label="${escapeHtml(t("viewer.jumpToDiagram"))}" data-i18n-aria-label="viewer.jumpToDiagram" hidden></div>
          </div>
        </div>
        <p id="diagram-summary" hidden></p>
      </div>
      <label class="project-picker" ${projects.length < 2 ? "hidden" : ""}>
        <span class="visually-hidden" data-i18n="viewer.project">${escapeHtml(t("viewer.project"))}</span>
        <select id="project-select" aria-label="${escapeHtml(t("viewer.project"))}" data-i18n-aria-label="viewer.project">
          ${projects.map(({ id, name }) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join("")}
        </select>
      </label>
    </header>
    <section id="map-viewport" class="map-viewport" aria-label="${escapeHtml(t("viewer.interactiveMap"))}" data-i18n-aria-label="viewer.interactiveMap">
      <div id="project-view-host" class="project-view-host">${markup}</div>
      <div class="camera-controls" aria-label="${escapeHtml(t("viewer.mapControls"))}" data-i18n-aria-label="viewer.mapControls">
        <button type="button" data-action="zoom-out" aria-label="${escapeHtml(t("viewer.zoomOut"))}" data-i18n-aria-label="viewer.zoomOut">−</button>
        <button type="button" data-action="fit" data-i18n="viewer.fit">${escapeHtml(t("viewer.fit"))}</button>
        <button type="button" data-action="zoom-in" aria-label="${escapeHtml(t("viewer.zoomIn"))}" data-i18n-aria-label="viewer.zoomIn">+</button>
      </div>
      <section id="viewer-status" class="viewer-status" role="status" aria-live="polite" ${projects.length > 0 ? "hidden" : ""}>
        <h2 id="viewer-status-title">${escapeHtml(t(projects.length ? "viewer.loadingProject" : "viewer.noProjects"))}</h2>
        <p id="viewer-status-message">${escapeHtml(t(projects.length ? "viewer.readingMap" : "viewer.registerProject"))}</p>
      </section>
    </section>
    <aside id="node-details" class="node-details" aria-labelledby="node-details-title" hidden>
      <header class="node-details__header"><span data-i18n="viewer.nodeDetails">${escapeHtml(t("viewer.nodeDetails"))}</span><button type="button" data-action="close-details" aria-label="${escapeHtml(t("viewer.closeDetails"))}" data-i18n-aria-label="viewer.closeDetails">×</button></header>
      <h2 id="node-details-title"></h2>
      <p id="node-details-notes" hidden></p>
    </aside>
    <div id="child-flow-menu" class="child-flow-menu" role="menu" aria-label="${escapeHtml(t("viewer.childFlows"))}" data-i18n-aria-label="viewer.childFlows" hidden></div>
  </main>
  <script id="viewer-model" type="application/json">${model}</script>
  <script>${renderViewerBrowserScript()}</script>
</body>
</html>`;
}

function renderProjectMarkup(project: ViewerProject): string {
  return project.flows
    .map(
      (flow) => `
      <div class="project-view" data-project-view data-project-id="${escapeHtml(project.id)}" data-flow-id="${escapeHtml(flow.id)}" hidden>
        <div class="diagram-world">${flow.svg}<div class="diagram-text-layer">${flow.textLayer}</div></div>
      </div>`,
    )
    .join("");
}

function disambiguateProjectNames<T extends ViewerProjectReference>(
  projects: readonly T[],
): readonly T[] {
  const counts = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const { name } of projects) counts.set(name, (counts.get(name) ?? 0) + 1);
  return projects.map((project) => {
    if ((counts.get(project.name) ?? 0) < 2) return project;
    const occurrence = (seen.get(project.name) ?? 0) + 1;
    seen.set(project.name, occurrence);
    return { ...project, name: `${project.name} (${occurrence})` };
  });
}

function viewerStyles(): string {
  return `
    :root { color-scheme: light; --ink: #243c34; --muted: #7b887c; --line: #dfe6dc; --green: #376d4c; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; }
    body { overflow: hidden; color: var(--ink); background: #fcfdf9; font-family: "Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif; -webkit-font-smoothing: antialiased; }
    button, select { font: inherit; }
    button { cursor: pointer; }
    button:disabled { opacity: .35; cursor: default; }
    button:focus-visible, select:focus-visible, .flow-card__body:focus-visible { outline: 3px solid #a4bca3; outline-offset: 4px; }
    [hidden] { display: none !important; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    .viewer-shell { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); width: 100%; height: 100dvh; }
    .project-picker { margin-left: auto; min-width: 0; color: #7a8979; font-size: 12px; }
    .diagram-picker { position: relative; flex-shrink: 0; }
    #diagram-select { height: 33px; padding: 0 12px; border: 1px solid var(--line); border-radius: 7px; color: #5c705b; background: white; font-size: 12px; }
    #diagram-select:hover:enabled, #diagram-select[aria-expanded="true"] { border-color: #b8cbb4; background: #f7faf3; }
    .flow-directory { position: absolute; z-index: 8; top: calc(100% + 10px); left: 0; display: flex; max-width: var(--directory-max-width, calc(100vw - 32px)); overflow-x: auto; padding: 5px; border: 1px solid #dce5d7; border-radius: 9px; background: white; box-shadow: 0 8px 32px #243c3414; }
    .flow-directory__column { flex: 0 0 204px; min-height: 120px; max-height: min(420px, calc(100dvh - 150px)); padding: 3px; overflow-y: auto; }
    .flow-directory__column + .flow-directory__column { border-left: 1px solid #edf1e8; padding-left: 8px; }
    .flow-directory__row { display: flex; align-items: stretch; margin: 2px 0; border-radius: 5px; }
    .flow-directory__row[data-active="true"] { background: #edf4e7; }
    .flow-directory__row:hover { background: #f3f7ee; }
    .flow-directory__open, .flow-directory__expand { border: 0; color: #617459; background: transparent; font-size: 12px; }
    .flow-directory__open { flex: 1; min-width: 0; padding: 9px 10px; line-height: 1.55; text-align: left; overflow-wrap: anywhere; }
    .flow-directory__open[aria-current="page"] { color: #315a39; font-weight: 600; }
    .flow-directory__expand { flex-shrink: 0; align-self: stretch; width: 27px; padding: 0; font-size: 16px; }
    .flow-directory__expand:hover { color: #28573a; background: #e7f0df; border-radius: 5px; }
    .child-flow-menu { position: fixed; z-index: 10; min-width: 190px; max-width: min(280px, calc(100vw - 24px)); padding: 5px; border: 1px solid #dce5d7; border-radius: 8px; background: white; box-shadow: 0 8px 26px #243c3418; }
    .child-flow-menu button { display: block; width: 100%; padding: 9px 11px; border: 0; border-radius: 5px; color: #58734f; background: white; font-size: 12px; line-height: 1.5; text-align: left; }
    .child-flow-menu button:hover, .child-flow-menu button:focus-visible { background: #edf4e6; }
    select { height: 33px; max-width: 270px; padding: 0 30px 0 11px; border: 1px solid var(--line); border-radius: 7px; color: #5c705b; background: white; font-size: 12px; }
    select:disabled { opacity: .5; }
    .flow-heading { z-index: 2; display: flex; align-items: flex-start; gap: 27px; padding: 26px 32px 20px; border-bottom: 1px solid #edf0e8; background: white; }
    .back-button { flex-shrink: 0; padding: 4px 0; border: 0; border-radius: 3px; color: #7b8b72; background: transparent; font-size: 11px; white-space: nowrap; }
    .back-button:hover:enabled { color: #345a3b; }
    .flow-heading__title-row { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
    .flow-heading__text { min-width: 0; }
    .flow-heading h1 { overflow-wrap: anywhere; margin: 0; color: #283f31; font-size: 25px; font-weight: 620; line-height: 1.4; letter-spacing: -.7px; }
    .flow-heading h1:focus { outline: none; }
    .flow-heading p { margin: 9px 0 0; color: #82907b; font-size: 12px; line-height: 1.6; }
    .map-viewport { grid-row: 2; grid-column: 1; position: relative; overflow: hidden; min-height: 0; touch-action: none; background: #fcfdf9; background-image: radial-gradient(#e1e8dc .65px, transparent .65px); background-size: 20px 20px; }
    .project-view-host, .project-view { position: absolute; inset: 0; overflow: hidden; }
    .diagram-world { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
    .flow-svg { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
    .flow-transition__path { fill: none; stroke: #9dad9c; stroke-width: 1.35; stroke-linejoin: round; stroke-linecap: round; }
    .diagram-text-layer { position: absolute; inset: 0; pointer-events: none; }
    .flow-card { --card-accent: #a1b09f; position: absolute; width: 208px; min-height: 104px; padding: 0; border: 1px solid #d2ddcf; border-radius: 10px; color: var(--ink); background: white; box-shadow: 0 2px 3px #1b302507; pointer-events: auto; cursor: default; }
    .flow-card__body { min-height: 102px; padding: 16px 15px 14px; border-radius: inherit; }
    .flow-card--child .flow-card__body h3 { padding-right: 24px; }
    .flow-card::before { content: ""; position: absolute; top: -1px; left: 9px; right: 9px; height: 2px; border-radius: 2px; background: var(--card-accent); }
    .flow-card--interactive { cursor: pointer; transition: border-color 120ms ease, box-shadow 120ms ease; }
    .flow-card--interactive:hover { border-color: #88ac86; box-shadow: 0 4px 15px #214e2910; }
    .flow-card--selected { border-color: #65916b; box-shadow: 0 0 0 3px #6c9b6c14; }
    .flow-card--start { --card-accent: #83a48a; }
    .flow-card--decision { --card-accent: #c1a062; border-color: #dfd0aa; background: #fffaed; }
    .flow-card--outcome { --card-accent: #86ab8c; border-color: #c0d7c3; background: #edf7ee; }
    .flow-card--child { --card-accent: #6e9676; border-color: #b4cbb5; box-shadow: 0 3px 0 -1px white, 0 3px 0 0 #c3d2be, 0 6px 0 -1px white, 0 6px 0 0 #dce5d5, 0 9px 13px #1b302505; }
    .flow-card--child:hover, .flow-card--child.flow-card--selected { border-color: #759e79; box-shadow: 0 3px 0 -1px white, 0 3px 0 0 #9dbb9e, 0 6px 0 -1px white, 0 6px 0 0 #c5d5bc, 0 10px 18px #214e2911; }
    .flow-card h3 { display: flex; align-items: flex-start; gap: 7px; margin: 0; font-size: 14px; font-weight: 600; line-height: 21px; }
    .flow-card__title-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .flow-card__symbol { flex-shrink: 0; width: 6px; height: 6px; margin-top: 7px; border-radius: 50%; background: #8baf87; }
    .flow-card--start .flow-card__symbol { width: 8px; height: 8px; margin-top: 6px; border: 2px solid #77a17a; background: white; }
    .flow-card--decision .flow-card__symbol { border-radius: 1px; background: #bd9852; transform: rotate(45deg); }
    .flow-card--outcome .flow-card__symbol { background: #76a27d; }
    .flow-card__child { position: absolute; top: 9px; right: 8px; display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 5px; color: #7d9a75; background: transparent; }
    .flow-card__child:hover, .flow-card__child[aria-expanded="true"] { color: #487146; background: #edf4e7; }
    .flow-card__stack { width: 13px; height: 13px; }
    .flow-card p { margin: 8px 0 0; color: #82907c; font-size: 11px; line-height: 17px; overflow-wrap: anywhere; }
    .flow-card h3, .flow-card p { user-select: text; -webkit-user-select: text; }
    .diagram-label { position: absolute; width: max-content; max-width: 180px; padding: 2px 5px; transform: translate(-50%, -50%); border-radius: 4px; color: #76896e; background: #fcfdf9; font-size: 10px; line-height: 15px; text-align: center; pointer-events: auto; user-select: text; -webkit-user-select: text; }
    .map-viewport[data-dragging="true"], .map-viewport[data-dragging="true"] * { cursor: grabbing; }
    .camera-controls { position: absolute; bottom: 20px; left: 24px; z-index: 2; display: flex; overflow: hidden; border: 1px solid #dfe6da; border-radius: 7px; background: white; box-shadow: 0 3px 12px #15301b07; }
    .camera-controls button { height: 32px; min-width: 34px; padding: 0 11px; border: 0; border-right: 1px solid #edf0e8; color: #6d8167; background: white; font-size: 11px; }
    .camera-controls button:last-child { border: 0; }
    .camera-controls button:hover:enabled { background: #f3f7ed; }
    .viewer-status { position: absolute; inset: 0; z-index: 3; display: grid; align-content: center; justify-items: center; padding: 30px; background: #fcfdf9; text-align: center; }
    .viewer-status h2 { margin: 0 0 11px; font-size: 19px; font-weight: 600; }
    .viewer-status p { max-width: 460px; margin: 0; color: #89937f; font-size: 12px; line-height: 1.9; }
    .node-details { grid-row: 2; grid-column: 1; z-index: 4; justify-self: end; width: 318px; overflow: auto; padding: 27px 24px; border-left: 1px solid #e0e7db; background: white; box-shadow: -6px 0 20px #2b4b3003; }
    .node-details__header { display: flex; align-items: center; justify-content: space-between; gap: 16px; color: #8a9582; font-size: 10px; letter-spacing: .5px; }
    .node-details__header button { width: 25px; height: 25px; padding: 0; border: 0; border-radius: 5px; color: #92a087; background: transparent; font-size: 19px; }
    .node-details__header button:hover { background: #f2f6ec; }
    .node-details h2 { margin: 25px 0 17px; font-size: 20px; font-weight: 600; line-height: 1.5; letter-spacing: -.5px; }
    #node-details-notes { margin: 0; color: #75836e; font-size: 12px; line-height: 1.95; white-space: pre-wrap; overflow-wrap: anywhere; }
    @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
    @media (max-width: 680px) { select { max-width: 155px; font-size: 11px; } .flow-heading { gap: 16px; padding: 24px 16px; } .flow-heading h1 { font-size: 21px; } .flow-heading p { font-size: 11px; } .back-button { font-size: 10px; } .flow-heading__title-row { gap: 16px; } .node-details { align-self: end; width: 100%; max-height: 70%; border-top: 1px solid var(--line); border-left: 0; } .camera-controls { left: 16px; bottom: 16px; } }
  `;
}
