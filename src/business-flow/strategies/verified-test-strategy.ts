import type { BusinessFlowDraft } from "../business-flow-draft.js";
import type { StructuralFlowCatalog } from "../structural-flow-catalog.js";
import type { BusinessFlowDerivationOptions } from "../types.js";
import {
  addBusinessNode,
  addStructuralRelation,
  nodeKey,
} from "./strategy-helpers.js";

export function deriveVerifiedTests(
  catalog: StructuralFlowCatalog,
  options: BusinessFlowDerivationOptions,
  draft: BusinessFlowDraft,
): void {
  for (const verification of options.verifications ?? []) {
    const operation = catalog.node(verification.operation.id);
    const test = catalog.node(verification.test.id);
    if (operation === undefined || test === undefined) {
      throw new Error("Verified test flow references missing structural evidence");
    }
    const operationKey = nodeKey(options.capability.key, "operations", operation);
    addBusinessNode(draft, {
      key: operationKey,
      kind: "Operation",
      label: operation.name,
      summary: `Performs ${operation.qualifiedName}.`,
      evidence: operation,
      certainty: verification.certainty ?? "inferred",
    });
    addStructuralRelation(draft, {
      from: operationKey,
      type: "verified_by",
      to: test,
      evidence: test,
      certainty: verification.certainty ?? "inferred",
    });
  }
}
