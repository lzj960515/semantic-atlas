import type { BusinessFlowDraft } from "../business-flow-draft.js";
import type { StructuralFlowCatalog } from "../structural-flow-catalog.js";
import type { BusinessFlowDerivationOptions } from "../types.js";
import {
  addBusinessNode,
  addBusinessRelation,
  nodeKey,
} from "./strategy-helpers.js";

export function deriveVerifiedInvariants(
  catalog: StructuralFlowCatalog,
  options: BusinessFlowDerivationOptions,
  draft: BusinessFlowDraft,
): void {
  for (const invariant of options.invariants ?? []) {
    const evidence = catalog.node(invariant.evidence.id);
    if (evidence === undefined) {
      throw new Error(`Verified invariant ${invariant.key} references missing evidence`);
    }
    addBusinessNode(draft, {
      key: invariant.key,
      kind: "Invariant",
      label: invariant.label,
      summary: invariant.summary,
      evidence,
      certainty: invariant.certainty ?? "inferred",
    });
    for (const constrainedReference of invariant.constrains) {
      const constrained = catalog.node(constrainedReference.id);
      if (constrained === undefined) {
        throw new Error(`Verified invariant ${invariant.key} has a missing target`);
      }
      const constrainedKey = nodeKey(options.capability.key, "operations", constrained);
      addBusinessNode(draft, {
        key: constrainedKey,
        kind: "Operation",
        label: constrained.name,
        summary: `Performs ${constrained.qualifiedName}.`,
        evidence: constrained,
      });
      addBusinessRelation(draft, {
        from: constrainedKey,
        type: "constrained_by",
        to: invariant.key,
        evidence,
        certainty: invariant.certainty ?? "inferred",
      });
    }
  }
}
