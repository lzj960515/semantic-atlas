import { readFile } from "node:fs/promises";

interface PackageDocument {
  readonly version?: unknown;
}

export async function readPackageVersion(): Promise<string> {
  const packagePath = new URL("../package.json", import.meta.url);
  const document = JSON.parse(await readFile(packagePath, "utf8")) as PackageDocument;
  if (typeof document.version !== "string" || document.version.length === 0) {
    throw new Error("Semantic Atlas package metadata has no version");
  }
  return document.version;
}
