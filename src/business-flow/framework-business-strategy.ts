import type { BusinessFlowDraft } from "./business-flow-draft.js";
import type { StructuralFlowCatalog } from "./structural-flow-catalog.js";
import type { BusinessFlowDerivationOptions } from "./types.js";

export interface FrameworkBusinessStrategy {
  derive(
    catalog: StructuralFlowCatalog,
    options: BusinessFlowDerivationOptions,
    draft: BusinessFlowDraft,
  ): void;
}
