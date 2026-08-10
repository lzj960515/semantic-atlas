import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { inspectGitRepository } from "../../src/repository/repository-inspector.js";
import { createRepositorySnapshot } from "../../src/snapshots/repository-snapshot.js";
import {
  resolveAtlasDataDirectory,
  SnapshotStore,
} from "../../src/storage/snapshot-store.js";
import { createGitFixture, type GitFixture } from "../support/git-fixture.js";

async function captureDirectory(directory: string): Promise<Record<string, string>> {
  const contents: Record<string, string> = {};

  async function visit(currentDirectory: string, relativeDirectory: string): Promise<void> {
    for (const entry of await readdir(currentDirectory, { withFileTypes: true })) {
      const relativePath = join(relativeDirectory, entry.name);
      const absolutePath = join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
        continue;
      }

      const fileStat = await stat(absolutePath);
      const content = await readFile(absolutePath);
      contents[relativePath] = `${fileStat.mode}:${createHash("sha256").update(content).digest("hex")}`;
    }
  }

  await visit(directory, "");
  return contents;
}

describe("external snapshot storage", () => {
  const fixtures: GitFixture[] = [];

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
  });

  it("resolves cross-platform user data paths", () => {
    expect(resolveAtlasDataDirectory({
      platform: "darwin",
      homeDirectory: "/Users/agent",
      environment: {},
    })).toBe("/Users/agent/Library/Application Support/semantic-atlas");
    expect(resolveAtlasDataDirectory({
      platform: "linux",
      homeDirectory: "/home/agent",
      environment: { XDG_DATA_HOME: "/data" },
    })).toBe("/data/semantic-atlas");
    expect(resolveAtlasDataDirectory({
      platform: "linux",
      homeDirectory: "/home/agent",
      environment: { XDG_DATA_HOME: "" },
    })).toBe("/home/agent/.local/share/semantic-atlas");
    expect(resolveAtlasDataDirectory({
      platform: "win32",
      homeDirectory: "C:\\Users\\agent",
      environment: { LOCALAPPDATA: "D:\\Local" },
    })).toBe("D:\\Local\\semantic-atlas");
  });

  it("persists and retrieves snapshots without modifying the target repository", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const storageFixture = await createGitFixture();
    fixtures.push(storageFixture);
    const dataDirectory = join(storageFixture.directory, "atlas-data");
    const before = await captureDirectory(fixture.directory);

    const repository = await inspectGitRepository(fixture.directory);
    const snapshot = await createRepositorySnapshot(repository);
    const store = new SnapshotStore(dataDirectory, repository);
    store.save(snapshot);

    expect(store.find(snapshot.snapshotId)).toEqual(snapshot);
    expect(store.latest()).toEqual(snapshot);
    store.close();

    using reopenedStore = new SnapshotStore(dataDirectory, repository);
    expect(reopenedStore.latest()).toEqual(snapshot);
    expect(await captureDirectory(fixture.directory)).toEqual(before);
    expect(await fixture.git("status", "--porcelain", "--untracked-files=all")).toBe("");
  });

  it("rejects a storage directory inside the target repository", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const repository = await inspectGitRepository(fixture.directory);

    expect(() => new SnapshotStore(join(fixture.directory, ".semantic-atlas"), repository))
      .toThrow("Atlas data directory must be outside the target repository");
  });
});
