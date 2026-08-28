import { afterEach, describe, expect, it } from "vitest";
import { MapApplication } from "../../src/application/map-application.js";
import { LocalWebApplication } from "../../src/web/local-web-application.js";
import { startLocalWebServer, type LocalWebServer } from "../../src/web/local-web-server.js";
import {
  createMapRepository,
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
  it("serves the shared interactive Viewer for explicitly configured repositories", async () => {
    const repositoryRoot = await trackedRepository();
    const application = new LocalWebApplication(new MapApplication(), [repositoryRoot]);
    const server = await startLocalWebServer({ application, port: 0 });
    servers.push(server);

    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
    const response = await fetch(server.url);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(html).toContain('data-viewer-mode="web"');
    expect(html).toContain("Commerce");
    expect(html).not.toContain(repositoryRoot);

    const head = await fetch(server.url, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");

    const mutation = await fetch(server.url, { method: "POST" });
    expect(mutation.status).toBe(405);
    expect(mutation.headers.get("allow")).toBe("GET, HEAD");

    expect((await fetch(`${server.url}/unknown`)).status).toBe(404);
  });
});

async function trackedRepository(): Promise<string> {
  const document: TestMapDocument = {
    schemaVersion: 1,
    map: { id: "commerce", title: "Commerce", summary: "Commerce map." },
    nodes: [
      node("commerce", "domain", "Commerce"),
      node("commerce.orders", "capability", "Orders"),
    ],
    relations: [relation("commerce.orders", "part_of", "commerce")],
  };
  const repositoryRoot = await createMapRepository({ "commerce.yaml": document });
  repositories.push(repositoryRoot);
  return repositoryRoot;
}
