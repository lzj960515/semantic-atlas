import type { GraphPatchV1 } from "../contracts/graph.js";
import type {
  AssertionCertainty,
  GraphSourceLocation,
  StructuralNodeReference,
} from "../graph/types.js";
import type { StructuralReference } from "../structural-backend/types.js";

export type SupportedBusinessFramework = "nestjs" | "graphql" | "typeorm" | "bullmq";

export interface BusinessCapabilityDefinition {
  readonly key: string;
  readonly label: string;
  readonly summary: string;
  readonly aliases?: readonly string[];
  readonly evidence?: StructuralReference;
}

export interface VerifiedMessageFlow {
  readonly channel: string;
  readonly producer: StructuralReference;
  readonly consumer: StructuralReference;
  readonly certainty?: AssertionCertainty;
}

export interface VerifiedInvariant {
  readonly key: string;
  readonly label: string;
  readonly summary: string;
  readonly evidence: StructuralReference;
  readonly constrains: readonly StructuralReference[];
  readonly certainty?: AssertionCertainty;
}

export interface BusinessFlowDerivationOptions {
  readonly capability: BusinessCapabilityDefinition;
  readonly messageFlows?: readonly VerifiedMessageFlow[];
  readonly invariants?: readonly VerifiedInvariant[];
}

export interface BusinessFlowBoundary {
  readonly id: string;
  readonly framework: SupportedBusinessFramework;
  readonly operation: string;
  readonly reason: string;
  readonly owner: StructuralNodeReference;
  readonly location: GraphSourceLocation;
  readonly candidates: readonly string[];
  readonly resolution: "unresolved" | "source_fallback";
}

export interface DerivedBusinessFlow {
  readonly patch: GraphPatchV1;
  readonly boundaries: readonly BusinessFlowBoundary[];
}
