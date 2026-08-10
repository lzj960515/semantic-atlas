import { mkdir, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  discoverTargetSources,
  inspectGitRepository,
  readCurrentHead,
} from "../../src/repository/repository-inspector.js";
import { createGitFixture, type GitFixture } from "../support/git-fixture.js";

describe("Git repository inspection", () => {
  const fixtures: GitFixture[] = [];
  const linkedWorktrees: string[] = [];

  afterEach(async () => {
    await Promise.all(linkedWorktrees.splice(0).map((path) => rm(path, { recursive: true, force: true })));
    await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
  });

  it("discovers the repository from a nested directory", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const nestedDirectory = join(fixture.directory, "src", "nested");
    await mkdir(nestedDirectory, { recursive: true });

    const repository = await inspectGitRepository(nestedDirectory);

    expect(repository.worktreeRoot).toBe(await realpath(fixture.directory));
    expect(await readCurrentHead(repository)).toMatch(/^[0-9a-f]{40,64}$/u);
    expect(repository.repositoryId).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("shares repository identity across linked worktrees", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const linkedWorktree = `${fixture.directory}-linked`;
    linkedWorktrees.push(linkedWorktree);
    await fixture.git("worktree", "add", "-b", "fixture-linked", linkedWorktree);

    const primary = await inspectGitRepository(fixture.directory);
    const linked = await inspectGitRepository(linkedWorktree);

    expect(linked.repositoryId).toBe(primary.repositoryId);
    expect(linked.commonGitDirectory).toBe(primary.commonGitDirectory);
    expect(linked.worktreeRoot).not.toBe(primary.worktreeRoot);
    expect(new Set(linked.worktreeRoots)).toEqual(new Set([
      await realpath(fixture.directory),
      await realpath(linkedWorktree),
    ]));
    expect(primary.worktreeRoots).toEqual(linked.worktreeRoots);
  });

  it("discovers tracked and untracked target sources while excluding unrelated files", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    await fixture.write("src/untracked.ts", "export const pending = true;\n");
    await fixture.write("notes.md", "not an analyzed source\n");

    const repository = await inspectGitRepository(fixture.directory);
    const sources = await discoverTargetSources(repository);

    expect(sources).toEqual(["package.json", "src/example.ts", "src/untracked.ts"]);
  });
});
