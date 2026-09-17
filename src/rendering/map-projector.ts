import { getTranslator } from "../i18n/index.js";
import dagre from "@dagrejs/dagre";
import stringWidth from "string-width";
import type { MapProjection } from "../contracts/projection.js";
import type {
  BusinessNode,
  BusinessRelation,
} from "../contracts/map.js";
import { BusinessGraph } from "../map/business-graph.js";
import { escapeHtml, safeDomToken, translationAttributes } from "./html.js";
import { FlowProjector } from "./flow-projector.js";
import { layoutDiagram, type DiagramLayoutSpec } from "./viewer-layout.js";
import {
  renderViewerPage,
  type ViewerMapView,
  type ViewerNodeDetails,
  type ViewerProject,
} from "./viewer-page.js";

const t = getTranslator("en");

const CARD_WIDTH = 320;
const CARD_PADDING = 18;
const LINE_HEIGHT = 17;
const TITLE_LINE_HEIGHT = 22;
const graphemeSegmenter = new Intl.Segmenter("und", { granularity: "grapheme" });

interface NodePresentation {
  readonly node: BusinessNode;
  readonly boundary: boolean;
  readonly width: number;
  readonly height: number;
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
  readonly offsetX: number;
  readonly offsetY: number;
  readonly nodes: readonly PositionedNode[];
  readonly relations: readonly RoutedRelation[];
}

export class MapProjector {
  public constructor(private readonly graph: BusinessGraph) {}

  public project(
    metadata: ViewerProjectMetadata = { id: "repository", name: t("viewer.businessMap") },
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
      name: t("viewer.allBusiness"),
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
    const layoutSpec = createLayoutSpec(nodes, relations);
    const layout = layoutProjection(nodes, relations, layoutSpec);

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
      textLayer: renderMapTextLayer(layout),
      layout: layoutSpec,
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
    label: t(`viewer.relationKinds.${containment ? "contains" : relation.type}`),
    layoutFrom: containment ? relation.to : relation.from,
    layoutTo: containment ? relation.from : relation.to,
  };
}

function createLayoutSpec(
  nodes: readonly NodePresentation[],
  relations: readonly RelationPresentation[],
): DiagramLayoutSpec {
  return {
    direction: "LR",
    nodes: nodes.map((node) => ({
      id: node.node.id,
      kind: "card",
      width: node.width,
      height: node.height,
    })),
    edges: relations.map((relation) => ({
      id: relation.id,
      from: relation.layoutFrom,
      to: relation.layoutTo,
      width: relationLabelWidth(relation.label),
      height: 24,
      minlen: relation.channel === "containment" ? 1 : 2,
      weight: relation.channel === "containment" ? 8 : 2,
    })),
  };
}

function layoutProjection(
  nodes: readonly NodePresentation[],
  relations: readonly RelationPresentation[],
  spec: DiagramLayoutSpec,
): ProjectionLayout {
  const layout = layoutDiagram(dagre, spec);
  const positionedNodes = new Map(layout.nodes.map((node) => [node.id, node]));
  const routedRelations = new Map(layout.edges.map((edge) => [edge.id, edge]));
  return {
    ...layout,
    nodes: nodes.map((node) => ({ ...node, ...positionedNodes.get(node.node.id)! })),
    relations: relations.map((relation) => {
      const routed = routedRelations.get(relation.id)!;
      return { ...relation, route: routed.points, labelX: routed.x, labelY: routed.y };
    }),
  };
}

