import { cliEnvelopeSchema, type CliEnvelope } from "../contracts/cli.js";
import { graphPatchV1Schema } from "../contracts/graph.js";
import type { GraphNeighbor, GraphNodeReference } from "../graph/types.js";
import { GraphStore } from "../graph/graph-store.js";
import { BusinessKnowledgeService } from "../knowledge/business-knowledge-service.js";
import {
  hasSupportedRepositoryLanguage,
  inspectRepositoryLanguages,
  type RepositoryLanguageSupport,
} from "../repository/repository-language-support.js";
import {
  inspectGitRepository,
} from "../repository/repository-inspector.js";
import type { GitRepository } from "../repository/types.js";
import { createRepositorySnapshot } from "../snapshots/repository-snapshot.js";
import type { RepositorySnapshot } from "../snapshots/types.js";
import {
  SnapshotStore,
  type StoredRepositorySnapshot,
} from "../storage/snapshot-store.js";
import { resolveAtlasDatabasePath } from "../storage/atlas-database.js";
import { CodeGraphStructuralBackend } from "../structural-backend/codegraph-backend.js";
import type { StructuralIndexState } from "../structural-backend/types.js";
import { WorldGraphQuery } from "../world/world-graph-query.js";
import { WorldModelService } from "../world/world-model-service.js";
import { WorldSnapshotStore } from "../world/world-snapshot-store.js";
import type { WorldSnapshotState } from "../world/types.js";
import { CliError, invalidInput } from "./cli-error.js";
import type {
  CliCommandName,
  CliIo,
  CliWarning,
  CommandResult,
  ParsedCommand,
} from "./types.js";

export interface RepositoryContext {
  readonly repository: GitRepository;
  readonly currentSnapshot: RepositorySnapshot;
  readonly structural: StructuralIndexState;
  readonly languages: readonly RepositoryLanguageSupport[];
  readonly state: WorldSnapshotState | null;
  readonly publishedSnapshot: StoredRepositorySnapshot | null;
}

export class CliApplication {
  constructor(private readonly io: CliIo) {}

  async openRepository(path: string, command: CliCommandName): Promise<RepositoryContext> {
    let repository: GitRepository;
    try {
      repository = await inspectGitRepository(path);
    } catch {
      throw new CliError(
        3,
        "REPOSITORY_NOT_FOUND",
        "The selected path is not inside a supported Git worktree.",
        command,
      );
    }
    const [currentSnapshot, structural, languages] = await Promise.all([
      createRepositorySnapshot(repository),
      new CodeGraphStructuralBackend(repository).inspect(),
      inspectRepositoryLanguages(repository),
    ]);
    try {
      using world = new WorldSnapshotStore(repository);
      const state = world.readState();
      const publishedSnapshot = state.currentSnapshotId === null
        ? null
        : findPublishedSnapshot(repository, state.currentSnapshotId);
      return { repository, currentSnapshot, structural, languages, state, publishedSnapshot };
    } catch {
      return {
        repository,
        currentSnapshot,
        structural,
        languages,
        state: null,
        publishedSnapshot: null,
      };
    }
  }

  async execute(command: ParsedCommand, context: RepositoryContext): Promise<CommandResult> {
    switch (command.name) {
      case "status":
        return this.status(context);
      case "index":
        return this.index(context);
      case "map.roots":
        return this.mapRoots(context);
      case "map.children":
        return this.mapChildren(command.nodeId, context);
      case "map.search":
        return this.mapSearch(command.query, command.limit, context);
      case "map.show":
        return this.mapShow(command.nodeId, command.depth, context);
      case "learn":
        return this.learn(context);
      case "changes":
        return this.changes(command, context);
    }
  }

  envelope(
    result: CommandResult,
    context: RepositoryContext,
  ): CliEnvelope {
    const partial = hasPartialResult(result.data, result.warnings);
    return cliEnvelopeSchema.parse({
      schemaVersion: 1,
      repository: repositoryDescriptor(context),
      snapshot: snapshotDescriptor(context),
      status: partial ? "partial" : "ok",
      data: result.data,
      warnings: [...result.warnings],
    });
  }

  responseContext(context: RepositoryContext): {
    readonly repository: CliEnvelope["repository"];
    readonly snapshot: CliEnvelope["snapshot"];
  } {
    return {
      repository: repositoryDescriptor(context),
      snapshot: snapshotDescriptor(context),
    };
  }

