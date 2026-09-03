import { afterEach, describe, expect, it, vi } from "vitest";
import { MapApplication } from "../../src/application/map-application.js";
import { LocalWebApplication } from "../../src/web/local-web-application.js";
import { startLocalWebServer, type LocalWebServer } from "../../src/web/local-web-server.js";
import {
  createEmptyRepository,
  createMapRepository,
  flow,
  flowStep,
  node,
  relation,
  removeRepository,
  type TestMapDocument,
} from "../support/map-repository.js";

const repositories: string[] = [];
const servers: LocalWebServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(repositories.splice(0).map(removeRepository));
});

describe("Semantic Atlas local Web server", () => {
  it("serves only the project catalog before loading the selected project on demand", async () => {
    const repositoryRoot = await trackedRepository();
    const mapApplication = new MapApplication();
    const projectMap = vi.spyOn(mapApplication, "viewerProject");
    const server = await startServer(new LocalWebApplication(mapApplication, [repositoryRoot]));

    const response = await fetch(server.url);
    const html = await response.text();
    const model = viewerModel(html);
    const project = model.projects[0];

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("connect-src 'self'");
    expect(model).toMatchObject({
      schemaVersion: 1,
      mode: "web",
      projects: [{ id: expect.stringMatching(/^[a-f0-9]+$/u) }],
      projectPayloads: [],
    });
    expect(project).toBeDefined();
    expect(html).not.toContain("Commerce");
    expect(html).not.toContain('<svg class="map-svg"');
    expect(html).not.toContain(repositoryRoot);
    expect(projectMap).not.toHaveBeenCalled();

    const mapResponse = await fetch(`${server.url}/api/projects/${project?.id}`);
    const mapEnvelope = await mapResponse.json();
    expect(mapResponse.status).toBe(200);
    expect(mapResponse.headers.get("cache-control")).toBe("no-store");
    expect(mapEnvelope).toMatchObject({
      schemaVersion: 1,
      ok: true,
      data: {
        project: { id: project?.id, views: expect.any(Array), flows: expect.any(Array) },
        markup: expect.stringContaining('data-map-view="commerce"'),
      },
    });
    expect(JSON.stringify(mapEnvelope)).not.toContain(repositoryRoot);
    expect(projectMap).toHaveBeenCalledTimes(1);
    expect(projectMap).toHaveBeenCalledWith(repositoryRoot, {
      id: project?.id,
      name: project?.name,
    });

    const head = await fetch(`${server.url}/api/projects/${project?.id}`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await fetch(`${server.url}/unknown`)).status).toBe(404);
    expect((await fetch(`${server.url}/api/projects/${encodeURIComponent(repositoryRoot)}`)).status)
      .toBe(404);
  });

  it("starts with an empty catalog and guides the user to register a project", async () => {
    const mapApplication = new MapApplication();
    const projectMap = vi.spyOn(mapApplication, "viewerProject");
    const server = await startServer(new LocalWebApplication(mapApplication, []));

    const response = await fetch(server.url);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(server.repositoryCount).toBe(0);
    expect(html).toContain("semantic-atlas project add");
    expect(viewerModel(html).projects).toEqual([]);
    expect(projectMap).not.toHaveBeenCalled();
  });

  it("keeps an unavailable project selectable without affecting another project", async () => {
    const missingRoot = await createEmptyRepository();
    await removeRepository(missingRoot);
    const invalidRoot = await createMapRepository({ "invalid.yaml": "map: [" });
    repositories.push(invalidRoot);
    const availableRoot = await trackedRepository();
    const server = await startServer(new LocalWebApplication(
      new MapApplication(),
      [missingRoot, invalidRoot, availableRoot],
    ));
    const index = await (await fetch(server.url)).text();
    const projects = viewerModel(index).projects;
    const missing = projects[0];
    const invalid = projects[1];
    const available = projects[2];

    const missingResponse = await fetch(`${server.url}/api/projects/${missing?.id}`);
    const missingEnvelope = await missingResponse.json();
    expect(missingResponse.status).toBe(422);
    expect(missingEnvelope).toEqual({
      schemaVersion: 1,
      ok: false,
      error: {
        code: "PROJECT_UNAVAILABLE",
        message: "The registered project path is unavailable.",
      },
    });
    expect(JSON.stringify(missingEnvelope)).not.toContain(missingRoot);

    const invalidResponse = await fetch(`${server.url}/api/projects/${invalid?.id}`);
    const invalidEnvelope = await invalidResponse.json();
    expect(invalidResponse.status).toBe(422);
    expect(invalidEnvelope).toMatchObject({
      ok: false,
      error: {
        code: "PROJECT_UNAVAILABLE",
        message: "This project's business map is invalid.",
      },
    });
    expect(JSON.stringify(invalidEnvelope)).not.toContain(invalidRoot);

    const availableResponse = await fetch(`${server.url}/api/projects/${available?.id}`);
    expect(availableResponse.status).toBe(200);
    expect(await availableResponse.text()).toContain("Commerce");
  });

  it("keeps the complete loopback surface read-only", async () => {
    const repositoryRoot = await trackedRepository();
    const server = await startServer(new LocalWebApplication(
      new MapApplication(),
      [repositoryRoot],
    ));

    for (const target of [server.url, `${server.url}/api/projects/not-a-project`]) {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const response = await fetch(target, { method });
        expect(response.status).toBe(405);
        expect(response.headers.get("allow")).toBe("GET, HEAD");
      }
    }
  });
});

async function startServer(application: LocalWebApplication): Promise<LocalWebServer> {
  const server = await startLocalWebServer({ application, port: 0 });
  servers.push(server);
  expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
  return server;
}

function viewerModel(html: string): {
  readonly schemaVersion: number;
  readonly mode: string;
  readonly projects: readonly { readonly id: string; readonly name: string }[];
  readonly projectPayloads: readonly unknown[];
} {
  const match = /<script id="viewer-model" type="application\/json">([^<]+)<\/script>/u.exec(html);
  expect(match?.[1]).toBeDefined();
  return JSON.parse(match?.[1] ?? "{}");
}

async function trackedRepository(): Promise<string> {
  const document: TestMapDocument = {
    schemaVersion: 1,
    map: { id: "commerce", title: "Commerce", summary: "Commerce map." },
    nodes: [
      node("commerce", "domain", "Commerce"),
      node("commerce.orders", "capability", "Orders"),
      node("commerce.orders.checkout", "scenario", "Checkout"),
    ],
    relations: [
      relation("commerce.orders", "part_of", "commerce"),
      relation("commerce.orders.checkout", "part_of", "commerce.orders"),
    ],
    flows: [flow(
      "commerce.orders.checkout-flow",
      "commerce.orders.checkout",
      "receive-checkout",
      [flowStep("receive-checkout", "outcome", "Checkout received")],
      [],
    )],
  };
  const repositoryRoot = await createMapRepository({ "commerce.yaml": document });
  repositories.push(repositoryRoot);
  return repositoryRoot;
}
