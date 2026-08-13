import type {
  BusinessRelationInput,
  SourceRange,
  StructuralNodeKind,
} from "../graph/types.js";

const structuralTargetBinding = Symbol("structuralTargetBinding");

export interface StructuralTargetBinding {
  readonly structuralReference: string;
  readonly file: string;
  readonly qualifiedSymbol: string | null;
  readonly structuralKind: Exclude<StructuralNodeKind, "UnknownBoundary"> | null;
  readonly range: SourceRange;
  readonly atlasSnapshotId: string;
  readonly backendVersion: string | null;
  readonly backendLocator: string | null;
}

type BoundBusinessRelation = BusinessRelationInput & {
  readonly [structuralTargetBinding]?: StructuralTargetBinding;
};

export function bindStructuralTarget(
  relation: BusinessRelationInput,
  binding: StructuralTargetBinding,
): BusinessRelationInput {
  const boundRelation: BoundBusinessRelation = {
    ...relation,
    [structuralTargetBinding]: binding,
  };
  return boundRelation;
}

export function readStructuralTargetBinding(
  relation: BusinessRelationInput,
): StructuralTargetBinding | undefined {
  return (relation as BoundBusinessRelation)[structuralTargetBinding];
}
