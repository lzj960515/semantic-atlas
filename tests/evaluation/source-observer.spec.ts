import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

describe("evaluation source observer", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => (
      rm(directory, { recursive: true, force: true })
    )));
  });

  it("records exact per-file payload tokens for reads and multi-file searches", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-source-observer-"));
    directories.push(root);
    const trace = join(root, "trace.jsonl");
    await writeFile(join(root, "first.ts"), "export const first = 1;\n");
    await writeFile(join(root, "second.ts"), "export const second = 2;\n");

    const readResult = runObserver(root, trace, ["read", "first.ts"]);
    expect(readResult.status).toBe(0);
    expect(readResult.stdout).toContain("export const first = 1;");

    const searchResult = runObserver(root, trace, ["search", "export", "."]);
    expect(searchResult.status).toBe(0);
    expect(searchResult.stdout).toContain("first.ts");
    expect(searchResult.stdout).toContain("second.ts");

    const events = (await readFile(trace, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events).toHaveLength(3);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3]);
    expect(events.map((event) => event.file)).toEqual([
      "first.ts",
      "first.ts",
      "second.ts",
    ]);
    expect(events.every((event) => event.sourceTokens > 0)).toBe(true);
    expect(events.every((event) => event.sourceTokenMethod === "tiktoken-o200k_base-v1"))
      .toBe(true);
  });

  it("rejects a source path outside the fixture root", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-source-observer-"));
    directories.push(root);
    const result = runObserver(root, join(root, "trace.jsonl"), ["read", "../secret.ts"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/inside the evaluation fixture/);
  });

  it("rejects a source symlink that resolves outside the fixture root", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-source-observer-"));
    const outside = await mkdtemp(join(tmpdir(), "atlas-source-outside-"));
    directories.push(root, outside);
    await writeFile(join(outside, "secret.ts"), "export const secret = true;\n");
    await symlink(join(outside, "secret.ts"), join(root, "linked.ts"));

    const result = runObserver(root, join(root, "trace.jsonl"), ["read", "linked.ts"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/inside the evaluation fixture/);
  });
});

function runObserver(root: string, trace: string, arguments_: string[]) {
  return spawnSync(
    process.execPath,
    [resolve("scripts/evaluation-source-observer.mjs"), ...arguments_],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        EVALUATION_ROOT: root,
        EVALUATION_TRACE: trace,
      },
    },
  );
}
