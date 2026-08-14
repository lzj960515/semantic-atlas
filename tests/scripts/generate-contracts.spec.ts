import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const executeFile = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "../..");
const temporaryRoots: string[] = [];
const contractPaths = [
  "schemas/cli-envelope-v1.schema.json",
  "schemas/graph-patch-v1.schema.json",
  "schemas/evaluation-plan-v1.schema.json",
  "schemas/evaluation-run-v1.schema.json",
] as const;

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => (
    rm(path, { recursive: true, force: true })
  )));
});

describe("generated contract verification", () => {
  it("accepts generated schemas checked out with Windows line endings", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "semantic-atlas-contracts-"));
    temporaryRoots.push(fixtureRoot);
    await mkdir(join(fixtureRoot, "schemas"));

    for (const contractPath of contractPaths) {
      const generated = await readFile(join(projectRoot, contractPath), "utf8");
      await writeFile(join(fixtureRoot, contractPath), generated.replaceAll("\n", "\r\n"));
    }

    const result = await executeFile(process.execPath, [
      join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs"),
      join(projectRoot, "scripts", "generate-contracts.ts"),
      "--check",
    ], {
      cwd: fixtureRoot,
      encoding: "utf8",
    });

    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("Verified 4 generated contracts.\n");
  });
});
