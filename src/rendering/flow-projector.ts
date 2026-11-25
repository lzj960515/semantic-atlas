import ELK from "elkjs/lib/elk.bundled.js";
import stringWidth from "string-width";
import { getTranslator } from "../i18n/index.js";
import type { BusinessFlow, BusinessFlowStepDefinition } from "../contracts/map.js";
import { BusinessGraph } from "../map/business-graph.js";
import { escapeHtml, safeDomToken } from "./html.js";
import { conceptDetailLinks } from "./viewer-navigation.js";
import {
  layoutDiagram,
  diagramEdgePath,
  type DiagramLayout,
  type DiagramLayoutSpec,
} from "./viewer-layout.js";
import type { ViewerBusinessFlow, ViewerNodeDetails } from "./viewer-page.js";

const CARD_WIDTH = 208;
const t = getTranslator("en");

export class FlowProjector {
  private readonly elk = new ELK.default({ algorithms: ["layered"] });

  public constructor(private readonly graph: BusinessGraph) {}

  public async project(projectId: string): Promise<readonly ViewerBusinessFlow[]> {
    const flows = await Promise.all(
      this.graph.flows().map((flow) => this.projectFlow(flow, projectId)),
    );
    return Object.freeze(flows);
  }

  private async projectFlow(flow: BusinessFlow, projectId: string): Promise<ViewerBusinessFlow> {
    const nodes = flow.steps.map((step) => this.nodeDetails(step, flow));
    const spec = createLayoutSpec(flow);
    const layout = await layoutDiagram(this.elk, spec);
    return {
      id: flow.id,
      name: flow.name,
      summary: flow.summary,
      nodes,
      svg: renderConnections(flow, layout, `${projectId}-${flow.id}`),
      textLayer: renderCards(nodes, flow, layout),
      layout: spec,
    };
  }

  private nodeDetails(step: BusinessFlowStepDefinition, flow: BusinessFlow): ViewerNodeDetails {
    const concept = step.concept ? this.graph.requireNode(step.concept) : undefined;
    const notes = step.notes ?? concept?.notes;
    return {
      id: step.id,
      kind: step.kind,
      name: step.name,
      summary: step.summary,
      start: flow.startsAt.includes(step.id),
      ...(notes ? { notes } : {}),
      childFlows: concept ? conceptDetailLinks(this.graph, concept.id, flow.id) : [],
    };
  }
}

function createLayoutSpec(flow: BusinessFlow): DiagramLayoutSpec {
  return {
    direction: "LR",
    nodes: flow.steps.map((step) => ({
      id: step.id,
      kind: step.kind === "action" ? "card" : step.kind,
      width: CARD_WIDTH,
      height: Math.max(
        104,
        30 +
          Math.ceil(stringWidth(step.name) / 24) * 21 +
          8 +
          Math.ceil(stringWidth(step.summary) / 31) * 17,
      ),
    })),
    edges: flow.transitions.map((transition, index) => ({
      id: `transition-${index}`,
      from: transition.from,
      to: transition.to,
      width: transition.when ? Math.max(24, stringWidth(transition.when) * 5.5 + 10) : 0,
      height: transition.when ? 19 : 0,
    })),
  };
}

function renderConnections(flow: BusinessFlow, layout: DiagramLayout, identity: string): string {
  const marker = `flow-arrow-${safeDomToken(identity)}`;
  return `<svg class="flow-svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" aria-hidden="true">
          <defs><marker id="${marker}" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M 1 1 L 6 4 L 1 7" fill="none" stroke="#9dad9c" stroke-width="1.15" /></marker></defs>
          <g data-layout-root transform="translate(${layout.offsetX} ${layout.offsetY})">${layout.edges.map((edge, index) => `<path class="flow-transition__path" data-layout-edge="${escapeHtml(edge.id)}" data-flow-transition="${escapeHtml(`${flow.transitions[index]!.from}--${flow.transitions[index]!.to}`)}" d="${diagramEdgePath(edge.points)}" marker-end="url(#${marker})" />`).join("")}</g>
        </svg>`;
}

function renderCards(
  nodes: readonly ViewerNodeDetails[],
  flow: BusinessFlow,
  layout: DiagramLayout,
): string {
  const cards = nodes.map((node) => {
    const position = layout.nodes.find((item) => item.id === node.id)!;
    const interactive = Boolean(node.notes?.trim());
    const classes = [
      "flow-card",
      `flow-card--${node.kind}`,
      ...(node.start ? ["flow-card--start"] : []),
      ...(node.childFlows.length ? ["flow-card--child"] : []),
      ...(interactive ? ["flow-card--interactive"] : []),
    ].join(" ");
    const stack = node.childFlows.length
      ? `<button class="flow-card__child" type="button" data-action="open-child-flow" aria-label="${escapeHtml(t("viewer.childFlows"))}" data-i18n-aria-label="viewer.childFlows"${node.childFlows.length > 1 ? ' aria-haspopup="menu" aria-expanded="false" aria-controls="child-flow-menu"' : ""}><svg class="flow-card__stack" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><rect x="2" y="2" width="9" height="9" rx="2"/><path d="M 5 13 H 12 Q 14 13 14 11 V 5"/></svg></button>`
      : "";
    const notes = interactive
      ? `<span class="flow-card__notes" role="img" aria-label="${escapeHtml(t("viewer.nodeDetails"))}" data-i18n-aria-label="viewer.nodeDetails"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M 8 7 V 11"/><circle cx="8" cy="5" r=".65" fill="currentColor" stroke="none"/></svg></span>`
      : "";
    return `<article class="${classes}" data-node-id="${escapeHtml(node.id)}" data-layout-node="${escapeHtml(node.id)}" data-flow-step-id="${escapeHtml(node.id)}" style="left:${position.x - position.width / 2 + layout.offsetX}px;top:${position.y - position.height / 2 + layout.offsetY}px;width:${CARD_WIDTH}px">
              <div class="flow-card__body"${interactive ? ' role="button" tabindex="0" aria-controls="node-details" aria-expanded="false"' : ""}>
              <h3><span class="flow-card__symbol" aria-hidden="true"></span><span class="flow-card__title-text">${escapeHtml(node.name)}</span>${notes}</h3>
              <p>${escapeHtml(node.summary)}</p>
              </div>${stack}
            </article>`;
  });
  const labels = layout.edges.flatMap((edge, index) => {
    const text = flow.transitions[index]!.when;
    return text
      ? [
          `<span class="diagram-label" data-layout-edge="${edge.id}" style="left:${edge.x + layout.offsetX}px;top:${edge.y + layout.offsetY}px">${escapeHtml(text)}</span>`,
        ]
      : [];
  });
  return [...cards, ...labels].join("\n");
}
