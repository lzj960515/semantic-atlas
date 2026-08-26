import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import type {
  LoadedMapDocument,
  MapIssue,
  RepositoryMapSource,
} from "../contracts/map.js";

const mapDirectoryPath = path.join("docs", "business-map");
const publicMapDirectory = "docs/business-map";

export interface MapDocumentLoadResult {
  readonly source: RepositoryMapSource;
  readonly documents: readonly LoadedMapDocument[];
  readonly issues: readonly MapIssue[];
}

export class RepositoryResolutionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RepositoryResolutionError";
  }
}

export class MapDocumentLoader {
  public async load(repositoryPath: string): Promise<MapDocumentLoadResult> {
    const repositoryRoot = await resolveRepositoryRoot(repositoryPath);
    const absoluteMapDirectory = path.join(repositoryRoot, mapDirectoryPath);
    const fileNames = await discoverMapDocuments(absoluteMapDirectory);
    const loaded = await Promise.all(
      fileNames.map((fileName) => loadDocument(absoluteMapDirectory, fileName)),
    );

    return {
      source: {
        root: repositoryRoot,
        mapDirectory: publicMapDirectory,
        documents: Object.freeze([...fileNames]),
      },
      documents: Object.freeze(
        loaded.flatMap((result) => result.document ? [result.document] : []),
      ),
      issues: Object.freeze(
        loaded.flatMap((result) => result.issue ? [result.issue] : []),
      ),
    };
  }
}

async function resolveRepositoryRoot(repositoryPath: string): Promise<string> {
  try {
    const resolved = await realpath(repositoryPath);
    const metadata = await stat(resolved);
    if (!metadata.isDirectory()) {
      throw new RepositoryResolutionError(`Repository path is not a directory: ${repositoryPath}`);
    }
    return resolved;
  } catch (error) {
    if (error instanceof RepositoryResolutionError) throw error;
    throw new RepositoryResolutionError(`Cannot resolve repository directory: ${repositoryPath}`);
  }
}

async function discoverMapDocuments(absoluteMapDirectory: string): Promise<readonly string[]> {
  try {
    const entries = await readdir(absoluteMapDirectory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return [];
    throw error;
  }
}

async function loadDocument(
  absoluteMapDirectory: string,
  fileName: string,
): Promise<{ readonly document?: LoadedMapDocument; readonly issue?: MapIssue }> {
  const relativePath = path.posix.join(publicMapDirectory, fileName);
  try {
    const content = await readFile(path.join(absoluteMapDirectory, fileName), "utf8");
    return {
      document: {
        fileName,
        relativePath,
        value: parse(content),
      },
    };
  } catch (error) {
    return {
      issue: {
        code: "DOCUMENT_PARSE_FAILED",
        document: fileName,
        message: error instanceof Error ? error.message : "Map document could not be parsed",
      },
    };
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === code;
}
