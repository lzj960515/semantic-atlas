import type { FlowSearchResult } from "../contracts/flow-navigation.js";
import type { BusinessGraph } from "../map/business-graph.js";
import type { BusinessNode } from "../contracts/map.js";
import { ConceptSearchService } from "./concept-search-service.js";

/** 搜索业务名称、别名、步骤与说明，不使用代码关键词或推断执行顺序。 */
export class FlowSearchService {
  public constructor(private readonly graph: BusinessGraph) {}

  public search(query: string): readonly FlowSearchResult[] {
    const entries = this.graph.flows().flatMap((flow) => {
      const scenario = this.graph.requireNode(flow.scenario);
      return [
        {
          flow,
          step: undefined,
          record: { ...scenario, id: flow.id, name: flow.name, summary: flow.summary },
        },
        ...flow.steps.map((step) => {
          const concept = step.concept ? this.graph.requireNode(step.concept) : undefined;
          return {
            flow,
            step,
            record: {
              ...scenario,
              id: `${flow.id}::${step.id}`,
              name: step.name,
              summary: step.summary,
              aliases: concept ? [concept.name, ...concept.aliases] : [],
            } satisfies BusinessNode,
          };
        }),
      ];
    });
    const entryById = new Map(entries.map((entry) => [entry.record.id, entry]));
    const matches = new ConceptSearchService(entries.map(({ record }) => record)).search(
      query,
      entries.length,
    );
    const byFlow = new Map<string, FlowSearchResult>();
    for (const match of matches) {
      const { flow, step } = entryById.get(match.id)!;
      // 同名的专属流程优先于在上层提及它的步骤。
      const score = Math.round(match.score * (step ? 0.9 : 1) * 1000) / 1000;
      const previous = byFlow.get(flow.id);
      if (previous && previous.score > score) continue;
      const tied = previous?.score === score ? previous : undefined;
      byFlow.set(flow.id, {
        id: flow.id,
        name: flow.name,
        summary: flow.summary,
        scenarioId: flow.scenario,
        rank: 0,
        score,
        matchedFields: [
          ...new Set([
            ...(tied?.matchedFields ?? []),
            ...(step ? ["step" as const] : match.matchedFields),
          ]),
        ],
        matchedSteps: [
          ...(tied?.matchedSteps ?? []),
          ...(step ? [{ id: step.id, name: step.name }] : []),
        ],
      });
    }
    return [...byFlow.values()]
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
      .slice(0, 5)
      .map((result, index) => ({ ...result, rank: index + 1 }));
  }
}
