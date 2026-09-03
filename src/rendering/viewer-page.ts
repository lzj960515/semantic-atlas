import { escapeHtml } from "./html.js";
import { renderViewerBrowserScript } from "./viewer-browser.js";
import type { BusinessFlowStepDefinition } from "../contracts/map.js";

export type ViewerMode = "export" | "web";

export interface ViewerProjectReference {
  readonly id: string;
  readonly name: string;
}

export interface ViewerNavigationAnchor {
  readonly kind: string;
  readonly value: string;
  readonly description: string;
}

export interface ViewerNodeDetails {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly summary: string;
  readonly boundary: boolean;
  readonly anchors: readonly ViewerNavigationAnchor[];
  readonly relatedFlowIds: readonly string[];
}

export interface ViewerBusinessFlow {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly scenario: {
    readonly id: string;
    readonly name: string;
  };
  readonly stepCount: number;
  readonly transitionCount: number;
  readonly steps: readonly BusinessFlowStepDefinition[];
  readonly svg: string;
}

export interface ViewerMapView {
  readonly id: string;
  readonly name: string;
  readonly nodeCount: number;
  readonly relationCount: number;
  readonly nodes: readonly ViewerNodeDetails[];
  readonly svg: string;
}

export interface ViewerProject {
  readonly id: string;
  readonly name: string;
  readonly views: readonly ViewerMapView[];
  readonly flows: readonly ViewerBusinessFlow[];
}

export interface ViewerProjectModel extends ViewerProjectReference {
  readonly views: readonly Omit<ViewerMapView, "svg">[];
  readonly flows: readonly Omit<ViewerBusinessFlow, "svg">[];
}

export interface ViewerProjectPayload {
  readonly project: ViewerProjectModel;
  readonly markup: string;
}

export function renderViewerPage(
  projects: readonly ViewerProject[],
): string {
  const displayedProjects = disambiguateProjectNames(projects);
  return renderViewerShell(
    displayedProjects,
    "export",
    displayedProjects.map((project) => ({
      ...toViewerProjectPayload(project),
      markup: "",
    })),
    displayedProjects.map(renderProjectMarkup).join(""),
  );
}

export function renderWebViewerPage(
  projects: readonly ViewerProjectReference[],
): string {
  return renderViewerShell(disambiguateProjectNames(projects), "web", [], "");
}

export function toViewerProjectPayload(project: ViewerProject): ViewerProjectPayload {
  return {
    project: {
      id: project.id,
      name: project.name,
      views: project.views.map(({ svg: _svg, ...view }) => view),
      flows: project.flows.map(({ svg: _svg, ...flow }) => flow),
    },
    markup: renderProjectMarkup(project),
  };
}

