import type { BusinessFlowStepDefinition, BusinessFlowTransitionDefinition } from "./map.js";
import type { BusinessQuerySummary, QueryMapReference } from "./query-context.js";

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

export interface FlowStepContext extends BusinessFlowStepDefinition {
  readonly map: QueryMapReference;
  readonly childFlows: readonly string[];
}

export interface FlowContext extends FlowReference {
  readonly scenario: string;
  readonly map: QueryMapReference;
  readonly startsAt: readonly string[];
  readonly notes?: string;
  readonly parents: readonly string[];
  readonly steps: readonly FlowStepContext[];
  readonly transitions: readonly BusinessFlowTransitionDefinition[];
}

export type FlowsData =
  | { readonly navigation: FlowNavigation }
  | ({ readonly selected: FlowContext } & BusinessQuerySummary);

export interface FlowSearchResult extends FlowReference {
  readonly scenarioId: string;
  readonly rank: number;
  readonly score: number;
  readonly matchedFields: readonly ("id" | "name" | "alias" | "summary" | "step")[];
  readonly matchedSteps: readonly { readonly id: string; readonly name: string }[];
}

export interface FlowSearchData extends BusinessQuerySummary {
  readonly query: string;
  readonly contextFor?: string;
  readonly target: "flows";
  readonly results: readonly (Omit<FlowSearchResult, "matchedSteps"> & {
    readonly map: QueryMapReference;
    readonly matchedSteps: readonly {
      readonly id: string;
      readonly name: string;
      readonly concept?: string;
      readonly map: QueryMapReference;
    }[];
  })[];
}
