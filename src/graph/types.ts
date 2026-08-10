import type { z } from "zod";

import type {
  assertionCertaintySchema,
  businessNodeKindSchema,
  businessRelationTypeSchema,
  evidenceSchema,
  knowledgeValiditySchema,
  sourceRangeSchema,
  structuralNodeKindSchema,
  structuralRelationTypeSchema,
} from "../contracts/graph.js";

export type StructuralNodeKind = z.infer<typeof structuralNodeKindSchema>;
export type BusinessNodeKind = z.infer<typeof businessNodeKindSchema>;
export type StructuralRelationType = z.infer<typeof structuralRelationTypeSchema>;
export type BusinessRelationType = z.infer<typeof businessRelationTypeSchema>;
export type AssertionCertainty = z.infer<typeof assertionCertaintySchema>;
export type KnowledgeValidity = z.infer<typeof knowledgeValiditySchema>;
export type SourceRange = z.infer<typeof sourceRangeSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;

export interface GraphSourceLocation {
  readonly file: string;
  readonly range: SourceRange;
  readonly contentHash: string;
}

export interface StructuralNodeInput {
  readonly id: string;
  readonly kind: Exclude<StructuralNodeKind, "UnknownBoundary">;
  readonly label: string;
  readonly locations: readonly GraphSourceLocation[];
}

export interface UnknownBoundaryInput {
  readonly id: string;
  readonly kind: "UnknownBoundary";
  readonly label: string;
  readonly reason: string;
  readonly location: GraphSourceLocation;
  readonly candidates: readonly string[];
}

export type StructuralGraphNodeInput = StructuralNodeInput | UnknownBoundaryInput;

export interface BusinessNodeInput {
  readonly key: string;
  readonly kind: BusinessNodeKind;
  readonly label: string;
  readonly summary: string;
  readonly aliases: readonly string[];
  readonly certainty: AssertionCertainty;
  readonly evidence: readonly Evidence[];
}

export interface StructuralNodeReference {
  readonly domain: "structural";
  readonly id: string;
}

export interface BusinessNodeReference {
  readonly domain: "business";
  readonly key: string;
}

export type GraphNodeReference = StructuralNodeReference | BusinessNodeReference;

export interface StructuralRelationInput {
  readonly from: string;
  readonly type: StructuralRelationType;
  readonly to: string;
}

export interface BusinessRelationSelector {
  readonly from: BusinessNodeReference;
  readonly type: BusinessRelationType;
  readonly to: GraphNodeReference;
}

export interface BusinessRelationInput extends BusinessRelationSelector {
  readonly certainty: AssertionCertainty;
  readonly evidence: readonly Evidence[];
}

export interface BusinessGraphMutation {
  readonly baseSnapshotId: string;
  readonly upsertNodes: readonly BusinessNodeInput[];
  readonly removeNodeKeys: readonly string[];
  readonly upsertRelations: readonly BusinessRelationInput[];
  readonly removeRelations: readonly BusinessRelationSelector[];
}

export interface StructuralGraphNode {
  readonly domain: "structural";
  readonly id: string;
  readonly kind: Exclude<StructuralNodeKind, "UnknownBoundary">;
  readonly label: string;
  readonly snapshotId: string;
  readonly validity: KnowledgeValidity;
  readonly locations: readonly GraphSourceLocation[];
}

export interface UnknownBoundary {
  readonly domain: "structural";
  readonly id: string;
  readonly kind: "UnknownBoundary";
  readonly label: string;
  readonly snapshotId: string;
  readonly validity: "unknown";
  readonly reason: string;
  readonly location: GraphSourceLocation;
  readonly candidates: readonly string[];
}

export interface BusinessGraphNode {
  readonly domain: "business";
  readonly key: string;
  readonly kind: BusinessNodeKind;
  readonly label: string;
  readonly summary: string;
  readonly aliases: readonly string[];
  readonly certainty: AssertionCertainty;
  readonly validity: KnowledgeValidity;
  readonly evidence: readonly Evidence[];
  readonly baseSnapshotId: string;
}

export type GraphNode = StructuralGraphNode | UnknownBoundary | BusinessGraphNode;

export interface StructuralGraphRelation {
  readonly domain: "structural";
  readonly from: StructuralNodeReference;
  readonly type: StructuralRelationType;
  readonly to: StructuralNodeReference;
  readonly snapshotId: string;
  readonly certainty: null;
  readonly validity: KnowledgeValidity;
  readonly evidence: readonly [];
}

export interface BusinessGraphRelation extends BusinessRelationSelector {
  readonly domain: "business";
  readonly baseSnapshotId: string;
  readonly certainty: AssertionCertainty;
  readonly validity: KnowledgeValidity;
  readonly evidence: readonly Evidence[];
}

export type GraphRelation = StructuralGraphRelation | BusinessGraphRelation;
export type TraversalDirection = "incoming" | "outgoing" | "both";

export interface GraphTraversalOptions {
  readonly snapshotId: string;
  readonly maxDepth?: number;
  readonly direction?: TraversalDirection;
  readonly relationTypes?: readonly (StructuralRelationType | BusinessRelationType)[];
}

export interface GraphNeighbor {
  readonly depth: number;
  readonly direction: Exclude<TraversalDirection, "both">;
  readonly relation: GraphRelation;
  readonly node: GraphNode;
}

export interface GraphSearchOptions {
  readonly snapshotId: string;
  readonly limit?: number;
}

export interface GraphSearchResult {
  readonly score: number;
  readonly node: GraphNode;
}

export type EvidenceOwner =
  | {
    readonly type: "node";
    readonly node: BusinessNodeReference;
  }
  | {
    readonly type: "relation";
    readonly relation: BusinessRelationSelector;
  };
