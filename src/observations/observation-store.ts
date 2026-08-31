import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import type {
  MaintenanceObservation,
  ObservationKind,
  RepositoryIdentity,
  ReviewObservation,
  TaskObservation,
} from "../contracts/observation.js";
import {
  maintenanceObservationSchema,
  reviewObservationSchema,
  taskObservationSchema,
} from "../contracts/observation.js";
import type { ObservationClaim } from "./observation-claim-manager.js";
import { ObservationClaimManager } from "./observation-claim-manager.js";

const observationDirectoryNames = {
  task: "tasks",
  review: "reviews",
  maintenance: "maintenances",
} as const;

export interface ObservationStoreOptions {
  readonly userHome: string;
}

export interface ObservationStoreDependencies {
  readonly rename: (source: string, target: string) => Promise<void>;
}

export interface ObservationWriteResult {
  readonly outcome: "recorded" | "idempotent";
  readonly kind: ObservationKind;
  readonly id: string;
  readonly path: string;
}

export interface RepositoryObservations {
  readonly tasks: readonly TaskObservation[];
  readonly reviews: readonly ReviewObservation[];
  readonly maintenances: readonly MaintenanceObservation[];
}

export class ObservationConflictError extends Error {
  public constructor(
    public readonly kind: ObservationKind,
    public readonly id: string,
  ) {
    super(`${kind} observation '${id}' already exists with different content`);
    this.name = "ObservationConflictError";
  }
}

export class ObservationStorageError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ObservationStorageError";
  }
}

export class ObservationStore {
  private readonly observationRoot: string;
  private readonly moveFile: ObservationStoreDependencies["rename"];
  private readonly claims = new ObservationClaimManager();

  public constructor(
    options: ObservationStoreOptions,
    dependencies: ObservationStoreDependencies = { rename },
  ) {
    this.observationRoot = path.join(
      options.userHome,
      ".semantic-atlas",
      "observations",
      "v1",
      "repositories",
    );
    this.moveFile = dependencies.rename;
  }

  public async writeTask(observation: TaskObservation): Promise<ObservationWriteResult> {
    return this.write("task", observation);
  }

  public async writeReview(observation: ReviewObservation): Promise<ObservationWriteResult> {
    return this.write("review", observation);
  }

  public async writeMaintenance(
    observation: MaintenanceObservation,
  ): Promise<ObservationWriteResult> {
    return this.write("maintenance", observation);
  }

  public async readTask(
    repository: RepositoryIdentity,
    id: string,
  ): Promise<TaskObservation | undefined> {
    const observationPath = this.observationPath(repository, "task", id);
    const document = await readExistingDocument(observationPath);
    if (document === undefined) return undefined;
    const parsed = taskObservationSchema.safeParse(
      parseStoredDocument(document, observationPath),
    );
    if (!parsed.success || !sameRepository(parsed.data.repository, repository)) {
      throw new ObservationStorageError(
        `Stored task observation '${id}' is invalid`,
      );
    }
    return parsed.data;
  }

  public async readAll(
    repository: RepositoryIdentity,
  ): Promise<RepositoryObservations> {
    const [tasks, reviews, maintenances] = await Promise.all([
      this.readDirectory(repository, "task"),
      this.readDirectory(repository, "review"),
      this.readDirectory(repository, "maintenance"),
    ]);
    return {
      tasks: tasks as readonly TaskObservation[],
      reviews: reviews as readonly ReviewObservation[],
      maintenances: maintenances as readonly MaintenanceObservation[],
    };
  }

  private async write(
    kind: ObservationKind,
    observation: TaskObservation | ReviewObservation | MaintenanceObservation,
  ): Promise<ObservationWriteResult> {
    const directory = this.observationDirectory(observation.repository, kind);
    const observationPath = this.observationPath(
      observation.repository,
      kind,
      observation.id,
    );
    const serialized = `${JSON.stringify(observation, null, 2)}\n`;
    await mkdir(directory, { recursive: true, mode: 0o700 });

    const existing = await this.findExistingObservation(
      observation.repository,
      observation.id,
    );
    if (existing) {
      return replayResult(kind, observation.id, existing, serialized);
    }

    const claimRoot = path.join(
      this.repositoryDirectory(observation.repository),
      ".claims",
    );
    await mkdir(claimRoot, { recursive: true, mode: 0o700 });
    const claimPath = path.join(claimRoot, `${observation.id}.lock`);
    const claim = await this.acquireClaim(
      claimPath,
      observation.repository,
      serialized,
      kind,
      observation.id,
    );
    if ("outcome" in claim) return claim;

    const stagePath = path.join(
      directory,
      `.${observation.id}.${randomUUID()}.tmp`,
    );
    try {
      const afterClaim = await this.findExistingObservation(
        observation.repository,
        observation.id,
      );
      if (afterClaim) {
        return replayResult(kind, observation.id, afterClaim, serialized);
      }

      const stage = await open(stagePath, "wx", 0o600);
      try {
        await stage.writeFile(serialized, "utf8");
        await stage.sync();
      } finally {
        await stage.close();
      }
      await this.claims.assertOwnership(claimPath, claim);
      await this.moveFile(stagePath, observationPath);
      return {
        outcome: "recorded",
        kind,
        id: observation.id,
        path: observationPath,
      };
    } catch (error) {
      if (error instanceof ObservationConflictError) throw error;
      throw new ObservationStorageError(
        `Could not record ${kind} observation '${observation.id}': ${errorMessage(error)}`,
        { cause: error },
      );
    } finally {
      await rm(stagePath, { force: true });
      await this.claims.release(claimPath, claim);
    }
  }

