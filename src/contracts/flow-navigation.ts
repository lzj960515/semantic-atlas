import type {
  BusinessFlowStepDefinition,
  BusinessFlowTransitionDefinition,
  BusinessNode,
} from "./map.js";

export interface FlowReference {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
}

export interface FlowDirectoryEntry extends FlowReference {
  readonly childFlows: readonly string[];
}

/** 文件关系派生的只读目录，供人和 AI 使用同一套业务入口。 */
export interface FlowNavigation {
  readonly roots: readonly string[];
  readonly flows: readonly FlowDirectoryEntry[];
}

export interface FlowStepContext extends Omit<BusinessFlowStepDefinition, "concept"> {
  readonly concept?: BusinessNode;
  readonly childFlows: readonly FlowReference[];
}

export interface FlowContext extends FlowReference {
  readonly scenario: BusinessNode;
  readonly documentPath: string;
  readonly startsAt: string;
  readonly notes?: string;
  readonly parents: readonly FlowReference[];
  readonly steps: readonly FlowStepContext[];
  readonly transitions: readonly BusinessFlowTransitionDefinition[];
}

export type FlowsData =
  | { readonly navigation: FlowNavigation }
  | { readonly selected: FlowContext };

export interface FlowSearchResult extends FlowReference {
  readonly scenarioId: string;
  readonly rank: number;
  readonly score: number;
  readonly matchedFields: readonly ("id" | "name" | "alias" | "summary" | "step")[];
  readonly matchedSteps: readonly { readonly id: string; readonly name: string }[];
}

export interface FlowSearchData {
  readonly query: string;
  readonly target: "flows";
  readonly results: readonly FlowSearchResult[];
}
