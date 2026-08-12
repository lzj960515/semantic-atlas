export const STRUCTURAL_BACKEND_VERSION = "1.5.0";

export type StructuralProjectionCompleteness = "missing" | "complete" | "incomplete";
export type StructuralSupportStatus = "exact" | "inferred" | "unresolved" | "unsupported";
export type StructuralProvenance = "tree-sitter" | "scip" | "heuristic" | "backend";
export type BackendStructuralNodeKind = "Module" | "File" | "Symbol" | "Test";
export type BackendStructuralRelationType =
  | "contains"
  | "declares"
  | "imports"
  | "exports"
  | "references"
  | "calls"
  | "extends"
  | "implements"
  | "instantiates"
  | "decorated_by";

export interface StructuralSupport {
  readonly status: StructuralSupportStatus;
  readonly provenance: StructuralProvenance;
}

export interface StructuralReference {
  readonly id: string;
}

export interface StructuralSourcePosition {
  readonly line: number;
  readonly column: number;
}

export interface StructuralSourceRange {
  readonly start: StructuralSourcePosition;
  readonly end: StructuralSourcePosition;
}

export interface StructuralNode {
  readonly reference: StructuralReference;
  readonly kind: BackendStructuralNodeKind;
  readonly name: string;
  readonly qualifiedName: string;
  readonly path: string;
  readonly language: string;
  readonly range: StructuralSourceRange;
  readonly support: StructuralSupport;
}

export interface StructuralRelation {
  readonly from: StructuralReference;
  readonly type: BackendStructuralRelationType;
  readonly to: StructuralReference;
  readonly support: StructuralSupport;
  readonly location?: {
    readonly path: string;
    readonly position: StructuralSourcePosition;
  };
}

export interface StructuralUnknownBoundary {
  readonly reference: StructuralReference;
  readonly kind: "UnknownBoundary";
  readonly owner: StructuralReference;
  readonly operation: string;
  readonly reason: string;
  readonly path?: string;
  readonly position?: StructuralSourcePosition;
  readonly candidates: readonly string[];
  readonly support: StructuralSupport;
}

export interface StructuralDiagnostic {
  readonly code: "STRUCTURAL_BACKEND_FAILURE" | "STRUCTURAL_INDEX_INCOMPLETE";
  readonly message: string;
}

export interface StructuralIndexState {
  readonly completeness: StructuralProjectionCompleteness;
  readonly databasePath: string;
  readonly backendVersion: string;
  readonly extractionVersion: number | null;
  readonly indexedAt: string | null;
  readonly diagnostics: readonly StructuralDiagnostic[];
}

export interface StructuralBuildCounts {
  readonly filesDiscovered: number;
  readonly filesIndexed: number;
  readonly filesSkipped: number;
  readonly filesErrored: number;
  readonly nodes: number;
  readonly relations: number;
}

export interface StructuralFileChanges {
  readonly added: readonly string[];
  readonly modified: readonly string[];
  readonly removed: readonly string[];
}

export interface StructuralBuildResult extends StructuralIndexState {
  readonly mode: "initial" | "full" | "incremental";
  readonly counts: StructuralBuildCounts;
  readonly changes: StructuralFileChanges;
  readonly boundaries: readonly StructuralUnknownBoundary[];
}

export interface StructuralSearchQuery {
  readonly query: string;
  readonly limit?: number;
}

export interface StructuralSearchResult {
  readonly score: number;
  readonly node: StructuralNode;
}

export interface StructuralTraversalQuery {
  readonly reference: StructuralReference;
  readonly maxDepth?: number;
  readonly direction?: "incoming" | "outgoing" | "both";
  readonly relationTypes?: readonly BackendStructuralRelationType[];
}

export interface StructuralTraversalResult {
  readonly roots: readonly StructuralReference[];
  readonly nodes: readonly StructuralNode[];
  readonly relations: readonly StructuralRelation[];
  readonly boundaries: readonly StructuralUnknownBoundary[];
}

export interface StructuralCallRelation {
  readonly node: StructuralNode;
  readonly relation: StructuralRelation;
}

export interface StructuralFileDependency {
  readonly path: string;
  readonly support: StructuralSupport;
}

export interface StructuralIndexBackend {
  inspect(): Promise<StructuralIndexState>;
  build(): Promise<StructuralBuildResult>;
  sync(): Promise<StructuralBuildResult>;
  search(query: StructuralSearchQuery): Promise<readonly StructuralSearchResult[]>;
  getNode(reference: StructuralReference): Promise<StructuralNode | undefined>;
  traverse(query: StructuralTraversalQuery): Promise<StructuralTraversalResult>;
  getCallers(reference: StructuralReference): Promise<readonly StructuralCallRelation[]>;
  getCallees(reference: StructuralReference): Promise<readonly StructuralCallRelation[]>;
  getFileDependencies(path: string): Promise<readonly StructuralFileDependency[]>;
}

export class StructuralBackendError extends Error {
  readonly code: "STRUCTURAL_INDEX_MISSING" | "STRUCTURAL_INDEX_INCOMPLETE" | "STRUCTURAL_QUERY_FAILED";
  readonly cause: unknown;

  constructor(
    code: StructuralBackendError["code"],
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "StructuralBackendError";
    this.code = code;
    this.cause = cause;
  }
}
