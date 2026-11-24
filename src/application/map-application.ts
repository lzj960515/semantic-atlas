import { t } from "../i18n/index.js";
import { createHash } from "node:crypto";
import path from "node:path";
import type {
  CliError,
  ContextEnvelope,
  FlowsEnvelope,
  FlowSearchEnvelope,
  SearchEnvelope,
  ValidateEnvelope,
} from "../contracts/cli.js";
import type { MapProjection } from "../contracts/projection.js";
import type { RepositoryMapSource, ValidatedBusinessMap } from "../contracts/map.js";
import { MapDocumentLoader, RepositoryResolutionError } from "../map/map-document-loader.js";
import { BusinessGraph } from "../map/business-graph.js";
import { MapValidator } from "../map/map-validator.js";
import { ContextQueryService } from "../query/context-query-service.js";
import { FlowNavigationService } from "../query/flow-navigation-service.js";
import { FlowSearchService } from "../query/flow-search-service.js";
import { ConceptSearchService } from "../query/concept-search-service.js";
import { QuerySourceLocator } from "../query/query-source-locator.js";
import { MapProjector, type ViewerProjectMetadata } from "../rendering/map-projector.js";
import type { ViewerProject } from "../rendering/viewer-page.js";

type ValidatedMapResult =
  | {
      readonly ok: true;
      readonly map: ValidatedBusinessMap;
    }
  | {
      readonly ok: false;
      readonly repository?: RepositoryMapSource;
      readonly error: CliError;
    };

export type MapProjectionResult =
  | {
      readonly ok: true;
      readonly repository: RepositoryMapSource;
      readonly projection: MapProjection;
    }
  | {
      readonly ok: false;
      readonly repository?: RepositoryMapSource;
      readonly error: CliError;
    };

export type ViewerProjectResult =
  | {
      readonly ok: true;
      readonly repository: RepositoryMapSource;
      readonly viewerProject: ViewerProject;
    }
  | {
      readonly ok: false;
      readonly repository?: RepositoryMapSource;
      readonly error: CliError;
    };

export class MapApplication {
  public constructor(
    private readonly loader = new MapDocumentLoader(),
    private readonly validator = new MapValidator(),
  ) {}

  public async validate(repositoryPath: string): Promise<ValidateEnvelope> {
    const result = await this.loadValidatedMap(repositoryPath);
    if (!result.ok) return validateError(result);

    return {
      schemaVersion: 1,
      ok: true,
      command: "validate",
      repository: result.map.source,
      data: {
        documentCount: result.map.documents.length,
        nodeCount: result.map.nodes.length,
        relationCount: result.map.relations.length,
        flowCount: result.map.flows.length,
      },
    };
  }

  public async context(repositoryPath: string, selector: string): Promise<ContextEnvelope> {
    const result = await this.loadValidatedMap(repositoryPath);
    if (!result.ok) return contextError(result);

    const query = await this.queryService(result.map).query(selector);
    if (!query.found) {
      if (query.ambiguous) {
        return contextError({
          ok: false,
          repository: result.map.source,
          error: {
            code: "CONCEPT_AMBIGUOUS",
            message: t("errors.ambiguousConcept", { selector }),
            selector,
            candidates: query.candidates,
          },
        });
      }
      return contextError({
        ok: false,
        repository: result.map.source,
        error: {
          code: "CONCEPT_NOT_FOUND",
          message: t("errors.conceptNotFound", { selector }),
          selector,
        },
      });
    }

    return {
      schemaVersion: 1,
      ok: true,
      command: "context",
      repository: { root: result.map.source.root },
      data: query.data,
    };
  }

  public async search(repositoryPath: string, query: string): Promise<SearchEnvelope> {
    const result = await this.loadValidatedMap(repositoryPath);
    if (!result.ok) return searchError(result);

    const context = this.queryService(result.map);
    const hits = new ConceptSearchService(result.map.nodes).search(query);
    const results = await Promise.all(
      hits.map(async (hit) => ({
        ...hit,
        map: (await context.describeNode(result.map.nodes.find(({ id }) => id === hit.id)!)).map,
      })),
    );

    return {
      schemaVersion: 1,
      ok: true,
      command: "search",
      repository: { root: result.map.source.root },
      data: {
        query,
        results,
        ...(hits[0] ? { contextFor: hits[0].id } : {}),
        ...(await context.summarize(hits[0] ? [hits[0].id] : [])),
      },
    };
  }

  public async flows(repositoryPath: string, flowId?: string): Promise<FlowsEnvelope> {
    const result = await this.loadValidatedMap(repositoryPath);
    if (!result.ok) {
      return {
        schemaVersion: 1,
        ok: false,
        command: "flows",
        ...(result.repository ? { repository: { root: result.repository.root } } : {}),
        error: result.error,
      };
    }
    const navigation = new FlowNavigationService(new BusinessGraph(result.map));
    const flow = flowId ? result.map.flows.find(({ id }) => id === flowId) : undefined;
    if (flowId && !flow) {
      return {
        schemaVersion: 1,
        ok: false,
        command: "flows",
        repository: { root: result.map.source.root },
        error: {
          code: "FLOW_NOT_FOUND",
          flowId,
          message: t("errors.flowNotFound", { flowId }),
        },
      };
    }
    const context = this.queryService(result.map);
    return {
      schemaVersion: 1,
      ok: true,
      command: "flows",
      repository: { root: result.map.source.root },
      data: flow
        ? {
            selected: await context.flowContext(flow),
            ...(await context.summarize([
              flow.scenario,
              ...flow.steps.flatMap(({ concept }) => (concept ? [concept] : [])),
            ])),
          }
        : { navigation: navigation.directory() },
    };
  }