  private status(context: RepositoryContext): CommandResult {
    const freshness = worldFreshness(context);
    const warnings = statusWarnings(context, freshness);
    return {
      data: {
        command: "status",
        currentRevision: {
          headCommit: context.currentSnapshot.headCommit,
          changes: changeCounts(context.currentSnapshot),
        },
        freshness,
        storeLocation: resolveAtlasDatabasePath(context.repository),
        languages: [...context.languages],
        backend: {
          version: context.structural.backendVersion,
          completeness: context.structural.completeness,
          extractionVersion: context.structural.extractionVersion,
          indexedAt: context.structural.indexedAt,
        },
      },
      warnings,
    };
  }

  private async index(context: RepositoryContext): Promise<CommandResult> {
    if (!hasSupportedRepositoryLanguage(context.languages)) {
      throw new CliError(
        3,
        "UNSUPPORTED_REPOSITORY",
        "The repository has no TypeScript or JavaScript source files to index.",
        "index",
      );
    }
    const previousUnknowns = context.structural.completeness === "complete"
      ? await new CodeGraphStructuralBackend(context.repository).listUnknownBoundaries()
      : [];
    const world = new WorldModelService(context.repository);
    const publication = context.structural.completeness === "incomplete"
      ? await world.build()
      : await world.sync();
    const unknownChanges = compareUnknownBoundaries(
      previousUnknowns,
      publication.structural.boundaries,
    );
    const warnings: CliWarning[] = [
      ...unsupportedLanguageWarnings(context.languages),
      ...publication.staleAssertions.length === 0 ? [] : [{
        code: "STALE_ASSERTION",
        message: `${publication.staleAssertions.length} learned assertions have stale evidence.`,
        details: { assertions: publication.staleAssertions },
      }],
      ...publication.structural.boundaries.length === 0 ? [] : [{
        code: "UNKNOWN_BOUNDARY",
        message: `${publication.structural.boundaries.length} structural operations remain unresolved.`,
      }],
    ];
    return {
      data: {
        command: "index",
        snapshotId: publication.snapshotId,
        facts: publication.structural.factChanges,
        unknowns: {
          added: unknownChanges.added,
          resolved: unknownChanges.resolved,
          total: publication.structural.boundaries.length,
        },
        backendVersion: publication.structural.backendVersion,
        extractionVersion: publication.structural.extractionVersion,
        structuralTotals: {
          nodes: publication.structural.counts.nodes,
          relations: publication.structural.counts.relations,
        },
        staleAssertions: publication.staleAssertions,
      },
      warnings,
    };
  }

  private async mapRoots(context: RepositoryContext): Promise<CommandResult> {
    this.requireCurrentWorld(context, "map.roots");
    using query = new WorldGraphQuery(context.repository);
    const nodes = await query.roots();
    return mapResult({ command: "map.roots", nodes }, context.languages);
  }

  private async mapChildren(nodeId: string, context: RepositoryContext): Promise<CommandResult> {
    this.requireCurrentWorld(context, "map.children");
    using query = new WorldGraphQuery(context.repository);
    const reference = nodeReference(nodeId);
    const children = await query.children(reference);
    if (children === undefined) {
      throw invalidInput(`Map node ${nodeId} was not found.`, "map.children");
    }
    return mapResult({ command: "map.children", nodeId, children }, context.languages);
  }

  private async mapSearch(
    lexicalQuery: string,
    limit: number,
    context: RepositoryContext,
  ): Promise<CommandResult> {
    this.requireCurrentWorld(context, "map.search");
    using query = new WorldGraphQuery(context.repository);
    const results = await query.search(lexicalQuery, { limit });
    return mapResult({ command: "map.search", query: lexicalQuery, limit, results }, context.languages);
  }

  private async mapShow(
    nodeId: string,
    depth: number,
    context: RepositoryContext,
  ): Promise<CommandResult> {
    this.requireCurrentWorld(context, "map.show");
    using query = new WorldGraphQuery(context.repository);
    const view = await query.show(nodeReference(nodeId), { maxDepth: depth });
    if (view === undefined) {
      throw invalidInput(`Map node ${nodeId} was not found.`, "map.show");
    }
    return mapResult({
      command: "map.show",
      node: view.node,
      depth: view.depth,
      neighbors: view.neighbors.map(presentNeighbor),
      invariants: view.invariants,
      tests: view.tests,
      unknowns: view.unknowns,
    }, context.languages);
  }

