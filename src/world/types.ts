import type {
  StructuralFileChanges,
  StructuralIndexState,
  StructuralNode,
} from "../structural-backend/types.js";

export type WorldSnapshotStatus = "missing" | "building" | "current" | "failed";

export interface WorldSnapshotState {
  readonly status: WorldSnapshotStatus;
  readonly currentSnapshotId: string | null;
  readonly targetSnapshotId: string | null;
  readonly backendVersion: string | null;
  readonly extractionVersion: number | null;
  readonly failureMessage: string | null;
  readonly startedAt: string | null;
  readonly publishedAt: string | null;
  readonly updatedAt: string;
}

export interface StructuralLocator {
  readonly structuralReference: string;
  readonly file: string;
  readonly qualifiedSymbol: string | null;
  readonly structuralKind: string | null;
  readonly range: {
    readonly start: { readonly line: number; readonly column: number };
    readonly end: { readonly line: number; readonly column: number };
  };
  readonly backendLocator?: string;
}

export interface EvidenceLocator extends StructuralLocator {
  readonly contentHash: string;
}

export type StructuralTargetLocator = StructuralLocator;

export interface StructuralEvidenceResolver {
  getNode(reference: string): StructuralNode | undefined;
  findCandidates(locator: StructuralLocator): readonly StructuralNode[];
  backendLocator(node: StructuralNode): string | undefined;
}

export interface IndexedSourceFile {
  readonly path: string;
  readonly contentHash: string;
}

export interface WorldWriteCoordinator {
  withWorldWriteLock<T>(
    operation: (
      state: StructuralIndexState,
      resolver: StructuralEvidenceResolver,
    ) => Promise<T>,
  ): Promise<T>;
}

export interface SemanticChangeMetadata {
  readonly fromSnapshotId: string | null;
  readonly toSnapshotId: string;
  readonly structural: StructuralFileChanges;
  readonly staleAssertions: readonly string[];
}

export interface SemanticGraphChanges {
  readonly fromSnapshotId: string;
  readonly toSnapshotId: string;
  readonly nodes: {
    readonly added: readonly string[];
    readonly changed: readonly string[];
    readonly removed: readonly string[];
  };
  readonly relations: {
    readonly added: readonly string[];
    readonly changed: readonly string[];
    readonly removed: readonly string[];
  };
  readonly staleAssertions: readonly string[];
}

export interface SemanticGraphChangeOptions {
  readonly fromSnapshotId?: string;
  readonly toSnapshotId?: string;
}
