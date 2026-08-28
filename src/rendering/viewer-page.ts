import { escapeHtml } from "./html.js";
import { renderViewerBrowserScript } from "./viewer-browser.js";

export type ViewerMode = "export" | "web";

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
}

export function renderViewerPage(
  projects: readonly ViewerProject[],
  mode: ViewerMode,
): string {
  const displayedProjects = disambiguateProjectNames(projects);
  const model = JSON.stringify({
    projects: displayedProjects.map(({ id, name, views }) => ({
      id,
      name,
      views: views.map(({ id: viewId, name: viewName, nodeCount, relationCount, nodes }) => ({
        id: viewId,
        name: viewName,
        nodeCount,
        relationCount,
        nodes,
      })),
    })),
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
        <label class="field">
          <span>Business</span>
          <select id="domain-select" aria-label="Business domain"></select>
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
      ${displayedProjects.flatMap((project) => project.views.map((view) => `
        <div class="project-view" data-project-view data-project-id="${escapeHtml(project.id)}" data-map-view="${escapeHtml(view.id)}" hidden>
          ${view.svg}
        </div>`)).join("")}
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

function disambiguateProjectNames(
  projects: readonly ViewerProject[],
): readonly ViewerProject[] {
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
    .camera-controls button:focus-visible, select:focus-visible, summary:focus-visible {
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
    .project-view { position: absolute; inset: 0; }
    .project-view[hidden] { display: none; }
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
    .node-details__anchors { margin-top: 24px; padding-top: 18px; border-top: 1px solid rgba(56, 89, 103, 0.20); }
    .node-details__anchors[hidden] { display: none; }
    .node-details__anchors h3 {
      margin: 0 0 12px;
      color: var(--relation);
      font-size: 11px;
      letter-spacing: 0.10em;
      text-transform: uppercase;
    }
    .node-details__anchor-list { display: grid; gap: 10px; }
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
