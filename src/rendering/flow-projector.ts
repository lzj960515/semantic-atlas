import { getTranslator } from "../i18n/index.js";
import dagre from "@dagrejs/dagre";
import stringWidth from "string-width";
import type {
  BusinessFlow,
  BusinessFlowStepDefinition,
  BusinessFlowTransitionDefinition,
} from "../contracts/map.js";
import { BusinessGraph } from "../map/business-graph.js";
import { escapeHtml, safeDomToken } from "./html.js";
import type { ViewerBusinessFlow } from "./viewer-page.js";
import { layoutDiagram, type DiagramLayoutSpec } from "./viewer-layout.js";

const t = getTranslator("en");

const ACTION_WIDTH = 320;
const DECISION_WIDTH = 560;
const OUTCOME_WIDTH = 320;
const CARD_PADDING = 20;
const TITLE_LINE_HEIGHT = 22;
const SUMMARY_LINE_HEIGHT = 17;
const graphemeSegmenter = new Intl.Segmenter("und", { granularity: "grapheme" });

interface FlowStepPresentation {
  readonly step: BusinessFlowStepDefinition;
  readonly width: number;
  readonly height: number;
}

interface PositionedFlowStep extends FlowStepPresentation {
  readonly x: number;
  readonly y: number;
}

interface RoutedFlowTransition {
  readonly transition: BusinessFlowTransitionDefinition;
  readonly id: string;
  readonly route: readonly dagre.GraphEdge["points"][number][];
  readonly labelX: number;
  readonly labelY: number;
}

interface FlowLayout {
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly steps: readonly PositionedFlowStep[];
  readonly transitions: readonly RoutedFlowTransition[];
}

export class FlowProjector {
  public constructor(private readonly graph: BusinessGraph) {}

  public project(projectId: string): readonly ViewerBusinessFlow[] {
    return Object.freeze(this.graph.flows().map((flow) => this.projectFlow(flow, projectId)));
  }

  private projectFlow(flow: BusinessFlow, projectId: string): ViewerBusinessFlow {
    const steps = flow.steps.map(presentStep);
    const layoutSpec = createLayoutSpec(steps, flow.transitions);
    const layout = layoutFlow(steps, flow.transitions, layoutSpec);
    const scenario = this.graph.requireNode(flow.scenario);
    return {
      id: flow.id,
      name: flow.name,
      summary: flow.summary,
      scenario: {
        id: scenario.id,
        name: scenario.name,
      },
      stepCount: flow.steps.length,
      transitionCount: flow.transitions.length,
      steps: Object.freeze(flow.steps.map((step) => ({ ...step }))),
      svg: renderFlowSvg(flow, layout, `${projectId}-${flow.id}`),
      textLayer: renderFlowTextLayer(layout),
      layout: layoutSpec,
    };
  }
}

function presentStep(step: BusinessFlowStepDefinition): FlowStepPresentation {
  const titleWidth = 28;
  const summaryWidth = step.kind === "decision" ? 38 : 40;
  const titleLines = wrapText(step.name, titleWidth);
  const summaryLines = wrapText(step.summary, summaryWidth);
  const contentHeight =
    54 +
    titleLines.length * TITLE_LINE_HEIGHT +
    summaryLines.length * SUMMARY_LINE_HEIGHT +
    CARD_PADDING;
  const minimumHeight = 128;
  const textHeight = Math.max(minimumHeight, contentHeight);
  return {
    step,
    width:
      step.kind === "decision"
        ? DECISION_WIDTH
        : step.kind === "outcome"
          ? OUTCOME_WIDTH
          : ACTION_WIDTH,
    // 菱形的中央半宽、半高矩形完整容纳可翻译正文。
    height: step.kind === "decision" ? textHeight * 2 : textHeight,
  };
}

