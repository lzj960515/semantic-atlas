import dagre from "@dagrejs/dagre";
import type { MapProjection } from "../contracts/projection.js";
import type {
  BusinessNode,
  BusinessRelation,
  NavigationAnchor,
} from "../contracts/map.js";
import { BusinessGraph } from "../map/business-graph.js";

const CARD_WIDTH = 320;
const CARD_PADDING = 18;
const LINE_HEIGHT = 17;
const TITLE_LINE_HEIGHT = 22;
const LEGEND_HEIGHT = 82;
const CANVAS_PADDING = 28;
const MINIMUM_CANVAS_WIDTH = 960;

interface NodePresentation {
  readonly node: BusinessNode;
  readonly width: number;
  readonly height: number;
  readonly titleLines: readonly string[];
  readonly summaryLines: readonly string[];
  readonly anchorLines: readonly string[];
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

  public project(): MapProjection {
    const nodes = this.graph.nodes().map(presentNode).sort(comparePresentedNodes);
    const relations = this.graph.relations().map(presentRelation).sort(comparePresentedRelations);
    const layout = layoutProjection(nodes, relations);

    return {
      format: "html",
      content: renderHtml(layout),
      nodeCount: nodes.length,
      relationCount: relations.length,
    };
  }
}

function presentNode(node: BusinessNode): NodePresentation {
  const titleLines = wrapText(node.name, 30);
  const summaryLines = wrapText(node.summary, 43);
  const anchorLines = node.anchors.flatMap(presentAnchor);
  const anchorSectionHeight = anchorLines.length > 0
    ? 27 + anchorLines.length * LINE_HEIGHT
    : 0;
  const contentHeight = 38
    + titleLines.length * TITLE_LINE_HEIGHT
    + 12
    + summaryLines.length * LINE_HEIGHT
    + anchorSectionHeight
    + CARD_PADDING;

  return {
    node,
    width: CARD_WIDTH,
    height: Math.max(124, contentHeight),
    titleLines,
    summaryLines,
    anchorLines,
  };
}

