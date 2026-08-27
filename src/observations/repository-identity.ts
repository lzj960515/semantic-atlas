import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { RepositoryIdentity } from "../contracts/observation.js";

export interface ResolvedRepositoryIdentity {
  readonly root: string;
  readonly identity: RepositoryIdentity;
}

export class RepositoryIdentityError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RepositoryIdentityError";
  }
}

export class RepositoryIdentityResolver {
  public async resolve(repositoryPath: string): Promise<ResolvedRepositoryIdentity> {
    try {
      const resolvedPath = await resolveDirectory(repositoryPath);
      const gitRepository = await findGitRepository(resolvedPath);
      if (!gitRepository) {
        return {
          root: resolvedPath,
          identity: createIdentity("directory", resolvedPath),
        };
      }

      const commonDirectory = await resolveCommonGitDirectory(gitRepository.gitDirectory);
      return {
        root: gitRepository.root,
        identity: createIdentity("git", commonDirectory),
      };
    } catch (error) {
      if (error instanceof RepositoryIdentityError) throw error;
      throw new RepositoryIdentityError(
        `Cannot derive repository identity from: ${repositoryPath}`,
      );
    }
  }
}

async function resolveDirectory(repositoryPath: string): Promise<string> {
  try {
    const resolved = await realpath(repositoryPath);
    if (!(await stat(resolved)).isDirectory()) {
      throw new RepositoryIdentityError(
        `Repository path is not a directory: ${repositoryPath}`,
      );
    }
    return resolved;
  } catch (error) {
    if (error instanceof RepositoryIdentityError) throw error;
    throw new RepositoryIdentityError(
      `Cannot resolve repository directory: ${repositoryPath}`,
    );
  }
}

async function findGitRepository(
  startDirectory: string,
): Promise<{ readonly root: string; readonly gitDirectory: string } | undefined> {
  let currentDirectory = startDirectory;
  while (true) {
    const marker = path.join(currentDirectory, ".git");
    const gitDirectory = await readGitDirectory(marker);
    if (gitDirectory) return { root: currentDirectory, gitDirectory };

    const parent = path.dirname(currentDirectory);
    if (parent === currentDirectory) return undefined;
    currentDirectory = parent;
  }
}

async function readGitDirectory(marker: string): Promise<string | undefined> {
  try {
    const markerStatus = await stat(marker);
    if (markerStatus.isDirectory()) return realpath(marker);
    if (!markerStatus.isFile()) return undefined;
    const markerContent = await readFile(marker, "utf8");
    const match = /^gitdir:\s*(.+)\s*$/u.exec(markerContent.trim());
    if (!match?.[1]) return undefined;
    return realpath(path.resolve(path.dirname(marker), match[1]));
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return undefined;
    throw error;
  }
}

async function resolveCommonGitDirectory(gitDirectory: string): Promise<string> {
  try {
    const relativeCommonDirectory = (await readFile(
      path.join(gitDirectory, "commondir"),
      "utf8",
    )).trim();
    return realpath(path.resolve(gitDirectory, relativeCommonDirectory));
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return gitDirectory;
    throw error;
  }
}

function createIdentity(
  kind: RepositoryIdentity["kind"],
  identitySource: string,
): RepositoryIdentity {
  return {
    kind,
    id: createHash("sha256")
      .update("semantic-atlas-repository-v1\0")
      .update(kind)
      .update("\0")
      .update(identitySource)
      .digest("hex"),
  };
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === code;
}
