import { businessFlowStepKinds, businessRelationKinds } from "../contracts/map.js";
import { getTranslator } from "../i18n/index.js";
import { escapeHtml } from "./html.js";

const t = getTranslator("en");

/** 与实际图形相同的线和形状配上业务例子，区分协作方向与流程顺序。 */
export function renderViewerLegend(): string {
  return `<details class="legend">
    <summary id="legend-title" data-i18n="viewer.legend">${escapeHtml(t("viewer.legend"))}</summary>
    <div class="legend__panel" role="region" aria-labelledby="legend-title" tabindex="0">
      <section class="legend__section">
        <h2 ${binding("relationships")}>${message("relationships")}</h2>
        <p class="legend__intro" ${binding("direction")}>${message("direction")}</p>
        <dl class="legend__entries">
          ${businessRelationKinds.map(renderRelation).join("\n")}
        </dl>
      </section>
      <section class="legend__section">
        <h2 ${binding("nodes")}>${message("nodes")}</h2>
        <dl class="legend__entries">
          ${renderEntry("node", "concept", "conceptDescription")}
          ${renderEntry("boundary", "boundary", "boundaryDescription")}
        </dl>
      </section>
      <section class="legend__section">
        <h2 ${binding("flows")}>${message("flows")}</h2>
        <p class="legend__intro" ${binding("flowDirection")}>${message("flowDirection")}</p>
        <dl class="legend__entries">
          ${businessFlowStepKinds.map(renderFlowStep).join("\n")}
        </dl>
      </section>
    </div>
  </details>`;
}

function renderRelation(kind: typeof businessRelationKinds[number]): string {
  const containment = kind === "part_of";
  const labelKey = `viewer.relationKinds.${containment ? "contains" : kind}`;
  return `<div class="legend__entry" data-legend-relation="${kind}">
    <dt>${sample(containment ? "containment" : "relation")}<span data-i18n="${labelKey}">${escapeHtml(t(labelKey))}</span></dt>
    <dd ${binding(`relations.${kind}`)}>${message(`relations.${kind}`)}</dd>
  </div>`;
}

function renderFlowStep(kind: typeof businessFlowStepKinds[number]): string {
  const labelKey = `viewer.stepKinds.${kind}`;
  return `<div class="legend__entry" data-legend-step="${kind}">
    <dt>${sample(kind)}<span data-i18n="${labelKey}">${escapeHtml(t(labelKey))}</span></dt>
    <dd ${binding(`steps.${kind}`)}>${message(`steps.${kind}`)}</dd>
  </div>`;
}

function renderEntry(shape: string, title: string, description: string): string {
  return `<div class="legend__entry">
    <dt>${sample(shape)}<span ${binding(title)}>${message(title)}</span></dt>
    <dd ${binding(description)}>${message(description)}</dd>
  </div>`;
}

function sample(shape: string): string {
  return `<span class="legend__sample legend__sample--${shape}" aria-hidden="true"></span>`;
}

function binding(key: string): string {
  return `data-i18n="viewer.legendHelp.${key}"`;
}

function message(key: string): string {
  return escapeHtml(t(`viewer.legendHelp.${key}`));
}

export function viewerLegendStyles(): string {
  return `
    .legend { position: relative; }
    .legend summary {
      display: flex;
      align-items: center;
      min-height: 36px;
      padding: 0 8px;
      border: 1px solid transparent;
      border-radius: 7px;
      cursor: pointer;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      list-style: none;
    }
    .legend summary::-webkit-details-marker { display: none; }
    .legend summary::after { content: "+"; margin-left: 8px; font-size: 16px; }
    .legend[open] summary { border-color: var(--line); color: var(--ink); background: var(--surface-strong); }
    .legend[open] summary::after { content: "−"; }
    .legend summary:focus-visible, .legend__panel:focus-visible { outline: 2px solid var(--containment); outline-offset: 3px; }
    .legend__panel {
      position: absolute;
      top: calc(100% + 12px);
      right: 0;
      width: min(520px, calc(100vw - 32px));
      max-height: min(70vh, 680px);
      overflow: auto;
      overscroll-behavior: contain;
      padding: 20px;
      border: 1px solid rgba(56, 89, 103, 0.24);
      border-radius: 10px;
      background: var(--surface-strong);
      box-shadow: 0 18px 44px rgba(29, 42, 43, 0.16);
      color: var(--muted);
      font-size: 12px;
      line-height: 1.55;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .legend__section + .legend__section { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--line); }
    .legend__section h2 { margin: 0; color: var(--ink); font-family: Georgia, "Times New Roman", serif; font-size: 18px; font-weight: 650; }
    .legend__intro { margin: 7px 0 14px; }
    .legend__entries { display: grid; gap: 13px; margin: 14px 0 0; }
    .legend__entry dt { display: flex; align-items: center; gap: 10px; color: var(--ink); font-weight: 800; }
    .legend__entry dd { margin: 4px 0 0 46px; }
    .legend__sample { display: inline-block; flex: 0 0 36px; position: relative; }
    .legend__sample--containment, .legend__sample--relation { height: 0; border-top: 2px solid var(--relation); }
    .legend__sample--containment { border-color: var(--containment); border-top-style: dashed; }
    .legend__sample--relation::after {
      position: absolute; top: -5px; right: 0; width: 7px; height: 7px; content: "";
      border-top: 2px solid var(--relation); border-right: 2px solid var(--relation); transform: rotate(45deg);
    }
    .legend__sample--node, .legend__sample--boundary, .legend__sample--action, .legend__sample--outcome {
      height: 22px; border: 1.5px solid var(--line); border-radius: 4px; background: var(--surface-strong);
    }
    .legend__sample--node { border-left: 5px solid var(--accent); }
    .legend__sample--boundary { border-style: dashed; border-color: var(--containment); border-left: 5px solid var(--containment); background: #f1f3ed; }
    .legend__sample--action { border-color: var(--accent); border-width: 2px; }
    .legend__sample--outcome { border-color: var(--containment); border-radius: 12px; background: #eef3ee; }
    .legend__sample--decision { height: 24px; }
    .legend__sample--decision::after {
      content: ""; position: absolute; left: 7px; top: 2px; width: 22px; height: 20px;
      border: 2px solid var(--relation); background: #fff8e8; transform: rotate(45deg) scale(0.8);
    }
    @media (max-width: 940px) {
      /* 工具栏的 backdrop-filter 建立定位边界，让浮层避开选择器并保持在屏幕内。 */
      .legend__panel { position: fixed; top: calc(100% + 8px); right: 12px; max-height: calc(100dvh - 190px); }
    }
    @media (max-width: 620px) {
      .legend__panel { width: calc(100vw - 20px); right: 10px; padding: 16px; }
    }
  `;
}
