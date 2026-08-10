import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";

import { runGit, runGitText } from "./git-command.js";
import type { GitRepository } from "./types.js";

const SUPPORTED_SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);

function resolveGitPath(workingDirectory: string, path: string): string {
  return isAbsolute(path) ? path : resolve(workingDirectory, path);
}

function normalizeIdentityPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function createRepositoryId(commonGitDirectory: string): string {
  return createHash("sha256")
    .update("semantic-atlas:git-common-directory:v1\0")
    .update(normalizeIdentityPath(commonGitDirectory))
    .digest("hex");
}

function compareRepositoryPaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function discoverWorktreeRoots(workingDirectory: string): Promise<string[]> {
  const output = await runGit(workingDirectory, ["worktree", "list", "--porcelain", "-z"]);
  const worktreePaths = output
    .toString("utf8")
    .split("\0")
    .filter((field) => field.startsWith("worktree "))
    .map((field) => resolveGitPath(workingDirectory, field.slice("worktree ".length)));

  return [...new Set(worktreePaths)].sort(compareRepositoryPaths);
}

function hasSupportedExtension(path: string): boolean {
  const extensionIndex = path.lastIndexOf(".");
  if (extensionIndex < 0) {
    return false;
  }
  return SUPPORTED_SOURCE_EXTENSIONS.has(path.slice(extensionIndex).toLowerCase());
}

export function isTargetSource(path: string): boolean {
  const fileName = basename(path);
  return (
    hasSupportedExtension(path) ||
    fileName === "package.json" ||
    /^(?:ts|js)config(?:\.[^.]+)*\.json$/u.test(fileName)
  );
}

export async function inspectGitRepository(startPath: string): Promise<GitRepository> {
  const worktreeRoot = await realpath(await runGitText(startPath, ["rev-parse", "--show-toplevel"]));
  const gitDirectory = await realpath(resolveGitPath(
    startPath,
    await runGitText(startPath, ["rev-parse", "--git-dir"]),
  ));
  const commonGitDirectory = await realpath(resolveGitPath(
    startPath,
    await runGitText(startPath, ["rev-parse", "--git-common-dir"]),
  ));
  const indexPath = resolveGitPath(
    startPath,
    await runGitText(startPath, ["rev-parse", "--git-path", "index"]),
  );
  const worktreeRoots = await discoverWorktreeRoots(worktreeRoot);
  return {
    repositoryId: createRepositoryId(commonGitDirectory),
    worktreeRoot,
    gitDirectory,
    commonGitDirectory,
    worktreeRoots,
    indexPath,
  };
}

export async function discoverTargetSources(repository: GitRepository): Promise<string[]> {
  const output = await runGit(repository.worktreeRoot, [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  ]);

  return output
    .toString("utf8")
    .split("\0")
    .filter((path) => path.length > 0 && isTargetSource(path))
    .sort(compareRepositoryPaths);
}

export async function readCurrentHead(repository: GitRepository): Promise<string> {
  return runGitText(repository.worktreeRoot, ["rev-parse", "--verify", "HEAD"]);
}
