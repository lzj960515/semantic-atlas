import type {
  AssertionCertainty,
  BusinessNodeInput,
  BusinessNodeKind,
  BusinessRelationInput,
  BusinessRelationType,
} from "../../graph/types.js";
import type { StructuralNode } from "../../structural-backend/types.js";
import { businessKeySegment, type BusinessFlowDraft } from "../business-flow-draft.js";
import type { StructuralFlowCatalog } from "../structural-flow-catalog.js";

export function nodeKey(
  capabilityKey: string,
  category: string,
  node: StructuralNode,
): string {
  return `${capabilityKey}/${category}/${businessKeySegment(node.name, node.reference.id)}`;
}

export function addBusinessNode(
  draft: BusinessFlowDraft,
  input: {
    readonly key: string;
    readonly kind: BusinessNodeKind;
    readonly label: string;
    readonly summary: string;
    readonly evidence: StructuralNode;
    readonly aliases?: readonly string[];
    readonly certainty?: AssertionCertainty;
  },
): void {
  const node: BusinessNodeInput = {
    key: input.key,
    kind: input.kind,
    label: input.label,
    summary: input.summary,
    aliases: [...(input.aliases ?? [])],
    certainty: input.certainty ?? "inferred",
    evidence: [draft.evidenceFor(input.evidence)],
  };
  draft.addNode(node);
}

export function addBusinessRelation(
  draft: BusinessFlowDraft,
  input: {
    readonly from: string;
    readonly type: Exclude<BusinessRelationType, "realized_by" | "verified_by">;
    readonly to: string;
    readonly evidence: StructuralNode;
    readonly certainty?: AssertionCertainty;
  },
): void {
  const relation: BusinessRelationInput = {
    from: { domain: "business", key: input.from },
    type: input.type,
    to: { domain: "business", key: input.to },
    certainty: input.certainty ?? "inferred",
    evidence: [draft.evidenceFor(input.evidence)],
  };
  draft.addRelation(relation);
}

export function addStructuralRelation(
  draft: BusinessFlowDraft,
  input: {
    readonly from: string;
    readonly type: "realized_by" | "verified_by";
    readonly to: StructuralNode;
    readonly evidence?: StructuralNode;
    readonly certainty?: AssertionCertainty;
  },
): void {
  const relation: BusinessRelationInput = {
    from: { domain: "business", key: input.from },
    type: input.type,
    to: { domain: "structural", id: input.to.reference.id },
    certainty: input.certainty ?? "inferred",
    evidence: [draft.evidenceFor(input.evidence ?? input.to)],
  };
  draft.addRelation(relation);
}

export function decoratorNames(node: StructuralNode): readonly string[] {
  return node.decorators.map((decorator) => (
    decorator.replace(/^@/u, "").split("(", 1)[0]!.split(".").at(-1)!
  ));
}

export function hasDecorator(node: StructuralNode, names: readonly string[]): boolean {
  const decorators = decoratorNames(node);
  return names.some((name) => decorators.includes(name));
}

export function hasBusinessOperationEvidence(
  node: StructuralNode,
  catalog: StructuralFlowCatalog,
): boolean {
  if (hasDecorator(node, ["CommandHandler", "EventsHandler", "QueryHandler", "Resolver"])) {
    return true;
  }
  return catalog.isRoot(node.reference.id);
}
