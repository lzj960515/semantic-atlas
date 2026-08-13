import { createHash } from "node:crypto";
import { constants as fileSystemConstants } from "node:fs";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

import type {
  CodeGraph,
  Edge,
  EdgeKind,
  Node,
  QueryBuilder,
  SyncResult,
  UnresolvedReference,
} from "@colbymchenry/codegraph";

import type { GitRepository } from "../repository/types.js";
import { runGit } from "../repository/git-command.js";
import type {
  IndexedSourceFile,
  StructuralEvidenceResolver,
  StructuralTargetLocator,
  WorldWriteCoordinator,
} from "../world/types.js";
import {
  requiresBundledCodeGraphRuntime,
  runCodeGraphWorker,
} from "./codegraph-worker-client.js";
import { StructuralPublication } from "./structural-publication.js";
import { StructuralWriteLock } from "./structural-write-lock.js";
import {
  STRUCTURAL_BACKEND_VERSION,
  StructuralBackendError,
  type StructuralBuildCounts,
  type StructuralBuildResult,
  type StructuralCallRelation,
  type StructuralDiagnostic,
  type StructuralFileChanges,
  type StructuralFileDependency,
  type StructuralIndexBackend,
  type StructuralIndexState,
  type BackendStructuralRelationType,
  type StructuralNode,
  type StructuralProvenance,
  type StructuralReference,
  type StructuralRelation,
  type StructuralSearchQuery,
  type StructuralSearchResult,
  type StructuralSupport,
  type StructuralTraversalQuery,
  type StructuralTraversalResult,
  type StructuralUnknownBoundary,
} from "./types.js";

const ATLAS_DIRECTORY = ".atlas";
const ATLAS_IGNORE_CONTENT = "*\n";
const ATLAS_WRITE_LOCK = "semantic-atlas.lock";
const CODEGRAPH_WRITE_LOCK = "codegraph.lock";

type CodeGraphModule = typeof import("@colbymchenry/codegraph");

const require = createRequire(import.meta.url);
let operationQueue: Promise<void> = Promise.resolve();

const supportedRelationTypes = new Map<EdgeKind, BackendStructuralRelationType>([
  ["contains", "contains"],
  ["calls", "calls"],
  ["imports", "imports"],
  ["exports", "exports"],
  ["extends", "extends"],
  ["implements", "implements"],
  ["references", "references"],
  ["instantiates", "instantiates"],
  ["decorates", "decorated_by"],
]);

const backendRelationTypes = new Map<BackendStructuralRelationType, EdgeKind>([
  ["contains", "contains"],
  ["declares", "contains"],
  ["calls", "calls"],
  ["imports", "imports"],
  ["exports", "exports"],
  ["extends", "extends"],
  ["implements", "implements"],
  ["references", "references"],
  ["instantiates", "instantiates"],
  ["decorated_by", "decorates"],
]);

export interface StructuralWorldPublicationHooks {
  onBuilding(): void | Promise<void>;
  publish(
    result: StructuralBuildResult,
    resolver: StructuralEvidenceResolver,
    indexedSources: readonly IndexedSourceFile[],
  ): void | Promise<void>;
  fail(error: unknown): void;
}

export class CodeGraphStructuralBackend implements StructuralIndexBackend, WorldWriteCoordinator {
  readonly #repository: GitRepository;
  readonly #databasePath: string;

  constructor(repository: GitRepository) {
    this.#repository = repository;
    this.#databasePath = join(repository.worktreeRoot, ATLAS_DIRECTORY, "codegraph.db");
  }

