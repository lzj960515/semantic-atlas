import { GraphStore } from "../../graph/graph-store.js";
import {
  inspectRepositoryLanguages,
} from "../../repository/repository-language-support.js";
import { CodeGraphStructuralBackend } from "../../structural-backend/codegraph-backend.js";
import { StructuralBackendError } from "../../structural-backend/types.js";
import { WorldGraphQuery } from "../../world/world-graph-query.js";
import {
  PrimaryRepositoryCatalog,
  type PrimaryRepositoryProject,
} from "./primary-repository-catalog.js";
import type {
  WebBusinessMap,
  WebBusinessNode,
  WebBusinessSearch,
  WebProjectStatus,
  WebProjectSummary,
} from "./types.js";

export type AtlasReadErrorCode =
  | "PROJECT_NOT_FOUND"
  | "BUSINESS_NODE_NOT_FOUND"
  | "ATLAS_STATE_UNAVAILABLE"
  | "PUBLICATION_CHANGED";

export class AtlasReadError extends Error {
  constructor(
    readonly statusCode: 404 | 409,
    readonly code: AtlasReadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AtlasReadError";
  }
}

export interface AtlasReadOperations {
  listProjects(): Promise<readonly WebProjectSummary[]>;
  getStatus(repositoryId: string): Promise<WebProjectStatus>;
  getMap(repositoryId: string, focusKey?: string): Promise<WebBusinessMap>;
  searchBusiness(repositoryId: string, query: string, limit: number): Promise<WebBusinessSearch>;
  getBusinessNode(repositoryId: string, businessKey: string): Promise<WebBusinessNode>;
}

export class AtlasReadService implements AtlasReadOperations {
  readonly #catalog: PrimaryRepositoryCatalog;
  readonly #repositoryQueues = new Map<string, Promise<void>>();

  constructor(catalog: PrimaryRepositoryCatalog = new PrimaryRepositoryCatalog()) {
    this.#catalog = catalog;
  }

  listProjects(): Promise<readonly WebProjectSummary[]> {
    return this.#catalog.listProjects();
  }

  getStatus(repositoryId: string): Promise<WebProjectStatus> {
    return this.withRepositoryRead(repositoryId, async (project) => {
      const [languages, structural] = await Promise.all([
        inspectRepositoryLanguages(project.repository),
        new CodeGraphStructuralBackend(project.repository).inspect(),
      ]);
      const warnings: { code: string; message: string }[] = [];
      if (project.summary.freshness === "stale") {
        warnings.push({
          code: "STALE_INDEX",
          message: "The repository differs from the published Atlas snapshot.",
        });
      }
      if (structural.completeness === "incomplete") {
        warnings.push({ code: "INCOMPLETE_INDEX", message: "The structural index is incomplete." });
      }
      for (const language of languages) {
        if (language.support === "unsupported") {
          warnings.push({ code: "UNSUPPORTED_LANGUAGE", message: language.reason });
        }
      }
      return {
        project: project.summary,
        currentRevision: {
          headCommit: project.currentSnapshot.headCommit,
          changes: {
            staged: project.currentSnapshot.changes.staged.length,
            unstaged: project.currentSnapshot.changes.unstaged.length,
            untracked: project.currentSnapshot.changes.untracked.length,
          },
        },
        languages,
        backend: {
          backendVersion: structural.backendVersion,
          completeness: structural.completeness,
          extractionVersion: structural.extractionVersion,
          indexedAt: structural.indexedAt,
        },
        warnings,
      };
    });
  }

  getMap(repositoryId: string, focusKey?: string): Promise<WebBusinessMap> {
    return this.withPublishedWorld(repositoryId, async (query) => {
      const map = await query.view(focusKey);
      if (map === undefined) {
        throw new AtlasReadError(
          404,
          "BUSINESS_NODE_NOT_FOUND",
          "The requested business node is not available.",
        );
      }
      return map;
    });
  }

  searchBusiness(
    repositoryId: string,
    queryText: string,
    limit: number,
  ): Promise<WebBusinessSearch> {
    return this.withPublishedWorld(repositoryId, async (query) => ({
      query: queryText,
      limit,
      results: await query.searchBusiness(queryText, { limit }),
    }));
  }

  getBusinessNode(repositoryId: string, businessKey: string): Promise<WebBusinessNode> {
    return this.withPublishedWorld(repositoryId, async (query) => {
      const node = await query.showBusiness(businessKey);
      if (node === undefined) {
        throw new AtlasReadError(
          404,
          "BUSINESS_NODE_NOT_FOUND",
          "The requested business node is not available.",
        );
      }
      return node;
    });
  }

  private withPublishedWorld<Result>(
    repositoryId: string,
    operation: (query: WorldGraphQuery) => Promise<Result>,
  ): Promise<Result> {
    return this.withRepositoryRead(repositoryId, async (project) => {
      if (project.summary.status !== "current" || project.summary.snapshotId === null) {
        throw unavailableWorld();
      }
      const structural = new CodeGraphStructuralBackend(project.repository);
      const state = await structural.inspect();
      if (state.completeness !== "complete") {
        throw unavailableWorld();
      }
      using graph = new GraphStore(project.repository, { access: "read-only" });
      using query = new WorldGraphQuery(project.repository, graph, structural, {
        atlasAccess: "read-only",
      });
      try {
        return await operation(query);
      } catch (error) {
        if (error instanceof AtlasReadError) {
          throw error;
        }
        if (error instanceof Error && error.message.includes("publication changed")) {
          throw new AtlasReadError(
            409,
            "PUBLICATION_CHANGED",
            "The Atlas publication changed during the request. Try again.",
          );
        }
        if (isUnavailableWorldError(error)) {
          throw unavailableWorld();
        }
        throw error;
      }
    });
  }

  private async withRepositoryRead<Result>(
    repositoryId: string,
    operation: (project: PrimaryRepositoryProject) => Promise<Result>,
  ): Promise<Result> {
    const previous = this.#repositoryQueues.get(repositoryId) ?? Promise.resolve();
    let resolveQueue!: () => void;
    const queue = new Promise<void>((resolve) => { resolveQueue = resolve; });
    const queueTail = previous.catch(() => undefined).then(() => queue);
    this.#repositoryQueues.set(repositoryId, queueTail);
    await previous.catch(() => undefined);
    try {
      const project = await this.#catalog.findProject(repositoryId);
      if (project === undefined) {
        throw new AtlasReadError(
          404,
          "PROJECT_NOT_FOUND",
          "The requested project is not available.",
        );
      }
      return await operation(project);
    } finally {
      resolveQueue();
      if (this.#repositoryQueues.get(repositoryId) === queueTail) {
        this.#repositoryQueues.delete(repositoryId);
      }
    }
  }
}

function isUnavailableWorldError(error: unknown): boolean {
  return error instanceof StructuralBackendError
    || (error instanceof Error && (
      error.message.startsWith("World snapshot is ")
      || error.message.includes("current world publication")
      || error.message.includes("current world snapshot")
    ));
}

function unavailableWorld(): AtlasReadError {
  return new AtlasReadError(
    409,
    "ATLAS_STATE_UNAVAILABLE",
    "The current Atlas publication is unavailable for this project.",
  );
}
