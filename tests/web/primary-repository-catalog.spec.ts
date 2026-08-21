import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { inspectGitRepository } from "../../src/repository/repository-inspector.js";
import { AtlasDatabase } from "../../src/storage/atlas-database.js";
import { PrimaryRepositoryCatalog } from "../../src/web/application/primary-repository-catalog.js";
import { createGitFixture, type GitFixture } from "../support/git-fixture.js";

describe("PrimaryRepositoryCatalog", () => {
  const fixtures: GitFixture[] = [];
  const linkedWorktrees: string[] = [];

  afterEach(async () => {
    await Promise.all(linkedWorktrees.splice(0).map((path) => rm(path, {
      recursive: true,
      force: true,
    })));
    await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
  });

  it("returns one primary main working tree and never exposes its linked worktree", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const primary = await inspectGitRepository(fixture.directory);
    using primaryDatabase = new AtlasDatabase(primary);

    const linkedRoot = `${fixture.directory}-linked`;
    linkedWorktrees.push(linkedRoot);
    await fixture.git("worktree", "add", "-b", "feature/catalog-test", linkedRoot);
    const linked = await inspectGitRepository(linkedRoot);
    using linkedDatabase = new AtlasDatabase(linked);

    const projects = await new PrimaryRepositoryCatalog().listProjects();
    const project = projects.find(({ id }) => id === primary.repositoryId);

    expect(project).toMatchObject({
      id: primary.repositoryId,
      root: primary.worktreeRoot,
      branch: "main",
      status: "missing",
      freshness: "missing",
    });
    expect(project?.root).not.toBe(linked.worktreeRoot);
    expect(projects.filter(({ id }) => id === primary.repositoryId)).toHaveLength(1);
  });

  it("accepts master and excludes feature branches and detached heads", async () => {
    const masterFixture = await createGitFixture();
    const featureFixture = await createGitFixture();
    const detachedFixture = await createGitFixture();
    fixtures.push(masterFixture, featureFixture, detachedFixture);
    await masterFixture.git("branch", "-m", "master");
    await featureFixture.git("checkout", "-b", "feature/web");
    await detachedFixture.git("checkout", "--detach");

    const master = await inspectGitRepository(masterFixture.directory);
    const feature = await inspectGitRepository(featureFixture.directory);
    const detached = await inspectGitRepository(detachedFixture.directory);
    using masterDatabase = new AtlasDatabase(master);
    using featureDatabase = new AtlasDatabase(feature);
    using detachedDatabase = new AtlasDatabase(detached);

    const projects = await new PrimaryRepositoryCatalog().listProjects();
    const ids = new Set(projects.map(({ id }) => id));

    expect(projects.find(({ id }) => id === master.repositoryId)?.branch).toBe("master");
    expect(ids.has(feature.repositoryId)).toBe(false);
    expect(ids.has(detached.repositoryId)).toBe(false);
  });
});
