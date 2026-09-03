import { MapApplication } from "../application/map-application.js";
import type { CliError } from "../contracts/cli.js";
import type { RepositoryMapSource } from "../contracts/map.js";
import { ProjectStore, ProjectStoreError } from "./project-store.js";

export type ProjectRegistrationResult =
  | {
      readonly ok: true;
      readonly outcome: "added" | "already_exists";
      readonly repository: RepositoryMapSource;
    }
  | {
      readonly ok: false;
      readonly repository?: RepositoryMapSource;
      readonly error: CliError;
    };

export class ProjectRegistrationService {
  public constructor(
    private readonly mapApplication: MapApplication,
    private readonly projectStore: ProjectStore,
  ) {}

  public async add(repositoryPath: string): Promise<ProjectRegistrationResult> {
    const validation = await this.mapApplication.validate(repositoryPath);
    if (!validation.ok) {
      return {
        ok: false,
        ...(validation.repository ? { repository: validation.repository } : {}),
        error: validation.error,
      };
    }

    try {
      return {
        ok: true,
        outcome: await this.projectStore.add(validation.repository.root),
        repository: validation.repository,
      };
    } catch (error) {
      const projectError = error instanceof ProjectStoreError
        ? error
        : new ProjectStoreError(
          "PROJECT_CONFIG_STORAGE_FAILED",
          "Could not update the registered project file",
          { cause: error },
        );
      return {
        ok: false,
        repository: validation.repository,
        error: {
          code: projectError.code,
          message: projectError.message,
        },
      };
    }
  }
}
