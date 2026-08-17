import { access, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { CliApplication } from "../../src/cli/cli-application.js";
import { inspectGitRepository } from "../../src/repository/repository-inspector.js";
import { createRepositorySnapshot } from "../../src/snapshots/repository-snapshot.js";
import { AtlasDatabase } from "../../src/storage/atlas-database.js";
import { StructuralProjectionBootstrapper } from "../../src/structural-backend/structural-projection-bootstrapper.js";
import { StructuralWriteLock } from "../../src/structural-backend/structural-write-lock.js";
import { WorldModelService } from "../../src/world/world-model-service.js";
import { createGitFixture, type GitFixture } from "../support/git-fixture.js";

describe("worktree structural projection bootstrap", () => {
  const fixtures: GitFixture[] = [];
  const worktrees: string[] = [];

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map(async (fixture) => {
      for (const worktree of worktrees.splice(0)) {
        await fixture.git("worktree", "remove", "--force", worktree).catch(() => undefined);
      }
      await fixture.cleanup();
    }));
  });

  it("opens a sibling backup at a changed linked-worktree root and syncs only its real change", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    await fixture.write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
    await fixture.git("add", "pnpm-lock.yaml");
    await fixture.git("commit", "-m", "test: add a CodeGraph-only manifest file");
    const primaryRepository = await inspectGitRepository(fixture.directory);
    const primaryPublication = await new WorldModelService(primaryRepository).build();
    expect(primaryPublication.structural.mode).toBe("initial");

    const linkedWorktree = `${fixture.directory}-linked`;
    worktrees.push(linkedWorktree);
    await fixture.git("worktree", "add", "-b", "fixture-linked", linkedWorktree);
    await writeFile(join(linkedWorktree, "src/example.ts"), "export const value = 2;\n");

    const linkedRepository = await inspectGitRepository(linkedWorktree);
    const linkedSnapshot = await createRepositorySnapshot(linkedRepository);
    const bootstrapped = await new StructuralProjectionBootstrapper(linkedRepository)
      .bootstrap(linkedSnapshot);

    expect(bootstrapped).toBe(true);
    const linkedPublication = await new WorldModelService(linkedRepository).sync();
    expect(linkedPublication.structural).toMatchObject({
      mode: "incremental",
      completeness: "complete",
      changes: {
        added: [],
        modified: ["src/example.ts"],
        removed: [],
      },
    });
    expect(linkedPublication.structural.counts.filesIndexed).toBe(1);
  }, 30_000);

  it("skips a locked source and retries it after the lock is released", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const primaryRepository = await inspectGitRepository(fixture.directory);
    await new WorldModelService(primaryRepository).build();
    const destination = `${fixture.directory}-destination`;
    worktrees.push(destination);
    await fixture.git("worktree", "add", "-b", "fixture-destination", destination);
    const destinationRepository = await inspectGitRepository(destination);
    const snapshot = await createRepositorySnapshot(destinationRepository);
    const sourceLock = StructuralWriteLock.acquire(join(
      primaryRepository.worktreeRoot,
      ".atlas",
      "semantic-atlas.lock",
    ));
    if (sourceLock === undefined) {
      throw new Error("Expected to acquire the source projection lock");
    }
    try {
      await expect(new StructuralProjectionBootstrapper(destinationRepository).bootstrap(snapshot))
        .resolves.toBe(false);
    } finally {
      sourceLock.release();
    }
    await expect(new StructuralProjectionBootstrapper(destinationRepository).bootstrap(snapshot))
      .resolves.toBe(true);
  });

  it("does not restore a sibling before acquiring the destination publication lock", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const primaryRepository = await inspectGitRepository(fixture.directory);
    await new WorldModelService(primaryRepository).build();

    const destination = `${fixture.directory}-destination`;
    worktrees.push(destination);
    await fixture.git("worktree", "add", "-b", "fixture-destination", destination);
    const atlasDirectory = join(destination, ".atlas");
    await mkdir(atlasDirectory);
    await writeFile(join(atlasDirectory, ".gitignore"), "*\n");
    const application = new CliApplication({
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
    });
    const context = await application.openRepository(destination, "index");
    const destinationLock = StructuralWriteLock.acquire(join(
      atlasDirectory,
      "semantic-atlas.lock",
    ));
    if (destinationLock === undefined) {
      throw new Error("Expected to acquire the destination projection lock");
    }
    try {
      await expect(application.execute({ name: "index" }, context)).rejects.toThrow(/lock/i);
      await expect(access(join(atlasDirectory, "codegraph.db"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      destinationLock.release();
    }
  });

  it("skips the newest manifest-mismatched candidate and restores the next compatible source", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const primaryRepository = await inspectGitRepository(fixture.directory);
    await new WorldModelService(primaryRepository).build();

    const candidatePath = `${fixture.directory}-candidate`;
    worktrees.push(candidatePath);
    await fixture.git("worktree", "add", "-b", "fixture-candidate", candidatePath);
    const candidateRepository = await inspectGitRepository(candidatePath);
    const candidateSnapshot = await createRepositorySnapshot(candidateRepository);
    await new StructuralProjectionBootstrapper(candidateRepository).bootstrap(candidateSnapshot);
    await new WorldModelService(candidateRepository).sync();
    using atlas = new AtlasDatabase(candidateRepository);
    atlas.connection.prepare(`
      UPDATE atlas_worktree_states
      SET published_at = '9999-12-31T23:59:59.999Z'
      WHERE repository_id = ? AND git_directory = ?
    `).run(candidateRepository.repositoryId, candidateRepository.gitDirectory);
    using candidateDatabase = new DatabaseSync(join(candidatePath, ".atlas", "codegraph.db"));
    candidateDatabase.prepare("UPDATE files SET content_hash = ? WHERE path = ?")
      .run("0".repeat(64), "src/example.ts");

    const destination = `${fixture.directory}-destination`;
    worktrees.push(destination);
    await fixture.git("worktree", "add", "-b", "fixture-destination", destination);
    const destinationRepository = await inspectGitRepository(destination);
    const snapshot = await createRepositorySnapshot(destinationRepository);
    await expect(new StructuralProjectionBootstrapper(destinationRepository).bootstrap(snapshot))
      .resolves.toBe(true);
    using destinationDatabase = new DatabaseSync(join(destination, ".atlas", "codegraph.db"), {
      readOnly: true,
    });
    expect(destinationDatabase.prepare(`
      SELECT content_hash
      FROM files
      WHERE path = 'src/example.ts'
    `).get()).not.toEqual({ content_hash: "0".repeat(64) });
  });

  it("rejects an incompatible candidate even when it is the newest publication", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const primaryRepository = await inspectGitRepository(fixture.directory);
    await new WorldModelService(primaryRepository).build();
    const incompatiblePath = `${fixture.directory}-incompatible`;
    worktrees.push(incompatiblePath);
    await fixture.git("worktree", "add", "-b", "fixture-incompatible", incompatiblePath);
    const incompatibleRepository = await inspectGitRepository(incompatiblePath);
    const incompatibleSnapshot = await createRepositorySnapshot(incompatibleRepository);
    await new StructuralProjectionBootstrapper(incompatibleRepository).bootstrap(incompatibleSnapshot);
    await new WorldModelService(incompatibleRepository).sync();
    using atlas = new AtlasDatabase(incompatibleRepository);
    atlas.connection.prepare(`
      UPDATE atlas_worktree_states
      SET backend_version = '9.0.0', published_at = '9999-12-31T23:59:59.999Z'
      WHERE repository_id = ? AND git_directory = ?
    `).run(incompatibleRepository.repositoryId, incompatibleRepository.gitDirectory);

    const destination = `${fixture.directory}-destination`;
    worktrees.push(destination);
    await fixture.git("worktree", "add", "-b", "fixture-destination", destination);
    const destinationRepository = await inspectGitRepository(destination);
    const snapshot = await createRepositorySnapshot(destinationRepository);
    const primaryLock = StructuralWriteLock.acquire(join(
      primaryRepository.worktreeRoot,
      ".atlas",
      "semantic-atlas.lock",
    ));
    if (primaryLock === undefined) {
      throw new Error("Expected to acquire the primary projection lock");
    }
    try {
      await expect(new StructuralProjectionBootstrapper(destinationRepository).bootstrap(snapshot))
        .resolves.toBe(false);
    } finally {
      primaryLock.release();
    }
  });

  it("rejects a complete projection built with a stale extraction version", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const primaryRepository = await inspectGitRepository(fixture.directory);
    await new WorldModelService(primaryRepository).build();
    using atlas = new AtlasDatabase(primaryRepository);
    atlas.connection.prepare(`
      UPDATE atlas_worktree_states
      SET extraction_version = 23
      WHERE repository_id = ? AND git_directory = ?
    `).run(primaryRepository.repositoryId, primaryRepository.gitDirectory);
    using primaryDatabase = new DatabaseSync(join(
      primaryRepository.worktreeRoot,
      ".atlas",
      "codegraph.db",
    ));
    primaryDatabase.prepare(`
      UPDATE project_metadata
      SET value = '23'
      WHERE key = 'indexed_with_extraction_version'
    `).run();

    const destination = `${fixture.directory}-destination`;
    worktrees.push(destination);
    await fixture.git("worktree", "add", "-b", "fixture-destination", destination);
    const destinationRepository = await inspectGitRepository(destination);
    const snapshot = await createRepositorySnapshot(destinationRepository);
    await expect(new StructuralProjectionBootstrapper(destinationRepository).bootstrap(snapshot))
      .resolves.toBe(false);
  });

  it("rejects a symlinked sibling database", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const primaryRepository = await inspectGitRepository(fixture.directory);
    await new WorldModelService(primaryRepository).build();

    const symlinkedPath = `${fixture.directory}-symlinked`;
    worktrees.push(symlinkedPath);
    await fixture.git("worktree", "add", "-b", "fixture-symlinked", symlinkedPath);
    const symlinkedRepository = await inspectGitRepository(symlinkedPath);
    const symlinkedSnapshot = await createRepositorySnapshot(symlinkedRepository);
    await new StructuralProjectionBootstrapper(symlinkedRepository).bootstrap(symlinkedSnapshot);
    await new WorldModelService(symlinkedRepository).sync();
    const symlinkedDatabase = join(symlinkedPath, ".atlas", "codegraph.db");
    await rm(symlinkedDatabase);
    await symlink(
      join(primaryRepository.worktreeRoot, ".atlas", "codegraph.db"),
      symlinkedDatabase,
    );

    const destination = `${fixture.directory}-destination`;
    worktrees.push(destination);
    await fixture.git("worktree", "add", "-b", "fixture-destination", destination);
    const destinationRepository = await inspectGitRepository(destination);
    const snapshot = await createRepositorySnapshot(destinationRepository);
    const primaryLock = StructuralWriteLock.acquire(join(
      primaryRepository.worktreeRoot,
      ".atlas",
      "semantic-atlas.lock",
    ));
    if (primaryLock === undefined) {
      throw new Error("Expected to acquire the primary projection lock");
    }
    try {
      await expect(new StructuralProjectionBootstrapper(destinationRepository).bootstrap(snapshot))
        .resolves.toBe(false);
    } finally {
      primaryLock.release();
    }
  });

  it("falls back to an initial build when corrupt and removed candidates cannot be restored", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const primaryRepository = await inspectGitRepository(fixture.directory);
    await new WorldModelService(primaryRepository).build();

    const removedPath = `${fixture.directory}-removed`;
    worktrees.push(removedPath);
    await fixture.git("worktree", "add", "-b", "fixture-removed", removedPath);
    const removedRepository = await inspectGitRepository(removedPath);
    const removedSnapshot = await createRepositorySnapshot(removedRepository);
    await new StructuralProjectionBootstrapper(removedRepository).bootstrap(removedSnapshot);
    await new WorldModelService(removedRepository).sync();

    const destination = `${fixture.directory}-destination`;
    worktrees.push(destination);
    await fixture.git("worktree", "add", "-b", "fixture-destination", destination);
    const destinationRepository = await inspectGitRepository(destination);
    await fixture.git("worktree", "remove", "--force", removedPath);
    await writeFile(
      join(primaryRepository.worktreeRoot, ".atlas", "codegraph.db"),
      "not a sqlite database",
    );

    const snapshot = await createRepositorySnapshot(destinationRepository);
    await expect(new StructuralProjectionBootstrapper(destinationRepository).bootstrap(snapshot))
      .resolves.toBe(false);
    const publication = await new WorldModelService(destinationRepository).build();
    expect(publication.structural).toMatchObject({
      mode: "initial",
      completeness: "complete",
    });
  });
});
