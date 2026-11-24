import type { FlowContext } from "../contracts/flow-navigation.js";
import type { ContextData } from "../contracts/cli.js";
import type { BusinessFlow, BusinessNode, BusinessRelation } from "../contracts/map.js";
import type {
  BusinessQuerySummary,
  QueryConcept,
  QueryFlowReference,
  QueryMapReference,
  QueryRelation,
} from "../contracts/query-context.js";
import { BusinessGraph, type ConceptResolution } from "../map/business-graph.js";
import { QuerySourceLocator } from "./query-source-locator.js";
import { FlowNavigationService } from "./flow-navigation-service.js";

export type ContextQueryResult =
  | { readonly found: true; readonly data: ContextData }
  | Exclude<ConceptResolution, { readonly found: true }>;

/** 将已记录的业务关系投影为局部调查线索，不自动传播业务影响。 */
export class ContextQueryService {
  public constructor(
    private readonly graph: BusinessGraph,
    private readonly locations: QuerySourceLocator,
  ) {}

  public async query(selector: string): Promise<ContextQueryResult> {
    const resolution = this.graph.resolve(selector);
    if (!resolution.found) return resolution;
    const selected = resolution.node;
    const ancestors = this.graph.ancestors(selected.id).map(({ id }) => id);
    const children = this.graph.children(selected.id).map(({ id }) => id);
    const summary = await this.summarize([selected.id], [...ancestors, ...children]);
    return {
      found: true,
      data: {
        selector,
        matchedBy: resolution.matchedBy,
        selected: await this.describeNode(selected),
        ancestors,
        children,
        ...summary,
        concepts: summary.concepts.filter(({ id }) => id !== selected.id),
      },
    };
  }

  public async summarize(
    ids: readonly string[],
    includedIds: readonly string[] = [],
  ): Promise<BusinessQuerySummary> {
    const seeds = new Set(ids);
    const direct = this.graph
      .relations()
      .filter(({ from, to }) => seeds.has(from) || seeds.has(to));
    const shared = new Set(
      direct
        .flatMap(({ from, to }) => [from, to])
        .filter((id) =>
          ["data", "interface", "invariant"].includes(this.graph.requireNode(id).kind),
        ),
    );
    // 只沿明确共享资源看其他使用方，不沿普通动作无限递归，也不把归属当执行顺序。
    const relations = this.graph
      .relations()
      .filter(
        (edge) =>
          direct.includes(edge) ||
          (edge.type !== "part_of" && (shared.has(edge.from) || shared.has(edge.to))),
      );
    const conceptIds = new Set([
      ...ids,
      ...includedIds,
      ...relations.flatMap(({ from, to }) => [from, to]),
    ]);
    const flowConcepts = new Set([
      ...ids,
      ...relations.filter(({ type }) => type !== "part_of").flatMap(({ from, to }) => [from, to]),
    ]);
    const flows = this.graph
      .flows()
      .filter(
        (flow) =>
          flowConcepts.has(flow.scenario) ||
          flow.steps.some(({ concept }) => concept && flowConcepts.has(concept)),
      );
    return {
      scope: "recorded",
      concepts: await Promise.all(
        [...conceptIds].sort().map((id) => this.describeNode(this.graph.requireNode(id))),
      ),
      relations: await Promise.all(relations.map((edge) => this.describeRelation(edge))),
      flows: await Promise.all(flows.map((flow) => this.describeFlow(flow, flowConcepts))),
    };
  }

  public async describeNode(node: BusinessNode): Promise<QueryConcept> {
    return {
      id: node.id,
      kind: node.kind,
      name: node.name,
      summary: node.summary,
      ...(node.notes ? { notes: node.notes } : {}),
      map: (await this.locations.node(node)) ?? { file: node.documentPath },
      anchors: await Promise.all(node.anchors.map((anchor) => this.locations.anchor(anchor))),
    };
  }

  public async flowContext(flow: BusinessFlow): Promise<FlowContext> {
    const navigation = new FlowNavigationService(this.graph);
    return {
      id: flow.id,
      name: flow.name,
      summary: flow.summary,
      scenario: flow.scenario,
      map: await this.flowLocation(flow),
      startsAt: flow.startsAt,
      ...(flow.notes ? { notes: flow.notes } : {}),
      parents: this.graph
        .flows()
        .filter((parent) =>
          parent.steps.some(
            ({ concept }) =>
              concept && navigation.childFlows(concept, parent.id).some(({ id }) => id === flow.id),
          ),
        )
        .map(({ id }) => id),
      steps: await Promise.all(
        flow.steps.map(async (step) => ({
          ...step,
          map: await this.stepLocation(flow, step.id),
          childFlows: step.concept
            ? navigation.childFlows(step.concept, flow.id).map(({ id }) => id)
            : [],
        })),
      ),
      transitions: flow.transitions,
    };
  }

  public async flowLocation(flow: BusinessFlow): Promise<QueryMapReference> {
    return (await this.locations.flow(flow)) ?? { file: flow.documentPath };
  }

  public async stepLocation(flow: BusinessFlow, id: string): Promise<QueryMapReference> {
    return (await this.locations.step(flow, id)) ?? { file: flow.documentPath };
  }

  private async describeRelation(edge: BusinessRelation): Promise<QueryRelation> {
    return {
      from: edge.from,
      type: edge.type,
      to: edge.to,
      summary: edge.summary,
      ...(edge.notes ? { notes: edge.notes } : {}),
      map: (await this.locations.relation(edge)) ?? { file: edge.documentPath },
    };
  }

  private async describeFlow(
    flow: BusinessFlow,
    ids: ReadonlySet<string>,
  ): Promise<QueryFlowReference> {
    return {
      id: flow.id,
      name: flow.name,
      scenario: flow.scenario,
      map: await this.flowLocation(flow),
      references: await Promise.all(
        flow.steps
          .filter(({ concept }) => concept && ids.has(concept))
          .map(async ({ id, concept }) => ({
            concept: concept!,
            step: id,
            map: await this.stepLocation(flow, id),
          })),
      ),
    };
  }
}
