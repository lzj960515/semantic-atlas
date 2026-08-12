import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { inspectGitRepository } from "../../src/repository/repository-inspector.js";
import { createRepositorySnapshot } from "../../src/snapshots/repository-snapshot.js";
import { SnapshotStore } from "../../src/storage/snapshot-store.js";
import { CodeGraphStructuralBackend } from "../../src/structural-backend/codegraph-backend.js";
import { createGitFixture, type GitFixture } from "../support/git-fixture.js";

describe("worktree snapshot storage", () => {
  const fixtures: GitFixture[] = [];

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
  });

  it("requires the structural lifecycle to initialize the shared database", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const repository = await inspectGitRepository(fixture.directory);

    expect(() => new SnapshotStore(repository)).toThrow();
    await expect(access(join(fixture.directory, ".atlas"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("persists and retrieves snapshots from the ignored worktree store", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const repository = await inspectGitRepository(fixture.directory);
    const structural = await new CodeGraphStructuralBackend(repository).build();
    expect(structural.completeness).toBe("complete");
    const snapshot = await createRepositorySnapshot(repository);

    using store = new SnapshotStore(repository);
    store.save(snapshot);
    expect(store.databasePath).toBe(join(repository.worktreeRoot, ".atlas", "codegraph.db"));
    expect(store.find(snapshot.snapshotId)).toEqual(snapshot);
    expect(store.latest()).toEqual(snapshot);
    store.close();

    using reopenedStore = new SnapshotStore(repository);
    expect(reopenedStore.latest()).toEqual(snapshot);
    expect(await readFile(join(fixture.directory, ".atlas", ".gitignore"), "utf8")).toBe("*\n");
    expect(await fixture.git("status", "--porcelain", "--untracked-files=all")).toBe("");
  });

  it("rejects snapshots from another repository", async () => {
    const fixture = await createGitFixture();
    const otherFixture = await createGitFixture();
    fixtures.push(fixture, otherFixture);
    const repository = await inspectGitRepository(fixture.directory);
    const otherRepository = await inspectGitRepository(otherFixture.directory);
    await new CodeGraphStructuralBackend(repository).build();
    const otherSnapshot = await createRepositorySnapshot(otherRepository);

    using store = new SnapshotStore(repository);
    expect(() => store.save(otherSnapshot)).toThrow("Cannot store a snapshot from another repository");
  });
});
