import { readFile } from "node:fs/promises";

export interface PackageIdentity {
  readonly name: string;
  readonly version: string;
}

export async function readPackageIdentity(): Promise<PackageIdentity> {
  const packagePath = new URL("../../package.json", import.meta.url);
  const packageDocument = JSON.parse(await readFile(packagePath, "utf8")) as {
    readonly name?: unknown;
    readonly version?: unknown;
  };
  if (
    typeof packageDocument.name !== "string"
    || packageDocument.name.trim().length === 0
    || typeof packageDocument.version !== "string"
    || packageDocument.version.trim().length === 0
  ) {
    throw new Error("The installed Semantic Atlas package identity is invalid");
  }
  return {
    name: packageDocument.name,
    version: packageDocument.version,
  };
}
