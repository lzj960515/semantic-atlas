import dagre from "@dagrejs/dagre";
import stringWidth from "string-width";
import type { MapProjection } from "../contracts/projection.js";
import type {
  BusinessNode,
  BusinessRelation,
} from "../contracts/map.js";
import { BusinessGraph } from "../map/business-graph.js";
import { escapeHtml, safeDomToken } from "./html.js";
import { FlowProjector } from "./flow-projector.js";
import {
  renderViewerPage,
  type ViewerMapView,
  type ViewerNodeDetails,
  type ViewerProject,
} from "./viewer-page.js";

const CARD_WIDTH = 320;
const CARD_PADDING = 18;
const LINE_HEIGHT = 17;
const TITLE_LINE_HEIGHT = 22;
const CANVAS_PADDING = 28;
const MINIMUM_CANVAS_WIDTH = 960;
const graphemeSegmenter = new Intl.Segmenter("und", { granularity: "grapheme" });

interface NodePresentation {
  readonly node: BusinessNode;
  readonly boundary: boolean;
  readonly width: number;
  readonly height: number;
  readonly titleLines: readonly string[];
  readonly summaryLines: readonly string[];
}

interface RelationPresentation {
  readonly relation: BusinessRelation;
  readonly id: string;
  readonly channel: "containment" | "directed-relation";
  readonly label: string;
  readonly layoutFrom: string;
  readonly layoutTo: string;
}

interface RoutedRelation extends RelationPresentation {
  readonly route: readonly dagre.GraphEdge["points"][number][];
  readonly labelX: number;
  readonly labelY: number;
}

interface PositionedNode extends NodePresentation {
  readonly x: number;
  readonly y: number;
}

interface ProjectionLayout {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly PositionedNode[];
  readonly relations: readonly RoutedRelation[];
}

interface RoutedEdge extends dagre.GraphEdge {
  readonly x?: number;
  readonly y?: number;
}

export class MapProjector {
  public constructor(private readonly graph: BusinessGraph) {}

  public project(
    metadata: ViewerProjectMetadata = { id: "repository", name: "Business map" },
  ): MapProjection {
    const viewerProject = this.viewerProject(metadata);
    const completeView = viewerProject.views[0]!;

    return {
      format: "html",
      content: renderViewerPage([viewerProject]),
      nodeCount: completeView.nodeCount,
      relationCount: completeView.relationCount,
      flowCount: viewerProject.flows.length,
    };
  }

  public viewerProject(metadata: ViewerProjectMetadata): ViewerProject {
    const completeNodes = this.graph.nodes();
    const completeRelations = this.graph.relations();
    const completeView = this.projectView({
      id: "all",
      name: "All business",
      nodes: completeNodes,
      relations: completeRelations,
      boundaryNodeIds: new Set(),
    }, metadata.id);
    const domainViews = completeNodes
      .filter((node) => node.kind === "domain")
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((domain) => this.projectView(selectDomainView(this.graph, domain), metadata.id));

    return {
      ...metadata,
      views: Object.freeze([completeView, ...domainViews]),
      flows: new FlowProjector(this.graph).project(metadata.id),
    };
  }

  private projectView(selection: MapViewSelection, projectId: string): ViewerMapView {
    const nodes = selection.nodes
      .map((node) => presentNode(node, selection.boundaryNodeIds.has(node.id)))
      .sort(comparePresentedNodes);
    const relations = selection.relations
      .map(presentRelation)
      .sort(comparePresentedRelations);
    const layout = layoutProjection(nodes, relations);

    return {
      id: selection.id,
      name: selection.name,
      nodeCount: nodes.length,
      relationCount: relations.length,
      nodes: Object.freeze(nodes.map((node) => toViewerNodeDetails(
        node,
        this.graph.flowsRelatedTo(node.node.id).map(({ id }) => id),
      ))),
      svg: renderMapSvg(layout, `${projectId}-${selection.id}`),
    };
  }
}