  async inspect(): Promise<StructuralIndexState> {
    if (requiresBundledCodeGraphRuntime()) {
      try {
        return await runCodeGraphWorker({ operation: "inspect", repository: this.#repository });
      } catch (error) {
        return this.incompleteState(failureDiagnostic(error));
      }
    }
    try {
      return await withCodeGraphSdk((sdk) => this.inspectWithSdk(sdk));
    } catch (error) {
      return this.incompleteState(failureDiagnostic(error));
    }
  }

  async build(): Promise<StructuralBuildResult> {
    if (requiresBundledCodeGraphRuntime()) {
      try {
        return await runCodeGraphWorker({ operation: "build", repository: this.#repository });
      } catch (error) {
        return this.failedBuildResult("full", error);
      }
    }
    try {
      return await this.runBuild("full");
    } catch (error) {
      return this.failedBuildResult("full", error);
    }
  }

  async sync(): Promise<StructuralBuildResult> {
    if (requiresBundledCodeGraphRuntime()) {
      try {
        return await runCodeGraphWorker({ operation: "sync", repository: this.#repository });
      } catch (error) {
        return this.failedBuildResult("incremental", error);
      }
    }
    try {
      return await this.runBuild("incremental");
    } catch (error) {
      return this.failedBuildResult("incremental", error);
    }
  }

  async listUnknownBoundaries(): Promise<readonly StructuralUnknownBoundary[]> {
    if (requiresBundledCodeGraphRuntime()) {
      return runCodeGraphWorker({
        operation: "listUnknownBoundaries",
        repository: this.#repository,
      });
    }
    return this.withCurrentGraph((graph, queries) => (
      normalizeUnresolvedReferences(graph, queries)
    ));
  }

  async publishWorld(
    requestedMode: "full" | "incremental",
    hooks: StructuralWorldPublicationHooks,
  ): Promise<StructuralBuildResult> {
    if (requiresBundledCodeGraphRuntime()) {
      throw new Error("World publication must run inside the bundled CodeGraph worker");
    }
    try {
      return await this.runBuild(requestedMode, hooks);
    } catch (error) {
      hooks.fail(error);
      return this.failedBuildResult(requestedMode, error);
    }
  }

  async withWorldWriteLock<T>(
    operation: (
      state: StructuralIndexState,
      resolver: StructuralEvidenceResolver,
    ) => Promise<T>,
  ): Promise<T> {
    if (requiresBundledCodeGraphRuntime()) {
      throw new Error("Atlas writes must run inside the bundled CodeGraph worker");
    }
    return withCodeGraphSdk((sdk) => this.withPublishedGraph(sdk, (graph) => {
      const state = this.readState(graph);
      if (state.completeness !== "complete") {
        throw new StructuralBackendError(
          "STRUCTURAL_INDEX_INCOMPLETE",
          "The structural index is incomplete and cannot accept Atlas writes",
        );
      }
      return operation(state, structuralEvidenceResolver(graph));
    }));
  }

  async listRoots(): Promise<readonly StructuralNode[]> {
    if (requiresBundledCodeGraphRuntime()) {
      return runCodeGraphWorker({ operation: "listRoots", repository: this.#repository });
    }
    return this.withCurrentGraph((graph) => structuralModuleRoots(graph));
  }

  async search(query: StructuralSearchQuery): Promise<readonly StructuralSearchResult[]> {
    if (requiresBundledCodeGraphRuntime()) {
      return runCodeGraphWorker({
        operation: "search",
        repository: this.#repository,
        input: query,
      });
    }
    if (query.query.trim().length === 0) {
      return [];
    }

    return this.withCurrentGraph((graph) => graph.searchNodes(query.query, {
      ...(query.limit === undefined ? {} : { limit: query.limit }),
    }).map((result) => ({
      score: result.score,
      node: normalizeNode(result.node),
    })));
  }

  async getNode(reference: StructuralReference): Promise<StructuralNode | undefined> {
    if (requiresBundledCodeGraphRuntime()) {
      return runCodeGraphWorker({
        operation: "getNode",
        repository: this.#repository,
        input: reference,
      });
    }
    return this.withCurrentGraph((graph) => {
      const node = findNodeByReference(graph, reference);
      return node === undefined
        ? findVirtualModuleRoot(graph, reference)
        : normalizeNode(node);
    });
  }

  async traverse(query: StructuralTraversalQuery): Promise<StructuralTraversalResult> {
    if (requiresBundledCodeGraphRuntime()) {
      return runCodeGraphWorker({
        operation: "traverse",
        repository: this.#repository,
        input: query,
      });
    }
    return this.withCurrentGraph((graph, queries) => {
      const virtualModule = findVirtualModuleRoot(graph, query.reference);
      if (virtualModule !== undefined) {
        return traverseVirtualModuleRoot(graph, virtualModule, query);
      }
      const start = requireNodeByReference(graph, query.reference);
      const requestedRelations = query.relationTypes?.map((type) => backendRelationTypes.get(type));
      const subgraph = graph.traverse(start.id, {
        includeStart: true,
        ...(query.maxDepth === undefined ? {} : { maxDepth: query.maxDepth }),
        ...(query.direction === undefined ? {} : { direction: query.direction }),
        ...(requestedRelations === undefined
          ? {}
          : { edgeKinds: [...new Set(requestedRelations.filter(isDefined))] }),
      });
      const nodesByBackendId = subgraph.nodes;
      const normalizedNodes = [...nodesByBackendId.values()].map(normalizeNode);
      const relations: StructuralRelation[] = [];
      const boundaries: StructuralUnknownBoundary[] = [];

      for (const edge of subgraph.edges) {
        const source = nodesByBackendId.get(edge.source) ?? graph.getNode(edge.source) ?? undefined;
        const target = nodesByBackendId.get(edge.target) ?? graph.getNode(edge.target) ?? undefined;
        if (source === undefined) {
          continue;
        }
        const relation = normalizeRelation(edge, source, target);
        if (relation === undefined) {
          boundaries.push(unsupportedRelationBoundary(edge, source, target));
        } else if (query.relationTypes === undefined || query.relationTypes.includes(relation.type)) {
          relations.push(relation);
        }
      }

      const traversedReferences = new Set(normalizedNodes.map((node) => node.reference.id));
      boundaries.push(...normalizeUnresolvedReferences(graph, queries)
        .filter((boundary) => traversedReferences.has(boundary.owner.id)));

      return {
        roots: subgraph.roots
          .map((backendId) => nodesByBackendId.get(backendId) ?? graph.getNode(backendId) ?? undefined)
          .filter(isDefined)
          .map((node) => normalizeNode(node).reference),
        nodes: uniqueBy(normalizedNodes, (node) => node.reference.id),
        relations: uniqueBy(relations, relationIdentity),
        boundaries: uniqueBy(boundaries, (boundary) => boundary.reference.id),
      };
    });
  }

  async getCallers(reference: StructuralReference): Promise<readonly StructuralCallRelation[]> {
    if (requiresBundledCodeGraphRuntime()) {
      return runCodeGraphWorker({
        operation: "getCallers",
        repository: this.#repository,
        input: reference,
      });
    }
    return this.withCurrentGraph((graph) => {
      const node = requireNodeByReference(graph, reference);
      return graph.getCallers(node.id, 1)
        .filter(({ edge }) => edge.kind === "calls" && edge.target === node.id)
        .map(({ edge, node: caller }) => ({
          node: normalizeNode(caller),
          relation: requireNormalizedRelation(edge, caller, node),
        }));
    });
  }

  async getCallees(reference: StructuralReference): Promise<readonly StructuralCallRelation[]> {
    if (requiresBundledCodeGraphRuntime()) {
      return runCodeGraphWorker({
        operation: "getCallees",
        repository: this.#repository,
        input: reference,
      });
    }
    return this.withCurrentGraph((graph) => {
      const node = requireNodeByReference(graph, reference);
      return graph.getCallees(node.id, 1)
        .filter(({ edge }) => edge.kind === "calls" && edge.source === node.id)
        .map(({ edge, node: callee }) => ({
          node: normalizeNode(callee),
          relation: requireNormalizedRelation(edge, node, callee),
        }));
    });
  }

  async getFileDependencies(path: string): Promise<readonly StructuralFileDependency[]> {
    if (requiresBundledCodeGraphRuntime()) {
      return runCodeGraphWorker({
        operation: "getFileDependencies",
        repository: this.#repository,
        input: path,
      });
    }
    const normalizedPath = normalizeRepositoryPath(path);
    return this.withCurrentGraph((graph) => {
      const sourceFile = graph.getNode(`file:${normalizedPath}`) ?? undefined;
      const outgoingImports = sourceFile === undefined
        ? []
        : graph.getOutgoingEdges(sourceFile.id).filter((edge) => edge.kind === "imports");

      return graph.getFileDependencies(normalizedPath)
        .map((dependency) => {
          const dependencyPath = normalizeRepositoryPath(dependency);
          const supportingEdges = outgoingImports.filter((edge) =>
            graph.getNode(edge.target)?.filePath === dependencyPath);
          return {
            path: dependencyPath,
            support: dependencySupport(supportingEdges),
          };
        })
        .sort((left, right) => left.path.localeCompare(right.path));
    });
  }

  private async runBuild(
    requestedMode: "full" | "incremental",
    worldHooks?: StructuralWorldPublicationHooks,
  ): Promise<StructuralBuildResult> {
    return withCodeGraphSdk(async (sdk) => {
      this.verifyDatabasePath(sdk.getDatabasePath(this.#repository.worktreeRoot));
      await this.prepareAtlasDirectory();

      const atlasWriteLock = StructuralWriteLock.acquire(join(
        this.#repository.worktreeRoot,
        ATLAS_DIRECTORY,
        ATLAS_WRITE_LOCK,
      ));
      if (atlasWriteLock === undefined) {
        return await this.createLockUnavailableBuildResult(sdk, requestedMode);
      }

      try {
        const writeLock = this.createCodeGraphWriteLock(sdk);
        try {
          writeLock.acquire();
        } catch {
          return await this.createLockUnavailableBuildResult(sdk, requestedMode);
        }

        try {
          await StructuralPublication.recoverAbandoned(this.#databasePath);
          return await this.runLockedBuild(sdk, requestedMode, worldHooks);
        } finally {
          writeLock.release();
        }
      } finally {
        atlasWriteLock.release();
      }
    });
  }

  private async runLockedBuild(
    sdk: CodeGraphModule,
    requestedMode: "full" | "incremental",
    worldHooks?: StructuralWorldPublicationHooks,
  ): Promise<StructuralBuildResult> {
    const initialized = sdk.CodeGraph.isInitialized(this.#repository.worktreeRoot);
    const mode = initialized ? requestedMode : "initial";
    let graph: CodeGraph | undefined;
    let publication: StructuralPublication | undefined;
    try {
      if (!initialized && worldHooks !== undefined) {
        graph = await sdk.CodeGraph.init(this.#repository.worktreeRoot, { index: false });
        await worldHooks.onBuilding();
        publication = await StructuralPublication.begin(this.#databasePath, false);
      } else {
        await worldHooks?.onBuilding();
        publication = await StructuralPublication.begin(this.#databasePath, initialized);
        graph = initialized
          ? await sdk.CodeGraph.open(this.#repository.worktreeRoot, { sync: false })
          : await sdk.CodeGraph.init(this.#repository.worktreeRoot, { index: false });
      }
      useHeldCodeGraphWriteLock(graph);

      const buildResult = mode === "incremental"
        ? await this.synchronizeGraph(sdk, graph)
        : await this.rebuildGraph(sdk, graph, mode);
      if (buildResult.completeness === "incomplete") {
        graph.close();
        graph = undefined;
        const restored = await this.restorePublishedGraph(publication, buildResult);
        await this.persistWorldFailure(sdk, initialized, worldHooks, restored.diagnostics[0]?.message);
        return restored;
      }
      await worldHooks?.publish(
        buildResult,
        structuralEvidenceResolver(graph),
        graph.getFiles().map((file) => ({
          path: normalizeRepositoryPath(file.path),
          contentHash: file.contentHash,
        })),
      );
      await publication.commit();
      return buildResult;
    } catch (error) {
      const failedResult = this.failedBuildResult(mode, error);
      if (publication !== undefined) {
        graph?.close();
        graph = undefined;
        const restored = await this.restorePublishedGraph(publication, failedResult);
        await this.persistWorldFailure(sdk, initialized, worldHooks, error);
        return restored;
      }
      worldHooks?.fail(error);
      return failedResult;
    } finally {
      graph?.close();
    }
  }

  private async persistWorldFailure(
    sdk: CodeGraphModule,
    hadPublishedDatabase: boolean,
    hooks: StructuralWorldPublicationHooks | undefined,
    error: unknown,
  ): Promise<void> {
    if (hooks === undefined) {
      return;
    }
    if (!hadPublishedDatabase) {
      const emptyGraph = await sdk.CodeGraph.init(this.#repository.worktreeRoot, { index: false });
      emptyGraph.close();
    }
    hooks.fail(error);
  }

  private async synchronizeGraph(
    sdk: CodeGraphModule,
    graph: CodeGraph,
  ): Promise<StructuralBuildResult> {
    const changes = normalizeChangedFiles(graph.getChangedFiles());
    const result = await graph.sync();
    if (isLockUnavailableSync(result)) {
      return this.createLockUnavailableSyncResult(graph, result, changes);
    }
    const connection = sdk.DatabaseConnection.open(this.#databasePath);
    try {
      const boundaries = normalizeUnresolvedReferences(
        graph,
        new sdk.QueryBuilder(connection.getDb()),
      );
      return this.createSyncResult(graph, result, changes, boundaries);
    } finally {
      connection.close();
    }
  }

  private async rebuildGraph(
    sdk: CodeGraphModule,
    graph: CodeGraph,
    mode: "initial" | "full",
  ): Promise<StructuralBuildResult> {
    let fullRebuildStarted = false;
    const result = await graph.indexAll({
      ...(mode === "full"
        ? {
            onProgress: () => {
              if (!fullRebuildStarted) {
                fullRebuildStarted = true;
                graph.clear();
              }
            },
          }
        : {}),
    });
    const connection = sdk.DatabaseConnection.open(this.#databasePath);
    try {
      const queries = new sdk.QueryBuilder(connection.getDb());
      const boundaries = normalizeUnresolvedReferences(graph, queries);
      return this.createFullBuildResult(graph, result, mode, boundaries);
    } finally {
      connection.close();
    }
  }

  private async restorePublishedGraph(
    publication: StructuralPublication,
    failedResult: StructuralBuildResult,
  ): Promise<StructuralBuildResult> {
    try {
      await publication.rollback();
      return failedResult;
    } catch (error) {
      return {
        ...failedResult,
        diagnostics: [
          ...failedResult.diagnostics,
          structuralRestoreFailureDiagnostic(error, publication.backupPath),
        ],
      };
    }
  }

  private createFullBuildResult(
    graph: CodeGraph,
    result: Awaited<ReturnType<CodeGraph["indexAll"]>>,
    mode: "initial" | "full",
    boundaries: readonly StructuralUnknownBoundary[],
  ): StructuralBuildResult {
    const filesDiscovered = result.filesDiscovered ??
      result.filesIndexed + result.filesSkipped + result.filesErrored;
    const complete = result.success &&
      graph.getIndexState() === "complete" &&
      graph.getPendingReferenceCount() === 0 &&
      result.filesErrored === 0 &&
      !hasStructuralFileErrors(graph) &&
      filesDiscovered === result.filesIndexed + result.filesSkipped + result.filesErrored;
    const diagnostics: StructuralDiagnostic[] = result.errors
      .filter((error) => error.severity === "error")
      .map((error) => ({
      code: "STRUCTURAL_INDEX_INCOMPLETE",
      message: diagnosticMessage(error.message),
      }));
    if (!complete && diagnostics.length === 0) {
      diagnostics.push(incompleteDiagnostic(graph.getIndexState()));
    }

    return {
      ...this.stateFromGraph(graph, complete ? "complete" : "incomplete", diagnostics),
      mode,
      counts: {
        filesDiscovered,
        filesIndexed: result.filesIndexed,
        filesSkipped: result.filesSkipped,
        filesErrored: result.filesErrored,
        nodes: graph.getStats().nodeCount,
        relations: graph.getStats().edgeCount,
      },
      changes: emptyChanges(),
      boundaries,
    };
  }

  private createSyncResult(
    graph: CodeGraph,
    result: SyncResult,
    changes: StructuralFileChanges,
    boundaries: readonly StructuralUnknownBoundary[],
  ): StructuralBuildResult {
    const complete = graph.getIndexState() === "complete" &&
      graph.getPendingReferenceCount() === 0 &&
      !hasStructuralFileErrors(graph);
    const diagnostics = complete ? [] : [incompleteDiagnostic(graph.getIndexState())];
    const stats = graph.getStats();
    return {
      ...this.stateFromGraph(graph, complete ? "complete" : "incomplete", diagnostics),
      mode: "incremental",
      counts: {
        filesDiscovered: result.filesChecked,
        filesIndexed: result.filesAdded + result.filesModified,
        filesSkipped: result.filesChecked - result.filesAdded - result.filesModified - result.filesRemoved,
        filesErrored: 0,
        nodes: stats.nodeCount,
        relations: stats.edgeCount,
      },
      changes,
      boundaries,
    };
  }

  private createLockUnavailableSyncResult(
    graph: CodeGraph,
    result: SyncResult,
    changes: StructuralFileChanges,
  ): StructuralBuildResult {
    const stats = graph.getStats();
    return {
      ...this.stateFromGraph(graph, "incomplete", [lockUnavailableDiagnostic()]),
      mode: "incremental",
      counts: {
        filesDiscovered: result.filesChecked,
        filesIndexed: 0,
        filesSkipped: 0,
        filesErrored: 0,
        nodes: stats.nodeCount,
        relations: stats.edgeCount,
      },
      changes,
      boundaries: [],
    };
  }

  private async createLockUnavailableBuildResult(
    sdk: CodeGraphModule,
    requestedMode: "full" | "incremental",
  ): Promise<StructuralBuildResult> {
    const initialized = sdk.CodeGraph.isInitialized(this.#repository.worktreeRoot);
    const mode = initialized ? requestedMode : "initial";
    return {
      ...this.incompleteState(lockUnavailableDiagnostic()),
      mode,
      counts: emptyCounts(),
      changes: emptyChanges(),
      boundaries: [],
    };
  }

  private failedBuildResult(
    mode: StructuralBuildResult["mode"],
    error: unknown,
  ): StructuralBuildResult {
    return {
      ...this.incompleteState(failureDiagnostic(error)),
      mode,
      counts: emptyCounts(),
      changes: emptyChanges(),
      boundaries: [],
    };
  }

  private async withCurrentGraph<T>(
    operation: (graph: CodeGraph, queries: QueryBuilder) => T | Promise<T>,
  ): Promise<T> {
    try {
      return await withCodeGraphSdk((sdk) => this.withPublishedGraph(sdk, async (graph) => {
        let connection: ReturnType<typeof sdk.DatabaseConnection.open> | undefined;
        try {
          const state = this.readState(graph);
          if (state.completeness !== "complete") {
            throw new StructuralBackendError(
              "STRUCTURAL_INDEX_INCOMPLETE",
              "The structural index is incomplete and cannot serve queries",
            );
          }
          connection = sdk.DatabaseConnection.open(this.#databasePath);
          const queries = new sdk.QueryBuilder(connection.getDb());
          return await operation(graph, queries);
        } finally {
          connection?.close();
        }
      }));
    } catch (error) {
      if (error instanceof StructuralBackendError) {
        throw error;
      }
      throw new StructuralBackendError(
        "STRUCTURAL_QUERY_FAILED",
        "The structural backend could not complete the query",
        error,
      );
    }
  }

  private readState(graph: CodeGraph): StructuralIndexState {
    const indexState = graph.getIndexState();
    const complete = indexState === "complete" &&
      graph.getPendingReferenceCount() === 0 &&
      !hasStructuralFileErrors(graph);
    return this.stateFromGraph(
      graph,
      complete ? "complete" : "incomplete",
      complete ? [] : [incompleteDiagnostic(indexState)],
    );
  }

  private stateFromGraph(
    graph: CodeGraph,
    completeness: "complete" | "incomplete",
    diagnostics: readonly StructuralDiagnostic[],
  ): StructuralIndexState {
    const buildInfo = graph.getIndexBuildInfo();
    const indexedAt = graph.getLastIndexedAt();
    return {
      completeness,
      databasePath: this.#databasePath,
      backendVersion: buildInfo.version ?? STRUCTURAL_BACKEND_VERSION,
      extractionVersion: buildInfo.extractionVersion,
      indexedAt: indexedAt === null ? null : new Date(indexedAt).toISOString(),
      diagnostics,
    };
  }

  private missingState(): StructuralIndexState {
    return {
      completeness: "missing",
      databasePath: this.#databasePath,
      backendVersion: STRUCTURAL_BACKEND_VERSION,
      extractionVersion: null,
      indexedAt: null,
      diagnostics: [],
    };
  }

  private incompleteState(diagnostic: StructuralDiagnostic): StructuralIndexState {
    return {
      completeness: "incomplete",
      databasePath: this.#databasePath,
      backendVersion: STRUCTURAL_BACKEND_VERSION,
      extractionVersion: null,
      indexedAt: null,
      diagnostics: [diagnostic],
    };
  }

  private async prepareAtlasDirectory(): Promise<void> {
    const directory = join(this.#repository.worktreeRoot, ATLAS_DIRECTORY);
    await this.verifyAtlasIgnoreIsUntracked();
    await mkdir(directory, { recursive: true });
    await this.verifyAtlasDirectory();
    await this.prepareAtlasIgnoreFile(directory);
  }

  private async inspectWithSdk(sdk: CodeGraphModule): Promise<StructuralIndexState> {
    try {
      return await this.withPublishedGraph(sdk, (graph) => this.readState(graph));
    } catch (error) {
      if (error instanceof StructuralBackendError) {
        if (error.code === "STRUCTURAL_INDEX_MISSING") {
          return this.missingState();
        }
        if (error.code === "STRUCTURAL_INDEX_INCOMPLETE") {
          return this.incompleteState(activePublicationDiagnostic());
        }
      }
      return this.incompleteState(failureDiagnostic(error));
    }
  }

  private async withPublishedGraph<T>(
    sdk: CodeGraphModule,
    operation: (graph: CodeGraph) => T | Promise<T>,
  ): Promise<T> {
    this.verifyDatabasePath(sdk.getDatabasePath(this.#repository.worktreeRoot));
    if (!await this.atlasDirectoryExists()) {
      throw missingStructuralIndexError();
    }
    await this.verifyAtlasDirectory();

    const atlasWriteLock = this.acquireAtlasWriteLock();
    if (atlasWriteLock === undefined) {
      throw activePublicationError();
    }
    let writeLock: InstanceType<CodeGraphModule["FileLock"]> | undefined;
    let graph: CodeGraph | undefined;
    try {
      writeLock = this.createCodeGraphWriteLock(sdk);
      try {
        writeLock.acquire();
      } catch {
        throw activePublicationError();
      }
      await StructuralPublication.recoverAbandoned(this.#databasePath);
      await this.verifyAtlasDirectory();
      if (!sdk.CodeGraph.isInitialized(this.#repository.worktreeRoot)) {
        throw missingStructuralIndexError();
      }
      graph = await sdk.CodeGraph.open(this.#repository.worktreeRoot, { sync: false });
      useHeldCodeGraphWriteLock(graph);
      return await operation(graph);
    } finally {
      graph?.close();
      writeLock?.release();
      atlasWriteLock.release();
    }
  }

  private acquireAtlasWriteLock(): StructuralWriteLock | undefined {
    return StructuralWriteLock.acquire(join(
      this.#repository.worktreeRoot,
      ATLAS_DIRECTORY,
      ATLAS_WRITE_LOCK,
    ));
  }

  private createCodeGraphWriteLock(
    sdk: CodeGraphModule,
  ): InstanceType<CodeGraphModule["FileLock"]> {
    return new sdk.FileLock(join(
      this.#repository.worktreeRoot,
      ATLAS_DIRECTORY,
      CODEGRAPH_WRITE_LOCK,
    ));
  }

  private async atlasDirectoryExists(): Promise<boolean> {
    try {
      await lstat(join(this.#repository.worktreeRoot, ATLAS_DIRECTORY));
      return true;
    } catch (error) {
      if (isFileSystemError(error, "ENOENT")) {
        return false;
      }
      throw error;
    }
  }

  private async prepareAtlasIgnoreFile(directory: string): Promise<void> {
    const ignorePath = join(directory, ".gitignore");
    await this.verifyAtlasIgnoreIsUntracked();

    try {
      await this.verifyExistingAtlasIgnoreFile(ignorePath);
      return;
    } catch (error) {
      if (!isFileSystemError(error, "ENOENT")) {
        throw error;
      }
    }

    const noFollow = fileSystemConstants.O_NOFOLLOW ?? 0;
    let ignoreFile: Awaited<ReturnType<typeof open>>;
    try {
      ignoreFile = await open(
        ignorePath,
        fileSystemConstants.O_WRONLY |
          fileSystemConstants.O_CREAT |
          fileSystemConstants.O_EXCL |
          noFollow,
        0o600,
      );
    } catch (error) {
      if (isFileSystemError(error, "EEXIST")) {
        await this.verifyExistingAtlasIgnoreFile(ignorePath);
        return;
      }
      throw error;
    }
    try {
      await ignoreFile.writeFile(ATLAS_IGNORE_CONTENT, { encoding: "utf8" });
    } finally {
      await ignoreFile.close();
    }
    await this.verifyExistingAtlasIgnoreFile(ignorePath);
  }

  private async verifyAtlasIgnoreIsUntracked(): Promise<void> {
    const tracked = (await runGit(this.#repository.worktreeRoot, [
      "ls-files",
      "-z",
      "--",
      `${ATLAS_DIRECTORY}/.gitignore`,
    ])).length > 0;
    if (tracked) {
      throw new Error("The Atlas ignore file is repository-owned and cannot be modified");
    }
  }

  private async verifyExistingAtlasIgnoreFile(ignorePath: string): Promise<void> {
    const metadata = await lstat(ignorePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("The Atlas ignore file must be an Atlas-owned regular file");
    }

    const noFollow = fileSystemConstants.O_NOFOLLOW ?? 0;
    const ignoreFile = await open(ignorePath, fileSystemConstants.O_RDONLY | noFollow);
    try {
      const openedMetadata = await ignoreFile.stat();
      if (
        !openedMetadata.isFile() ||
        openedMetadata.dev !== metadata.dev ||
        openedMetadata.ino !== metadata.ino
      ) {
        throw new Error("The Atlas ignore file must be an Atlas-owned regular file");
      }
      if (await ignoreFile.readFile({ encoding: "utf8" }) !== ATLAS_IGNORE_CONTENT) {
        throw new Error("The existing Atlas ignore file is not owned by Semantic Atlas");
      }
    } finally {
      await ignoreFile.close();
    }
  }

  private async verifyAtlasDirectory(): Promise<void> {
    const expectedDirectory = resolve(this.#repository.worktreeRoot, ATLAS_DIRECTORY);
    const directoryMetadata = await lstat(expectedDirectory);
    if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) {
      throw new Error("The Atlas store must be a real directory inside the target worktree");
    }
    if (resolve(await realpath(expectedDirectory)) !== expectedDirectory) {
      throw new Error("The Atlas store resolves outside the target worktree");
    }

    try {
      const databaseMetadata = await lstat(this.#databasePath);
      if (!databaseMetadata.isFile() || databaseMetadata.isSymbolicLink()) {
        throw new Error("The structural database must be a regular file inside the Atlas store");
      }
    } catch (error) {
      if (!isFileSystemError(error, "ENOENT")) {
        throw error;
      }
    }
  }

  private verifyDatabasePath(candidate: string): void {
    if (resolve(candidate) !== resolve(this.#databasePath)) {
      throw new Error("The structural backend resolved outside the Atlas worktree store");
    }
  }
}

function normalizeNode(node: Node): StructuralNode {
  const path = normalizeRepositoryPath(node.filePath);
  return {
    reference: referenceForNode(node),
    kind: normalizeNodeKind(node),
    name: node.name,
    qualifiedName: node.qualifiedName,
    path,
    language: node.language,
    range: {
      start: { line: positiveLine(node.startLine), column: node.startColumn + 1 },
      end: { line: positiveLine(node.endLine), column: node.endColumn + 1 },
    },
    support: exactBackendSupport(),
  };
}

function structuralModuleRoots(graph: CodeGraph): StructuralNode[] {
  const modules = [
    ...graph.getNodesByKind("module"),
    ...graph.getNodesByKind("namespace"),
  ];
  if (modules.length > 0) {
    const moduleIds = new Set(modules.map((node) => node.id));
    const roots = modules.filter((node) => !graph.getIncomingEdges(node.id).some((edge) => (
      edge.kind === "contains" && moduleIds.has(edge.source)
    )));
    return uniqueBy((roots.length === 0 ? modules : roots).map(normalizeNode), (node) => node.reference.id)
      .sort(compareStructuralNodes);
  }

  const rootDirectories = new Map<string, string>();
  for (const file of graph.getFiles()) {
    const path = normalizeRepositoryPath(file.path);
    const separator = path.indexOf("/");
    const root = separator === -1 ? "." : path.slice(0, separator);
    if (!rootDirectories.has(root)) {
      rootDirectories.set(root, path);
    }
  }
  return [...rootDirectories.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([root, representativePath]) => virtualModuleRoot(root, representativePath));
}

function findVirtualModuleRoot(
  graph: CodeGraph,
  reference: StructuralReference,
): StructuralNode | undefined {
  return structuralModuleRoots(graph).find((root) => (
    root.virtual === true && root.reference.id === reference.id
  ));
}

function traverseVirtualModuleRoot(
  graph: CodeGraph,
  module: StructuralNode,
  query: StructuralTraversalQuery,
): StructuralTraversalResult {
  const includesOutgoing = query.direction !== "incoming";
  const includesContains = query.relationTypes === undefined || query.relationTypes.includes("contains");
  if (!includesOutgoing || !includesContains || query.maxDepth === 0) {
    return { roots: [module.reference], nodes: [module], relations: [], boundaries: [] };
  }
  const root = decodeURIComponent(module.reference.id.slice("module:".length));
  const files = graph.getNodesByKind("file")
    .filter((node) => topLevelDirectory(normalizeRepositoryPath(node.filePath)) === root)
    .map(normalizeNode)
    .sort(compareStructuralNodes);
  return {
    roots: [module.reference],
    nodes: [module, ...files],
    relations: files.map((file): StructuralRelation => ({
      from: module.reference,
      type: "contains",
      to: file.reference,
      support: exactBackendSupport(),
    })),
    boundaries: [],
  };
}

function virtualModuleRoot(root: string, representativePath: string): StructuralNode {
  return {
    reference: { id: `module:${encodeURIComponent(root)}` },
    kind: "Module",
    name: root,
    qualifiedName: root,
    path: representativePath,
    language: "unknown",
    range: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 1 },
    },
    support: exactBackendSupport(),
    virtual: true,
  };
}

function topLevelDirectory(path: string): string {
  const separator = path.indexOf("/");
  return separator === -1 ? "." : path.slice(0, separator);
}

function compareStructuralNodes(left: StructuralNode, right: StructuralNode): number {
  return left.path.localeCompare(right.path)
    || left.qualifiedName.localeCompare(right.qualifiedName)
    || left.reference.id.localeCompare(right.reference.id);
}

function normalizeNodeKind(node: Node): StructuralNode["kind"] {
  if (node.kind === "file") {
    return "File";
  }
  if (node.kind === "module" || node.kind === "namespace") {
    return "Module";
  }
  return isTestNode(node) ? "Test" : "Symbol";
}

function referenceForNode(node: Node): StructuralReference {
  const path = normalizeRepositoryPath(node.filePath);
  if (node.kind === "file") {
    return { id: `file:${path}` };
  }
  const prefix = isTestNode(node) ? "test" : node.kind === "module" || node.kind === "namespace"
    ? "module"
    : "symbol";
  return {
    id: `${prefix}:${encodeURIComponent(path)}#${digest([
      node.id,
      node.kind,
      node.qualifiedName,
    ].join("\0"))}`,
  };
}

function findNodeByReference(graph: CodeGraph, reference: StructuralReference): Node | undefined {
  if (reference.id.startsWith("file:")) {
    return graph.getNode(reference.id) ?? undefined;
  }
  const path = pathFromStructuralReference(reference);
  if (path === undefined) {
    return undefined;
  }
  return graph.getNodesInFile(path).find((node) => referenceForNode(node).id === reference.id);
}

function structuralEvidenceResolver(graph: CodeGraph): StructuralEvidenceResolver {
  return {
    getNode(reference) {
      const node = findNodeByReference(graph, { id: reference });
      return node === undefined ? undefined : normalizeNode(node);
    },
    findCandidates(locator) {
      return graph.getNodesInFile(locator.file)
        .map(normalizeNode)
        .filter((node) => candidateMatchesLocator(node, locator));
    },
    backendLocator(node) {
      return findNodeByReference(graph, node.reference)?.id;
    },
  };
}

function candidateMatchesLocator(node: StructuralNode, locator: StructuralTargetLocator): boolean {
  return (locator.qualifiedSymbol === null || node.qualifiedName === locator.qualifiedSymbol)
    && (locator.structuralKind === null || node.kind === locator.structuralKind);
}

function pathFromStructuralReference(reference: StructuralReference): string | undefined {
  const separatorIndex = reference.id.indexOf(":");
  const hashIndex = reference.id.indexOf("#", separatorIndex + 1);
  if (separatorIndex < 0 || hashIndex < 0) {
    return undefined;
  }
  try {
    return normalizeRepositoryPath(decodeURIComponent(reference.id.slice(separatorIndex + 1, hashIndex)));
  } catch {
    return undefined;
  }
}

function requireNodeByReference(graph: CodeGraph, reference: StructuralReference): Node {
  const node = findNodeByReference(graph, reference);
  if (node === undefined) {
    throw new StructuralBackendError(
      "STRUCTURAL_QUERY_FAILED",
      `Structural reference ${reference.id} does not resolve in the current index`,
    );
  }
  return node;
}

function normalizeRelation(edge: Edge, source: Node, target: Node | undefined): StructuralRelation | undefined {
  const relationType = supportedRelationTypes.get(edge.kind);
  if (relationType === undefined || target === undefined) {
    return undefined;
  }
  const normalizedType = relationType === "contains" && source.kind === "file" && target.kind !== "file"
    ? "declares"
    : relationType;
  return {
    from: referenceForNode(source),
    type: normalizedType,
    to: referenceForNode(target),
    support: supportForEdge(edge),
    ...(edge.line === undefined || edge.line === null
      ? {}
      : {
          location: {
            path: normalizeRepositoryPath(source.filePath),
            position: { line: positiveLine(edge.line), column: (edge.column ?? 0) + 1 },
          },
        }),
  };
}

function requireNormalizedRelation(edge: Edge, source: Node, target: Node): StructuralRelation {
  const relation = normalizeRelation(edge, source, target);
  if (relation === undefined) {
    throw new StructuralBackendError(
      "STRUCTURAL_QUERY_FAILED",
      "The structural backend returned an unsupported call relation",
    );
  }
  return relation;
}

function supportForEdge(edge: Edge): StructuralSupport {
  const provenance = normalizeProvenance(edge.provenance);
  return {
    status: provenance === "heuristic" ? "inferred" : "exact",
    provenance,
  };
}

function normalizeProvenance(provenance: Edge["provenance"] | null): StructuralProvenance {
  return provenance === "tree-sitter" || provenance === "scip" || provenance === "heuristic"
    ? provenance
    : "backend";
}

function exactBackendSupport(): StructuralSupport {
  return { status: "exact", provenance: "backend" };
}

function dependencySupport(edges: readonly Edge[]): StructuralSupport {
  const exactEdge = edges.find((edge) => edge.provenance !== "heuristic");
  if (exactEdge !== undefined) {
    return supportForEdge(exactEdge);
  }
  return edges.length === 0
    ? { status: "inferred", provenance: "backend" }
    : supportForEdge(edges[0]!);
}

function normalizeUnresolvedReferences(
  graph: CodeGraph,
  queries: Pick<QueryBuilder, "getUnresolvedReferences">,
): StructuralUnknownBoundary[] {
  return queries.getUnresolvedReferences().map((reference) => {
    const owner = graph.getNode(reference.fromNodeId) ?? undefined;
    return unresolvedReferenceBoundary(reference, owner);
  });
}

function unresolvedReferenceBoundary(
  reference: UnresolvedReference,
  owner: Node | undefined,
): StructuralUnknownBoundary {
  const ownerReference = owner === undefined
    ? { id: `symbol:unresolved-owner-${digest(reference.fromNodeId)}` }
    : referenceForNode(owner);
  const path = reference.filePath === undefined
    ? owner?.filePath
    : reference.filePath;
  const operation = reference.referenceKind === "function_ref" ? "references" : reference.referenceKind;
  return {
    reference: {
      id: `unknown:${digest([
        ownerReference.id,
        operation,
        reference.referenceName,
        path ?? "",
        reference.line,
        reference.column,
      ].join("\0"))}`,
    },
    kind: "UnknownBoundary",
    owner: ownerReference,
    operation,
    reason: `The structural backend could not resolve ${reference.referenceName}.`,
    ...(path === undefined ? {} : { path: normalizeRepositoryPath(path) }),
    position: { line: positiveLine(reference.line), column: reference.column + 1 },
    candidates: [...(reference.candidates ?? [])].sort(),
    support: { status: "unresolved", provenance: "backend" },
  };
}

function unsupportedRelationBoundary(
  edge: Edge,
  source: Node,
  target: Node | undefined,
): StructuralUnknownBoundary {
  const owner = referenceForNode(source);
  return {
    reference: { id: `unknown:${digest([owner.id, edge.kind, edge.target].join("\0"))}` },
    kind: "UnknownBoundary",
    owner,
    operation: "relation",
    reason: `The structural backend relation ${edge.kind} is outside the Atlas v0.1 relation contract.`,
    path: normalizeRepositoryPath(source.filePath),
    ...(edge.line === undefined || edge.line === null
      ? {}
      : { position: { line: positiveLine(edge.line), column: (edge.column ?? 0) + 1 } }),
    candidates: target === undefined ? [] : [referenceForNode(target).id],
    support: {
      status: "unsupported",
      provenance: normalizeProvenance(edge.provenance) === "backend"
        ? "heuristic"
        : normalizeProvenance(edge.provenance),
    },
  };
}

function normalizeChangedFiles(changes: ReturnType<CodeGraph["getChangedFiles"]>): StructuralFileChanges {
  return {
    added: changes.added.map(normalizeRepositoryPath).sort(),
    modified: changes.modified.map(normalizeRepositoryPath).sort(),
    removed: changes.removed.map(normalizeRepositoryPath).sort(),
  };
}

function hasStructuralFileErrors(graph: CodeGraph): boolean {
  return graph.getFiles().some((file) =>
    file.errors?.some((error) => error.severity === "error") === true);
}

function normalizeRepositoryPath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (normalized.length === 0 || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new StructuralBackendError(
      "STRUCTURAL_QUERY_FAILED",
      `Structural path must be repository-relative: ${path}`,
    );
  }
  return normalized;
}

function isTestNode(node: Node): boolean {
  const path = node.filePath.toLowerCase();
  return /(?:^|\/)(?:__tests__|test|tests|spec|specs)(?:\/|$)/u.test(path) ||
    /(?:^|\.)(?:test|spec)\.[cm]?[jt]sx?$/u.test(path);
}

function positiveLine(line: number): number {
  return Math.max(1, line);
}

function emptyCounts(): StructuralBuildCounts {
  return {
    filesDiscovered: 0,
    filesIndexed: 0,
    filesSkipped: 0,
    filesErrored: 0,
    nodes: 0,
    relations: 0,
  };
}

function emptyChanges(): StructuralFileChanges {
  return { added: [], modified: [], removed: [] };
}

function failureDiagnostic(error: unknown): StructuralDiagnostic {
  return {
    code: "STRUCTURAL_BACKEND_FAILURE",
    message: diagnosticMessage(error instanceof Error ? error.message : String(error)),
  };
}

function structuralRestoreFailureDiagnostic(
  error: unknown,
  backupPath: string,
): StructuralDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  return {
    code: "STRUCTURAL_BACKEND_FAILURE",
    message: `${diagnosticMessage(message)} The published database backup remains at ${backupPath}.`,
  };
}

function incompleteDiagnostic(indexState: ReturnType<CodeGraph["getIndexState"]>): StructuralDiagnostic {
  return {
    code: "STRUCTURAL_INDEX_INCOMPLETE",
    message: `The structural index is ${indexState ?? "not marked complete"}.`,
  };
}

function lockUnavailableDiagnostic(): StructuralDiagnostic {
  return {
    code: "STRUCTURAL_INDEX_INCOMPLETE",
    message: "The structural index operation did not run because another process holds the structural write lock.",
  };
}

function activePublicationDiagnostic(): StructuralDiagnostic {
  return {
    code: "STRUCTURAL_INDEX_INCOMPLETE",
    message: "The structural index cannot serve reads while another process is publishing it.",
  };
}

function activePublicationError(): StructuralBackendError {
  return new StructuralBackendError(
    "STRUCTURAL_INDEX_INCOMPLETE",
    "The structural index cannot serve queries while another process is publishing it",
  );
}

function missingStructuralIndexError(): StructuralBackendError {
  return new StructuralBackendError(
    "STRUCTURAL_INDEX_MISSING",
    "The structural index has not been built for this worktree",
  );
}

function isLockUnavailableSync(result: SyncResult): boolean {
  return result.filesChecked === 0 && result.durationMs === 0;
}

function diagnosticMessage(message: string): string {
  return message.trim().length === 0
    ? "The structural backend operation did not complete."
    : `The structural backend operation did not complete: ${message.trim()}`;
}

function digest(value: string): string {
  return createHash("sha256").update("semantic-atlas:structural:v1\0").update(value).digest("hex");
}

function relationIdentity(relation: StructuralRelation): string {
  return `${relation.from.id}\0${relation.type}\0${relation.to.id}`;
}

function uniqueBy<T>(values: readonly T[], identity: (value: T) => string): T[] {
  return [...new Map(values.map((value) => [identity(value), value])).values()];
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function isFileSystemError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

function loadCodeGraphSdk(): CodeGraphModule {
  // CodeGraph 1.5.0 publishes ESM declarations through a CommonJS SDK shim.
  return require("@colbymchenry/codegraph") as CodeGraphModule;
}

function useHeldCodeGraphWriteLock(graph: CodeGraph): void {
  const graphWithLock = graph as unknown as {
    fileLock?: { acquire(): void; release(): void };
  };
  if (
    graphWithLock.fileLock === undefined ||
    typeof graphWithLock.fileLock.acquire !== "function" ||
    typeof graphWithLock.fileLock.release !== "function"
  ) {
    throw new Error("CodeGraph 1.5.0 does not expose the expected internal write lock");
  }

  // Atlas already owns the same on-disk lock for the complete publication lifecycle.
  graphWithLock.fileLock = {
    acquire: () => undefined,
    release: () => undefined,
  };
}

async function withCodeGraphSdk<T>(
  operation: (sdk: CodeGraphModule) => T | Promise<T>,
): Promise<T> {
  const scheduled = operationQueue.then(async () => {
    const originalDirectory = process.env.CODEGRAPH_DIR;
    process.env.CODEGRAPH_DIR = ATLAS_DIRECTORY;
    try {
      return await operation(loadCodeGraphSdk());
    } finally {
      if (originalDirectory === undefined) {
        delete process.env.CODEGRAPH_DIR;
      } else {
        process.env.CODEGRAPH_DIR = originalDirectory;
      }
    }
  });

  operationQueue = scheduled.then(
    () => undefined,
    () => undefined,
  );
  return scheduled;
}
