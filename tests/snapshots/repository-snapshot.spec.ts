import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { inspectGitRepository } from "../../src/repository/repository-inspector.js";
import { createRepositorySnapshot } from "../../src/snapshots/repository-snapshot.js";
import { createGitFixture, type GitFixture } from "../support/git-fixture.js";

describe("repository snapshots", () => {
  const fixtures: GitFixture[] = [];
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
    await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
  });

  it("derives deterministic IDs for clean, unstaged, staged, untracked, and HEAD states", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const repository = await inspectGitRepository(fixture.directory);

    const clean = await createRepositorySnapshot(repository);
    expect(await createRepositorySnapshot(repository)).toEqual(clean);
    expect(clean.changes).toEqual({ staged: [], unstaged: [], untracked: [] });

    await fixture.write("src/example.ts", "export const value = 2;\n");
    const unstaged = await createRepositorySnapshot(repository);
    expect(unstaged.snapshotId).not.toBe(clean.snapshotId);
    expect(unstaged.changes.unstaged).toEqual(["src/example.ts"]);

    await fixture.git("add", "src/example.ts");
    const staged = await createRepositorySnapshot(repository);
    expect(staged.snapshotId).not.toBe(unstaged.snapshotId);
    expect(staged.changes).toEqual({ staged: ["src/example.ts"], unstaged: [], untracked: [] });

    await fixture.git("commit", "-m", "test: advance head");
    const committed = await createRepositorySnapshot(repository);
    expect(committed.snapshotId).not.toBe(staged.snapshotId);
    expect(committed.headCommit).not.toBe(staged.headCommit);

    await fixture.write("src/pending.ts", "export const pending = true;\n");
    const untracked = await createRepositorySnapshot(repository);
    expect(untracked.snapshotId).not.toBe(committed.snapshotId);
    expect(untracked.changes.untracked).toEqual(["src/pending.ts"]);

    await fixture.write("notes.md", "irrelevant\n");
    expect((await createRepositorySnapshot(repository)).snapshotId).toBe(untracked.snapshotId);
  });

  it("includes the physical Git index format in the snapshot identity", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const repository = await inspectGitRepository(fixture.directory);

    await fixture.git("update-index", "--index-version", "2");
    const versionTwo = await createRepositorySnapshot(repository);
    expect(versionTwo.indexVersion).toBe(2);

    await fixture.git("update-index", "--index-version", "4");
    const versionFour = await createRepositorySnapshot(repository);
    expect(versionFour.indexVersion).toBe(4);
    expect(versionFour.snapshotId).not.toBe(versionTwo.snapshotId);
  });

  it("uses one repository identity but different snapshots for divergent worktrees", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const linkedWorktree = await mkdtemp(join(tmpdir(), "semantic-atlas-worktree-"));
    temporaryDirectories.push(linkedWorktree);
    await rm(linkedWorktree, { recursive: true, force: true });
    await fixture.git("worktree", "add", "-b", "snapshot-linked", linkedWorktree);

    const primaryRepository = await inspectGitRepository(fixture.directory);
    const linkedRepository = await inspectGitRepository(linkedWorktree);
    await fixture.write("src/primary-only.ts", "export const primary = true;\n");

    const primary = await createRepositorySnapshot(primaryRepository);
    const linked = await createRepositorySnapshot(linkedRepository);

    expect(linked.repositoryId).toBe(primary.repositoryId);
    expect(linked.snapshotId).not.toBe(primary.snapshotId);
  });
});