export interface ViewerProjectMetadata {
  readonly id: string;
  readonly name: string;
}

interface MapViewSelection {
  readonly id: string;
  readonly name: string;
  readonly nodes: readonly BusinessNode[];
  readonly relations: readonly BusinessRelation[];
  readonly boundaryNodeIds: ReadonlySet<string>;
}

function selectDomainView(graph: BusinessGraph, domain: BusinessNode): MapViewSelection {
  const domainNodeIds = new Set([
    domain.id,
    ...graph.descendants(domain.id).map(({ id }) => id),
  ]);
  const relatedRelations = graph.relations().filter((relation) =>
    domainNodeIds.has(relation.from) || domainNodeIds.has(relation.to));
  const boundaryNodeIds = new Set<string>();
  for (const relation of relatedRelations) {
    if (relation.type === "part_of") continue;
    if (!domainNodeIds.has(relation.from)) boundaryNodeIds.add(relation.from);
    if (!domainNodeIds.has(relation.to)) boundaryNodeIds.add(relation.to);
  }
  const includedNodeIds = new Set([...domainNodeIds, ...boundaryNodeIds]);
  const relations = relatedRelations.filter((relation) => {
    if (!includedNodeIds.has(relation.from) || !includedNodeIds.has(relation.to)) return false;
    return relation.type !== "part_of"
      || (domainNodeIds.has(relation.from) && domainNodeIds.has(relation.to));
  });

  return {
    id: domain.id,
    name: domain.name,
    nodes: graph.nodes().filter(({ id }) => includedNodeIds.has(id)),
    relations,
    boundaryNodeIds,
  };
}

function presentNode(node: BusinessNode, boundary: boolean): NodePresentation {
  const titleLines = wrapText(node.name, 30);
  const summaryLines = wrapText(node.summary, 43);
  const contentHeight = 38
    + titleLines.length * TITLE_LINE_HEIGHT
    + 12
    + summaryLines.length * LINE_HEIGHT
    + CARD_PADDING;

  return {
    node,
    boundary,
    width: CARD_WIDTH,
    height: Math.max(124, contentHeight),
    titleLines,
    summaryLines,
  };
}

function toViewerNodeDetails(
  presentation: NodePresentation,
  relatedFlowIds: readonly string[],
): ViewerNodeDetails {
  return {
    id: presentation.node.id,
    kind: presentation.node.kind,
    name: presentation.node.name,
    summary: presentation.node.summary,
    boundary: presentation.boundary,
    anchors: presentation.node.anchors,
    relatedFlowIds: Object.freeze([...relatedFlowIds]),
  };
}

function presentRelation(relation: BusinessRelation): RelationPresentation {
  const containment = relation.type === "part_of";
  return {
    relation,
    id: relationIdentity(relation),
    channel: containment ? "containment" : "directed-relation",
    label: containment ? "contains" : relation.type.replaceAll("_", " "),
    layoutFrom: containment ? relation.to : relation.from,
    layoutTo: containment ? relation.from : relation.to,
  };
}

