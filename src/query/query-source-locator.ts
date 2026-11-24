import type { Stats } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type YAMLMap } from "yaml";
import type {
  BusinessFlow,
  BusinessNode,
  BusinessRelation,
  NavigationAnchor,
} from "../contracts/map.js";
import type { QuerySourceLocation, ResolvedNavigationAnchor } from "../contracts/query-location.js";

interface MapSource {
  readonly root: YAMLMap;
  readonly lines: LineCounter;
}

/** Own one instance per query so source positions and caches share its lifetime. */
export class QuerySourceLocator {
  private readonly maps = new Map<string, Promise<MapSource | undefined>>();
  private readonly files = new Map<string, Promise<Stats | undefined>>();

  public constructor(private readonly repositoryRoot: string) {}

  public async node(node: BusinessNode): Promise<QuerySourceLocation | undefined> {
    const source = await this.mapSource(node.documentPath);
    const declaration = source && findById(source.root, "nodes", node.id);
    return declaration && this.location(node.documentPath, source, declaration, "id");
  }

  public async flow(flow: BusinessFlow): Promise<QuerySourceLocation | undefined> {
    const source = await this.mapSource(flow.documentPath);
    const declaration = source && findById(source.root, "flows", flow.id);
    return declaration && this.location(flow.documentPath, source, declaration, "id");
  }

  public async step(flow: BusinessFlow, stepId: string): Promise<QuerySourceLocation | undefined> {
    const source = await this.mapSource(flow.documentPath);
    const flowDeclaration = source && findById(source.root, "flows", flow.id);
    const declaration = flowDeclaration && findById(flowDeclaration, "steps", stepId);
    return declaration && this.location(flow.documentPath, source, declaration, "id");
  }

  public async relation(relation: BusinessRelation): Promise<QuerySourceLocation | undefined> {
    const source = await this.mapSource(relation.documentPath);
    const declaration =
      source &&
      findUniqueMap(
        source.root,
        "relations",
        (item) =>
          scalarText(item, "from") === relation.from &&
          scalarText(item, "type") === relation.type &&
          scalarText(item, "to") === relation.to,
      );
    return declaration && this.location(relation.documentPath, source, declaration, "from");
  }

  public async anchor(anchor: NavigationAnchor): Promise<ResolvedNavigationAnchor> {
    if (anchor.kind === "search") {
      return { ...anchor, resolution: "hint" };
    }

    const file = anchor.kind === "symbol" ? anchor.file : anchor.value;
    if (!file) return { ...anchor, resolution: "hint" };
    const metadata = await this.fileMetadata(file);
    const expectedKind = anchor.kind === "directory" ? metadata?.isDirectory() : metadata?.isFile();
    if (!expectedKind) return { ...anchor, resolution: "missing" };

    // A directory or symbol remains a hint: a file entry is not a declaration position.
    if (anchor.kind === "directory" || anchor.kind === "symbol") {
      return { ...anchor, resolution: "hint" };
    }

    return {
      ...anchor,
      resolution: "located",
      location: { file, line: 1, column: 1 },
    };
  }

  private mapSource(file: string): Promise<MapSource | undefined> {
    let source = this.maps.get(file);
    if (!source) {
      source = this.readMapSource(file);
      this.maps.set(file, source);
    }
    return source;
  }

  private async readMapSource(file: string): Promise<MapSource | undefined> {
    const content = await readExistingFile(path.resolve(this.repositoryRoot, file));
    if (content === undefined) return undefined;
    const lines = new LineCounter();
    const document = parseDocument(content, { lineCounter: lines });
    if (document.errors.length > 0 || !isMap(document.contents)) return undefined;
    return { root: document.contents, lines };
  }

  private fileMetadata(file: string): Promise<Stats | undefined> {
    let metadata = this.files.get(file);
    if (!metadata) {
      metadata = stat(path.resolve(this.repositoryRoot, file)).catch((error: unknown) => {
        if (isMissingPath(error)) return undefined;
        throw error;
      });
      this.files.set(file, metadata);
    }
    return metadata;
  }

  private location(
    file: string,
    source: MapSource,
    declaration: YAMLMap,
    identityKey: string,
  ): QuerySourceLocation | undefined {
    const key = declaration.items.find(
      (pair) => isScalar(pair.key) && pair.key.value === identityKey,
    )?.key;
    if (!isScalar(key) || !key.range) return undefined;
    const position = source.lines.linePos(key.range[0]);
    return { file, line: position.line, column: position.col };
  }
}

function findById(parent: YAMLMap, collection: string, id: string): YAMLMap | undefined {
  return findUniqueMap(parent, collection, (item) => scalarText(item, "id") === id);
}

function findUniqueMap(
  parent: YAMLMap,
  collection: string,
  matches: (item: YAMLMap) => boolean,
): YAMLMap | undefined {
  const sequence = parent.get(collection, true);
  if (!isSeq(sequence)) return undefined;
  const declarations = sequence.items.filter(isMap).filter(matches);
  return declarations.length === 1 ? declarations[0] : undefined;
}

function scalarText(item: YAMLMap, key: string): string | undefined {
  const value = item.get(key);
  return typeof value === "string" ? value.trim() : undefined;
}

async function readExistingFile(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (isMissingPath(error)) return undefined;
    throw error;
  }
}

function isMissingPath(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}
