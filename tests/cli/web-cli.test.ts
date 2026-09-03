import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createCliRuntime, runCli } from "../../src/cli/run-cli.js";

const repository = {
  root: path.resolve("./repository"),
  mapDirectory: "docs/business-map",
  documents: ["commerce.yaml"],
} as const;

describe("semantic-atlas project add", () => {
  it("uses the current directory when the optional path is omitted", async () => {
    const addProject = vi.fn(async () => ({
      ok: true as const,
      outcome: "added" as const,
      repository,
    }));
    const runtime = { ...await createCliRuntime(), addProject };

    const result = await runCli(["project", "add"], runtime);

    expect(addProject).toHaveBeenCalledWith(process.cwd());
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 1,
      ok: true,
      command: "project add",
      repository,
      data: { outcome: "added" },
    });
  });

  it("returns the map validation error without writing a project", async () => {
    const addProject = vi.fn(async () => ({
      ok: false as const,
      repository: { ...repository, documents: [] },
      error: { code: "MAP_NOT_FOUND" as const, message: "No business map was found" },
    }));
    const runtime = { ...await createCliRuntime(), addProject };

    const result = await runCli(["project", "add", "./repository"], runtime);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      command: "project add",
      error: { code: "MAP_NOT_FOUND" },
    });
  });
});

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

  it("delegates saved-project discovery when --repo is omitted", async () => {
    const startWeb = vi.fn(async () => ({
      url: "http://127.0.0.1:4310",
      repositoryCount: 0,
    }));
    const runtime = { ...await createCliRuntime(), startWeb };

    const result = await runCli(["web", "--no-open"], runtime);

    expect(result.exitCode).toBe(0);
    expect(startWeb).toHaveBeenCalledWith({
      port: 4310,
      openBrowser: false,
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