function layoutProjection(
  nodes: readonly NodePresentation[],
  relations: readonly RelationPresentation[],
): ProjectionLayout {
  const layoutGraph = new dagre.graphlib.Graph({ multigraph: true })
    .setGraph({
      rankdir: "LR",
      ranker: "network-simplex",
      acyclicer: "greedy",
      nodesep: 50,
      edgesep: 30,
      ranksep: 118,
      marginx: 24,
      marginy: 24,
    })
    .setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    layoutGraph.setNode(node.node.id, {
      width: node.width,
      height: node.height,
    });
  }

  for (const relation of relations) {
    layoutGraph.setEdge(
      relation.layoutFrom,
      relation.layoutTo,
      {
        width: relationLabelWidth(relation.label),
        height: 24,
        minlen: relation.channel === "containment" ? 1 : 2,
        weight: relation.channel === "containment" ? 8 : 2,
        labelpos: "c",
      },
      relation.id,
    );
  }

  dagre.layout(layoutGraph);
  const graphLabel = layoutGraph.graph();

  return {
    width: graphLabel.width ?? 0,
    height: graphLabel.height ?? 0,
    nodes: nodes.map((node) => {
      const positioned = layoutGraph.node(node.node.id);
      return {
        ...node,
        x: positioned.x,
        y: positioned.y,
      };
    }),
    relations: relations.map((relation) => {
      const routed = layoutGraph.edge(
        relation.layoutFrom,
        relation.layoutTo,
        relation.id,
      ) as RoutedEdge;
      const fallbackLabel = middlePoint(routed.points);
      return {
        ...relation,
        route: routed.points,
        labelX: routed.x ?? fallbackLabel.x,
        labelY: routed.y ?? fallbackLabel.y,
      };
    }),
  };
}

function renderMapSvg(layout: ProjectionLayout, identity: string): string {
  const canvasWidth = Math.max(
    MINIMUM_CANVAS_WIDTH,
    layout.width + CANVAS_PADDING * 2,
  );
  const canvasHeight = layout.height + CANVAS_PADDING * 2;
  const graphOffsetX = (canvasWidth - layout.width) / 2;
  const graphOffsetY = CANVAS_PADDING;
  const domToken = safeDomToken(identity);
  const patternId = `diagram-grid-${domToken}`;
  const markerId = `relation-arrow-${domToken}`;

  return `<svg class="map-svg" data-canvas-width="${formatNumber(canvasWidth)}" data-canvas-height="${formatNumber(canvasHeight)}" width="${formatNumber(canvasWidth)}" height="${formatNumber(canvasHeight)}" viewBox="0 0 ${formatNumber(canvasWidth)} ${formatNumber(canvasHeight)}" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="semantic-atlas-title-${domToken} semantic-atlas-description-${domToken}">
        <title id="semantic-atlas-title-${domToken}">Semantic Atlas business map</title>
        <desc id="semantic-atlas-description-${domToken}">An interactive business graph. Dashed lines represent containment. Solid lines with arrowheads represent directed business relationships.</desc>
        <defs>
          <pattern id="${patternId}" width="28" height="28" patternUnits="userSpaceOnUse">
            <path class="grid-line" d="M 28 0 L 0 0 0 28" fill="none" />
          </pattern>
          <marker id="${markerId}" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 1 1 L 11 6 L 1 11 z" fill="#b4532f" />
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#${patternId})" opacity="0.45" />
        <g transform="translate(${formatNumber(graphOffsetX)} ${formatNumber(graphOffsetY)})">
          ${renderRelations(layout.relations, "containment", layout.nodes, markerId)}
          ${renderRelations(layout.relations, "directed-relation", layout.nodes, markerId)}
          ${layout.nodes.map((node) => renderNode(node, domToken)).join("\n          ")}
        </g>
      </svg>`;
}

function renderRelations(
  relations: readonly RoutedRelation[],
  channel: RelationPresentation["channel"],
  nodes: readonly PositionedNode[],
  markerId: string,
): string {
  const nodeById = new Map(nodes.map((node) => [node.node.id, node.node]));
  return relations
    .filter((relation) => relation.channel === channel)
    .map((relation) => renderRelation(relation, nodeById, markerId))
    .join("\n          ");
}

