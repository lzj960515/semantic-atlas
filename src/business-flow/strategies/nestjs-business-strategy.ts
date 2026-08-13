import type { StructuralNode } from "../../structural-backend/types.js";
import type { BusinessFlowDraft } from "../business-flow-draft.js";
import type { FrameworkBusinessStrategy } from "../framework-business-strategy.js";
import type { StructuralFlowCatalog } from "../structural-flow-catalog.js";
import type { BusinessFlowDerivationOptions } from "../types.js";
import {
  addBusinessNode,
  addBusinessRelation,
  addStructuralRelation,
  nodeKey,
} from "./strategy-helpers.js";

export class NestJsBusinessStrategy implements FrameworkBusinessStrategy {
  derive(
    catalog: StructuralFlowCatalog,
    options: BusinessFlowDerivationOptions,
    draft: BusinessFlowDraft,
  ): void {
    const httpRoutes = catalog.nodes.filter((node) => (
      node.declarationKind === "route" && HTTP_ROUTE.test(node.name)
    ));
    for (const route of httpRoutes) {
      const handler = uniqueExactHandler(route, catalog);
      if (handler === undefined) {
        draft.addBoundary(
          "nestjs",
          "resolve_endpoint_handler",
          `The endpoint ${route.name} does not have one exact normalized handler.`,
          route,
          exactHandlerCandidates(route, catalog).map((node) => node.reference.id),
        );
        continue;
      }
      const interfaceKey = nodeKey(options.capability.key, "interfaces", route);
      const operationKey = nodeKey(options.capability.key, "operations", handler);
      const scenarioKey = nodeKey(options.capability.key, "scenarios", route);

      addBusinessNode(draft, {
        key: interfaceKey,
        kind: "Interface",
        label: route.name,
        summary: `NestJS endpoint ${route.name}.`,
        evidence: route,
      });
      addBusinessNode(draft, {
        key: operationKey,
        kind: "Operation",
        label: handler.name,
        summary: `Handles ${route.name}.`,
        evidence: handler,
      });
      addBusinessNode(draft, {
        key: scenarioKey,
        kind: "Scenario",
        label: route.name,
        summary: `A caller invokes ${route.name}.`,
        evidence: route,
      });
      addBusinessRelation(draft, {
        from: scenarioKey,
        type: "part_of",
        to: options.capability.key,
        evidence: route,
      });
      addBusinessRelation(draft, {
        from: scenarioKey,
        type: "consumes",
        to: interfaceKey,
        evidence: route,
      });
      addBusinessRelation(draft, {
        from: scenarioKey,
        type: "invokes",
        to: operationKey,
        evidence: route,
      });
      addStructuralRelation(draft, {
        from: operationKey,
        type: "realized_by",
        to: handler,
      });
      linkCalledOperations(handler, operationKey, catalog, options, draft);
      linkTests(handler, operationKey, catalog, draft);
    }
  }
}

function linkCalledOperations(
  handler: StructuralNode,
  handlerKey: string,
  catalog: StructuralFlowCatalog,
  options: BusinessFlowDerivationOptions,
  draft: BusinessFlowDraft,
): void {
  for (const call of catalog.outgoing(handler.reference.id, "calls")) {
    const target = catalog.exactTarget(call);
    if (target === undefined || target.reference.id === handler.reference.id) {
      continue;
    }
    const targetKey = nodeKey(options.capability.key, "operations", target);
    addBusinessNode(draft, {
      key: targetKey,
      kind: "Operation",
      label: target.name,
      summary: `Performs ${target.qualifiedName}.`,
      evidence: target,
    });
    addBusinessRelation(draft, {
      from: handlerKey,
      type: "invokes",
      to: targetKey,
      evidence: handler,
    });
    addStructuralRelation(draft, {
      from: targetKey,
      type: "realized_by",
      to: target,
    });
    linkTests(target, targetKey, catalog, draft);
  }
}

function linkTests(
  handler: StructuralNode,
  operationKey: string,
  catalog: StructuralFlowCatalog,
  draft: BusinessFlowDraft,
): void {
  for (const incoming of catalog.incoming(handler.reference.id, "calls")) {
    const caller = catalog.node(incoming.from.id);
    if (caller?.kind === "Test" && incoming.support.status === "exact") {
      addStructuralRelation(draft, {
        from: operationKey,
        type: "verified_by",
        to: caller,
        evidence: caller,
      });
    }
  }
}

function uniqueExactHandler(route: StructuralNode, catalog: StructuralFlowCatalog): StructuralNode | undefined {
  const candidates = exactHandlerCandidates(route, catalog);
  return candidates.length === 1 ? candidates[0] : undefined;
}

function exactHandlerCandidates(route: StructuralNode, catalog: StructuralFlowCatalog): StructuralNode[] {
  return catalog.outgoing(route.reference.id, "references")
    .filter((relation) => relation.support.status === "exact")
    .map((relation) => catalog.node(relation.to.id))
    .filter((node): node is StructuralNode => node !== undefined);
}

const HTTP_ROUTE = /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ALL)\s+/u;
