import type { BusinessGraph } from "../map/business-graph.js";
import { FlowNavigationService } from "../query/flow-navigation-service.js";

export function conceptDetailLinks(graph: BusinessGraph, conceptId: string, currentFlowId: string) {
  return new FlowNavigationService(graph).childFlows(conceptId, currentFlowId);
}

export function orderBusinessFlows(graph: BusinessGraph) {
  return new FlowNavigationService(graph).orderedFlows();
}