  private async learn(context: RepositoryContext): Promise<CommandResult> {
    this.requireAvailableWorld(context, "learn");
    const input = await readStandardInput(this.io.stdin);
    let inputValue: unknown;
    try {
      inputValue = JSON.parse(input);
    } catch {
      throw invalidInput("Standard input must contain one complete JSON value.", "learn");
    }
    const parsedPatch = graphPatchV1Schema.safeParse(inputValue);
    if (!parsedPatch.success) {
      throw invalidInput("The GraphPatch input is invalid.", "learn", {
        issues: parsedPatch.error.issues.map(({ code, message, path }) => ({ code, message, path })),
      });
    }
    const patch = parsedPatch.data;
    using graph = new GraphStore(context.repository);
    const applied = await new BusinessKnowledgeService(context.repository, graph).learn(patch);
    return {
      data: { command: "learn", ...applied },
      warnings: unsupportedLanguageWarnings(context.languages),
    };
  }

  private changes(
    command: Extract<ParsedCommand, { name: "changes" }>,
    context: RepositoryContext,
  ): CommandResult {
    this.requireCurrentWorld(context, "changes");
    using query = new WorldGraphQuery(context.repository);
    let changes;
    try {
      changes = query.changes({
        ...(command.fromSnapshotId === undefined ? {} : { fromSnapshotId: command.fromSnapshotId }),
        ...(command.toSnapshotId === undefined ? {} : { toSnapshotId: command.toSnapshotId }),
      });
    } catch (error) {
      throw new CliError(
        4,
        "CHANGE_RANGE_NOT_FOUND",
        error instanceof Error ? error.message : "The requested semantic change range is unavailable.",
        "changes",
      );
    }
    if (changes === undefined) {
      throw new CliError(
        4,
        "CHANGE_RANGE_NOT_FOUND",
        "The requested semantic change range is not available.",
        "changes",
      );
    }
    const warnings = [
      ...unsupportedLanguageWarnings(context.languages),
      ...changes.staleAssertions.length === 0 ? [] : [{
      code: "STALE_ASSERTION",
      message: `${changes.staleAssertions.length} assertions are stale at the target snapshot.`,
      details: { assertions: changes.staleAssertions },
      }],
    ];
    return { data: { command: "changes", ...changes }, warnings };
  }

  private requireAvailableWorld(context: RepositoryContext, command: CliCommandName): void {
    if (context.structural.completeness === "missing" || context.publishedSnapshot === null) {
      throw new CliError(4, "ATLAS_STATE_MISSING", "The repository has no published Atlas index.", command);
    }
    if (context.structural.completeness !== "complete" || context.state?.status !== "current") {
      throw new CliError(4, "ATLAS_STATE_STALE", "The published Atlas index is unavailable.", command);
    }
  }

  private requireCurrentWorld(context: RepositoryContext, command: CliCommandName): void {
    this.requireAvailableWorld(context, command);
    if (worldFreshness(context) !== "current") {
      throw new CliError(
        4,
        "ATLAS_STATE_STALE",
        "The repository differs from the published Atlas snapshot; run index first.",
        command,
      );
    }
  }
}

function compareUnknownBoundaries(
  previous: readonly { readonly reference: { readonly id: string } }[],
  current: readonly { readonly reference: { readonly id: string } }[],
): { readonly added: number; readonly resolved: number } {
  const previousIds = new Set(previous.map(({ reference }) => reference.id));
  const currentIds = new Set(current.map(({ reference }) => reference.id));
  return {
    added: [...currentIds].filter((id) => !previousIds.has(id)).length,
    resolved: [...previousIds].filter((id) => !currentIds.has(id)).length,
  };
}

function repositoryDescriptor(context: RepositoryContext) {
  return {
    id: context.repository.repositoryId,
    root: context.repository.worktreeRoot,
    headCommit: context.currentSnapshot.headCommit,
  };
}

