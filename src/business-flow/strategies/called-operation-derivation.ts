import type {
  StructuralNode,
  StructuralSupportStatus,
} from "../../structural-backend/types.js";
import type { BusinessFlowDraft } from "../business-flow-draft.js";
import type { StructuralFlowCatalog } from "../structural-flow-catalog.js";
import type {
  BusinessFlowDerivationOptions,
  SupportedBusinessFramework,
} from "../types.js";
import {
  addBusinessNode,
  addBusinessRelation,
  addStructuralRelation,
  hasBusinessOperationEvidence,
  nodeKey,
} from "./strategy-helpers.js";

interface CalledOperationDerivationInput {
  readonly framework: Extract<SupportedBusinessFramework, "nestjs" | "graphql">;
  readonly handler: StructuralNode;
  readonly handlerKey: string;
  readonly catalog: StructuralFlowCatalog;
  readonly options: BusinessFlowDerivationOptions;
  readonly draft: BusinessFlowDraft;
}

export function deriveCalledBusinessOperations(input: CalledOperationDerivationInput): void {
  for (const call of input.catalog.outgoing(input.handler.reference.id, "calls")) {
    const target = input.catalog.node(call.to.id);
    const candidates = calledOperationCandidates(target?.name, input.handler, input.catalog);
    if (
      call.support.status === "exact"
      && target !== undefined
      && target.reference.id !== input.handler.reference.id
      && hasBusinessOperationEvidence(target, input.catalog)
      && hasUniqueReceiverBinding(target, candidates, input.handler, input.catalog)
    ) {
      addCalledOperation(input, target);
      continue;
    }
    addResolutionBoundary(input, target?.name, target, call.support.status, candidates);
  }

  for (const boundary of input.catalog.boundaries.filter((candidate) => (
    candidate.owner.id === input.handler.reference.id && candidate.operation === "calls"
  ))) {
    addResolutionBoundary(input, boundary.target);
  }
}

function addCalledOperation(
  input: CalledOperationDerivationInput,
  target: StructuralNode,
): void {
  const targetKey = nodeKey(input.options.capability.key, "operations", target);
  addBusinessNode(input.draft, {
    key: targetKey,
    kind: "Operation",
    label: target.name,
    summary: `Performs ${target.qualifiedName}.`,
    evidence: target,
  });
  addBusinessRelation(input.draft, {
    from: input.handlerKey,
    type: "invokes",
    to: targetKey,
    evidence: input.handler,
  });
  addStructuralRelation(input.draft, {
    from: targetKey,
    type: "realized_by",
    to: target,
  });
}

function addResolutionBoundary(
  input: CalledOperationDerivationInput,
  calledName: string | undefined,
  target?: StructuralNode,
  support?: StructuralSupportStatus,
  candidates: readonly StructuralNode[] = calledOperationCandidates(
    calledName,
    input.handler,
    input.catalog,
  ),
): void {
  if (candidates.length === 0) {
    return;
  }
  input.draft.addBoundary(
    input.framework,
    "resolve_called_operation",
    calledOperationResolutionReason(input.handler, calledName, target, support),
    input.handler,
    candidates.map((candidate) => candidate.reference.id),
  );
}

function calledOperationCandidates(
  name: string | undefined,
  handler: StructuralNode,
  catalog: StructuralFlowCatalog,
): StructuralNode[] {
  if (name === undefined) {
    return [];
  }
  return catalog.nodes.filter((node) => (
    node.reference.id !== handler.reference.id
    && node.name === name
    && (node.declarationKind === "method" || node.declarationKind === "function")
    && hasBusinessOperationEvidence(node, catalog)
  ));
}

function hasUniqueReceiverBinding(
  target: StructuralNode,
  candidates: readonly StructuralNode[],
  handler: StructuralNode,
  catalog: StructuralFlowCatalog,
): boolean {
  const boundCandidates = candidates.filter((candidate) => (
    hasReceiverBinding(handler, candidate, catalog)
  ));
  return boundCandidates.length === 1
    && boundCandidates[0]!.reference.id === target.reference.id;
}

function hasReceiverBinding(
  handler: StructuralNode,
  target: StructuralNode,
  catalog: StructuralFlowCatalog,
): boolean {
  const handlerOwner = uniqueDeclaringOwner(handler, catalog);
  const targetOwner = uniqueDeclaringOwner(target, catalog);
  if (handlerOwner === undefined || targetOwner === undefined) {
    return hasExactFileImport(handler.path, targetOwner ?? target, catalog);
  }
  if (handlerOwner.reference.id === targetOwner.reference.id) {
    return true;
  }
  return catalog.contextOutgoing(handlerOwner.reference.id, "contains")
    .filter((relation) => relation.support.status === "exact")
    .map((relation) => catalog.contextNode(relation.to.id))
    .filter((node): node is StructuralNode => node?.name === "constructor")
    .some((constructor) => catalog.contextOutgoing(constructor.reference.id, "references")
      .some((relation) => (
        relation.support.status === "exact" && relation.to.id === targetOwner.reference.id
      )));
}

function uniqueDeclaringOwner(
  node: StructuralNode,
  catalog: StructuralFlowCatalog,
): StructuralNode | undefined {
  const owners = catalog.contextIncoming(node.reference.id, "contains")
    .filter((relation) => relation.support.status === "exact")
    .map((relation) => catalog.contextNode(relation.from.id))
    .filter((candidate): candidate is StructuralNode => candidate?.declarationKind === "class");
  return owners.length === 1 ? owners[0] : undefined;
}

function hasExactFileImport(
  handlerPath: string,
  target: StructuralNode,
  catalog: StructuralFlowCatalog,
): boolean {
  return catalog.contextNodes(handlerPath)
    .filter((node) => node.declarationKind === "file")
    .some((file) => catalog.contextOutgoing(file.reference.id, "imports")
      .some((relation) => (
        relation.support.status === "exact" && relation.to.id === target.reference.id
      )));
}

function calledOperationResolutionReason(
  handler: StructuralNode,
  calledName: string | undefined,
  target: StructuralNode | undefined,
  support: StructuralSupportStatus | undefined,
): string {
  if (target === undefined || support === undefined) {
    return `The call ${calledName ?? "from the framework handler"} in ${handler.qualifiedName} is unresolved and requires source inspection.`;
  }
  return `The ${support} call target ${target.qualifiedName} cannot be uniquely tied to an owned business operation from ${handler.qualifiedName}.`;
}
