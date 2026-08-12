import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

export class StructuralDatabaseBackup {
  readonly #databasePath: string;
  readonly #directoryPath: string;
  readonly #backupPath: string;

  private constructor(databasePath: string, directoryPath: string, backupPath: string) {
    this.#databasePath = databasePath;
    this.#directoryPath = directoryPath;
    this.#backupPath = backupPath;
  }

  get path(): string {
    return this.#backupPath;
  }

  static async capture(databasePath: string): Promise<StructuralDatabaseBackup> {
    const atlasDirectory = dirname(databasePath);
    const directoryPath = await mkdtemp(join(atlasDirectory, ".structural-backup-"));
    const backupPath = join(directoryPath, "published.db");
    try {
      const sqlite = loadNodeSqliteBackup();
      const database = new sqlite.DatabaseSync(databasePath, { readOnly: true });
      try {
        await sqlite.backup(database, backupPath);
      } finally {
        database.close();
      }
      return new StructuralDatabaseBackup(databasePath, directoryPath, backupPath);
    } catch (error) {
      await rm(directoryPath, { recursive: true, force: true });
      throw error;
    }
  }

  async restore(): Promise<void> {
    const sqlite = loadNodeSqliteBackup();
    const publishedDatabase = new sqlite.DatabaseSync(this.#backupPath, { readOnly: true });
    try {
      await sqlite.backup(publishedDatabase, this.#databasePath);
    } finally {
      publishedDatabase.close();
    }
    verifySqliteDatabase(this.#databasePath);
    await this.discard();
  }

  async discard(): Promise<void> {
    await rm(this.#directoryPath, { recursive: true, force: true });
  }
}

function loadNodeSqliteBackup(): typeof import("node:sqlite") {
  const sqlite = require("node:sqlite") as typeof import("node:sqlite");
  if (typeof sqlite.backup !== "function") {
    throw new Error("The structural backend runtime does not support online SQLite backups");
  }
  return sqlite;
}

function verifySqliteDatabase(databasePath: string): void {
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
