import type {
  CliError,
  ContextEnvelope,
  ValidateEnvelope,
} from "../contracts/cli.js";
import type {
  RepositoryMapSource,
  ValidatedBusinessMap,
} from "../contracts/map.js";
import { MapDocumentLoader, RepositoryResolutionError } from "../map/map-document-loader.js";
import { BusinessGraph } from "../map/business-graph.js";
import { MapValidator } from "../map/map-validator.js";
import { ContextQueryService } from "../query/context-query-service.js";

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
      },
    };
  }

  public async context(repositoryPath: string, selector: string): Promise<ContextEnvelope> {
    const result = await this.loadValidatedMap(repositoryPath);
    if (!result.ok) return contextError(result);

    const query = new ContextQueryService(new BusinessGraph(result.map)).query(selector);
    if (!query.found) {
      if (query.ambiguous) {
        return contextError({
          ok: false,
          repository: result.map.source,
          error: {
            code: "CONCEPT_AMBIGUOUS",
            message: `Concept selector '${selector}' matches multiple business concepts`,
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
          message: `Concept selector '${selector}' was not found in the business map`,
          selector,
        },
      });
    }

    return {
      schemaVersion: 1,
      ok: true,
      command: "context",
      repository: result.map.source,
      data: query.data,
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
            message: `No map documents found in ${loaded.source.mapDirectory}`,
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
            message: "Tracked map documents do not form a valid business graph",
            issues: validated.issues,
          },
        };
      }
      return { ok: true, map: validated.map };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: error instanceof RepositoryResolutionError
            ? "REPOSITORY_INVALID"
            : "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Unexpected map command failure",
        },
      };
    }
  }
}

function validateError(result: Extract<ValidatedMapResult, { readonly ok: false }>): ValidateEnvelope {
  return {
    schemaVersion: 1,
    ok: false,
    command: "validate",
    ...(result.repository ? { repository: result.repository } : {}),
    error: result.error,
  };
}

function contextError(result: Extract<ValidatedMapResult, { readonly ok: false }>): ContextEnvelope {
  return {
    schemaVersion: 1,
    ok: false,
    command: "context",
    ...(result.repository ? { repository: result.repository } : {}),
    error: result.error,
  };
}
