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

const ACTION_WIDTH = 320;
const DECISION_WIDTH = 380;
const OUTCOME_WIDTH = 320;
const CARD_PADDING = 20;
const TITLE_LINE_HEIGHT = 22;
const SUMMARY_LINE_HEIGHT = 17;
const CANVAS_PADDING = 42;
const MINIMUM_CANVAS_WIDTH = 960;
const graphemeSegmenter = new Intl.Segmenter("und", { granularity: "grapheme" });

interface FlowStepPresentation {
  readonly step: BusinessFlowStepDefinition;
  readonly width: number;
  readonly height: number;
  readonly titleLines: readonly string[];
  readonly summaryLines: readonly string[];
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
  readonly steps: readonly PositionedFlowStep[];
  readonly transitions: readonly RoutedFlowTransition[];
}

interface RoutedEdge extends dagre.GraphEdge {
  readonly x?: number;
  readonly y?: number;
}

export class FlowProjector {
  public constructor(private readonly graph: BusinessGraph) {}

  public project(projectId: string): readonly ViewerBusinessFlow[] {
    return Object.freeze(this.graph.flows().map((flow) => this.projectFlow(flow, projectId)));
  }

  private projectFlow(flow: BusinessFlow, projectId: string): ViewerBusinessFlow {
    const steps = flow.steps.map(presentStep);
    const layout = layoutFlow(steps, flow.transitions);
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
    };
  }
}

function presentStep(step: BusinessFlowStepDefinition): FlowStepPresentation {
  const titleWidth = step.kind === "decision" ? 30 : 28;
  const summaryWidth = step.kind === "decision" ? 38 : 40;
  const titleLines = wrapText(step.name, titleWidth);
  const summaryLines = wrapText(step.summary, summaryWidth);
  const contentHeight = 54
    + titleLines.length * TITLE_LINE_HEIGHT
    + summaryLines.length * SUMMARY_LINE_HEIGHT
    + CARD_PADDING;
  const minimumHeight = step.kind === "decision" ? 176 : 128;
  return {
    step,
    width: step.kind === "decision"
      ? DECISION_WIDTH
      : step.kind === "outcome" ? OUTCOME_WIDTH : ACTION_WIDTH,
    height: Math.max(minimumHeight, contentHeight),
    titleLines,
    summaryLines,
  };
}

function layoutFlow(
  steps: readonly FlowStepPresentation[],
  transitions: readonly BusinessFlowTransitionDefinition[],
): FlowLayout {
  const layoutGraph = new dagre.graphlib.Graph({ multigraph: true })
    .setGraph({
      rankdir: "TB",
      ranker: "network-simplex",
      acyclicer: "greedy",
      nodesep: 92,
      edgesep: 34,
      ranksep: 112,
      marginx: 28,
      marginy: 28,
    })
    .setDefaultEdgeLabel(() => ({}));

  for (const step of steps) {
    layoutGraph.setNode(step.step.id, { width: step.width, height: step.height });
  }
  for (const transition of transitions) {
    const id = transitionIdentity(transition);
    const label = transition.when ?? "";
    layoutGraph.setEdge(
      transition.from,
      transition.to,
      {
        width: label ? labelWidth(label) : 0,
        height: label ? 24 : 0,
        minlen: 1,
        weight: 3,
        labelpos: "c",
      },
      id,
    );
  }

  dagre.layout(layoutGraph);
  const graphLabel = layoutGraph.graph();
  return {
    width: graphLabel.width ?? 0,
    height: graphLabel.height ?? 0,
    steps: steps.map((step) => {
      const position = layoutGraph.node(step.step.id);
      return { ...step, x: position.x, y: position.y };
    }),
    transitions: transitions.map((transition) => {
      const id = transitionIdentity(transition);
      const routed = layoutGraph.edge(transition.from, transition.to, id) as RoutedEdge;
      const fallback = routed.points[Math.floor(routed.points.length / 2)] ?? { x: 0, y: 0 };
      return {
        transition,
        id,
        route: routed.points,
        labelX: routed.x ?? fallback.x,
        labelY: routed.y ?? fallback.y,
      };
    }),
  };
}

