import { createHash } from "node:crypto";
import { lstat, readFile, readlink } from "node:fs/promises";
import { join } from "node:path";

import { runGit } from "../repository/git-command.js";
import {
  discoverTargetSources,
  isTargetSource,
  readCurrentHead,
} from "../repository/repository-inspector.js";
import type { GitRepository } from "../repository/types.js";
import type {
  IndexEntry,
  RepositoryChanges,
  RepositorySnapshot,
  SnapshotFile,
  WorktreeContent,
} from "./types.js";

function parseIndexEntries(output: Buffer): Map<string, IndexEntry[]> {
  const entries = new Map<string, IndexEntry[]>();

  for (const record of output.toString("utf8").split("\0")) {
    if (record.length === 0) {
      continue;
    }
    const separatorIndex = record.indexOf("\t");
    const metadata = record.slice(0, separatorIndex).split(" ");
    const path = record.slice(separatorIndex + 1);
    const [mode, objectId, stageText] = metadata;
    if (separatorIndex < 0 || mode === undefined || objectId === undefined || stageText === undefined) {
      throw new Error(`Invalid Git index entry: ${record}`);
    }

    const pathEntries = entries.get(path) ?? [];
    pathEntries.push({ mode, objectId, stage: Number.parseInt(stageText, 10) });
    entries.set(path, pathEntries);
  }

  return entries;
}

async function readIndexVersion(indexPath: string): Promise<number> {
  const header = (await readFile(indexPath)).subarray(0, 8);
  if (header.length !== 8 || header.subarray(0, 4).toString("ascii") !== "DIRC") {
    throw new Error(`Invalid Git index header at ${indexPath}`);
  }
  return header.readUInt32BE(4);
}

async function readWorktreeContent(absolutePath: string): Promise<WorktreeContent | null> {
  try {
    const fileStat = await lstat(absolutePath);
    const symbolicLink = fileStat.isSymbolicLink();
    const content = symbolicLink
      ? Buffer.from(await readlink(absolutePath), "utf8")
      : await readFile(absolutePath);

    return {
      contentHash: createHash("sha256").update(content).digest("hex"),
      executable: (fileStat.mode & 0o111) !== 0,
      symbolicLink,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function parseChanges(output: Buffer): RepositoryChanges {
  const staged = new Set<string>();
  const unstaged = new Set<string>();
  const untracked = new Set<string>();
  const records = output.toString("utf8").split("\0");

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record === undefined || record.length < 4) {
      continue;
    }

    const indexState = record[0];
    const worktreeState = record[1];
    const path = record.slice(3);
    const isRenameOrCopy = (
      indexState === "R" ||
      indexState === "C" ||
      worktreeState === "R" ||
      worktreeState === "C"
    );
    const originalPath = isRenameOrCopy ? records[index + 1] : undefined;
    if (isRenameOrCopy) {
      index += 1;
    }

    if (!isTargetSource(path) && (originalPath === undefined || !isTargetSource(originalPath))) {
      continue;
    }
    if (indexState === "?" && worktreeState === "?") {
      untracked.add(path);
      continue;
    }
    if (indexState !== undefined && indexState !== " ") {
      staged.add(path);
    }
    if (worktreeState !== undefined && worktreeState !== " ") {
      unstaged.add(path);
    }
  }

  const sort = (paths: Set<string>): string[] => [...paths].sort((left, right) => (
    left < right ? -1 : left > right ? 1 : 0
  ));
  return {
    staged: sort(staged),
    unstaged: sort(unstaged),
    untracked: sort(untracked),
  };
}

export async function createRepositorySnapshot(
  repository: GitRepository,
): Promise<RepositorySnapshot> {
  const [headCommit, indexVersion, targetSources, rawIndexEntries, rawChanges] = await Promise.all([
    readCurrentHead(repository),
    readIndexVersion(repository.indexPath),
    discoverTargetSources(repository),
    runGit(repository.worktreeRoot, ["ls-files", "--stage", "-z"]),
    runGit(repository.worktreeRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
  ]);
  const indexEntries = parseIndexEntries(rawIndexEntries);
  const files = await Promise.all(targetSources.map(async (path): Promise<SnapshotFile> => ({
    path,
    indexEntries: indexEntries.get(path) ?? [],
    worktree: await readWorktreeContent(join(repository.worktreeRoot, path)),
  })));
  const changes = parseChanges(rawChanges);
  const content = {
    schemaVersion: 1 as const,
    repositoryId: repository.repositoryId,
    headCommit,
    indexVersion,
    files,
    changes,
  };
  const snapshotId = createHash("sha256").update(JSON.stringify(content)).digest("hex");

  return { snapshotId, ...content };
}