  private async acquireClaim(
    claimPath: string,
    repository: RepositoryIdentity,
    serialized: string,
    kind: ObservationKind,
    id: string,
  ): Promise<ObservationWriteResult | ObservationClaim> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const claim = await this.claims.acquire(claimPath);
      if (claim) return claim;

      const existing = await this.findExistingObservation(repository, id);
      if (existing) {
        return replayResult(kind, id, existing, serialized);
      }
      try {
        if (await this.claims.recoverAbandoned(claimPath)) continue;
      } catch (error) {
        throw new ObservationStorageError(
          `Could not acquire ${kind} observation '${id}': ${errorMessage(error)}`,
          { cause: error },
        );
      }
      await waitForClaim();
    }
    throw new ObservationStorageError(
      `${kind} observation '${id}' is still being recorded by another process`,
    );
  }

  private async findExistingObservation(
    repository: RepositoryIdentity,
    id: string,
  ): Promise<ExistingObservation | undefined> {
    for (const kind of ["task", "review", "maintenance"] as const) {
      const observationPath = this.observationPath(repository, kind, id);
      const document = await readExistingDocument(observationPath);
      if (document !== undefined) {
        return { kind, path: observationPath, document };
      }
    }
    return undefined;
  }

  private async readDirectory(
    repository: RepositoryIdentity,
    kind: ObservationKind,
  ): Promise<readonly (TaskObservation | ReviewObservation | MaintenanceObservation)[]> {
    const directory = this.observationDirectory(repository, kind);
    let fileNames: readonly string[];
    try {
      fileNames = (await readdir(directory))
        .filter((fileName) => fileName.endsWith(".json"))
        .sort((left, right) => left.localeCompare(right));
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) return [];
      throw new ObservationStorageError(
        `Could not read ${kind} observations: ${errorMessage(error)}`,
        { cause: error },
      );
    }

    return Promise.all(fileNames.map(async (fileName) => {
      const observationPath = path.join(directory, fileName);
      const value = parseStoredDocument(
        await readFile(observationPath, "utf8"),
        observationPath,
      );
      const parsed = kind === "task"
        ? taskObservationSchema.safeParse(value)
        : kind === "review"
        ? reviewObservationSchema.safeParse(value)
        : maintenanceObservationSchema.safeParse(value);
      if (!parsed.success || !sameRepository(parsed.data.repository, repository)) {
        throw new ObservationStorageError(
          `Stored ${kind} observation '${fileName}' is invalid`,
        );
      }
      return parsed.data;
    }));
  }

  private observationDirectory(
    repository: RepositoryIdentity,
    kind: ObservationKind,
  ): string {
    return path.join(
      this.repositoryDirectory(repository),
      observationDirectoryNames[kind],
    );
  }

  private repositoryDirectory(repository: RepositoryIdentity): string {
    return path.join(this.observationRoot, repository.id);
  }

  private observationPath(
    repository: RepositoryIdentity,
    kind: ObservationKind,
    id: string,
  ): string {
    return path.join(
      this.observationDirectory(repository, kind),
      `${id}.json`,
    );
  }
}

interface ExistingObservation {
  readonly kind: ObservationKind;
  readonly path: string;
  readonly document: string;
}

function replayResult(
  kind: ObservationKind,
  id: string,
  existing: ExistingObservation,
  expected: string,
): ObservationWriteResult {
  if (existing.kind !== kind || existing.document !== expected) {
    throw new ObservationConflictError(kind, id);
  }
  return { outcome: "idempotent", kind, id, path: existing.path };
}

async function readExistingDocument(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return undefined;
    throw error;
  }
}

function parseStoredDocument(document: string, filePath: string): unknown {
  try {
    return JSON.parse(document) as unknown;
  } catch (error) {
    throw new ObservationStorageError(
      `Stored observation '${filePath}' is not valid JSON`,
      { cause: error },
    );
  }
}

async function waitForClaim(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 5));
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === code;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected storage failure";
}

function sameRepository(
  left: RepositoryIdentity,
  right: RepositoryIdentity,
): boolean {
  return left.kind === right.kind && left.id === right.id;
}