function renderMapSvg(layout: ProjectionLayout, identity: string): string {
  const { width: canvasWidth, height: canvasHeight, offsetX, offsetY } = layout;
  const domToken = safeDomToken(identity);
  const patternId = `diagram-grid-${domToken}`;
  const markerId = `relation-arrow-${domToken}`;

  return `<svg class="map-svg" data-canvas-width="${formatNumber(canvasWidth)}" data-canvas-height="${formatNumber(canvasHeight)}" width="${formatNumber(canvasWidth)}" height="${formatNumber(canvasHeight)}" viewBox="0 0 ${formatNumber(canvasWidth)} ${formatNumber(canvasHeight)}" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="semantic-atlas-title-${domToken} semantic-atlas-description-${domToken}">
        <title id="semantic-atlas-title-${domToken}" data-i18n="viewer.title">${escapeHtml(t("viewer.title"))}</title>
        <desc id="semantic-atlas-description-${domToken}" data-i18n="viewer.mapDescription">${escapeHtml(t("viewer.mapDescription"))}</desc>
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
  const source = nodeById.get(relation.relation.from);
  const target = nodeById.get(relation.relation.to);
  const containment = relation.channel === "containment";
  const values = {
    parent: target?.name ?? relation.relation.to,
    child: source?.name ?? relation.relation.from,
    source: source?.name ?? relation.relation.from,
    target: target?.name ?? relation.relation.to,
    summary: relation.relation.summary,
    relation: t(`viewer.relationKinds.${relation.relation.type}`),
  };
  // The relationship key belongs to the product, while names and summaries stay literal.
  const ariaKey = containment ? "viewer.containsLabel" : "viewer.relationLabel";
  const ariaLabel = t(ariaKey, values);
  const relationMarker = `data-i18n-relation-kind="${relation.relation.type}"`;
  const titleKey = containment ? "viewer.containsSummary" : "viewer.relationSummary";
  const marker = relation.channel === "directed-relation"
    ? ` marker-end="url(#${markerId})"`
    : "";

  return `<g class="edge edge--${relation.channel}" data-channel="${relation.channel}" data-relation-id="${escapeHtml(relation.id)}" data-layout-edge="${escapeHtml(relation.id)}" data-relation-type="${escapeHtml(relation.relation.type)}" role="group" ${translationAttributes(ariaKey, values, "aria-label")} ${relationMarker} aria-label="${escapeHtml(ariaLabel)}">
            <title ${translationAttributes(titleKey, values)} ${relationMarker}>${escapeHtml(t(titleKey, values))}</title>
            <path class="edge__path" d="${routePath(relation.route)}"${marker} />
          </g>`;
}

function renderNode(node: PositionedNode, domToken: string): string {
  const left = node.x - node.width / 2;
  const top = node.y - node.height / 2;
  const boundaryClass = node.boundary ? " node-card--boundary" : "";
  return `<g class="node-card node-card--${escapeHtml(node.node.kind)}${boundaryClass}" id="node-${domToken}-${safeDomToken(node.node.id)}" data-node-id="${escapeHtml(node.node.id)}" data-layout-node="${escapeHtml(node.node.id)}" data-node-kind="${escapeHtml(node.node.kind)}" data-boundary="${node.boundary}" role="button" tabindex="0" aria-controls="node-details" aria-expanded="false" aria-label="${escapeHtml(`${node.node.name}: ${node.node.summary}`)}">
            <title>${escapeHtml(`${node.node.name}: ${node.node.summary}`)}</title>
            <rect class="node-card__surface" x="${formatNumber(left)}" y="${formatNumber(top)}" width="${formatNumber(node.width)}" height="${formatNumber(node.height)}" rx="14" />
            <rect class="node-card__kind-rule" x="${formatNumber(left)}" y="${formatNumber(top)}" width="7" height="${formatNumber(node.height)}" rx="3.5" />
          </g>`;
}

function renderMapTextLayer(layout: ProjectionLayout): string {
  const { offsetX, offsetY } = layout;
  const cards = layout.nodes.map((node) => renderNodeText(node, offsetX, offsetY));
  const labels = layout.relations.map((relation) =>
    `<span class="diagram-label edge__label edge__label--${relation.channel}" data-layout-edge="${escapeHtml(relation.id)}" data-i18n="viewer.relationKinds.${relation.channel === "containment" ? "contains" : relation.relation.type}" style="left:${formatNumber(relation.labelX + offsetX)}px;top:${formatNumber(relation.labelY + offsetY)}px">${escapeHtml(relation.label)}</span>`);
  return [...cards, ...labels].join("\n");
}

function renderNodeText(node: PositionedNode, offsetX: number, offsetY: number): string {
  const left = node.x - node.width / 2 + offsetX;
  const top = node.y - node.height / 2 + offsetY;
  return `<div class="diagram-card-text diagram-card-text--relationship" data-node-id="${escapeHtml(node.node.id)}" data-layout-node="${escapeHtml(node.node.id)}" style="left:${formatNumber(left)}px;top:${formatNumber(top)}px;width:${formatNumber(node.width)}px;min-height:${formatNumber(node.height)}px">
              <p class="node-card__kind"><span data-selectable-text data-i18n="viewer.nodeKinds.${node.node.kind}">${escapeHtml(t(`viewer.nodeKinds.${node.node.kind}`))}</span></p>
              <h3 class="node-card__title"><span data-selectable-text>${escapeHtml(node.node.name)}</span></h3>
              <p class="node-card__summary"><span data-selectable-text>${escapeHtml(node.node.summary)}</span></p>
            </div>`;
}

function routePath(points: readonly dagre.GraphEdge["points"][number][]): string {
  return points.map((point, index) =>
    `${index === 0 ? "M" : "L"} ${formatNumber(point.x)} ${formatNumber(point.y)}`)
    .join(" ");
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
  return Math.max(76, stringWidth(label) * 7.2 + 24);
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