function createLayoutSpec(
  steps: readonly FlowStepPresentation[],
  transitions: readonly BusinessFlowTransitionDefinition[],
): DiagramLayoutSpec {
  return {
    direction: "TB",
    nodes: steps.map((step) => ({
      id: step.step.id,
      kind: step.step.kind === "action" ? "card" : step.step.kind,
      width: step.width,
      height: step.height,
    })),
    edges: transitions.map((transition) => ({
      id: transitionIdentity(transition),
      from: transition.from,
      to: transition.to,
      width: transition.when ? labelWidth(transition.when) : 0,
      height: transition.when ? 24 : 0,
      minlen: 1,
      weight: 3,
    })),
  };
}

function layoutFlow(
  steps: readonly FlowStepPresentation[],
  transitions: readonly BusinessFlowTransitionDefinition[],
  spec: DiagramLayoutSpec,
): FlowLayout {
  const layout = layoutDiagram(dagre, spec);
  const positionedSteps = new Map(layout.nodes.map((node) => [node.id, node]));
  const routedTransitions = new Map(layout.edges.map((edge) => [edge.id, edge]));
  return {
    ...layout,
    steps: steps.map((step) => ({ ...step, ...positionedSteps.get(step.step.id)! })),
    transitions: transitions.map((transition) => {
      const id = transitionIdentity(transition);
      const routed = routedTransitions.get(id)!;
      return { transition, id, route: routed.points, labelX: routed.x, labelY: routed.y };
    }),
  };
}

function renderFlowSvg(flow: BusinessFlow, layout: FlowLayout, identity: string): string {
  const { width: canvasWidth, height: canvasHeight, offsetX, offsetY } = layout;
  const domToken = safeDomToken(identity);
  const patternId = `flow-grid-${domToken}`;
  const markerId = `flow-arrow-${domToken}`;
  return `<svg class="map-svg flow-svg" data-canvas-width="${formatNumber(canvasWidth)}" data-canvas-height="${formatNumber(canvasHeight)}" width="${formatNumber(canvasWidth)}" height="${formatNumber(canvasHeight)}" viewBox="0 0 ${formatNumber(canvasWidth)} ${formatNumber(canvasHeight)}" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="flow-title-${domToken} flow-description-${domToken}">
        <title id="flow-title-${domToken}">${escapeHtml(flow.name)}</title>
        <desc id="flow-description-${domToken}">${escapeHtml(flow.summary)}</desc>
        <defs>
          <pattern id="${patternId}" width="28" height="28" patternUnits="userSpaceOnUse">
            <path class="grid-line" d="M 28 0 L 0 0 0 28" fill="none" />
          </pattern>
          <marker id="${markerId}" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 1 1 L 11 6 L 1 11 z" fill="#b4532f" />
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#${patternId})" opacity="0.45" />
        <g data-layout-root transform="translate(${formatNumber(offsetX)} ${formatNumber(offsetY)})">
          ${layout.transitions.map((transition) => renderTransition(transition, markerId)).join("\n          ")}
          ${layout.steps.map(renderStep).join("\n          ")}
        </g>
      </svg>`;
}

function renderTransition(transition: RoutedFlowTransition, markerId: string): string {
  return `<g class="flow-transition" data-flow-transition="${escapeHtml(transition.id)}" data-layout-edge="${escapeHtml(transition.id)}">
            <path class="flow-transition__path" d="${routePath(transition.route)}" marker-end="url(#${markerId})" />
          </g>`;
}

