import type { FlowNavigation, FlowReference } from "../contracts/flow-navigation.js";
import type { BusinessFlow } from "../contracts/map.js";
import type { BusinessGraph } from "../map/business-graph.js";

/** 场景自有流程构成阅读层次，不从归属或词面相似推断业务先后。 */
export class FlowNavigationService {
  private readonly flows: readonly BusinessFlow[];
  private readonly children: ReadonlyMap<string, readonly BusinessFlow[]>;

  public constructor(private readonly graph: BusinessGraph) {
    this.flows = [...graph.flows()].sort((left, right) => left.id.localeCompare(right.id));
    this.children = new Map(this.flows.map((flow) => [flow.id, this.childrenOfFlow(flow)]));
  }

  public childFlows(conceptId: string, currentFlowId: string): readonly FlowReference[] {
    return this.flows
      .filter((flow) => flow.scenario === conceptId && flow.id !== currentFlowId)
      .map(reference);
  }

  public directory(): FlowNavigation {
    const referenced = new Set([...this.children.values()].flat().map(({ id }) => id));
    const roots = this.flows.filter(({ id }) => !referenced.has(id)).map(({ id }) => id);
    const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      for (const child of this.children.get(id) ?? []) visit(child.id);
    };
    for (const id of roots) visit(id);
    // 互相引用的流程仍是有效资料；为独立的循环分量保留一个目录入口。
    for (const flow of this.flows) {
      if (visited.has(flow.id)) continue;
      roots.push(flow.id);
      visit(flow.id);
    }
    return {
      roots,
      flows: this.flows.map((flow) => ({
        ...reference(flow),
        childFlows: this.children.get(flow.id)!.map(({ id }) => id),
      })),
    };
  }

  public orderedFlows(): readonly BusinessFlow[] {
    const ordered: BusinessFlow[] = [];
    const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      ordered.push(this.flows.find((flow) => flow.id === id)!);
      for (const child of this.children.get(id) ?? []) visit(child.id);
    };
    for (const id of this.directory().roots) visit(id);
    return ordered;
  }

  private childrenOfFlow(flow: BusinessFlow): readonly BusinessFlow[] {
    const unique = new Map<string, BusinessFlow>();
    for (const step of flow.steps) {
      if (!step.concept) continue;
      for (const child of this.flows) {
        if (child.scenario === step.concept && child.id !== flow.id) unique.set(child.id, child);
      }
    }
    return [...unique.values()];
  }
}

function reference(flow: BusinessFlow): FlowReference {
  return { id: flow.id, name: flow.name, summary: flow.summary };
}
