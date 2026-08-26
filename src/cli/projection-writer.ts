import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeProjection(outputPath: string, content: string): Promise<string> {
  const resolvedOutputPath = path.resolve(outputPath);
  await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await writeFile(resolvedOutputPath, content, "utf8");
  return resolvedOutputPath;
}