function renderViewerShell(
  displayedProjects: readonly ViewerProjectReference[],
  mode: ViewerMode,
  projectPayloads: readonly ViewerProjectPayload[],
  initialMarkup: string,
): string {
  const model = JSON.stringify({
    schemaVersion: 1,
    mode,
    projects: displayedProjects.map(({ id, name }) => ({ id, name })),
    projectPayloads,
  }).replaceAll("<", "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Semantic Atlas business map</title>
  <style>${viewerStyles()}</style>
</head>
<body data-viewer-mode="${mode}">
  <main class="viewer-shell">
    <header class="viewer-toolbar">
      <div class="brand" aria-label="Semantic Atlas">
        <span class="brand__mark">SA</span>
        <span class="brand__name">Semantic Atlas</span>
      </div>
      <div class="viewer-toolbar__selectors">
        <label class="field">
          <span>Project</span>
          <select id="project-select" aria-label="Project">
            ${displayedProjects.map(({ id, name }) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join("")}
          </select>
        </label>
        <div class="view-switch" role="group" aria-label="View type">
          <button type="button" data-view-type="relationships" aria-pressed="true">Relationships</button>
          <button type="button" data-view-type="flows" aria-pressed="false">Flows</button>
        </div>
        <label id="relationship-selector" class="field">
          <span>Business</span>
          <select id="domain-select" aria-label="Business domain"></select>
        </label>
        <label id="flow-selector" class="field" hidden>
          <span>Flow</span>
          <select id="flow-select" aria-label="Business flow"></select>
        </label>
      </div>
      <div class="viewer-toolbar__meta">
        <span id="map-statistics" class="statistics" aria-live="polite"></span>
        <details class="legend">
          <summary>Legend</summary>
          <div class="legend__panel">
            <span class="legend__line legend__line--containment"></span>
            <span>Containment relationships</span>
            <span class="legend__line legend__line--relation"></span>
            <span>Directed business relationships</span>
          </div>
        </details>
        <div class="camera-controls" aria-label="Map controls">
          <button type="button" data-action="zoom-out" aria-label="Zoom out">-</button>
          <button type="button" data-action="fit" aria-label="Fit map to window">Fit</button>
          <button type="button" data-action="zoom-in" aria-label="Zoom in">+</button>
        </div>
      </div>
    </header>
    <section id="map-viewport" class="map-viewport" aria-label="Interactive business map">
      <div id="project-view-host" class="project-view-host">${initialMarkup}</div>
      <section id="viewer-status" class="viewer-status" role="status" aria-live="polite" ${displayedProjects.length > 0 ? "hidden" : ""}>
        <div class="viewer-status__panel">
          <p id="viewer-status-eyebrow" class="viewer-status__eyebrow">Project catalog</p>
          <h1 id="viewer-status-title">${displayedProjects.length > 0 ? "Loading project" : "No projects registered"}</h1>
          <p id="viewer-status-message">${displayedProjects.length > 0
            ? "Reading the selected business map."
            : "Run semantic-atlas project add [path], then restart semantic-atlas web."}</p>
        </div>
      </section>
    </section>
    <aside id="node-details" class="node-details" aria-labelledby="node-details-title" hidden>
      <header class="node-details__header">
        <div>
          <p class="node-details__eyebrow">Concept details</p>
          <p id="node-details-kind" class="node-details__kind"></p>
        </div>
        <button type="button" class="node-details__close" data-action="close-details" aria-label="Close concept details">&#215;</button>
      </header>
      <h2 id="node-details-title" class="node-details__title"></h2>
      <p id="node-details-summary" class="node-details__summary"></p>
      <section id="node-details-flows" class="node-details__related" aria-labelledby="node-details-flows-title" hidden>
        <h3 id="node-details-flows-title">Related business flows</h3>
        <div id="node-details-flow-list" class="node-details__flow-list"></div>
      </section>
      <section id="node-details-anchors" class="node-details__anchors" aria-labelledby="node-details-anchors-title" hidden>
        <h3 id="node-details-anchors-title">Navigation anchors</h3>
        <div id="node-details-anchor-list" class="node-details__anchor-list"></div>
      </section>
    </aside>
  </main>
  <script id="viewer-model" type="application/json">${model}</script>
  <script>${renderViewerBrowserScript()}</script>
</body>
</html>
`;
}

function renderProjectMarkup(project: ViewerProject): string {
  return [
    ...project.views.map((view) => `
      <div class="project-view" data-project-view data-view-type="relationships" data-project-id="${escapeHtml(project.id)}" data-map-view="${escapeHtml(view.id)}" hidden>
        ${view.svg}
      </div>`),
    ...project.flows.map((flow) => `
      <div class="project-view" data-project-view data-view-type="flows" data-project-id="${escapeHtml(project.id)}" data-flow-view="${escapeHtml(flow.id)}" hidden>
        ${flow.svg}
      </div>`),
  ].join("");
}

function disambiguateProjectNames<TProject extends ViewerProjectReference>(
  projects: readonly TProject[],
): readonly TProject[] {
  const nameCounts = new Map<string, number>();
  for (const project of projects) {
    nameCounts.set(project.name, (nameCounts.get(project.name) ?? 0) + 1);
  }

  const occurrences = new Map<string, number>();
  return projects.map((project) => {
    if ((nameCounts.get(project.name) ?? 0) < 2) return project;
    const occurrence = (occurrences.get(project.name) ?? 0) + 1;
    occurrences.set(project.name, occurrence);
    return { ...project, name: `${project.name} (${occurrence})` };
  });
}

function viewerStyles(): string {
  return `
    :root {
      color-scheme: light;
      --paper: #eee9dd;
      --surface: rgba(255, 253, 247, 0.94);
      --surface-strong: #fffdf7;
      --ink: #1d2a2b;
      --muted: #667373;
      --line: #c5c8bd;
      --containment: #385967;
      --relation: #b4532f;
      --accent: #d9a441;
      --toolbar-height: 68px;
    }
    * { box-sizing: border-box; }
    html, body { width: 100%; min-height: 100%; margin: 0; }
    body {
      overflow: hidden;
      color: var(--ink);
      background:
        radial-gradient(circle at 8% 0%, rgba(217, 164, 65, 0.18), transparent 28rem),
        linear-gradient(145deg, #f8f5ed 0%, var(--paper) 62%, #e8ede7 100%);
      font-family: "Avenir Next", Avenir, "Trebuchet MS", sans-serif;
    }
    button, select { font: inherit; }
    .viewer-shell {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      grid-template-columns: minmax(0, 1fr);
      height: 100vh;
      min-height: 420px;
    }
    .viewer-toolbar {
      z-index: 3;
      display: grid;
      grid-template-columns: auto minmax(300px, 1fr) auto;
      align-items: center;
      gap: 22px;
      min-height: var(--toolbar-height);
      padding: 10px 16px;
      border-bottom: 1px solid rgba(56, 89, 103, 0.22);
      background: var(--surface);
      box-shadow: 0 10px 30px rgba(29, 42, 43, 0.08);
      backdrop-filter: blur(16px);
    }
    .brand { display: flex; align-items: center; gap: 10px; white-space: nowrap; }
    .brand__mark {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border: 1px solid var(--ink);
      background: var(--ink);
      color: #fffdf7;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
    }
    .brand__name {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 19px;
      font-weight: 650;
      letter-spacing: -0.01em;
    }
    .viewer-toolbar__selectors, .viewer-toolbar__meta, .camera-controls {
      display: flex;
      align-items: center;
    }
    .viewer-toolbar__selectors { gap: 10px; min-width: 0; }
    .viewer-toolbar__meta { justify-content: flex-end; gap: 12px; white-space: nowrap; }
    .field { display: flex; align-items: center; gap: 7px; min-width: 0; }
    .field[hidden] { display: none; }
    .field > span {
      color: var(--muted);
      font-size: 10px;
      font-weight: 850;
      letter-spacing: 0.10em;
      text-transform: uppercase;
    }
    select {
      min-width: 160px;
      max-width: 260px;
      height: 36px;
      padding: 0 34px 0 11px;
      border: 1px solid rgba(56, 89, 103, 0.28);
      border-radius: 7px;
      color: var(--ink);
      background: var(--surface-strong);
      font-size: 13px;
      font-weight: 650;
    }
    select:disabled { color: var(--muted); opacity: 0.72; }
    .view-switch {
      display: flex;
      overflow: hidden;
      border: 1px solid rgba(56, 89, 103, 0.28);
      border-radius: 7px;
      background: var(--surface-strong);
    }
    .view-switch button {
      height: 34px;
      padding: 0 12px;
      border: 0;
      border-right: 1px solid rgba(56, 89, 103, 0.20);
      color: var(--muted);
      background: transparent;
      font-size: 12px;
      font-weight: 750;
      cursor: pointer;
    }
    .view-switch button:last-child { border-right: 0; }
    .view-switch button[aria-pressed="true"] { color: #fffdf7; background: var(--ink); }
    .view-switch button:disabled { cursor: default; opacity: 0.42; }
    .statistics { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
    .legend { position: relative; }
    .legend summary {
      cursor: pointer;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      list-style: none;
    }
    .legend summary::-webkit-details-marker { display: none; }
    .legend__panel {
      position: absolute;
      top: calc(100% + 16px);
      right: 0;
      display: grid;
      grid-template-columns: 48px max-content;
      align-items: center;
      gap: 12px 10px;
      padding: 16px;
      border: 1px solid rgba(56, 89, 103, 0.24);
      border-radius: 10px;
      background: var(--surface-strong);
      box-shadow: 0 18px 44px rgba(29, 42, 43, 0.16);
      color: var(--muted);
      font-size: 12px;
    }
    .legend__line { display: block; height: 0; border-top: 2px solid; }
    .legend__line--containment { border-color: var(--containment); border-top-style: dashed; }
    .legend__line--relation { position: relative; border-color: var(--relation); }
    .legend__line--relation::after {
      position: absolute;
      top: -5px;
      right: -1px;
      width: 7px;
      height: 7px;
      content: "";
      border-top: 2px solid var(--relation);
      border-right: 2px solid var(--relation);
      transform: rotate(45deg);
    }
    .camera-controls { overflow: hidden; border: 1px solid rgba(56, 89, 103, 0.28); border-radius: 7px; }
    .camera-controls button {
      height: 34px;
      min-width: 34px;
      padding: 0 10px;
      border: 0;
      border-right: 1px solid rgba(56, 89, 103, 0.20);
      color: var(--ink);
      background: var(--surface-strong);
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
    }
    .camera-controls button:last-child { border-right: 0; }
    .camera-controls button:hover { background: #f4ead2; }
    .camera-controls button:focus-visible, .view-switch button:focus-visible, select:focus-visible, summary:focus-visible {
      outline: 3px solid rgba(217, 164, 65, 0.42);
      outline-offset: 2px;
    }
    .map-viewport {
      grid-row: 2;
      grid-column: 1;
      position: relative;
      min-height: 0;
      overflow: hidden;
      cursor: grab;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    .map-viewport[data-dragging="true"] { cursor: grabbing; }
    .project-view-host { position: absolute; inset: 0; }
    .project-view { position: absolute; inset: 0; }
    .project-view[hidden] { display: none; }
    .viewer-status {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 28px;
      cursor: default;
      background:
        radial-gradient(circle at 50% 45%, rgba(255, 253, 247, 0.68), transparent 24rem),
        linear-gradient(135deg, rgba(56, 89, 103, 0.04), rgba(217, 164, 65, 0.06));
    }
    .viewer-status[hidden] { display: none; }
    .viewer-status__panel {
      width: min(520px, 100%);
      padding: 34px;
      border: 1px solid rgba(56, 89, 103, 0.24);
      border-left: 7px solid var(--accent);
      border-radius: 14px;
      background: var(--surface-strong);
      box-shadow: 0 24px 64px rgba(29, 42, 43, 0.14);
    }
    .viewer-status__eyebrow {
      margin: 0 0 10px;
      color: var(--relation);
      font-size: 10px;
      font-weight: 850;
      letter-spacing: 0.13em;
      text-transform: uppercase;
    }
    .viewer-status h1 {
      margin: 0 0 12px;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(28px, 5vw, 44px);
      font-weight: 650;
      line-height: 1.02;
      letter-spacing: -0.03em;
    }
    .viewer-status p:last-child { margin: 0; color: #405052; line-height: 1.65; }
    .map-svg { display: block; width: 100%; height: 100%; }
    .grid-line { stroke: #d9ddd3; stroke-width: 1; }
    .edge__path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .edge--containment .edge__path { stroke: var(--containment); stroke-width: 2.2; stroke-dasharray: 9 7; }
    .edge--directed-relation .edge__path { stroke: var(--relation); stroke-width: 2.4; }
    .edge__label-surface { fill: var(--surface-strong); stroke-width: 1; }
    .edge--containment .edge__label-surface { stroke: var(--containment); }
    .edge--directed-relation .edge__label-surface { stroke: var(--relation); }
    .edge__label { fill: var(--ink); font-size: 11px; font-weight: 800; letter-spacing: 0.04em; }
    .node-card { cursor: pointer; }
    .node-card:focus { outline: none; }
    .node-card__surface {
      fill: var(--surface-strong);
      stroke: var(--line);
      stroke-width: 1.5;
      transition: fill 140ms ease, stroke 140ms ease, stroke-width 140ms ease;
    }
    .node-card:hover .node-card__surface,
    .node-card:focus .node-card__surface,
    .node-card[aria-expanded="true"] .node-card__surface {
      fill: #fffaf0;
      stroke: var(--accent);
      stroke-width: 3;
    }
    .node-card__kind-rule { fill: var(--accent); }
    .node-card--boundary .node-card__surface { fill: #f1f3ed; stroke-dasharray: 6 5; }
    .node-card--boundary .node-card__kind-rule { fill: var(--containment); }
    .node-card__kind { fill: var(--muted); font-size: 10px; font-weight: 850; letter-spacing: 0.12em; }
    .node-card__title { fill: var(--ink); font-family: Georgia, "Times New Roman", serif; font-size: 18px; font-weight: 650; }
    .node-card__summary { fill: #405052; font-size: 13px; }
    .flow-transition__path {
      fill: none;
      stroke: var(--relation);
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .flow-transition__label-surface { fill: var(--surface-strong); stroke: var(--relation); stroke-width: 1; }
    .flow-transition__label { fill: var(--ink); font-size: 11px; font-weight: 850; letter-spacing: 0.05em; }
    .flow-step__surface { fill: var(--surface-strong); stroke: var(--line); stroke-width: 2; }
    .flow-step--action .flow-step__surface { stroke: var(--accent); }
    .flow-step--decision .flow-step__surface { fill: #fff8e8; stroke: var(--relation); stroke-width: 2.5; }
    .flow-step--outcome .flow-step__surface { fill: #eef3ee; stroke: var(--containment); }
    .flow-step__kind { fill: var(--muted); font-size: 10px; font-weight: 850; letter-spacing: 0.12em; }
    .flow-step__title { fill: var(--ink); font-family: Georgia, "Times New Roman", serif; font-size: 18px; font-weight: 650; }
    .flow-step__summary { fill: #405052; font-size: 13px; }
    .node-details {
      z-index: 2;
      grid-row: 2;
      grid-column: 1;
      align-self: stretch;
      justify-self: end;
      width: min(390px, calc(100% - 28px));
      margin: 14px;
      padding: 22px;
      overflow: auto;
      border: 1px solid rgba(56, 89, 103, 0.28);
      border-left: 7px solid var(--accent);
      border-radius: 14px;
      background:
        linear-gradient(135deg, rgba(217, 164, 65, 0.09), transparent 38%),
        var(--surface-strong);
      box-shadow: 0 24px 64px rgba(29, 42, 43, 0.20);
      animation: details-arrive 180ms ease-out;
    }
    .node-details[hidden] { display: none; }
    .node-details__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    .node-details__eyebrow {
      margin: 0 0 7px;
      color: var(--relation);
      font-size: 10px;
      font-weight: 850;
      letter-spacing: 0.13em;
      text-transform: uppercase;
    }
    .node-details__kind {
      margin: 0;
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.10em;
      text-transform: uppercase;
    }
    .node-details__close {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      padding: 0;
      border: 1px solid rgba(56, 89, 103, 0.24);
      border-radius: 50%;
      color: var(--ink);
      background: #fffdf7;
      font-size: 21px;
      line-height: 1;
      cursor: pointer;
    }
    .node-details__close:hover { background: #f4ead2; }
    .node-details__close:focus-visible {
      outline: 3px solid rgba(217, 164, 65, 0.42);
      outline-offset: 2px;
    }
    .node-details__title {
      margin: 18px 0 10px;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 28px;
      font-weight: 650;
      line-height: 1.08;
      letter-spacing: -0.02em;
    }
    .node-details__summary { margin: 0; color: #405052; font-size: 14px; line-height: 1.6; }
    .node-details__anchors, .node-details__related { margin-top: 24px; padding-top: 18px; border-top: 1px solid rgba(56, 89, 103, 0.20); }
    .node-details__anchors[hidden], .node-details__related[hidden] { display: none; }
    .node-details__anchors h3, .node-details__related h3 {
      margin: 0 0 12px;
      color: var(--relation);
      font-size: 11px;
      letter-spacing: 0.10em;
      text-transform: uppercase;
    }
    .node-details__anchor-list { display: grid; gap: 10px; }
    .node-details__flow-list { display: grid; gap: 8px; }
    .node-details__flow-link {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 11px 12px;
      border: 1px solid rgba(180, 83, 47, 0.24);
      border-radius: 9px;
      color: var(--ink);
      background: #fff8e8;
      text-align: left;
      cursor: pointer;
    }
    .node-details__flow-link::after { content: "\\2192"; color: var(--relation); font-size: 18px; }
    .node-details__flow-link:hover { border-color: var(--relation); background: #fff3d7; }
    .node-details__anchor {
      padding: 12px;
      border: 1px solid rgba(56, 89, 103, 0.18);
      border-radius: 9px;
      background: rgba(238, 233, 221, 0.44);
    }
    .node-details__anchor-kind {
      display: block;
      margin-bottom: 6px;
      color: var(--muted);
      font-size: 9px;
      font-weight: 850;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .node-details__anchor code {
      display: block;
      overflow-wrap: anywhere;
      color: var(--ink);
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 11px;
      line-height: 1.45;
    }
    .node-details__anchor p { margin: 7px 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
    @keyframes details-arrive {
      from { opacity: 0; transform: translateX(12px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @media (max-width: 940px) {
      :root { --toolbar-height: auto; }
      .viewer-toolbar { grid-template-columns: auto 1fr; gap: 8px 16px; }
      .viewer-toolbar__selectors { justify-content: flex-end; }
      .viewer-toolbar__meta { grid-column: 1 / -1; justify-content: space-between; }
    }
    @media (max-width: 620px) {
      .viewer-toolbar { display: flex; flex-wrap: wrap; padding: 9px 10px; }
      .brand__name { font-size: 17px; }
      .viewer-toolbar__selectors { order: 3; width: 100%; }
      .viewer-toolbar__meta { margin-left: auto; }
      .statistics, .legend { display: none; }
      .field { flex: 1; }
      .field > span { display: none; }
      select { width: 100%; min-width: 0; max-width: none; }
      .node-details {
        align-self: end;
        justify-self: stretch;
        width: auto;
        max-height: 58%;
        margin: 8px;
        padding: 18px;
        border-left-width: 1px;
        border-top: 6px solid var(--accent);
        animation-name: details-rise;
      }
      .node-details__title { font-size: 24px; }
      @keyframes details-rise {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
      }
    }
  `;
}
