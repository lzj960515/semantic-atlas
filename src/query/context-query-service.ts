import type { ContextData, ContextRelation } from "../contracts/cli.js";
import type { BusinessRelation } from "../contracts/map.js";
import { BusinessGraph, type ConceptResolution } from "../map/business-graph.js";

export type ContextQueryResult =
  | {
      readonly found: true;
      readonly data: ContextData;
    }
  | Exclude<ConceptResolution, { readonly found: true }>;

export class ContextQueryService {
  public constructor(private readonly graph: BusinessGraph) {}

  public query(selector: string): ContextQueryResult {
    const resolution = this.graph.resolve(selector);
    if (!resolution.found) return resolution;

    const selected = resolution.node;
    return {
      found: true,
      data: {
        selector,
        matchedBy: resolution.matchedBy,
        selected,
        ancestors: this.graph.ancestors(selected.id),
        children: this.graph.children(selected.id),
        incoming: Object.freeze(
          this.graph.incoming(selected.id).map((relation) => this.describeRelation(relation)),
        ),
        outgoing: Object.freeze(
          this.graph.outgoing(selected.id).map((relation) => this.describeRelation(relation)),
        ),
      },
    };
  }

  private describeRelation(relation: BusinessRelation): ContextRelation {
    return {
      type: relation.type,
      summary: relation.summary,
      ...(relation.notes ? { notes: relation.notes } : {}),
      documentId: relation.documentId,
      from: this.graph.requireNode(relation.from),
      to: this.graph.requireNode(relation.to),
    };
  }
}
