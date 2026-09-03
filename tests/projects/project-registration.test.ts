import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MapApplication } from "../../src/application/map-application.js";
import { ProjectRegistrationService } from "../../src/projects/project-registration-service.js";
import {
  ProjectStore,
  ProjectStoreError,
} from "../../src/projects/project-store.js";
import {
  createEmptyRepository,
  createMapRepository,
  node,
  removeRepository,
} from "../support/map-repository.js";

const sandboxes: string[] = [];

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("project registration", () => {
  it("treats a missing user-local project file as an empty list", async () => {
    const userHome = await sandbox();
    const store = new ProjectStore({ userHome });

    await expect(store.read()).resolves.toEqual([]);
  });

  it("rejects an invalid version or non-normalized stored path", async () => {
    const userHome = await sandbox();
    const configurationDirectory = path.join(userHome, ".semantic-atlas");
    await mkdir(configurationDirectory);
    const projectFile = path.join(configurationDirectory, "projects.json");
    const store = new ProjectStore({ userHome });

    await writeFile(projectFile, '{"schemaVersion":2,"paths":[]}\n', "utf8");
    await expect(store.read()).rejects.toMatchObject({ code: "PROJECT_CONFIG_INVALID" });

    await writeFile(projectFile, JSON.stringify({
      schemaVersion: 1,
      paths: [`${userHome}${path.sep}folder${path.sep}..${path.sep}repository`],
    }), "utf8");
    await expect(store.read()).rejects.toMatchObject({ code: "PROJECT_CONFIG_INVALID" });
  });

  it("validates the complete map and idempotently stores its normalized root", async () => {
    const userHome = await sandbox();
    const repositoryRoot = await validRepository();
    const store = new ProjectStore({ userHome });
    const service = new ProjectRegistrationService(new MapApplication(), store);

    await expect(service.add(path.join(repositoryRoot, "."))).resolves.toMatchObject({
      ok: true,
      outcome: "added",
      repository: { root: repositoryRoot },
    });
    await expect(service.add(repositoryRoot)).resolves.toMatchObject({
      ok: true,
      outcome: "already_exists",
    });

    const projectFile = path.join(userHome, ".semantic-atlas", "projects.json");
    expect(JSON.parse(await readFile(projectFile, "utf8"))).toEqual({
      schemaVersion: 1,
      paths: [repositoryRoot],
    });
  });

  it("leaves existing registration unchanged when a selected map is unavailable", async () => {
    const userHome = await sandbox();
    const validRoot = await validRepository();
    const missingMapRoot = await createEmptyRepository();
    const invalidMapRoot = await createMapRepository({ "invalid.yaml": "map: [" });
    sandboxes.push(missingMapRoot);
    sandboxes.push(invalidMapRoot);
    const store = new ProjectStore({ userHome });
    const service = new ProjectRegistrationService(new MapApplication(), store);
    await service.add(validRoot);

    await expect(service.add(missingMapRoot)).resolves.toMatchObject({
      ok: false,
      error: { code: "MAP_NOT_FOUND" },
    });
    await expect(service.add(invalidMapRoot)).resolves.toMatchObject({
      ok: false,
      error: { code: "MAP_DOCUMENT_INVALID" },
    });
    await expect(store.read()).resolves.toEqual([validRoot]);
  });

  it("publishes through a unique temporary file and preserves the old list if replacement fails", async () => {
    const userHome = await sandbox();
    const firstPath = path.join(userHome, "first");
    const secondPath = path.join(userHome, "second");
    await Promise.all([mkdir(firstPath), mkdir(secondPath)]);
    const successfulRename = vi.fn(rename);
    const initialStore = new ProjectStore({ userHome }, { rename: successfulRename });
    await initialStore.add(firstPath);

    const [temporaryPath, targetPath] = successfulRename.mock.calls[0] ?? [];
    expect(path.basename(String(temporaryPath ?? ""))).toMatch(/^\.projects\..+\.tmp$/u);
    expect(targetPath).toBe(path.join(userHome, ".semantic-atlas", "projects.json"));

    const failingStore = new ProjectStore({ userHome }, {
      rename: async () => {
        throw new Error("simulated replacement failure");
      },
    });
    await expect(failingStore.add(secondPath)).rejects.toBeInstanceOf(ProjectStoreError);
    await expect(initialStore.read()).resolves.toEqual([firstPath]);
    expect((await readdir(path.join(userHome, ".semantic-atlas")))
      .filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});

async function sandbox(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "semantic-atlas-project-test-"));
  sandboxes.push(directory);
  return directory;
}

async function validRepository(): Promise<string> {
  const repositoryRoot = await createMapRepository({
    "commerce.yaml": {
      schemaVersion: 1,
      map: { id: "commerce", title: "Commerce", summary: "Commerce map." },
      nodes: [node("commerce", "domain", "Commerce")],
      relations: [],
      flows: [],
    },
  });
  sandboxes.push(repositoryRoot);
  return repositoryRoot;
}
