import { randomUUID } from "node:crypto";
import { constants as fileSystemConstants } from "node:fs";
import {
  lstat,
  mkdtemp,
  open,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";

const ACTIVE_PUBLICATION_DIRECTORY = ".structural-publication";
const STAGING_DIRECTORY_PREFIX = ".structural-publication-staging-";
const CLEANUP_DIRECTORY_PREFIX = ".structural-publication-cleanup-";
const PUBLICATION_MANIFEST = "publication.json";
const PUBLISHED_DATABASE = "published.db";
const DATABASE_SIDECARS = ["-wal", "-shm", "-journal"] as const;

interface PublicationManifest {
  readonly version: 1;
  readonly hasPublishedDatabase: boolean;
}

const require = createRequire(import.meta.url);

export class StructuralPublication {
  readonly #databasePath: string;
  readonly #atlasDirectory: string;
  readonly #activeDirectory: string;
  readonly #hasPublishedDatabase: boolean;
  #active = true;

  private constructor(databasePath: string, hasPublishedDatabase: boolean) {
    this.#databasePath = databasePath;
    this.#atlasDirectory = dirname(databasePath);
    this.#activeDirectory = join(this.#atlasDirectory, ACTIVE_PUBLICATION_DIRECTORY);
    this.#hasPublishedDatabase = hasPublishedDatabase;
  }

  get backupPath(): string {
    return join(this.#activeDirectory, PUBLISHED_DATABASE);
  }

  static async begin(
    databasePath: string,
    hasPublishedDatabase: boolean,
  ): Promise<StructuralPublication> {
    const atlasDirectory = await verifyAtlasDatabaseLocation(databasePath);
    const activeDirectory = join(atlasDirectory, ACTIVE_PUBLICATION_DIRECTORY);
    await requireMissingPath(activeDirectory, "An unfinished structural publication already exists");

    const stagingDirectory = await mkdtemp(join(atlasDirectory, STAGING_DIRECTORY_PREFIX));
    try {
      if (hasPublishedDatabase) {
        const backupPath = join(stagingDirectory, PUBLISHED_DATABASE);
        await captureDatabase(databasePath, backupPath);
        await verifySqliteDatabase(backupPath);
      }
      await writeManifest(stagingDirectory, { version: 1, hasPublishedDatabase });
      await rename(stagingDirectory, activeDirectory);
      return new StructuralPublication(databasePath, hasPublishedDatabase);
    } catch (error) {
      await rm(stagingDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  static async recoverAbandoned(databasePath: string): Promise<boolean> {
    const atlasDirectory = await verifyAtlasDatabaseLocation(databasePath);
    const activeDirectory = join(atlasDirectory, ACTIVE_PUBLICATION_DIRECTORY);
    await cleanupOrphanedPublicationDirectories(atlasDirectory);

    let manifest: PublicationManifest;
    try {
      await verifyOwnedDirectory(activeDirectory, "The structural publication state");
      manifest = await readManifest(activeDirectory);
    } catch (error) {
      if (isFileSystemError(error, "ENOENT")) {
        return false;
      }
      throw error;
    }

    const publication = new StructuralPublication(databasePath, manifest.hasPublishedDatabase);
    await publication.rollback();
    return true;
  }

  async commit(): Promise<void> {
    this.requireActive();
    await verifyOwnedDirectory(this.#activeDirectory, "The structural publication state");
    const cleanupDirectory = this.cleanupDirectoryPath();
    await rename(this.#activeDirectory, cleanupDirectory);
    this.#active = false;
    await rm(cleanupDirectory, { recursive: true, force: true }).catch(() => undefined);
  }

  async rollback(): Promise<void> {
    this.requireActive();
    await verifyOwnedDirectory(this.#activeDirectory, "The structural publication state");
    const manifest = await readManifest(this.#activeDirectory);
    if (manifest.hasPublishedDatabase !== this.#hasPublishedDatabase) {
      throw new Error("The structural publication manifest changed during recovery");
    }

    if (this.#hasPublishedDatabase) {
      await verifyOwnedRegularFile(this.backupPath, "The published structural database backup");
      await restoreDatabase(this.backupPath, this.#databasePath);
      await verifySqliteDatabase(this.#databasePath);
    } else {
      await removeUnpublishedDatabase(this.#databasePath);
    }

    const cleanupDirectory = this.cleanupDirectoryPath();
    await rename(this.#activeDirectory, cleanupDirectory);
    this.#active = false;
    await rm(cleanupDirectory, { recursive: true, force: true }).catch(() => undefined);
  }

  private cleanupDirectoryPath(): string {
    return join(this.#atlasDirectory, `${CLEANUP_DIRECTORY_PREFIX}${randomUUID()}`);
  }

  private requireActive(): void {
    if (!this.#active) {
      throw new Error("The structural publication lifecycle has already finished");
    }
  }
}

async function captureDatabase(databasePath: string, backupPath: string): Promise<void> {
  const sqlite = loadNodeSqliteBackup();
  const database = new sqlite.DatabaseSync(databasePath, { readOnly: true });
  try {
    await sqlite.backup(database, backupPath);
  } finally {
    database.close();
  }
}

async function restoreDatabase(backupPath: string, databasePath: string): Promise<void> {
  const sqlite = loadNodeSqliteBackup();
  const publishedDatabase = new sqlite.DatabaseSync(backupPath, { readOnly: true });
  try {
    await removeUnpublishedDatabase(databasePath);
    await sqlite.backup(publishedDatabase, databasePath);
  } finally {
    publishedDatabase.close();
  }
}

function loadNodeSqliteBackup(): typeof import("node:sqlite") {
  const sqlite = require("node:sqlite") as typeof import("node:sqlite");
  if (typeof sqlite.backup !== "function") {
    throw new Error("The structural backend runtime does not support online SQLite backups");
  }
  return sqlite;
}

async function verifySqliteDatabase(databasePath: string): Promise<void> {
  await verifyOwnedRegularFile(databasePath, "The structural database");
  const { DatabaseSync } = loadNodeSqliteBackup();
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const result = database.prepare("PRAGMA integrity_check").get() as
      | { integrity_check?: unknown }
      | undefined;
    if (result?.integrity_check !== "ok") {
      throw new Error("The restored structural database failed its integrity check");
    }
  } finally {
    database.close();
  }
}

async function writeManifest(
  directoryPath: string,
  manifest: PublicationManifest,
): Promise<void> {
  const manifestPath = join(directoryPath, PUBLICATION_MANIFEST);
  const noFollow = fileSystemConstants.O_NOFOLLOW ?? 0;
  const file = await open(
    manifestPath,
    fileSystemConstants.O_WRONLY |
      fileSystemConstants.O_CREAT |
      fileSystemConstants.O_EXCL |
      noFollow,
    0o600,
  );
  try {
    await file.writeFile(`${JSON.stringify(manifest)}\n`, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
}

async function readManifest(directoryPath: string): Promise<PublicationManifest> {
  const manifestPath = join(directoryPath, PUBLICATION_MANIFEST);
  await verifyOwnedRegularFile(manifestPath, "The structural publication manifest");
  const noFollow = fileSystemConstants.O_NOFOLLOW ?? 0;
  const file = await open(manifestPath, fileSystemConstants.O_RDONLY | noFollow);
  try {
    const parsed = JSON.parse(await file.readFile("utf8")) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("hasPublishedDatabase" in parsed) ||
      typeof parsed.hasPublishedDatabase !== "boolean"
    ) {
      throw new Error("The structural publication manifest is invalid");
    }
    return { version: 1, hasPublishedDatabase: parsed.hasPublishedDatabase };
  } finally {
    await file.close();
  }
}

async function removeUnpublishedDatabase(databasePath: string): Promise<void> {
  for (const path of [databasePath, ...DATABASE_SIDECARS.map((suffix) => `${databasePath}${suffix}`)]) {
    try {
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error("The unpublished structural database state is not a regular file");
      }
      await rm(path);
    } catch (error) {
      if (!isFileSystemError(error, "ENOENT")) {
        throw error;
      }
    }
  }
}

async function cleanupOrphanedPublicationDirectories(atlasDirectory: string): Promise<void> {
  const entries = await readdir(atlasDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (
      entry.name.startsWith(STAGING_DIRECTORY_PREFIX) ||
      entry.name.startsWith(CLEANUP_DIRECTORY_PREFIX)
    ) {
      const path = join(atlasDirectory, entry.name);
      await verifyOwnedDirectory(path, "The orphaned structural publication state");
      await rm(path, { recursive: true, force: true });
    }
  }
}

async function verifyAtlasDatabaseLocation(databasePath: string): Promise<string> {
  if (basename(databasePath) !== "codegraph.db") {
    throw new Error("The structural publication database must use the Atlas database path");
  }
  const atlasDirectory = dirname(resolve(databasePath));
  await verifyOwnedDirectory(atlasDirectory, "The Atlas store");
  if (resolve(await realpath(atlasDirectory)) !== atlasDirectory) {
    throw new Error("The Atlas store resolves outside the target worktree");
  }
  return atlasDirectory;
}

async function verifyOwnedDirectory(path: string, label: string): Promise<void> {
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory`);
  }
  if (resolve(await realpath(path)) !== resolve(path)) {
    throw new Error(`${label} resolves outside the Atlas store`);
  }
}

async function verifyOwnedRegularFile(path: string, label: string): Promise<void> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file`);
  }
  if (resolve(await realpath(path)) !== resolve(path)) {
    throw new Error(`${label} resolves outside the Atlas store`);
  }
}

async function requireMissingPath(path: string, message: string): Promise<void> {
  try {
    await lstat(path);
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) {
      return;
    }
    throw error;
  }
  throw new Error(message);
}

function isFileSystemError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