  public async searchFlows(repositoryPath: string, query: string): Promise<FlowSearchEnvelope> {
    const result = await this.loadValidatedMap(repositoryPath);
    if (!result.ok) {
      return {
        schemaVersion: 1,
        ok: false,
        command: "search",
        ...(result.repository ? { repository: { root: result.repository.root } } : {}),
        error: result.error,
      };
    }
    const context = this.queryService(result.map);
    const hits = new FlowSearchService(new BusinessGraph(result.map)).search(query);
    const results = await Promise.all(
      hits.map(async (hit) => {
        const flow = result.map.flows.find(({ id }) => id === hit.id)!;
        return {
          ...hit,
          map: await context.flowLocation(flow),
          matchedSteps: await Promise.all(
            hit.matchedSteps.map(async (match) => {
              const step = flow.steps.find(({ id }) => id === match.id)!;
              return {
                ...match,
                ...(step.concept ? { concept: step.concept } : {}),
                map: await context.stepLocation(flow, step.id),
              };
            }),
          ),
        };
      }),
    );
    const first = results[0];
    return {
      schemaVersion: 1,
      ok: true,
      command: "search",
      repository: { root: result.map.source.root },
      data: {
        query,
        target: "flows",
        results,
        ...(first ? { contextFor: first.id } : {}),
        ...(await context.summarize(
          first
            ? [
                first.scenarioId,
                ...first.matchedSteps.flatMap(({ concept }) => (concept ? [concept] : [])),
              ]
            : [],
        )),
      },
    };
  }

  private queryService(map: ValidatedBusinessMap): ContextQueryService {
    return new ContextQueryService(new BusinessGraph(map), new QuerySourceLocator(map.source.root));
  }

  public async project(repositoryPath: string): Promise<MapProjectionResult> {
    const result = await this.loadValidatedMap(repositoryPath);
    if (!result.ok) return result;

    const graph = new BusinessGraph(result.map);
    return {
      ok: true,
      repository: result.map.source,
      projection: new MapProjector(graph).project(viewerProjectMetadata(result.map.source.root)),
    };
  }

  public async viewerProject(
    repositoryPath: string,
    metadata?: ViewerProjectMetadata,
  ): Promise<ViewerProjectResult> {
    const result = await this.loadValidatedMap(repositoryPath);
    if (!result.ok) return result;

    const graph = new BusinessGraph(result.map);
    return {
      ok: true,
      repository: result.map.source,
      viewerProject: new MapProjector(graph).viewerProject(
        metadata ?? viewerProjectMetadata(result.map.source.root),
      ),
    };
  }

  private async loadValidatedMap(repositoryPath: string): Promise<ValidatedMapResult> {
    try {
      const loaded = await this.loader.load(repositoryPath);
      if (loaded.source.documents.length === 0) {
        return {
          ok: false,
          repository: loaded.source,
          error: {
            code: "MAP_NOT_FOUND",
            message: t("errors.mapNotFound", { mapDirectory: loaded.source.mapDirectory }),
          },
        };
      }

      const validated = this.validator.validate(loaded.source, loaded.documents, loaded.issues);
      if (!validated.valid) {
        return {
          ok: false,
          repository: loaded.source,
          error: {
            code: "MAP_DOCUMENT_INVALID",
            message: t("errors.invalidGraph"),
            issues: validated.issues,
          },
        };
      }
      return { ok: true, map: validated.map };
    } catch (error) {
      return {
        ok: false,
        error: {
          code:
            error instanceof RepositoryResolutionError ? "REPOSITORY_INVALID" : "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : t("errors.mapFailure"),
        },
      };
    }
  }
}

function viewerProjectMetadata(repositoryRoot: string): {
  readonly id: string;
  readonly name: string;
} {
  return {
    id: createHash("sha256").update(repositoryRoot).digest("hex").slice(0, 16),
    name: path.basename(repositoryRoot),
  };
}

function validateError(
  result: Extract<ValidatedMapResult, { readonly ok: false }>,
): ValidateEnvelope {
  return {
    schemaVersion: 1,
    ok: false,
    command: "validate",
    ...(result.repository ? { repository: result.repository } : {}),
    error: result.error,
  };
}

function contextError(
  result: Extract<ValidatedMapResult, { readonly ok: false }>,
): ContextEnvelope {
  return {
    schemaVersion: 1,
    ok: false,
    command: "context",
    ...(result.repository ? { repository: { root: result.repository.root } } : {}),
    error: result.error,
  };
}

function searchError(result: Extract<ValidatedMapResult, { readonly ok: false }>): SearchEnvelope {
  return {
    schemaVersion: 1,
    ok: false,
    command: "search",
    ...(result.repository ? { repository: { root: result.repository.root } } : {}),
    error: result.error,
  };
}