function renderFlowSvg(flow: BusinessFlow, layout: FlowLayout, identity: string): string {
  const canvasWidth = Math.max(MINIMUM_CANVAS_WIDTH, layout.width + CANVAS_PADDING * 2);
  const canvasHeight = layout.height + CANVAS_PADDING * 2;
  const offsetX = (canvasWidth - layout.width) / 2;
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
        <g transform="translate(${formatNumber(offsetX)} ${formatNumber(CANVAS_PADDING)})">
          ${layout.transitions.map((transition) => renderTransition(transition, markerId)).join("\n          ")}
          ${layout.steps.map(renderStep).join("\n          ")}
        </g>
      </svg>`;
}

function renderTransition(transition: RoutedFlowTransition, markerId: string): string {
  const label = transition.transition.when;
  const labelMarkup = label
    ? `<g transform="translate(${formatNumber(transition.labelX)} ${formatNumber(transition.labelY)})">
              <rect class="flow-transition__label-surface" x="${formatNumber(-labelWidth(label) / 2)}" y="-12" width="${formatNumber(labelWidth(label))}" height="24" rx="12" />
              <text class="flow-transition__label" text-anchor="middle" dominant-baseline="central">${escapeHtml(label.toUpperCase())}</text>
            </g>`
    : "";
  return `<g class="flow-transition" data-flow-transition="${escapeHtml(transition.id)}">
            <path class="flow-transition__path" d="${routePath(transition.route)}" marker-end="url(#${markerId})" />
            ${labelMarkup}
          </g>`;
}

function renderStep(step: PositionedFlowStep): string {
  const left = step.x - step.width / 2;
  const top = step.y - step.height / 2;
  const textX = step.x;
  const titleY = step.y - ((step.titleLines.length - 1) * TITLE_LINE_HEIGHT
    + step.summaryLines.length * SUMMARY_LINE_HEIGHT) / 2;
  const summaryY = titleY + step.titleLines.length * TITLE_LINE_HEIGHT + 12;
  const surface = step.step.kind === "decision"
    ? `<path class="flow-step__surface" d="M ${formatNumber(step.x)} ${formatNumber(top)} L ${formatNumber(left + step.width)} ${formatNumber(step.y)} L ${formatNumber(step.x)} ${formatNumber(top + step.height)} L ${formatNumber(left)} ${formatNumber(step.y)} Z" />`
    : `<rect class="flow-step__surface" x="${formatNumber(left)}" y="${formatNumber(top)}" width="${formatNumber(step.width)}" height="${formatNumber(step.height)}" rx="${step.step.kind === "outcome" ? formatNumber(step.height / 2) : "14"}" />`;
  return `<g class="flow-step flow-step--${escapeHtml(step.step.kind)}" data-flow-step-id="${escapeHtml(step.step.id)}"${step.step.concept ? ` data-concept-id="${escapeHtml(step.step.concept)}"` : ""} role="group" aria-label="${escapeHtml(`${step.step.name}: ${step.step.summary}`)}">
            <title>${escapeHtml(`${step.step.name}: ${step.step.summary}`)}</title>
            ${surface}
            <text class="flow-step__kind" x="${formatNumber(textX)}" y="${formatNumber(top + 27)}" text-anchor="middle">${escapeHtml(step.step.kind.toUpperCase())}</text>
            ${renderTextLines(step.titleLines, textX, titleY, TITLE_LINE_HEIGHT, "flow-step__title")}
            ${renderTextLines(step.summaryLines, textX, summaryY, SUMMARY_LINE_HEIGHT, "flow-step__summary")}
          </g>`;
}

function renderTextLines(
  lines: readonly string[],
  x: number,
  y: number,
  lineHeight: number,
  className: string,
): string {
  const tspans = lines.map((line, index) =>
    `<tspan x="${formatNumber(x)}" dy="${index === 0 ? "0" : formatNumber(lineHeight)}">${escapeHtml(line)}</tspan>`)
    .join("");
  return `<text class="${className}" x="${formatNumber(x)}" y="${formatNumber(y)}" text-anchor="middle">${tspans}</text>`;
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
  return points.map((point, index) =>
    `${index === 0 ? "M" : "L"} ${formatNumber(point.x)} ${formatNumber(point.y)}`)
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
