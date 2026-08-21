import { createServer, type RequestListener } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AtlasReadOperations } from "../../src/web/application/atlas-read-service.js";
import { createApiRequestHandler } from "../../src/web/server/api-router.js";

describe("Semantic Atlas HTTP API v1", () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error));
    })));
  });

  it("routes declared GET operations through the read service", async () => {
    const projectId = "a".repeat(64);
    const service = fakeReadService(projectId);
    const origin = await listen(createApiRequestHandler(service));

    await expect(readJson(`${origin}/api/v1/projects`)).resolves.toMatchObject({
      status: 200,
      body: { schemaVersion: 1, data: { projects: [{ id: projectId }] } },
    });
    await expect(readJson(`${origin}/api/v1/projects/${projectId}/status`)).resolves.toMatchObject({
      status: 200,
      body: { schemaVersion: 1, data: { project: { id: projectId } } },
    });
    await expect(readJson(`${origin}/api/v1/projects/${projectId}/map?focus=orders`))
      .resolves.toMatchObject({ status: 200, body: { schemaVersion: 1, data: { focus: null } } });
    await expect(readJson(`${origin}/api/v1/projects/${projectId}/search?q=order&limit=7`))
      .resolves.toMatchObject({
        status: 200,
        body: { schemaVersion: 1, data: { query: "order", limit: 7 } },
      });
    await expect(readJson(`${origin}/api/v1/projects/${projectId}/node?key=orders`))
      .resolves.toMatchObject({
        status: 200,
        body: { schemaVersion: 1, data: { node: { key: "orders" } } },
      });

    expect(service.getMap).toHaveBeenCalledWith(projectId, "orders");
    expect(service.searchBusiness).toHaveBeenCalledWith(projectId, "order", 7);
    expect(service.getBusinessNode).toHaveBeenCalledWith(projectId, "orders");
  });

  it("rejects mutation methods, paths as project IDs, and invalid search bounds", async () => {
    const projectId = "a".repeat(64);
    const service = fakeReadService(projectId);
    const origin = await listen(createApiRequestHandler(service));

    await expect(readJson(`${origin}/api/v1/projects`, { method: "POST" })).resolves.toMatchObject({
      status: 405,
      body: { schemaVersion: 1, error: { code: "METHOD_NOT_ALLOWED" } },
    });
    await expect(readJson(`${origin}/api/v1/projects/not-a-project/map`)).resolves.toMatchObject({
      status: 400,
      body: { schemaVersion: 1, error: { code: "INVALID_REQUEST" } },
    });
    await expect(readJson(`${origin}/api/v1/projects/${projectId}/search?q=%20&limit=101`))
      .resolves.toMatchObject({
        status: 400,
        body: { schemaVersion: 1, error: { code: "INVALID_REQUEST" } },
      });
    expect(service.searchBusiness).not.toHaveBeenCalled();
  });

  function listen(handler: RequestListener): Promise<string> {
    const server = createServer(handler);
    servers.push(server);
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (address === null || typeof address === "string") {
          reject(new Error("Expected TCP server address"));
          return;
        }
        resolve(`http://127.0.0.1:${address.port}`);
      });
    });
  }
});

function fakeReadService(projectId: string): AtlasReadOperations & {
  readonly getMap: ReturnType<typeof vi.fn>;
  readonly searchBusiness: ReturnType<typeof vi.fn>;
  readonly getBusinessNode: ReturnType<typeof vi.fn>;
} {
  const project = {
    id: projectId,
    name: "fixture",
    root: "/fixture",
    branch: "main" as const,
    headCommit: "b".repeat(40),
    snapshotId: "c".repeat(64),
    freshness: "current" as const,
    status: "current" as const,
  };
  return {
    listProjects: vi.fn(async () => [project]),
    getStatus: vi.fn(async () => ({ project })),
    getMap: vi.fn(async () => ({ focus: null, breadcrumbs: [], regions: [], connections: [] })),
    searchBusiness: vi.fn(async (_id: string, query: string, limit: number) => ({
      query,
      limit,
      results: [],
    })),
    getBusinessNode: vi.fn(async () => ({
      node: { key: "orders" },
      relations: [],
    })),
  } as unknown as ReturnType<typeof fakeReadService>;
}

async function readJson(
  url: string,
  init?: RequestInit,
): Promise<{ readonly status: number; readonly body: unknown }> {
  const response = await fetch(url, init);
  return { status: response.status, body: await response.json() };
}
