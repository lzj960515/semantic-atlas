import type {
  BusinessGraphView,
  BusinessMapView,
  GraphSearchResult,
  BusinessGraphNode,
} from "../../graph/types.js";
import type { RepositoryLanguageSupport } from "../../repository/repository-language-support.js";
import type { StructuralIndexState } from "../../structural-backend/types.js";
import type { WorldSnapshotStatus } from "../../world/types.js";

export type WebProjectBranch = "main" | "master";
export type WebProjectFreshness = "current" | "stale" | "missing";

export interface WebProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly root: string;
  readonly branch: WebProjectBranch;
  readonly headCommit: string;
  readonly snapshotId: string | null;
  readonly freshness: WebProjectFreshness;
  readonly status: WorldSnapshotStatus;
}

export interface WebProjectStatus {
  readonly project: WebProjectSummary;
  readonly currentRevision: {
    readonly headCommit: string;
    readonly changes: {
      readonly staged: number;
      readonly unstaged: number;
      readonly untracked: number;
    };
  };
  readonly languages: readonly RepositoryLanguageSupport[];
  readonly backend: Pick<
    StructuralIndexState,
    "backendVersion" | "completeness" | "extractionVersion" | "indexedAt"
  >;
  readonly warnings: readonly {
    readonly code: string;
    readonly message: string;
  }[];
}

export interface WebBusinessSearch {
  readonly query: string;
  readonly limit: number;
  readonly results: readonly GraphSearchResult<BusinessGraphNode>[];
}

export type WebBusinessMap = BusinessMapView;
export type WebBusinessNode = BusinessGraphView;