function renderRelation(
  relation: RoutedRelation,
  nodeById: ReadonlyMap<string, BusinessNode>,
  markerId: string,
): string {
  const labelWidth = relationLabelWidth(relation.label);
  const source = nodeById.get(relation.relation.from);
  const target = nodeById.get(relation.relation.to);
  const ariaLabel = relation.channel === "containment"
    ? `${target?.name ?? relation.relation.to} contains ${source?.name ?? relation.relation.from}`
    : `${source?.name ?? relation.relation.from} ${relation.label} ${target?.name ?? relation.relation.to}`;
  const marker = relation.channel === "directed-relation"
    ? ` marker-end="url(#${markerId})"`
    : "";

  return `<g class="edge edge--${relation.channel}" data-channel="${relation.channel}" data-relation-id="${escapeHtml(relation.id)}" data-relation-type="${escapeHtml(relation.relation.type)}" role="group" aria-label="${escapeHtml(ariaLabel)}">
            <title>${escapeHtml(`${ariaLabel}: ${relation.relation.summary}`)}</title>
            <path class="edge__path" d="${routePath(relation.route)}"${marker} />
            <g transform="translate(${formatNumber(relation.labelX)} ${formatNumber(relation.labelY)})">
              <rect class="edge__label-surface" x="${formatNumber(-labelWidth / 2)}" y="-12" width="${formatNumber(labelWidth)}" height="24" rx="12" />
              <text class="edge__label" text-anchor="middle" dominant-baseline="central">${escapeHtml(relation.label.toUpperCase())}</text>
            </g>
          </g>`;
}

function renderNode(node: PositionedNode, domToken: string): string {
  const left = node.x - node.width / 2;
  const top = node.y - node.height / 2;
  const textX = left + CARD_PADDING;
  const titleY = top + 50;
  const summaryY = titleY + node.titleLines.length * TITLE_LINE_HEIGHT + 7;
  const boundaryClass = node.boundary ? " node-card--boundary" : "";
  return `<g class="node-card node-card--${escapeHtml(node.node.kind)}${boundaryClass}" id="node-${domToken}-${safeDomToken(node.node.id)}" data-node-id="${escapeHtml(node.node.id)}" data-node-kind="${escapeHtml(node.node.kind)}" data-boundary="${node.boundary}" role="button" tabindex="0" aria-controls="node-details" aria-expanded="false" aria-label="${escapeHtml(`${node.node.name}: ${node.node.summary}`)}">
            <title>${escapeHtml(`${node.node.name}: ${node.node.summary}`)}</title>
            <rect class="node-card__surface" x="${formatNumber(left)}" y="${formatNumber(top)}" width="${formatNumber(node.width)}" height="${formatNumber(node.height)}" rx="14" />
            <rect class="node-card__kind-rule" x="${formatNumber(left)}" y="${formatNumber(top)}" width="7" height="${formatNumber(node.height)}" rx="3.5" />
            <text class="node-card__kind" x="${formatNumber(textX)}" y="${formatNumber(top + 24)}">${escapeHtml(node.node.kind.toUpperCase())}</text>
            ${renderTextLines(node.titleLines, textX, titleY, TITLE_LINE_HEIGHT, "node-card__title")}
            ${renderTextLines(node.summaryLines, textX, summaryY, LINE_HEIGHT, "node-card__summary")}
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
  return `<text class="${className}" x="${formatNumber(x)}" y="${formatNumber(y)}">${tspans}</text>`;
}

function routePath(points: readonly dagre.GraphEdge["points"][number][]): string {
  return points.map((point, index) =>
    `${index === 0 ? "M" : "L"} ${formatNumber(point.x)} ${formatNumber(point.y)}`)
    .join(" ");
}

function middlePoint(
  points: readonly dagre.GraphEdge["points"][number][],
): dagre.GraphEdge["points"][number] {
  return points[Math.floor(points.length / 2)] ?? { x: 0, y: 0 };
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

function relationIdentity(relation: BusinessRelation): string {
  return `${relation.from}--${relation.type}--${relation.to}`;
}

function relationLabelWidth(label: string): number {
  return Math.max(76, label.length * 7.2 + 24);
}

function comparePresentedNodes(left: NodePresentation, right: NodePresentation): number {
  return left.node.id.localeCompare(right.node.id);
}

function comparePresentedRelations(
  left: RelationPresentation,
  right: RelationPresentation,
): number {
  return left.id.localeCompare(right.id);
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