function snapshotDescriptor(context: RepositoryContext) {
  if (context.publishedSnapshot === null) {
    return null;
  }
  return {
    id: context.publishedSnapshot.snapshot.snapshotId,
    gitHead: context.publishedSnapshot.snapshot.headCommit,
    createdAt: context.publishedSnapshot.createdAt,
    freshness: worldFreshness(context) === "current"
      ? "current" as const
      : "stale" as const,
  };
}

function worldFreshness(context: RepositoryContext): "current" | "stale" | "missing" {
  if (context.publishedSnapshot === null) return "missing";
  if (context.state?.status !== "current") return "stale";
  return context.publishedSnapshot.snapshot.snapshotId === context.currentSnapshot.snapshotId
    ? "current"
    : "stale";
}

function findPublishedSnapshot(
  repository: GitRepository,
  snapshotId: string,
): StoredRepositorySnapshot | null {
  using snapshots = new SnapshotStore(repository);
  return snapshots.findStored(snapshotId) ?? null;
}

function changeCounts(snapshot: RepositorySnapshot) {
  return {
    staged: snapshot.changes.staged.length,
    unstaged: snapshot.changes.unstaged.length,
    untracked: snapshot.changes.untracked.length,
  };
}

function statusWarnings(
  context: RepositoryContext,
  freshness: "current" | "stale" | "missing",
): CliWarning[] {
  const warnings = unsupportedLanguageWarnings(context.languages);
  if (freshness === "stale") {
    warnings.push({ code: "STALE_INDEX", message: "The repository differs from the published Atlas snapshot." });
  }
  if (context.structural.completeness === "incomplete") {
    warnings.push({
      code: "INCOMPLETE_INDEX",
      message: "The structural index is incomplete.",
      details: { diagnostics: context.structural.diagnostics },
    });
  }
  return warnings;
}

function unsupportedLanguageWarnings(
  languages: readonly RepositoryLanguageSupport[],
): CliWarning[] {
  return languages.flatMap((language) => (
    language.support === "unsupported"
      ? [{ code: "UNSUPPORTED_LANGUAGE", message: language.reason, details: { language: language.language } }]
      : []
  ));
}

function mapResult(
  data: unknown,
  languages: readonly RepositoryLanguageSupport[],
): CommandResult {
  const warnings = unsupportedLanguageWarnings(languages);
  if (containsUnknown(data)) {
    warnings.push({ code: "UNKNOWN_BOUNDARY", message: "The result contains unresolved structural behavior." });
  }
  if (containsStale(data)) {
    warnings.push({ code: "STALE_ASSERTION", message: "The result contains stale learned assertions." });
  }
  return { data, warnings };
}

function presentNeighbor(neighbor: GraphNeighbor) {
  return {
    type: neighbor.relation.type,
    direction: neighbor.direction,
    node: neighbor.node,
    certainty: neighbor.relation.certainty,
    validity: neighbor.relation.validity,
    evidence: neighbor.relation.evidence,
    ...(neighbor.relation.domain === "structural" ? { support: neighbor.relation.support } : {}),
    depth: neighbor.depth,
  };
}

function nodeReference(nodeId: string): GraphNodeReference {
  return /^(?:repository|module|file|symbol|test|unknown):/u.test(nodeId)
    ? { domain: "structural", id: nodeId }
    : { domain: "business", key: nodeId };
}

function containsUnknown(data: unknown): boolean {
  return JSON.stringify(data).includes('"validity":"unknown"');
}

function containsStale(data: unknown): boolean {
  return JSON.stringify(data).includes('"validity":"stale"')
    || isChangesWithStaleAssertions(data);
}

function hasPartialResult(data: unknown, warnings: readonly CliWarning[]): boolean {
  return warnings.length > 0 || containsUnknown(data) || containsStale(data);
}

function isChangesWithStaleAssertions(
  data: unknown,
): data is { readonly command: "changes"; readonly staleAssertions: readonly string[] } {
  return typeof data === "object"
    && data !== null
    && "command" in data
    && data.command === "changes"
    && "staleAssertions" in data
    && Array.isArray(data.staleAssertions)
    && data.staleAssertions.length > 0;
}

async function readStandardInput(input: NodeJS.ReadableStream): Promise<string> {
  let contents = "";
  for await (const chunk of input) {
    contents += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
  }
  if (contents.trim().length === 0) {
    throw invalidInput("Standard input must contain one complete JSON value.", "learn");
  }
  return contents;
}
