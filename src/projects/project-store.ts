import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import {
  projectFileSchema,
  type ProjectFile,
} from "../contracts/project.js";

export interface ProjectStoreOptions {
  readonly userHome: string;
}

export interface ProjectStoreDependencies {
  readonly rename: (source: string, target: string) => Promise<void>;
}

export class ProjectStoreError extends Error {
  public constructor(
    public readonly code: "PROJECT_CONFIG_INVALID" | "PROJECT_CONFIG_STORAGE_FAILED",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProjectStoreError";
  }
}

export class ProjectStore {
  private readonly projectDirectory: string;
  private readonly projectFile: string;
  private readonly moveFile: ProjectStoreDependencies["rename"];

  public constructor(
    options: ProjectStoreOptions,
    dependencies: ProjectStoreDependencies = { rename },
  ) {
    this.projectDirectory = path.join(options.userHome, ".semantic-atlas");
    this.projectFile = path.join(this.projectDirectory, "projects.json");
    this.moveFile = dependencies.rename;
  }

  public async read(): Promise<readonly string[]> {
    let document: string;
    try {
      document = await readFile(this.projectFile, "utf8");
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) return [];
      throw new ProjectStoreError(
        "PROJECT_CONFIG_STORAGE_FAILED",
        `Could not read the registered project file: ${errorMessage(error)}`,
        { cause: error },
      );
    }

    try {
      const parsed = projectFileSchema.parse(JSON.parse(document) as unknown);
      if (!validStoredPaths(parsed.paths)) throw new Error("Project paths are invalid");
      return Object.freeze([...parsed.paths]);
    } catch (error) {
      throw new ProjectStoreError(
        "PROJECT_CONFIG_INVALID",
        "The registered project file is not valid Semantic Atlas project configuration",
        { cause: error },
      );
    }
  }

  public async add(repositoryRoot: string): Promise<"added" | "already_exists"> {
    const normalizedRoot = path.normalize(path.resolve(repositoryRoot));
    const currentPaths = await this.read();
    if (currentPaths.includes(normalizedRoot)) return "already_exists";

    const nextDocument = {
      schemaVersion: 1 as const,
      paths: [...currentPaths, normalizedRoot],
    };
    await this.publish(nextDocument);
    return "added";
  }

  private async publish(document: ProjectFile): Promise<void> {
    await mkdir(this.projectDirectory, { recursive: true, mode: 0o700 });
    const stagePath = path.join(
      this.projectDirectory,
      `.projects.${randomUUID()}.tmp`,
    );
    try {
      const stage = await open(stagePath, "wx", 0o600);
      try {
        await stage.writeFile(`${JSON.stringify(document, null, 2)}\n`, "utf8");
        await stage.sync();
      } finally {
        await stage.close();
      }
      await this.moveFile(stagePath, this.projectFile);
    } catch (error) {
      throw new ProjectStoreError(
        "PROJECT_CONFIG_STORAGE_FAILED",
        `Could not update the registered project file: ${errorMessage(error)}`,
        { cause: error },
      );
    } finally {
      await rm(stagePath, { force: true });
    }
  }
}

function validStoredPaths(paths: readonly string[]): boolean {
  return new Set(paths).size === paths.length
    && paths.every((value) => path.isAbsolute(value) && path.normalize(value) === value);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === code;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected project configuration failure";
}
