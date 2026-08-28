import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createCliRuntime, runCli } from "../../src/cli/run-cli.js";

describe("semantic-atlas web", () => {
  it("starts one local Viewer for every explicitly allowed repository", async () => {
    const startWeb = vi.fn(async () => ({
      url: "http://127.0.0.1:4310",
      repositoryCount: 2,
    }));
    const runtime = { ...await createCliRuntime(), startWeb };

    const result = await runCli([
      "web",
      "--repo",
      "./apps/ex",
      "./apps/ai",
      "--port",
      "4310",
      "--no-open",
    ], runtime);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(startWeb).toHaveBeenCalledWith({
      repositoryPaths: [
        path.resolve("./apps/ex"),
        path.resolve("./apps/ai"),
      ],
      port: 4310,
      openBrowser: false,
    });
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 1,
      ok: true,
      command: "web",
      data: {
        url: "http://127.0.0.1:4310",
        repositoryCount: 2,
      },
    });
  });

  it("rejects invalid ports before starting a server", async () => {
    const startWeb = vi.fn();
    const runtime = { ...await createCliRuntime(), startWeb };

    const result = await runCli(["web", "--port", "70000"], runtime);

    expect(result.exitCode).toBe(2);
    expect(startWeb).not.toHaveBeenCalled();
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      command: "command",
      error: { code: "INVALID_COMMAND" },
    });
  });
});
