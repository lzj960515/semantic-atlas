import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AtlasReadOperations } from "../../src/web/application/atlas-read-service.js";
import { startLocalWebServer } from "../../src/web/server/local-web-server.js";

describe("LocalWebServer", () => {
  const temporaryDirectories: string[] = [];
  const closeServers: (() => Promise<void>)[] = [];

  afterEach(async () => {
    await Promise.all(closeServers.splice(0).map((close) => close()));
    await Promise.all(temporaryDirectories.splice(0).map((directory) => (
      rm(directory, { recursive: true, force: true })
    )));
  });

  it("binds loopback and serves the bundled application surface", async () => {
    const assetsDirectory = await mkdtemp(join(tmpdir(), "semantic-atlas-web-assets-"));
    temporaryDirectories.push(assetsDirectory);
    await writeFile(join(assetsDirectory, "index.html"), "<!doctype html><title>Atlas fixture</title>");
    const server = await startLocalWebServer({
      readService: emptyReadService(),
      port: 0,
      assetsDirectory,
    });
    closeServers.push(server.close);

    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
    const page = await fetch(server.url);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    await expect(page.text()).resolves.toContain("Atlas fixture");
  });
});

function emptyReadService(): AtlasReadOperations {
  return {
    listProjects: vi.fn(async () => []),
    getStatus: vi.fn(),
    getMap: vi.fn(),
    searchBusiness: vi.fn(),
    getBusinessNode: vi.fn(),
  } as unknown as AtlasReadOperations;
}
