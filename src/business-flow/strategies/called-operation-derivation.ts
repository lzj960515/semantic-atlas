import type {
  StructuralNode,
  StructuralSupportStatus,
} from "../../structural-backend/types.js";
import type { BusinessFlowDraft } from "../business-flow-draft.js";
import type { StructuralFlowCatalog } from "../structural-flow-catalog.js";
import type { SupportedBusinessFramework } from "../types.js";
import { hasBusinessOperationEvidence } from "./strategy-helpers.js";

interface CalledOperationDerivationInput {
  readonly framework: Extract<SupportedBusinessFramework, "nestjs" | "graphql">;
  readonly handler: StructuralNode;
  readonly catalog: StructuralFlowCatalog;
  readonly draft: BusinessFlowDraft;
}

export function deriveCalledOperationBoundaries(input: CalledOperationDerivationInput): void {
  for (const call of input.catalog.outgoing(input.handler.reference.id, "calls")) {
    const target = input.catalog.node(call.to.id);
    const candidates = calledOperationCandidates(target?.name, input.handler, input.catalog);
    addResolutionBoundary(input, target?.name, target, call.support.status, candidates);
  }

  for (const boundary of input.catalog.boundaries.filter((candidate) => (
    candidate.owner.id === input.handler.reference.id && candidate.operation === "calls"
  ))) {
    addResolutionBoundary(input, boundary.target);
  }
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
