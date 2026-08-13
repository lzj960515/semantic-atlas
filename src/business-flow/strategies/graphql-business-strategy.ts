import type { StructuralNode } from "../../structural-backend/types.js";
import type { BusinessFlowDraft } from "../business-flow-draft.js";
import type { FrameworkBusinessStrategy } from "../framework-business-strategy.js";
import type { StructuralFlowCatalog } from "../structural-flow-catalog.js";
import type { BusinessFlowDerivationOptions } from "../types.js";
import {
  addBusinessNode,
  addBusinessRelation,
  addStructuralRelation,
  hasBusinessOperationEvidence,
  nodeKey,
} from "./strategy-helpers.js";

export class GraphqlBusinessStrategy implements FrameworkBusinessStrategy {
  derive(
    catalog: StructuralFlowCatalog,
    options: BusinessFlowDerivationOptions,
    draft: BusinessFlowDraft,
  ): void {
    for (const route of catalog.nodes.filter((node) => (
      node.declarationKind === "route" && GRAPHQL_ROUTE.test(node.name)
    ))) {
      const candidates = catalog.outgoing(route.reference.id, "references")
        .filter((relation) => relation.support.status === "exact")
        .map((relation) => catalog.node(relation.to.id))
        .filter((node): node is StructuralNode => node !== undefined);
      if (candidates.length !== 1) {
        draft.addBoundary(
          "graphql",
          "resolve_operation_handler",
          `The GraphQL operation ${route.name} does not have one exact normalized resolver.`,
          route,
          candidates.map((node) => node.reference.id),
        );
        continue;
      }
      const handler = candidates[0]!;
      const interfaceKey = nodeKey(options.capability.key, "interfaces", route);
      const operationKey = nodeKey(options.capability.key, "operations", handler);
      const scenarioKey = nodeKey(options.capability.key, "scenarios", route);
      addBusinessNode(draft, {
        key: interfaceKey,
        kind: "Interface",
        label: route.name,
        summary: `GraphQL operation ${route.name}.`,
        evidence: route,
      });
      addBusinessNode(draft, {
        key: operationKey,
        kind: "Operation",
        label: handler.name,
        summary: `Resolves ${route.name}.`,
        evidence: handler,
      });
      addBusinessNode(draft, {
        key: scenarioKey,
        kind: "Scenario",
        label: route.name,
        summary: `A GraphQL caller invokes ${route.name}.`,
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

      for (const call of catalog.outgoing(handler.reference.id, "calls")) {
        const target = catalog.exactTarget(call);
        if (
          target === undefined
          || target.reference.id === handler.reference.id
          || !hasBusinessOperationEvidence(target, catalog)
        ) {
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
          from: operationKey,
          type: "invokes",
          to: targetKey,
          evidence: handler,
        });
        addStructuralRelation(draft, {
          from: targetKey,
          type: "realized_by",
          to: target,
        });
      }
    }
  }
}

const GRAPHQL_ROUTE = /^(?:QUERY|MUTATION|SUBSCRIPTION)\s+/u;