function presentAnchor(anchor: NavigationAnchor): readonly string[] {
  return [
    ...wrapText(`${anchor.kind}: ${anchor.value}`, 41),
    ...wrapText(anchor.description, 41),
  ];
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

function renderHtml(layout: ProjectionLayout): string {
  const canvasWidth = Math.max(
    MINIMUM_CANVAS_WIDTH,
    layout.width + CANVAS_PADDING * 2,
  );
  const canvasHeight = layout.height + LEGEND_HEIGHT + CANVAS_PADDING * 2;
  const graphOffsetX = (canvasWidth - layout.width) / 2;
  const graphOffsetY = LEGEND_HEIGHT + CANVAS_PADDING;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Semantic Atlas business map</title>
  <style>
    :root {
      color-scheme: light;
      --paper: #f5f1e8;
      --ink: #1d2a2b;
      --muted: #617070;
      --card: #fffdf7;
      --line: #c5c8bd;
      --containment: #385967;
      --relation: #b4532f;
      --accent: #d9a441;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 12% 4%, rgba(217, 164, 65, 0.20), transparent 32rem),
        linear-gradient(145deg, #f8f5ed 0%, var(--paper) 55%, #edf0e9 100%);
      font-family: "Avenir Next", Avenir, "Trebuchet MS", sans-serif;
    }
    main { padding: clamp(18px, 4vw, 54px); }
    header { max-width: 72rem; margin: 0 auto 24px; }
    .eyebrow {
      margin: 0 0 8px;
      color: var(--relation);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      max-width: 17ch;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(32px, 5vw, 64px);
      font-weight: 600;
      line-height: 0.98;
    }
    .lede { max-width: 58rem; margin: 16px 0 0; color: var(--muted); line-height: 1.6; }
    .diagram-shell {
      max-width: 100%;
      overflow-x: auto;
      border: 1px solid rgba(56, 89, 103, 0.24);
      border-radius: 18px;
      background: rgba(255, 253, 247, 0.72);
      box-shadow: 0 18px 48px rgba(29, 42, 43, 0.10);
    }
    .diagram {
      display: block;
      width: ${formatNumber(canvasWidth)}px;
      min-width: ${formatNumber(MINIMUM_CANVAS_WIDTH)}px;
      height: auto;
    }
    .grid-line { stroke: #dfe1d8; stroke-width: 1; }
    .legend-title { fill: var(--ink); font-size: 13px; font-weight: 800; letter-spacing: 0.08em; }
    .legend-label { fill: var(--muted); font-size: 13px; font-weight: 650; }
    .edge__path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .edge--containment .edge__path {
      stroke: var(--containment);
      stroke-width: 2.2;
      stroke-dasharray: 9 7;
    }
    .edge--directed-relation .edge__path { stroke: var(--relation); stroke-width: 2.4; }
    .edge__label-surface { fill: var(--card); stroke-width: 1; }
    .edge--containment .edge__label-surface { stroke: var(--containment); }
    .edge--directed-relation .edge__label-surface { stroke: var(--relation); }
    .edge__label { fill: var(--ink); font-size: 11px; font-weight: 800; letter-spacing: 0.04em; }
    .node-card__surface { fill: var(--card); stroke: var(--line); stroke-width: 1.5; }
    .node-card__kind-rule { fill: var(--accent); }
    .node-card__kind { fill: var(--muted); font-size: 10px; font-weight: 850; letter-spacing: 0.12em; }
    .node-card__title { fill: var(--ink); font-family: Georgia, "Times New Roman", serif; font-size: 18px; font-weight: 650; }
    .node-card__summary { fill: #405052; font-size: 13px; }
    .node-card__anchor-heading { fill: var(--relation); font-size: 10px; font-weight: 850; letter-spacing: 0.10em; }
    .node-card__anchor { fill: #526263; font-family: "SFMono-Regular", Consolas, monospace; font-size: 10.5px; }
    @media (max-width: 640px) {
      main { padding: 16px 0 24px 16px; }
      header { padding-right: 16px; }
      .diagram-shell { border-radius: 14px 0 0 14px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="eyebrow">Semantic Atlas / Human inspection</p>
      <h1>Business relationships, made visible.</h1>
      <p class="lede">A deterministic projection of ${layout.nodes.length} business concepts and ${layout.relations.length} tracked relationships. Containment uses dashed connectors; arrows show the direction of business collaboration.</p>
    </header>
    <div class="diagram-shell" tabindex="0" aria-label="Scrollable business map projection">
      <svg class="diagram" width="${formatNumber(canvasWidth)}" height="${formatNumber(canvasHeight)}" viewBox="0 0 ${formatNumber(canvasWidth)} ${formatNumber(canvasHeight)}" role="img" aria-labelledby="semantic-atlas-title semantic-atlas-description">
        <title id="semantic-atlas-title">Semantic Atlas business map</title>
        <desc id="semantic-atlas-description">A static business graph. Dashed lines represent containment. Solid lines with arrowheads represent directed business relationships.</desc>
        <defs>
          <pattern id="diagram-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path class="grid-line" d="M 28 0 L 0 0 0 28" fill="none" />
          </pattern>
          <marker id="relation-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 1 1 L 11 6 L 1 11 z" fill="#b4532f" />
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#diagram-grid)" opacity="0.45" />
        ${renderLegend(CANVAS_PADDING)}
        <g transform="translate(${formatNumber(graphOffsetX)} ${formatNumber(graphOffsetY)})">
          ${renderRelations(layout.relations, "containment", layout.nodes)}
          ${renderRelations(layout.relations, "directed-relation", layout.nodes)}
          ${layout.nodes.map(renderNode).join("\n          ")}
        </g>
      </svg>
    </div>
  </main>
</body>
</html>
`;
}

function renderLegend(x: number): string {
  return `<g transform="translate(${formatNumber(x)} 24)" role="group" aria-label="Relationship legend">
          <text class="legend-title" x="0" y="0">RELATIONSHIP CHANNELS</text>
          <g transform="translate(0 24)" data-channel="containment">
            <line class="edge__path" x1="0" y1="0" x2="58" y2="0" stroke="#385967" stroke-width="2.2" stroke-dasharray="9 7" />
            <text class="legend-label" x="72" y="4">Containment relationships (contains)</text>
          </g>
          <g transform="translate(344 24)" data-channel="directed-relation">
            <line class="edge__path" x1="0" y1="0" x2="58" y2="0" stroke="#b4532f" stroke-width="2.4" marker-end="url(#relation-arrow)" />
            <text class="legend-label" x="72" y="4">Directed business relationships (arrow shows direction)</text>
          </g>
        </g>`;
}

function renderRelations(
  relations: readonly RoutedRelation[],
  channel: RelationPresentation["channel"],
  nodes: readonly PositionedNode[],
): string {
  const nodeById = new Map(nodes.map((node) => [node.node.id, node.node]));
  return relations
    .filter((relation) => relation.channel === channel)
    .map((relation) => renderRelation(relation, nodeById))
    .join("\n          ");
}

function renderRelation(
  relation: RoutedRelation,
  nodeById: ReadonlyMap<string, BusinessNode>,
): string {
  const labelWidth = relationLabelWidth(relation.label);
  const source = nodeById.get(relation.relation.from);
  const target = nodeById.get(relation.relation.to);
  const ariaLabel = relation.channel === "containment"
    ? `${target?.name ?? relation.relation.to} contains ${source?.name ?? relation.relation.from}`
    : `${source?.name ?? relation.relation.from} ${relation.label} ${target?.name ?? relation.relation.to}`;
  const marker = relation.channel === "directed-relation"
    ? ' marker-end="url(#relation-arrow)"'
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

function renderNode(node: PositionedNode): string {
  const left = node.x - node.width / 2;
  const top = node.y - node.height / 2;
  const textX = left + CARD_PADDING;
  const titleY = top + 50;
  const summaryY = titleY + node.titleLines.length * TITLE_LINE_HEIGHT + 7;
  const anchorHeadingY = summaryY + node.summaryLines.length * LINE_HEIGHT + 12;
  const anchorY = anchorHeadingY + 18;

  return `<g class="node-card node-card--${escapeHtml(node.node.kind)}" id="node-${escapeHtml(node.node.id)}" data-node-id="${escapeHtml(node.node.id)}" data-node-kind="${escapeHtml(node.node.kind)}" role="group" aria-label="${escapeHtml(`${node.node.name}: ${node.node.summary}`)}">
            <title>${escapeHtml(`${node.node.name}: ${node.node.summary}`)}</title>
            <rect class="node-card__surface" x="${formatNumber(left)}" y="${formatNumber(top)}" width="${formatNumber(node.width)}" height="${formatNumber(node.height)}" rx="14" />
            <rect class="node-card__kind-rule" x="${formatNumber(left)}" y="${formatNumber(top)}" width="7" height="${formatNumber(node.height)}" rx="3.5" />
            <text class="node-card__kind" x="${formatNumber(textX)}" y="${formatNumber(top + 24)}">${escapeHtml(node.node.kind.toUpperCase())}</text>
            ${renderTextLines(node.titleLines, textX, titleY, TITLE_LINE_HEIGHT, "node-card__title")}
            ${renderTextLines(node.summaryLines, textX, summaryY, LINE_HEIGHT, "node-card__summary")}
            ${renderAnchors(node.anchorLines, textX, anchorHeadingY, anchorY)}
          </g>`;
}

function renderAnchors(
  anchorLines: readonly string[],
  x: number,
  headingY: number,
  firstLineY: number,
): string {
  if (anchorLines.length === 0) return "";
  return `<text class="node-card__anchor-heading" x="${formatNumber(x)}" y="${formatNumber(headingY)}">NAVIGATION ANCHORS</text>
            ${renderTextLines(anchorLines, x, firstLineY, LINE_HEIGHT, "node-card__anchor")}`;
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

function wrapText(value: string, maximumLength: number): readonly string[] {
  const words = value.trim().split(/\s+/u);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maximumLength) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) lines.push(currentLine);
    if (word.length <= maximumLength) {
      currentLine = word;
      continue;
    }

    const chunks = chunkWord(word, maximumLength);
    lines.push(...chunks.slice(0, -1));
    currentLine = chunks.at(-1) ?? "";
  }

  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [""];
}

function chunkWord(word: string, maximumLength: number): readonly string[] {
  const characters = Array.from(word);
  const chunks: string[] = [];
  for (let index = 0; index < characters.length; index += maximumLength) {
    chunks.push(characters.slice(index, index + maximumLength).join(""));
  }
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