function renderStep(step: PositionedFlowStep): string {
  const left = step.x - step.width / 2;
  const top = step.y - step.height / 2;
  const surface =
    step.step.kind === "decision"
      ? `<path class="flow-step__surface" d="M ${formatNumber(step.x)} ${formatNumber(top)} L ${formatNumber(left + step.width)} ${formatNumber(step.y)} L ${formatNumber(step.x)} ${formatNumber(top + step.height)} L ${formatNumber(left)} ${formatNumber(step.y)} Z" />`
      : `<rect class="flow-step__surface" x="${formatNumber(left)}" y="${formatNumber(top)}" width="${formatNumber(step.width)}" height="${formatNumber(step.height)}" rx="${step.step.kind === "outcome" ? "32" : "14"}" />`;
  return `<g class="flow-step flow-step--${escapeHtml(step.step.kind)}" data-flow-step-id="${escapeHtml(step.step.id)}" data-layout-node="${escapeHtml(step.step.id)}"${step.step.concept ? ` data-concept-id="${escapeHtml(step.step.concept)}"` : ""} role="group" aria-label="${escapeHtml(`${step.step.name}: ${step.step.summary}`)}">
            <title>${escapeHtml(`${step.step.name}: ${step.step.summary}`)}</title>
            ${surface}
          </g>`;
}

function renderFlowTextLayer(layout: FlowLayout): string {
  const { offsetX, offsetY } = layout;
  const cards = layout.steps.map((step) => renderStepText(step, offsetX, offsetY));
  const labels = layout.transitions
    .filter(({ transition }) => transition.when)
    .map(
      (transition) =>
        `<span class="diagram-label flow-transition__label" data-layout-edge="${escapeHtml(transition.id)}" style="left:${formatNumber(transition.labelX + offsetX)}px;top:${formatNumber(transition.labelY + offsetY)}px">${escapeHtml(transition.transition.when!)}</span>`,
    );
  return [...cards, ...labels].join("\n");
}

function renderStepText(step: PositionedFlowStep, offsetX: number, offsetY: number): string {
  const decision = step.step.kind === "decision";
  const width = decision ? step.width / 2 : step.width;
  const height = decision ? step.height / 2 : step.height;
  const left = step.x - width / 2 + offsetX;
  const top = step.y - height / 2 + offsetY;
  return `<div class="diagram-card-text diagram-card-text--flow diagram-card-text--${step.step.kind}" data-flow-step-id="${escapeHtml(step.step.id)}" data-layout-node="${escapeHtml(step.step.id)}" style="left:${formatNumber(left)}px;top:${formatNumber(top)}px;width:${formatNumber(width)}px;min-height:${formatNumber(height)}px">
              <p class="flow-step__kind" data-i18n="viewer.stepKinds.${step.step.kind}">${escapeHtml(t(`viewer.stepKinds.${step.step.kind}`))}</p>
              <h3 class="flow-step__title">${escapeHtml(step.step.name)}</h3>
              <p class="flow-step__summary">${escapeHtml(step.step.summary)}</p>
            </div>`;
}

function wrapText(value: string, maximumDisplayWidth: number): readonly string[] {
  const words = value.trim().split(/\s+/u);
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (stringWidth(candidate) <= maximumDisplayWidth) {
      currentLine = candidate;
      continue;
    }
    if (currentLine) lines.push(currentLine);
    if (stringWidth(word) <= maximumDisplayWidth) {
      currentLine = word;
      continue;
    }
    const chunks = chunkWord(word, maximumDisplayWidth);
    lines.push(...chunks.slice(0, -1));
    currentLine = chunks.at(-1) ?? "";
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [""];
}

function chunkWord(word: string, maximumDisplayWidth: number): readonly string[] {
  const chunks: string[] = [];
  let currentChunk = "";
  for (const { segment } of graphemeSegmenter.segment(word)) {
    const candidate = `${currentChunk}${segment}`;
    if (currentChunk && stringWidth(candidate) > maximumDisplayWidth) {
      chunks.push(currentChunk);
      currentChunk = segment;
      continue;
    }
    currentChunk = candidate;
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

function routePath(points: readonly dagre.GraphEdge["points"][number][]): string {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${formatNumber(point.x)} ${formatNumber(point.y)}`,
    )
    .join(" ");
}

function transitionIdentity(transition: BusinessFlowTransitionDefinition): string {
  return `${transition.from}--${transition.when ?? "next"}--${transition.to}`;
}

function labelWidth(label: string): number {
  return Math.max(76, stringWidth(label) * 7.2 + 24);
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
